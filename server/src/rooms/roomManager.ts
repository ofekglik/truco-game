import { v4 as uuidv4 } from 'uuid';
import { GameState, SeatPosition, SEAT_ORDER, Player, GamePhase } from '../engine/types.js';
import { createInitialState } from '../engine/game.js';

export interface RoomSummary {
  code: string;           // internal ID, used by client to join but NOT displayed
  creatorName: string;
  creatorAvatar: string;
  playerCount: number;
  maxPlayers: number;
  targetScore: number;
  hasPassword: boolean;
}

export interface Room {
  code: string;
  state: GameState;
  socketToSeat: Map<string, SeatPosition>;
  seatToSocket: Map<SeatPosition, string>;
  password?: string;
  creatorName: string;
  createdAt: number;
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

export function createRoom(socketId: string, playerName: string, avatar: string = '', password?: string, supabaseUserId?: string): { room: Room; seat: SeatPosition } | null {
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
    avatar,
    supabaseUserId: supabaseUserId || undefined,
  };

  const room: Room = {
    code,
    state,
    socketToSeat: new Map([[socketId, seat]]),
    seatToSocket: new Map([[seat, socketId]]),
    password: password && password.trim() ? password.trim() : undefined,
    creatorName: playerName,
    createdAt: Date.now(),
  };

  rooms.set(code, room);
  socketToRoom.set(socketId, code);

  return { room, seat };
}

export function joinRoom(roomCode: string, socketId: string, playerName: string, avatar: string = '', password?: string, supabaseUserId?: string): { room: Room; seat: SeatPosition } | { error: string } {
  const room = rooms.get(roomCode.toUpperCase());
  if (!room) return { error: 'חדר לא נמצא' };

  // Check if reconnecting — first try by supabaseUserId (most reliable), then by name
  // Works in ALL phases (WAITING, active game, etc.)

  // Try matching by Supabase userId first (for authenticated users)
  if (supabaseUserId) {
    for (const seat of SEAT_ORDER) {
      const player = room.state.players[seat];
      if (player && player.supabaseUserId === supabaseUserId) {
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
        console.log(`[roomManager] Reconnected by userId ${supabaseUserId} to seat ${seat} in phase ${room.state.phase}`);
        return { room, seat };
      }
    }
  }

  // Fall back to name matching (for guests or if userId didn't match)
  const normalizedName = playerName.trim().toLowerCase();
  for (const seat of SEAT_ORDER) {
    const player = room.state.players[seat];
    if (player && player.name.trim().toLowerCase() === normalizedName) {
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
      // Update supabaseUserId if the player now has one (e.g. was guest before)
      if (supabaseUserId) player.supabaseUserId = supabaseUserId;
      console.log(`[roomManager] Reconnected ${playerName} to seat ${seat} in phase ${room.state.phase} (socket ${socketId})`);
      return { room, seat };
    }
  }

  // Not a reconnection — if game already started, reject new joins
  if (room.state.phase !== GamePhase.WAITING) {
    return { error: 'המשחק כבר התחיל' };
  }

  // Prevent duplicate names in same room
  for (const seat of SEAT_ORDER) {
    const player = room.state.players[seat];
    if (player && player.name.trim().toLowerCase() === normalizedName) {
      return { error: 'שם זה כבר תפוס בחדר' };
    }
  }

  // Validate password if room has one
  if (room.password) {
    if (!password || password.trim() !== room.password) {
      return { error: 'סיסמה שגויה' };
    }
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
    avatar,
    supabaseUserId: supabaseUserId || undefined,
  };

  room.socketToSeat.set(socketId, emptySeat);
  room.seatToSocket.set(emptySeat, socketId);
  socketToRoom.set(socketId, room.code);

  return { room, seat: emptySeat };
}

