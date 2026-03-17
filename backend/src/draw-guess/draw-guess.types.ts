export interface DrawGuessWordEntry {
  word: string;
  category: string;
}

export interface DrawGuessPlayerState {
  id: string;
  socketId: string;
  name: string;
  score: number;
  isReady: boolean;
  guessCount: number;
  drawTurnsTaken: number;
}

export interface DrawGuessLogEntry {
  id: string;
  type: 'drawer' | 'guess';
  text: string;
}

export interface DrawGuessStrokePayload {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  size: number;
  isErasing: boolean;
  strokeId?: string;
}

export type DrawGuessCanvasEvent =
  | { type: 'stroke'; stroke: DrawGuessStrokePayload }
  | { type: 'clear' };

export type DrawGuessPhase = 'waiting' | 'memorize' | 'drawing' | 'finished';

export interface DrawGuessRoomSnapshot {
  roomCode: string;
  maxPlayers: number;
  roundsPerPlayer: number;
  maxRounds: number;
  isGameOver: boolean;
  winnerPlayerIds: string[];
  allPlayersReady: boolean;
  phase: DrawGuessPhase;
  round: number;
  timeLeft: number;
  hostPlayerId: string;
  drawerPlayerId: string | null;
  drawerPlayerName: string | null;
  category: string | null;
  hintText: string;
  revealedAnswer: string | null;
  guessAttempts: number;
  canvasStrokeCount: number;
  players: Array<{
    id: string;
    name: string;
    score: number;
    isHost: boolean;
    isDrawer: boolean;
    isReady: boolean;
    guessCount: number;
    drawTurnsTaken: number;
  }>;
  logs: DrawGuessLogEntry[];
}
