"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function useSocket() {
  const [instance, setInstance] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!socket) {
      socket = io({
        path: "/api/socket",
        autoConnect: true,
        transports: ["polling", "websocket"],
        rememberUpgrade: false,
        timeout: 20000,
      });
    }
    setInstance(socket);
    const current = socket;
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    current.on("connect", onConnect);
    current.on("disconnect", onDisconnect);
    setConnected(current.connected);
    return () => {
      current.off("connect", onConnect);
      current.off("disconnect", onDisconnect);
    };
  }, []);

  return { socket: instance, connected };
}

export function getSharedSocket() {
  return socket;
}
