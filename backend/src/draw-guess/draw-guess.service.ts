import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  DrawGuessCanvasEvent,
  DrawGuessLogEntry,
  DrawGuessPhase,
  DrawGuessPlayerState,
  DrawGuessRoomSnapshot,
  DrawGuessStrokePayload,
  DrawGuessWordEntry,
} from './draw-guess.types';
import { DRAW_GUESS_WORD_BANK } from './draw-guess.words';

const ROUND_DURATION_SECONDS = 75;
const DRAWER_CORRECT_BONUS_POINTS = 4;
const MAX_ROOM_PLAYERS = 6;
const WORD_BANK: DrawGuessWordEntry[] = DRAW_GUESS_WORD_BANK;

interface DrawGuessRoomState {
  code: string;
  maxPlayers: number;
  maxRounds: number;
  hostPlayerId: string;
  players: DrawGuessPlayerState[];
  phase: DrawGuessPhase;
  isGameOver: boolean;
  winnerPlayerIds: string[];
  round: number;
  drawerPlayerId: string | null;
  currentWord: DrawGuessWordEntry | null;
  lastWord: string | null;
  lastCategory: string | null;
  usedWords: string[];
  guessAttempts: number;
  logs: DrawGuessLogEntry[];
  canvasEvents: DrawGuessCanvasEvent[];
  roundDeadlineAt: number | null;
  drawerCursor: number;
}

@Injectable()
export class DrawGuessService {
  private readonly rooms = new Map<string, DrawGuessRoomState>();
  private readonly socketRoomIndex = new Map<string, { roomCode: string; playerId: string }>();

  createRoom(socketId: string, playerName: string, maxPlayers = MAX_ROOM_PLAYERS) {
    const normalizedName = this.normalizePlayerName(playerName, 1);
    const normalizedMaxPlayers = this.normalizeMaxPlayers(maxPlayers);
    const roomCode = this.generateRoomCode();
    const player = this.createPlayer(socketId, normalizedName);
    const room: DrawGuessRoomState = {
      code: roomCode,
      maxPlayers: normalizedMaxPlayers,
      maxRounds: this.getMatchRoundsByPlayers(1),
      hostPlayerId: player.id,
      players: [player],
      phase: 'waiting',
      isGameOver: false,
      winnerPlayerIds: [],
      round: 0,
      drawerPlayerId: null,
      currentWord: null,
      lastWord: null,
      lastCategory: null,
      usedWords: [],
      guessAttempts: 0,
      logs: [this.makeLog('system', `${normalizedName} 创建了房间。`)],
      canvasEvents: [],
      roundDeadlineAt: null,
      drawerCursor: 0,
    };

    this.rooms.set(roomCode, room);
    this.socketRoomIndex.set(socketId, { roomCode, playerId: player.id });

    return {
      roomCode,
      playerId: player.id,
      state: this.toSnapshot(room),
      canvasEvents: room.canvasEvents,
    };
  }

  joinRoom(socketId: string, roomCode: string, playerName: string) {
    const room = this.getRoomOrThrow(roomCode);
    if (room.round > 0 || room.phase !== 'waiting') {
      throw new Error('游戏已经开始，当前房间不能再加入。');
    }
    if (room.players.length >= room.maxPlayers) {
      throw new Error('房间人数已满。');
    }

    const slotIndex = room.players.length + 1;
    const normalizedName = this.normalizePlayerName(playerName, slotIndex);
    const player = this.createPlayer(socketId, normalizedName);

    room.players.push(player);
    room.maxRounds = this.getMatchRoundsByPlayers(room.players.length);
    room.logs.push(this.makeLog('system', `${normalizedName} 加入了房间。`));
    room.logs = room.logs.slice(-30);
    this.socketRoomIndex.set(socketId, { roomCode: room.code, playerId: player.id });

    return {
      roomCode: room.code,
      playerId: player.id,
      state: this.toSnapshot(room),
      canvasEvents: room.canvasEvents,
    };
  }

