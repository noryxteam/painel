import { VoiceRoomEntry } from "@/components/rooms/VoiceRoom";
import { listSidebarRooms } from "@/lib/rooms";
import { getBetaSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function SalasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session = null;
  let rooms: Awaited<ReturnType<typeof listSidebarRooms>> = [];

  try {
    session = await getBetaSession();
  } catch (error) {
    console.error("getBetaSession", error);
  }

  try {
    rooms = await listSidebarRooms();
  } catch (error) {
    console.error("salas layout rooms", error);
  }

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
