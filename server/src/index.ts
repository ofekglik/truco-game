import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  createRoom, joinRoom, getRoom, getRoomByCode, removePlayer, isRoomFull, swapSeat, updateRoomSettings, type Room
} from './rooms/roomManager.js';
import {
  startRound, placeBid, declareTrump, singCante, doneSinging, playCard, nextRound, getClientState
} from './engine/game.js';
import { GamePhase, SEAT_ORDER, SeatPosition, Suit } from './engine/types.js';

const app = express();
app.use(cors());

// Serve built React client
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const clientDist = join(__dirname, '../../client/dist');
app.use(express.static(clientDist));

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

function broadcastState(room: Room | null) {
  if (!room) return;
  for (const seat of SEAT_ORDER) {
    const socketId = room.seatToSocket.get(seat);
    if (socketId) {
      const clientState = getClientState(room.state, seat);
      io.to(socketId).emit('gameState', clientState);
    }
  }
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  
  // Handle reconnection — client sends this when Socket.IO reconnects
  socket.on('rejoinRoom', ({ roomCode, playerName }: { roomCode: string; playerName: string }) => {
    console.log(`[rejoinRoom] socket=${socket.id}, room=${roomCode}, name=${playerName}`);
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

  socket.on('createRoom', (playerName: string, targetScore?: number) => {
    const result = createRoom(socket.id, playerName);
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
  });
  
  socket.on('joinRoom', ({ roomCode, playerName }: { roomCode: string; playerName: string }) => {
    const result = joinRoom(roomCode, socket.id, playerName);
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
    
    // Auto-start if full
    if (isRoomFull(result.room) && result.room.state.phase === GamePhase.WAITING) {
      startRound(result.room.state);
      broadcastState(result.room);
    }
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

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    const result = removePlayer(socket.id);
    if (result) {
      io.to(result.room.code).emit('playerLeft', { seat: result.seat });
      broadcastState(result.room);
    }
  });
});

// SPA fallback — serve index.html for any non-API/socket route
app.get('*', (_req, res) => {
  res.sendFile(join(clientDist, 'index.html'));
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Players can connect from other devices on the same network`);
});
