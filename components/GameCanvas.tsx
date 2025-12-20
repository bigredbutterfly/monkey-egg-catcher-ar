import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import { GameState, Egg } from '../types';

interface GameCanvasProps {
  gameState: GameState;
  setGameState: (state: GameState) => void;
  score: number;
  setScore: React.Dispatch<React.SetStateAction<number>>;
  setMissed: React.Dispatch<React.SetStateAction<number>>;
  onGameOver: () => void;
}

// Visual Assets - Delicious Snacks!
const SNACKS = ["🍩", "🍪", "🍕", "🍔", "🧁", "🥐", "🍫", "🍟"];
const getRandomSnack = () => SNACKS[Math.floor(Math.random() * SNACKS.length)];

// Extend Egg interface to include which snack it is
interface Snack extends Egg {
  emoji: string;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ 
  gameState, 
  setGameState, 
  score, 
  setScore, 
  setMissed,
  onGameOver 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const requestRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  
  // Game Logic Refs
  const snacksRef = useRef<Snack[]>([]);
  const scoreRef = useRef(0);
  const missedRef = useRef(0);
  const frameCountRef = useRef(0);
  const gameActiveRef = useRef(false);

  // CRITICAL FIX: Persist mouth data across frames
  const mouthDataRef = useRef({
    x: 0,
    y: 0,
    isOpen: false,
    radius: 80,
    hasFace: false
  });

