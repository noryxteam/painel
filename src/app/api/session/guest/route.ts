import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user =
    (await prisma.user.findFirst({
      where: { name: "Pedro" },
      select: { id: true, name: true, role: true },
    })) ??
    (await prisma.user.findFirst({
      select: { id: true, name: true, role: true },
    }));

  const destination = new URL("/salas", request.url);
  const response = NextResponse.redirect(destination);
  if (!user) return response;

  response.cookies.set(
    SESSION_COOKIE,
    JSON.stringify({
      userId: user.id,
      userName: user.name,
      role: user.role,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    },
  );
  return response;
}
