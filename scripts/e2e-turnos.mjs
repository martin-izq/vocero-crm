// 039 — Arnés del guion tests/e2e/us-turnos.md: turnos en vivo de punta a
// punta contra la app viva con mocks (WA_MOCK_ENABLED, TURNOS=on, AGENDA=on).
//
//   node --env-file=.env scripts/e2e-turnos.mjs
//
// Pide E2E_EMAIL / E2E_PASSWORD de alguien que configura (owner o admin) y
// BOT_API_KEY (del .env). Hace de cerebro con /api/bot/turnos: no depende de
// un LLM. PW_CHROME opcional: ejecutable de Chromium para Playwright.
//
// Deja el agente APAGADO durante la corrida (si no, el cerebro conectado
// también contestaría los mensajes del mock) y lo vuelve a dejar como estaba.
import { createRequire } from "node:module";

const BASE = process.env.APP_BASE_URL?.replace(/\/+$/, "") ?? "http://localhost:3000";
const KEY = process.env.BOT_API_KEY;
const PN = process.env.E2E_PHONE_NUMBER_ID ?? "pn-test";
const require = createRequire(import.meta.url);

let fallas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${msg}`);
  if (!cond) fallas++;
  return cond;
};
const paso = (s) => console.log(`\n== ${s}`);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function hasta(fn, { intentos = 40, cada = 500 } = {}) {
  for (let i = 0; i < intentos; i++) {
    const v = await fn();
    if (v) return v;
    await esperar(cada);
  }
  return null;
}

// --- sesión -------------------------------------------------------------
const login = await fetch(`${BASE}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: BASE },
  body: JSON.stringify({ email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD }),
});
if (!login.ok) throw new Error(`login ${login.status}`);
const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const api = async (method, path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { cookie, origin: BASE, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const bot = async (method, path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "x-api-key": KEY, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

// --- WhatsApp simulado --------------------------------------------------
const corrida = String(Date.now()).slice(-5);
const tel = (n) => `54911${corrida}${String(n).padStart(3, "0")}`;
const salientes = async (from) =>
  ((await (await fetch(`${BASE}/api/dev/wa-mock/outbox`)).json()).outbox ?? []).filter((m) =>
    String(m.to).endsWith(from.slice(-8))
  );
const textoDe = (m) => m.body?.text?.body ?? m.body?.interactive?.body?.text ?? "";
async function escribe(from, name, text, extra = {}) {
  const r = await fetch(`${BASE}/api/dev/wa-mock/inbound`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phoneNumberId: PN, from, name, text, ...extra }),
  });
  if (!r.ok) throw new Error(`inbound ${r.status}`);
}
async function conversacionDe(from) {
  const r = await hasta(async () => {
    const c = await bot("GET", `/api/bot/context?waIdentity=${from}`);
    // La ingesta corre después del 200 del webhook: hasta que marca el
    // entrante, la ventana figura cerrada. El cerebro real llega después.
    return c.status === 200 && c.body?.conversation?.windowOpen ? c.body : null;
  });
  return r?.conversation?.id ?? r?.conversationId ?? null;
}

// --- preparación --------------------------------------------------------
paso("preparar: agente apagado, agenda E2E limpia");
const perfil = await api("GET", "/api/agent/profile");
const agenteEstaba = perfil.body?.profile?.enabled === true;
if (agenteEstaba) await api("PUT", "/api/agent/profile", { enabled: false });

const AGENDA = {
  name: "E2E Turnos",
  room: "Box 9",
  walkInMode: "queue",
  slotMinutes: 40,
  opensAt: "00:00",
  closesAt: "23:59",
  numberPrefix: "Z",
  notifyBefore: 1,
  receivesBookings: false,
  active: true,
};
// Las citas entran a una agenda aparte, sin historial: así su estimación usa
// los minutos por persona y la demora es predecible.
const CITAS = { ...AGENDA, name: "E2E Citas", room: "Box 8", numberPrefix: "Y", receivesBookings: true };
const lista = await api("GET", "/api/turnos/agendas");
ok(lista.status === 200, `GET /api/turnos/agendas → ${lista.status}`);
let agenda = lista.body.agendas.find((a) => a.numberPrefix === "Z");
const guardada = agenda
  ? await api("PATCH", `/api/turnos/agendas/${agenda.id}`, AGENDA)
  : await api("POST", "/api/turnos/agendas", AGENDA);
