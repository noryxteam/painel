"use client";

import Link from "next/link";
import { Check, TriangleAlert, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatTime } from "@/lib/format";
import { RESULT_LABELS, STATUS_LABELS } from "@/lib/constants";
import { getEventLabel } from "@/lib/event-labels";

export interface AdminAnalysisDetailData {
  id: string;
  status: string;
  result: string | null;
  resultBy: string | null;
  resultAt: string | null;
  match: { matchNumber: number };
  requester: { name: string };
  targetUser: { name: string };
  room?: { name: string; number: number } | null;
  events: Array<{
    id: string;
    type: string;
    createdAt: string;
    user?: { name: string } | null;
  }>;
}

export function AdminAnalysisDetail({
  analysis: initial,
}: {
  analysis: AdminAnalysisDetailData;
}) {
  const isLive = initial.status === "TRANSMISSAO_ATIVA";

  const setResult = async (result: "APROVADO" | "IRREGULARIDADE" | "CANCELADA") => {
    const res = await fetch("/api/analyses/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set-result",
        analysisId: initial.id,
        result,
      }),
    });
    const data = await res.json();
    if (!data.analysis) {
      alert(data.error ?? "Erro ao registrar resultado");
      return;
    }
    window.location.reload();
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-indigo-400">
            TOKIO • Admin
          </p>
          <h2 className="text-2xl font-bold text-zinc-50 sm:text-3xl">
            Análise #{initial.match.matchNumber}
          </h2>
        </div>
        <Badge tone={isLive ? "live" : "default"}>
          {STATUS_LABELS[initial.status] ?? initial.status}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Detalhes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-300">
            <p>
              <span className="text-zinc-500">Partida:</span> {initial.match.matchNumber}
            </p>
            <p>
              <span className="text-zinc-500">Solicitante:</span> {initial.requester.name}
            </p>
            <p>
              <span className="text-zinc-500">Analisado:</span> {initial.targetUser.name}
            </p>
            {initial.room && (
              <p>
                <span className="text-zinc-500">Sala:</span> {initial.room.name}
              </p>
            )}
            <p>
              <span className="text-zinc-500">Status:</span> {STATUS_LABELS[initial.status]}
            </p>
            <Link
              href={`/analise/${initial.id}`}
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Entrar na sala
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resultado da análise</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {initial.result ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 text-sm">
                <p>
                  <span className="text-zinc-500">Resultado:</span>{" "}
                  {RESULT_LABELS[initial.result]}
                </p>
                <p>
                  <span className="text-zinc-500">Responsável:</span> {initial.resultBy}
                </p>
                <p>
                  <span className="text-zinc-500">Horário:</span>{" "}
                  {initial.resultAt ? formatTime(initial.resultAt) : "—"}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Button className="w-full" variant="success" onClick={() => void setResult("APROVADO")}>
                  <Check className="h-4 w-4" /> Aprovado
                </Button>
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={() => void setResult("IRREGULARIDADE")}
                >
                  <TriangleAlert className="h-4 w-4" /> Irregularidade
                </Button>
                <Button className="w-full" variant="danger" onClick={() => void setResult("CANCELADA")}>
                  <X className="h-4 w-4" /> Cancelada
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Histórico da análise #{initial.match.matchNumber}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {initial.events.map((event) => (
              <li
                key={event.id}
                className="flex gap-4 border-b border-zinc-900/80 pb-3 text-sm last:border-0"
              >
                <span className="w-14 shrink-0 font-mono text-zinc-500">
                  {formatTime(event.createdAt)}
                </span>
                <span className="text-zinc-300">
                  {getEventLabel(event.type, event.user?.name)}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