  leaveRoom(socketId: string) {
    const membership = this.socketRoomIndex.get(socketId);
    if (!membership) {
      return null;
    }

    this.socketRoomIndex.delete(socketId);
    const room = this.rooms.get(membership.roomCode);
    if (!room) {
      return null;
    }

    const playerIndex = room.players.findIndex((player) => player.id === membership.playerId);
    if (playerIndex === -1) {
      return null;
    }

    const [removedPlayer] = room.players.splice(playerIndex, 1);
    room.logs.push(this.makeLog('system', `${removedPlayer.name} 离开了房间。`));
    room.logs = room.logs.slice(-30);

    if (room.players.length === 0) {
      this.rooms.delete(room.code);
      return { roomCode: room.code, deleted: true };
    }

    if (room.hostPlayerId === removedPlayer.id) {
      room.hostPlayerId = room.players[0].id;
    }

    if (room.drawerPlayerId === removedPlayer.id) {
      this.finishRound(room, '画手离开了房间，本轮已结束。');
    }

    if (room.players.length < 2) {
      room.phase = 'waiting';
      room.isGameOver = false;
      room.winnerPlayerIds = [];
      room.round = 0;
      room.drawerPlayerId = null;
      room.currentWord = null;
      room.lastWord = null;
      room.lastCategory = null;
      room.usedWords = [];
      room.guessAttempts = 0;
      room.roundDeadlineAt = null;
      room.canvasEvents = [];
      room.drawerCursor = 0;
      room.players.forEach((member) => {
        member.isReady = false;
      });
      room.maxRounds = this.getMatchRoundsByPlayers(room.players.length);
    } else if (room.round === 0 && room.phase === 'waiting') {
      room.maxRounds = this.getMatchRoundsByPlayers(room.players.length);
    }

    return {
      roomCode: room.code,
      deleted: false,
      state: this.toSnapshot(room),
    };
  }

  startRound(socketId: string) {
    const { room, player } = this.getMembershipOrThrow(socketId);
    this.assertHost(room, player.id);
    if (room.isGameOver) {
      throw new Error('本局已结束，请点击“再来一局”重置后开始。');
    }
    if (room.phase !== 'waiting' || room.round !== 0) {
      throw new Error('当前阶段不能开始游戏。');
    }

    if (room.players.length < 2) {
      throw new Error('至少需要 2 名玩家才可以开始回合。');
    }
    if (!room.players.every((item) => item.isReady)) {
      throw new Error('仍有玩家尚未准备。');
    }
    const roundResult = this.prepareNextRound(room);
    const drawerSocketId = room.players.find((member) => member.id === roundResult.drawerPlayerId)?.socketId ?? null;

    return {
      roomCode: room.code,
      drawerPlayerId: roundResult.drawerPlayerId,
      drawerSocketId,
      secretWord: roundResult.secretWord,
      state: this.toSnapshot(room),
    };
  }

  beginRound(socketId: string) {
    const { room, player } = this.getMembershipOrThrow(socketId);
    this.assertDrawer(room, player.id);

    if (room.phase !== 'memorize') {
      throw new Error('当前回合不处于准备作画阶段。');
    }

    room.phase = 'drawing';
    room.roundDeadlineAt = Date.now() + ROUND_DURATION_SECONDS * 1000;
    room.logs.push(this.makeLog('system', '作画开始，其他玩家可以猜词了。'));
    room.logs = room.logs.slice(-30);

    return {
      roomCode: room.code,
      state: this.toSnapshot(room),
    };
  }

