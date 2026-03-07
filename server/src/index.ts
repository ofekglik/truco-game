import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  createRoom, joinRoom, getRoom, getRoomByCode, removePlayer, isRoomFull, swapSeat, updateRoomSettings, leaveRoom, listRooms, type Room
} from './rooms/roomManager.js';
import {
  startRound, placeBid, declareTrump, singCante, doneSinging, playCard, nextRound, getClientState
} from './engine/game.js';
import { GamePhase, SEAT_ORDER, SeatPosition, Suit } from './engine/types.js';
import { supabase, isSupabaseConfigured } from './lib/supabase.js';

const app = express();
app.use(cors());

// Serve built React client
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const clientDist = join(__dirname, '../../client/dist');

// Cache-busting: no-cache for HTML, long cache for hashed assets
app.use(express.static(clientDist, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (filePath.includes('/assets/')) {
      // Vite hashed assets — safe to cache long-term
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

// Socket.IO auth middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;

  if (!isSupabaseConfigured()) {
    // Supabase not configured - allow anonymous connections
    socket.data.userId = null;
    socket.data.isAuthenticated = false;
    return next();
  }

  if (!token) {
    // No token provided - allow anonymous connections for backward compatibility
    socket.data.userId = null;
    socket.data.isAuthenticated = false;
    return next();
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      socket.data.userId = null;
      socket.data.isAuthenticated = false;
      return next();
    }
    socket.data.userId = user.id;
    socket.data.isAuthenticated = true;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    socket.data.userId = null;
    socket.data.isAuthenticated = false;
    next();
  }
});

// Turn timer system: Map<roomCode, Map<seat, timeoutId>>
const turnTimers = new Map<string, Map<SeatPosition, NodeJS.Timeout>>();

// Disconnect grace period: Map<socketId, timeoutId>
// Gives players time to reconnect (e.g. page refresh) before removing them
const disconnectTimers = new Map<string, NodeJS.Timeout>();
const DISCONNECT_GRACE_MS = 15000; // 15 seconds

function broadcastState(room: Room | null) {
  if (!room) return;
  for (const seat of SEAT_ORDER) {
    const socketId = room.seatToSocket.get(seat);
    if (socketId) {
      const clientState = getClientState(room.state, seat);
      io.to(socketId).emit('gameState', clientState);
    }
  }

  // Set up turn timer if needed
  setUpTurnTimer(room);
}

function setUpTurnTimer(room: Room) {
  const { code, state } = room;

  // Clear existing timers for this room
  const roomTimers = turnTimers.get(code);
  if (roomTimers) {
    roomTimers.forEach(timer => clearTimeout(timer));
    roomTimers.clear();
  }

  // Set new timer if in a phase that needs one
  const phasesNeedingTimer = [GamePhase.BIDDING, GamePhase.TRICK_PLAY, GamePhase.TRUMP_DECLARATION, GamePhase.SINGING];
  if (phasesNeedingTimer.includes(state.phase)) {
    // Snapshot state at timer creation to detect stale timers
    const timerPhase = state.phase;
    const timerSeat = state.currentTurnSeat;
    const timerRound = state.roundNumber;
    const timerTrick = state.trickNumber;

    const timer = setTimeout(() => {
      // Verify this timer is still relevant (not stale)
      if (state.phase !== timerPhase || state.currentTurnSeat !== timerSeat ||
          state.roundNumber !== timerRound || state.trickNumber !== timerTrick) {
        console.log(`[turnTimeout] STALE timer ignored: was for round=${timerRound} trick=${timerTrick} phase=${timerPhase} seat=${timerSeat}, now round=${state.roundNumber} trick=${state.trickNumber} phase=${state.phase} seat=${state.currentTurnSeat}`);
        return;
      }

      const socketId = room.seatToSocket.get(state.currentTurnSeat);
      if (!socketId) return;

      console.log(`[turnTimeout] ${state.currentTurnSeat} in room ${code} phase ${state.phase}`);

      if (state.phase === GamePhase.BIDDING) {
        placeBid(state, state.currentTurnSeat, 0); // auto-pass
      } else if (state.phase === GamePhase.TRUMP_DECLARATION) {
        // Auto-declare the first suit available
        const suits = Object.values(Suit);
        if (suits.length > 0) {
          declareTrump(state, state.currentTurnSeat, suits[0]);
        }
      } else if (state.phase === GamePhase.SINGING) {
        doneSinging(state, state.currentTurnSeat);
      } else if (state.phase === GamePhase.TRICK_PLAY) {
        const player = state.players[state.currentTurnSeat];
        if (player && player.hand.length > 0) {
          // Play first card
          playCard(state, state.currentTurnSeat, player.hand[0].id);
        }
      }

      broadcastState(room);
    }, 60000); // 60 second timeout

    if (!turnTimers.has(code)) {
      turnTimers.set(code, new Map());
    }
    turnTimers.get(code)!.set(state.currentTurnSeat, timer);
  }
}

