import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  createRoom, joinRoom, getRoom, getRoomByCode, removePlayer, isRoomFull, swapSeat, updateRoomSettings, leaveRoom, listRooms, deleteRoom, type Room
} from './rooms/roomManager.js';
import {
  startRound, placeBid, declareTrump, singCante, doneSinging, chooseSinger, playCard, resolveTrick, nextRound, getClientState
} from './engine/game.js';
import { GamePhase, SEAT_ORDER, SeatPosition, Suit } from './engine/types.js';
import { supabase, isSupabaseConfigured } from './lib/supabase.js';
import { recordGameResults } from './lib/gameRecorder.js';
import { addBotsToRoom, isBotSeat, executeBotTurn, executeBotSingingChoice, removeBotsFromRoom } from './bot/botPlayer.js';

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

// Bot API — add bots to a room for local testing
app.use(express.json());
app.post('/api/bots', (req, res) => {
  const { roomCode } = req.body;
  if (!roomCode) return res.status(400).json({ error: 'roomCode required' });
  const room = getRoomByCode(roomCode);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const bots = addBotsToRoom(room);
  broadcastState(room);
  broadcastRoomsList();
  res.json({ added: bots.length, bots: bots.map(b => ({ seat: b.seat, name: b.name })) });
});

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

// Disconnect grace period: Map<socketId, timeoutId>
// Gives players time to reconnect (e.g. page refresh) before removing them
const disconnectTimers = new Map<string, NodeJS.Timeout>();
const DISCONNECT_GRACE_MS = 300000; // 5 minutes

// Trick resolution timers: Map<roomCode, timeoutId> — prevents double resolution
const trickResolutionTimers = new Map<string, NodeJS.Timeout>();

// Room cleanup: delete abandoned rooms after 30 minutes of no connected players
const ROOM_ABANDON_MS = 30 * 60 * 1000;
const roomCleanupTimers = new Map<string, NodeJS.Timeout>();

function broadcastState(room: Room | null, triggerBots = true) {
  if (!room) return;
  for (const seat of SEAT_ORDER) {
    const socketId = room.seatToSocket.get(seat);
    if (socketId) {
      const clientState = getClientState(room.state, seat);
      io.to(socketId).emit('gameState', clientState);
    }
  }
  // Auto-trigger bot turns after broadcasting
  if (triggerBots) {
    scheduleBotTurn(room);
  }
}

/** Schedule trick resolution with dedup — only one timer per room at a time */
function scheduleTrickResolution(room: Room) {
  // Don't schedule if already pending
  if (trickResolutionTimers.has(room.code)) return;

  const timer = setTimeout(() => {
    trickResolutionTimers.delete(room.code);
    if (room.state.trickPendingResolution) {
      resolveTrick(room.state);
      broadcastState(room);
    }
  }, 2500);
  trickResolutionTimers.set(room.code, timer);
}

/** Schedule room cleanup if all players disconnected */
function scheduleRoomCleanup(room: Room) {
  // Cancel any existing timer
  const existing = roomCleanupTimers.get(room.code);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    roomCleanupTimers.delete(room.code);
    // Double-check still empty
    const connectedPlayers = SEAT_ORDER.filter(s => room.state.players[s]?.connected);
    if (connectedPlayers.length === 0) {
      console.log(`[cleanup] Removing abandoned room ${room.code}`);
      deleteRoom(room.code);
    }
  }, ROOM_ABANDON_MS);
  roomCleanupTimers.set(room.code, timer);
}

/** Cancel room cleanup (player reconnected) */
function cancelRoomCleanup(roomCode: string) {
  const timer = roomCleanupTimers.get(roomCode);
  if (timer) {
    clearTimeout(timer);
    roomCleanupTimers.delete(roomCode);
  }
}

// Broadcast updated room list to all connected sockets (for lobby)
function broadcastRoomsList() {
  io.emit('roomsList', listRooms());
}

