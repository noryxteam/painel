import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const destination = new URL("/salas", request.url);
  const response = NextResponse.redirect(destination);

  let payload = {
    userId: "guest-local",
    userName: "teste",
    role: "PLAYER" as const,
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
