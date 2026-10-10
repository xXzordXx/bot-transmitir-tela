// Cliente da sala: implementa transmissor (broadcaster) e espectador (viewer)
// usando WebRTC. A sinalização passa pelo WebSocket do servidor.

const roomId = decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "");

const statusEl = document.getElementById("status");
const video = document.getElementById("video");
const placeholder = document.getElementById("placeholder");
const shareBtn = document.getElementById("shareBtn");
const camBtn = document.getElementById("camBtn");
const stopBtn = document.getElementById("stopBtn");
const fullBtn = document.getElementById("fullBtn");
const viewersEl = document.getElementById("viewers");

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

let ws;
let myId = null;
let isBroadcaster = false;
let localStream = null;
let viewerCount = 0;
const pcs = new Map(); // peerId -> RTCPeerConnection

function setStatus(t) {
  statusEl.textContent = t;
}

function sendWs(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function signal(to, data) {
  sendWs({ type: "signal", to, data });
}

function closeAllPeers() {
  for (const pc of pcs.values()) pc.close();
  pcs.clear();
}

function updateViewers(delta) {
  viewerCount = Math.max(0, viewerCount + delta);
  viewersEl.textContent = isBroadcaster ? `👁️ ${viewerCount} assistindo` : "";
}

function newPeer(peerId) {
  const pc = new RTCPeerConnection(rtcConfig);

  pc.onicecandidate = (e) => {
    if (e.candidate) signal(peerId, { ice: e.candidate });
  };

  // Só o espectador recebe mídia.
  if (!isBroadcaster) {
    pc.ontrack = (e) => {
      video.srcObject = e.streams[0];
      video.muted = false;
      placeholder.hidden = true;
    };
  }

  pc.onconnectionstatechange = () => {
    if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
      pc.close();
      pcs.delete(peerId);
    }
  };

  pcs.set(peerId, pc);
  return pc;
}

async function makeOfferTo(viewerId) {
  const pc = newPeer(viewerId);
  for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  signal(viewerId, { sdp: pc.localDescription });
}

async function onSignal(from, data) {
  if (data.sdp) {
    if (data.sdp.type === "offer") {
      // Espectador recebendo oferta do transmissor.
      const pc = pcs.get(from) || newPeer(from);
      await pc.setRemoteDescription(data.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signal(from, { sdp: pc.localDescription });
    } else if (data.sdp.type === "answer") {
      // Transmissor recebendo resposta do espectador.
      const pc = pcs.get(from);
      if (pc) await pc.setRemoteDescription(data.sdp);
    }
  } else if (data.ice) {
    const pc = pcs.get(from);
    if (pc) {
      try {
        await pc.addIceCandidate(data.ice);
      } catch {
        /* candidato pode chegar fora de ordem; ignorar */
      }
    }
  }
}

function onMessage(msg) {
  switch (msg.type) {
    case "welcome":
      myId = msg.id;
      if (msg.broadcasterId) {
        setStatus("Transmissão em andamento.");
        placeholder.textContent = "Carregando transmissão...";
      } else {
        setStatus(`Conectado à sala ${roomId}. Ninguém transmitindo ainda.`);
      }
      break;

    case "broadcaster-available":
      if (!isBroadcaster) {
        placeholder.textContent = "Carregando transmissão...";
        shareBtn.hidden = true;
        setStatus("Transmissão em andamento.");
      }
      break;

    case "broadcaster-gone":
      if (!isBroadcaster) {
        video.srcObject = null;
        placeholder.hidden = false;
        placeholder.textContent = "Transmissão encerrada.";
        shareBtn.hidden = false;
        closeAllPeers();
        setStatus("A transmissão foi encerrada.");
      }
      break;

    case "viewer-joined":
      if (isBroadcaster) {
        makeOfferTo(msg.id);
        updateViewers(+1);
      }
      break;

    case "viewer-left":
      if (isBroadcaster) {
        const pc = pcs.get(msg.id);
        if (pc) pc.close();
        pcs.delete(msg.id);
        updateViewers(-1);
      }
      break;

    case "signal":
      onSignal(msg.from, msg.data);
      break;

    default:
      break;
  }
}

function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws?room=${encodeURIComponent(roomId)}`);
  ws.onopen = () => setStatus(`Conectado à sala ${roomId}.`);
  ws.onclose = () => setStatus("Desconectado. Recarregue a página para reconectar.");
  ws.onerror = () => setStatus("Erro de conexão.");
  ws.onmessage = (ev) => {
    try {
      onMessage(JSON.parse(ev.data));
    } catch {
      /* ignora */
    }
  };
}

async function startScreen() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    setStatus("Seu navegador não suporta captura de tela (ou o site não está em HTTPS).");
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
  } catch {
    setStatus("Captura de tela cancelada.");
    return;
  }
  beginBroadcast(stream);
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus("Seu navegador não suporta câmera (ou o site não está em HTTPS).");
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch {
    setStatus("Acesso à câmera negado.");
    return;
  }
  beginBroadcast(stream);
}

function beginBroadcast(stream) {
  localStream = stream;
  isBroadcaster = true;
  video.srcObject = localStream;
  video.muted = true; // evita eco da própria captura
  placeholder.hidden = true;
  shareBtn.hidden = true;
  camBtn.hidden = true;
  stopBtn.hidden = false;
  viewerCount = 0;
  updateViewers(0);
  setStatus("Você está transmitindo.");

  sendWs({ type: "broadcast-start" });

  // Para quando o usuário clica em "Parar de compartilhar" na barra do navegador.
  localStream.getVideoTracks()[0].addEventListener("ended", stopBroadcast);
}

function stopBroadcast() {
  if (!isBroadcaster) return;
  sendWs({ type: "broadcast-stop" });
  if (localStream) for (const t of localStream.getTracks()) t.stop();
  closeAllPeers();
  isBroadcaster = false;
  localStream = null;
  video.srcObject = null;
  placeholder.hidden = false;
  placeholder.textContent = "Aguardando transmissão...";
  shareBtn.hidden = false;
  camBtn.hidden = false;
  stopBtn.hidden = true;
  viewersEl.textContent = "";
  setStatus("Transmissão parada.");
}

shareBtn.onclick = startScreen;
camBtn.onclick = startCamera;
stopBtn.onclick = stopBroadcast;
fullBtn.onclick = () => {
  if (video.requestFullscreen) video.requestFullscreen();
};

if (!roomId) {
  setStatus("Sala inválida.");
} else {
  connect();
}
