"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { captureDisplay, captureMicrophone, describeMicError, describeShareError, shouldUpgradeToHttps, upgradeToHttps } from "@/lib/mic";

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
  audioSender: RTCRtpSender | null;
  videoSender: RTCRtpSender | null;
}

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

async function playVideo(video: HTMLVideoElement | null, stream: MediaStream | null) {
  if (!video) return;
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  if (!stream) {
    video.srcObject = null;
    return;
  }
  if (video.srcObject !== stream) video.srcObject = stream;
  const tryPlay = () => video.play().catch(() => undefined);
  video.onloadedmetadata = () => {
    void tryPlay();
  };
  await tryPlay();
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
  const audioContextRef = useRef<AudioContext | null>(null);
  const speakingSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const monitoredStreamRef = useRef<MediaStream | null>(null);
  const isDeafenedRef = useRef(false);
  const isMicOnRef = useRef(false);
  const userWantsMicRef = useRef(true);
  const channelIdRef = useRef(channelId);
  const socketRef = useRef(socket);
  channelIdRef.current = channelId;
  socketRef.current = socket;
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
  const [micHint, setMicHint] = useState<string | null>(null);
  const [shareHint, setShareHint] = useState<string | null>(null);
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
    const slot = Array.from(peersRef.current.values()).find((item) => item.pc === pc);
    const audio = audioStreamRef.current;
    const audioTrack = audio?.getAudioTracks().find((track) => track.readyState === "live");
    if (audio && audioTrack && isMicOnRef.current) {
      if (slot?.audioSender) {
        void slot.audioSender.replaceTrack(audioTrack);
      } else {
        const sender = pc.addTrack(audioTrack, audio);
        if (slot) slot.audioSender = sender;
      }
    }
    const screen = screenStreamRef.current;
    const videoTrack = screen?.getVideoTracks().find((track) => track.readyState === "live");
    if (screen && videoTrack) {
      if (slot?.videoSender) {
        void slot.videoSender.replaceTrack(videoTrack);
      } else {
        const sender = pc.addTrack(videoTrack, screen);
        if (slot) slot.videoSender = sender;
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
        audioSender: null,
        videoSender: null,
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
        if (isMicOnRef.current) {
          socket.emit("media-state", {
            analysisId: channelId,
            micEnabled: true,
            speaking: false,
          });
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
    const timer = window.setTimeout(() => {
      void playVideo(localVideoRef.current, screenStreamRef.current);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [isSharing]);

  const liveMicStream = useCallback(() => {
    const stream = audioStreamRef.current;
    if (!stream) return null;
    const live = stream.getAudioTracks().some((track) => track.readyState === "live");
    if (!live) {
      stream.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
      return null;
    }
    return stream;
  }, []);

  const ensureAudioContext = useCallback(async () => {
    const Ctor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new Ctor();
    }
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume().catch(() => undefined);
    }
    return audioContextRef.current;
  }, []);

  const startSpeakingMonitor = useCallback(
    (stream: MediaStream) => {
      if (monitoredStreamRef.current === stream && speakingTimerRef.current) {
        void ensureAudioContext();
        return;
      }
      if (speakingTimerRef.current) {
        window.clearTimeout(speakingTimerRef.current);
        speakingTimerRef.current = null;
      }
      speakingSourceRef.current?.disconnect();
      speakingSourceRef.current = null;
      monitoredStreamRef.current = stream;

      const run = async () => {
        const context = await ensureAudioContext();
        if (!context) return;
        try {
          const source = context.createMediaStreamSource(stream);
          speakingSourceRef.current = source;
          const analyser = context.createAnalyser();
          analyser.fftSize = 1024;
          analyser.smoothingTimeConstant = 0.3;
          const silent = context.createGain();
          silent.gain.value = 0;
          source.connect(analyser);
          analyser.connect(silent);
          silent.connect(context.destination);
          const data = new Uint8Array(analyser.fftSize);
          const hangMs = 600;
          let last = false;
          let lastSpokeAt = 0;

          const tick = () => {
            if (context.state === "suspended") {
              void context.resume().catch(() => undefined);
            }
            analyser.getByteTimeDomainData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i++) {
              const sample = ((data[i] ?? 128) - 128) / 128;
              sum += sample * sample;
            }
            const rms = Math.sqrt(sum / data.length);
            const threshold = Math.max(0.018, audioConfigRef.current.sensitivity / 500);
            const now = performance.now();
            const canSpeak = isMicOnRef.current && !isDeafenedRef.current;
            if (canSpeak && rms > threshold) {
              lastSpokeAt = now;
            }
            const speaking = canSpeak && lastSpokeAt > 0 && now - lastSpokeAt < hangMs;
            setIsSpeaking(speaking);
            if (speaking !== last) {
              last = speaking;
              socketRef.current?.emit("media-state", {
                analysisId: channelIdRef.current,
                speaking,
              });
            }
            speakingTimerRef.current = window.setTimeout(tick, 50);
          };
          tick();
        } catch {
          // Sem medidor o áudio da call continua.
        }
      };
      void run();
    },
    [ensureAudioContext],
  );

  const attachMicToPeers = useCallback(
    (stream: MediaStream) => {
      const track = stream.getAudioTracks().find((item) => item.readyState === "live");
      if (!track) return;
      for (const [remoteId, slot] of peersRef.current) {
        if (slot.audioSender) {
          void slot.audioSender.replaceTrack(track);
          continue;
        }
        slot.audioSender = slot.pc.addTrack(track, stream);
        void offerTo(remoteId);
      }
    },
    [offerTo],
  );

  const releaseMic = useCallback((userOff = false) => {
    if (userOff) userWantsMicRef.current = false;
    isMicOnRef.current = false;
    setIsMicOn(false);
    setIsSpeaking(false);
    if (speakingTimerRef.current) {
      window.clearTimeout(speakingTimerRef.current);
      speakingTimerRef.current = null;
    }
    speakingSourceRef.current?.disconnect();
    speakingSourceRef.current = null;
    monitoredStreamRef.current = null;
    audioStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = false;
      track.stop();
    });
    audioStreamRef.current = null;
    for (const slot of peersRef.current.values()) {
      if (slot.audioSender) void slot.audioSender.replaceTrack(null);
    }
  }, []);

  const enableMic = useCallback(async () => {
    if (isDeafenedRef.current) return false;
    if (!userWantsMicRef.current) return false;
    await ensureAudioContext();
    const existing = liveMicStream();
    if (existing) {
      existing.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
      isMicOnRef.current = true;
      setIsMicOn(true);
      setMicHint(null);
      socketRef.current?.emit("media-state", {
        analysisId: channelIdRef.current,
        micEnabled: true,
      });
      startSpeakingMonitor(existing);
      attachMicToPeers(existing);
      return true;
    }

    try {
      if (shouldUpgradeToHttps()) {
        upgradeToHttps("mic");
        return false;
      }
      const stream = await captureMicrophone(audioConfigRef.current.inputDeviceId);
      audioStreamRef.current = stream;
      isMicOnRef.current = true;
      setIsMicOn(true);
      setMicHint(null);
      socketRef.current?.emit("media-state", {
        analysisId: channelIdRef.current,
        micEnabled: true,
      });
      startSpeakingMonitor(stream);
      attachMicToPeers(stream);
      return true;
    } catch (error) {
      if (shouldUpgradeToHttps()) {
        upgradeToHttps("mic");
        return false;
      }
      setMicHint(describeMicError(error));
      return false;
    }
  }, [attachMicToPeers, ensureAudioContext, liveMicStream, startSpeakingMonitor]);

  const toggleMic = useCallback(async () => {
    if (isDeafenedRef.current) return;
    if (isMicOnRef.current) {
      releaseMic(true);
      socketRef.current?.emit("media-state", {
        analysisId: channelIdRef.current,
        micEnabled: false,
        speaking: false,
      });
      return;
    }
    userWantsMicRef.current = true;
    await enableMic();
  }, [enableMic, releaseMic]);

  const unlockAudio = useCallback(() => {
    void ensureAudioContext();
    for (const slot of peersRef.current.values()) {
      void slot.audioEl.play().catch(() => undefined);
    }
  }, [ensureAudioContext]);

  const clearError = useCallback(() => setError(null), []);

  const stopScreenShare = useCallback(async () => {
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    await playVideo(localVideoRef.current, null);
    setIsSharing(false);
    for (const slot of peersRef.current.values()) {
      if (slot.videoSender) await slot.videoSender.replaceTrack(null);
    }
    socketRef.current?.emit("screen-share-stop", { analysisId: channelIdRef.current });
  }, []);

  const startScreenShare = useCallback(async () => {
    if (!canShareScreen) return false;
    try {
      if (shouldUpgradeToHttps()) {
        upgradeToHttps("share");
        return false;
      }
      const stream = await captureDisplay();
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        stream.getTracks().forEach((track) => track.stop());
        setShareHint("Não foi possível capturar a tela.");
        return false;
      }
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = stream;
      setIsSharing(true);
      setShareHint(null);
      setError(null);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      await playVideo(localVideoRef.current, stream);
      socketRef.current?.emit("screen-share-start", { analysisId: channelIdRef.current });

      for (const [remoteId, slot] of peersRef.current) {
        if (slot.videoSender) {
          await slot.videoSender.replaceTrack(videoTrack);
        } else {
          slot.videoSender = slot.pc.addTrack(videoTrack, stream);
          void offerTo(remoteId);
        }
      }

      videoTrack.addEventListener("ended", () => {
        void stopScreenShare();
      });
      return true;
    } catch (err) {
      if (shouldUpgradeToHttps()) {
        upgradeToHttps("share");
        return false;
      }
      setShareHint(describeShareError(err));
      return false;
    }
  }, [canShareScreen, offerTo, stopScreenShare]);

  const leaveRoom = (options?: { keepMic?: boolean }) => {
    socket?.emit("leave-room", { analysisId: channelId });
    if (!options?.keepMic) {
      releaseMic(false);
      setMicHint(null);
    }
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    teardownAllPeers();
    setJoined(false);
    setParticipants([]);
    setIsSharing(false);
    setHasRemoteStream(false);
    setRemoteStream(null);
    setIsSpeaking(false);
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
      releaseMic(false);
      socketRef.current?.emit("media-state", {
        analysisId: channelIdRef.current,
        deafened: true,
        micEnabled: false,
        speaking: false,
      });
      return;
    }
    socketRef.current?.emit("media-state", {
      analysisId: channelIdRef.current,
      deafened: false,
      micEnabled: false,
    });
    if (userWantsMicRef.current) void enableMic();
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
      teardownAllPeers();
    };
  }, [channelId, socket, teardownAllPeers]);

  useEffect(() => {
    return () => {
      if (speakingTimerRef.current) window.clearTimeout(speakingTimerRef.current);
      speakingSourceRef.current?.disconnect();
      audioStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
    };
  }, []);

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
    micHint,
    shareHint,
    removedReason,
    startScreenShare,
    stopScreenShare,
    enableMic,
    toggleMic,
    unlockAudio,
    clearError,
    leaveRoom,
    kickParticipant,
    endAnalysis,
    canShareScreen,
    isDeafened,
    toggleDeafen,
    updateAudioConfig,
  };
}
