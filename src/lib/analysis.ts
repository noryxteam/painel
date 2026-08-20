import {
  AnalysisEventType,
  AnalysisResult,
  AnalysisStatus,
  Prisma,
} from "@/generated/prisma/client";
import {
  generateUniqueAnalysisCode,
  getCodeExpiryDate,
  isCodeExpired,
} from "./codes";
import { formatTime } from "./format";
import { prisma } from "./prisma";
import {
  joinRoomParticipant,
  leaveRoomParticipant,
  listRooms,
  releaseRoomForAnalysis,
  reserveAvailableRoom,
  setParticipantFlags,
  syncRoomOccupancyStatus,
} from "./rooms";

const ACTIVE_STATUSES: AnalysisStatus[] = [
  AnalysisStatus.PENDENTE,
  AnalysisStatus.AGUARDANDO_PARTICIPANTE,
  AnalysisStatus.AGUARDANDO_ANALISTA,
  AnalysisStatus.SALA_ATIVA,
  AnalysisStatus.TRANSMISSAO_ATIVA,
];

const TERMINAL_STATUSES: AnalysisStatus[] = [
  AnalysisStatus.FINALIZADA,
  AnalysisStatus.CANCELADA,
  AnalysisStatus.EXPIRADA,
  AnalysisStatus.IRREGULARIDADE,
];

export const analysisInclude = {
  match: {
    include: {
      playerOne: true,
      playerTwo: true,
    },
  },
  organization: true,
  requester: true,
  targetUser: true,
  events: {
    include: { user: true },
    orderBy: { createdAt: "asc" as const },
  },
  room: true,
} satisfies Prisma.AnalysisInclude;

export type AnalysisWithRelations = Prisma.AnalysisGetPayload<{
  include: typeof analysisInclude;
}>;

async function addEvent(
  analysisId: string,
  type: AnalysisEventType,
  userId?: string,
  metadata?: Prisma.InputJsonValue,
) {
  return prisma.analysisEvent.create({
    data: { analysisId, type, userId, metadata },
  });
}

export async function requestAnalysis(matchId: string, requesterId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { playerOne: true, playerTwo: true },
  });

  if (!match) throw new Error("Partida não encontrada");
  if (match.status !== "FINALIZADA") {
    throw new Error("A partida precisa estar finalizada");
  }

  const isPlayer =
    match.playerOneId === requesterId || match.playerTwoId === requesterId;
  if (!isPlayer) throw new Error("Jogador não pertence à partida");

  const targetUserId =
    match.playerOneId === requesterId
      ? match.playerTwoId
      : match.playerOneId;

  const existing = await prisma.analysis.findFirst({
    where: {
      matchId,
      status: { in: ACTIVE_STATUSES },
    },
  });
  if (existing) return getAnalysisById(existing.id);

  const requesterCode = await generateUniqueAnalysisCode();
  const targetCode = await generateUniqueAnalysisCode();
  const codeExpiresAt = getCodeExpiryDate();

  const analysis = await prisma.analysis.create({
    data: {
      matchId,
      organizationId: match.organizationId,
      requesterId,
      targetUserId,
      status: AnalysisStatus.AGUARDANDO_PARTICIPANTE,
      requesterCode,
      targetCode,
      codeExpiresAt,
    },
    include: analysisInclude,
  });

  await addEvent(analysis.id, AnalysisEventType.ANALISE_SOLICITADA, requesterId, {
    message: `${analysis.requester.name} solicitou análise`,
  });
  await addEvent(analysis.id, AnalysisEventType.SALA_CRIADA, requesterId);
  await addEvent(analysis.id, AnalysisEventType.CODIGO_GERADO, targetUserId, {
    targetCode,
  });

  try {
    await reserveAvailableRoom(match.organizationId, analysis.id);
  } catch (error) {
    await prisma.analysis.delete({ where: { id: analysis.id } });
    throw error;
  }

  return getAnalysisById(analysis.id);
}

export async function getAnalysisById(id: string) {
  return prisma.analysis.findUnique({
    where: { id },
    include: analysisInclude,
  });
}

export async function getAnalysisByMatch(matchId: string) {
  return prisma.analysis.findFirst({
    where: { matchId },
    orderBy: { createdAt: "desc" },
    include: analysisInclude,
  });
}

export async function getLatestAnalysisForUser(userId: string) {
  return prisma.analysis.findFirst({
    where: {
      OR: [{ requesterId: userId }, { targetUserId: userId }],
      status: { in: ACTIVE_STATUSES },
    },
    orderBy: { createdAt: "desc" },
    include: analysisInclude,
  });
}

