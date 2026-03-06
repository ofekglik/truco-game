import React from 'react';
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

  // Not in a room yet
  if (!roomInfo) {
    return <Lobby onCreateRoom={createRoom} onJoinRoom={joinRoom} error={error} connected={connected} />;
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
