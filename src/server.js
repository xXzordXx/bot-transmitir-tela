// ------------------------------------------------------------------
// Servidor web: serve as páginas e faz a sinalização WebRTC (WebSocket).
// 1 pessoa transmite a tela (broadcaster) -> várias assistem (viewers).
// ------------------------------------------------------------------
import express from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "./config.js";
import { getOrCreateRoom, deleteRoom } from "./rooms.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(room, obj, exceptId) {
  for (const [id, client] of room.clients) {
    if (id !== exceptId) send(client, obj);
  }
}

export function startServer() {
  const app = express();
  app.use(express.static(publicDir));
  app.get("/", (_req, res) => res.sendFile(path.join(publicDir, "home.html")));
  app.get("/sala/:id", (_req, res) => res.sendFile(path.join(publicDir, "sala.html")));

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://localhost");
    const roomId = url.searchParams.get("room");
    if (!roomId) {
      ws.close();
      return;
    }

    const room = getOrCreateRoom(roomId);
    const clientId = Math.random().toString(36).slice(2, 10);
    room.clients.set(clientId, ws);

    send(ws, { type: "welcome", id: clientId, broadcasterId: room.broadcasterId });

    // Se já existe transmissão, avisa o broadcaster que entrou mais um espectador.
    if (room.broadcasterId && room.broadcasterId !== clientId) {
      const b = room.clients.get(room.broadcasterId);
      if (b) send(b, { type: "viewer-joined", id: clientId });
    }

    ws.on("message", (buf) => {
      let msg;
      try {
        msg = JSON.parse(buf.toString());
      } catch {
        return;
      }

      switch (msg.type) {
        case "broadcast-start": {
          room.broadcasterId = clientId;
          // Avisa todos os espectadores que há transmissão...
          broadcast(room, { type: "broadcaster-available", id: clientId }, clientId);
          // ...e avisa o broadcaster sobre os espectadores que já estavam na sala.
          for (const [id] of room.clients) {
            if (id !== clientId) send(ws, { type: "viewer-joined", id });
          }
          break;
        }
        case "broadcast-stop": {
          if (room.broadcasterId === clientId) {
            room.broadcasterId = null;
            broadcast(room, { type: "broadcaster-gone" }, clientId);
          }
          break;
        }
        case "signal": {
          const target = room.clients.get(msg.to);
          if (target) send(target, { type: "signal", from: clientId, data: msg.data });
          break;
        }
        default:
          break;
      }
    });

    ws.on("close", () => {
      room.clients.delete(clientId);
      if (room.broadcasterId === clientId) {
        room.broadcasterId = null;
        broadcast(room, { type: "broadcaster-gone" }, clientId);
      } else if (room.broadcasterId) {
        const b = room.clients.get(room.broadcasterId);
        if (b) send(b, { type: "viewer-left", id: clientId });
      }
      if (room.clients.size === 0) deleteRoom(roomId);
    });
  });

  server.listen(config.port, () => {
    console.log(`🌐 Servidor web rodando em ${config.publicUrl}`);
  });
}
