"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  Headphones,
  HeadphoneOff,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Monitor,
  MonitorOff,
  PhoneOff,
  Settings,
  Sparkles,
  User,
  Volume2,
  Eye,
  EyeOff,
} from "lucide-react";
import { AudioSettingsPanel, ControlButton } from "@/components/rooms/AudioSettings";
import { useAnalysisRoom } from "@/hooks/useAnalysisRoom";
import { useSocket } from "@/hooks/useSocket";
import { formatOccupancy } from "@/lib/format";
import { getMediaGranted, rememberMediaGranted, syncBrowserMediaGrants } from "@/lib/device";
import { isEmuRoom, isMobRoom, isSupRoom, roomTitle } from "@/lib/room-names";
import { cn } from "@/lib/utils";

const TILE_COLORS = [
  "#8b7355",
  "#3f3f46",
  "#c4b8a4",
  "#5c6758",
  "#b4533a",
  "#6b4f3a",
  "#a1a1aa",
  "#57534e",
  "#64748b",
  "#78716c",
];

const AVATAR_COLORS = [
  "#5865f2",
  "#57f287",
  "#fee75c",
  "#eb459e",
  "#ed4245",
  "#3ba55d",
  "#f26522",
  "#00b0f4",
  "#9b59b6",
  "#1abc9c",
];

function colorForId(id: string) {
  let hash = 0;
  for (const char of id) hash = char.charCodeAt(0) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function memberId(person: { id?: string; userId?: string }) {
  return person.userId || person.id || "";
}

function participantGridClass(count: number, mobile = false) {
  if (mobile) {
    if (count <= 2) return "grid-cols-1";
    return "grid-cols-2";
  }
  if (count <= 1) return "grid-cols-1";
  if (count <= 2) return "grid-cols-1 min-[480px]:grid-cols-2";
  if (count <= 4) return "grid-cols-2";
  if (count <= 6) return "grid-cols-2 md:grid-cols-3";
  return "grid-cols-2 md:grid-cols-3 xl:grid-cols-4";
}

function ParticipantTile({
  name,
  muted,
  deafened,
  speaking,
  color,
  className,
}: {
  name?: string;
  muted: boolean;
  deafened?: boolean;
  speaking?: boolean;
  color: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-2xl",
        speaking && "speaking-glow",
        className,
      )}
      style={{ backgroundColor: color }}
    >
      <span className="flex h-[4.75rem] w-[4.75rem] items-center justify-center overflow-hidden rounded-full bg-black/25 sm:h-24 sm:w-24">
        <User className="h-9 w-9 text-white/90 sm:h-11 sm:w-11" />
      </span>
      {name ? (
        <span className="absolute bottom-3 left-1/2 flex max-w-[88%] -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/75 px-2.5 py-1 text-[11px] font-medium text-white">
          {deafened ? (
            <HeadphoneOff className="h-3.5 w-3.5 shrink-0" />
          ) : muted ? (
            <MicOff className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Mic className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">{name}</span>
        </span>
      ) : (
        (deafened || muted) && (
          <span className="absolute bottom-2 left-2 flex h-7 w-7 items-center justify-center rounded-lg bg-black/70 text-white sm:bottom-3 sm:left-3 sm:h-8 sm:w-8">
            {deafened ? <HeadphoneOff className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </span>
        )
      )}
    </div>
  );
}

function MobileCallButton({
  danger,
  active,
  label,
  onClick,
  children,
}: {
  danger?: boolean;
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-12 w-12 items-center justify-center rounded-full text-white transition",
        danger ? "bg-[#e53935]" : active ? "bg-white/20" : "bg-[#3a3a3c]",
      )}
    >
      {children}
    </button>
  );
}

interface VoiceRoomProps {
  room: {
    id: string;
    name: string;
    number: number;
    maxParticipants: number;
    occupiedAt?: string | null;
  };
  access: {
    roomId: string;
    userId: string;
    role: "REQUESTER" | "TARGET" | "ADMIN";
    token: string;
  };
  userName: string;
  initialRooms?: SidebarRoom[];
}

