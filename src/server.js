// ------------------------------------------------------------------
// Servidor web: serve as páginas e faz a sinalização WebRTC (WebSocket),
// além de chat ao vivo e lista de participantes da sala.
// 1 pessoa transmite (broadcaster) -> várias assistem (viewers).
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
  for (const [id, c] of room.clients) {
    if (id !== exceptId) send(c.ws, obj);
  }
}

function clean(str, max) {
  return String(str ?? "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function participantsList(room) {
  const list = [];
  for (const [id, c] of room.clients) {
    list.push({ id, name: c.name, broadcasting: id === room.broadcasterId });
  }
  return list;
}

function sendParticipants(room) {
  broadcast(room, { type: "participants", list: participantsList(room) });
}

export function startServer() {
  const app = express();
  app.use(express.static(publicDir));
  app.get("/", (_req, res) => res.sendFile(path.join(publicDir, "home.html")));
  app.get("/healthz", (_req, res) => res.send("ok"));

  // Configuração de ICE (STUN + TURN). O TURN vem de variáveis de ambiente,
  // então dá pra ativá-lo sem mexer no código:
  //   TURN_URLS=turn:host:3478,turns:host:5349   TURN_USERNAME=...   TURN_CREDENTIAL=...
  app.get("/ice", (_req, res) => {
    const iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
    if (process.env.TURN_URLS) {
      const urls = process.env.TURN_URLS.split(",").map((s) => s.trim()).filter(Boolean);
      if (urls.length) {
        iceServers.push({
          urls,
          username: process.env.TURN_USERNAME ?? "",
          credential: process.env.TURN_CREDENTIAL ?? "",
        });
      }
    }
    res.json({ iceServers });
  });
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
    const guest = `Convidado-${clientId.slice(0, 4)}`;
    room.clients.set(clientId, { ws, name: guest });

    send(ws, { type: "welcome", id: clientId, name: guest, broadcasterId: room.broadcasterId });

    if (room.broadcasterId && room.broadcasterId !== clientId) {
      const b = room.clients.get(room.broadcasterId);
      if (b) send(b.ws, { type: "viewer-joined", id: clientId });
    }

    sendParticipants(room);

    ws.on("message", (buf) => {
      let msg;
      try {
        msg = JSON.parse(buf.toString());
      } catch {
        return;
      }

      const me = room.clients.get(clientId);
      if (!me) return;

      switch (msg.type) {
        case "hello": {
          const name = clean(msg.name, 24);
          if (name) me.name = name;
          sendParticipants(room);
          break;
        }

        case "chat": {
          const text = clean(msg.text, 500);
          if (!text) break;
          broadcast(room, {
            type: "chat",
            from: { id: clientId, name: me.name },
            text,
            ts: Date.now(),
          });
          break;
        }

        case "broadcast-start": {
          room.broadcasterId = clientId;
          broadcast(room, { type: "broadcaster-available", id: clientId }, clientId);
          for (const [id] of room.clients) {
            if (id !== clientId) send(ws, { type: "viewer-joined", id });
          }
          sendParticipants(room);
          break;
        }

        case "broadcast-stop": {
          if (room.broadcasterId === clientId) {
            room.broadcasterId = null;
            broadcast(room, { type: "broadcaster-gone" }, clientId);
            sendParticipants(room);
          }
          break;
        }

        case "signal": {
          const target = room.clients.get(msg.to);
          if (target) send(target.ws, { type: "signal", from: clientId, data: msg.data });
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
        if (b) send(b.ws, { type: "viewer-left", id: clientId });
      }
      if (room.clients.size === 0) {
        deleteRoom(roomId);
      } else {
        sendParticipants(room);
      }
    });
  });

  server.listen(config.port, () => {
    console.log(`🌐 Servidor web rodando em ${config.publicUrl}`);
  });

  // Keep-alive: se-pinga a cada 10 min para o plano grátis não hibernar (24/7).
  if (/^https?:\/\//.test(config.publicUrl) && !config.publicUrl.includes("localhost")) {
    const healthUrl = `${config.publicUrl}/healthz`;
    setInterval(() => {
      fetch(healthUrl).catch(() => {});
    }, 10 * 60 * 1000);
    console.log("⏰ Keep-alive ativado (auto-ping a cada 10 min).");
  }
}
