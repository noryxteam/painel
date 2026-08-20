import { cookies } from "next/headers";
import { ACCESS_COOKIE, ROOM_COOKIE, SESSION_COOKIE } from "./constants";
import { prisma } from "./prisma";

export interface BetaSession {
  userId: string;
  userName: string;
  role: "PLAYER" | "ADMIN";
}

export interface AnalysisAccess {
  analysisId: string;
  userId: string;
  role: "REQUESTER" | "TARGET" | "ADMIN";
  token: string;
}

export async function getBetaSession(): Promise<BetaSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BetaSession;
  } catch {
    return null;
  }
}

export async function hydrateBetaSession(
  session: BetaSession,
): Promise<BetaSession | null> {
  const byId = await prisma.user.findUnique({
    where: { id: session.userId },
  });
  if (byId) {
    return {
      userId: byId.id,
      userName: byId.name,
      role: byId.role,
    };
  }

  if (!session.userName) return null;

  const byName = await prisma.user.findFirst({
    where: { name: session.userName },
  });
  if (!byName) return null;

  return {
    userId: byName.id,
    userName: byName.name,
    role: byName.role,
  };
}

export interface RoomAccess {
  roomId: string;
  userId: string;
  role: "REQUESTER" | "TARGET" | "ADMIN";
  token: string;
}

export async function getRoomAccess(roomId?: string): Promise<RoomAccess | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ROOM_COOKIE)?.value;
  if (!raw) return null;
  try {
    const access = JSON.parse(raw) as RoomAccess;
    if (roomId && access.roomId !== roomId) return null;
    return access;
  } catch {
    return null;
  }
}

export async function getAnalysisAccess(
  analysisId?: string,
): Promise<AnalysisAccess | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ACCESS_COOKIE)?.value;
  if (!raw) return null;
  try {
    const access = JSON.parse(raw) as AnalysisAccess;
    if (analysisId && access.analysisId !== analysisId) return null;
    return access;
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = 60 * 60 * 24 * 365;

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

export function createAccessToken(): string {
  return crypto.randomUUID();
}