export async function validateTargetCode(code: string, userId: string) {
  const normalized = code.trim().toUpperCase();
  const analysis = await prisma.analysis.findFirst({
    where: { targetCode: normalized },
    include: analysisInclude,
  });

  if (!analysis) {
    return { ok: false as const, error: "Código não encontrado" };
  }

  if (TERMINAL_STATUSES.includes(analysis.status)) {
    return { ok: false as const, error: "Esta análise já foi encerrada" };
  }

  if (isCodeExpired(analysis.codeExpiresAt)) {
    if (analysis.status !== AnalysisStatus.EXPIRADA) {
      await prisma.analysis.update({
        where: { id: analysis.id },
        data: { status: AnalysisStatus.EXPIRADA },
      });
      await addEvent(analysis.id, AnalysisEventType.CODIGO_EXPIRADO);
      await releaseRoomForAnalysis(analysis.id);
    }
    return { ok: false as const, error: "Código expirado" };
  }

  if (analysis.targetUserId !== userId) {
    return {
      ok: false as const,
      error: "Este código não pertence ao jogador atual",
    };
  }

  if (analysis.targetCodeUsed) {
    const accessStillValid = ACTIVE_STATUSES.includes(analysis.status);
    if (!accessStillValid) {
      return { ok: false as const, error: "Código já utilizado" };
    }
  }

  return { ok: true as const, analysis };
}

export async function joinAnalysisAsTarget(analysisId: string, userId: string) {
  const analysis = await getAnalysisById(analysisId);
  if (!analysis) throw new Error("Análise não encontrada");

  if (analysis.targetUserId !== userId) {
    throw new Error("Acesso negado");
  }

  if (TERMINAL_STATUSES.includes(analysis.status)) {
    throw new Error("Análise encerrada");
  }

  if (isCodeExpired(analysis.codeExpiresAt)) {
    throw new Error("Código expirado");
  }

  const updates: Prisma.AnalysisUpdateInput = {};
  if (!analysis.targetCodeUsed) {
    updates.targetCodeUsed = true;
    updates.targetCodeUsedAt = new Date();
  }

  const hasTargetJoined = analysis.events.some(
    (e) =>
      e.type === AnalysisEventType.PARTICIPANTE_ENTROU &&
      e.userId === analysis.targetUserId,
  );

  if (!hasTargetJoined) {
    await addEvent(analysisId, AnalysisEventType.PARTICIPANTE_ENTROU, userId, {
      message: `${analysis.targetUser.name} entrou`,
    });
  }

  const requesterJoined = analysis.events.some(
    (e) =>
      e.type === AnalysisEventType.ANALISTA_ENTROU &&
      e.userId === analysis.requesterId,
  );

  let nextStatus = analysis.status;
  if (requesterJoined) {
    nextStatus = AnalysisStatus.SALA_ATIVA;
  } else if (analysis.status === AnalysisStatus.AGUARDANDO_PARTICIPANTE) {
    nextStatus = AnalysisStatus.AGUARDANDO_ANALISTA;
  }

  updates.status = nextStatus;
  if (!analysis.startedAt) updates.startedAt = new Date();

  await prisma.analysis.update({ where: { id: analysisId }, data: updates });

  if (analysis.roomId) {
    await joinRoomParticipant({
      roomId: analysis.roomId,
      userId,
      role: "TARGET",
    });
    await syncRoomOccupancyStatus(analysis.roomId);
  } else {
    const reserved = await reserveAvailableRoom(
      analysis.organizationId,
      analysisId,
    );
    await joinRoomParticipant({
      roomId: reserved.id,
      userId,
      role: "TARGET",
    });
    await syncRoomOccupancyStatus(reserved.id);
  }

  return getAnalysisById(analysisId);
}