  submitGuess(socketId: string, guess: string) {
    const { room, player } = this.getMembershipOrThrow(socketId);
    if (room.phase !== 'drawing' || !room.currentWord) {
      throw new Error('当前还不能猜词。');
    }

    if (player.id === room.drawerPlayerId) {
      throw new Error('画手不能参与猜词。');
    }

    const normalizedGuess = this.normalizeGuess(guess);
    if (!normalizedGuess) {
      throw new Error('请输入猜词内容。');
    }

    room.guessAttempts += 1;
    room.logs.push(this.makeLog('guess', `${player.name}：${guess.trim()}`));

    if (normalizedGuess === this.normalizeGuess(room.currentWord.word)) {
      player.score += 10 + Math.max(0, Math.ceil(this.getTimeLeftSeconds(room) / 5));
      const drawer =
        room.drawerPlayerId
          ? room.players.find((member) => member.id === room.drawerPlayerId) ?? null
          : null;
      if (drawer && drawer.id !== player.id) {
        drawer.score += DRAWER_CORRECT_BONUS_POINTS;
        room.logs.push(
          this.makeLog(
            'system',
            `${drawer.name} 的画被猜中，获得 ${DRAWER_CORRECT_BONUS_POINTS} 分奖励。`,
          ),
        );
      }
      room.logs.push(this.makeLog('success', `${player.name} 猜中了答案！`));
      const transition = this.finishRound(room, `本轮答案是“${room.currentWord.word}”。`);
      room.logs = room.logs.slice(-30);
      return {
        roomCode: room.code,
        state: this.toSnapshot(room),
        ...transition,
      };
    }

    room.logs = room.logs.slice(-30);

    return {
      roomCode: room.code,
      state: this.toSnapshot(room),
    };
  }

  pushStroke(socketId: string, stroke: DrawGuessStrokePayload) {
    const { room, player } = this.getMembershipOrThrow(socketId);
    this.assertCanDraw(room, player.id);

    const canvasEvent: DrawGuessCanvasEvent = { type: 'stroke', stroke };
    room.canvasEvents.push(canvasEvent);
    room.canvasEvents = room.canvasEvents.slice(-2000);

    return {
      roomCode: room.code,
      stroke,
    };
  }

  clearCanvas(socketId: string) {
    const { room, player } = this.getMembershipOrThrow(socketId);
    this.assertCanDraw(room, player.id);

    room.canvasEvents = [{ type: 'clear' }];

    return {
      roomCode: room.code,
    };
  }

  undoCanvas(socketId: string) {
    const { room, player } = this.getMembershipOrThrow(socketId);
    this.assertCanDraw(room, player.id);

    const lastStrokeIndex = this.findLastStrokeIndex(room.canvasEvents);
    if (lastStrokeIndex === -1) {
      return {
        roomCode: room.code,
        canvasEvents: [...room.canvasEvents],
        state: this.toSnapshot(room),
      };
    }

    const lastStrokeEvent = room.canvasEvents[lastStrokeIndex];
    if (lastStrokeEvent.type !== 'stroke') {
      return {
        roomCode: room.code,
        canvasEvents: [...room.canvasEvents],
        state: this.toSnapshot(room),
      };
    }

    const targetStrokeId = lastStrokeEvent.stroke.strokeId?.trim();
    if (targetStrokeId) {
      for (let index = room.canvasEvents.length - 1; index >= 0; index -= 1) {
        const event = room.canvasEvents[index];
        if (event.type !== 'stroke') {
          continue;
        }
        if (event.stroke.strokeId === targetStrokeId) {
          room.canvasEvents.splice(index, 1);
        }
      }
    } else {
      // 兼容旧客户端（未上报 strokeId）：按轨迹连续性回退最近一整笔
      let cursorFrom = lastStrokeEvent.stroke.from;
      const referenceStroke = lastStrokeEvent.stroke;
      room.canvasEvents.splice(lastStrokeIndex, 1);

      for (let index = lastStrokeIndex - 1; index >= 0; index -= 1) {
        const event = room.canvasEvents[index];
        if (event.type !== 'stroke') {
          break;
        }

        const stroke = event.stroke;
        const sameTool =
          stroke.isErasing === referenceStroke.isErasing
          && stroke.color === referenceStroke.color
          && stroke.size === referenceStroke.size;
        const isConnected =
          this.isNear(stroke.to.x, cursorFrom.x)
          && this.isNear(stroke.to.y, cursorFrom.y);

        if (!sameTool || !isConnected) {
          break;
        }

        cursorFrom = stroke.from;
        room.canvasEvents.splice(index, 1);
      }
    }

    return {
      roomCode: room.code,
      canvasEvents: [...room.canvasEvents],
      state: this.toSnapshot(room),
    };
  }