// Schedule bot turn after state broadcast — bots act with a small delay to feel natural
function scheduleBotTurn(room: Room) {
  const state = room.state;
  if (state.phase === GamePhase.WAITING || state.phase === GamePhase.GAME_OVER || state.phase === GamePhase.ROUND_SCORING) return;

  // Check for singing choice pending first
  if (state.singingChoicePending) {
    const acted = executeBotSingingChoice(room);
    if (acted) {
      setTimeout(() => {
        broadcastState(room, false);
        scheduleBotTurn(room);
      }, 600);
      return;
    }
  }

  // Check if current turn is a bot
  if (!isBotSeat(room.code, state.currentTurnSeat)) return;

  // Trick pending resolution — wait for centralized timer to resolve it
  if (state.trickPendingResolution) return;

  const delay = state.phase === GamePhase.TRICK_PLAY ? 800 : 500;
  setTimeout(() => {
    // Re-check: another event may have changed the state
    if (!isBotSeat(room.code, state.currentTurnSeat)) return;
    if (state.trickPendingResolution) return;

    const acted = executeBotTurn(room);
    if (acted) {
      // If trick just completed (4 cards), use centralized resolution
      if (state.trickPendingResolution) {
        broadcastState(room, false);
        scheduleTrickResolution(room);
      } else {
        broadcastState(room, false);
        scheduleBotTurn(room);
      }
    }
  }, delay);
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
    // Collect entries first to avoid modifying Map during iteration
    const toCancel: string[] = [];
    for (const [oldSocketId, timer] of disconnectTimers) {
      const room = getRoomByCode(roomCode);
      if (room) {
        const oldSeat = room.socketToSeat.get(oldSocketId);
        if (oldSeat) {
          const oldPlayer = room.state.players[oldSeat];
          if (oldPlayer && oldPlayer.name.trim().toLowerCase() === playerName.trim().toLowerCase()) {
            console.log(`[rejoinRoom] cancelling disconnect timer for old socket ${oldSocketId}`);
            clearTimeout(timer);
            toCancel.push(oldSocketId);
          }
        }
      }
    }
    toCancel.forEach(id => disconnectTimers.delete(id));

    // Cancel room cleanup timer if any
    cancelRoomCleanup(roomCode);

    const result = joinRoom(roomCode, socket.id, playerName, '', undefined, socket.data.userId || undefined);
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
    const result = createRoom(socket.id, playerName, avatar || '', password, socket.data.userId || undefined);
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
    const result = joinRoom(roomCode, socket.id, playerName, avatar || '', password, socket.data.userId || undefined);
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

  socket.on('chooseSinger', (choice: 'self' | 'partner') => {
    const room = getRoom(socket.id);
    if (!room) return;
    const seat = room.socketToSeat.get(socket.id);
    if (!seat) return;

    chooseSinger(room.state, seat, choice);
    broadcastState(room);
  });

  socket.on('playCard', (cardId: string) => {
    const room = getRoom(socket.id);
    if (!room) return;
    const seat = room.socketToSeat.get(socket.id);
    if (!seat) return;

    playCard(room.state, seat, cardId);

    // If trick is complete (4 cards), use centralized timer to avoid double resolution
    if (room.state.trickPendingResolution) {
      broadcastState(room, false); // broadcast without triggering bots yet
      scheduleTrickResolution(room);
    } else {
      broadcastState(room);
    }
  });
  
  socket.on('nextRound', () => {
    const room = getRoom(socket.id);
    if (!room) return;

    // Only allow from scoring or game over
    if (room.state.phase !== GamePhase.ROUND_SCORING && room.state.phase !== GamePhase.GAME_OVER) {
      console.log(`[nextRound] REJECTED: phase is ${room.state.phase}`);
      return;
    }

    // Record game results before transitioning away from GAME_OVER
    // Deep-copy the state snapshot so async recording isn't affected by nextRound mutation
    if (room.state.phase === GamePhase.GAME_OVER) {
      const stateSnapshot = JSON.parse(JSON.stringify(room.state));
      recordGameResults(stateSnapshot, room.code).catch(err => {
        console.error('[nextRound] Failed to record game results:', err);
      });
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
        // Schedule room cleanup if all players disconnected
        const connectedPlayers = SEAT_ORDER.filter(s => result.room.state.players[s]?.connected);
        if (connectedPlayers.length === 0 && result.room.state.phase !== GamePhase.WAITING) {
          scheduleRoomCleanup(result.room);
        }
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
