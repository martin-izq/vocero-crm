"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { ContactAvatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Member = {
  id: string;
  role: string;
  name: string;
  email: string;
  createdAt: string;
  agendaIds: string[];
};

type Agenda = { id: string; name: string; numberPrefix: string };

const ROLES: Record<string, string> = {
  owner: "Propietario",
  admin: "Admin",
  member: "Miembro",
  operator: "Operario",
};

export function TeamClient({ turnos = false }: { turnos?: boolean }) {
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [role, setRole] = useState<"member" | "operator">("member");
  const [agendaIds, setAgendaIds] = useState<string[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/settings/team").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { members: Member[] };
    setMembers(data.members);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (!turnos) return;
    void fetch("/api/turnos/agendas")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { agendas: Agenda[] } | null) => d && setAgendas(d.agendas))
      .catch(() => null);
  }, [turnos]);

  function generatePassword() {
    const alphabet =
      "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint32Array(14);
    crypto.getRandomValues(bytes);
    setTempPassword(
      Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")
    );
  }

  async function create() {
    setSaving(true);
    setError(null);
    setCreated(null);
    const res = await fetch("/api/settings/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, password: tempPassword, role, agendaIds }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo crear la cuenta");
      return;
    }
    setCreated({ email, password: tempPassword });
    setName("");
    setEmail("");
    setTempPassword("");
    setRole("member");
    setAgendaIds([]);
    void refetch();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Crear cuenta de equipo</CardTitle>
          <CardDescription>
            Sin correos ni invitaciones: comparte tú mismo la contraseña
            temporal con tu compañero (se muestra UNA sola vez).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="team-name">Nombre</Label>
              <Input
                id="team-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-email">Correo</Label>
              <Input
                id="team-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-password">Contraseña temporal</Label>
            <div className="flex gap-2">
              <Input
                id="team-password"
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                placeholder="mínimo 8 caracteres"
              />
              <Button variant="outline" onClick={generatePassword}>
                Generar
              </Button>
            </div>
          </div>
          {turnos && (
            <RolYAgendas
              id="team-role"
              role={role}
              agendaIds={agendaIds}
              agendas={agendas}
              onChange={(r, ids) => {
                setRole(r);
                setAgendaIds(ids);
              }}
            />
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {created && (
            <div className="rounded-md border border-success-soft bg-success-tint p-3 text-sm">
              <p className="font-medium text-success-text">Cuenta creada ✓</p>
              <p className="mt-1 text-success-text opacity-90">
                Comparte estos datos ahora (no se volverán a mostrar):
                <br />
                <code>{created.email}</code> · contraseña{" "}
                <code>{created.password}</code>
              </p>
            </div>
          )}
          <Button
            disabled={
              saving || !name.trim() || !email.trim() || tempPassword.length < 8
            }
            onClick={() => void create()}
          >
            <UserPlus className="h-4 w-4" />
            {saving ? "Creando…" : "Crear cuenta"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Miembros
        </p>
        {members.map((m) => (
          <MemberRow key={m.id} m={m} turnos={turnos} agendas={agendas} onSaved={() => void refetch()} />
        ))}
      </div>
    </div>
  );
}

function MemberRow({
  m,
  turnos,
  agendas,
  onSaved,
}: {
  m: Member;
  turnos: boolean;
  agendas: Agenda[];
  onSaved: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [role, setRole] = useState<"member" | "operator">(m.role === "operator" ? "operator" : "member");
  const [agendaIds, setAgendaIds] = useState(m.agendaIds);
  const [error, setError] = useState<string | null>(null);
  const nombres = agendas.filter((a) => m.agendaIds.includes(a.id)).map((a) => a.name);

  async function guardar() {
    setError(null);
    const res = await fetch(`/api/settings/team/${m.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role, agendaIds }),
    }).catch(() => null);
    if (!res?.ok) {
      const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(d?.error?.message ?? "No se pudo guardar");
      return;
    }
    setEditando(false);
    onSaved();
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card px-4 py-3" data-member={m.email}>
      <div className="flex items-center gap-3">
        <ContactAvatar name={m.name} seed={m.id} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{m.name}</p>
          <p className="text-xs text-muted-foreground">
            {m.email}
            {m.role === "operator" && ` · ${nombres.length ? nombres.join(", ") : "sin agendas"}`}
          </p>
        </div>
        <Badge variant={m.role === "owner" ? "default" : "secondary"}>{ROLES[m.role] ?? m.role}</Badge>
        {turnos && m.role !== "owner" && (
          <Button size="sm" variant="ghost" onClick={() => setEditando((v) => !v)}>
            {editando ? "Cerrar" : "Editar"}
          </Button>
        )}
      </div>
      {editando && (
        <div className="space-y-3 border-t pt-3">
          <RolYAgendas
            id={`role-${m.id}`}
            role={role}
            agendaIds={agendaIds}
            agendas={agendas}
            onChange={(r, ids) => {
              setRole(r);
              setAgendaIds(ids);
            }}
          />
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={() => void guardar()}>
              Guardar
            </Button>
            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/** 039 — Miembro (atiende todo) u Operario (solo sus agendas de Turnos). */
function RolYAgendas({
  id,
  role,
  agendaIds,
  agendas,
  onChange,
}: {
  id: string;
  role: "member" | "operator";
  agendaIds: string[];
  agendas: Agenda[];
  onChange: (role: "member" | "operator", agendaIds: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <Label htmlFor={id}>Rol</Label>
        <select
          id={id}
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={role}
          onChange={(e) => onChange(e.target.value as "member" | "operator", agendaIds)}
        >
          <option value="member">Miembro: atiende la Bandeja y todas las agendas</option>
          <option value="operator">Operario: solo sus agendas de Turnos</option>
        </select>
      </div>
      {role === "operator" && (
        <fieldset className="flex flex-wrap gap-3 text-sm">
          <legend className="mb-1 text-xs text-muted-foreground">Agendas que atiende</legend>
          {agendas.length === 0 && <span className="text-muted-foreground">Todavía no hay agendas en Turnos.</span>}
          {agendas.map((a) => (
            <label key={a.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={agendaIds.includes(a.id)}
                onChange={(e) =>
                  onChange(role, e.target.checked ? [...agendaIds, a.id] : agendaIds.filter((x) => x !== a.id))
                }
              />
              {a.numberPrefix} · {a.name}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
