import Link from "next/link";
import {
  Check,
  Lock,
  Minus,
} from "lucide-react";
import {
  noryxCalls,
  noryxInvites,
  noryxLogs,
  noryxMembers,
  noryxPermissionMatrix,
  noryxPermissions,
  noryxReplies,
  noryxRoles,
  noryxTeam,
  noryxTickets,
} from "@/components/noryx/demo-data";
import {
  LiveMark,
  NxCard,
  NxCardHeader,
  PageHead,
  StatusDot,
  TypeBadge,
} from "@/components/noryx/ui";
import { noryxPath } from "@/lib/noryx";
import { cn } from "@/lib/utils";

function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-500">
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={cn("px-4 py-3 text-[13px] text-zinc-300", className)}>
      {children}
    </td>
  );
}

export function CallsScreen() {
  return (
    <>
      <PageHead
        title="Calls"
        description="Visão das calls de análise, suporte e treinamento em andamento."
      />
      <NxCard>
        <NxCardHeader title="Todas as calls" />
        <TableWrap>
          <table className="min-w-full">
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Tipo</Th>
                <Th>Acesso</Th>
                <Th>Participantes</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {noryxCalls.map((call) => (
                <tr key={call.name} className="border-t border-white/[0.04]">
                  <Td className="font-medium text-zinc-100">{call.name}</Td>
                  <Td>
                    <TypeBadge label={call.type} tone={call.typeTone} />
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5">
                      {call.access === "Restrita" ? (
                        <Lock className="h-3 w-3 text-violet-400" />
                      ) : null}
                      {call.access}
                    </span>
                  </Td>
                  <Td>{call.people}</Td>
                  <Td>
                    {call.status === "Ao vivo" ? (
                      <LiveMark />
                    ) : (
                      call.status
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </NxCard>
    </>
  );
}

export function MembrosScreen() {
  return (
    <>
      <PageHead
        title="Membros"
        description="Pessoas com acesso ao sistema, cargo e participação em calls."
      />
      <NxCard>
        <NxCardHeader title="Lista de membros" />
        <TableWrap>
          <table className="min-w-full">
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Cargo</Th>
                <Th>Status</Th>
                <Th>Desde</Th>
                <Th>Calls</Th>
              </tr>
            </thead>
            <tbody>
              {noryxMembers.map((member) => (
                <tr key={member.name} className="border-t border-white/[0.04]">
                  <Td className="font-medium text-zinc-100">{member.name}</Td>
                  <Td>{member.cargo}</Td>
                  <Td>
                    <StatusDot
                      online={member.status === "Online"}
                      label={member.status}
                    />
                  </Td>
                  <Td>{member.joined}</Td>
                  <Td>{member.calls}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </NxCard>
    </>
  );
}

export function CargosScreen() {
  return (
    <>
      <PageHead
        title="Cargos"
        description="Níveis de acesso usados para calls, equipe e permissões."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {noryxRoles.map((role) => (
          <NxCard key={role.name} className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: role.color }}
                />
                <h2 className="text-sm font-semibold text-white">{role.name}</h2>
              </div>
              <span className="text-xs text-zinc-500">{role.members} pessoas</span>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-zinc-400">
              {role.desc}
            </p>
          </NxCard>
        ))}
      </div>
    </>
  );
}

export function PermissoesScreen() {
  return (
    <>
      <PageHead
        title="Permissões"
        description="Matriz visual de o que cada cargo pode fazer no sistema."
      />
      <NxCard>
        <NxCardHeader title="Matriz por cargo" />
        <TableWrap>
          <table className="min-w-full">
            <thead>
              <tr>
                <Th>Permissão</Th>
                {noryxRoles.map((role) => (
                  <Th key={role.name}>{role.name}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {noryxPermissions.map((perm, index) => (
                <tr key={perm} className="border-t border-white/[0.04]">
                  <Td className="whitespace-nowrap text-zinc-200">{perm}</Td>
                  {noryxRoles.map((role) => {
                    const on = noryxPermissionMatrix[role.name]?.[index];
                    return (
                      <Td key={role.name} className="text-center">
                        {on ? (
                          <Check className="mx-auto h-4 w-4 text-emerald-400" />
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-zinc-700" />
                        )}
                      </Td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </NxCard>
    </>
  );
}

export function EquipeScreen() {
  return (
    <>
      <PageHead
        title="Equipe / Perfis"
        description="Quem opera o painel: dono, administradores, moderação e análise."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {noryxTeam.map((person) => (
          <NxCard key={person.name} className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-sm font-semibold text-zinc-100">
                {person.initials}
              </span>
              <div>
                <p className="text-sm font-medium text-white">{person.name}</p>
                <p className="text-[12px] text-zinc-500">{person.role}</p>
              </div>
            </div>
            <div className="mt-4">
              <StatusDot
                online={person.status === "online"}
                label={person.status === "online" ? "Online" : "Ausente"}
              />
            </div>
          </NxCard>
        ))}
      </div>
    </>
  );
}

export function ConvitesScreen() {
  return (
    <>
      <PageHead
        title="Convites"
        description="Convites pendentes para entrar na organização com um cargo definido."
      />
      <NxCard>
        <NxCardHeader title="Pendentes e expirados" />
        <TableWrap>
          <table className="min-w-full">
            <thead>
              <tr>
                <Th>E-mail</Th>
                <Th>Cargo</Th>
                <Th>Status</Th>
                <Th>Enviado</Th>
              </tr>
            </thead>
            <tbody>
              {noryxInvites.map((invite) => (
                <tr key={invite.email} className="border-t border-white/[0.04]">
                  <Td className="text-zinc-100">{invite.email}</Td>
                  <Td>{invite.cargo}</Td>
                  <Td>
                    <TypeBadge
                      label={invite.status}
                      tone={invite.status === "Pendente" ? "yellow" : "zinc"}
                    />
                  </Td>
                  <Td>{invite.sent}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </NxCard>
    </>
  );
}

export function TicketsScreen() {
  return (
    <>
      <PageHead
        title="Tickets"
        description="Fila de suporte da operação: áudio, acesso, convites e problemas técnicos."
      />
      <NxCard>
        <NxCardHeader title="Abertos" />
        <ul className="divide-y divide-white/[0.04]">
          {noryxTickets.map((ticket) => (
            <li key={ticket.id} className="flex items-center gap-4 px-5 py-4">
              <span className="font-mono text-xs text-zinc-500">{ticket.id}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-100">{ticket.title}</p>
                <p className="text-[11px] text-zinc-500">{ticket.category}</p>
              </div>
              <TypeBadge label="Aberto" tone="yellow" />
              <span className="text-[12px] text-zinc-600">{ticket.time}</span>
            </li>
          ))}
        </ul>
      </NxCard>
    </>
  );
}

export function RespostasScreen() {
  return (
    <>
      <PageHead
        title="Respostas Rápidas"
        description="Textos prontos para o time de suporte usar nos tickets."
      />
      <div className="grid gap-3 md:grid-cols-3">
        {noryxReplies.map((reply) => (
          <NxCard key={reply.title} className="p-5">
            <h2 className="text-sm font-semibold text-white">{reply.title}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
              {reply.body}
            </p>
          </NxCard>
        ))}
      </div>
    </>
  );
}

export function LogsScreen() {
  return (
    <>
      <PageHead
        title="Logs de Atividade"
        description="Registro das ações administrativas recentes no sistema."
      />
      <NxCard>
        <NxCardHeader title="Eventos" />
        <TableWrap>
          <table className="min-w-full">
            <thead>
              <tr>
                <Th>Quando</Th>
                <Th>Quem</Th>
                <Th>Ação</Th>
                <Th>Alvo</Th>
              </tr>
            </thead>
            <tbody>
              {noryxLogs.map((log) => (
                <tr key={`${log.at}-${log.target}`} className="border-t border-white/[0.04]">
                  <Td className="whitespace-nowrap text-zinc-500">{log.at}</Td>
                  <Td className="text-zinc-100">{log.actor}</Td>
                  <Td>{log.action}</Td>
                  <Td>{log.target}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </NxCard>
    </>
  );
}

export function ConfiguracoesScreen() {
  return (
    <>
      <PageHead
        title="Configurações"
        description="Preferências visuais da organização. Nada aqui altera regras do sistema ainda."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <NxCard className="p-5">
          <h2 className="text-sm font-semibold text-white">Organização</h2>
          <label className="mt-4 block text-[12px] text-zinc-500">Nome</label>
          <input
            readOnly
            value="Free Fire ORG"
            className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#0b0d10] px-3 py-2.5 text-sm text-zinc-200 outline-none"
          />
          <label className="mt-4 block text-[12px] text-zinc-500">Fuso</label>
          <input
            readOnly
            value="America/Sao_Paulo"
            className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#0b0d10] px-3 py-2.5 text-sm text-zinc-200 outline-none"
          />
        </NxCard>
        <NxCard className="p-5">
          <h2 className="text-sm font-semibold text-white">Aparência</h2>
          <div className="mt-4 space-y-3 text-sm text-zinc-300">
            <label className="flex items-center justify-between rounded-xl border border-white/[0.06] px-3 py-3">
              Tema escuro
              <span className="h-5 w-9 rounded-full bg-emerald-500/80 p-0.5">
                <span className="ml-auto block h-4 w-4 rounded-full bg-white" />
              </span>
            </label>
            <label className="flex items-center justify-between rounded-xl border border-white/[0.06] px-3 py-3">
              Indicador ao vivo
              <span className="h-5 w-9 rounded-full bg-emerald-500/80 p-0.5">
                <span className="ml-auto block h-4 w-4 rounded-full bg-white" />
              </span>
            </label>
          </div>
        </NxCard>
      </div>
    </>
  );
}

export function BackupScreen() {
  return (
    <>
      <PageHead
        title="Backup"
        description="Cópias de segurança da configuração e da operação. Somente visual."
      />
      <div className="grid gap-3 md:grid-cols-3">
        {[
          { name: "snapshot-0820", when: "Hoje, 08:44", size: "24 MB" },
          { name: "snapshot-0819", when: "Ontem, 08:44", size: "24 MB" },
          { name: "snapshot-0813", when: "13/08/2026", size: "23 MB" },
        ].map((item) => (
          <NxCard key={item.name} className="p-5">
            <p className="font-mono text-sm text-zinc-100">{item.name}</p>
            <p className="mt-2 text-[12px] text-zinc-500">{item.when}</p>
            <p className="mt-1 text-[12px] text-zinc-500">{item.size}</p>
          </NxCard>
        ))}
      </div>
      <p className="mt-4 text-sm text-zinc-500">
        Voltar ao{" "}
        <Link href={noryxPath()} className="text-emerald-400 hover:text-emerald-300">
          dashboard
        </Link>
        .
      </p>
    </>
  );
}
