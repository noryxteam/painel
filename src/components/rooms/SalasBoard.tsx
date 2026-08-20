"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Mic } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useSocket } from "@/hooks/useSocket";
import { roomTitle } from "@/lib/room-names";
import { cn } from "@/lib/utils";

export interface SalaCard {
  id: string;
  name: string;
  number: number;
  maxParticipants: number;
  participants: Array<{
    id: string;
    user: { id: string; name: string };
  }>;
}

interface SessionUser {
  userId: string;
  userName: string;
  role: string;
}

const enterClassName =
  "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-indigo-900/30 transition-all duration-200 hover:bg-indigo-500 active:scale-[0.98]";

export function SalasBoard({
  initialRooms,
  orgId,
  session,
}: {
  initialRooms: SalaCard[];
  orgId: string | null;
  session: SessionUser | null;
}) {
  const { socket, connected } = useSocket();
  const [rooms, setRooms] = useState(initialRooms);

  useEffect(() => {
    setRooms(initialRooms);
  }, [initialRooms]);

  useEffect(() => {
    if (!socket || !connected || !orgId) return;
    socket.emit("watch-org", orgId);
    const onUpdate = () => {
      void fetch("/api/rooms")
        .then((res) => res.json())
        .then((data) => {
          if (data.rooms) setRooms(data.rooms);
        });
    };
    socket.on("rooms-updated", onUpdate);
    return () => {
      socket.off("rooms-updated", onUpdate);
    };
  }, [connected, orgId, socket]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-400">
          TOKIO
        </p>
        <h2 className="mt-1 flex items-center gap-2 text-2xl font-bold text-zinc-50 sm:text-3xl">
          <Mic className="h-8 w-8" /> SALAS
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          Salas permanentes da organização. Escolha uma sala e entre.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {rooms.map((item) => {
          const occupied = item.participants.length > 0;
          const full = item.participants.length >= item.maxParticipants;
          const alreadyIn = item.participants.some(
            (participant) => participant.user.id === session?.userId,
          );
          const canEnter = Boolean(session) && (alreadyIn || !full);

          return (
            <Card
              key={item.id}
              className="border-zinc-800/80 bg-[#10141b] transition hover:-translate-y-0.5 hover:border-cyan-500/30"
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Mic className="h-4 w-4" /> {roomTitle(item.number)}
                  </CardTitle>
                  <span
                    className={cn(
                      "mt-1 h-2.5 w-2.5 rounded-full",
                      occupied ? "bg-amber-400" : "bg-emerald-400",
                    )}
                  />
                </div>
                <Badge tone={occupied ? "warning" : "success"}>
                  {occupied ? "Em uso" : "Disponível"}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-zinc-400">
                  {item.participants.length}/{item.maxParticipants} participantes
                </p>
                {canEnter ? (
                  <Link
                    href={`/salas/${item.id}?n=${item.number}`}
                    className={enterClassName}
                  >
                    ENTRAR
                  </Link>
                ) : (
                  <span
                    className={cn(
                      enterClassName,
                      "pointer-events-none cursor-not-allowed opacity-50",
                    )}
                  >
                    {!session ? "ENTRAR" : "Sala cheia"}
                  </span>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!session && (
        <p className="mt-6 text-sm text-zinc-500">
          Entre pelo{" "}
          <Link href="/" className="text-cyan-400 underline">
            início
          </Link>{" "}
          para usar as salas.
        </p>
      )}
    </div>
  );
}
