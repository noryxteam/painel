import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const org = await prisma.organization.findFirst({
    include: {
      users: { where: { role: "PLAYER" } },
      matches: {
        where: { matchNumber: 159 },
        include: { playerOne: true, playerTwo: true },
      },
    },
  });

  return NextResponse.json({ org });
}
