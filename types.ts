export enum GameState {
  MENU = 'MENU',
  LOADING = 'LOADING',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER'
}

export interface Egg {
  id: number;
  x: number;
  y: number;
  speed: number;
  isCaught: boolean;
}

export interface GameStats {
  score: number;
  missed: number;
}