interface SidebarRoom {
  id: string;
  name: string;
  number: number;
  maxParticipants: number;
  occupiedAt: string | null;
  organizationId?: string;
  participants?: Array<{ id?: string; userId: string; userName?: string; screenSharing?: boolean }>;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function roomFromPath(pathname: string, rooms?: SidebarRoom[]) {
  const id = pathname.match(/^\/salas\/([^/]+)$/)?.[1] ?? "";
  const listed = rooms?.find((item) => item.id === id);
  const number = listed?.number ?? 0;
  return {
    id,
    name: number > 0 ? roomTitle(number) : "",
    number,
    maxParticipants: listed?.maxParticipants ?? 10,
    occupiedAt: null as string | null,
  };
}

function emptyRoom() {
  return {
    id: "",
    name: "",
    number: 0,
    maxParticipants: 10,
    occupiedAt: null as string | null,
  };
}

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(
      "(max-width: 767px), (max-height: 540px) and (pointer: coarse)",
    );
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return mobile;
}

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenNode = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function nativeFullscreenElement() {
  const doc = document as FullscreenDocument;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

async function enterNativeFullscreen(node: HTMLElement) {
  const el = node as FullscreenNode;
  if (el.requestFullscreen) {
    await el.requestFullscreen();
    return;
  }
  if (el.webkitRequestFullscreen) {
    await el.webkitRequestFullscreen();
  }
}

async function exitNativeFullscreen() {
  if (!nativeFullscreenElement()) return;
  const doc = document as FullscreenDocument;
  if (document.exitFullscreen) {
    await document.exitFullscreen();
    return;
  }
  if (doc.webkitExitFullscreen) {
    await doc.webkitExitFullscreen();
  }
}

export function VoiceRoomEntry({
  userName,
  userId,
  role,
  initialRooms,
}: {
  userName: string;
  userId: string;
  role: "PLAYER" | "ADMIN";
  initialRooms?: SidebarRoom[];
}) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [rooms, setRooms] = useState<SidebarRoom[]>(initialRooms ?? []);
  const startRoom = roomFromPath(pathname, rooms);
  const access = useMemo(
    () => ({
      roomId: startRoom.id,
      userId,
      role: (role === "ADMIN" ? "ADMIN" : "REQUESTER") as
        | "REQUESTER"
        | "TARGET"
        | "ADMIN",
      token: userId,
    }),
    [startRoom.id, userId, role],
  );

  useEffect(() => {
    setMounted(true);
    void fetch("/api/rooms")
      .then((res) => (res.ok ? res.json() : { rooms: [] }))
      .then((data) => {
        if (Array.isArray(data.rooms)) setRooms(data.rooms);
      })
      .catch(() => undefined);
  }, []);

  if (!mounted) {
    return <div className="h-dvh bg-[#111214]" />;
  }

  return (
    <VoiceRoom
      room={startRoom}
      access={access}
      userName={userName}
      initialRooms={rooms}
    />
  );
}