export async function joinAnalysisAsRequester(
  analysisId: string,
  userId: string,
) {
  const analysis = await getAnalysisById(analysisId);
  if (!analysis) throw new Error("Análise não encontrada");

  if (analysis.requesterId !== userId) {
    throw new Error("Acesso negado");
  }

  if (TERMINAL_STATUSES.includes(analysis.status)) {
    throw new Error("Análise encerrada");
  }

  const hasRequesterJoined = analysis.events.some(
    (e) =>
      e.type === AnalysisEventType.ANALISTA_ENTROU &&
      e.userId === analysis.requesterId,
  );

  if (!hasRequesterJoined) {
    await addEvent(analysisId, AnalysisEventType.ANALISTA_ENTROU, userId, {
      message: `${analysis.requester.name} entrou`,
    });
  }

  const targetJoined = analysis.events.some(
    (e) =>
      e.type === AnalysisEventType.PARTICIPANTE_ENTROU &&
      e.userId === analysis.targetUserId,
  );

  let nextStatus = analysis.status;
  if (targetJoined) {
    nextStatus = AnalysisStatus.SALA_ATIVA;
  } else {
    nextStatus = AnalysisStatus.AGUARDANDO_PARTICIPANTE;
  }

  await prisma.analysis.update({
    where: { id: analysisId },
    data: {
      status: nextStatus,
      startedAt: analysis.startedAt ?? new Date(),
    },
  });

  if (analysis.roomId) {
    await joinRoomParticipant({
      roomId: analysis.roomId,
      userId,
      role: "REQUESTER",
    });
    await syncRoomOccupancyStatus(analysis.roomId);
  } else {
    const reserved = await reserveAvailableRoom(
      analysis.organizationId,
      analysisId,
    );
    await joinRoomParticipant({
      roomId: reserved.id,
      userId,
      role: "REQUESTER",
    });
    await syncRoomOccupancyStatus(reserved.id);
  }

  return getAnalysisById(analysisId);
}

export async function joinAnalysisAsAdmin(analysisId: string, userId: string) {
  const analysis = await getAnalysisById(analysisId);
  if (!analysis) throw new Error("Análise não encontrada");

  if (!analysis.roomId) {
    const reserved = await reserveAvailableRoom(
      analysis.organizationId,
      analysisId,
    );
    await joinRoomParticipant({
      roomId: reserved.id,
      userId,
      role: "ADMIN",
    });
    await syncRoomOccupancyStatus(reserved.id);
    return getAnalysisById(analysisId);
  }

  await joinRoomParticipant({
    roomId: analysis.roomId,
    userId,
    role: "ADMIN",
  });
  await syncRoomOccupancyStatus(analysis.roomId);
  return getAnalysisById(analysisId);
}

export async function startTransmission(analysisId: string, userId: string) {
  const analysis = await getAnalysisById(analysisId);
  if (!analysis) throw new Error("Análise não encontrada");
  if (analysis.targetUserId !== userId) {
    throw new Error("Somente o jogador analisado pode transmitir");
  }

  await addEvent(
    analysisId,
    AnalysisEventType.TRANSMISSAO_INICIADA,
    userId,
    {
      message: `${analysis.targetUser.name} iniciou transmissão`,
    },
  );

  await prisma.analysis.update({
    where: { id: analysisId },
    data: { status: AnalysisStatus.TRANSMISSAO_ATIVA },
  });

  if (analysis.roomId) {
    await setParticipantFlags(analysis.roomId, userId, { screenSharing: true });
    await syncRoomOccupancyStatus(analysis.roomId, { sharing: true });
  }
}

export async function stopTransmission(analysisId: string, userId: string) {
  const analysis = await getAnalysisById(analysisId);
  if (!analysis) throw new Error("Análise não encontrada");
  if (analysis.targetUserId !== userId) {
    throw new Error("Somente o jogador analisado pode encerrar transmissão");
  }

  await addEvent(
    analysisId,
    AnalysisEventType.TRANSMISSAO_ENCERRADA,
    userId,
    {
      message: `${analysis.targetUser.name} encerrou transmissão`,
    },
  );

  await prisma.analysis.update({
    where: { id: analysisId },
    data: { status: AnalysisStatus.SALA_ATIVA },
  });

  if (analysis.roomId) {
    await setParticipantFlags(analysis.roomId, userId, { screenSharing: false });
    await syncRoomOccupancyStatus(analysis.roomId);
  }
}

export async function leaveAnalysisSession(
  analysisId: string,
  userId: string,
  options?: { kicked?: boolean },
) {
  const analysis = await getAnalysisById(analysisId);
  if (!analysis?.roomId) return analysis;

  await leaveRoomParticipant(analysis.roomId, userId);
  await addEvent(
    analysisId,
    options?.kicked
      ? AnalysisEventType.PARTICIPANTE_REMOVIDO
      : AnalysisEventType.PARTICIPANTE_SAIU,
    userId,
  );

  if (
    analysis.targetUserId === userId &&
    analysis.status === AnalysisStatus.TRANSMISSAO_ATIVA
  ) {
    await prisma.analysis.update({
      where: { id: analysisId },
      data: { status: AnalysisStatus.SALA_ATIVA },
    });
    await syncRoomOccupancyStatus(analysis.roomId, { problem: true });
    return getAnalysisById(analysisId);
  }

  await syncRoomOccupancyStatus(analysis.roomId);
  return getAnalysisById(analysisId);
}

