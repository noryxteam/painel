import { NextResponse } from "next/server";
import { getAnalysisByMatch } from "@/lib/analysis";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("matchId");
  if (!matchId) {
    return NextResponse.json({ error: "matchId obrigatório" }, { status: 400 });
  }

  const analysis = await getAnalysisByMatch(matchId);
  return NextResponse.json({ analysis });
}