  handleTick(roomCode: string) {
    const room = this.rooms.get(roomCode);
    if (!room || room.phase !== 'drawing') {
      return null;
    }

    if (this.getTimeLeftSeconds(room) > 0) {
      return {
        roomCode: room.code,
        state: this.toSnapshot(room),
      };
    }

    const transition = this.finishRound(room, '时间到，没人猜出来。');
    return {
      roomCode: room.code,
      state: this.toSnapshot(room),
      ...transition,
    };
  }

  getRoomState(roomCode: string) {
    const room = this.rooms.get(roomCode);
    return room ? this.toSnapshot(room) : null;
  }

  listRooms() {
    const list: Array<{ roomCode: string; playerCount: number; maxPlayers: number; hostName: string }> = [];
    this.rooms.forEach((room) => {
      if (room.phase === 'waiting' && room.round === 0) {
        const host = room.players.find((p) => p.id === room.hostPlayerId);
        list.push({
          roomCode: room.code,
          playerCount: room.players.length,
          maxPlayers: room.maxPlayers,
          hostName: host?.name ?? '房主',
        });
      }
    });
    return list;
  }

  getMembership(socketId: string) {
    const membership = this.socketRoomIndex.get(socketId);
    if (!membership) {
      return null;
    }

    const room = this.rooms.get(membership.roomCode);
    const player = room?.players.find((item) => item.id === membership.playerId) ?? null;
    if (!room || !player) {
      return null;
    }

    return { room, player };
  }

  toggleReady(socketId: string) {
    const { room, player } = this.getMembershipOrThrow(socketId);
    if (room.round > 0) {
      throw new Error('游戏已经开始，不能再切换准备状态。');
    }
    if (room.phase !== 'waiting') {
      throw new Error('当前阶段不能切换准备状态。');
    }

    player.isReady = !player.isReady;
    room.logs.push(
      this.makeLog('system', `${player.name}${player.isReady ? ' 已准备。' : ' 取消了准备。'}`),
    );
    room.logs = room.logs.slice(-30);

    return {
      roomCode: room.code,
      state: this.toSnapshot(room),
    };
  }

  resetMatch(socketId: string) {
    const { room, player } = this.getMembershipOrThrow(socketId);
    this.assertHost(room, player.id);
    if (!room.isGameOver) {
      throw new Error('当前对战尚未结束，无需重置。');
    }

    room.phase = 'waiting';
    room.isGameOver = false;
    room.winnerPlayerIds = [];
    room.round = 0;
    room.drawerPlayerId = null;
    room.currentWord = null;
    room.lastWord = null;
    room.lastCategory = null;
    room.usedWords = [];
    room.guessAttempts = 0;
    room.canvasEvents = [];
    room.roundDeadlineAt = null;
    room.drawerCursor = 0;
    room.maxRounds = this.getMatchRoundsByPlayers(room.players.length);
    room.players.forEach((member) => {
      member.score = 0;
      member.isReady = false;
    });
    room.logs.push(this.makeLog('system', '房主重置了对战，等待玩家重新准备。'));
    room.logs = room.logs.slice(-30);

    return {
      roomCode: room.code,
      state: this.toSnapshot(room),
    };
  }

  private getMembershipOrThrow(socketId: string) {
    const membership = this.getMembership(socketId);
    if (!membership) {
      throw new Error('你还没有加入房间。');
    }

    return membership;
  }

  private getRoomOrThrow(roomCode: string) {
    const normalizedCode = roomCode.trim().toUpperCase();
    const room = this.rooms.get(normalizedCode);
    if (!room) {
      throw new Error('房间不存在。');
    }

    return room;
  }

  private assertHost(room: DrawGuessRoomState, playerId: string) {
    if (room.hostPlayerId !== playerId) {
      throw new Error('只有房主可以开始新回合。');
    }
  }

  private assertDrawer(room: DrawGuessRoomState, playerId: string) {
    if (room.drawerPlayerId !== playerId) {
      throw new Error('只有当前画手可以开始作画。');
    }
  }

  private assertCanDraw(room: DrawGuessRoomState, playerId: string) {
    if (room.phase !== 'drawing' || room.drawerPlayerId !== playerId) {
      throw new Error('当前只有画手可以操作画布。');
    }
  }