export async function finalizeAnalysis(
  analysisId: string,
  userId: string,
  role: "REQUESTER" | "ADMIN",
) {
  const analysis = await getAnalysisById(analysisId);
  if (!analysis) throw new Error("Análise não encontrada");

  if (role === "REQUESTER" && analysis.requesterId !== userId) {
    throw new Error("Acesso negado");
  }

  await addEvent(analysisId, AnalysisEventType.ANALISE_FINALIZADA, userId);

  await prisma.analysis.update({
    where: { id: analysisId },
    data: {
      status: AnalysisStatus.FINALIZADA,
      endedAt: new Date(),
    },
  });

  await releaseRoomForAnalysis(analysisId);
}

export async function setAnalysisResult(
  analysisId: string,
  result: AnalysisResult,
  adminName: string,
) {
  const analysis = await getAnalysisById(analysisId);
  if (!analysis) throw new Error("Análise não encontrada");

  const statusMap: Record<AnalysisResult, AnalysisStatus> = {
    [AnalysisResult.APROVADO]: AnalysisStatus.FINALIZADA,
    [AnalysisResult.IRREGULARIDADE]: AnalysisStatus.IRREGULARIDADE,
    [AnalysisResult.CANCELADA]: AnalysisStatus.CANCELADA,
  };

  const eventMap: Record<AnalysisResult, AnalysisEventType> = {
    [AnalysisResult.APROVADO]: AnalysisEventType.RESULTADO_REGISTRADO,
    [AnalysisResult.IRREGULARIDADE]:
      AnalysisEventType.IRREGULARIDADE_REGISTRADA,
    [AnalysisResult.CANCELADA]: AnalysisEventType.ANALISE_CANCELADA,
  };

  await addEvent(analysisId, eventMap[result], undefined, {
    result,
    responsible: adminName,
    time: formatTime(new Date()),
  });

  await prisma.analysis.update({
    where: { id: analysisId },
    data: {
      result,
      resultBy: adminName,
      resultAt: new Date(),
      status: statusMap[result],
      endedAt: analysis.endedAt ?? new Date(),
    },
  });

  await releaseRoomForAnalysis(analysisId);

  return getAnalysisById(analysisId);
}

export async function getAdminDashboard(organizationId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [analyses, todayCount, ongoing, pending, finished, rooms] =
    await Promise.all([
      prisma.analysis.findMany({
        where: { organizationId },
        include: analysisInclude,
        orderBy: { createdAt: "desc" },
      }),
      prisma.analysis.count({
        where: { organizationId, createdAt: { gte: today } },
      }),
      prisma.analysis.count({
        where: {
          organizationId,
          status: {
            in: [
              AnalysisStatus.SALA_ATIVA,
              AnalysisStatus.TRANSMISSAO_ATIVA,
              AnalysisStatus.AGUARDANDO_ANALISTA,
              AnalysisStatus.AGUARDANDO_PARTICIPANTE,
            ],
          },
        },
      }),
      prisma.analysis.count({
        where: {
          organizationId,
          status: {
            in: [
              AnalysisStatus.PENDENTE,
              AnalysisStatus.AGUARDANDO_PARTICIPANTE,
              AnalysisStatus.AGUARDANDO_ANALISTA,
            ],
          },
        },
      }),
      prisma.analysis.count({
        where: {
          organizationId,
          status: AnalysisStatus.FINALIZADA,
        },
      }),
      listRooms(organizationId),
    ]);

  const liveRooms = rooms.filter((room) => room.status === "TRANSMISSAO_ATIVA").length;
  const waitingRooms = rooms.filter(
    (room) =>
      room.status === "AGUARDANDO_PARTICIPANTES" || room.status === "EM_ANALISE",
  ).length;
  const availableRooms = rooms.filter((room) => room.status === "DISPONIVEL").length;
  const problemRooms = rooms.filter((room) => room.status === "COM_PROBLEMA").length;

  return {
    analyses,
    rooms,
    stats: {
      todayCount,
      ongoing,
      pending,
      finished,
      liveRooms,
      waitingRooms,
      availableRooms,
      problemRooms,
    },
  };
}

export { getEventLabel } from "./event-labels";
