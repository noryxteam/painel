import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  AnalysisEventType,
  AnalysisStatus,
  PrismaClient,
  RoomStatus,
} from "../src/generated/prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

function getCodeExpiryDate(): Date {
  const hours = Number(process.env.ANALYSIS_CODE_EXPIRY_HOURS ?? 24);
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

async function main() {
  await prisma.analysisEvent.deleteMany();
  await prisma.roomParticipant.deleteMany();
  await prisma.analysis.deleteMany();
  await prisma.analysisRoom.deleteMany();
  await prisma.match.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const org = await prisma.organization.create({
    data: { name: "TOKIO" },
  });

  await prisma.analysisRoom.createMany({
    data: Array.from({ length: 54 }, (_, index) => {
      const number = index + 1;
      return {
        organizationId: org.id,
        number,
        name:
          number <= 40
            ? `MOB ${String(number).padStart(2, "0")}`
            : number <= 50
              ? `EMU ${String(number - 40).padStart(2, "0")}`
              : `SUP ${String(number - 50).padStart(2, "0")}`,
        maxParticipants: 10,
        status: RoomStatus.DISPONIVEL,
      };
    }),
  });

  const ygor = await prisma.user.create({
    data: {
      name: "Ygor",
      role: "PLAYER",
      organizationId: org.id,
    },
  });

  const pedro = await prisma.user.create({
    data: {
      name: "Pedro",
      role: "PLAYER",
      organizationId: org.id,
    },
  });

  const admin = await prisma.user.create({
    data: {
      name: "Administrador",
      role: "ADMIN",
      organizationId: org.id,
    },
  });

  const lucas = await prisma.user.create({
    data: { name: "Lucas", role: "PLAYER", organizationId: org.id },
  });

  const joao = await prisma.user.create({
    data: { name: "João", role: "PLAYER", organizationId: org.id },
  });

  const ruan = await prisma.user.create({
    data: { name: "Ruan", role: "PLAYER", organizationId: org.id },
  });

  const carlos = await prisma.user.create({
    data: { name: "Carlos", role: "PLAYER", organizationId: org.id },
  });

  const match159 = await prisma.match.create({
    data: {
      matchNumber: 159,
      organizationId: org.id,
      playerOneId: ygor.id,
      playerTwoId: pedro.id,
      style: "2v2 Mobile",
      value: "R$ 20,00",
      status: "FINALIZADA",
    },
  });

  await prisma.match.createMany({
    data: [
      {
        matchNumber: 158,
        organizationId: org.id,
        playerOneId: lucas.id,
        playerTwoId: joao.id,
        style: "1v1 Mobile",
        value: "R$ 10,00",
        status: "FINALIZADA",
      },
      {
        matchNumber: 157,
        organizationId: org.id,
        playerOneId: ruan.id,
        playerTwoId: carlos.id,
        style: "2v2 Mobile",
        value: "R$ 15,00",
        status: "FINALIZADA",
      },
    ],
  });

  const match158 = await prisma.match.findFirst({
    where: { matchNumber: 158, organizationId: org.id },
  });
  const match157 = await prisma.match.findFirst({
    where: { matchNumber: 157, organizationId: org.id },
  });

  const readyAnalysis = await prisma.analysis.create({
    data: {
      matchId: match159.id,
      organizationId: org.id,
      requesterId: ygor.id,
      targetUserId: pedro.id,
      status: AnalysisStatus.AGUARDANDO_PARTICIPANTE,
      requesterCode: "YG159",
      targetCode: "PD51X",
      codeExpiresAt: getCodeExpiryDate(),
    },
  });

  const room03 = await prisma.analysisRoom.findFirstOrThrow({
    where: { organizationId: org.id, number: 3 },
  });

  await prisma.analysisRoom.update({
    where: { id: room03.id },
    data: {
      currentAnalysisId: readyAnalysis.id,
      status: RoomStatus.AGUARDANDO_PARTICIPANTES,
    },
  });

  await prisma.analysis.update({
    where: { id: readyAnalysis.id },
    data: { roomId: room03.id },
  });

  const finishedAnalysis = await prisma.analysis.create({
    data: {
      matchId: match158!.id,
      organizationId: org.id,
      requesterId: lucas.id,
      targetUserId: joao.id,
      status: AnalysisStatus.FINALIZADA,
      requesterCode: "LC158",
      targetCode: "JO158",
      targetCodeUsed: true,
      codeExpiresAt: getCodeExpiryDate(),
      startedAt: new Date(Date.now() - 3600000),
      endedAt: new Date(Date.now() - 3000000),
      result: "APROVADO",
      resultBy: "Administrador",
      resultAt: new Date(Date.now() - 3000000),
    },
  });

  const pendingAnalysis = await prisma.analysis.create({
    data: {
      matchId: match157!.id,
      organizationId: org.id,
      requesterId: ruan.id,
      targetUserId: carlos.id,
      status: AnalysisStatus.PENDENTE,
      requesterCode: "RU157",
      targetCode: "CA157",
      codeExpiresAt: getCodeExpiryDate(),
    },
  });

  const seedEvents = async (
    analysisId: string,
    events: Array<{
      type: AnalysisEventType;
      userId?: string;
      minutesAgo: number;
    }>,
  ) => {
    for (const event of events) {
      await prisma.analysisEvent.create({
        data: {
          analysisId,
          type: event.type,
          userId: event.userId,
          createdAt: new Date(Date.now() - event.minutesAgo * 60000),
        },
      });
    }
  };

  await seedEvents(readyAnalysis.id, [
    { type: "ANALISE_SOLICITADA", userId: ygor.id, minutesAgo: 10 },
    { type: "SALA_CRIADA", userId: ygor.id, minutesAgo: 10 },
    { type: "SALA_RESERVADA", userId: ygor.id, minutesAgo: 10 },
    { type: "CODIGO_GERADO", userId: pedro.id, minutesAgo: 10 },
  ]);

  await seedEvents(finishedAnalysis.id, [
    { type: "ANALISE_SOLICITADA", userId: lucas.id, minutesAgo: 120 },
    { type: "SALA_CRIADA", userId: lucas.id, minutesAgo: 120 },
    { type: "PARTICIPANTE_ENTROU", userId: joao.id, minutesAgo: 119 },
    { type: "ANALISTA_ENTROU", userId: lucas.id, minutesAgo: 118 },
    { type: "TRANSMISSAO_INICIADA", userId: joao.id, minutesAgo: 117 },
    { type: "TRANSMISSAO_ENCERRADA", userId: joao.id, minutesAgo: 105 },
    { type: "ANALISE_FINALIZADA", userId: lucas.id, minutesAgo: 104 },
    { type: "RESULTADO_REGISTRADO", minutesAgo: 104 },
  ]);

  console.log("Seed concluído:");
  console.log(`- Organização: ${org.name}`);
  console.log(`- Ygor ID: ${ygor.id}`);
  console.log(`- Pedro ID: ${pedro.id}`);
  console.log(`- Admin ID: ${admin.id}`);
  console.log(`- Partida #159 ID: ${match159.id}`);
  console.log(`- Análise pronta ID: ${readyAnalysis.id}`);
  console.log(`- Código Pedro: PD51X`);
  console.log(`- Sala reservada: ${room03.name}`);
  console.log(`- Análises admin: #159, #158, #157`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
