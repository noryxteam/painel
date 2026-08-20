import { NextResponse } from "next/server";
import { ROOM_COOKIE } from "@/lib/constants";
import { getRoomMediaInfo, leaveRoomParticipant } from "@/lib/rooms";
import { getBetaSession } from "@/lib/session";
import { notifyRoomsUpdated } from "@/server/socket";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const room = await getRoomMediaInfo(id);
  if (!room) {
    return NextResponse.json({ error: "Sala não encontrada" }, { status: 404 });
  }
  return NextResponse.json({ room });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getBetaSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const room = await getRoomMediaInfo(id);
  if (!room) {
    return NextResponse.json({ error: "Sala não encontrada" }, { status: 404 });
  }

  if (body.action === "leave") {
    await leaveRoomParticipant(id, session.userId);
    notifyRoomsUpdated(room.organizationId);
    const response = NextResponse.json({ ok: true });
    response.cookies.delete(ROOM_COOKIE);
    return response;
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
