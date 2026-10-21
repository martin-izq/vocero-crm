"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** 039 — Crear y editar las agendas de turnos (solo quien configura). */

type AgendaForm = {
  id?: string;
  name: string;
  room: string;
  walkInMode: "queue" | "gaps" | "none";
  slotMinutes: number;
  opensAt: string;
  closesAt: string;
  numberPrefix: string;
  notifyBefore: number;
  receivesBookings: boolean;
  active: boolean;
};

const VACIA: AgendaForm = {
  name: "",
  room: "",
  walkInMode: "queue",
  slotMinutes: 15,
  opensAt: "09:00",
  closesAt: "18:00",
  numberPrefix: "",
  notifyBefore: 2,
  receivesBookings: false,
  active: true,
};

const MODOS = {
  queue: "Solo por orden de llegada",
  gaps: "Orden de llegada y reservas con horario",
  none: "Solo con reserva (horario)",
} as const;

export function AgendasConfig({ onSaved }: { onSaved: () => void }) {
  const [agendas, setAgendas] = useState<AgendaForm[]>([]);
  const [form, setForm] = useState<AgendaForm>(VACIA);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/turnos/agendas", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setAgendas(((await res.json()) as { agendas: AgendaForm[] }).agendas);
  }, []);
  useEffect(() => void cargar(), [cargar]);

  async function guardar() {
    setError(null);
    const { id, ...body } = form;
    const res = await fetch(id ? `/api/turnos/agendas/${id}` : "/api/turnos/agendas", {
      method: id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res?.ok) {
      const b = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(b?.error?.message ?? "No se pudo guardar.");
      return;
    }
    setForm(VACIA);
    void cargar();
    onSaved();
  }

  const set = <K extends keyof AgendaForm>(k: K, v: AgendaForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap gap-2">
        {agendas.map((a) => (
          <Button key={a.id} size="sm" variant={form.id === a.id ? "default" : "secondary"} onClick={() => setForm(a)}>
            {a.numberPrefix} · {a.name}
            {!a.active && " (apagada)"}
          </Button>
        ))}
        <Button size="sm" variant="outline" onClick={() => setForm(VACIA)}>
          Nueva agenda
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo id="ag-nombre" label="Nombre">
          <Input id="ag-nombre" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Clínica general" />
        </Campo>
        <Campo id="ag-sala" label="Consultorio">
          <Input id="ag-sala" value={form.room} onChange={(e) => set("room", e.target.value)} placeholder="Consultorio 2" />
        </Campo>
        <Campo id="ag-letra" label="Letra del número">
          <Input id="ag-letra" value={form.numberPrefix} maxLength={3} onChange={(e) => set("numberPrefix", e.target.value)} placeholder="A" />
        </Campo>
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
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.receivesBookings} onChange={(e) => set("receivesBookings", e.target.checked)} />
          Recibe las citas del día
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
          Activa
        </label>
        <Button size="sm" onClick={() => void guardar()} disabled={!form.name.trim() || !form.numberPrefix.trim()}>
          {form.id ? "Guardar agenda" : "Crear agenda"}
        </Button>
        {error && <span className="text-danger-text">{error}</span>}
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
