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
const MAX_GUESSES_PER_PLAYER = 3;
const DEFAULT_ROUNDS_PER_PLAYER = 2;
const DEFAULT_ARK_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const DEFAULT_ARK_MODEL = 'doubao-seed-1-8-251228';
const HARD_CODED_ARK_API_KEY = '04433a49-2cef-4da6-a8c6-c8bc5e508adf';
const REMOTE_WORD_TIMEOUT_MS = 8000;
const WORD_BANK: DrawGuessWordEntry[] = DRAW_GUESS_WORD_BANK;

interface DrawGuessRoomState {
  code: string;
  maxPlayers: number;
  roundsPerPlayer: number;
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
  private readonly remoteWordApiUrl = DEFAULT_ARK_API_URL;
  private readonly remoteWordApiKey = HARD_CODED_ARK_API_KEY;
  private readonly remoteWordModel = DEFAULT_ARK_MODEL;

  createRoom(
    socketId: string,
    playerName: string,
    maxPlayers = MAX_ROOM_PLAYERS,
    roundsPerPlayer = DEFAULT_ROUNDS_PER_PLAYER,
  ) {
    const normalizedName = this.normalizePlayerName(playerName, 1);
    const normalizedMaxPlayers = this.normalizeMaxPlayers(maxPlayers);
    const normalizedRoundsPerPlayer = this.normalizeRoundsPerPlayer(roundsPerPlayer);
    const roomCode = this.generateRoomCode();
    const player = this.createPlayer(socketId, normalizedName);
    const room: DrawGuessRoomState = {
      code: roomCode,
      maxPlayers: normalizedMaxPlayers,
      roundsPerPlayer: normalizedRoundsPerPlayer,
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
      logs: [],
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
    this.socketRoomIndex.set(socketId, { roomCode: room.code, playerId: player.id });

    return {
      roomCode: room.code,
      playerId: player.id,
      state: this.toSnapshot(room),
      canvasEvents: room.canvasEvents,
    };
  }

  async leaveRoom(socketId: string) {
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

    if (room.players.length === 0) {
      this.rooms.delete(room.code);
      return { roomCode: room.code, deleted: true };
    }

    if (room.hostPlayerId === removedPlayer.id) {
      room.hostPlayerId = room.players[0].id;
    }

    if (room.drawerPlayerId === removedPlayer.id) {
      await this.finishRound(room, '画手离开了房间，本轮已结束。');
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
      room.logs = [];
      room.players.forEach((member) => {
        member.isReady = false;
        member.guessCount = 0;
        member.drawTurnsTaken = 0;
      });
    } else if (room.phase !== 'waiting') {
      this.applyGameOverIfNeeded(room);
    }

    return {
      roomCode: room.code,
      deleted: false,
      state: this.toSnapshot(room),
    };
  }

  async startRound(socketId: string) {
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
    const roundResult = await this.prepareNextRound(room);
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

    return {
      roomCode: room.code,
      state: this.toSnapshot(room),
    };
  }

  async submitGuess(socketId: string, guess: string) {
    const { room, player } = this.getMembershipOrThrow(socketId);
    if (room.phase !== 'drawing' || !room.currentWord) {
      throw new Error('当前还不能猜词。');
    }

    if (player.id === room.drawerPlayerId) {
      throw new Error('画手不能参与猜词。');
    }
    if (player.guessCount >= MAX_GUESSES_PER_PLAYER) {
      throw new Error('本回合你的猜词机会已经用完了。');
    }

    const normalizedGuess = this.normalizeGuess(guess);
    if (!normalizedGuess) {
      throw new Error('请输入猜词内容。');
    }

    player.guessCount += 1;
    room.guessAttempts += 1;
    room.logs.push(this.makeLog('guess', `${player.name} 猜题为 ${guess.trim()}`));

    if (normalizedGuess === this.normalizeGuess(room.currentWord.word)) {
      player.score += 10 + Math.max(0, Math.ceil(this.getTimeLeftSeconds(room) / 5));
      const drawer =
        room.drawerPlayerId
          ? room.players.find((member) => member.id === room.drawerPlayerId) ?? null
          : null;
      if (drawer && drawer.id !== player.id) {
        drawer.score += DRAWER_CORRECT_BONUS_POINTS;
      }
      const transition = await this.finishRound(room, `本轮答案是“${room.currentWord.word}”。`);
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

  async handleTick(roomCode: string) {
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

    const transition = await this.finishRound(room, '时间到，没人猜出来。');
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
    room.logs = [];
    room.canvasEvents = [];
    room.roundDeadlineAt = null;
    room.drawerCursor = 0;
    room.players.forEach((member) => {
      member.score = 0;
      member.isReady = false;
      member.guessCount = 0;
      member.drawTurnsTaken = 0;
    });

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

  private async finishRound(room: DrawGuessRoomState, _message: string) {
    room.phase = 'finished';
    room.roundDeadlineAt = null;
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
      room.logs = room.logs.filter((log) => log.type === 'guess').slice(-30);
      return {};
    }
    const nextRound = await this.prepareNextRound(room);
    room.logs = room.logs.slice(-30);
    return {
      shouldClearCanvas: true,
      drawerSocketId: room.players.find((member) => member.id === nextRound.drawerPlayerId)?.socketId ?? null,
      secretWord: nextRound.secretWord,
    };
  }

  private async prepareNextRound(room: DrawGuessRoomState) {
    room.phase = 'memorize';
    room.round += 1;
    room.guessAttempts = 0;
    room.players.forEach((player) => {
      player.guessCount = 0;
    });
    room.currentWord = await this.pickNextWord(room.lastWord, room.lastCategory, room.usedWords);
    room.lastWord = room.currentWord.word;
    room.lastCategory = room.currentWord.category;
    if (!room.usedWords.includes(room.currentWord.word)) {
      room.usedWords.push(room.currentWord.word);
    }
    room.drawerPlayerId = this.pickNextDrawer(room);
    room.roundDeadlineAt = null;
    room.canvasEvents = [];
    room.logs.push(this.makeLog('drawer', `当前画手：${this.getPlayerName(room, room.drawerPlayerId)}`));
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
    if (!room.players.length || room.players.some((player) => player.drawTurnsTaken < room.roundsPerPlayer)) {
      return;
    }

    const highestScore = room.players.reduce((max, player) => Math.max(max, player.score), 0);
    const winners = room.players.filter((player) => player.score === highestScore);
    room.isGameOver = true;
    room.winnerPlayerIds = winners.map((winner) => winner.id);
    room.logs = room.logs.filter((log) => log.type === 'guess').slice(-30);
  }

  private pickNextDrawer(room: DrawGuessRoomState) {
    const eligiblePlayers = room.players.filter((player) => player.drawTurnsTaken < room.roundsPerPlayer);
    if (!eligiblePlayers.length) {
      throw new Error('没有可继续作画的玩家。');
    }

    const totalPlayers = room.players.length;
    for (let step = 0; step < totalPlayers; step += 1) {
      const player = room.players[(room.drawerCursor + step) % totalPlayers];
      if (player.drawTurnsTaken >= room.roundsPerPlayer) {
        continue;
      }
      room.drawerCursor = (room.drawerCursor + step + 1) % totalPlayers;
      player.drawTurnsTaken += 1;
      return player.id;
    }

    const fallbackPlayer = eligiblePlayers[0];
    fallbackPlayer.drawTurnsTaken += 1;
    room.drawerCursor = (room.players.findIndex((player) => player.id === fallbackPlayer.id) + 1) % totalPlayers;
    return fallbackPlayer.id;
  }

  private async pickNextWord(lastWord: string | null, lastCategory: string | null, usedWords: string[]) {
    const remoteWord = await this.requestRemoteWord(lastWord, lastCategory, usedWords);
    if (remoteWord) {
      return remoteWord;
    }

    return this.pickLocalWord(lastWord, lastCategory, usedWords);
  }

  private pickLocalWord(lastWord: string | null, lastCategory: string | null, usedWords: string[]) {
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

  private async requestRemoteWord(
    lastWord: string | null,
    lastCategory: string | null,
    usedWords: string[],
  ): Promise<DrawGuessWordEntry | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REMOTE_WORD_TIMEOUT_MS);

    try {
      const response = await fetch(this.remoteWordApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.remoteWordApiKey}`,
        },
        body: JSON.stringify({
          model: this.remoteWordModel,
          temperature: 1.1,
          messages: [
            {
              role: 'system',
              content: '你是你画我猜出题器。只返回 JSON，不要解释，不要 markdown。',
            },
            {
              role: 'user',
              content: [
                '请生成一个适合你画我猜的中文题目。',
                '严格返回 JSON，格式为 {"word":"苹果","category":"水果"}。',
                'word 必须只有两个汉字，category 用 2 到 4 个汉字表示类型。',
                '题目要具体、常见、容易画，不要抽象概念，不要人名地名。',
                lastWord ? `不要和上一题重复：${lastWord}。` : '',
                lastCategory ? `尽量不要继续使用这个分类：${lastCategory}。` : '',
                usedWords.length ? `不要与这些历史题目重复：${usedWords.slice(-20).join('、')}。` : '',
              ].filter(Boolean).join('\n'),
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return null;
      }

      const result = await response.json().catch(() => null);
      const content = result?.choices?.[0]?.message?.content;
      return this.parseRemoteWordEntry(content, lastWord, lastCategory, usedWords);
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseRemoteWordEntry(
    rawContent: unknown,
    lastWord: string | null,
    lastCategory: string | null,
    usedWords: string[],
  ): DrawGuessWordEntry | null {
    if (typeof rawContent !== 'string' || !rawContent.trim()) {
      return null;
    }

    const content = rawContent.trim();
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/i) ?? content.match(/```([\s\S]*?)```/);
    const jsonText = (jsonMatch?.[1] ?? content).trim();

    let parsed: { word?: unknown; category?: unknown } | null = null;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      parsed = { word: content, category: 'AI题目' };
    }

    const word = typeof parsed?.word === 'string' ? parsed.word.trim() : '';
    const category = typeof parsed?.category === 'string' ? parsed.category.trim() : 'AI题目';

    if (!/^[\u4e00-\u9fa5]{2}$/.test(word)) {
      return null;
    }
    if (word === lastWord || usedWords.includes(word)) {
      return null;
    }

    const normalizedCategory = category.replace(/\s+/g, '').slice(0, 4) || 'AI题目';
    if (lastCategory && normalizedCategory === lastCategory) {
      return null;
    }

    return {
      word,
      category: normalizedCategory,
    };
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
      roundsPerPlayer: room.roundsPerPlayer,
      maxRounds: room.players.length * room.roundsPerPlayer,
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
        guessCount: player.guessCount,
        drawTurnsTaken: player.drawTurnsTaken,
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
      guessCount: 0,
      drawTurnsTaken: 0,
    };
  }

  private normalizeMaxPlayers(maxPlayers: number) {
    const normalized = Number(maxPlayers);
    if (!Number.isInteger(normalized) || normalized < 2 || normalized > MAX_ROOM_PLAYERS) {
      return MAX_ROOM_PLAYERS;
    }

    return normalized;
  }

  private normalizeRoundsPerPlayer(roundsPerPlayer: number) {
    const normalized = Number(roundsPerPlayer);
    if (!Number.isInteger(normalized) || normalized < 1 || normalized > 5) {
      return DEFAULT_ROUNDS_PER_PLAYER;
    }

    return normalized;
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
