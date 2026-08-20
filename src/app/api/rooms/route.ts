import { NextResponse } from "next/server";
import { listSidebarRooms } from "@/lib/rooms";

export async function GET() {
  const rooms = await listSidebarRooms();
  return NextResponse.json({ rooms });
}
