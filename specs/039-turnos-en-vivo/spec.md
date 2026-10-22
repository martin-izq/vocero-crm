# 039 — Turnos en vivo

**Estado**: hitos 0–5 hechos (local, con mocks). Hito 6 (número real de Meta y
plantilla de recordatorio) pendiente.

Porta el motor de [turnos-en-vivo](https://github.com/martin-izq/turnos-en-vivo)
(POC sobre Supabase) a Vocero, como módulo opcional tras la bandera `TURNOS`.
Lo que cambia respecto del POC: todo pasa por WhatsApp. El paciente saca
turno, pregunta cuánto falta y cancela hablando con el agente (Nea), y el CRM
le avisa solo «ya casi», «es tu turno» y la demora.

Una instalación = un negocio (como todo Vocero). El `/admin` multi-negocio y el
número compartido del PLAN-MVP del POC quedan afuera.

## Historias

1. **Recepción opera el día** (`/turnos`): ve cada agenda con su demora y su
   botón principal (llamar → comenzar → terminar y llamar al siguiente), suma
   gente sin turno, marca «no se presentó», cancela y cierra el día. Si otro
   accionó primero ve «Lo llamó recepción a las 14:45», no un error. Cualquier
   miembro opera; solo quien configura crea y edita agendas.
2. **El paciente saca turno por WhatsApp**: Nea consulta la fila
   (`queue_status`), lo suma (`join_queue`) y le pasa código, cuántas personas
   hay antes, hora estimada y el link en vivo. Un turno activo por agenda por
   día por persona.
3. **«¿Cuánto me falta?»**: Nea contesta con los números del CRM (nunca los
   calcula el modelo).
4. **Avisos automáticos** (sin LLM, `src/lib/turnos/avisos.ts`):
   - «ya casi» cuando quedan `notifyBefore` personas o menos, con botones
     «Sí, voy» / «No voy a poder»;
   - «es tu turno» con el consultorio (de nuevo si lo vuelven a llamar);
   - demora de una cita, un aviso por cada tramo de 15 min.
   Cada aviso sale una sola vez (`turn_notice` único por turno+tipo). Si falla
   (ventana cerrada), el turno queda «Sin aviso» y se reintenta en el próximo
   cambio.
5. **Botones**: «Sí, voy» confirma y «No voy a poder» cancela. Los resuelve el
   CRM en la ingesta, sin cerebro (funciona con el agente apagado).
6. **Link en vivo** (`/t/<token>`) y **sala** (`/sala`, para una TV): se
   actualizan solos por un SSE público que solo dice «cambió algo», y cada página
   vuelve a pedir su propio estado. Si el canal se cae, consultan cada 20 s. La
   sala muestra solo códigos.
7. **Reservas con horario por agenda**: cada agenda de Turnos atiende «solo
   por orden de llegada» (`queue`), «orden de llegada y reservas» (`gaps`) o
   «solo con reserva» (`none`), con sus propios horarios y minutos por turno.
   Nea consulta `GET /api/bot/turnos/huecos` (`queue_slots`) y reserva con
   `startUtc` (`join_queue`), hoy o hasta 14 días adelante. Solo se puede
   reservar un hueco que salió de ahí; dos reservas del mismo horario no ganan
   las dos (índice único en la base).
   - Esto reemplaza, para turnos, a la agenda de Citas de Vocero: esa es una
     sola por negocio.
   - Conviene apagar «Agendar citas» en Agente si se usan reservas de Turnos.
8. **Mensajes**: sin el nombre del negocio delante y sin link.
   - Si el turno lo saca el cerebro en la charla, la confirmación es solo suya
     (`bienvenida: false`) y no vuelve a saludar.
   - Si el turno nace fuera de la charla (una cita), el CRM manda la
     bienvenida, sin «¡Hola!» si hubo mensajes en las últimas 2 horas.
9. **Citas del día**: con `AGENDA=on`, las citas de hoy entran como turnos con
   horario a la agenda marcada «recibe las citas». Atendido marca la cita
   `realizada`; ausente, `no_show`; una cita cancelada saca su turno de la fila.
10. **Agenda**: la pestaña «Agenda» de Turnos es una rejilla de horas, como
    Google Calendar (`GET /api/turnos/reservas?desde=`, una semana).
    - Semana: una columna por día. Día: una columna por agenda, con su
      horario sombreado y sus huecos libres.
    - Cada turno ocupa lo que dura, con el color de su agenda. El de la fila
      sin horario se dibuja punteado a su hora estimada.
    - Una línea marca la hora actual y cada turno de hoy dice cuánto falta.
    - Al tocar un turno se abre su detalle: llamar (hoy) o cancelar.
    - La sala de espera va siempre en tema oscuro, con reloj, el número
      llamado en grande y un destello cuando cambia.
11. **Operario** (rol `operator`, el médico): el propietario lo crea o lo
    cambia en Ajustes → Equipo y elige sus agendas (`agenda_operator`).
    - Ve solo Turnos, y dentro solo sus agendas: «Hoy» y «Agenda».
    - Llama al siguiente, comienza, termina, marca ausente, suma gente y
      cierra el día en sus agendas.
    - No ve la Bandeja, los contactos ni Ajustes.
    - Por el SSE solo le llega `turno.changed`.

## Decisiones

- La lógica pura del POC (`estimate`, `transitions`, `slots`, `reception`) se
  copió con sus tests a `src/lib/turnos/`. La estimación y los estados son los
  mismos.
- El token del link se deriva con `HMAC(ENCRYPTION_KEY, turnId)` y se guarda
  solo su SHA-256. Así el link se puede volver a mandar (Nea lo devuelve en
  `queue_status`) sin guardarlo en claro.
- Los avisos salen marcados como del asistente (`aiGenerated`): un aviso
  automático no salda lo que el paciente escribió (025).
- Las citas se traen al leer (tablero, bot, avisador), no con un reloj
  (`ponytail` en `traerCitasDeHoy`).
- Vocabulario, decidido el 2026-10-22: para el paciente siempre es «turno»,
  con horario o por orden de llegada. «Cita» queda solo para las que vienen
  de la agenda de Citas de Vocero (`AGENDA`). Una instalación que usa Turnos
  apaga `AGENDA`: las dos agendas a la vez confunden.
- El encierro del operario vive en `requireSession`: `src/middleware.ts` pone
  la ruta pedida en `x-vocero-path`, y fuera de `operarioPuede` la API
  responde 403 y las páginas mandan a `/turnos`. Sin la cabecera se niega.
  Un solo chequeo cubre también la navegación del cliente, donde los layouts
  no se vuelven a dibujar.
- Hito 0, prerequisito de dar cuentas a recepción:
  - `withConfigAuth` en todas las rutas de configuración, con un guardarraíl
    (`tests/unit/config-rbac-guard.test.ts`);
  - la llave de IA guardada solo viaja a su misma raíz de API.

## Contrato

- `GET`/`POST /api/bot/turnos` y `POST /api/bot/turnos/{id}` (`docs/openapi.json`).
- Herramienta `turnos` en el perfil: solo con la bandera encendida.
- Nea (`martin-izq/nea-agent`, rama `turnos`) enseña las herramientas solo si
  el perfil trae la clave explícita.
- `turno.changed` en el bus de eventos; `features.turnos` en `/api/health`.

## Fuera de alcance (por ahora)

- QR de llegada y estado «en el lugar».
- Recordatorio del día anterior con plantilla (hito 6).
- Anti-bots.
- Varios negocios por instalación.
