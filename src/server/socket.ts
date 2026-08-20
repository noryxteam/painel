import type { Server as HTTPServer } from "http";
import type { Socket, Server as SocketIOServer } from "socket.io";
import { Server } from "socket.io";
import {
  finalizeAnalysis,
  getAnalysisById,
  leaveAnalysisSession,
  startTransmission,
  stopTransmission,
} from "@/lib/analysis";
import {
  getRoomById,
  getRoomMediaInfo,
  joinRoomParticipant,
  leaveRoomParticipant,
  setParticipantFlags,
} from "@/lib/rooms";

interface JoinPayload {
  analysisId: string;
  userId: string;
  userName: string;
  role: "REQUESTER" | "TARGET" | "ADMIN";
  token: string;
}

type LeaveableSocket = {
  data: Record<string, unknown>;
  emit: Socket["emit"];
};

interface SignalPayload {
  analysisId: string;
  targetUserId?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

const roomTokens = new Map<string, Map<string, string>>();
let ioServer: SocketIOServer | null = null;

function analysisRoomKey(analysisId: string) {
  return `analysis:${analysisId}`;
}

function voiceRoomKey(roomId: string) {
  return `voice:${roomId}`;
}

function orgKey(organizationId: string) {
  return `org:${organizationId}`;
}

function mediaKeyOf(socket: { data: Record<string, unknown> }) {
  return (socket.data.mediaRoomKey as string | undefined) ?? "";
}

function setRoomToken(analysisId: string, userId: string, token: string) {
  if (!roomTokens.has(analysisId)) {
    roomTokens.set(analysisId, new Map());
  }
  roomTokens.get(analysisId)!.set(userId, token);
}

function verifyRoomToken(
  analysisId: string,
  userId: string,
  token: string,
): boolean {
  return roomTokens.get(analysisId)?.get(userId) === token;
}

async function emitToUser(
  io: SocketIOServer,
  roomKey: string,
  userId: string,
  event: string,
  payload: unknown,
) {
  if (!roomKey) return;
  const sockets = await io.in(roomKey).fetchSockets();
  const target = sockets.find((item) => item.data.userId === userId);
  target?.emit(event, payload);
}

export function initSocketServer(httpServer: HTTPServer): SocketIOServer {
  const io = new Server(httpServer, {
    path: "/api/socket",
    cors: {
      origin: true,
      methods: ["GET", "POST"],
    },
  });
  ioServer = io;

  io.on("connection", (socket: Socket) => {
    socket.on("watch-org", async (organizationId: string) => {
      if (!organizationId) return;
      await socket.join(orgKey(organizationId));
    });

    socket.on("register-access", (payload: JoinPayload) => {
      setRoomToken(payload.analysisId, payload.userId, payload.token);
    });

    socket.on("join-analysis", async (payload: JoinPayload, ack) => {
      try {
        if (
          !verifyRoomToken(payload.analysisId, payload.userId, payload.token)
        ) {
          ack?.({ ok: false, error: "Token inválido" });
          return;
        }

        const analysis = await getAnalysisById(payload.analysisId);
        if (!analysis) {
          ack?.({ ok: false, error: "Análise não encontrada" });
          return;
        }

        const allowed =
          payload.role === "ADMIN" ||
          analysis.requesterId === payload.userId ||
          analysis.targetUserId === payload.userId;
        if (!allowed) {
          ack?.({ ok: false, error: "Não autorizado nesta sala" });
          return;
        }

        const mediaRoomKey = analysis.roomId
          ? voiceRoomKey(analysis.roomId)
          : analysisRoomKey(payload.analysisId);
        await socket.join(mediaRoomKey);
        await socket.join(analysisRoomKey(payload.analysisId));
        await socket.join(orgKey(analysis.organizationId));

        socket.data.analysisId = payload.analysisId;
        socket.data.roomId = analysis.roomId;
        socket.data.organizationId = analysis.organizationId;
        socket.data.userId = payload.userId;
        socket.data.userName = payload.userName;
        socket.data.role = payload.role;
        socket.data.mediaRoomKey = mediaRoomKey;
        socket.data.voiceOnly = false;
        socket.data.isSharing = false;
        socket.data.micEnabled = false;
        socket.data.speaking = false;
        socket.data.deafened = false;
        socket.data.left = false;

        const participants = await liveParticipants(io, mediaRoomKey);
        io.to(mediaRoomKey).emit("participants-updated", participants);
        io.to(orgKey(analysis.organizationId)).emit("rooms-updated");
        ack?.({
          ok: true,
          participants,
          room: analysis.room,
        });
      } catch (error) {
        ack?.({
          ok: false,
          error: error instanceof Error ? error.message : "Erro ao entrar",
        });
      }
    });

    socket.on(
      "join-voice-room",
      async (
        payload: {
          roomId: string;
          userId: string;
          userName: string;
          role: "REQUESTER" | "TARGET" | "ADMIN";
          token: string;
        },
        ack,
      ) => {
        try {
          setRoomToken(`voice:${payload.roomId}`, payload.userId, payload.token);
          if (!verifyRoomToken(`voice:${payload.roomId}`, payload.userId, payload.token)) {
            ack?.({ ok: false, error: "Token inválido" });
            return;
          }
          const room = await getRoomMediaInfo(payload.roomId);
          if (!room) {
            ack?.({ ok: false, error: "Sala não encontrada" });
            return;
          }
          await joinRoomParticipant({
            roomId: payload.roomId,
            userId: payload.userId,
            role: payload.role,
          });

          const mediaRoomKey = voiceRoomKey(payload.roomId);
          const previousKey = mediaKeyOf(socket);
          if (previousKey && previousKey !== mediaRoomKey) {
            socket.leave(previousKey);
          }
          await socket.join(mediaRoomKey);
          await socket.join(orgKey(room.organizationId));

          socket.data.roomId = payload.roomId;
          socket.data.organizationId = room.organizationId;
          socket.data.userId = payload.userId;
          socket.data.userName = payload.userName;
          socket.data.role = payload.role;
          socket.data.mediaRoomKey = mediaRoomKey;
          socket.data.voiceOnly = true;
          socket.data.isSharing = false;
          socket.data.micEnabled = false;
          socket.data.speaking = false;
          socket.data.deafened = false;
          socket.data.left = false;

          const participants = await liveParticipants(io, mediaRoomKey);
          io.to(mediaRoomKey).emit("participants-updated", participants);
          io.to(orgKey(room.organizationId)).emit("rooms-updated");
          ack?.({ ok: true, participants, room });
        } catch (error) {
          ack?.({
            ok: false,
            error: error instanceof Error ? error.message : "Erro ao entrar",
          });
        }
      },
    );

    socket.on("webrtc-offer", (payload: SignalPayload) => {
      const mediaKey = mediaKeyOf(socket);
      const data = {
        ...payload,
        fromUserId: socket.data.userId,
      };
      if (payload.targetUserId) {
        void emitToUser(io, mediaKey, payload.targetUserId, "webrtc-offer", data);
        return;
      }
      socket.to(mediaKey).emit("webrtc-offer", data);
    });

    socket.on("webrtc-answer", (payload: SignalPayload) => {
      const mediaKey = mediaKeyOf(socket);
      const data = {
        ...payload,
        fromUserId: socket.data.userId,
      };
      if (payload.targetUserId) {
        void emitToUser(io, mediaKey, payload.targetUserId, "webrtc-answer", data);
        return;
      }
      socket.to(mediaKey).emit("webrtc-answer", data);
    });

    socket.on("webrtc-ice-candidate", (payload: SignalPayload) => {
      const mediaKey = mediaKeyOf(socket);
      const data = {
        ...payload,
        fromUserId: socket.data.userId,
      };
      if (payload.targetUserId) {
        void emitToUser(
          io,
          mediaKey,
          payload.targetUserId,
          "webrtc-ice-candidate",
          data,
        );
        return;
      }
      socket.to(mediaKey).emit("webrtc-ice-candidate", data);
    });

    socket.on("media-state", async (payload: {
      analysisId: string;
      micEnabled?: boolean;
      speaking?: boolean;
      deafened?: boolean;
    }) => {
      const mediaKey = mediaKeyOf(socket);
      if (payload.micEnabled !== undefined) {
        socket.data.micEnabled = payload.micEnabled;
        if (socket.data.roomId) {
          await setParticipantFlags(socket.data.roomId as string, socket.data.userId, {
            microphoneEnabled: payload.micEnabled,
          });
        }
      }
      if (payload.speaking !== undefined) {
        socket.data.speaking = payload.speaking;
      }
      if (payload.deafened !== undefined) {
        socket.data.deafened = payload.deafened;
      }
      io.to(mediaKey).emit(
        "participants-updated",
        await liveParticipants(io, mediaKey),
      );
    });

    socket.on("screen-share-start", async (payload: { analysisId: string }) => {
      const mediaKey = mediaKeyOf(socket);
      const voiceOnly = Boolean(socket.data.voiceOnly);
      if (!voiceOnly && socket.data.role !== "TARGET") return;

      socket.data.isSharing = true;
      if (socket.data.roomId) {
        await setParticipantFlags(socket.data.roomId as string, socket.data.userId as string, {
          screenSharing: true,
        });
      }

      if (!voiceOnly) {
        await startTransmission(payload.analysisId, socket.data.userId as string);
        io.to(analysisRoomKey(payload.analysisId)).emit("analysis-status", {
          status: "TRANSMISSAO_ATIVA",
        });
      }

      io.to(mediaKey).emit("screen-share-started", {
        userId: socket.data.userId,
        userName: socket.data.userName,
      });
      io.to(mediaKey).emit(
        "participants-updated",
        await liveParticipants(io, mediaKey),
      );
      if (socket.data.organizationId) {
        io.to(orgKey(socket.data.organizationId)).emit("rooms-updated");
      }
    });

    socket.on("screen-share-stop", async (payload: { analysisId: string }) => {
      const mediaKey = mediaKeyOf(socket);
      const voiceOnly = Boolean(socket.data.voiceOnly);
      if (!voiceOnly && socket.data.role !== "TARGET") return;

      socket.data.isSharing = false;
      if (socket.data.roomId) {
        await setParticipantFlags(socket.data.roomId as string, socket.data.userId as string, {
          screenSharing: false,
        });
      }

      if (!voiceOnly) {
        await stopTransmission(payload.analysisId, socket.data.userId as string);
        io.to(analysisRoomKey(payload.analysisId)).emit("analysis-status", {
          status: "SALA_ATIVA",
        });
      }

      io.to(mediaKey).emit("screen-share-stopped", {
        userId: socket.data.userId,
      });
      io.to(mediaKey).emit(
        "participants-updated",
        await liveParticipants(io, mediaKey),
      );
      if (socket.data.organizationId) {
        io.to(orgKey(socket.data.organizationId)).emit("rooms-updated");
      }
    });

    socket.on("leave-room", async (payload: { analysisId: string }) => {
      if (socket.data.voiceOnly) {
        await handleVoiceLeave(io, socket);
        return;
      }
      await handleLeave(io, socket, payload.analysisId, false);
    });

    socket.on(
      "kick-participant",
      async (payload: { analysisId: string; userId: string }) => {
        if (socket.data.role !== "ADMIN") return;
        const mediaKey = mediaKeyOf(socket);
        const sockets = await io.in(mediaKey).fetchSockets();
        const target = sockets.find((item) => item.data.userId === payload.userId);
        if (!target) return;
        target.emit("removed-from-room", { reason: "Removido pelo administrador" });
        if (target.data.voiceOnly) {
          await handleVoiceLeave(io, target as unknown as LeaveableSocket);
        } else {
          await handleLeave(
            io,
            target as unknown as LeaveableSocket,
            payload.analysisId,
            true,
          );
        }
        target.leave(mediaKey);
      },
    );

    socket.on(
      "end-analysis",
      async (payload: { analysisId: string; role: "REQUESTER" | "ADMIN" }) => {
        if (socket.data.role !== payload.role) return;
        await finalizeAnalysis(
          payload.analysisId,
          socket.data.userId as string,
          payload.role,
        );
        io.to(analysisRoomKey(payload.analysisId)).emit("analysis-ended");
        io.to(analysisRoomKey(payload.analysisId)).emit("analysis-status", {
          status: "FINALIZADA",
        });
        if (socket.data.organizationId) {
          io.to(orgKey(socket.data.organizationId)).emit("rooms-updated");
        }
        const sockets = await io
          .in(analysisRoomKey(payload.analysisId))
          .fetchSockets();
        sockets.forEach((item) => {
          item.leave(analysisRoomKey(payload.analysisId));
        });
      },
    );

    socket.on("disconnect", async () => {
      if (socket.data.voiceOnly) {
        await handleVoiceLeave(io, socket);
        return;
      }
      const analysisId = socket.data.analysisId as string | undefined;
      if (!analysisId) return;
      await handleLeave(io, socket, analysisId, false);
    });
  });

  return io;
}

async function handleVoiceLeave(io: SocketIOServer, socket: LeaveableSocket) {
  const userId = socket.data.userId as string | undefined;
  const roomId = socket.data.roomId as string | undefined;
  const organizationId = socket.data.organizationId as string | undefined;
  const mediaKey = mediaKeyOf(socket);
  if (!userId || socket.data.left) return;
  socket.data.left = true;

  try {
    if (socket.data.isSharing) {
      io.to(mediaKey).emit("screen-share-stopped", { userId });
      if (roomId) {
        await setParticipantFlags(roomId, userId, { screenSharing: false });
      }
    }

    if (roomId) {
      await leaveRoomParticipant(roomId, userId);
    }
  } catch (error) {
    console.error("handleVoiceLeave", error);
  }

  socket.data.isSharing = false;
  socket.data.speaking = false;
  io.to(mediaKey).emit(
    "participants-updated",
    await liveParticipants(io, mediaKey),
  );
  if (organizationId) {
    io.to(orgKey(organizationId)).emit("rooms-updated");
  }
}

async function handleLeave(
  io: SocketIOServer,
  socket: LeaveableSocket,
  analysisId: string,
  kicked: boolean,
) {
  const userId = socket.data.userId as string | undefined;
  const wasSharing = Boolean(socket.data.isSharing);
  const organizationId = socket.data.organizationId as string | undefined;
  const mediaKey = mediaKeyOf(socket) || analysisRoomKey(analysisId);
  if (!userId || socket.data.left) return;
  socket.data.left = true;

  if (wasSharing && socket.data.role === "TARGET") {
    try {
      await stopTransmission(analysisId, userId);
      io.to(mediaKey).emit("screen-share-stopped", { userId });
    } catch {
      // Análise pode já ter encerrado.
    }
  }

  try {
    await leaveAnalysisSession(analysisId, userId, { kicked });
  } catch {
    // Sessão já encerrada.
  }

  socket.data.isSharing = false;
  socket.data.speaking = false;
  io.to(mediaKey).emit(
    "participants-updated",
    await liveParticipants(io, mediaKey),
  );
  if (organizationId) {
    io.to(orgKey(organizationId)).emit("rooms-updated");
  }
}

async function liveParticipants(io: SocketIOServer, roomKey: string) {
  if (!roomKey) return [];
  const unique = new Map<
    string,
    {
      userId: string;
      userName: string;
      role: string;
      isSharing: boolean;
      micEnabled: boolean;
      speaking: boolean;
      deafened: boolean;
      connected: boolean;
    }
  >();

  for (const item of await io.in(roomKey).fetchSockets()) {
    const userId = item.data.userId as string | undefined;
    if (!userId) continue;
    const current = unique.get(userId);
    unique.set(userId, {
      userId,
      userName: (item.data.userName as string) ?? current?.userName ?? "",
      role: (item.data.role as string) ?? current?.role ?? "",
      isSharing: Boolean(item.data.isSharing) || Boolean(current?.isSharing),
      micEnabled: Boolean(item.data.micEnabled) || Boolean(current?.micEnabled),
      speaking: Boolean(item.data.speaking) || Boolean(current?.speaking),
      deafened: Boolean(item.data.deafened) || Boolean(current?.deafened),
      connected: true,
    });
  }

  return Array.from(unique.values());
}

export function registerAccessToken(
  analysisId: string,
  userId: string,
  token: string,
) {
  setRoomToken(analysisId, userId, token);
}

export function notifyRoomsUpdated(organizationId?: string | null) {
  if (!ioServer || !organizationId) return;
  ioServer.to(orgKey(organizationId)).emit("rooms-updated");
}
