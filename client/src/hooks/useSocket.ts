import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { ClientGameState, Suit, SeatPosition } from '../types';

interface RoomInfo {
  roomCode: string;
  seat: SeatPosition;
  playerName: string;
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const roomInfoRef = useRef<RoomInfo | null>(null);
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      // Auto-rejoin room after reconnection (e.g. iPhone background/lock)
      const info = roomInfoRef.current;
      if (info) {
        console.log(`[socket] reconnected, rejoining room ${info.roomCode} as ${info.playerName}`);
        socket.emit('rejoinRoom', { roomCode: info.roomCode, playerName: info.playerName });
      }
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('gameState', (state: ClientGameState) => setGameState(state));
    socket.on('roomJoined', (data: RoomInfo) => {
      setRoomInfo(data);
      roomInfoRef.current = data;
      setError(null);
    });
    socket.on('roomError', (msg: string) => setError(msg));

    return () => {
      socket.disconnect();
    };
  }, []);

  const createRoom = useCallback((name: string, targetScore?: number) => {
    socketRef.current?.emit('createRoom', name, targetScore);
  }, []);

  const joinRoom = useCallback((code: string, name: string) => {
    socketRef.current?.emit('joinRoom', { roomCode: code, playerName: name });
  }, []);

  const startGame = useCallback(() => {
    socketRef.current?.emit('startGame');
  }, []);

  const placeBid = useCallback((amount: number) => {
    socketRef.current?.emit('placeBid', amount);
  }, []);

  const passBid = useCallback(() => {
    socketRef.current?.emit('passBid');
  }, []);

  const declareTrump = useCallback((suit: Suit) => {
    socketRef.current?.emit('declareTrump', suit);
  }, []);

  const singCante = useCallback((suit: Suit) => {
    socketRef.current?.emit('singCante', suit);
  }, []);

  const doneSinging = useCallback(() => {
    socketRef.current?.emit('doneSinging');
  }, []);

  const playCard = useCallback((cardId: string) => {
    socketRef.current?.emit('playCard', cardId);
  }, []);

  const nextRound = useCallback(() => {
    socketRef.current?.emit('nextRound');
  }, []);

  const swapSeat = useCallback((targetSeat: SeatPosition) => {
    socketRef.current?.emit('swapSeat', targetSeat);
  }, []);

  const updateSettings = useCallback((settings: { targetScore: number }) => {
    socketRef.current?.emit('updateSettings', settings);
  }, []);

  return {
    connected,
    gameState,
    roomInfo,
    error,
    createRoom,
    joinRoom,
    startGame,
    placeBid,
    passBid,
    declareTrump,
    singCante,
    doneSinging,
    playCard,
    nextRound,
    swapSeat,
    updateSettings,
  };
}
