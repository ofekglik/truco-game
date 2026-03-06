import React, { useEffect, useState } from 'react';
import { useSocket } from './hooks/useSocket';
import { Lobby } from './components/Lobby';
import { WaitingRoom } from './components/WaitingRoom';
import { GameTable } from './components/GameTable';
import { GamePhase } from './types';

function App() {
  const {
    connected, reconnecting, gameState, roomInfo, error,
    createRoom, joinRoom, startGame,
    placeBid, passBid, declareTrump, singCante, doneSinging, playCard, nextRound,
    swapSeat, updateSettings, leaveRoom,
  } = useSocket();

  // Extract room code from URL params for share links
  const [urlRoomCode, setUrlRoomCode] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      setUrlRoomCode(room.toUpperCase());
      // Clean the URL without reloading
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Not in a room yet
  if (!roomInfo) {
    return (
      <Lobby
        onCreateRoom={createRoom}
        onJoinRoom={joinRoom}
        error={error}
        connected={connected}
        prefillRoomCode={urlRoomCode || undefined}
      />
    );
  }

  // In room but game hasn't started
  if (gameState && gameState.phase === GamePhase.WAITING) {
    return (
      <WaitingRoom
        gameState={gameState}
        roomCode={roomInfo.roomCode}
        onStartGame={startGame}
        onSwapSeat={swapSeat}
        onUpdateSettings={updateSettings}
        onLeaveRoom={leaveRoom}
        reconnecting={reconnecting}
        connected={connected}
      />
    );
  }

  // Game is active
  if (gameState) {
    return (
      <GameTable
        gameState={gameState}
        onPlayCard={playCard}
        onPlaceBid={placeBid}
        onPassBid={passBid}
        onDeclareTrump={declareTrump}
        onSingCante={singCante}
        onDoneSinging={doneSinging}
        onNextRound={nextRound}
        onLeaveRoom={leaveRoom}
        reconnecting={reconnecting}
        connected={connected}
      />
    );
  }

  // Loading
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d1117]">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-spin">🃏</div>
        <p className="text-gray-400">טוען...</p>
      </div>
    </div>
  );
}

export default App;
