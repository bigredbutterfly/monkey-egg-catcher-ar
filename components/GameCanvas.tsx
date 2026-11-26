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

interface FaceData {
  hasFace: boolean;
  x: number;
  y: number;
  isOpen: boolean;
  radius: number;
  // Mask positioning
  headCenterX: number;
  headCenterY: number;
  foreheadX: number;
  foreheadY: number;
  faceWidth: number;
  faceHeight: number;
  angle: number;
  leftEarX: number;
  leftEarY: number;
  rightEarX: number;
  rightEarY: number;
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
  const procCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const requestRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  const lastTimestampRef = useRef<number>(0);
  const isInitializingRef = useRef<boolean>(false);
  
  // Game Logic Refs
  const snacksRef = useRef<Snack[]>([]);
  const scoreRef = useRef(0);
  const missedRef = useRef(0);
  const frameCountRef = useRef(0);
  const gameActiveRef = useRef(false);

  // Persist face and mouth data across frames
  const faceDataRef = useRef<FaceData>({
    hasFace: false,
    x: 0,
    y: 0,
    isOpen: false,
    radius: 80,
    headCenterX: 0,
    headCenterY: 0,
    foreheadX: 0,
    foreheadY: 0,
    faceWidth: 100,
    faceHeight: 120,
    angle: 0,
    leftEarX: 0,
    leftEarY: 0,
    rightEarX: 0,
    rightEarY: 0,
  });

