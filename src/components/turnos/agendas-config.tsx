"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { colorDeAgenda } from "./color";

/**
 * 039 — Módulo «Agendas» (solo quien configura): la lista de agendas, cada
 * una un médico o un servicio, agrupada por especialidad, y su ficha para
 * editarla, asignarle quién la atiende o eliminarla. Turnos queda para operar.
 */

type AgendaForm = {
  id?: string;
  name: string;
  specialty: string;
  room: string;
  walkInMode: "queue" | "gaps" | "none";
  slotMinutes: number;
  opensAt: string;
  closesAt: string;
  numberPrefix: string;
  notifyBefore: number;
  receivesBookings: boolean;
  active: boolean;
  operatorIds?: string[];
};

type Operario = { userId: string; name: string; email: string };

const VACIA: AgendaForm = {
  name: "",
  specialty: "",
  room: "",
  walkInMode: "queue",
  slotMinutes: 15,
  opensAt: "09:00",
  closesAt: "18:00",
  numberPrefix: "",
  notifyBefore: 2,
  receivesBookings: false,
  active: true,
  operatorIds: [],
};

const MODOS = {
  queue: "Solo por orden de llegada",
  gaps: "Orden de llegada y reservas con horario",
  none: "Solo con reserva (horario)",
} as const;

const MODO_CORTO = { queue: "Por orden de llegada", gaps: "Llegada y reservas", none: "Solo reservas" } as const;

async function mensajeDeError(res: Response | null, otro: string) {
  const b = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return b?.error?.message ?? otro;
}

