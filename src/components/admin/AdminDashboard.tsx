"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useSocket } from "@/hooks/useSocket";
import { ROOM_STATUS_LABELS, STATUS_LABELS } from "@/lib/constants";

export interface AdminDashboardData {
  stats: {
    todayCount: number;
    ongoing: number;
    pending: number;
    finished: number;
    liveRooms?: number;
    waitingRooms?: number;
    availableRooms?: number;
    problemRooms?: number;
  };
  analyses: Array<{
    id: string;
    status: string;
    match: { matchNumber: number };
    requester: { name: string };
    targetUser: { name: string };
    room?: { name: string; number: number; status: string } | null;
  }>;
  rooms?: Array<{
    id: string;
    name: string;
    status: string;
    maxParticipants: number;
    currentAnalysis: {
      id: string;
      match: { matchNumber: number };
      requester: { name: string };
      targetUser: { name: string };
    } | null;
    participants: Array<{
      screenSharing: boolean;
      microphoneEnabled: boolean;
      user: { name: string };
    }>;
  }>;
}

function statusTone(status: string) {
  if (status === "TRANSMISSAO_ATIVA") return "live" as const;
  if (status === "FINALIZADA") return "success" as const;
  if (status === "PENDENTE" || status.startsWith("AGUARDANDO")) return "warning" as const;
  if (status === "IRREGULARIDADE" || status === "CANCELADA") return "danger" as const;
  return "default" as const;
}

export function AdminDashboard({
  initial,
  orgId,
}: {
  initial: AdminDashboardData;
  orgId: string;
}) {
  const { socket, connected } = useSocket();
  const [data, setData] = useState(initial);

  useEffect(() => {
    setData(initial);
  }, [initial]);

  useEffect(() => {
    if (!socket || !connected || !orgId) return;
    socket.emit("watch-org", orgId);
    const onUpdate = () => {
      void fetch("/api/analyses?scope=admin")
        .then((r) => r.json())
        .then((payload) => {
          if (payload.stats) setData(payload);
        });
    };
    socket.on("rooms-updated", onUpdate);
    return () => {
      socket.off("rooms-updated", onUpdate);
    };
  }, [connected, orgId, socket]);

  const cards = [
    { label: "Ao vivo", value: data.stats.liveRooms ?? 0 },
    { label: "Aguardando", value: data.stats.waitingRooms ?? 0 },
    { label: "Disponíveis", value: data.stats.availableRooms ?? 0 },
    { label: "Com problema", value: data.stats.problemRooms ?? 0 },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
            TOKIO
          </p>
          <h2 className="text-2xl font-bold text-zinc-50 sm:text-3xl">Central de Análises</h2>
        </div>
        <Link href="/salas" className="text-sm text-cyan-400 hover:text-cyan-300">
          Ver todas as salas
        </Link>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="py-5">
              <p className="text-sm text-zinc-500">{card.label}</p>
              <p className="mt-1 text-3xl font-bold text-zinc-50">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {data.rooms && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Salas permanentes</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {data.rooms.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-zinc-100">{item.name}</p>
                  <Badge tone={statusTone(item.status)}>
                    {ROOM_STATUS_LABELS[item.status] ?? item.status}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {item.participants.length}/{item.maxParticipants} pessoas
                </p>
                {item.currentAnalysis && (
                  <Link
                    href={`/analise/${item.currentAnalysis.id}`}
                    className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                  >
                    Assistir
                  </Link>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Análises recentes</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0 sm:overflow-x-auto sm:px-6 sm:pb-6">
          <div className="flex flex-col gap-3 px-4 pb-4 sm:hidden">
            {data.analyses.map((analysis) => {
              const done = [
                "FINALIZADA",
                "CANCELADA",
                "EXPIRADA",
                "IRREGULARIDADE",
              ].includes(analysis.status);
              return (
                <div
                  key={analysis.id}
                  className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/admin/${analysis.id}`}
                      className="font-semibold text-cyan-400 hover:text-cyan-300"
                    >
                      Partida #{analysis.match.matchNumber}
                    </Link>
                    <Badge tone={statusTone(analysis.status)}>
                      {STATUS_LABELS[analysis.status] ?? analysis.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-zinc-400">
                    {analysis.room?.name ?? "Sem sala"}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {analysis.requester.name} → {analysis.targetUser.name}
                  </p>
                  {!done && (
                    <Link
                      href={`/analise/${analysis.id}`}
                      className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                    >
                      Assistir
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
          <table className="hidden min-w-full text-left text-sm sm:table">
            <thead className="border-b border-zinc-800 text-zinc-500">
              <tr>
                <th className="px-3 py-3 font-medium">Partida</th>
                <th className="px-3 py-3 font-medium">Sala</th>
                <th className="px-3 py-3 font-medium">Solicitante</th>
                <th className="px-3 py-3 font-medium">Analisado</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {data.analyses.map((analysis) => {
                const done = [
                  "FINALIZADA",
                  "CANCELADA",
                  "EXPIRADA",
                  "IRREGULARIDADE",
                ].includes(analysis.status);
                return (
                  <tr
                    key={analysis.id}
                    className="border-b border-zinc-900/80 transition hover:bg-zinc-900/40"
                  >
                    <td className="px-3 py-3">
                      <Link
                        href={`/admin/${analysis.id}`}
                        className="font-medium text-cyan-400 hover:text-cyan-300"
                      >
                        #{analysis.match.matchNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-3">{analysis.room?.name ?? "—"}</td>
                    <td className="px-3 py-3">{analysis.requester.name}</td>
                    <td className="px-3 py-3">{analysis.targetUser.name}</td>
                    <td className="px-3 py-3">
                      <Badge tone={statusTone(analysis.status)}>
                        {STATUS_LABELS[analysis.status] ?? analysis.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      {done ? (
                        <span className="text-zinc-600">—</span>
                      ) : (
                        <Link
                          href={`/analise/${analysis.id}`}
                          className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                        >
                          Assistir
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