// Broadcast updated room list to all connected sockets (for lobby)
function broadcastRoomsList() {
  io.emit('roomsList', listRooms());
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Send room list when a client connects (for lobby)
  socket.on('listRooms', () => {
    socket.emit('roomsList', listRooms());
  });
  
  // Handle reconnection — client sends this when Socket.IO reconnects or page refreshes
  socket.on('rejoinRoom', ({ roomCode, playerName }: { roomCode: string; playerName: string }) => {
    console.log(`[rejoinRoom] socket=${socket.id}, room=${roomCode}, name=${playerName}`);

    // Cancel any pending disconnect timer for a previous socket with this player name
    // (The old socket ID is gone, but we can check by room+name)
    for (const [oldSocketId, timer] of disconnectTimers) {
      // Check if this timer belongs to the same player in the same room
      const room = getRoomByCode(roomCode);
      if (room) {
        const oldSeat = room.socketToSeat.get(oldSocketId);
        if (oldSeat) {
          const oldPlayer = room.state.players[oldSeat];
          if (oldPlayer && oldPlayer.name.trim().toLowerCase() === playerName.trim().toLowerCase()) {
            console.log(`[rejoinRoom] cancelling disconnect timer for old socket ${oldSocketId}`);
            clearTimeout(timer);
            disconnectTimers.delete(oldSocketId);
          }
        }
      }
    }

    const result = joinRoom(roomCode, socket.id, playerName);
    if ('error' in result) {
      console.log(`[rejoinRoom] failed: ${result.error}`);
      socket.emit('roomError', result.error);
      return;
    }
    socket.join(result.room.code);
    socket.emit('roomJoined', {
      roomCode: result.room.code,
      seat: result.seat,
      playerName,
    });
    broadcastState(result.room);
    console.log(`[rejoinRoom] success: ${playerName} back in seat ${result.seat}`);
  });

  socket.on('createRoom', (playerName: string, targetScore?: number, avatar?: string, password?: string) => {
    const result = createRoom(socket.id, playerName, avatar || '', password);
    if (!result) {
      socket.emit('roomError', 'שגיאה ביצירת חדר');
      return;
    }
    // Set target score if provided
    if (targetScore && targetScore >= 500 && targetScore <= 2000) {
      result.room.state.targetScore = targetScore;
    }
    socket.join(result.room.code);
    socket.emit('roomJoined', {
      roomCode: result.room.code,
      seat: result.seat,
      playerName,
    });
    broadcastState(result.room);
    broadcastRoomsList();
  });
  
  socket.on('joinRoom', ({ roomCode, playerName, avatar, password }: { roomCode: string; playerName: string; avatar?: string; password?: string }) => {
    const result = joinRoom(roomCode, socket.id, playerName, avatar || '', password);
    if ('error' in result) {
      socket.emit('roomError', result.error);
      return;
    }
    socket.join(result.room.code);
    socket.emit('roomJoined', {
      roomCode: result.room.code,
      seat: result.seat,
      playerName,
    });

    // Notify others
    socket.to(result.room.code).emit('playerJoined', {
      seat: result.seat,
      name: playerName,
    });

    broadcastState(result.room);
    broadcastRoomsList();
  });
  
  socket.on('startGame', () => {
    const room = getRoom(socket.id);
    if (!room) return;
    if (!isRoomFull(room)) {
      socket.emit('roomError', 'צריך 4 שחקנים כדי להתחיל');
      return;
    }
    if (room.state.phase !== GamePhase.WAITING) return;
    
    startRound(room.state);
    broadcastState(room);
  });
  
  socket.on('placeBid', (amount: number) => {
    const room = getRoom(socket.id);
    if (!room) return;
    const seat = room.socketToSeat.get(socket.id);
    if (!seat) return;
    
    placeBid(room.state, seat, amount);
    broadcastState(room);
  });
  
  socket.on('passBid', () => {
    const room = getRoom(socket.id);
    if (!room) return;
    const seat = room.socketToSeat.get(socket.id);
    if (!seat) return;
    
    placeBid(room.state, seat, 0);
    broadcastState(room);
  });
  
  socket.on('declareTrump', (suit: Suit) => {
    const room = getRoom(socket.id);
    if (!room) return;
    const seat = room.socketToSeat.get(socket.id);
    if (!seat) return;
    
    declareTrump(room.state, seat, suit);
    broadcastState(room);
  });
  
  socket.on('singCante', (suit: Suit) => {
    const room = getRoom(socket.id);
    if (!room) return;
    const seat = room.socketToSeat.get(socket.id);
    if (!seat) return;
    
    singCante(room.state, seat, suit);
    broadcastState(room);
  });
  
  socket.on('doneSinging', () => {
    const room = getRoom(socket.id);
    if (!room) return;
    const seat = room.socketToSeat.get(socket.id);
    if (!seat) return;
    
    doneSinging(room.state, seat);
    broadcastState(room);
  });
  
  socket.on('playCard', (cardId: string) => {
    const room = getRoom(socket.id);
    if (!room) return;
    const seat = room.socketToSeat.get(socket.id);
    if (!seat) return;
    
    playCard(room.state, seat, cardId);
    broadcastState(room);
  });
  
  socket.on('nextRound', () => {
    const room = getRoom(socket.id);
    if (!room) return;

    // Only allow from scoring or game over
    if (room.state.phase !== GamePhase.ROUND_SCORING && room.state.phase !== GamePhase.GAME_OVER) {
      console.log(`[nextRound] REJECTED: phase is ${room.state.phase}`);
      return;
    }

    nextRound(room.state);
    broadcastState(room);
  });

  socket.on('swapSeat', (targetSeat: SeatPosition) => {
    const room = getRoom(socket.id);
    if (!room) return;

    const result = swapSeat(socket.id, targetSeat);
    if (result) {
      io.to(result.room.code).emit('playerLeft', { seat: result.oldSeat });
      broadcastState(result.room);
    }
  });

  socket.on('updateSettings', (settings: { targetScore: number }) => {
    const room = getRoom(socket.id);
    if (!room) return;

    const result = updateRoomSettings(socket.id, settings);
    if (result) {
      broadcastState(result.room);
    }
  });

  socket.on('leaveRoom', () => {
    console.log(`Player leaving room: ${socket.id}`);
    const result = leaveRoom(socket.id);
    if (result) {
      io.to(result.room.code).emit('playerLeft', { seat: result.seat });
      broadcastState(result.room);
    }
    socket.leave('*');
    broadcastRoomsList();
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id} — starting ${DISCONNECT_GRACE_MS}ms grace period`);

    // Grace period: wait before removing the player, in case they're just refreshing
    const timer = setTimeout(() => {
      disconnectTimers.delete(socket.id);
      console.log(`[disconnect] grace period expired for ${socket.id}, removing player`);
      const result = removePlayer(socket.id);
      if (result) {
        io.to(result.room.code).emit('playerLeft', { seat: result.seat });
        broadcastState(result.room);
      }
      broadcastRoomsList();
    }, DISCONNECT_GRACE_MS);

    disconnectTimers.set(socket.id, timer);
  });
});

// SPA fallback — serve index.html for any non-API/socket route
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(join(clientDist, 'index.html'));
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Players can connect from other devices on the same network`);
});
