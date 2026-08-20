"use client";

import dynamic from "next/dynamic";

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
  return <VoiceRoomEntry userName={userName} userId={userId} role={role} />;
}