function RoomSidebar({
  currentId,
  livePeople,
  selfId,
  userName,
  callStartedAt,
  isMicOn,
  isDeafened,
  isSharing,
  onMic,
  onDeafen,
  onShare,
  audio,
  onAudioChange,
  onSelectRoom,
  initialRooms,
}: {
  currentId: string;
  livePeople: Array<{ userId: string; userName?: string; isSharing?: boolean }>;
  selfId?: string;
  userName?: string;
  callStartedAt?: number | null;
  isMicOn?: boolean;
  isDeafened?: boolean;
  isSharing?: boolean;
  onMic?: () => void;
  onDeafen?: () => void;
  onShare?: () => void;
  onSelectRoom?: (item: SidebarRoom) => void;
  initialRooms?: SidebarRoom[];
  audio?: {
    inputDeviceId: string;
    outputDeviceId: string;
    outputVolume: number;
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
    sensitivity: number;
  };
  onAudioChange?: (patch: Record<string, string | number | boolean>) => void;
}) {
  const { socket, connected } = useSocket();
  const [rooms, setRooms] = useState<SidebarRoom[]>(initialRooms ?? []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const now = useNow(true);

  useEffect(() => {
    setReady(true);
  }, []);

  const load = () => {
    void fetch("/api/rooms")
      .then((res) => (res.ok ? res.json() : { rooms: [] }))
      .then((data) => setRooms(Array.isArray(data.rooms) ? data.rooms : []))
      .catch(() => undefined);
  };

  useEffect(() => {
    load();
  }, []);

  const orgId = rooms[0]?.organizationId ?? initialRooms?.[0]?.organizationId;

  useEffect(() => {
    if (!socket || !connected) return;
    if (orgId) socket.emit("watch-org", orgId);
    const onUpdate = () => load();
    socket.on("rooms-updated", onUpdate);
    return () => {
      socket.off("rooms-updated", onUpdate);
    };
  }, [connected, orgId, socket]);

  const renderRoom = (item: SidebarRoom) => {
    const fromApi = (item.participants ?? [])
      .map((person) => ({
        userId: memberId(person),
        userName: person.userName || "teste",
        screenSharing: Boolean(person.screenSharing),
      }))
      .filter((person) => person.userId);
    const fromLive = livePeople
      .filter((person) => person.userId)
      .map((person) => ({
        userId: person.userId,
        userName: person.userName || "teste",
        screenSharing: Boolean(person.isSharing),
      }));
    const inThisRoom = Boolean(currentId) && item.id === currentId;
    const members = inThisRoom
      ? fromLive.length > 0
        ? fromLive
        : selfId
          ? [
              {
                userId: selfId,
                userName: userName || "teste",
                screenSharing: fromApi.find((person) => person.userId === selfId)?.screenSharing,
              },
              ...fromApi.filter((person) => person.userId !== selfId),
            ]
          : fromApi
      : fromApi.filter((person) => person.userId !== selfId);
    const occupied = members.length > 0;
    const active = item.id === currentId;
    const occupiedSince =
      inThisRoom && callStartedAt
        ? new Date(callStartedAt).toISOString()
        : item.occupiedAt;
    const elapsed = occupied ? formatOccupancy(occupiedSince) : "00:00";
    void now;
    return (
      <div key={item.id} className="pb-1">
        <button
          type="button"
          onClick={() => onSelectRoom?.(item)}
          className={cn(
            "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition min-[400px]:py-2",
            active ? "text-zinc-100" : "text-zinc-400 hover:bg-white/5",
          )}
        >
          <span className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 shrink-0" />
            <span className="font-medium">{roomTitle(item.number)}</span>
          </span>
          <span className="text-right text-[11px] leading-tight opacity-80">
            <span className="block">
              {String(members.length).padStart(2, "0")}/
              {String(item.maxParticipants).padStart(2, "0")}
            </span>
            {occupied && ready && (
              <span suppressHydrationWarning className="text-emerald-400">
                {elapsed}
              </span>
            )}
          </span>
        </button>
        {members.length > 0 && (
          <ul className="mt-1 space-y-1 pl-7">
            {members.map((person) => (
              <li
                key={person.userId}
                className="flex items-center gap-2 py-0.5 text-[13px] font-medium text-zinc-300"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: colorForId(person.userId) }}
                >
                  <User className="h-4 w-4 text-white" />
                </span>
                <span className="min-w-0 truncate">{person.userName || "teste"}</span>
                {person.screenSharing && (
                  <span className="shrink-0 rounded bg-[#ed4245] px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-white">
                    AO VIVO
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <aside className="relative flex h-full min-h-0 min-w-0 w-full shrink-0 flex-col bg-[#111214] md:w-[240px] lg:w-[280px]">
      <div className="flex items-center gap-3 px-3 py-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-4 sm:py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 text-lg">
          <Sparkles className="h-5 w-5 text-white" />
        </span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-300">
            Free Fire ORG
          </p>
          <p className="text-sm font-semibold text-white">Sistema de Análise</p>
        </div>
      </div>

      <div className="sidebar-scroll flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        <div className="px-2 pb-2">
          <p className="text-sm font-semibold tracking-wide text-zinc-500">
            call suporte
          </p>
          <div className="mt-2 h-px bg-zinc-500/55" />
        </div>
        {rooms.filter((item) => isSupRoom(item.number)).map((item) => renderRoom(item))}
        <div className="px-2 pb-2 pt-4">
          <p className="text-sm font-semibold tracking-wide text-zinc-500">
            análise mobile
          </p>
          <div className="mt-2 h-px bg-zinc-500/55" />
        </div>
        {rooms.filter((item) => isMobRoom(item.number)).map((item) => renderRoom(item))}
        <div className="px-2 pb-2 pt-4">
          <p className="text-sm font-semibold tracking-wide text-zinc-500">
            análise emulardor
          </p>
          <div className="mt-2 h-px bg-zinc-500/55" />
        </div>
        {rooms.filter((item) => isEmuRoom(item.number)).map((item) => renderRoom(item))}
      </div>

      <div className="relative px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1">
        <div className="flex items-center justify-between rounded-xl bg-[#232428] px-2 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="relative shrink-0">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#5865f2]">
                <User className="h-4 w-4 text-white" />
              </span>
              <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-[3px] border-[#232428] bg-[#23a559]" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-white">
                {userName || "Você"}
              </p>
              <p className="truncate text-[11px] leading-tight text-[#b5bac1]">
                {(userName || "você").toLowerCase().replaceAll(" ", "")}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center text-[#b5bac1]">
            <button
              type="button"
              className={cn(
                "rounded-md p-2 hover:bg-[#2e2f34] sm:p-1.5",
                isMicOn === false && "bg-[#3f292d] text-red-400 hover:bg-[#4a3136]",
              )}
              title="Microfone"
              onClick={onMic}
            >
              {isMicOn === false ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              className={cn(
                "rounded-md p-2 hover:bg-[#2e2f34] sm:p-1.5",
                isSharing && "bg-[#3f292d] text-red-400 hover:bg-[#4a3136]",
              )}
              title="Transmitir tela"
              onClick={onShare}
            >
              {isSharing ? (
                <MonitorOff className="h-4 w-4" />
              ) : (
                <Monitor className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              className={cn(
                "rounded-md p-2 hover:bg-[#2e2f34] sm:p-1.5",
                isDeafened && "bg-[#3f292d] text-red-400 hover:bg-[#4a3136]",
              )}
              title="Fone"
              onClick={onDeafen}
            >
              {isDeafened ? (
                <HeadphoneOff className="h-4 w-4" />
              ) : (
                <Headphones className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              className="rounded-md p-2 hover:bg-[#2e2f34] sm:p-1.5"
              title="Configurações"
              onClick={() => setSettingsOpen((value) => !value)}
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
        {settingsOpen && (
          <AudioSettingsPanel
            open
            onClose={() => setSettingsOpen(false)}
            inputDeviceId={audio?.inputDeviceId ?? ""}
            outputDeviceId={audio?.outputDeviceId ?? ""}
            outputVolume={audio?.outputVolume ?? 1}
            echoCancellation={audio?.echoCancellation ?? true}
            noiseSuppression={audio?.noiseSuppression ?? true}
            autoGainControl={audio?.autoGainControl ?? true}
            sensitivity={audio?.sensitivity ?? 18}
            onChange={(patch) => onAudioChange?.(patch)}
          />
        )}
      </div>
    </aside>
  );
}

export function VoiceRoom({ room: startRoom, access, userName, initialRooms }: VoiceRoomProps) {
  const { socket, connected } = useSocket();
  const leavingRef = useRef(false);
  const [room, setRoom] = useState(startRoom);
  const [idle, setIdle] = useState(!startRoom.id);
  const isMobile = useIsMobile();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isWatching, setIsWatching] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const chromeTimer = useRef(0);
  const pipVideoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const autoFullscreenRef = useRef(false);
  const [wantMic, setWantMic] = useState(false);
  const [wantShare, setWantShare] = useState(false);
  const [mediaGranted, setMediaGranted] = useState(getMediaGranted);
  const [audio, setAudio] = useState({
    inputDeviceId: "",
    outputDeviceId: "",
    outputVolume: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sensitivity: 18,
  });

  const session = useAnalysisRoom({
    mode: "voice",
    roomId: room.id,
    userId: access.userId,
    userName,
    role: access.role,
    token: access.token,
    socket,
    connected,
  });

  useEffect(() => {
    setIdle(!room.id);
  }, [room.id]);

  useEffect(() => {
    void syncBrowserMediaGrants().then(() => setMediaGranted(getMediaGranted()));
    const query = new URLSearchParams(window.location.search);
    const granted = getMediaGranted();
    if (query.get("mic") === "1" && !granted.mic) setWantMic(true);
    if (query.get("share") === "1" && !granted.share) setWantShare(true);
  }, []);

  useEffect(() => {
    if (!session.isMicOn) return;
    rememberMediaGranted({ mic: true });
    setMediaGranted(getMediaGranted());
    setWantMic(false);
  }, [session.isMicOn]);

  useEffect(() => {
    if (!session.isSharing) return;
    rememberMediaGranted({ share: true });
    setMediaGranted(getMediaGranted());
    setWantShare(false);
  }, [session.isSharing]);

  useEffect(() => {
    if (!room.id || room.number > 0) return;
    const listed = initialRooms?.find((item) => item.id === room.id);
    if (!listed) return;
    setRoom((current) => ({
      ...current,
      number: listed.number,
      name: roomTitle(listed.number),
      maxParticipants: listed.maxParticipants,
    }));
  }, [initialRooms, room.id, room.number]);

  useEffect(() => {
    const onPop = () => {
      leavingRef.current = false;
      setRoom(roomFromPath(window.location.pathname, initialRooms));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [initialRooms]);

  const showChrome = (ms: number) => {
    setChromeVisible(true);
    window.clearTimeout(chromeTimer.current);
    if (ms > 0) {
      chromeTimer.current = window.setTimeout(() => setChromeVisible(false), ms);
    }
  };

  const hideChrome = () => {
    window.clearTimeout(chromeTimer.current);
    setChromeVisible(false);
  };

  const shareScreen = async () => {
    if (session.isSharing) {
      await session.stopScreenShare();
      return;
    }
    const ok = await session.startScreenShare();
    if (!ok) return;
    setIsFullscreen(true);
    showChrome(isMobile ? 30_000 : 2_000);
  };

  const enterRoom = (item: SidebarRoom) => {
    leavingRef.current = false;
    session.unlockAudio();
    void session.enableMic();
    if (item.id === room.id && !idle) {
      setIsFullscreen(true);
      showChrome(isMobile ? 30_000 : 2_000);
      return;
    }
    leavingRef.current = false;
    if (room.id && !idle && room.id !== item.id) {
      session.leaveRoom({ keepMic: true });
      void fetch(`/api/rooms/${room.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave" }),
      });
    }
    setIsWatching(false);
    setRoom({
      id: item.id,
      name: roomTitle(item.number),
      number: item.number,
      maxParticipants: item.maxParticipants,
      occupiedAt: item.occupiedAt,
    });
    setIdle(false);
    if (isMobile) {
      setIsFullscreen(true);
      showChrome(30_000);
    }
    window.history.pushState(null, "", `/salas/${item.id}?n=${item.number}`);
  };

  const joinedMicForRoom = useRef("");
  useEffect(() => {
    if (idle || !session.joined || !room.id) {
      if (idle) joinedMicForRoom.current = "";
      return;
    }
    session.unlockAudio();
    if (joinedMicForRoom.current === room.id) return;
    joinedMicForRoom.current = room.id;
    void session.enableMic();
  }, [idle, room.id, session.joined, session.enableMic, session.unlockAudio]);

  const inCall = !idle && Boolean(room.id);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!inCall) {
      setCallStartedAt(null);
      autoFullscreenRef.current = false;
      setIsFullscreen(false);
      setIsWatching(false);
      setChromeVisible(true);
      return;
    }
    setCallStartedAt(Date.now());
  }, [inCall, room.id]);

  useEffect(() => {
    if (!inCall) return;
    if (isMobile && !autoFullscreenRef.current) {
      autoFullscreenRef.current = true;
      setIsFullscreen(true);
      showChrome(30_000);
    }
  }, [inCall, isMobile]);

  useEffect(() => {
    if (!isFullscreen) {
      setChromeVisible(true);
      window.clearTimeout(chromeTimer.current);
      return;
    }
    if (isMobile) {
      showChrome(30_000);
      return;
    }
    const bump = () => showChrome(2_000);
    bump();
    window.addEventListener("mousemove", bump);
    window.addEventListener("wheel", bump, { passive: true });
    return () => {
      window.removeEventListener("mousemove", bump);
      window.removeEventListener("wheel", bump);
    };
  }, [isFullscreen, isMobile]);

  useEffect(() => {
    return () => window.clearTimeout(chromeTimer.current);
  }, []);
  const title = room.number > 0 ? roomTitle(room.number) : "";

  const peopleMap = new Map(
    (inCall
      ? session.participants.length > 0
        ? session.participants
        : [
            {
              userId: access.userId,
              userName,
              role: access.role,
              isSharing: session.isSharing,
              micEnabled: session.isMicOn,
              speaking: session.isSpeaking,
              deafened: session.isDeafened,
              connected,
            },
          ]
      : []
    ).map((participant) => [participant.userId, participant]),
  );
  const people = Array.from(peopleMap.values()).map((participant) =>
    participant.userId === access.userId
      ? {
          ...participant,
          speaking: session.isSpeaking,
          deafened: session.isDeafened,
          micEnabled: session.isMicOn,
          isSharing: session.isSharing,
        }
      : participant,
  );

  const leaveAndGo = async () => {
    if (leavingRef.current || idle) return;
    leavingRef.current = true;
    const leavingId = room.id;
    setIdle(true);
    setRoom(emptyRoom());
    setIsFullscreen(false);
    setIsWatching(false);
    void exitNativeFullscreen();
    session.leaveRoom();
    try {
      if (leavingId) {
        await fetch(`/api/rooms/${leavingId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "leave" }),
        });
      }
    } catch {
      // A saída local já encerra a conexão.
    }
    window.history.pushState(null, "", "/salas");
    leavingRef.current = false;
  };

  useEffect(() => {
    if (!session.removedReason) return;
    void leaveAndGo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.removedReason]);

  const showStream =
    session.isSharing || (isWatching && session.hasRemoteStream && (isFullscreen || !isMobile));
  const showPip =
    isMobile && inCall && !isFullscreen && isWatching && Boolean(session.remoteStream);
  const canWatch = session.hasRemoteStream && !session.isSharing;
  const stageRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState<{ width: number; height: number } | null>(
    null,
  );

  useEffect(() => {
    if (!session.hasRemoteStream) setIsWatching(false);
  }, [session.hasRemoteStream]);

  useEffect(() => {
    const el = pipVideoRef.current;
    if (!el) return;
    if (showPip && session.remoteStream) {
      el.srcObject = session.remoteStream;
      void el.play().catch(() => undefined);
    } else if (el.srcObject) {
      el.srcObject = null;
    }
  }, [showPip, session.remoteStream]);

  useEffect(() => {
    const sync = () => {
      if (isMobile) return;
      const active = Boolean(nativeFullscreenElement());
      setIsFullscreen(active);
      if (active) showChrome(2_000);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isMobile) setIsFullscreen(false);
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
      window.removeEventListener("keydown", onKey);
    };
  }, [isMobile]);

  const toggleFullscreen = () => {
    if (isFullscreen) {
      void exitNativeFullscreen();
      setIsFullscreen(false);
      setChromeVisible(true);
      return;
    }
    setIsFullscreen(true);
    showChrome(isMobile ? 30_000 : 2_000);
    if (!isMobile && shellRef.current) {
      void enterNativeFullscreen(shellRef.current).catch(() => undefined);
    }
  };

  const startWatching = () => {
    setIsWatching(true);
    setIsFullscreen(true);
    showChrome(isMobile ? 30_000 : 2_000);
    if (!isMobile && shellRef.current) {
      void enterNativeFullscreen(shellRef.current).catch(() => undefined);
    }
  };

  useEffect(() => {
    if (!showStream) {
      setCardSize(null);
      return;
    }

    const stage = stageRef.current;
    const video = session.isSharing
      ? session.localVideoRef.current
      : session.remoteVideoRef.current;
    if (!stage || !video) return;

    const update = () => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;
      const maxW = stage.clientWidth;
      const maxH = stage.clientHeight;
      if (!maxW || !maxH) return;
      const scale = Math.min(maxW / vw, maxH / vh);
      setCardSize({
        width: Math.round(vw * scale),
        height: Math.round(vh * scale),
      });
    };

    update();
    video.addEventListener("loadedmetadata", update);
    video.addEventListener("resize", update);
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    const timer = window.setInterval(update, 400);
    return () => {
      video.removeEventListener("loadedmetadata", update);
      video.removeEventListener("resize", update);
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [session.hasRemoteStream, session.isSharing, showStream]);

  const askMic = Boolean(session.micHint) || (wantMic && !session.isMicOn && !mediaGranted.mic);
  const askShare =
    Boolean(session.shareHint) || (wantShare && !session.isSharing && !mediaGranted.share);

  const onSurfaceClick = (event: React.MouseEvent) => {
    if (!isFullscreen) return;
    if ((event.target as HTMLElement).closest("button")) {
      showChrome(isMobile ? 30_000 : 2_000);
      return;
    }
    if (isMobile) {
      if (chromeVisible) hideChrome();
      else showChrome(30_000);
      return;
    }
    showChrome(2_000);
  };

  return (
    <div
      ref={shellRef}
      className={cn(
        "relative flex min-h-0 min-w-0 max-w-full overflow-hidden bg-[#111214] text-zinc-100",
        isFullscreen ? "fixed inset-0 z-50 h-dvh w-screen" : "flex-1",
        isFullscreen && !chromeVisible && !isMobile && "cursor-none",
      )}
      onClick={onSurfaceClick}
    >
      {(session.error || askMic || askShare) && (
        <div className="absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] flex flex-col items-center gap-2">
          {session.error && (
            <div className="w-full max-w-md rounded-xl bg-black/80 px-4 py-3 text-center text-sm text-red-200 ring-1 ring-red-500/30">
              <p>{session.error}</p>
              <button
                type="button"
                className="mt-2 text-xs font-medium text-white underline"
                onClick={() => session.clearError()}
              >
                Fechar
              </button>
            </div>
          )}
          {askMic && (
            <div
              className="w-full max-w-md rounded-xl bg-black/80 px-4 py-3 text-center text-sm text-amber-100 ring-1 ring-amber-400/30"
              onClick={(event) => event.stopPropagation()}
            >
              <p>{session.micHint ?? "Toque para o celular pedir o microfone."}</p>
              <button
                type="button"
                className="mt-3 inline-flex rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black"
                onClick={(event) => {
                  event.stopPropagation();
                  session.unlockAudio();
                  void session.enableMic();
                }}
              >
                Permitir microfone
              </button>
            </div>
          )}
          {askShare && (
            <div
              className="w-full max-w-md rounded-xl bg-black/80 px-4 py-3 text-center text-sm text-amber-100 ring-1 ring-amber-400/30"
              onClick={(event) => event.stopPropagation()}
            >
              <p>{session.shareHint ?? "Toque para o celular pedir a transmissão de tela."}</p>
              {!session.shareHint?.includes("não pede transmissão de tela") && (
                <button
                  type="button"
                  className="mt-3 inline-flex rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black"
                  onClick={(event) => {
                    event.stopPropagation();
                    void session.startScreenShare().then((ok) => {
                      if (!ok) return;
                      setIsFullscreen(true);
                      showChrome(isMobile ? 30_000 : 2_000);
                    });
                  }}
                >
                  Permitir tela
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {!isFullscreen && (
      <RoomSidebar
        currentId={inCall ? room.id : ""}
        livePeople={
          inCall
            ? people.map((person) => ({
                userId: person.userId,
                userName: person.userName,
                isSharing: person.isSharing,
              }))
            : []
        }
        selfId={access.userId}
        userName={userName}
        callStartedAt={inCall ? callStartedAt : null}
        initialRooms={initialRooms}
        isMicOn={session.isMicOn}
        isDeafened={session.isDeafened}
        isSharing={session.isSharing}
        onMic={() => {
          session.unlockAudio();
          void session.toggleMic();
        }}
        onDeafen={session.toggleDeafen}
        onShare={() => {
          void shareScreen();
        }}
        onSelectRoom={enterRoom}
        audio={audio}
        onAudioChange={(patch) => {
          setAudio((current) => {
            const next = { ...current, ...patch };
            session.updateAudioConfig(next);
            return next;
          });
        }}
      />
      )}

      <div
        className={cn(
          "relative min-h-0 min-w-0 flex-1 flex-col bg-[#1c1c1c]",
          isFullscreen ? "flex" : "hidden md:flex",
        )}
      >
        {!isFullscreen && inCall && title && (
        <header className="flex items-center gap-3 px-4 py-3 sm:gap-5 sm:px-6 sm:py-4">
          <h1 className="truncate text-xl font-bold sm:text-2xl">{title}</h1>
        </header>
        )}

        {isFullscreen && inCall && title && (
          <header
            className={cn(
              "z-30 flex shrink-0 items-center justify-between gap-3 px-4",
              isMobile
                ? "pt-[max(0.75rem,env(safe-area-inset-top))] pb-2"
                : cn(
                    "pointer-events-none absolute inset-x-0 top-0 sm:px-6",
                    chromeVisible ? "opacity-100" : "opacity-0",
                  ),
            )}
          >
            <button
              type="button"
              className="flex min-w-0 items-center gap-1 text-left"
              onClick={() => {
                if (isMobile) setIsFullscreen(false);
              }}
            >
              <h1 className="truncate text-lg font-semibold drop-shadow-[0_2px_8px_rgba(0,0,0,0.65)] sm:text-2xl">
                {title}
              </h1>
              {isMobile && <ChevronDown className="h-5 w-5 shrink-0 text-white/80" />}
            </button>
            {isMobile && (
              <button
                type="button"
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg",
                  session.isDeafened ? "bg-white text-black" : "bg-white/10 text-white",
                )}
                title="Fone"
                onClick={session.toggleDeafen}
              >
                {session.isDeafened ? (
                  <HeadphoneOff className="h-5 w-5" />
                ) : (
                  <Headphones className="h-5 w-5" />
                )}
              </button>
            )}
          </header>
        )}

        <div
          ref={stageRef}
          className={cn(
            "relative flex min-h-0 min-w-0 flex-1 items-center justify-center",
            isFullscreen
              ? cn(
                  "overflow-hidden",
                  isMobile && "px-3 pb-2 pt-1",
                )
              : showStream
                ? "overflow-hidden px-3 pb-2 sm:px-6"
                : "overflow-visible px-3 pb-2 sm:px-6",
          )}
        >
          <div
            className={cn(
              "relative",
              showStream
                ? "overflow-hidden rounded-2xl bg-black"
                : "flex h-full min-h-0 w-full items-stretch justify-center",
              isFullscreen && showStream && "rounded-none",
            )}
            style={
              showStream
                ? isFullscreen
                  ? { width: "100%", height: "100%" }
                  : cardSize
                    ? { width: cardSize.width, height: cardSize.height }
                    : { width: "100%", height: "100%" }
                : undefined
            }
          >
            <video
              ref={session.localVideoRef}
              autoPlay
              muted
              playsInline
              className={
                session.isSharing
                  ? "h-full w-full bg-black object-contain"
                  : "pointer-events-none absolute h-0 w-0 opacity-0"
              }
            />
            <video
              ref={session.remoteVideoRef}
              autoPlay
              playsInline
              className={
                !session.isSharing && isWatching && session.hasRemoteStream
                  ? "h-full w-full object-contain"
                  : "pointer-events-none absolute h-0 w-0 opacity-0"
              }
            />

            {!inCall && !showStream ? (
              <div className="flex h-full w-full flex-col items-center justify-center px-4 text-center sm:px-6">
                <p className="text-base font-medium text-zinc-200 sm:text-lg">
                  Você não está em nenhuma call
                </p>
                <p className="mt-2 text-sm text-zinc-500">
                  Escolha uma sala na lista para entrar.
                </p>
              </div>
            ) : (
              !showStream &&
              (people.length <= 1 ? (
                <ParticipantTile
                  name={people[0]?.userName || userName}
                  muted={!people[0] || !people[0].micEnabled}
                  deafened={Boolean(people[0]?.deafened)}
                  speaking={Boolean(people[0]?.speaking)}
                  color={TILE_COLORS[0]}
                  className={cn(
                    "rounded-xl sm:rounded-2xl",
                    isMobile
                      ? "h-full w-full"
                      : "aspect-video h-auto w-full max-h-full max-w-5xl",
                  )}
                />
              ) : (
                <div
                  className={cn(
                    "grid min-h-0 w-full gap-2 sm:gap-3",
                    isMobile ? "h-full auto-rows-fr" : "h-full",
                    participantGridClass(people.length, isMobile),
                  )}
                >
                  {people.map((participant, index) => (
                    <ParticipantTile
                      key={participant.userId}
                      name={participant.userName}
                      muted={!participant.micEnabled}
                      deafened={Boolean(participant.deafened)}
                      speaking={Boolean(participant.speaking)}
                      color={TILE_COLORS[index % TILE_COLORS.length]}
                      className="h-full min-h-0"
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        {inCall && showStream && !isFullscreen && (
          <div className="flex justify-center gap-2 overflow-x-auto px-3 py-2 sm:gap-3 sm:px-6 sm:py-3">
            {people.map((participant, index) => (
              <ParticipantTile
                key={participant.userId}
                name={participant.userName}
                muted={!participant.micEnabled}
                deafened={Boolean(participant.deafened)}
                speaking={Boolean(participant.speaking)}
                color={TILE_COLORS[index % TILE_COLORS.length]}
                className="h-20 w-32 shrink-0 sm:h-[112px] sm:w-[188px]"
              />
            ))}
          </div>
        )}

        {inCall && (
        <div
          className={cn(
            "z-30 flex max-w-full items-end justify-center transition-opacity duration-200",
            isFullscreen
              ? isMobile
                ? "relative px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1"
                : cn(
                    "absolute inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] gap-2 px-2 sm:gap-8 sm:px-4",
                    chromeVisible ? "opacity-100" : "pointer-events-none opacity-0",
                  )
              : "relative flex-wrap gap-3 px-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:gap-8 sm:px-4 sm:pb-6",
          )}
        >
          {isMobile && isFullscreen ? (
            <div className="flex items-center justify-center gap-3 rounded-full bg-[#2c2c2e] px-3 py-2">
              <MobileCallButton
                label="Microfone"
                danger={!session.isMicOn}
                onClick={() => {
                  session.unlockAudio();
                  void session.toggleMic();
                }}
              >
                {session.isMicOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </MobileCallButton>
              <MobileCallButton
                label={session.isSharing ? "Parar de transmitir tela" : "Transmitir tela"}
                active={session.isSharing}
                onClick={
                  session.isSharing
                    ? () => void session.stopScreenShare()
                    : () => void shareScreen()
                }
              >
                {session.isSharing ? (
                  <MonitorOff className="h-5 w-5" />
                ) : (
                  <Monitor className="h-5 w-5" />
                )}
              </MobileCallButton>
              {canWatch && (
                <MobileCallButton
                  label={isWatching ? "Parar de assistir" : "Assistir transmissão"}
                  active={isWatching}
                  onClick={() => {
                    if (isWatching) setIsWatching(false);
                    else startWatching();
                  }}
                >
                  {isWatching ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </MobileCallButton>
              )}
              <MobileCallButton
                label="Desligar"
                danger
                onClick={() => void leaveAndGo()}
              >
                <PhoneOff className="h-5 w-5" />
              </MobileCallButton>
            </div>
          ) : (
            <>
          <ControlButton
            label="Microfone"
            danger={!session.isMicOn}
            onClick={() => {
              session.unlockAudio();
              void session.toggleMic();
            }}
          >
            {session.isMicOn ? (
              <Mic className="h-6 w-6" />
            ) : (
              <MicOff className="h-6 w-6" />
            )}
          </ControlButton>
          <ControlButton
            label={
              session.isSharing ? "Parar de transmitir tela" : "Transmitir tela"
            }
            onClick={
              session.isSharing ? () => void session.stopScreenShare() : () => void shareScreen()
            }
          >
            {session.isSharing ? (
              <MonitorOff className="h-6 w-6" />
            ) : (
              <Monitor className="h-6 w-6" />
            )}
          </ControlButton>
          {canWatch && (
            <ControlButton
              label={isWatching ? "Parar de assistir" : "Assistir transmissão"}
              onClick={() => {
                if (isWatching) setIsWatching(false);
                else startWatching();
              }}
            >
              {isWatching ? <EyeOff className="h-6 w-6" /> : <Eye className="h-6 w-6" />}
            </ControlButton>
          )}
          <ControlButton
            label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? (
              <Minimize2 className="h-6 w-6" />
            ) : (
              <Maximize2 className="h-6 w-6" />
            )}
          </ControlButton>
          <ControlButton label="Desligar" danger onClick={() => void leaveAndGo()}>
            <PhoneOff className="h-6 w-6" />
          </ControlButton>
            </>
          )}
        </div>
        )}
      </div>

      {showPip && (
        <button
          type="button"
          className="fixed top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] z-[60] h-[76px] w-[132px] overflow-hidden rounded-xl bg-black shadow-2xl ring-1 ring-white/15 sm:h-[92px] sm:w-[164px]"
          onClick={() => {
            setIsFullscreen(true);
            showChrome(30_000);
          }}
        >
          <video
            ref={pipVideoRef}
            autoPlay
            playsInline
            className="h-full w-full object-cover"
          />
        </button>
      )}
    </div>
  );
}
