import {
  AnalysisEventType,
  Prisma,
  RoomParticipantRole,
  RoomStatus,
} from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { PERMANENT_ROOM_COUNT, roomTitle } from "./room-names";

export { PERMANENT_ROOM_COUNT };
export const DEFAULT_MAX_PARTICIPANTS = 10;

const IN_USE_STATUSES: RoomStatus[] = [
  RoomStatus.AGUARDANDO_PARTICIPANTES,
  RoomStatus.EM_ANALISE,
  RoomStatus.TRANSMISSAO_ATIVA,
  RoomStatus.ENCERRANDO,
];

export const roomListInclude = {
  currentAnalysis: {
    include: {
      match: true,
      requester: true,
      targetUser: true,
    },
  },
  participants: {
    where: { leftAt: null },
    include: { user: true },
    orderBy: { joinedAt: "asc" as const },
  },
} satisfies Prisma.AnalysisRoomInclude;

function padRoomName(number: number) {
  return roomTitle(number);
}

const ensuredOrgs = new Set<string>();

export type SidebarRoom = {
  id: string;
  name: string;
  number: number;
  maxParticipants: number;
  occupiedAt: string | null;
  organizationId: string;
  participants: Array<{ id: string; userId: string; screenSharing: boolean }>;
};

export async function ensurePermanentRooms(organizationId: string) {
  const existing = await prisma.analysisRoom.findMany({
    where: { organizationId },
    select: { id: true, number: true, name: true },
  });
  const present = new Set(existing.map((room) => room.number));
  const missing = Array.from({ length: PERMANENT_ROOM_COUNT }, (_, i) => i + 1).filter(
    (number) => !present.has(number),
  );

  if (missing.length > 0) {
    await prisma.analysisRoom.createMany({
      data: missing.map((number) => ({
        organizationId,
        number,
        name: padRoomName(number),
        maxParticipants: DEFAULT_MAX_PARTICIPANTS,
        status: RoomStatus.DISPONIVEL,
      })),
    });
  }

  if (!ensuredOrgs.has(organizationId)) {
    const renamed = existing.filter(
      (room) => room.name !== padRoomName(room.number),
    );
    for (const room of renamed) {
      await prisma.analysisRoom.update({
        where: { id: room.id },
        data: { name: padRoomName(room.number) },
      });
    }
    ensuredOrgs.add(organizationId);
  }
}

export async function listRooms(organizationId: string) {
  await ensurePermanentRooms(organizationId);
  return prisma.analysisRoom.findMany({
    where: { organizationId },
    include: roomListInclude,
    orderBy: { number: "asc" },
  });
}

export async function listSidebarRooms(): Promise<SidebarRoom[]> {
  try {
    const mapRooms = (
      rooms: Array<{
        id: string;
        name: string;
        number: number;
        maxParticipants: number;
        occupiedAt: Date | null;
        organizationId: string;
        participants: Array<{ id: string; userId: string; screenSharing: boolean }>;
      }>,
    ): SidebarRoom[] =>
      rooms.map((room) => ({
        id: room.id,
        name: room.name,
        number: room.number,
        maxParticipants: room.maxParticipants,
        occupiedAt: room.occupiedAt?.toISOString() ?? null,
        organizationId: room.organizationId,
        participants: room.participants,
      }));

    const select = {
      id: true,
      name: true,
      number: true,
      maxParticipants: true,
      occupiedAt: true,
      organizationId: true,
      participants: {
        where: { leftAt: null },
        select: { id: true, userId: true, screenSharing: true },
        orderBy: { joinedAt: "asc" as const },
      },
    } as const;

    const org =
      (await prisma.analysisRoom.findFirst({ select: { organizationId: true } })) ??
      (await prisma.organization.findFirst({ select: { id: true } }));
    if (org) {
      await ensurePermanentRooms("organizationId" in org ? org.organizationId : org.id);
    }

    const rooms = await prisma.analysisRoom.findMany({
      select,
      orderBy: { number: "asc" },
    });

    return mapRooms(rooms);
  } catch (error) {
    console.error("listSidebarRooms", error);
    return [];
  }
}

export async function getRoomMediaInfo(roomId: string) {
  return prisma.analysisRoom.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      organizationId: true,
      name: true,
      number: true,
      maxParticipants: true,
      occupiedAt: true,
    },
  });
}

export async function getRoomById(roomId: string) {
  return prisma.analysisRoom.findUnique({
    where: { id: roomId },
    include: roomListInclude,
  });
}

export async function reserveAvailableRoom(
  organizationId: string,
  analysisId: string,
) {
  await ensurePermanentRooms(organizationId);

  return prisma.$transaction(async (tx) => {
    const analysis = await tx.analysis.findUnique({
      where: { id: analysisId },
      select: { id: true, roomId: true },
    });
    if (!analysis) throw new Error("Análise não encontrada");
    if (analysis.roomId) {
      return tx.analysisRoom.findUniqueOrThrow({
        where: { id: analysis.roomId },
      });
    }

    const occupying = await tx.analysisRoom.findUnique({
      where: { currentAnalysisId: analysisId },
    });
    if (occupying) return occupying;

    const candidates = await tx.analysisRoom.findMany({
      where: {
        organizationId,
        status: RoomStatus.DISPONIVEL,
        currentAnalysisId: null,
      },
      orderBy: { number: "asc" },
    });

    for (const candidate of candidates) {
      const claimed = await tx.analysisRoom.updateMany({
        where: {
          id: candidate.id,
          status: RoomStatus.DISPONIVEL,
          currentAnalysisId: null,
        },
        data: {
          currentAnalysisId: analysisId,
          status: RoomStatus.AGUARDANDO_PARTICIPANTES,
        },
      });

      if (claimed.count === 1) {
        await tx.analysis.update({
          where: { id: analysisId },
          data: { roomId: candidate.id },
        });
        await tx.analysisEvent.create({
          data: {
            analysisId,
            type: AnalysisEventType.SALA_RESERVADA,
            metadata: { roomName: candidate.name, roomNumber: candidate.number },
          },
        });
        return tx.analysisRoom.findUniqueOrThrow({ where: { id: candidate.id } });
      }
    }

    throw new Error("Nenhuma sala disponível no momento");
  });
}

