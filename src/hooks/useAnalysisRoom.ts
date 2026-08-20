"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  captureDisplay,
  captureMicrophone,
  describeMicError,
  describeShareError,
  shouldUpgradeToHttps,
  upgradeToHttps,
  watchDisplayCaptureEnd,
} from "@/lib/mic";

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
  pendingOffer: boolean;
  audioEl: HTMLAudioElement;
  audioSender: RTCRtpSender | null;
  videoSender: RTCRtpSender | null;
}

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ];
  const turnUrls = process.env.NEXT_PUBLIC_TURN_URLS?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const username = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  if (turnUrls?.length && username && credential) {
    servers.push({ urls: turnUrls, username, credential });
    return servers;
  }
  servers.push(
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:80?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turns:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  );
  return servers;
}

function createRemoteAudioElement() {
  const el = document.createElement("audio");
  el.autoplay = true;
  el.playsInline = true;
  el.setAttribute("playsinline", "true");
  el.setAttribute("webkit-playsinline", "true");
  el.preload = "auto";
  el.controls = false;
  el.volume = 1;
  el.style.cssText =
    "position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1";
  document.body.appendChild(el);
  return el;
}

async function playRemoteAudio(el: HTMLAudioElement, muted: boolean) {
  el.autoplay = true;
  el.playsInline = true;
  el.muted = muted;
  try {
    await el.play();
  } catch {
    const retry = () => {
      el.muted = muted;
      void el.play().catch(() => undefined);
    };
    document.addEventListener("touchend", retry, { once: true, passive: true });
    document.addEventListener("click", retry, { once: true });
  }
}

