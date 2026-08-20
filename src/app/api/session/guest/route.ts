import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import type { BetaSession } from "@/lib/session";

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

  let payload: BetaSession = {
    userId: "guest-local",
    userName: "teste",
    role: "PLAYER",
  };

  try {
    const user =
      (await prisma.user.findFirst({
        where: { name: "Pedro" },
        select: { id: true, name: true, role: true },
      })) ??
      (await prisma.user.findFirst({
        select: { id: true, name: true, role: true },
      }));
    if (user) {
      payload = {
        userId: user.id,
        userName: user.name,
        role: user.role,
      };
    }
  } catch (error) {
    console.error("guest session", error);
  }

  response.cookies.set(SESSION_COOKIE, JSON.stringify(payload), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return response;
}