export function AgendasAdmin({ citas = false }: { citas?: boolean }) {
  const [agendas, setAgendas] = useState<AgendaForm[] | null>(null);
  const [operarios, setOperarios] = useState<Operario[]>([]);
  const [form, setForm] = useState<AgendaForm | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/turnos/agendas", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const b = (await res.json()) as { agendas: AgendaForm[]; operarios?: Operario[] };
    setAgendas(b.agendas);
    setOperarios(b.operarios ?? []);
  }, []);
  useEffect(() => void cargar(), [cargar]);

  function abrir(a: AgendaForm | null) {
    setError(null);
    setForm(a ? { ...a } : { ...VACIA });
  }

  async function guardar() {
    if (!form) return;
    setError(null);
    const { id, operatorIds, ...body } = form;
    const res = await fetch(id ? `/api/turnos/agendas/${id}` : "/api/turnos/agendas", {
      method: id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res?.ok) return setError(await mensajeDeError(res, "No se pudo guardar."));
    const { agenda } = (await res.json()) as { agenda: AgendaForm };
    if (operarios.length > 0) {
      const r = await fetch(`/api/turnos/agendas/${agenda.id}/operators`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userIds: operatorIds ?? [] }),
      }).catch(() => null);
      if (!r?.ok) return setError(await mensajeDeError(r, "Se guardó la agenda, pero no quién la atiende."));
    }
    setForm(null);
    void cargar();
  }

  async function prender(a: AgendaForm, active: boolean) {
    setError(null);
    const { id, operatorIds: _o, ...body } = a;
    const res = await fetch(`/api/turnos/agendas/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, active }),
    }).catch(() => null);
    if (!res?.ok) setError(await mensajeDeError(res, "No se pudo cambiar."));
    void cargar();
  }

  async function borrar() {
    if (!form?.id || !confirm(`¿Eliminar la agenda ${form.name}? Se borra también su historial de turnos.`)) return;
    setError(null);
    const res = await fetch(`/api/turnos/agendas/${form.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return setError(await mensajeDeError(res, "No se pudo eliminar."));
    setForm(null);
    void cargar();
  }

  if (!agendas) return <p className="p-6 text-sm text-muted-foreground">Cargando las agendas…</p>;

  // El color de cada agenda es el de Turnos: su lugar entre las activas.
  const activas = agendas.filter((a) => a.active);
  const color = (a: AgendaForm) => (a.active ? colorDeAgenda(activas.indexOf(a)) : "var(--border-strong)");
  const grupos = [...new Set(activas.map((a) => a.specialty))]
    .sort((x, y) => (x === "" ? 1 : y === "" ? -1 : x.localeCompare(y)))
    .map((s) => ({ titulo: s || "Sin especialidad", agendas: activas.filter((a) => a.specialty === s) }));
  const apagadas = agendas.filter((a) => !a.active);
  if (apagadas.length) grupos.push({ titulo: "Apagadas", agendas: apagadas });
  const nombreDe = (id: string) => operarios.find((o) => o.userId === id)?.name ?? "";

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">Agendas</h2>
          <p className="text-xs text-text-3">Cada agenda es un médico o un servicio, con su horario y su forma de atender.</p>
        </div>
        <Button size="sm" onClick={() => abrir(null)}>
          <Plus className="mr-1.5 h-4 w-4" strokeWidth={1.8} />
          Nueva agenda
        </Button>
      </header>

      <div className="grid flex-1 grid-cols-1 items-start gap-6 overflow-y-auto p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
        <div className={cn("space-y-6", form && "hidden lg:block")}>
          {agendas.length === 0 && (
            <Card className="p-8 text-center text-sm text-text-3">
              Todavía no hay agendas. Creá la primera con «Nueva agenda».
            </Card>
          )}
          {grupos.map((g) => (
            <section key={g.titulo} className="space-y-2">
              <h3 className="kicker">
                {g.titulo} · {g.agendas.length}
              </h3>
              <Card className="divide-y overflow-hidden">
                {g.agendas.map((a) => (
                  <div
                    key={a.id}
                    data-agenda-fila={a.name}
                    className={cn("flex items-center gap-3 px-4 py-3", form?.id === a.id && "bg-subtle")}
                  >
                    <button type="button" onClick={() => abrir(a)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: color(a) }} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-semibold">{a.name}</span>
                          <span className="font-mono text-xs text-text-3">{a.numberPrefix}</span>
                        </span>
                        <span className="block truncate text-xs text-text-3">
                          {[a.room || "Sin consultorio", `${a.opensAt}–${a.closesAt}`, MODO_CORTO[a.walkInMode]].join(" · ")}
                        </span>
                        {(a.operatorIds?.length ?? 0) > 0 && (
                          <span className="block truncate text-xs text-text-2">
                            Atiende: {a.operatorIds!.map(nombreDe).filter(Boolean).join(", ")}
                          </span>
                        )}
                      </span>
                    </button>
                    <Switch
                      size="sm"
                      checked={a.active}
                      onCheckedChange={(v) => void prender(a, v)}
                      label={`${a.active ? "Apagar" : "Prender"} ${a.name}`}
                    />
                  </div>
                ))}
              </Card>
            </section>
          ))}
          {error && !form && <p className="text-sm text-danger-text">{error}</p>}
        </div>

        {form && (
          <Ficha
            form={form}
            setForm={setForm}
            agendas={agendas}
            operarios={operarios}
            citas={citas}
            error={error}
            onGuardar={() => void guardar()}
            onBorrar={() => void borrar()}
            onCerrar={() => setForm(null)}
          />
        )}
      </div>
    </div>
  );
}

