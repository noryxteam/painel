import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { hydrateBetaSession, type BetaSession } from "@/lib/session";

function withSessionCookie(response: NextResponse, session: BetaSession) {
  response.cookies.set(SESSION_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return response;
}

export async function GET() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return NextResponse.json({ session: null });

  try {
    const session = JSON.parse(raw) as BetaSession;
    const live = await hydrateBetaSession(session);
    if (!live) {
      const response = NextResponse.json({ session: null });
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    const response = NextResponse.json({ session: live });
    if (live.userId !== session.userId) {
      return withSessionCookie(response, live);
    }
    return response;
  } catch {
    return NextResponse.json({ session: null });
  }
}

const BETA_USER_NAMES: Record<string, string> = {
  ygor: "Ygor",
  pedro: "Pedro",
  admin: "Administrador",
};

export async function POST(request: Request) {
  const body = await request.json();
  const { userKey } = body as { userKey?: string };
  const userName = userKey ? BETA_USER_NAMES[userKey] : undefined;

  if (!userName) {
    return NextResponse.json({ error: "Perfil inválido" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { name: userName },
  });

  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  const session = {
    userId: user.id,
    userName: user.name,
    role: user.role,
  };

  return withSessionCookie(NextResponse.json({ session }), session);
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete("sap_analysis_access");
  return response;
}
