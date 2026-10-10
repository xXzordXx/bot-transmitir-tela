// Registro de salas em memória.
// Cada sala: { id, createdAt, clients: Map<clientId, ws>, broadcasterId }

const rooms = new Map();
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // sem caracteres ambíguos

export function genRoomId(len = 6) {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export function getOrCreateRoom(id) {
  let room = rooms.get(id);
  if (!room) {
    room = { id, createdAt: Date.now(), clients: new Map(), broadcasterId: null };
    rooms.set(id, room);
  }
  return room;
}

export function deleteRoom(id) {
  rooms.delete(id);
}
