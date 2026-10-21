# US — Turnos en vivo (039)

App viva con `WA_MOCK_ENABLED=true`, `TURNOS=on`, `AGENDA=on` y un número
conectado al wa-mock. Arnés: `node --env-file=.env scripts/e2e-turnos.mjs`
(`E2E_EMAIL`/`E2E_PASSWORD` de quien configura; `PW_CHROME` opcional). Hace de
cerebro con `/api/bot/turnos` y no depende de un LLM.

## Criterios

1. Recepción suma dos personas sin WhatsApp: 201 con código y link.
2. Un paciente por WhatsApp saca turno por `/api/bot/turnos`: 201 con 2 antes.
   - Un segundo turno el mismo día: 409 `ya_tiene_turno`.
   - Una agenda inexistente: 404 `agenda_inexistente`.
3. El link muestra «2 antes». Recepción, desde `/turnos`, llama, comienza y
   «Terminar y llamar al siguiente»:
   - la sala muestra el llamado;
   - sin recargar, el link pasa a «1 antes».
4. Llega «ya casi … ¿Estás viniendo?» con botones. «Sí, voy»:
   - el CRM contesta «Te esperamos» sin cerebro;
   - recepción ve «Confirmó».
5. Dos acciones iguales a la vez: 200 y luego 409 con «Lo comenzó recepción a
   las HH:MM».
6. Al llamarlo llega «¡es tu turno! … Pasá a Box 9» y el link pasa a «Es tu
   turno». El «ya casi» salió una sola vez.
7. Otro paciente toca «No voy a poder»: el CRM confirma y el turno queda
   cancelado.
8. El cerebro no puede cancelar un turno ya llamado (409 `no_cancelable`) ni
   el turno de otro contacto (404).
9. Una cita de hoy entra a la fila «recibe las citas» como turno con horario.
   Con gente delante le llega el aviso de demora.

## Camino infeliz

- Un aviso que no se pudo mandar (ventana cerrada) deja el turno «Sin aviso» y
  se reintenta en el próximo cambio. No se pierde ni se duplica.
- Cerrar el día no manda «ya casi» a nadie.
- Con la bandera apagada, toda la superficie responde 404 (página, API, bot).

## Con el cerebro de verdad (manual, depende del LLM)

Con Nea conectado y la herramienta «Turnos en vivo» encendida en Agente:

- «quiero atenderme hoy en clínica general» → Nea usa `queue_status` y
  `join_queue`, y responde con código, cuántos antes, hora y link.
- «¿cuánto me falta?» → números del CRM.
- «cancelalo» + «sí» → `cancel_turn`.
