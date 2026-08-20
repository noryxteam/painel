import { VoiceRoomMount } from "@/components/rooms/VoiceRoomMount";
import { getBetaSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function SalasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session = null;

  try {
    session = await getBetaSession();
  } catch (error) {
    console.error("getBetaSession", error);
  }

  if (!session) redirect("/api/session/guest");

  return (
    <>
      <Suspense fallback={<div className="h-dvh bg-[#111214]" />}>
        <VoiceRoomMount
          userName={session.userName}
          userId={session.userId}
          role={session.role}
        />
      </Suspense>
      <div hidden aria-hidden>
        {children}
      </div>
    </>
  );
}
