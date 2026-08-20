import { NextResponse } from "next/server";
import {
  joinAnalysisAsTarget,
  setAnalysisResult,
  validateTargetCode,
} from "@/lib/analysis";
import { createAccessToken, getBetaSession, hydrateBetaSession } from "@/lib/session";
import { registerAccessToken } from "@/server/socket";
import { AnalysisResult } from "@/generated/prisma/client";
import { ACCESS_COOKIE } from "@/lib/constants";

export async function POST(request: Request) {
  const rawSession = await getBetaSession();
  const session = rawSession ? await hydrateBetaSession(rawSession) : null;
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const { code, action, analysisId, result } = body as {
    code?: string;
    action?: string;
    analysisId?: string;
    result?: AnalysisResult;
  };

  if (action === "validate" && code) {
    const validation = await validateTargetCode(code, session.userId);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    return NextResponse.json({ analysis: validation.analysis });
  }

  if (action === "enter-code" && code) {
    const validation = await validateTargetCode(code, session.userId);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    try {
      const joined = await joinAnalysisAsTarget(validation.analysis.id, session.userId);
      const token = createAccessToken();
      registerAccessToken(validation.analysis.id, session.userId, token);
      const access = {
        analysisId: validation.analysis.id,
        userId: session.userId,
        role: "TARGET" as const,
        token,
      };
      const response = NextResponse.json({ analysis: joined, access });
      response.cookies.set(ACCESS_COOKIE, JSON.stringify(access), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 4,
      });
      return response;
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Erro ao entrar" },
        { status: 400 },
      );
    }
  }

  if (action === "join-target" && analysisId) {
    try {
      const analysis = await joinAnalysisAsTarget(analysisId, session.userId);
      const token = createAccessToken();
      registerAccessToken(analysisId, session.userId, token);

      const response = NextResponse.json({
        analysis,
        access: {
          analysisId,
          userId: session.userId,
          role: "TARGET",
          token,
        },
      });

      response.cookies.set(
        "sap_analysis_access",
        JSON.stringify({
          analysisId,
          userId: session.userId,
          role: "TARGET",
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
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Erro ao entrar" },
        { status: 400 },
      );
    }
  }

  if (action === "set-result" && analysisId && result) {
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    try {
      const analysis = await setAnalysisResult(
        analysisId,
        result,
        session.userName,
      );
      return NextResponse.json({ analysis });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Erro" },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