  private finishRound(room: DrawGuessRoomState, message: string) {
    room.phase = 'finished';
    room.roundDeadlineAt = null;
    if (room.currentWord) {
      room.logs.push(this.makeLog('system', message));
    }
    this.applyGameOverIfNeeded(room);
    if (room.isGameOver) {
      room.logs = room.logs.slice(-30);
      return {};
    }
    if (room.players.length < 2) {
      room.phase = 'waiting';
      room.drawerPlayerId = null;
      room.currentWord = null;
      room.lastCategory = null;
      room.guessAttempts = 0;
      room.logs.push(this.makeLog('system', '人数不足 2 人，对战已暂停。'));
      room.logs = room.logs.slice(-30);
      return {};
    }
    const nextRound = this.prepareNextRound(room);
    room.logs = room.logs.slice(-30);
    return {
      shouldClearCanvas: true,
      drawerSocketId: room.players.find((member) => member.id === nextRound.drawerPlayerId)?.socketId ?? null,
      secretWord: nextRound.secretWord,
    };
  }

  private prepareNextRound(room: DrawGuessRoomState) {
    if (room.round === 0) {
      room.maxRounds = this.getMatchRoundsByPlayers(room.players.length);
    }

    room.phase = 'memorize';
    room.round += 1;
    room.guessAttempts = 0;
    room.currentWord = this.pickNextWord(room.lastWord, room.lastCategory, room.usedWords);
    room.lastWord = room.currentWord.word;
    room.lastCategory = room.currentWord.category;
    if (!room.usedWords.includes(room.currentWord.word)) {
      room.usedWords.push(room.currentWord.word);
    }
    room.drawerPlayerId = this.pickNextDrawer(room);
    room.roundDeadlineAt = null;
    room.canvasEvents = [];
    room.logs.push(
      this.makeLog(
        'system',
        `第 ${room.round} 回合开始，画手是 ${this.getPlayerName(room, room.drawerPlayerId)}。`,
      ),
    );
    room.logs.push(this.makeLog('system', '当前画手点击“我准备好了”后开始作画。'));
    room.logs = room.logs.slice(-30);
    return {
      drawerPlayerId: room.drawerPlayerId,
      secretWord: room.currentWord,
    };
  }

  private applyGameOverIfNeeded(room: DrawGuessRoomState) {
    if (room.isGameOver) {
      return;
    }
    if (room.round < room.maxRounds) {
      return;
    }

    const highestScore = room.players.reduce((max, player) => Math.max(max, player.score), 0);
    const winners = room.players.filter((player) => player.score === highestScore);
    room.isGameOver = true;
    room.winnerPlayerIds = winners.map((winner) => winner.id);
    const winnerNames = winners.map((winner) => winner.name).join('、');
    room.logs.push(
      this.makeLog(
        'success',
        `本局结束（${room.maxRounds} 回合），冠军：${winnerNames}（${highestScore} 分）。`,
      ),
    );
  }

  private pickNextDrawer(room: DrawGuessRoomState) {
    const drawer = room.players[room.drawerCursor % room.players.length];
    room.drawerCursor = (room.drawerCursor + 1) % room.players.length;
    return drawer.id;
  }

  private pickNextWord(lastWord: string | null, lastCategory: string | null, usedWords: string[]) {
    if (usedWords.length >= WORD_BANK.length) {
      usedWords.length = 0;
    }

    const usedSet = new Set(usedWords);
    let pool = WORD_BANK.filter((entry) => !usedSet.has(entry.word));
    if (!pool.length) {
      usedWords.length = 0;
      pool = [...WORD_BANK];
    }

    if (lastCategory) {
      const categoryBalancedPool = pool.filter((entry) => entry.category !== lastCategory);
      if (categoryBalancedPool.length >= Math.min(6, pool.length)) {
        pool = categoryBalancedPool;
      }
    }

    if (lastWord) {
      const avoidLastWordPool = pool.filter((entry) => entry.word !== lastWord);
      if (avoidLastWordPool.length) {
        pool = avoidLastWordPool;
      }
    }

    return pool[Math.floor(Math.random() * pool.length)];
  }

