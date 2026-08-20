"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

export interface RoomParticipant {
  userId: string;
  userName: string;
  role: string;
  isSharing: boolean;
  micEnabled?: boolean;
  speaking?: boolean;
  deafened?: boolean;
  connected?: boolean;
}

interface UseAnalysisRoomOptions {
  analysisId?: string;
  roomId?: string;
  mode?: "analysis" | "voice";
  userId: string;
  userName: string;
  role: "REQUESTER" | "TARGET" | "ADMIN";
  token: string;
  socket: Socket | null;
  connected: boolean;
}

interface PeerSlot {
  pc: RTCPeerConnection;
  pendingIce: RTCIceCandidateInit[];
  remoteReady: boolean;
  makingOffer: boolean;
  audioEl: HTMLAudioElement;
}

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

async function playVideo(video: HTMLVideoElement | null, stream: MediaStream | null) {
  if (!video) return;
  if (video.srcObject !== stream) video.srcObject = stream;
  if (stream) {
    try {
      await video.play();
    } catch {
      // Autoplay pode esperar o próximo clique do usuário.
    }
  }
}

export function useAnalysisRoom({
  analysisId = "",
  roomId = "",
  mode = "analysis",
  userId,
  userName,
  role,
  token,
  socket,
  connected,
}: UseAnalysisRoomOptions) {
  const channelId = mode === "voice" ? roomId : analysisId;
  const tokenKey = mode === "voice" ? `voice:${roomId}` : analysisId;
  const canShareScreen = mode === "voice" || role === "TARGET";
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peersRef = useRef<Map<string, PeerSlot>>(new Map());
  const audioStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const speakingTimerRef = useRef<number | null>(null);
  const isDeafenedRef = useRef(false);
  const isMicOnRef = useRef(false);
  const audioConfigRef = useRef({
    inputDeviceId: "",
    outputDeviceId: "",
    outputVolume: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sensitivity: 18,
  });

  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [isSharing, setIsSharing] = useState(false);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [status, setStatus] = useState<string>("SALA_ATIVA");
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removedReason, setRemovedReason] = useState<string | null>(null);

  const teardownPeer = useCallback((remoteId: string) => {
    const slot = peersRef.current.get(remoteId);
    if (!slot) return;
    slot.pc.close();
    slot.audioEl.pause();
    slot.audioEl.srcObject = null;
    peersRef.current.delete(remoteId);
  }, []);

  const teardownAllPeers = useCallback(() => {
    for (const remoteId of Array.from(peersRef.current.keys())) {
      teardownPeer(remoteId);
    }
  }, [teardownPeer]);

  const addLocalTracks = useCallback((pc: RTCPeerConnection) => {
    const audio = audioStreamRef.current;
    if (audio) {
      for (const track of audio.getTracks()) {
        if (!pc.getSenders().some((sender) => sender.track === track)) {
          pc.addTrack(track, audio);
        }
      }
    }
    const screen = screenStreamRef.current;
    if (screen) {
      for (const track of screen.getTracks()) {
        const existing = pc.getSenders().find((sender) => sender.track?.kind === "video");
        if (existing) void existing.replaceTrack(track);
        else pc.addTrack(track, screen);
      }
    }
  }, []);

  const offerTo = useCallback(
    async (remoteId: string) => {
      const slot = peersRef.current.get(remoteId);
      if (!slot || !socket) return;
      if (slot.pc.signalingState !== "stable") return;
      slot.makingOffer = true;
      try {
        const offer = await slot.pc.createOffer();
        await slot.pc.setLocalDescription(offer);
        socket.emit("webrtc-offer", {
          analysisId: channelId,
          targetUserId: remoteId,
          sdp: slot.pc.localDescription,
        });
      } finally {
        slot.makingOffer = false;
      }
    },
    [channelId, socket],
  );

  const ensurePeer = useCallback(
    (remoteId: string) => {
      const existing = peersRef.current.get(remoteId);
      if (existing) return existing;
      if (!socket) return null;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const audioEl = new Audio();
      audioEl.autoplay = true;
      audioEl.volume = audioConfigRef.current.outputVolume;
      audioEl.muted = isDeafenedRef.current;
      if (audioConfigRef.current.outputDeviceId && "setSinkId" in audioEl) {
        void (audioEl as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> })
          .setSinkId(audioConfigRef.current.outputDeviceId)
          .catch(() => undefined);
      }
      const slot: PeerSlot = {
        pc,
        pendingIce: [],
        remoteReady: false,
        makingOffer: false,
        audioEl,
      };
      peersRef.current.set(remoteId, slot);
      addLocalTracks(pc);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("webrtc-ice-candidate", {
            analysisId: channelId,
            targetUserId: remoteId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (event) => {
        const stream =
          event.streams[0] ?? new MediaStream(event.track ? [event.track] : []);
        if (event.track.kind === "video") {
          void playVideo(remoteVideoRef.current, stream);
          setHasRemoteStream(true);
          setRemoteStream(stream);
          event.track.addEventListener("ended", () => {
            setHasRemoteStream(false);
            setRemoteStream(null);
            void playVideo(remoteVideoRef.current, null);
          });
          return;
        }
        slot.audioEl.srcObject = stream;
        void slot.audioEl.play().catch(() => undefined);
      };

      pc.onnegotiationneeded = () => {
        void offerTo(remoteId);
      };

      return slot;
    },
    [addLocalTracks, channelId, offerTo, socket],
  );

  const syncPeers = useCallback(
    (list: RoomParticipant[]) => {
      const others = list.filter((item) => item.userId && item.userId !== userId);
      const liveIds = new Set(others.map((item) => item.userId));
      for (const remoteId of Array.from(peersRef.current.keys())) {
        if (!liveIds.has(remoteId)) teardownPeer(remoteId);
      }
      for (const other of others) {
        ensurePeer(other.userId);
      }
    },
    [ensurePeer, teardownPeer, userId],
  );

  useEffect(() => {
    if (!socket || !connected) return;
    if (mode === "voice" && !roomId) return;
    if (mode !== "voice" && !analysisId) return;

    socket.emit("register-access", {
      analysisId: tokenKey,
      userId,
      userName,
      role,
      token,
    });

    const onJoined = (response: {
      ok: boolean;
      error?: string;
      participants?: RoomParticipant[];
    }) => {
      if (response?.ok) {
        setJoined(true);
        if (response.participants) {
            const unique = Array.from(
              new Map(
                response.participants
                  .filter((item) => item.userId)
                  .map((item) => [item.userId, item]),
              ).values(),
            );
            setParticipants(unique);
            syncPeers(unique);
          }
      } else setError(response?.error ?? "Falha ao entrar na sala");
    };

    if (mode === "voice") {
      socket.emit(
        "join-voice-room",
        { roomId, userId, userName, role, token },
        onJoined,
      );
    } else {
      socket.emit(
        "join-analysis",
        { analysisId, userId, userName, role, token },
        onJoined,
      );
    }

    const onParticipants = (list: RoomParticipant[]) => {
      const unique = Array.from(
        new Map(list.filter((item) => item.userId).map((item) => [item.userId, item])).values(),
      );
      setParticipants(unique);
      syncPeers(unique);
    };
    const onStatus = (payload: { status: string }) => setStatus(payload.status);
    const onEnded = () => {
      setStatus("FINALIZADA");
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      setIsSharing(false);
      setHasRemoteStream(false);
      setRemoteStream(null);
    };

    const onOffer = async (payload: {
      sdp: RTCSessionDescriptionInit;
      fromUserId: string;
    }) => {
      if (!payload.fromUserId || payload.fromUserId === userId) return;
      const slot = ensurePeer(payload.fromUserId);
      if (!slot) return;
      const polite = userId > payload.fromUserId;
      const collision =
        slot.makingOffer || slot.pc.signalingState !== "stable";
      if (collision) {
        if (!polite) return;
        try {
          await slot.pc.setLocalDescription({ type: "rollback" });
        } catch {
          // rollback pode não existir em alguns browsers.
        }
      }
      await slot.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      slot.remoteReady = true;
      for (const candidate of slot.pendingIce) {
        await slot.pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      slot.pendingIce = [];
      const answer = await slot.pc.createAnswer();
      await slot.pc.setLocalDescription(answer);
      socket.emit("webrtc-answer", {
        analysisId: channelId,
        targetUserId: payload.fromUserId,
        sdp: answer,
      });
    };

    const onAnswer = async (payload: {
      sdp: RTCSessionDescriptionInit;
      fromUserId: string;
    }) => {
      const slot = peersRef.current.get(payload.fromUserId);
      if (!slot) return;
      await slot.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      slot.remoteReady = true;
      for (const candidate of slot.pendingIce) {
        await slot.pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      slot.pendingIce = [];
    };

    const onIce = async (payload: {
      candidate: RTCIceCandidateInit;
      fromUserId: string;
    }) => {
      if (!payload.candidate || !payload.fromUserId) return;
      const slot = peersRef.current.get(payload.fromUserId) ?? ensurePeer(payload.fromUserId);
      if (!slot) return;
      if (!slot.remoteReady) {
        slot.pendingIce.push(payload.candidate);
        return;
      }
      try {
        await slot.pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch {
        slot.pendingIce.push(payload.candidate);
      }
    };

    const onShareStopped = () => {
      void playVideo(remoteVideoRef.current, null);
      setHasRemoteStream(false);
      setRemoteStream(null);
    };

    const onRemoved = (payload: { reason?: string }) => {
      setRemovedReason(payload.reason ?? "Você foi removido da sala");
      teardownAllPeers();
    };

    socket.on("participants-updated", onParticipants);
    socket.on("analysis-status", onStatus);
    socket.on("analysis-ended", onEnded);
    socket.on("webrtc-offer", onOffer);
    socket.on("webrtc-answer", onAnswer);
    socket.on("webrtc-ice-candidate", onIce);
    socket.on("screen-share-stopped", onShareStopped);
    socket.on("removed-from-room", onRemoved);

    return () => {
      socket.off("participants-updated", onParticipants);
      socket.off("analysis-status", onStatus);
      socket.off("analysis-ended", onEnded);
      socket.off("webrtc-offer", onOffer);
      socket.off("webrtc-answer", onAnswer);
      socket.off("webrtc-ice-candidate", onIce);
      socket.off("screen-share-stopped", onShareStopped);
      socket.off("removed-from-room", onRemoved);
    };
  }, [
    analysisId,
    channelId,
    connected,
    ensurePeer,
    mode,
    role,
    roomId,
    socket,
    syncPeers,
    teardownAllPeers,
    token,
    tokenKey,
    userId,
    userName,
  ]);

  useEffect(() => {
    if (!isSharing) return;
    void playVideo(localVideoRef.current, screenStreamRef.current);
  }, [isSharing]);

  const startSpeakingMonitor = useCallback(
    (stream: MediaStream) => {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;
      const context = new AudioContextCtor();
      void context.resume();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const hangMs = 500;
      let last = false;
      let lastSpokeAt = 0;

      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((sum, value) => sum + value, 0) / data.length;
        const now = performance.now();
        const canSpeak = isMicOnRef.current && !isDeafenedRef.current;
        if (canSpeak && avg > audioConfigRef.current.sensitivity) {
          lastSpokeAt = now;
        }
        const speaking = canSpeak && lastSpokeAt > 0 && now - lastSpokeAt < hangMs;
        setIsSpeaking(speaking);
        if (speaking !== last) {
          last = speaking;
          socket?.emit("media-state", { analysisId: channelId, speaking });
        }
        speakingTimerRef.current = window.setTimeout(tick, 50);
      };
      tick();
    },
    [channelId, socket],
  );

  const toggleMic = async () => {
    if (!socket || isDeafenedRef.current) return;
    if (audioStreamRef.current) {
      const next = !isMicOn;
      audioStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = next;
      });
      isMicOnRef.current = next;
      setIsMicOn(next);
      if (!next) setIsSpeaking(false);
      socket.emit("media-state", { analysisId: channelId, micEnabled: next, speaking: false });
      return;
    }

    try {
      const cfg = audioConfigRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: cfg.echoCancellation,
          noiseSuppression: cfg.noiseSuppression,
          autoGainControl: cfg.autoGainControl,
          ...(cfg.inputDeviceId ? { deviceId: { exact: cfg.inputDeviceId } } : {}),
        },
        video: false,
      });
      audioStreamRef.current = stream;
      isMicOnRef.current = true;
      setIsMicOn(true);
      socket.emit("media-state", { analysisId: channelId, micEnabled: true });
      startSpeakingMonitor(stream);
      for (const [remoteId, slot] of peersRef.current) {
        for (const track of stream.getTracks()) {
          slot.pc.addTrack(track, stream);
        }
        void offerTo(remoteId);
      }
    } catch {
      setError("Microfone indisponível neste BETA");
    }
  };

  const startScreenShare = async () => {
    if (!canShareScreen || !socket) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 60 },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      screenStreamRef.current = stream;
      setIsSharing(true);
      setError(null);
      await playVideo(localVideoRef.current, stream);
      socket.emit("screen-share-start", { analysisId: channelId });

      for (const [remoteId, slot] of peersRef.current) {
        for (const track of stream.getTracks()) {
          const sender = slot.pc.getSenders().find((item) => item.track?.kind === "video");
          if (sender) await sender.replaceTrack(track);
          else slot.pc.addTrack(track, stream);
        }
        void offerTo(remoteId);
      }

      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        void stopScreenShare();
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível compartilhar tela",
      );
    }
  };

  const stopScreenShare = async () => {
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    await playVideo(localVideoRef.current, null);
    setIsSharing(false);
    for (const slot of peersRef.current.values()) {
      for (const sender of slot.pc.getSenders()) {
        if (sender.track?.kind === "video") await sender.replaceTrack(null);
      }
    }
    socket?.emit("screen-share-stop", { analysisId: channelId });
  };

  const leaveRoom = () => {
    socket?.emit("leave-room", { analysisId: channelId });
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
    screenStreamRef.current = null;
    teardownAllPeers();
    setJoined(false);
    setParticipants([]);
    setIsSharing(false);
    setHasRemoteStream(false);
    setRemoteStream(null);
    setIsSpeaking(false);
    setIsMicOn(false);
    isMicOnRef.current = false;
  };

  const applyRemoteAudio = () => {
    for (const slot of peersRef.current.values()) {
      slot.audioEl.muted = isDeafenedRef.current;
      slot.audioEl.volume = audioConfigRef.current.outputVolume;
      if (audioConfigRef.current.outputDeviceId && "setSinkId" in slot.audioEl) {
        void (slot.audioEl as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> })
          .setSinkId(audioConfigRef.current.outputDeviceId)
          .catch(() => undefined);
      }
    }
  };

  const toggleDeafen = () => {
    const next = !isDeafenedRef.current;
    isDeafenedRef.current = next;
    setIsDeafened(next);
    applyRemoteAudio();
    if (next) {
      audioStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      isMicOnRef.current = false;
      setIsMicOn(false);
      setIsSpeaking(false);
      socket?.emit("media-state", {
        analysisId: channelId,
        deafened: true,
        micEnabled: false,
        speaking: false,
      });
      return;
    }
    audioStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });
    if (audioStreamRef.current) {
      isMicOnRef.current = true;
      setIsMicOn(true);
    }
    socket?.emit("media-state", {
      analysisId: channelId,
      deafened: false,
      micEnabled: Boolean(audioStreamRef.current),
    });
  };

  const updateAudioConfig = (
    patch: Partial<{
      inputDeviceId: string;
      outputDeviceId: string;
      outputVolume: number;
      echoCancellation: boolean;
      noiseSuppression: boolean;
      autoGainControl: boolean;
      sensitivity: number;
    }>,
  ) => {
    audioConfigRef.current = { ...audioConfigRef.current, ...patch };
    applyRemoteAudio();
  };

  const kickParticipant = (targetUserId: string) => {
    if (role !== "ADMIN") return;
    socket?.emit("kick-participant", { analysisId, userId: targetUserId });
  };

  const endAnalysis = () => {
    if (role === "REQUESTER" || role === "ADMIN") {
      socket?.emit("end-analysis", { analysisId, role });
      setStatus("FINALIZADA");
    }
  };

  useEffect(() => {
    return () => {
      socket?.emit("leave-room", { analysisId: channelId });
      if (speakingTimerRef.current) window.clearTimeout(speakingTimerRef.current);
      audioStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      teardownAllPeers();
    };
  }, [channelId, socket, teardownAllPeers]);

  return {
    localVideoRef,
    remoteVideoRef,
    participants,
    isSharing,
    hasRemoteStream,
    remoteStream,
    isMicOn,
    isSpeaking,
    status,
    joined,
    error,
    removedReason,
    startScreenShare,
    stopScreenShare,
    toggleMic,
    leaveRoom,
    kickParticipant,
    endAnalysis,
    canShareScreen,
    isDeafened,
    toggleDeafen,
    updateAudioConfig,
  };
}
