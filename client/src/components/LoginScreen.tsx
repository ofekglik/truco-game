import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const LoginScreen: React.FC = () => {
  const { signInWithGoogle, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError(null);
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Sign in error:', err);
      setError(err.message || 'שגיאה בהתחברות');
    } finally {
      setIsLoading(false);
    }
  };

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

  return (
    <div
      dir="rtl"
      className="min-h-screen w-full bg-[#0d1117] flex items-center justify-center p-4 overflow-hidden relative"
    >
      {/* Background card suit decorations */}
      <div className="absolute inset-0 pointer-events-none opacity-5">
        <div className="absolute top-10 left-10 text-6xl">♠</div>
        <div className="absolute top-20 right-20 text-8xl">♥</div>
        <div className="absolute bottom-32 left-1/4 text-7xl">♦</div>
        <div className="absolute bottom-20 right-10 text-6xl">♣</div>
        <div className="absolute top-1/2 right-1/4 text-7xl">♠</div>
      </div>

      {/* Main container with glass morphism effect */}
      <div className="relative w-full max-w-md">
        {/* Animated background glow */}
        <div className="absolute -inset-1 bg-gradient-to-r from-yellow-500/20 via-yellow-400/10 to-yellow-500/20 rounded-3xl blur-2xl opacity-75 animate-pulse"></div>

        {/* Main card */}
        <div className="relative bg-[#0d1117] border-2 border-yellow-500/30 rounded-3xl p-8 shadow-2xl backdrop-blur-sm">
          {/* Header section */}
          <div className="text-center mb-8">
            <div className="text-7xl mb-3 drop-shadow-lg">🃏</div>
            <h1
              className="text-5xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-400 mb-2"
              style={{ fontFamily: 'Heebo, sans-serif' }}
            >
              אטו
            </h1>
            <p className="text-yellow-400/80 text-sm md:text-base font-medium">משחק קלפים ספרדי קלאסי</p>

            {/* Decorative line */}
            <div className="mt-4 flex items-center justify-center gap-2">
              <span className="text-yellow-500">♦</span>
              <div className="w-16 h-px bg-gradient-to-r from-transparent via-yellow-500 to-transparent"></div>
              <span className="text-yellow-500">♦</span>
            </div>
          </div>

          {/* Welcome message */}
          <div className="mb-8 text-center">
            <p className="text-gray-300 text-base mb-2">ברוכים הבאים!</p>
            <p className="text-gray-400 text-sm">התחברו כדי להתחיל לשחק עם חברים</p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-6 bg-red-900/30 border border-red-500/60 rounded-xl p-4 text-center animate-pulse">
              <p className="text-red-200 text-sm font-medium">⚠ {error}</p>
            </div>
          )}

          {/* Google Sign In Button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full py-4 px-6 bg-gradient-to-r from-yellow-500 to-yellow-400 hover:from-yellow-400 hover:to-yellow-300 disabled:from-gray-700 disabled:to-gray-600 disabled:text-gray-500 text-gray-900 font-bold rounded-2xl text-lg transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-yellow-500/50 disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {isLoading ? (
              <>
                <div className="animate-spin text-xl">⏳</div>
                <span>מתחבר...</span>
              </>
            ) : (
              <>
                <span>📧</span>
                <span>התחברות עם Google</span>
              </>
            )}
          </button>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-yellow-500/20 text-center">
            <p className="text-gray-400 text-xs">אטו • משחק קלפים קלאסי</p>
            <p className="text-gray-500 text-xs mt-2">זקוק לחשבון Google כדי להתחבר</p>
          </div>
        </div>
      </div>
    </div>
  );
};