agenda = guardada.body.agenda;
ok(Boolean(agenda?.id), `agenda Z lista (${guardada.status})`);
await api("POST", `/api/turnos/agendas/${agenda.id}/close`);
let agendaCitas = lista.body.agendas.find((a) => a.numberPrefix === "Y");
agendaCitas = (
  agendaCitas
    ? await api("PATCH", `/api/turnos/agendas/${agendaCitas.id}`, CITAS)
    : await api("POST", "/api/turnos/agendas", CITAS)
).body.agenda;
await api("POST", `/api/turnos/agendas/${agendaCitas.id}/close`);

const tablero = async (id = agenda.id) => (await api("GET", "/api/turnos/board")).body.agendas.find((a) => a.id === id);
const accion = (id, expected, to) => api("POST", `/api/turnos/turns/${id}`, { expected, to });

const { chromium } = require("playwright");
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });

try {
  // ---------------------------------------------------------------------
  paso("recepción suma dos personas sin WhatsApp");
  const r1 = await api("POST", "/api/turnos/turns", { agendaId: agenda.id, displayName: "Recep Uno" });
  const r2 = await api("POST", "/api/turnos/turns", { agendaId: agenda.id, displayName: "Recep Dos" });
  ok(r1.status === 201 && r2.status === 201, `altas 201 (${r1.body?.code}, ${r2.body?.code})`);
  ok(/\/t\/tn_[^.]+\.[\w-]+$/.test(r1.body?.link ?? ""), "devuelve el link del turno");

  // ---------------------------------------------------------------------
  paso("paciente por WhatsApp saca turno (el cerebro, por /api/bot/turnos)");
  const P = tel(1);
  await escribe(P, "Paula Paciente", "hola, quiero atenderme hoy");
  const convP = await conversacionDe(P);
  ok(Boolean(convP), "la conversación existe");
  const estado0 = await bot("GET", `/api/bot/turnos?conversationId=${convP}`);
  ok(estado0.status === 200 && estado0.body.agendas.some((a) => a.id === agenda.id), "GET /api/bot/turnos lista la agenda");
  const altaP = await bot("POST", "/api/bot/turnos", { conversationId: convP, agendaId: agenda.id });
  ok(altaP.status === 201, `POST /api/bot/turnos → ${altaP.status}`);
  const turnoP = altaP.body?.turno;
  ok(turnoP?.peopleBefore === 2, `tiene 2 personas antes (${turnoP?.peopleBefore})`);
  const otra = await bot("POST", "/api/bot/turnos", { conversationId: convP, agendaId: agenda.id });
  ok(otra.status === 409 && otra.body?.error?.code === "ya_tiene_turno", "un segundo turno el mismo día → 409 ya_tiene_turno");
  const sinFila = await bot("POST", "/api/bot/turnos", { conversationId: convP, agendaId: "qa_noexiste" });
  ok(sinFila.status === 404 && sinFila.body?.error?.code === "agenda_inexistente", "agenda inexistente → 404 tipado");

  // ---------------------------------------------------------------------
  paso("el link del paciente se actualiza solo (SSE)");
  const link = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await link.goto(turnoP.link);
  ok((await link.getByTestId("antes").textContent()) === "2", "el link muestra 2 antes");

  const sala = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await sala.goto(`${BASE}/sala`);

  // Recepción opera desde la pantalla: «Llamar al siguiente».
  const recep = await browser.newContext();
  await recep.addCookies(
    cookie.split("; ").map((c) => {
      const i = c.indexOf("=");
      return { name: c.slice(0, i), value: c.slice(i + 1), url: BASE };
    })
  );
  const panel = await recep.newPage({ viewport: { width: 1366, height: 860 } });
  await panel.goto(`${BASE}/turnos`);
  const card = panel.locator(`[data-agenda="${AGENDA.name}"]`);
  await card.getByRole("button", { name: "Llamar al siguiente" }).click();
  ok(
    Boolean(
      await hasta(async () =>
        (await sala.locator(`[data-agenda="${AGENDA.name}"]`).getByTestId("llamado").textContent())?.includes(r1.body.code)
      )
    ),
    `la sala muestra el llamado ${r1.body.code}`
  );
  await card.getByRole("button", { name: "Comenzar turno" }).click();
  await card.getByRole("button", { name: "Terminar y llamar al siguiente" }).click();
  ok(
    Boolean(await hasta(async () => (await link.getByTestId("antes").textContent()) === "1")),
    "sin recargar, el link pasa a 1 antes"
  );

  // ---------------------------------------------------------------------
  paso("aviso «ya casi» con «¿Estás viniendo?» y respuesta «Sí, voy»");
  const pronto = await hasta(async () => (await salientes(P)).find((m) => m.body?.type === "interactive"));
  ok(Boolean(pronto), "llega el aviso con botones");
  ok(textoDe(pronto ?? {}).includes("¿Estás viniendo?"), `texto: «${textoDe(pronto ?? {})}»`);
  const botonSi = pronto?.body?.interactive?.action?.buttons?.[0]?.reply?.id;
  ok(botonSi === `turno:si:${turnoP.id}`, "el botón «Sí, voy» lleva el id del turno");
  const antesSi = (await salientes(P)).length;
  await escribe(P, "Paula Paciente", "Sí, voy", {
    type: "interactive",
    interactive: { type: "button_reply", button_reply: { id: botonSi, title: "Sí, voy" } },
  });
  const gracias = await hasta(async () => (await salientes(P)).slice(antesSi).find((m) => textoDe(m).includes("Te esperamos")));
  ok(Boolean(gracias), "el CRM contesta «Te esperamos» sin cerebro");
  ok(
    Boolean(await hasta(async () => (await tablero()).turns.find((t) => t.id === turnoP.id)?.confirmedAt)),
    "recepción ve «Confirmó»"
  );

  // ---------------------------------------------------------------------
  paso("dos personas accionan a la vez: gana la primera");
  const fila = (await tablero()).turns;
  const enCurso = fila.find((t) => t.status === "called");
  const a = await accion(enCurso.id, "called", "in_service");
  const b = await accion(enCurso.id, "called", "in_service");
  ok(a.status === 200 && b.status === 409, `200 y luego 409 (${a.status}, ${b.status})`);
  ok(/recepción a las \d\d:\d\d/.test(b.body?.error?.message ?? ""), `mensaje: «${b.body?.error?.message}»`);

  // ---------------------------------------------------------------------
  paso("«es tu turno» por WhatsApp y en el link");
  await accion(enCurso.id, "in_service", "finished");
  await accion(turnoP.id, "waiting", "called");
  const llamado = await hasta(async () => (await salientes(P)).find((m) => textoDe(m).includes("es tu turno")));
  ok(Boolean(llamado), `llega «${textoDe(llamado ?? {})}»`);
  ok(textoDe(llamado ?? {}).includes("Box 9"), "nombra el consultorio");
  ok(Boolean(await hasta(async () => (await link.getByText("Es tu turno").count()) > 0)), "el link pasa a «Es tu turno»");
  const prontos = (await salientes(P)).filter((m) => m.body?.type === "interactive").length;
  ok(prontos === 1, `el «ya casi» salió una sola vez (${prontos})`);

  // ---------------------------------------------------------------------
  paso("otro paciente responde «No voy a poder»");
  const Q = tel(2);
  await escribe(Q, "Quique Paciente", "turno para hoy");
  const convQ = await conversacionDe(Q);
  const altaQ = await bot("POST", "/api/bot/turnos", { conversationId: convQ, agendaId: agenda.id });
  ok(altaQ.status === 201, `Q saca turno ${altaQ.body?.turno?.code}`);
  const prontoQ = await hasta(async () => (await salientes(Q)).find((m) => m.body?.type === "interactive"));
  ok(Boolean(prontoQ), "a Q le llega «ya casi»");
  const botonNo = prontoQ?.body?.interactive?.action?.buttons?.[1]?.reply?.id;
  await escribe(Q, "Quique Paciente", "No voy a poder", {
    type: "interactive",
    interactive: { type: "button_reply", button_reply: { id: botonNo, title: "No voy a poder" } },
  });
  ok(
    Boolean(await hasta(async () => (await salientes(Q)).find((m) => textoDe(m).includes("cancelamos")))),
    "el CRM confirma la cancelación"
  );
  ok(
    Boolean(await hasta(async () => (await tablero()).turns.find((t) => t.id === altaQ.body.turno.id)?.status === "cancelled")),
    "el turno de Q queda cancelado"
  );

  // ---------------------------------------------------------------------
  paso("cancelar por el cerebro: solo mientras espera");
  const noCancel = await bot("POST", `/api/bot/turnos/${turnoP.id}`, { conversationId: convP, action: "cancel" });
  ok(noCancel.status === 409 && noCancel.body?.error?.code === "no_cancelable", "ya llamado → 409 no_cancelable");
  const ajeno = await bot("POST", `/api/bot/turnos/${turnoP.id}`, { conversationId: convQ, action: "cancel" });
  ok(ajeno.status === 404, "el turno de otro contacto → 404");

  // ---------------------------------------------------------------------
  paso("una cita de hoy entra a la fila y avisa la demora");
  const hoy = (await tablero()) && (await api("GET", "/api/turnos/board")).body.day;
  const libres = (await api("GET", `/api/calendar/availability?from=${hoy}&to=${hoy}`)).body?.slots ?? [];
  // Con margen sobre el aviso mínimo de la agenda: entre consultar y reservar
  // pasan segundos, y el primer hueco puede quedar adentro del aviso.
  const hueco = libres.find((s) => Date.parse(s.startUtc) - Date.now() > 70 * 60_000);
  if (!hueco) {
    console.log("  · no quedan huecos hoy en la agenda de Citas: se salta este paso");
  } else {
    // Gente sin cita delante, para que la cita se atrase más de 15 minutos.
    const minutos = (Date.parse(hueco.startUtc) - Date.now()) / 60_000;
    for (let i = 0; i < Math.ceil(minutos / AGENDA.slotMinutes) + 1; i++) {
      await api("POST", "/api/turnos/turns", { agendaId: agendaCitas.id, displayName: `Relleno ${i + 1}` });
    }
    const C = tel(3);
    await escribe(C, "Carla Cita", "hola, tengo cita hoy");
    const convC = await conversacionDe(C);
    const ctxC = await bot("GET", `/api/bot/context?conversationId=${convC}`);
    const cita = await api("POST", "/api/bookings", {
      kind: "session",
      contactId: ctxC.body?.contact?.id,
      conversationId: convC,
      startUtc: hueco.startUtc,
    });
    ok(cita.status === 201 || cita.status === 200, `cita creada a las ${hueco.time} (${cita.status})`);
    const turnoCita = await hasta(async () =>
      (await tablero(agendaCitas.id)).turns.find((t) => t.source === "booking" && t.displayName === "Carla Cita")
    );
    ok(Boolean(turnoCita?.scheduledAt), `la cita está en la fila como ${turnoCita?.code}`);
    ok(
      Boolean(await hasta(async () => (await salientes(C)).find((m) => textoDe(m).includes("hay demora")))),
      "a la cita le llega el aviso de demora"
    );
  }
} catch (err) {
  console.error("FALLÓ:", err);
  fallas++;
} finally {
  await browser.close();
  await api("POST", `/api/turnos/agendas/${agenda.id}/close`);
  await api("POST", `/api/turnos/agendas/${agendaCitas.id}/close`);
  await api("PATCH", `/api/turnos/agendas/${agendaCitas.id}`, { ...CITAS, receivesBookings: false, active: false });
  if (agenteEstaba) await api("PUT", "/api/agent/profile", { enabled: true });
}

console.log(fallas ? `\n✗ ${fallas} comprobación(es) fallaron` : "\n✓ turnos en vivo: todo verde");
process.exit(fallas ? 1 : 0);
