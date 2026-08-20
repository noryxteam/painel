import { NextResponse } from "next/server";
import {
  getAdminDashboard,
  getLatestAnalysisForUser,
  requestAnalysis,
} from "@/lib/analysis";
import { getBetaSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getBetaSession();
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope");

  if (scope === "admin") {
    const org = await prisma.organization.findFirst();
    if (!org) return NextResponse.json({ error: "Org não encontrada" }, { status: 404 });
    const dashboard = await getAdminDashboard(org.id);
    return NextResponse.json(dashboard);
  }

  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const analysis = await getLatestAnalysisForUser(session.userId);
  return NextResponse.json({ analysis });
}

export async function POST(request: Request) {
  const session = await getBetaSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const { matchId } = body as { matchId?: string };

  if (!matchId) {
    return NextResponse.json({ error: "matchId obrigatório" }, { status: 400 });
  }

  try {
    const analysis = await requestAnalysis(matchId, session.userId);
    return NextResponse.json({ analysis });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao solicitar" },
      { status: 400 },
    );
  }
}
