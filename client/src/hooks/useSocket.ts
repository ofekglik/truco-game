import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { ClientGameState, Suit, SeatPosition, RoomSummary } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface RoomInfo {
  roomCode: string;
  seat: SeatPosition;
  playerName: string;
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const roomInfoRef = useRef<RoomInfo | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roomsList, setRoomsList] = useState<RoomSummary[]>([]);

  useEffect(() => {
    const setupSocket = async () => {
      let token: string | null = null;

      // Get auth token if Supabase is configured
      if (isSupabaseConfigured()) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          token = session?.access_token || null;
        } catch (error) {
          console.error('Error getting auth token:', error);
        }
      }

      const socket = io(window.location.origin, {
        transports: ['websocket', 'polling'],
        auth: {
          token,
        },
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        setConnected(true);
        setReconnecting(false);
        // Auto-rejoin room after reconnection (e.g. iPhone background/lock)
        const info = roomInfoRef.current;
        if (info) {
          console.log(`[socket] reconnected, rejoining room ${info.roomCode} as ${info.playerName}`);
          socket.emit('rejoinRoom', { roomCode: info.roomCode, playerName: info.playerName });
        }
      });
      socket.on('disconnect', () => {
        setConnected(false);
        setReconnecting(true);
      });
      socket.on('gameState', (state: ClientGameState) => setGameState(state));
      socket.on('roomJoined', (data: RoomInfo) => {
        setRoomInfo(data);
        roomInfoRef.current = data;
        setError(null);
      });
      socket.on('roomError', (msg: string) => setError(msg));
      socket.on('roomsList', (rooms: RoomSummary[]) => setRoomsList(rooms));

      return () => {
        socket.disconnect();
      };
    };

    setupSocket();
  }, []);

  const createRoom = useCallback((name: string, targetScore?: number, avatar?: string, password?: string) => {
    socketRef.current?.emit('createRoom', name, targetScore, avatar || '', password || undefined);
  }, []);

  const joinRoom = useCallback((code: string, name: string, avatar?: string, password?: string) => {
    socketRef.current?.emit('joinRoom', { roomCode: code, playerName: name, avatar: avatar || '', password: password || undefined });
  }, []);

  const fetchRoomsList = useCallback(() => {
    socketRef.current?.emit('listRooms');
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

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit('leaveRoom');
    // Clear local state so user returns to lobby
    setRoomInfo(null);
    roomInfoRef.current = null;
    setGameState(null);
    setError(null);
  }, []);

  return {
    connected,
    reconnecting,
    gameState,
    roomInfo,
    error,
    roomsList,
    createRoom,
    joinRoom,
    fetchRoomsList,
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
    leaveRoom,
  };
}
