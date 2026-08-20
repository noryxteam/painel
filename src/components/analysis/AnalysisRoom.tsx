"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useAnalysisRoom } from "@/hooks/useAnalysisRoom";
import { useSocket } from "@/hooks/useSocket";
import { ROOM_STATUS_LABELS, STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface AnalysisRoomProps {
  analysis: {
    id: string;
    status: string;
    organization: { id?: string; name: string };
    match: { matchNumber: number };
    requester: { id: string; name: string };
    targetUser: { id: string; name: string };
    room?: { id: string; name: string; number: number; status: string } | null;
  };
  access: {
    analysisId: string;
    userId: string;
    role: "REQUESTER" | "TARGET" | "ADMIN";
    token: string;
  };
  userName: string;
}

function roleLabel(role: string) {
  if (role === "TARGET") return "Analisado";
  if (role === "REQUESTER") return "Solicitante";
  return "Suporte";
}

export function AnalysisRoomEntry({
  analysis,
  userName,
  joinAction,
}: {
  analysis: AnalysisRoomProps["analysis"];
  userName: string;
  joinAction: "ADMIN" | "REQUESTER" | "TARGET";
}) {
  const [access, setAccess] = useState<AnalysisRoomProps["access"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res =
        joinAction === "TARGET"
          ? await fetch("/api/analyses/actions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "join-target",
                analysisId: analysis.id,
              }),
            })
          : await fetch(`/api/analyses/${analysis.id}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: joinAction === "ADMIN" ? "join-admin" : "join-requester",
              }),
            });
      const data = await res.json();
      if (cancelled) return;
      if (!res.ok || !data.access) {
        setError(data.error ?? "Não foi possível entrar na análise");
        return;
      }
      setAccess(data.access);
    })();
    return () => {
      cancelled = true;
    };
  }, [analysis.id, joinAction]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-red-300">{error}</p>
      </div>
    );
  }

  if (!access) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-400">
          {analysis.organization.name}
        </p>
        <h2 className="mt-1 text-2xl font-bold text-zinc-50 sm:text-3xl">
          {analysis.room?.name ?? "Sala de análise"}
        </h2>
      </div>
    );
  }

  return <AnalysisRoom analysis={analysis} access={access} userName={userName} />;
}

export function AnalysisRoom({ analysis, access, userName }: AnalysisRoomProps) {
  const router = useRouter();
  const { socket, connected } = useSocket();
  const playerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const room = useAnalysisRoom({
    analysisId: analysis.id,
    userId: access.userId,
    userName,
    role: access.role,
    token: access.token,
    socket,
    connected,
  });

  const isLive =
    room.status === "TRANSMISSAO_ATIVA" || analysis.status === "TRANSMISSAO_ATIVA";
  const isFinished =
    room.status === "FINALIZADA" ||
    ["FINALIZADA", "CANCELADA", "EXPIRADA", "IRREGULARIDADE"].includes(
      analysis.status,
    );
  const roomName = analysis.room?.name ?? "Sala de análise";

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === playerRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await player.requestFullscreen();
    } catch {
      // Bloqueio do navegador.
    }
  }, []);

  const leaveAndGo = () => {
    room.leaveRoom();
    if (access.role === "ADMIN") router.push("/admin");
    else if (access.role === "TARGET") router.push("/analise");
    else router.push("/discord");
  };

  useEffect(() => {
    if (room.removedReason) {
      router.push(access.role === "ADMIN" ? "/admin" : "/");
    }
  }, [access.role, room.removedReason, router]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-400">
            {analysis.organization.name}
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
            {roomName}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Partida #{analysis.match.matchNumber} · {analysis.requester.name} →{" "}
            {analysis.targetUser.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={isLive ? "live" : isFinished ? "muted" : "warning"}>
            {isLive ? "AO VIVO" : STATUS_LABELS[room.status] ?? room.status}
          </Badge>
          {analysis.room?.status && (
            <Badge tone={analysis.room.status === "DISPONIVEL" ? "success" : "default"}>
              {ROOM_STATUS_LABELS[analysis.room.status] ?? analysis.room.status}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card className="overflow-hidden border-cyan-500/10 bg-[#0e1218]">
            <CardContent className="p-0">
              <div
                ref={playerRef}
                className={cn(
                  "relative w-full overflow-hidden bg-black",
                  isFullscreen ? "h-dvh" : "aspect-video",
                )}
              >
                <video
                  ref={room.localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className={
                    access.role === "TARGET" && room.isSharing
                      ? "h-full w-full object-contain"
                      : "pointer-events-none absolute inset-0 h-full w-full object-contain opacity-0"
                  }
                />
                <video
                  ref={room.remoteVideoRef}
                  autoPlay
                  playsInline
                  className={
                    access.role === "TARGET" && room.isSharing
                      ? "pointer-events-none absolute inset-0 h-full w-full object-contain opacity-0"
                      : "h-full w-full object-contain"
                  }
                />

                {!room.isSharing && !room.hasRemoteStream && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_center,_rgba(34,211,238,0.08),_transparent_55%)]">
                    <div className="px-6 text-center">
                      <p className="text-xs uppercase tracking-[0.28em] text-cyan-500/80">
                        Transmissão da sala
                      </p>
                      <p className="mt-3 text-lg text-zinc-200">
                        {access.role === "TARGET"
                          ? "Compartilhe sua tela para a análise começar"
                          : "Aguardando a transmissão do jogador analisado"}
                      </p>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="absolute right-3 bottom-3 z-10 rounded-lg border border-white/10 bg-black/70 px-3 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-black/90"
                >
                  {isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
                </button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-[#10141b]">
            <CardContent className="flex flex-wrap gap-2 py-4 sm:gap-3">
              <Button className="w-full sm:w-auto" variant={room.isMicOn ? "success" : "secondary"} onClick={room.toggleMic}>
                {room.isMicOn ? "Microfone ligado" : "Microfone"}
              </Button>
              {access.role === "TARGET" && !isFinished && (
                <Button
                  className="w-full sm:w-auto"
                  onClick={room.isSharing ? room.stopScreenShare : room.startScreenShare}
                >
                  {room.isSharing ? "Parar tela" : "Compartilhar minha tela"}
                </Button>
              )}
              {(access.role === "REQUESTER" || access.role === "ADMIN") && !isFinished && (
                <Button className="w-full sm:w-auto" variant="danger" onClick={room.endAnalysis}>
                  Encerrar análise
                </Button>
              )}
              {isFinished ? (
                <Button className="w-full sm:w-auto" variant="secondary" onClick={() => router.push("/admin")}>
                  Voltar ao painel
                </Button>
              ) : (
                <Button className="w-full sm:w-auto" variant="ghost" onClick={leaveAndGo}>
                  Sair da sala
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border-cyan-500/10 bg-[#10141b]">
            <CardHeader>
              <CardTitle>Participantes</CardTitle>
              <p className="text-xs text-zinc-500">
                {room.participants.length || 1}/10 nesta sala
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {(room.participants.length
                ? room.participants
                : [
                    {
                      userId: access.userId,
                      userName,
                      role: access.role,
                      isSharing: room.isSharing,
                      micEnabled: room.isMicOn,
                      speaking: false,
                      connected: connected,
                    },
                  ]
              ).map((participant) => (
                <div
                  key={participant.userId}
                  className={cn(
                    "rounded-2xl border px-4 py-3 transition",
                    participant.speaking
                      ? "border-emerald-400/50 bg-emerald-500/10 speaking-glow"
                      : "border-zinc-800 bg-zinc-950/60",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 font-semibold text-zinc-100">
                        <span
                          className={cn(
                            "h-2.5 w-2.5 rounded-full",
                            participant.connected === false
                              ? "bg-zinc-600"
                              : "bg-emerald-400",
                          )}
                        />
                        {participant.userName}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {roleLabel(participant.role)}
                      </p>
                    </div>
                    {access.role === "ADMIN" &&
                      participant.userId !== access.userId &&
                      !isFinished && (
                        <button
                          type="button"
                          className="text-xs text-red-400 hover:text-red-300"
                          onClick={() => room.kickParticipant(participant.userId)}
                        >
                          Remover
                        </button>
                      )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-zinc-900 px-2 py-1 text-zinc-300">
                      {participant.speaking
                        ? "Falando"
                        : participant.micEnabled
                          ? "Microfone"
                          : "Mutado"}
                    </span>
                    <span className="rounded-full bg-zinc-900 px-2 py-1 text-zinc-300">
                      {participant.isSharing ? "Transmitindo" : "Assistindo"}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {room.error && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {room.error}
            </p>
          )}
          {!connected && (
            <p className="text-xs text-amber-400">Conectando à sala...</p>
          )}
        </div>
      </div>
    </div>
  );
}