  // Sync score with props
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  // MediaPipe Initialization with robust fallback and confidence thresholds
  const initMediaPipe = useCallback(async () => {
    if (isInitializingRef.current) return;
    isInitializingRef.current = true;
    try {
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      
      const options = {
        outputFaceBlendshapes: true,
        runningMode: "VIDEO" as const,
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      };

      let landmarker: FaceLandmarker;
      try {
        landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          ...options,
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
          }
        });
      } catch {
        // Safe fallback to CPU delegate without alarming console warnings
        landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          ...options,
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "CPU"
          }
        });
      }

      setFaceLandmarker(landmarker);
    } catch (error) {
      console.error("Failed to load MediaPipe FaceLandmarker:", error);
    } finally {
      isInitializingRef.current = false;
    }
  }, []);

  useEffect(() => {
    setGameState(GameState.LOADING);
    initMediaPipe();
  }, [initMediaPipe, setGameState]);

  // Setup Camera safely with non-hidden DOM node
  useEffect(() => {
    let activeStream: MediaStream | null = null;
    let isCancelled = false;

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

        if (isCancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        activeStream = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;

          const handleCanPlay = () => {
            if (video && video.videoWidth > 0 && video.videoHeight > 0) {
              video.play().catch(e => console.warn("Video play interrupted:", e));
              setVideoReady(true);
            }
          };

          video.addEventListener('loadeddata', handleCanPlay);
          video.addEventListener('canplay', handleCanPlay);
        }
      } catch (err) {
        console.warn("Error accessing camera:", err);
      }
    };

    startCamera();

    return () => {
      isCancelled = true;
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Update Game State when both tools are ready
  useEffect(() => {
    if (faceLandmarker && videoReady && gameState === GameState.LOADING) {
      setGameState(GameState.MENU);
    }
  }, [faceLandmarker, videoReady, gameState, setGameState]);

  // Helper to draw cute Monkey Ears & Sun Wukong Circlet
  const drawMonkeyARMask = (ctx: CanvasRenderingContext2D, face: FaceData) => {
    const { headCenterX, headCenterY, faceWidth, faceHeight, angle, isOpen, x: mouthX, y: mouthY, radius: mouthR } = face;
    
    ctx.save();
    ctx.translate(headCenterX, headCenterY);
    ctx.rotate(angle);

    const earRadius = faceWidth * 0.22;
    const earOffsetX = faceWidth * 0.58;
    const earOffsetY = -faceHeight * 0.28;

    // 1. Monkey Ears (Outer Brown)
    ctx.fillStyle = "#8B4513";
    ctx.strokeStyle = "#5C2C16";
    ctx.lineWidth = 4;

    // Left Ear Outer
    ctx.beginPath();
    ctx.arc(-earOffsetX, earOffsetY, earRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Right Ear Outer
    ctx.beginPath();
    ctx.arc(earOffsetX, earOffsetY, earRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Inner Ears (Pink)
    ctx.fillStyle = "#FFB6C1";
    ctx.beginPath();
    ctx.arc(-earOffsetX, earOffsetY, earRadius * 0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(earOffsetX, earOffsetY, earRadius * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // 2. Monkey Forehead Tufts / Fur
    ctx.fillStyle = "#A0522D";
    ctx.beginPath();
    ctx.moveTo(-faceWidth * 0.35, -faceHeight * 0.45);
    ctx.quadraticCurveTo(0, -faceHeight * 0.62, faceWidth * 0.35, -faceHeight * 0.45);
    ctx.quadraticCurveTo(0, -faceHeight * 0.40, -faceWidth * 0.35, -faceHeight * 0.45);
    ctx.fill();

    // 3. Sun Wukong's Iconic Golden Circlet (紧箍咒)
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 6;
    ctx.shadowColor = "#FFA500";
    ctx.shadowBlur = 10;
    
    // Golden Band across forehead
    ctx.beginPath();
    ctx.arc(0, -faceHeight * 0.42, faceWidth * 0.45, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    // Golden Circlet Central Crescent/Loop
    ctx.beginPath();
    ctx.arc(0, -faceHeight * 0.48, faceWidth * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = "#FFF7A0";
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // 4. Mouth Target Ring & Indicator
    ctx.save();
    ctx.beginPath();
    ctx.arc(mouthX, mouthY, mouthR, 0, 2 * Math.PI);
    ctx.lineWidth = 4;
    ctx.strokeStyle = isOpen ? "#22C55E" : "#EF4444";
    ctx.stroke();

    // Fill aura
    ctx.fillStyle = isOpen ? "rgba(34, 197, 94, 0.25)" : "rgba(239, 68, 68, 0.12)";
    ctx.fill();

    // Indicator Badge
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = isOpen ? "#22C55E" : "#EF4444";
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 6;
    ctx.fillText(isOpen ? "😋 MOUTH OPEN!" : "😮 OPEN WIDE", mouthX, mouthY + mouthR + 28);
    ctx.restore();
  };

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

    // Ensure canvas size strictly matches valid video size
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
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    ctx.restore();

    if (!faceLandmarker) {
      requestRef.current = requestAnimationFrame(renderLoop);
      return;
    }

    // 2. Process Face Logic using a dedicated, guaranteed-dimension 2D processing canvas
    // This completely eliminates MediaPipe "ROI width and height must be > 0" RET_CHECK failures.
    const isVideoValid = 
      video.readyState >= 2 && 
      video.videoWidth > 0 && 
      video.videoHeight > 0 &&
      canvas.width > 0 &&
      canvas.height > 0 &&
      !video.paused && 
      !video.ended &&
      video.currentTime > 0;

    if (isVideoValid && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;

      // Lazy-init dedicated processing canvas with fixed, positive dimensions
      if (!procCanvasRef.current) {
        procCanvasRef.current = document.createElement('canvas');
        procCanvasRef.current.width = 640;
        procCanvasRef.current.height = 480;
      }
      const procCanvas = procCanvasRef.current;
      const procCtx = procCanvas.getContext('2d', { willReadFrequently: true });
      
      if (procCtx) {
        procCtx.drawImage(video, 0, 0, procCanvas.width, procCanvas.height);

        try {
          let nowMs = performance.now();
          if (nowMs <= lastTimestampRef.current) {
            nowMs = lastTimestampRef.current + 1;
          }
          lastTimestampRef.current = nowMs;

          // Feed the guaranteed-dimension procCanvas into MediaPipe
          const detections = faceLandmarker.detectForVideo(procCanvas, nowMs);

          if (detections.faceLandmarks && detections.faceLandmarks.length > 0) {
            const landmarks = detections.faceLandmarks[0];

            // Coordinate conversion from normalized 0..1 to canvas size (Mirror aware)
            const getX = (val: number) => (1 - val) * canvas.width;
            const getY = (val: number) => val * canvas.height;

            // Mouth landmarks
            const upperLipY = landmarks[13].y;
            const lowerLipY = landmarks[14].y;
            const mouthDist = Math.abs(lowerLipY - upperLipY); 
            const faceHeightNorm = Math.abs(landmarks[152].y - landmarks[10].y); // Chin - Forehead
            const openRatio = mouthDist / (faceHeightNorm || 1);

            const isOpen = openRatio > 0.025; 

            const centerX = getX((landmarks[13].x + landmarks[14].x) / 2);
            const centerY = getY((landmarks[13].y + landmarks[14].y) / 2);

            // Head landmarks for Monkey Mask
            const foreheadX = getX(landmarks[10].x);
            const foreheadY = getY(landmarks[10].y);
            const chinX = getX(landmarks[152].x);
            const chinY = getY(landmarks[152].y);
            const leftCheekX = getX(landmarks[234].x);
            const leftCheekY = getY(landmarks[234].y);
            const rightCheekX = getX(landmarks[454].x);
            const rightCheekY = getY(landmarks[454].y);

            const headCenterX = (foreheadX + chinX) / 2;
            const headCenterY = (foreheadY + chinY) / 2;
            const faceWidth = Math.hypot(rightCheekX - leftCheekX, rightCheekY - leftCheekY);
            const faceHeight = Math.hypot(chinX - foreheadX, chinY - foreheadY);
            const angle = Math.atan2(rightCheekY - leftCheekY, rightCheekX - leftCheekX);

            // Hitbox size for catching snacks
            const radius = Math.max(faceWidth * 0.38, 45);

            faceDataRef.current = {
              hasFace: true,
              x: centerX,
              y: centerY,
              isOpen,
              radius,
              headCenterX,
              headCenterY,
              foreheadX,
              foreheadY,
              faceWidth,
              faceHeight,
              angle,
              leftEarX: leftCheekX,
              leftEarY: leftCheekY,
              rightEarX: rightCheekX,
              rightEarY: rightCheekY
            };
          } else {
            faceDataRef.current.hasFace = false;
          }
        } catch (e: any) {
          console.warn("FaceLandmarker detection error caught:", e);
          if (String(e).includes("Graph has errors") || String(e).includes("RET_CHECK")) {
            setFaceLandmarker(null);
            initMediaPipe();
          }
        }
      }
    }

    // 2.5 Draw Monkey Head Filter & Mouth Target
    if (faceDataRef.current.hasFace) {
      drawMonkeyARMask(ctx, faceDataRef.current);
    }

    // 3. Game Physics
    if (gameState === GameState.PLAYING && gameActiveRef.current) {
      frameCountRef.current++;
      
      // Spawn Snacks
      if (frameCountRef.current % 45 === 0) {
        const newSnack: Snack = {
          id: Date.now() + Math.random(),
          x: Math.random() * (canvas.width - 120) + 60,
          y: -50,
          speed: 4.5 + (scoreRef.current * 0.2), 
          isCaught: false,
          emoji: getRandomSnack()
        };
        snacksRef.current.push(newSnack);
      }

      // Update Snacks
      snacksRef.current.forEach(snack => {
        if (snack.isCaught) return;
        snack.y += snack.speed;

        // Use face mouth data for collision
        if (faceDataRef.current.hasFace) {
          const { x: mouthX, y: mouthY, radius: catchRadius, isOpen } = faceDataRef.current;
          const dist = Math.hypot(snack.x - mouthX, snack.y - mouthY);
          
          if (dist < catchRadius) {
            if (isOpen) {
              // CAUGHT!
              snack.isCaught = true;
              scoreRef.current += 1;
              setScore(s => s + 1);
              
              // Visual feedback sparkle pop
              ctx.save();
              ctx.font = "80px serif";
              ctx.fillStyle = "#FFD700";
              ctx.shadowColor = "rgba(0,0,0,0.8)";
              ctx.shadowBlur = 12;
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

      // Cleanup caught/offscreen snacks
      snacksRef.current = snacksRef.current.filter(e => !e.isCaught);
    }

    // 4. Draw Snacks
    snacksRef.current.forEach(snack => {
      if (snack.isCaught) return;
      ctx.save();
      ctx.font = "64px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "white"; 
      ctx.globalAlpha = 1.0;
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 4;
      ctx.fillText(snack.emoji, snack.x, snack.y);
      ctx.restore();
    });

    requestRef.current = requestAnimationFrame(renderLoop);
  }, [faceLandmarker, gameState, setScore, setMissed, setGameState, onGameOver, initMediaPipe]);

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
      faceDataRef.current.hasFace = false;
    } else {
      gameActiveRef.current = false;
    }
  }, [gameState]);

  return (
    <>
      {/* Video element kept active in DOM with layout box off-screen instead of display:none */}
      <video 
        ref={videoRef} 
        style={{
          position: 'fixed',
          top: -9999,
          left: -9999,
          width: '640px',
          height: '480px',
          opacity: 0,
          pointerEvents: 'none'
        }}
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