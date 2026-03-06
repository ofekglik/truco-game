import { v4 as uuidv4 } from 'uuid';
import { GameState, SeatPosition, SEAT_ORDER, Player, GamePhase } from '../engine/types.js';
import { createInitialState } from '../engine/game.js';

export interface Room {
  code: string;
  state: GameState;
  socketToSeat: Map<string, SeatPosition>;
  seatToSocket: Map<SeatPosition, string>;
}

const rooms = new Map<string, Room>();
const socketToRoom = new Map<string, string>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function createRoom(socketId: string, playerName: string): { room: Room; seat: SeatPosition } | null {
  let code = generateRoomCode();
  while (rooms.has(code)) code = generateRoomCode();
  
  const state = createInitialState();
  const seat: SeatPosition = 'south';
  
  state.players[seat] = {
    id: socketId,
    name: playerName,
    seat,
    hand: [],
    connected: true,
  };
  
  const room: Room = {
    code,
    state,
    socketToSeat: new Map([[socketId, seat]]),
    seatToSocket: new Map([[seat, socketId]]),
  };
  
  rooms.set(code, room);
  socketToRoom.set(socketId, code);
  
  return { room, seat };
}

export function joinRoom(roomCode: string, socketId: string, playerName: string): { room: Room; seat: SeatPosition } | { error: string } {
  const room = rooms.get(roomCode.toUpperCase());
  if (!room) return { error: 'חדר לא נמצא' };

  if (room.state.phase !== GamePhase.WAITING) {
    // Check if reconnecting — match by name (case-insensitive, trimmed)
    const normalizedName = playerName.trim().toLowerCase();
    for (const seat of SEAT_ORDER) {
      const player = room.state.players[seat];
      if (player && player.name.trim().toLowerCase() === normalizedName) {
        // Reconnect — allow even if still marked connected (socket might have changed)
        const oldSid = room.seatToSocket.get(seat);
        if (oldSid) {
          room.socketToSeat.delete(oldSid);
          socketToRoom.delete(oldSid);
        }
        room.seatToSocket.set(seat, socketId);
        room.socketToSeat.set(socketId, seat);
        socketToRoom.set(socketId, room.code);
        player.id = socketId;
        player.connected = true;
        console.log(`[roomManager] Reconnected ${playerName} to seat ${seat} (socket ${socketId})`);
        return { room, seat };
      }
    }
    return { error: 'המשחק כבר התחיל' };
  }
  
  // Find empty seat
  const seatOrder: SeatPosition[] = ['east', 'north', 'west', 'south'];
  let emptySeat: SeatPosition | null = null;
  for (const s of seatOrder) {
    if (!room.state.players[s]) {
      emptySeat = s;
      break;
    }
  }
  
  if (!emptySeat) return { error: 'החדר מלא' };
  
  room.state.players[emptySeat] = {
    id: socketId,
    name: playerName,
    seat: emptySeat,
    hand: [],
    connected: true,
  };
  
  room.socketToSeat.set(socketId, emptySeat);
  room.seatToSocket.set(emptySeat, socketId);
  socketToRoom.set(socketId, room.code);
  
  return { room, seat: emptySeat };
}

export function getRoom(socketId: string): Room | null {
  const code = socketToRoom.get(socketId);
  if (!code) return null;
  return rooms.get(code) || null;
}

export function getRoomByCode(code: string): Room | null {
  return rooms.get(code.toUpperCase()) || null;
}

export function removePlayer(socketId: string): { room: Room; seat: SeatPosition } | null {
  const code = socketToRoom.get(socketId);
  if (!code) return null;
  
  const room = rooms.get(code);
  if (!room) return null;
  
  const seat = room.socketToSeat.get(socketId);
  if (!seat) return null;
  
  const player = room.state.players[seat];
  if (player) {
    player.connected = false;
  }
  
  room.socketToSeat.delete(socketId);
  socketToRoom.delete(socketId);
  
  // Check if room is empty
  const connectedPlayers = SEAT_ORDER.filter(s => room.state.players[s]?.connected);
  if (connectedPlayers.length === 0) {
    rooms.delete(code);
    return null;
  }
  
  return { room, seat };
}

export function isRoomFull(room: Room): boolean {
  return SEAT_ORDER.every(s => room.state.players[s] !== null);
}