function Ficha({
  form,
  setForm,
  agendas,
  operarios,
  citas,
  error,
  onGuardar,
  onBorrar,
  onCerrar,
}: {
  form: AgendaForm;
  setForm: (f: AgendaForm) => void;
  agendas: AgendaForm[];
  operarios: Operario[];
  citas: boolean;
  error: string | null;
  onGuardar: () => void;
  onBorrar: () => void;
  onCerrar: () => void;
}) {
  const set = <K extends keyof AgendaForm>(k: K, v: AgendaForm[K]) => setForm({ ...form, [k]: v });
  const asignados = new Set(form.operatorIds ?? []);

  return (
    <Card className="space-y-4 p-4 lg:sticky lg:top-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold">{form.id ? form.name || "Agenda" : "Nueva agenda"}</h3>
        {form.id && !form.active && <Badge variant="outline">Apagada</Badge>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="ag-nombre" label="Nombre">
          <Input id="ag-nombre" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Dra. Laura Méndez" />
        </Campo>
        <Campo id="ag-especialidad" label="Especialidad">
          <Input
            id="ag-especialidad"
            list="ag-especialidades"
            value={form.specialty}
            onChange={(e) => set("specialty", e.target.value)}
            placeholder="Pediatría"
          />
          <datalist id="ag-especialidades">
            {[...new Set(agendas.map((a) => a.specialty).filter(Boolean))].map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </Campo>
        <Campo id="ag-sala" label="Consultorio">
          <Input id="ag-sala" value={form.room} onChange={(e) => set("room", e.target.value)} placeholder="Consultorio 2" />
        </Campo>
        <Campo id="ag-letra" label="Letra del número">
          <Input id="ag-letra" value={form.numberPrefix} maxLength={3} onChange={(e) => set("numberPrefix", e.target.value)} placeholder="A" />
        </Campo>
        <div className="sm:col-span-2">
          <Campo id="ag-modo" label="Cómo atiende">
            <select
              id="ag-modo"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={form.walkInMode}
              onChange={(e) => set("walkInMode", e.target.value as AgendaForm["walkInMode"])}
            >
              {Object.entries(MODOS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <Campo id="ag-abre" label="Abre">
          <Input id="ag-abre" type="time" value={form.opensAt} onChange={(e) => set("opensAt", e.target.value)} />
        </Campo>
        <Campo id="ag-cierra" label="Cierra">
          <Input id="ag-cierra" type="time" value={form.closesAt} onChange={(e) => set("closesAt", e.target.value)} />
        </Campo>
        <Campo id="ag-min" label="Minutos por turno">
          <Input id="ag-min" type="number" min={1} value={form.slotMinutes} onChange={(e) => set("slotMinutes", Number(e.target.value))} />
        </Campo>
        <Campo id="ag-aviso" label="Avisar «ya casi» con N antes">
          <Input id="ag-aviso" type="number" min={0} value={form.notifyBefore} onChange={(e) => set("notifyBefore", Number(e.target.value))} />
        </Campo>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Quién la atiende</legend>
        {operarios.length === 0 ? (
          <p className="text-xs text-text-3">
            Sin médicos cargados. Creá un usuario «Operario» en{" "}
            <Link href="/settings/team" className="underline">
              Ajustes → Equipo
            </Link>{" "}
            y después elegilo acá.
          </p>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {operarios.map((o) => (
              <label key={o.userId} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={asignados.has(o.userId)}
                  onChange={(e) => {
                    const n = new Set(asignados);
                    if (e.target.checked) n.add(o.userId);
                    else n.delete(o.userId);
                    set("operatorIds", [...n]);
                  }}
                />
                {o.name || o.email}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        {/* Solo con la agenda de Citas de Vocero encendida (`AGENDA`). */}
        {citas && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.receivesBookings} onChange={(e) => set("receivesBookings", e.target.checked)} />
            Recibe las citas del día
          </label>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
          Activa
        </label>
      </div>

      {error && <p className="text-sm text-danger-text">{error}</p>}

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button size="sm" onClick={onGuardar} disabled={!form.name.trim() || !form.numberPrefix.trim()}>
          {form.id ? "Guardar cambios" : "Crear agenda"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCerrar}>
          Cancelar
        </Button>
        {form.id && (
          <Button size="sm" variant="outline" className="ml-auto border-danger-text text-danger-text" onClick={onBorrar}>
            Eliminar agenda
          </Button>
        )}
      </div>
    </Card>
  );
}

function Campo({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