export function listRooms(): RoomSummary[] {
  const summaries: RoomSummary[] = [];
  for (const [code, room] of rooms) {
    if (room.state.phase !== GamePhase.WAITING) continue;

    const playerCount = SEAT_ORDER.filter(s => room.state.players[s] !== null).length;
    if (playerCount >= 4) continue; // Don't show full rooms

    // Find creator's avatar from players
    let creatorAvatar = '';
    for (const seat of SEAT_ORDER) {
      const player = room.state.players[seat];
      if (player && player.name === room.creatorName) {
        creatorAvatar = player.avatar;
        break;
      }
    }

    summaries.push({
      code,
      creatorName: room.creatorName,
      creatorAvatar,
      playerCount,
      maxPlayers: 4,
      targetScore: room.state.targetScore,
      hasPassword: !!room.password,
    });
  }
  return summaries.sort((a, b) => b.playerCount - a.playerCount); // Show fuller rooms first
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
  room.seatToSocket.delete(seat);
  socketToRoom.delete(socketId);

  // Check if room is empty
  const connectedPlayers = SEAT_ORDER.filter(s => room.state.players[s]?.connected);
  if (connectedPlayers.length === 0) {
    // In WAITING phase, delete room immediately
    // In active game, keep the room alive for a bit (grace period handled by caller)
    if (room.state.phase === GamePhase.WAITING) {
      rooms.delete(code);
      return null;
    }
    // For active games, keep room alive so players can reconnect
    // Room will be cleaned up eventually if no one returns
  }

  return { room, seat };
}

export function isRoomFull(room: Room): boolean {
  return SEAT_ORDER.every(s => room.state.players[s] !== null);
}

export function swapSeat(socketId: string, targetSeat: SeatPosition): { room: Room; oldSeat: SeatPosition } | null {
  const code = socketToRoom.get(socketId);
  if (!code) return null;

  const room = rooms.get(code);
  if (!room) return null;

  // Only allow swapping during WAITING phase
  if (room.state.phase !== GamePhase.WAITING) return null;

  const currentSeat = room.socketToSeat.get(socketId);
  if (!currentSeat || currentSeat === targetSeat) return null;

  const currentPlayer = room.state.players[currentSeat];
  if (!currentPlayer) return null;

  const targetPlayer = room.state.players[targetSeat];

  if (targetPlayer) {
    // Mutual swap: exchange both players
    const targetSocketId = room.seatToSocket.get(targetSeat);

    // Swap player objects
    room.state.players[currentSeat] = targetPlayer;
    room.state.players[targetSeat] = currentPlayer;

    // Update seat fields
    currentPlayer.seat = targetSeat;
    targetPlayer.seat = currentSeat;

    // Update socket mappings
    room.socketToSeat.set(socketId, targetSeat);
    room.seatToSocket.set(targetSeat, socketId);

    if (targetSocketId) {
      room.socketToSeat.set(targetSocketId, currentSeat);
      room.seatToSocket.set(currentSeat, targetSocketId);
    }
  } else {
    // Move to empty seat
    currentPlayer.seat = targetSeat;

    room.socketToSeat.set(socketId, targetSeat);
    room.seatToSocket.delete(currentSeat);
    room.seatToSocket.set(targetSeat, socketId);

    room.state.players[currentSeat] = null;
    room.state.players[targetSeat] = currentPlayer;
  }

  return { room, oldSeat: currentSeat };
}

export function updateRoomSettings(socketId: string, settings: { targetScore: number }): { room: Room } | null {
  const code = socketToRoom.get(socketId);
  if (!code) return null;

  const room = rooms.get(code);
  if (!room) return null;

  // Only allow changing settings during WAITING phase
  if (room.state.phase !== GamePhase.WAITING) return null;

  // Validate settings — clamp to valid range
  if (settings.targetScore && Number.isInteger(settings.targetScore) && settings.targetScore >= 500 && settings.targetScore <= 2000) {
    room.state.targetScore = settings.targetScore;
  }

  return { room };
}

export function deleteRoom(code: string): void {
  rooms.delete(code);
}

export function leaveRoom(socketId: string): { room: Room; seat: SeatPosition } | null {
  const code = socketToRoom.get(socketId);
  if (!code) return null;

  const room = rooms.get(code);
  if (!room) return null;

  const seat = room.socketToSeat.get(socketId);
  if (!seat) return null;

  // During WAITING phase, completely remove player and their seat
  if (room.state.phase === GamePhase.WAITING) {
    room.state.players[seat] = null;
    room.socketToSeat.delete(socketId);
    room.seatToSocket.delete(seat);
    socketToRoom.delete(socketId);

    // Check if room is empty
    const anyPlayers = SEAT_ORDER.some(s => room.state.players[s] !== null);
    if (!anyPlayers) {
      rooms.delete(code);
      return null;
    }
  } else {
    // During active game, just mark as disconnected (same as removePlayer)
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
  }

  return { room, seat };
}
