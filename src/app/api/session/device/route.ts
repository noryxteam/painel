import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";
import { ensureGuestUser, normalizeDeviceId } from "@/lib/guest-user";
import {
  isSecureRequest,
  sessionCookieOptions,
  type BetaSession,
} from "@/lib/session";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { deviceId?: string };
  const deviceId = normalizeDeviceId(body.deviceId) || crypto.randomUUID();

  try {
    const user = await ensureGuestUser(deviceId);
    const session: BetaSession = {
      userId: user.id,
      userName: user.name,
      role: user.role,
    };
    const response = NextResponse.json({ session, ...session });
    response.cookies.set(
      SESSION_COOKIE,
      JSON.stringify(session),
      sessionCookieOptions(isSecureRequest(request)),
    );
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao identificar o dispositivo" },
      { status: 500 },
    );
  }
}
