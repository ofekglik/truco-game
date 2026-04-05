import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { ClientGameState, Suit, SeatPosition, RoomSummary, LegendaryBotCost } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface RoomInfo {
  roomCode: string;
  seat: SeatPosition;
  playerName: string;
}

const ROOM_STORAGE_KEY = 'ato_room_info';

function saveRoomInfo(info: RoomInfo | null) {
  if (info) {
    localStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify(info));
  } else {
    localStorage.removeItem(ROOM_STORAGE_KEY);
  }
}

function loadRoomInfo(): RoomInfo | null {
  try {
    const stored = localStorage.getItem(ROOM_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const roomInfoRef = useRef<RoomInfo | null>(loadRoomInfo());
  const gameStateRef = useRef<ClientGameState | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(loadRoomInfo());
  const [error, setError] = useState<string | null>(null);
  const [roomsList, setRoomsList] = useState<RoomSummary[]>([]);
  const [legendaryBotCost, setLegendaryBotCost] = useState<LegendaryBotCost | null>(null);

  useEffect(() => {
    let socket: Socket | null = null;
    let cancelled = false;

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

      if (cancelled) return; // Component unmounted during async auth

      socket = io(window.location.origin, {
        transports: ['websocket', 'polling'],
        auth: {
          token,
        },
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        setConnected(true);
        setReconnecting(false);
        // Auto-rejoin room after reconnection or page refresh
        const info = roomInfoRef.current;
        if (info) {
          console.log(`[socket] reconnecting to room ${info.roomCode} as ${info.playerName}`);
          socket!.emit('rejoinRoom', { roomCode: info.roomCode, playerName: info.playerName });
        }
      });
      socket.on('disconnect', () => {
        setConnected(false);
        setReconnecting(true);
      });
      socket.on('connect_error', (err) => {
        console.error('[socket] connection error:', err.message);
        setConnected(false);
      });
      socket.on('gameState', (state: ClientGameState) => {
        if (state && typeof state === 'object' && state.phase !== undefined) {
          gameStateRef.current = state;
          setGameState(state);
        } else {
          console.error('[socket] Invalid gameState received:', state);
        }
      });
      socket.on('roomJoined', (data: RoomInfo) => {
        if (data && data.roomCode && data.seat) {
          setRoomInfo(data);
          roomInfoRef.current = data;
          saveRoomInfo(data);
          setError(null);
        }
      });
      socket.on('roomError', (msg: string) => {
        setError(msg);
        // If we were trying to rejoin (have stored info but no active game), clear it
        if (roomInfoRef.current && !gameStateRef.current) {
          console.log('[socket] rejoin failed, clearing stored room info');
          roomInfoRef.current = null;
          setRoomInfo(null);
          saveRoomInfo(null);
        }
      });
      socket.on('roomsList', (rooms: RoomSummary[]) => {
        if (Array.isArray(rooms)) setRoomsList(rooms);
      });
      socket.on('legendaryBotCost', (cost: LegendaryBotCost) => {
        if (cost && typeof cost.cost === 'number') setLegendaryBotCost(cost);
      });
    };

    setupSocket();

    return () => {
      cancelled = true;
      if (socket) {
        socket.off('connect');
        socket.off('disconnect');
        socket.off('connect_error');
        socket.off('gameState');
        socket.off('roomJoined');
        socket.off('roomError');
        socket.off('roomsList');
        socket.off('legendaryBotCost');
        socket.disconnect();
      }
    };
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

  const chooseSinger = useCallback((choice: 'self' | 'partner') => {
    socketRef.current?.emit('chooseSinger', choice);
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
    saveRoomInfo(null);
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
    chooseSinger,
    playCard,
    nextRound,
    swapSeat,
    updateSettings,
    leaveRoom,
    legendaryBotCost,
  };
}
