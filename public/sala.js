// Sala de transmissão: transmissor (broadcaster) e espectadores (viewers)
// via WebRTC, com chat ao vivo, lista de participantes e barra de controles.

const roomId = decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "");

const $ = (id) => document.getElementById(id);
const video = $("video");
const idle = $("idle");
const statusEl = $("status");
const roomNameEl = $("roomName");
const partCountEl = $("partCount");
const partTabEl = $("partTab");

const shareBtn = $("shareBtn");
const camBtn = $("camBtn");
const videoSrcBtn = $("videoSrcBtn");
const micBtn = $("micBtn");
const deafenBtn = $("deafenBtn");
const volSlider = $("volSlider");
const volLabel = $("volLabel");
const hideBtn = $("hideBtn");
const fullBtn = $("fullBtn");
const stopBtn = $("stopBtn");
const leaveBtn = $("leaveBtn");

const copyRoomBtn = $("copyRoomBtn");
const switchRoomBtn = $("switchRoomBtn");

const chatMsgs = $("chatMsgs");
const chatForm = $("chatForm");
const chatInput = $("chatInput");
const partList = $("partList");
const nameInput = $("nameInput");
const nameSave = $("nameSave");

const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// Qualidade alvo: até 4K com bitrate alto.
const MAX_VIDEO_BITRATE = 20_000_000; // 20 Mbps
const VIDEO_4K = { width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 60 } };

let ws;
let myId = null;
let myName = localStorage.getItem("tt_name") || "";
let isBroadcaster = false;
let localStream = null;
let hidden = false;
const storedVol = localStorage.getItem("tt_vol");
let currentVol = storedVol === null ? 100 : Number(storedVol);
if (!Number.isFinite(currentVol)) currentVol = 100;
let lastVol = currentVol > 0 ? currentVol : 100;
const pcs = new Map(); // peerId -> RTCPeerConnection

roomNameEl.textContent = roomId || "sala";
nameInput.value = myName;

function setStatus(t) { statusEl.textContent = t; }
function sendWs(o) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); }
function signal(to, data) { sendWs({ type: "signal", to, data }); }

function closeAllPeers() {
  for (const pc of pcs.values()) pc.close();
  pcs.clear();
}

