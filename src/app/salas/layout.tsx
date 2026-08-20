import { VoiceRoomEntry } from "@/components/rooms/VoiceRoom";
import { listSidebarRooms } from "@/lib/rooms";
import { getBetaSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function SalasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, rooms] = await Promise.all([
    getBetaSession(),
    listSidebarRooms(),
  ]);
  if (!session) redirect("/api/session/guest");

  return (
    <>
      <VoiceRoomEntry
        userName={session.userName}
        userId={session.userId}
        role={session.role}
        initialRooms={rooms}
      />
      <div hidden aria-hidden>
        {children}
      </div>
    </>
  );
}
