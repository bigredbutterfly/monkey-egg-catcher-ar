import React, { useState } from 'react';
import GameCanvas from './components/GameCanvas';
import { GameState } from './types';
import { getMonkeyKingCommentary } from './services/geminiService';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.LOADING);
  const [score, setScore] = useState(0);
  const [missed, setMissed] = useState(0);
  const [commentary, setCommentary] = useState<string>("");
  const [loadingCommentary, setLoadingCommentary] = useState(false);

  const handleStartGame = () => {
    setScore(0);
    setMissed(0);
    setCommentary("");
    setGameState(GameState.PLAYING);
  };

  const handleGameOver = async () => {
    setLoadingCommentary(true);
    try {
        // Updated prompt context for snack game
        const result = await getMonkeyKingCommentary(score, missed);
        setCommentary(result);
    } catch (e) {
        console.error(e);
    } finally {
        setLoadingCommentary(false);
    }
  };

  return (
    <div className="min-h-screen bg-orange-50 flex flex-col items-center py-8 px-4 font-sans text-gray-900">
      
      {/* Header */}
      <header className="mb-6 text-center">
        <h1 className="text-4xl font-extrabold text-orange-600 tracking-tight flex items-center justify-center gap-2">
          <span>😋</span> Face Snack Eater
        </h1>
        <p className="text-gray-500 mt-2">Open your mouth wide to eat the falling snacks!</p>
      </header>

      {/* Score Board */}
      <div className="flex gap-4 mb-6 w-full max-w-3xl justify-center">
        <div className="bg-white px-6 py-3 rounded-xl shadow-sm border border-orange-100 flex flex-col items-center min-w-[120px]">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Yummy</span>
          <span className="text-3xl font-bold text-orange-500">{score}</span>
        </div>
        <div className="bg-white px-6 py-3 rounded-xl shadow-sm border border-orange-100 flex flex-col items-center min-w-[120px]">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Missed</span>
          <span className={`text-3xl font-bold ${missed >= 3 ? 'text-red-500' : 'text-gray-700'}`}>
            {missed} / 3
          </span>
        </div>
      </div>

      {/* Game Window (Preview Box) */}
      <div className="relative w-full max-w-[800px] aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl border-4 border-white ring-1 ring-gray-200">
        
        {/* The Game Canvas */}
        <GameCanvas 
          gameState={gameState} 
          setGameState={setGameState} 
          score={score}
          setScore={setScore}
          setMissed={setMissed}
          onGameOver={handleGameOver}
        />

        {/* Overlay: Loading */}
        {gameState === GameState.LOADING && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 z-50 text-white">
            <div className="animate-bounce text-5xl mb-4">🍕</div>
            <p className="text-lg font-medium">Preparing Snacks...</p>
            <p className="text-sm text-gray-400 mt-2">Please allow camera access</p>
          </div>
        )}

        {/* Overlay: Menu / Instructions */}
        {gameState === GameState.MENU && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm z-40 text-white p-6 text-center">
             <div className="bg-white/10 backdrop-blur-md p-8 rounded-2xl border border-white/20 shadow-xl">
                <h2 className="text-3xl font-bold mb-4">Hungry? 😋</h2>
                <ul className="text-left text-gray-100 mb-6 space-y-2 text-lg">
                  <li>📸 <b>Camera ON</b>: We need to see your mouth.</li>
                  <li>😮 <b>Open Wide</b>: Open mouth to eat snacks.</li>
                  <li>🤐 <b>Close It</b>: Don't let snacks hit a closed mouth!</li>
                </ul>
                <div className="animate-pulse text-4xl">👇</div>
             </div>
          </div>
        )}

        {/* Overlay: Game Over */}
        {gameState === GameState.GAME_OVER && (
           <div className="absolute inset-0 flex flex-col items-center justify-center bg-orange-900/80 backdrop-blur-md z-50 p-6 text-white text-center">
              <h2 className="text-5xl font-black mb-2 drop-shadow-lg">FULL! 😵</h2>
              <p className="text-xl mb-4">You missed too many snacks!</p>
              
              {loadingCommentary ? (
                 <p className="text-white/80 animate-pulse mt-4">The Chef is judging you...</p>
              ) : (
                 <div className="mt-4 bg-white/10 p-6 rounded-xl border border-white/20 max-w-md">
                    <p className="text-yellow-300 font-bold text-sm mb-2">🧑‍🍳 Chef's Review:</p>
                    <p className="text-lg italic font-serif">"{commentary}"</p>
                 </div>
              )}
           </div>
        )}
      </div>

      {/* Action Area */}
      <div className="mt-8 flex justify-center w-full min-h-[80px]">
        {gameState === GameState.LOADING ? (
            <div className="flex flex-col items-center justify-center text-gray-500 animate-pulse">
                <div className="flex items-center space-x-2">
                    <div className="animate-spin h-5 w-5 border-2 border-orange-500 border-t-transparent rounded-full"></div>
                    <span className="font-medium">Warming up oven...</span>
                </div>
            </div>
        ) : (gameState === GameState.MENU || gameState === GameState.GAME_OVER) ? (
          <button
            onClick={handleStartGame}
            className="group relative inline-flex items-center justify-center px-10 py-4 font-bold text-white transition-all duration-200 bg-gradient-to-r from-orange-500 to-red-500 rounded-full focus:outline-none focus:ring-4 focus:ring-orange-300 hover:from-orange-600 hover:to-red-600 hover:scale-105 active:scale-95 shadow-xl"
          >
            <span className="mr-2 text-2xl">{gameState === GameState.GAME_OVER ? '🍽️' : '🚀'}</span>
            <span className="text-xl">{gameState === GameState.GAME_OVER ? 'Eat Again' : 'Start Eating'}</span>
          </button>
        ) : (
           <div className="flex items-center gap-2 bg-green-100 px-6 py-3 rounded-full border border-green-200 text-green-800 shadow-sm animate-pulse">
             <span className="text-2xl">😮</span>
             <span className="font-bold">Keep mouth open to catch!</span>
           </div>
        )}
      </div>
      
    </div>
  );
};

export default App;