  // Sync refs with props
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  // Initialize MediaPipe
  useEffect(() => {
    const initMediaPipe = async () => {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1
        });
        setFaceLandmarker(landmarker);
      } catch (error) {
        console.error("Failed to load MediaPipe:", error);
      }
    };
    
    setGameState(GameState.LOADING);
    initMediaPipe();
    
    return () => {
       // cleanup
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Setup Camera - Flexible Resolution
  useEffect(() => {
    const startCamera = async () => {
      if (!videoRef.current) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 } 
          } 
        });
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
           videoRef.current?.play();
           setVideoReady(true);
        };
      } catch (err) {
        console.error("Error accessing camera:", err);
        alert("Camera access denied. Please allow camera permissions to play.");
      }
    };
    startCamera();
  }, []);

  // Update Game State when both tools are ready
  useEffect(() => {
    if (faceLandmarker && videoReady && gameState === GameState.LOADING) {
      setGameState(GameState.MENU);
    }
  }, [faceLandmarker, videoReady, gameState, setGameState]);

  // Main Game Loop
  const renderLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (!video || !canvas) {
       requestRef.current = requestAnimationFrame(renderLoop);
       return;
    }

    // Ensure canvas size matches video size
    if (video.videoWidth > 0 && video.videoHeight > 0) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Draw Video Frame (Mirrored)
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    if (video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    ctx.restore();

    if (!faceLandmarker) {
        requestRef.current = requestAnimationFrame(renderLoop);
        return;
    }

    // 2. Process Face Logic (Only updates when video frame updates)
    if (video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        
        try {
            const startTimeMs = performance.now();
            const detections = faceLandmarker.detectForVideo(video, startTimeMs);

            if (detections.faceLandmarks && detections.faceLandmarks.length > 0) {
                const landmarks = detections.faceLandmarks[0];

                // Coordinate conversion (Mirror aware)
                const getX = (val: number) => (1 - val) * canvas.width;
                const getY = (val: number) => val * canvas.height;

                // --- Landmarks ---
                const upperLipY = landmarks[13].y;
                const lowerLipY = landmarks[14].y;
                // Use Math.abs for robustness against rotation
                const mouthDist = Math.abs(lowerLipY - upperLipY); 
                const faceHeight = Math.abs(landmarks[152].y - landmarks[10].y); // Chin - Forehead
                const openRatio = mouthDist / faceHeight;

                // Adjusted Threshold: lowered from 0.05 to 0.02 for better sensitivity
                const isOpen = openRatio > 0.02; 

                const centerX = getX((landmarks[13].x + landmarks[14].x) / 2);
                const centerY = getY((landmarks[13].y + landmarks[14].y) / 2);

                // Dynamic Hitbox Size based on face size
                const faceWidth = Math.abs(getX(landmarks[454].x) - getX(landmarks[234].x));
                const radius = faceWidth * 0.4;

                // Update Persistence Ref
                mouthDataRef.current = {
                    x: centerX,
                    y: centerY,
                    isOpen: isOpen,
                    radius: radius,
                    hasFace: true
                };

            } else {
                // No face detected this frame
                 mouthDataRef.current.hasFace = false;
            }
        } catch (e) {
            console.warn("Detection error", e);
        }
    }

    // 2.5 Draw Visual Indicators (Using Persisted Data)
    if (mouthDataRef.current.hasFace) {
        const { x, y, radius, isOpen } = mouthDataRef.current;
        
        // Draw a clear guide circle
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.lineWidth = 5;
        ctx.strokeStyle = isOpen ? "#4ADE80" : "#EF4444"; // Green if open, Red if closed
        ctx.stroke();
        
        // Add a subtle fill
        ctx.fillStyle = isOpen ? "rgba(74, 222, 128, 0.2)" : "rgba(239, 68, 68, 0.1)";
        ctx.fill();

        // Add Text Label
        ctx.save();
        ctx.fillStyle = isOpen ? "#4ADE80" : "#EF4444";
        ctx.font = "bold 24px sans-serif";
        ctx.textAlign = "center";
        ctx.shadowColor = "black";
        ctx.shadowBlur = 4;
        ctx.fillText(isOpen ? "OPEN" : "CLOSED", x, y + radius + 30);
        ctx.restore();
    }


    // 3. Game Physics
    if (gameState === GameState.PLAYING && gameActiveRef.current) {
        frameCountRef.current++;
        
        // Spawn Snacks
        if (frameCountRef.current % 50 === 0) {
           const newSnack: Snack = {
             id: Date.now(),
             x: Math.random() * (canvas.width - 100) + 50,
             y: -50,
             speed: 5 + (scoreRef.current * 0.2), 
             isCaught: false,
             emoji: getRandomSnack()
           };
           snacksRef.current.push(newSnack);
        }

        // Update Snacks
        snacksRef.current.forEach(snack => {
          if (snack.isCaught) return;
          snack.y += snack.speed;

          // CRITICAL: Use persisted mouth data for collision
          if (mouthDataRef.current.hasFace) {
             const { x: mouthX, y: mouthY, radius: catchRadius, isOpen } = mouthDataRef.current;
             const dist = Math.hypot(snack.x - mouthX, snack.y - mouthY);
             
             // Check collision
             if (dist < catchRadius) {
               if (isOpen) {
                 // CAUGHT!
                 snack.isCaught = true;
                 scoreRef.current += 1;
                 setScore(s => s + 1);
                 
                 // Visual feedback pop
                 ctx.save();
                 ctx.font = "80px serif";
                 ctx.fillStyle = "#FFD700";
                 ctx.shadowColor = "black";
                 ctx.shadowBlur = 10;
                 ctx.fillText("✨", snack.x, snack.y);
                 ctx.restore();
                 
               } else {
                 // Hit closed mouth - GAME OVER
                 gameActiveRef.current = false;
                 setGameState(GameState.GAME_OVER);
                 onGameOver();
               }
             }
          }

          if (snack.y > canvas.height) {
            snack.isCaught = true;
            missedRef.current += 1;
            setMissed(m => m + 1);
            if (missedRef.current >= 3) {
                gameActiveRef.current = false;
                setGameState(GameState.GAME_OVER);
                onGameOver();
            }
          }
        });

        // Cleanup
        snacksRef.current = snacksRef.current.filter(e => !e.isCaught);
    }

    // 4. Draw Snacks
    snacksRef.current.forEach(snack => {
         if (snack.isCaught) return;
         ctx.save();
         
         ctx.font = "64px serif"; // Larger font
         ctx.textAlign = "center";
         ctx.textBaseline = "middle";
         
         // Critical: Reset styles to ensure full opacity and vibrant colors
         ctx.fillStyle = "white"; 
         ctx.globalAlpha = 1.0;
         
         // Add shadow to make it pop against video
         ctx.shadowColor = "rgba(0,0,0,0.8)";
         ctx.shadowBlur = 12;
         ctx.shadowOffsetX = 0;
         ctx.shadowOffsetY = 4;

         ctx.fillText(snack.emoji, snack.x, snack.y);
         ctx.restore();
    });

    requestRef.current = requestAnimationFrame(renderLoop);
  }, [faceLandmarker, gameState, setScore, setMissed, setGameState, onGameOver]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [renderLoop]);

  // Reset Logic
  useEffect(() => {
    if (gameState === GameState.PLAYING) {
      snacksRef.current = [];
      scoreRef.current = 0;
      missedRef.current = 0;
      frameCountRef.current = 0;
      gameActiveRef.current = true;
      // Reset mouth data
      mouthDataRef.current = { x:0, y:0, isOpen: false, radius: 80, hasFace: false };
    } else {
      gameActiveRef.current = false;
    }
  }, [gameState]);

  return (
    <>
      <video 
        ref={videoRef} 
        className="hidden" 
        autoPlay 
        playsInline 
        muted
      />
      <canvas 
        ref={canvasRef} 
        className="w-full h-full object-cover transform"
      />
    </>
  );
};

export default GameCanvas;