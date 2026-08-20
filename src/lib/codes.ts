import { CODE_CHARS, CODE_LENGTH } from "./constants";
import { prisma } from "./prisma";

export function generateAnalysisCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return code;
}

export async function generateUniqueAnalysisCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateAnalysisCode();
    const existing = await prisma.analysis.findFirst({
      where: {
        OR: [{ requesterCode: code }, { targetCode: code }],
      },
      select: { id: true },
    });
    if (!existing) return code;
  }
  throw new Error("Não foi possível gerar código único");
}

export function getCodeExpiryDate(): Date {
  const hours = Number(process.env.ANALYSIS_CODE_EXPIRY_HOURS ?? 24);
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export function isCodeExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}