export async function releaseRoomForAnalysis(analysisId: string) {
  const room = await prisma.analysisRoom.findUnique({
    where: { currentAnalysisId: analysisId },
  });
  if (!room) return null;

  await prisma.$transaction([
    prisma.analysisRoom.update({
      where: { id: room.id },
      data: { status: RoomStatus.ENCERRANDO },
    }),
    prisma.roomParticipant.updateMany({
      where: { roomId: room.id, leftAt: null },
      data: { leftAt: new Date(), screenSharing: false, microphoneEnabled: false },
    }),
    prisma.analysisRoom.update({
      where: { id: room.id },
      data: {
        currentAnalysisId: null,
        status: RoomStatus.DISPONIVEL,
        occupiedAt: null,
      },
    }),
  ]);

  return room;
}

export async function joinRoomParticipant(options: {
  roomId: string;
  userId: string;
  role: RoomParticipantRole;
}) {
  const room = await prisma.analysisRoom.findUnique({
    where: { id: options.roomId },
    include: { participants: { where: { leftAt: null } } },
  });
  if (!room) throw new Error("Sala não encontrada");

  const alreadyIn = room.participants.find((p) => p.userId === options.userId);
  if (alreadyIn) {
    await prisma.roomParticipant.update({
      where: { id: alreadyIn.id },
      data: {
        role: options.role,
        joinedAt: new Date(),
        leftAt: null,
      },
    });
    await syncOccupiedAt(options.roomId);
    return alreadyIn;
  }

  const user = await prisma.user.findUnique({
    where: { id: options.userId },
    select: { id: true },
  });
  if (!user) {
    throw new Error("Sessão expirada. Escolha o perfil novamente no início.");
  }

  if (room.participants.length >= room.maxParticipants) {
    throw new Error("Sala lotada");
  }

  const otherRooms = await prisma.roomParticipant.findMany({
    where: {
      userId: options.userId,
      leftAt: null,
      roomId: { not: options.roomId },
    },
    select: { roomId: true },
  });

  await prisma.roomParticipant.updateMany({
    where: {
      userId: options.userId,
      leftAt: null,
      roomId: { not: options.roomId },
    },
    data: {
      leftAt: new Date(),
      microphoneEnabled: false,
      screenSharing: false,
    },
  });

  await Promise.all(otherRooms.map((item) => syncOccupiedAt(item.roomId)));

  const created = await prisma.roomParticipant.create({
    data: {
      roomId: options.roomId,
      userId: options.userId,
      role: options.role,
    },
  });
  await syncOccupiedAt(options.roomId);
  return created;
}

export async function leaveRoomParticipant(roomId: string, userId: string) {
  try {
    await prisma.roomParticipant.updateMany({
      where: { roomId, userId, leftAt: null },
      data: {
        leftAt: new Date(),
        microphoneEnabled: false,
        screenSharing: false,
      },
    });
    await syncOccupiedAt(roomId);
  } catch (error) {
    console.error("leaveRoomParticipant", error);
  }
}

export async function syncOccupiedAt(roomId: string) {
  const remaining = await prisma.roomParticipant.findMany({
    where: { roomId, leftAt: null },
    select: { joinedAt: true },
    orderBy: { joinedAt: "asc" },
  });
  await prisma.analysisRoom.update({
    where: { id: roomId },
    data: {
      occupiedAt: remaining[0]?.joinedAt ?? null,
    },
  });
}

export async function setParticipantFlags(
  roomId: string,
  userId: string,
  flags: { microphoneEnabled?: boolean; screenSharing?: boolean },
) {
  await prisma.roomParticipant.updateMany({
    where: { roomId, userId, leftAt: null },
    data: flags,
  });
}

export async function syncRoomOccupancyStatus(
  roomId: string,
  extras?: { sharing?: boolean; problem?: boolean },
) {
  const room = await prisma.analysisRoom.findUnique({
    where: { id: roomId },
    include: { participants: { where: { leftAt: null } } },
  });
  if (!room) return null;
  if (!room.currentAnalysisId) {
    return prisma.analysisRoom.update({
      where: { id: roomId },
      data: { status: RoomStatus.DISPONIVEL },
    });
  }

  let status: RoomStatus = RoomStatus.AGUARDANDO_PARTICIPANTES;
  if (extras?.problem) status = RoomStatus.COM_PROBLEMA;
  else if (extras?.sharing) status = RoomStatus.TRANSMISSAO_ATIVA;
  else if (room.participants.length >= 2) status = RoomStatus.EM_ANALISE;
  else if (room.participants.length === 1) status = RoomStatus.AGUARDANDO_PARTICIPANTES;

  return prisma.analysisRoom.update({
    where: { id: roomId },
    data: { status },
  });
}

export function isRoomInUse(status: RoomStatus) {
  return IN_USE_STATUSES.includes(status);
}

export function roomPresenceTone(status: RoomStatus) {
  if (status === RoomStatus.DISPONIVEL) return "success" as const;
  if (status === RoomStatus.COM_PROBLEMA) return "danger" as const;
  return "warning" as const;
}
