import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useSocket } from './hooks/useSocket';
import { Lobby } from './components/Lobby';
import { WaitingRoom } from './components/WaitingRoom';
import { GameTable } from './components/GameTable';
import { LoginScreen } from './components/LoginScreen';
import { NicknameScreen } from './components/NicknameScreen';
import { ProfilePage } from './components/ProfilePage';
import { GamePhase } from './types';

function AppContent() {
  const { user, profile, loading, needsNickname } = useAuth();
  const {
    connected, reconnecting, gameState, roomInfo, error,
    roomsList, fetchRoomsList,
    createRoom, joinRoom, startGame,
    placeBid, passBid, declareTrump, singCante, doneSinging, chooseSinger, playCard, nextRound,
    swapSeat, updateSettings, leaveRoom, legendaryBotCost,
  } = useSocket();

  const [showProfile, setShowProfile] = useState(false);

  // Safety fallback: if user exists but profile never resolves after 3s,
  // force the nickname screen so the user isn't stuck forever
  const [profileTimeout, setProfileTimeout] = useState(false);

  useEffect(() => {
    if (user && !profile && !needsNickname && !loading) {
      const t = setTimeout(() => setProfileTimeout(true), 3000);
      return () => clearTimeout(t);
    }
    setProfileTimeout(false);
  }, [user, profile, needsNickname, loading]);

  // Loading auth state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d1117]">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-spin">🃏</div>
          <p className="text-gray-400">טוען...</p>
        </div>
      </div>
    );
  }

  // No user and no profile - show guest entry screen
  if (!user && !profile) {
    return <LoginScreen />;
  }

  // Authenticated but no profile - show nickname screen
  if (user && needsNickname) {
    return <NicknameScreen />;
  }

  // User exists but profile isn't resolved yet (fetchProfile still in-flight)
  if (user && !profile) {
    if (profileTimeout) {
      return <NicknameScreen />;
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d1117]">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-spin">🃏</div>
          <p className="text-gray-400">טוען פרופיל...</p>
        </div>
      </div>
    );
  }

  // Show profile page if requested
  if (showProfile) {
    return <ProfilePage onBack={() => setShowProfile(false)} />;
  }

  // Not in a room yet — show lobby
  if (!roomInfo) {
    return (
      <Lobby
        onCreateRoom={createRoom}
        onJoinRoom={joinRoom}
        error={error}
        connected={connected}
        onShowProfile={() => setShowProfile(true)}
        roomsList={roomsList}
        onFetchRooms={fetchRoomsList}
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
        onChooseSinger={chooseSinger}
        onNextRound={nextRound}
        onLeaveRoom={leaveRoom}
        reconnecting={reconnecting}
        connected={connected}
        legendaryBotCost={legendaryBotCost}
      />
    );
  }

  // Reconnecting to room or loading
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d1117]">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-spin">🃏</div>
        <p className="text-gray-400">{roomInfo ? 'מתחבר חזרה למשחק...' : 'טוען...'}</p>
        {roomInfo && (
          <button
            onClick={() => leaveRoom()}
            className="mt-4 px-4 py-2 text-sm text-gray-500 hover:text-gray-300 underline transition-colors"
          >
            חזרה ללובי
          </button>
        )}
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
