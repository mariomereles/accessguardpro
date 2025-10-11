import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function connectWebSocket() {
  if (socket) return socket;

  socket = io({
    path: "/socket.io",
  });

  socket.on("connect", () => {
    console.log("WebSocket connected");
  });

  socket.on("disconnect", () => {
    console.log("WebSocket disconnected");
  });

  return socket;
}

export function subscribeToEvent(eventId: string, callback: (data: any) => void) {
  const ws = connectWebSocket();
  
  ws.emit("subscribe:event", eventId);
  ws.on("update", callback);

  return () => {
    ws.off("update", callback);
  };
}

export function disconnectWebSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
