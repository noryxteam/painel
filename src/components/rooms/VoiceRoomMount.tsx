"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { getOrCreateDeviceId } from "@/lib/device";

const VoiceRoomEntry = dynamic(
  () => import("@/components/rooms/VoiceRoom").then((mod) => mod.VoiceRoomEntry),
  {
    ssr: false,
    loading: () => <div className="h-dvh bg-[#111214]" />,
  },
);

export function VoiceRoomMount({
  userName,
  userId,
  role,
}: {
  userName: string;
  userId: string;
  role: "PLAYER" | "ADMIN";
}) {
  const [identity, setIdentity] = useState({ userName, userId, role });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (role === "ADMIN") {
      setReady(true);
      return;
    }
    const deviceId = getOrCreateDeviceId();
    void fetch("/api/session/device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.userId) {
          setIdentity({
            userId: data.userId,
            userName: data.userName || "teste",
            role: data.role === "ADMIN" ? "ADMIN" : "PLAYER",
          });
        }
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, [role]);

  if (!ready || !identity.userId) {
    return <div className="h-dvh bg-[#111214]" />;
  }

  return (
    <VoiceRoomEntry
      userName={identity.userName}
      userId={identity.userId}
      role={identity.role}
    />
  );
}