  private getTimeLeftSeconds(room: DrawGuessRoomState) {
    if (!room.roundDeadlineAt) {
      return ROUND_DURATION_SECONDS;
    }

    return Math.max(0, Math.ceil((room.roundDeadlineAt - Date.now()) / 1000));
  }

  private toSnapshot(room: DrawGuessRoomState): DrawGuessRoomSnapshot {
    const drawerPlayer = room.drawerPlayerId
      ? room.players.find((player) => player.id === room.drawerPlayerId) ?? null
      : null;

    return {
      roomCode: room.code,
      maxPlayers: room.maxPlayers,
      maxRounds: room.maxRounds,
      isGameOver: room.isGameOver,
      winnerPlayerIds: [...room.winnerPlayerIds],
      allPlayersReady: room.players.length > 0 && room.players.every((player) => player.isReady),
      phase: room.phase,
      round: room.round,
      timeLeft: room.phase === 'drawing' ? this.getTimeLeftSeconds(room) : ROUND_DURATION_SECONDS,
      hostPlayerId: room.hostPlayerId,
      drawerPlayerId: room.drawerPlayerId,
      drawerPlayerName: drawerPlayer?.name ?? null,
      category: room.currentWord?.category ?? null,
      hintText: this.getHintText(room),
      revealedAnswer: room.phase === 'finished' ? room.currentWord?.word ?? null : null,
      guessAttempts: room.guessAttempts,
      canvasStrokeCount: room.canvasEvents.filter((event) => event.type === 'stroke').length,
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        score: player.score,
        isHost: player.id === room.hostPlayerId,
        isDrawer: player.id === room.drawerPlayerId,
        isReady: player.isReady,
      })),
      logs: room.logs,
    };
  }

  private getHintText(room: DrawGuessRoomState) {
    if (!room.currentWord) {
      return '房主开始游戏后，系统会给出题材和字数提示。';
    }

    const tips = [
      `题材：${room.currentWord.category}，共 ${room.currentWord.word.length} 个字。`,
      `首字提示：${room.currentWord.word.slice(0, 1)}。`,
      `尾字提示：${room.currentWord.word.slice(-1)}。`,
    ];

    if (room.guessAttempts >= 4) {
      return `${tips[0]} ${tips[1]} ${tips[2]}`;
    }

    if (room.guessAttempts >= 2) {
      return `${tips[0]} ${tips[1]}`;
    }

    return tips[0];
  }

  private generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let roomCode = '';

    do {
      roomCode = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    } while (this.rooms.has(roomCode));

    return roomCode;
  }

  private createPlayer(socketId: string, name: string): DrawGuessPlayerState {
    return {
      id: randomUUID(),
      socketId,
      name,
      score: 0,
      isReady: false,
    };
  }

  private normalizeMaxPlayers(maxPlayers: number) {
    const normalized = Number(maxPlayers);
    if (!Number.isInteger(normalized) || normalized < 2 || normalized > MAX_ROOM_PLAYERS) {
      return MAX_ROOM_PLAYERS;
    }

    return normalized;
  }

  private getMatchRoundsByPlayers(playerCount: number) {
    return Math.max(2, playerCount * 2);
  }

  private getPlayerName(room: DrawGuessRoomState, playerId: string | null) {
    return room.players.find((player) => player.id === playerId)?.name ?? '未知玩家';
  }

  private normalizePlayerName(playerName: string, slotIndex?: number) {
    const trimmed = playerName.trim().slice(0, 12);
    if (trimmed) return trimmed;
    return slotIndex != null ? `玩家${slotIndex}` : `玩家${Math.floor(Math.random() * 1000)}`;
  }

  private normalizeGuess(guess: string) {
    return guess.trim().replace(/\s+/g, '').toLowerCase();
  }

  private findLastStrokeIndex(events: DrawGuessCanvasEvent[]) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      if (events[index].type === 'stroke') {
        return index;
      }
    }
    return -1;
  }

  private isNear(a: number, b: number, epsilon = 1e-6) {
    return Math.abs(a - b) <= epsilon;
  }

  private makeLog(type: DrawGuessLogEntry['type'], text: string): DrawGuessLogEntry {
    return {
      id: randomUUID(),
      type,
      text,
    };
  }
}
