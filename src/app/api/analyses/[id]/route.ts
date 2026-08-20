import { NextResponse } from "next/server";
import {
  getAnalysisById,
  joinAnalysisAsAdmin,
  joinAnalysisAsRequester,
} from "@/lib/analysis";
import { createAccessToken, getBetaSession, hydrateBetaSession } from "@/lib/session";
import { registerAccessToken } from "@/server/socket";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const analysis = await getAnalysisById(id);
  if (!analysis) {
    return NextResponse.json({ error: "Análise não encontrada" }, { status: 404 });
  }
  return NextResponse.json({ analysis });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rawSession = await getBetaSession();
  const session = rawSession ? await hydrateBetaSession(rawSession) : null;
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { action } = body as { action?: string };

  try {
    if (action === "join-admin") {
      if (session.role !== "ADMIN") {
        return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
      }

      const analysis = await joinAnalysisAsAdmin(id, session.userId);
      if (!analysis) {
        return NextResponse.json({ error: "Análise não encontrada" }, { status: 404 });
      }

      const token = createAccessToken();
      registerAccessToken(id, session.userId, token);

      const response = NextResponse.json({
        analysis,
        access: {
          analysisId: id,
          userId: session.userId,
          role: "ADMIN",
          token,
        },
      });

      response.cookies.set(
        "sap_analysis_access",
        JSON.stringify({
          analysisId: id,
          userId: session.userId,
          role: "ADMIN",
          token,
        }),
        {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 4,
        },
      );

      return response;
    }

    if (action === "join-requester") {
      const analysis = await joinAnalysisAsRequester(id, session.userId);
      const token = createAccessToken();
      registerAccessToken(id, session.userId, token);

      const response = NextResponse.json({
        analysis,
        access: {
          analysisId: id,
          userId: session.userId,
          role: "REQUESTER",
          token,
        },
      });

      response.cookies.set(
        "sap_analysis_access",
        JSON.stringify({
          analysisId: id,
          userId: session.userId,
          role: "REQUESTER",
          token,
        }),
        {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 4,
        },
      );

      return response;
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro" },
      { status: 400 },
    );
  }
}
