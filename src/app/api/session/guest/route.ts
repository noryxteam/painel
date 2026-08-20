import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";
import { ensureGuestUser } from "@/lib/guest-user";
import {
  isSecureRequest,
  sessionCookieOptions,
  type BetaSession,
} from "@/lib/session";

function publicOrigin(request: Request) {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(
    /\/$/,
    "",
  );
}

export async function GET(request: Request) {
  const destination = new URL("/salas", `${publicOrigin(request)}/`);
  const response = NextResponse.redirect(destination);
  const cookie = sessionCookieOptions(isSecureRequest(request));

  try {
    const user = await ensureGuestUser(crypto.randomUUID());
    const payload: BetaSession = {
      userId: user.id,
      userName: user.name,
      role: user.role,
    };
    response.cookies.set(SESSION_COOKIE, JSON.stringify(payload), cookie);
  } catch (error) {
    console.error("guest session", error);
    const payload: BetaSession = {
      userId: `guest-${crypto.randomUUID()}`,
      userName: "teste",
      role: "PLAYER",
    };
    response.cookies.set(SESSION_COOKIE, JSON.stringify(payload), cookie);
  }

  return response;
}