// ---------- WebRTC ----------
function newPeer(peerId) {
  const pc = new RTCPeerConnection(rtcConfig);
  pc.onicecandidate = (e) => { if (e.candidate) signal(peerId, { ice: e.candidate }); };
  if (!isBroadcaster) {
    pc.ontrack = (e) => {
      video.srcObject = e.streams[0];
      applyVolumeToVideo();
      idle.hidden = true;
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
  const videoTrack = localStream.getVideoTracks()[0];
  const audioTrack = localStream.getAudioTracks()[0];
  const vsender = videoTrack ? pc.addTrack(videoTrack, localStream) : null;
  if (audioTrack) pc.addTrack(audioTrack, localStream);

  // Força bitrate alto / mantém resolução (4K).
  if (vsender) {
    try {
      const p = vsender.getParameters();
      if (!p.encodings || !p.encodings.length) p.encodings = [{}];
      p.encodings[0].maxBitrate = MAX_VIDEO_BITRATE;
      p.encodings[0].maxFramerate = 60;
      p.degradationPreference = "maintain-resolution";
      await vsender.setParameters(p);
    } catch { /* alguns navegadores ignoram */ }
  }

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  signal(viewerId, { sdp: pc.localDescription });
}

async function onSignal(from, data) {
  if (data.sdp) {
    if (data.sdp.type === "offer") {
      const pc = pcs.get(from) || newPeer(from);
      await pc.setRemoteDescription(data.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signal(from, { sdp: pc.localDescription });
    } else if (data.sdp.type === "answer") {
      const pc = pcs.get(from);
      if (pc) await pc.setRemoteDescription(data.sdp);
    }
  } else if (data.ice) {
    const pc = pcs.get(from);
    if (pc) { try { await pc.addIceCandidate(data.ice); } catch {} }
  }
}

// ---------- Mensagens do servidor ----------
function onMessage(msg) {
  switch (msg.type) {
    case "welcome":
      myId = msg.id;
      if (!myName) { myName = msg.name; nameInput.value = myName; }
      else if (myName !== msg.name) sendWs({ type: "hello", name: myName });
      setStatus(msg.broadcasterId ? "Transmissão em andamento." : `Conectado à sala ${roomId}.`);
      break;

    case "participants":
      renderParticipants(msg.list);
      break;

    case "chat":
      addChat(msg.from.name, msg.text, msg.from.id === myId);
      break;

    case "broadcaster-available":
      if (!isBroadcaster) { idle.hidden = true; setStatus("Transmissão em andamento."); }
      break;

    case "broadcaster-gone":
      if (!isBroadcaster) {
        video.srcObject = null;
        idle.hidden = false;
        closeAllPeers();
        setStatus("A transmissão foi encerrada.");
      }
      break;

    case "viewer-joined":
      if (isBroadcaster) makeOfferTo(msg.id);
      break;

    case "viewer-left":
      if (isBroadcaster) {
        const pc = pcs.get(msg.id);
        if (pc) pc.close();
        pcs.delete(msg.id);
      }
      break;

    case "signal":
      onSignal(msg.from, msg.data);
      break;
  }
}

function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws?room=${encodeURIComponent(roomId)}`);
  ws.onopen = () => setStatus(`Conectado à sala ${roomId}.`);
  ws.onclose = () => setStatus("Desconectado. Recarregue a página.");
  ws.onerror = () => setStatus("Erro de conexão.");
  ws.onmessage = (ev) => { try { onMessage(JSON.parse(ev.data)); } catch {} };
}

// ---------- Chat / Participantes ----------
function addChat(name, text, mine) {
  const el = document.createElement("div");
  el.className = "chat-msg";
  const who = document.createElement("span");
  who.className = "who";
  who.textContent = (mine ? "Você" : name) + ":";
  el.appendChild(who);
  el.appendChild(document.createTextNode(" " + text));
  chatMsgs.appendChild(el);
  chatMsgs.scrollTop = chatMsgs.scrollHeight;
}

function renderParticipants(list) {
  partCountEl.textContent = `· ${list.length} participante${list.length === 1 ? "" : "s"}`;
  partTabEl.textContent = list.length;
  partList.innerHTML = "";
  for (const p of list) {
    const row = document.createElement("div");
    row.className = "part";
    const av = document.createElement("div");
    av.className = "avatar";
    av.textContent = (p.name || "?").charAt(0).toUpperCase();
    const nm = document.createElement("div");
    nm.className = "pname";
    nm.textContent = p.name + (p.id === myId ? " (você)" : "");
    row.appendChild(av);
    row.appendChild(nm);
    if (p.broadcasting) {
      const live = document.createElement("span");
      live.className = "live";
      live.textContent = "AO VIVO";
      row.appendChild(live);
    }
    partList.appendChild(row);
  }
}

// ---------- Transmitir ----------
function beginBroadcast(stream) {
  localStream = stream;
  isBroadcaster = true;
  video.srcObject = localStream;
  video.muted = true; // não ouvir o próprio áudio
  idle.hidden = true;
  shareBtn.hidden = camBtn.hidden = videoSrcBtn.hidden = true;
  stopBtn.hidden = false;
  micBtn.hidden = false;
  updateMicBtn();
  setStatus("Você está transmitindo.");
  sendWs({ type: "broadcast-start" });
  const vt = localStream.getVideoTracks()[0];
  if (vt) vt.addEventListener("ended", stopBroadcast);
}

async function startScreen() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    setStatus("Navegador sem suporte à captura de tela (ou site sem HTTPS).");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: VIDEO_4K,
      audio: { channelCount: 2, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    beginBroadcast(stream);
  } catch { setStatus("Captura de tela cancelada."); }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("Navegador sem suporte à câmera (ou site sem HTTPS).");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
      audio: true,
    });
    beginBroadcast(stream);
  } catch { setStatus("Acesso à câmera negado."); }
}

async function startVideoSource() {
  const url = prompt("Cole a URL DIRETA de um vídeo (ex.: .mp4). Funciona melhor com links que permitem CORS:");
  if (!url) return;
  const v = document.createElement("video");
  v.src = url;
  v.crossOrigin = "anonymous";
  v.muted = false;
  try {
    await v.play();
  } catch {
    setStatus("Não consegui reproduzir essa URL.");
    return;
  }
  if (!v.captureStream) { setStatus("Seu navegador não suporta captureStream."); return; }
  const stream = v.captureStream();
  v.onended = () => stopBroadcast();
  beginBroadcast(stream);
}

function stopBroadcast() {
  if (!isBroadcaster) return;
  sendWs({ type: "broadcast-stop" });
  if (localStream) for (const t of localStream.getTracks()) t.stop();
  closeAllPeers();
  isBroadcaster = false;
  localStream = null;
  video.srcObject = null;
  idle.hidden = false;
  shareBtn.hidden = camBtn.hidden = videoSrcBtn.hidden = false;
  stopBtn.hidden = true;
  micBtn.hidden = true;
  setStatus("Transmissão parada.");
}

// ---------- Controles ----------
function updateMicBtn() {
  const at = localStream?.getAudioTracks?.()[0];
  const on = at ? at.enabled : false;
  micBtn.textContent = on ? "🎙️" : "🔇";
  micBtn.classList.toggle("off", !on);
}

micBtn.onclick = () => {
  const at = localStream?.getAudioTracks?.()[0];
  if (!at) return;
  at.enabled = !at.enabled;
  updateMicBtn();
};

function applyVolumeToVideo() {
  if (isBroadcaster) { video.muted = true; return; } // não ouvir a própria transmissão
  video.muted = currentVol === 0;
  video.volume = Math.min(1, currentVol / 100);
}

function updateVolUI() {
  if (volSlider) volSlider.value = String(currentVol);
  if (volLabel) volLabel.textContent = currentVol + "%";
  deafenBtn.textContent = currentVol === 0 ? "🔇" : currentVol < 50 ? "🔉" : "🔊";
  deafenBtn.classList.toggle("off", currentVol === 0);
  deafenBtn.title = `Volume: ${currentVol}%`;
}

function setVolume(v, save = true) {
  currentVol = Math.max(0, Math.min(100, Math.round(v)));
  if (currentVol > 0) lastVol = currentVol;
  applyVolumeToVideo();
  updateVolUI();
  if (save) { try { localStorage.setItem("tt_vol", String(currentVol)); } catch {} }
}

// Arrastar o slider = mexer no volume ao vivo.
volSlider.oninput = () => setVolume(Number(volSlider.value));

// Clicar no ícone = mutar / voltar ao volume anterior.
deafenBtn.onclick = () => {
  if (currentVol > 0) setVolume(0);
  else setVolume(lastVol || 100);
};

updateVolUI();

hideBtn.onclick = () => {
  hidden = !hidden;
  video.style.visibility = hidden ? "hidden" : "visible";
  hideBtn.classList.toggle("off", hidden);
};

fullBtn.onclick = () => { if (video.requestFullscreen) video.requestFullscreen(); };

leaveBtn.onclick = () => {
  stopBroadcast();
  try { ws?.close(); } catch {}
  location.href = "/";
};

copyRoomBtn.onclick = async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    copyRoomBtn.textContent = "✅ Copiado!";
    setTimeout(() => (copyRoomBtn.textContent = "🔗 Compartilhar sala"), 1500);
  } catch { setStatus("Copie a URL da barra do navegador."); }
};

switchRoomBtn.onclick = () => {
  const code = prompt("Código da sala (ou deixe vazio para criar uma nova):");
  if (code === null) return;
  const id = code.trim() || Math.random().toString(36).slice(2, 8);
  location.href = `/sala/${encodeURIComponent(id)}`;
};

// ---------- Tabs ----------
document.querySelectorAll(".tab").forEach((t) => {
  t.onclick = () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    const which = t.dataset.tab;
    $("tab-chat").hidden = which !== "chat";
    $("tab-part").hidden = which !== "part";
  };
});

// ---------- Nome / Chat ----------
nameSave.onclick = () => {
  const n = nameInput.value.trim().slice(0, 24);
  if (!n) return;
  myName = n;
  localStorage.setItem("tt_name", n);
  sendWs({ type: "hello", name: n });
};

chatForm.onsubmit = (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  sendWs({ type: "chat", text });
  chatInput.value = "";
};

// ---------- Botões de compartilhar ----------
shareBtn.onclick = startScreen;
camBtn.onclick = startCamera;
videoSrcBtn.onclick = startVideoSource;

// ---------- Start ----------
if (!roomId) setStatus("Sala inválida.");
else connect();
