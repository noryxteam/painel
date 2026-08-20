import Link from "next/link";
import {
  Crown,
  Headphones,
  KeyRound,
  Lock,
  Mic,
  Settings,
  Ticket,
  UserPlus,
  Users,
} from "lucide-react";
import {
  noryxActivity,
  noryxCalls,
  noryxQuick,
  noryxTeam,
  noryxTickets,
} from "@/components/noryx/demo-data";
import {
  LiveMark,
  NxCard,
  NxCardHeader,
  NxStat,
  StatusDot,
  TypeBadge,
} from "@/components/noryx/ui";
import { noryxPath } from "@/lib/noryx";
import { cn } from "@/lib/utils";

const quickIcons = {
  "Criar Call": Mic,
  "Criar Cargo": Crown,
  "Adicionar Membro": UserPlus,
  "Gerenciar Permissões": KeyRound,
  "Abrir Ticket": Ticket,
  Configurações: Settings,
};

const quickTone = {
  green: "bg-emerald-500/12 text-emerald-400",
  purple: "bg-violet-500/12 text-violet-400",
  blue: "bg-sky-500/12 text-sky-400",
  orange: "bg-orange-500/12 text-orange-400",
  yellow: "bg-amber-500/12 text-amber-300",
  zinc: "bg-zinc-500/15 text-zinc-300",
};

export function DashboardScreen() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <NxStat
          label="Membros"
          value="3.842"
          hint="↑ 128 hoje"
          tone="green"
          icon={<Users className="h-4 w-4" />}
        />
        <NxStat
          label="Calls Ativas"
          value="24"
          hint="• Em andamento"
          tone="purple"
          icon={<Mic className="h-4 w-4" />}
        />
        <NxStat
          label="Calls Restritas"
          value="12"
          hint="• Acesso limitado"
          tone="orange"
          icon={<Lock className="h-4 w-4" />}
        />
        <NxStat
          label="Equipe Online"
          value="8"
          hint="• Administradores"
          tone="blue"
          icon={<Headphones className="h-4 w-4" />}
        />
        <NxStat
          label="Tickets Abertos"
          value="15"
          hint="• Aguardando resposta"
          tone="yellow"
          icon={<Ticket className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
        <NxCard>
          <NxCardHeader
            title="Calls Ativas"
            action={
              <Link
                href={noryxPath("calls")}
                className="text-xs font-medium text-zinc-400 hover:text-white"
              >
                Ver todas
              </Link>
            }
          />
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[13px]">
              <thead className="text-[11px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Nome da Call</th>
                  <th className="px-3 py-3 font-medium">Tipo</th>
                  <th className="px-3 py-3 font-medium">Acesso</th>
                  <th className="px-3 py-3 font-medium">Participantes</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {noryxCalls.map((call) => (
                  <tr
                    key={call.name}
                    className="border-t border-white/[0.04] text-zinc-300"
                  >
                    <td className="px-5 py-3 font-medium text-zinc-100">
                      {call.name}
                    </td>
                    <td className="px-3 py-3">
                      <TypeBadge label={call.type} tone={call.typeTone} />
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 text-zinc-400">
                        {call.access === "Restrita" ? (
                          <Lock className="h-3 w-3 text-violet-400" />
                        ) : null}
                        {call.access}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-zinc-400">{call.people}</td>
                    <td className="px-5 py-3">
                      {call.status === "Ao vivo" ? (
                        <LiveMark />
                      ) : (
                        <span className="text-zinc-400">{call.status}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </NxCard>

        <NxCard>
          <NxCardHeader title="Equipe Online" />
          <ul className="divide-y divide-white/[0.04] px-2 py-1">
            {noryxTeam.map((person) => (
              <li
                key={person.name}
                className="flex items-center gap-3 px-3 py-2.5"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-semibold text-zinc-200">
                  {person.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-100">{person.name}</p>
                  <p className="truncate text-[11px] text-zinc-500">{person.role}</p>
                </div>
                <StatusDot
                  online={person.status === "online"}
                  label={person.status === "online" ? "Online" : "Ausente"}
                />
              </li>
            ))}
          </ul>
        </NxCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <NxCard>
          <NxCardHeader
            title="Tickets Abertos"
            action={
              <Link
                href={noryxPath("tickets")}
                className="text-xs font-medium text-zinc-400 hover:text-white"
              >
                Ver todos
              </Link>
            }
          />
          <ul className="divide-y divide-white/[0.04]">
            {noryxTickets.map((ticket) => (
              <li key={ticket.id} className="flex items-start gap-3 px-5 py-3">
                <span className="mt-0.5 font-mono text-[11px] text-zinc-500">
                  {ticket.id}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-200">{ticket.title}</p>
                  <p className="text-[11px] text-zinc-500">{ticket.category}</p>
                </div>
                <span className="shrink-0 text-[11px] text-zinc-600">{ticket.time}</span>
              </li>
            ))}
          </ul>
        </NxCard>

        <NxCard>
          <NxCardHeader title="Atividade Recente" />
          <ul className="space-y-3 px-5 py-4">
            {noryxActivity.map((item) => (
              <li key={item.text} className="flex gap-3">
                <span
                  className={cn(
                    "mt-1 h-2 w-2 shrink-0 rounded-full",
                    item.tone === "green" && "bg-emerald-400",
                    item.tone === "blue" && "bg-sky-400",
                    item.tone === "yellow" && "bg-amber-300",
                    item.tone === "purple" && "bg-violet-400",
                    item.tone === "orange" && "bg-orange-400",
                  )}
                />
                <div>
                  <p className="text-[13px] leading-snug text-zinc-300">
                    <span className="font-medium text-zinc-100">{item.who}</span>{" "}
                    {item.text}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-600">{item.time}</p>
                </div>
              </li>
            ))}
          </ul>
        </NxCard>

        <NxCard>
          <NxCardHeader title="Acesso Rápido" />
          <div className="grid grid-cols-2 gap-2 p-4">
            {noryxQuick.map((item) => {
              const Icon = quickIcons[item.label as keyof typeof quickIcons];
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex flex-col items-start gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-3 transition hover:border-white/[0.1] hover:bg-white/[0.04]"
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg",
                      quickTone[item.tone],
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-[12px] font-medium text-zinc-200">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </NxCard>
      </div>
    </div>
  );
}