function preferH264(transceiver: RTCRtpTransceiver) {
  const caps = RTCRtpSender.getCapabilities?.("video");
  if (!caps?.codecs.length || !transceiver.setCodecPreferences) return;
  const h264 = caps.codecs.filter((codec) => /H264/i.test(codec.mimeType));
  const rest = caps.codecs.filter((codec) => !/H264/i.test(codec.mimeType));
  if (!h264.length) return;
  try {
    transceiver.setCodecPreferences([...h264, ...rest]);
  } catch {
    // Safari antigo pode recusar a ordem.
  }
}

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
  const isSharingRef = useRef(false);
  const unwatchDisplayRef = useRef<(() => void) | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
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
    slot.audioEl.remove();
    peersRef.current.delete(remoteId);
  }, []);

  const teardownAllPeers = useCallback(() => {
    for (const remoteId of Array.from(peersRef.current.keys())) {
      teardownPeer(remoteId);
    }
  }, [teardownPeer]);

  const addLocalTracks = useCallback((pc: RTCPeerConnection) => {
    const slot = Array.from(peersRef.current.values()).find((item) => item.pc === pc);
    if (!slot) return;
    const audio = audioStreamRef.current;
    const audioTrack = audio?.getAudioTracks().find((track) => track.readyState === "live");
    if (audioTrack && isMicOnRef.current) {
      void slot.audioSender?.replaceTrack(audioTrack);
    }
    const screen = screenStreamRef.current;
    const videoTrack = screen?.getVideoTracks().find((track) => track.readyState !== "ended");
    if (videoTrack) {
      void slot.videoSender?.replaceTrack(videoTrack);
    }
  }, []);

  const offerTo = useCallback(
    async (remoteId: string) => {
      const slot = peersRef.current.get(remoteId);
      if (!slot || !socket) return;
      slot.pendingOffer = true;
      if (slot.pc.signalingState !== "stable") return;
      slot.pendingOffer = false;
      slot.makingOffer = true;
      try {
        const offer = await slot.pc.createOffer();
        if (slot.pc.signalingState !== "stable") {
          slot.pendingOffer = true;
          return;
        }
        await slot.pc.setLocalDescription(offer);
        socket.emit("webrtc-offer", {
          analysisId: channelId,
          targetUserId: remoteId,
          sdp: slot.pc.localDescription,
        });
      } catch {
        slot.pendingOffer = true;
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

      const pc = new RTCPeerConnection({
        iceServers: iceServers(),
        iceCandidatePoolSize: 8,
        bundlePolicy: "max-bundle",
      });
      const audioEl = createRemoteAudioElement();
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
        pendingOffer: false,
        audioEl,
        audioSender: null,
        videoSender: null,
      };
      peersRef.current.set(remoteId, slot);

      const audioTransceiver = pc.addTransceiver("audio", { direction: "sendrecv" });
      const videoTransceiver = pc.addTransceiver("video", { direction: "sendrecv" });
      slot.audioSender = audioTransceiver.sender;
      slot.videoSender = videoTransceiver.sender;
      preferH264(videoTransceiver);
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

      const applyRemoteVideo = (track: MediaStreamTrack, stream: MediaStream) => {
        void playVideo(remoteVideoRef.current, stream);
        setHasRemoteStream(true);
        setRemoteStream(stream);
        track.addEventListener("ended", () => {
          if (track.readyState === "live") return;
          setHasRemoteStream(false);
          setRemoteStream((current) => (current && current.getVideoTracks().includes(track) ? null : current));
          void playVideo(remoteVideoRef.current, null);
        });
      };

      pc.ontrack = (event) => {
        const stream =
          event.streams[0] ?? new MediaStream(event.track ? [event.track] : []);
        if (event.track.kind === "video") {
          const apply = () => applyRemoteVideo(event.track, stream);
          event.track.addEventListener("unmute", apply);
          event.track.addEventListener("mute", () => {
            void playVideo(remoteVideoRef.current, stream);
          });
          if (!event.track.muted) apply();
          else {
            setRemoteStream(stream);
            void playVideo(remoteVideoRef.current, stream);
          }
          return;
        }
        event.track.enabled = true;
        const audioOnly = new MediaStream([event.track]);
        slot.audioEl.srcObject = audioOnly;
        void playRemoteAudio(slot.audioEl, isDeafenedRef.current);
        event.track.addEventListener("unmute", () => {
          void playRemoteAudio(slot.audioEl, isDeafenedRef.current);
        });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          void playRemoteAudio(slot.audioEl, isDeafenedRef.current);
        }
      };
      pc.oniceconnectionstatechange = () => {
        if (
          pc.iceConnectionState === "connected" ||
          pc.iceConnectionState === "completed"
        ) {
          void playRemoteAudio(slot.audioEl, isDeafenedRef.current);
        }
      };

      pc.onnegotiationneeded = () => {
        void offerTo(remoteId);
      };
      pc.onsignalingstatechange = () => {
        if (pc.signalingState === "stable" && slot.pendingOffer) {
          void offerTo(remoteId);
        }
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
      unwatchDisplayRef.current?.();
      unwatchDisplayRef.current = null;
      void wakeLockRef.current?.release().catch(() => undefined);
      wakeLockRef.current = null;
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      isSharingRef.current = false;
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

  useEffect(() => {
    const restore = () => {
      const stream = screenStreamRef.current;
      const track = stream?.getVideoTracks().find((item) => item.readyState === "live");
      if (!stream || !track || !isSharingRef.current) return;
      void playVideo(localVideoRef.current, stream);
      for (const [remoteId, slot] of peersRef.current) {
        if (slot.videoSender) void slot.videoSender.replaceTrack(track);
        else {
          slot.videoSender = slot.pc.addTrack(track, stream);
          void offerTo(remoteId);
        }
      }
      if (!wakeLockRef.current) {
        void navigator.wakeLock
          ?.request("screen")
          .then((lock) => {
            if (!isSharingRef.current) {
              void lock.release().catch(() => undefined);
              return;
            }
            wakeLockRef.current = lock;
          })
          .catch(() => undefined);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") restore();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", restore);
    window.addEventListener("focus", restore);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", restore);
      window.removeEventListener("focus", restore);
    };
  }, [offerTo]);

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
          source.connect(analyser);
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
      for (const slot of peersRef.current.values()) {
        void playRemoteAudio(slot.audioEl, isDeafenedRef.current);
      }
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
      for (const slot of peersRef.current.values()) {
        void playRemoteAudio(slot.audioEl, isDeafenedRef.current);
      }
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
      void playRemoteAudio(slot.audioEl, isDeafenedRef.current);
    }
  }, [ensureAudioContext]);

  const clearError = useCallback(() => setError(null), []);
  const clearShareHint = useCallback(() => setShareHint(null), []);
  const reportShareError = useCallback((error: unknown) => {
    if (shouldUpgradeToHttps()) {
      upgradeToHttps("share");
      return;
    }
    setShareHint(describeShareError(error));
  }, []);

  const stopScreenShare = useCallback(async () => {
    unwatchDisplayRef.current?.();
    unwatchDisplayRef.current = null;
    const lock = wakeLockRef.current;
    wakeLockRef.current = null;
    void lock?.release().catch(() => undefined);

    const wasSharing = isSharingRef.current || Boolean(screenStreamRef.current);
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    isSharingRef.current = false;
    await playVideo(localVideoRef.current, null);
    setIsSharing(false);
    if (!wasSharing) return;
    for (const slot of peersRef.current.values()) {
      if (slot.videoSender) await slot.videoSender.replaceTrack(null);
    }
    socketRef.current?.emit("screen-share-stop", { analysisId: channelIdRef.current });
  }, []);

  const startScreenShare = useCallback(async (existingStream?: MediaStream) => {
    if (!canShareScreen) return false;
    try {
      const stream = existingStream ?? (await captureDisplay());
      const videoTrack =
        stream.getVideoTracks().find((track) => track.readyState !== "ended") ??
        stream.getVideoTracks()[0];
      if (!videoTrack) {
        stream.getTracks().forEach((track) => track.stop());
        setShareHint("Não foi possível capturar a tela.");
        return false;
      }

      unwatchDisplayRef.current?.();
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = stream;
      isSharingRef.current = true;
      setIsSharing(true);
      setShareHint(null);
      setError(null);

      const endShare = () => {
        void stopScreenShare();
      };
      videoTrack.onended = endShare;
      unwatchDisplayRef.current = watchDisplayCaptureEnd(stream, endShare);

      await playVideo(localVideoRef.current, stream);
      socketRef.current?.emit("screen-share-start", { analysisId: channelIdRef.current });

      const sendVideo = async () => {
        for (const [remoteId, slot] of peersRef.current) {
          if (slot.videoSender) {
            await slot.videoSender.replaceTrack(videoTrack);
            continue;
          }
          slot.videoSender = slot.pc.addTrack(videoTrack, stream);
          void offerTo(remoteId);
        }
      };
      await sendVideo();
      videoTrack.addEventListener("unmute", () => {
        if (!isSharingRef.current) return;
        void sendVideo();
      });

      try {
        const lock = await navigator.wakeLock?.request("screen");
        if (lock) {
          wakeLockRef.current = lock;
          lock.addEventListener("release", () => {
            if (wakeLockRef.current === lock) wakeLockRef.current = null;
          });
        }
      } catch {
        // Wake Lock é opcional; a captura continua.
      }

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
    unwatchDisplayRef.current?.();
    unwatchDisplayRef.current = null;
    void wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    isSharingRef.current = false;
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
      unwatchDisplayRef.current?.();
      void wakeLockRef.current?.release().catch(() => undefined);
      void audioContextRef.current?.close();
    };
  }, []);

  const attachMediaToVideos = useCallback(() => {
    void playVideo(localVideoRef.current, screenStreamRef.current);
    void playVideo(remoteVideoRef.current, remoteStream);
  }, [remoteStream]);

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
    clearShareHint,
    reportShareError,
    leaveRoom,
    kickParticipant,
    endAnalysis,
    canShareScreen,
    isDeafened,
    toggleDeafen,
    updateAudioConfig,
    attachMediaToVideos,
  };
}
