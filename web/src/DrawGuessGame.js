import { io } from 'socket.io-client';

const getSocketUrl = () => {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  return window.location.origin;
};

export class DrawGuessGame {
  constructor(session) {
    this.session = session;
    this.layer = document.getElementById('draw-guess-layer');
    this.shell = this.layer.querySelector('.draw-guess-shell');
    this.canvas = document.getElementById('draw-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.guessForm = document.getElementById('guess-form');
    this.guessInput = document.getElementById('guess-input');
    this.guessLog = document.getElementById('guess-log');
    this.guessCount = document.getElementById('draw-guess-count');
    this.stageText = document.getElementById('draw-stage-text');
    this.roundDisplay = document.getElementById('draw-round-display');
    this.scoreDisplay = document.getElementById('draw-score-display');
    this.timerDisplay = document.getElementById('draw-timer-display');
    this.wordCaption = document.getElementById('draw-word-caption');
    this.secretWord = document.getElementById('draw-secret-word');
    this.hintText = document.getElementById('draw-hint-text');
    this.newRoundBtn = document.getElementById('draw-new-round-btn');
    this.beginBtn = document.getElementById('draw-begin-btn');
    this.undoBtn = document.getElementById('draw-undo-btn');
    this.clearBtn = document.getElementById('draw-clear-btn');
    this.brushBtn = document.getElementById('draw-brush-btn');
    this.eraserBtn = document.getElementById('draw-eraser-btn');
    this.brushSizeInput = document.getElementById('draw-brush-size');
    this.eraserSizeInput = document.getElementById('draw-eraser-size');
    this.brushSizeValue = document.getElementById('draw-brush-size-value');
    this.eraserSizeValue = document.getElementById('draw-eraser-size-value');
    this.currentToolLabel = document.getElementById('draw-current-tool');
    this.currentSizeLabel = document.getElementById('draw-current-size');
    this.currentColorIndicator = document.getElementById('draw-current-color');
    this.colorButtons = [...document.querySelectorAll('[data-brush-color]')];
    this.roomCodeDisplay = document.getElementById('draw-room-code-display');
    this.roomTitle = document.getElementById('draw-room-title');
    this.playerCount = document.getElementById('draw-player-count');
    this.avatarSlots = document.getElementById('draw-room-avatar-slots');
    this.leaveRoomBtn = document.getElementById('draw-leave-room-btn');
    this.readyBtn = document.getElementById('draw-ready-btn');
    this.victoryOverlay = document.getElementById('draw-victory-overlay');
    this.victoryCanvas = document.getElementById('draw-victory-canvas');
    this.victoryTitle = document.getElementById('draw-victory-title');
    this.victorySubtitle = document.getElementById('draw-victory-subtitle');
    this.victoryCtx = this.victoryCanvas?.getContext('2d') ?? null;

    this.modal = document.getElementById('draw-guess-modal');
    this.createForm = document.getElementById('draw-create-form');
    this.joinForm = document.getElementById('draw-join-form');
    this.roomList = document.getElementById('draw-room-list');

    this.socket = null;
    this.roomState = null;
    this.roomCode = null;
    this.playerId = null;
    this.secretWordPayload = null;
    this.brushColor = '#0f172a';
    this.brushSize = Number(this.brushSizeInput?.value ?? 6);
    this.eraserSize = Number(this.eraserSizeInput?.value ?? 18);
    this.isErasing = false;
    this.isDrawing = false;
    this.currentViewMode = null;
    this.modalEventsBound = false;
    this.pendingCreate = false;
    this.pendingJoinCode = null;
    this.activeStrokeId = null;
    this.victoryParticles = [];
    this.victoryAnimationFrame = null;
    this.victoryHideTimer = null;
    this.victoryLastTickAt = 0;
    this.victoryLastBurstAt = 0;
    this.victoryEndAt = 0;
    this.lastVictoryKey = null;

    this.handleResize = () => {
      this.resizeCanvas();
      this.resizeVictoryCanvas();
    };
    this.handleGuessSubmit = (event) => {
      event.preventDefault();
      this.submitGuess();
    };
    this.handleCanvasPointerDown = (event) => this.startStroke(event);
    this.handleCanvasPointerMove = (event) => this.moveStroke(event);
    this.handleCanvasPointerUp = () => this.endStroke();
    this.handleNewRound = () => {
      if (this.roomState?.isGameOver) {
        this.emit('drawGuess:matchReset');
        return;
      }
      if (this.roomState?.phase === 'waiting' && this.roomState?.round === 0) {
        this.emit('drawGuess:roundStart');
      }
    };
    this.handleBeginRound = () => this.emit('drawGuess:roundBegin');
    this.handleUndoCanvas = () => this.emit('drawGuess:canvasUndo');
    this.handleClearCanvas = () => this.emit('drawGuess:canvasClear');
    this.handleBrushSizeChange = (event) => {
      this.brushSize = Number(event.target.value);
      this.syncToolUi();
    };
    this.handleEraserSizeChange = (event) => {
      this.eraserSize = Number(event.target.value);
      this.syncToolUi();
    };
    this.handleBrushMode = () => this.setEraserMode(false);
    this.handleEraserMode = () => this.setEraserMode(true);
    this.handleLeaveRoom = () => this.leaveRoom();
    this.handleReadyToggle = () => this.emit('drawGuess:playerReadyToggle');
    this.handleCopyRoomCode = () => this.copyRoomCode();
    this.colorButtonHandlers = new Map();

    this.syncToolUi();
  }

  showStartModal() {
    this.layer.classList.remove('hidden');
    this.modal.classList.remove('hidden');
    this.createForm.classList.add('hidden');
    this.joinForm.classList.add('hidden');
    this.pendingCreate = false;
    this.pendingJoinCode = null;
    this.bindModalEvents();
    this.setModalConnectionState(Boolean(this.socket?.connected));
    this.connectSocket();
  }

  bindModalEvents() {
    if (this.modalEventsBound) return;
    this.modalEventsBound = true;

    const closeModal = () => {
      this.modal.classList.add('hidden');
      this.createForm.classList.add('hidden');
      this.joinForm.classList.add('hidden');
    };

    document.getElementById('draw-modal-close-btn')?.addEventListener('click', () => {
      closeModal();
      this.layer.classList.add('hidden');
      window.dispatchEvent(new CustomEvent('drawGuess:cancel'));
    });

    document.getElementById('draw-modal-create-btn')?.addEventListener('click', () => {
      this.modal.classList.add('hidden');
      this.createForm.classList.remove('hidden');
    });

    document.getElementById('draw-modal-join-btn')?.addEventListener('click', () => {
      this.modal.classList.add('hidden');
      this.joinForm.classList.remove('hidden');
      const codeInput = document.getElementById('draw-join-code-input');
      if (codeInput) codeInput.value = '';
      this.fetchRoomList();
    });

    document.getElementById('draw-create-back-btn')?.addEventListener('click', () => {
      this.createForm.classList.add('hidden');
      this.modal.classList.remove('hidden');
    });

    document.getElementById('draw-create-submit-btn')?.addEventListener('click', () => {
      this.doCreateRoom();
    });

    document.getElementById('draw-join-back-btn')?.addEventListener('click', () => {
      this.joinForm.classList.add('hidden');
      this.modal.classList.remove('hidden');
    });

    document.getElementById('draw-join-refresh-btn')?.addEventListener('click', () => {
      this.fetchRoomList();
    });

    const joinCodeInput = document.getElementById('draw-join-code-input');
    const joinByCodeBtn = document.getElementById('draw-join-by-code-btn');
    joinByCodeBtn?.addEventListener('click', () => {
      const code = joinCodeInput?.value?.trim().toUpperCase();
      if (code && code.length >= 4) this.doJoinRoom(code);
    });
    joinCodeInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') joinByCodeBtn?.click();
    });
  }

  fetchRoomList() {
    if (!this.roomList) return;
    if (!this.socket?.connected) {
      this.roomList.innerHTML = '';
      const loading = document.createElement('p');
      loading.className = 'draw-room-empty';
      loading.textContent = '连接中，请稍候…';
      loading.style.cssText = 'color:#94a3b8;padding:20px;text-align:center;';
      this.roomList.appendChild(loading);
      this.socket?.once('connect', () => this.fetchRoomList());
      return;
    }
    this.showRoomListLoading();
    let resolved = false;
    const done = (list) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      this.renderRoomList(Array.isArray(list) ? list : []);
    };
    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      const fail = document.createElement('p');
      fail.className = 'draw-room-empty';
      fail.innerHTML = '获取超时，请<a href="#" id="draw-room-retry">点击重试</a>';
      fail.style.cssText = 'color:#94a3b8;padding:20px;text-align:center;';
      this.roomList.innerHTML = '';
      this.roomList.appendChild(fail);
      fail.querySelector('#draw-room-retry')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.fetchRoomList();
      });
    }, 5000);
    this.socket.once('drawGuess:roomList', (list) => done(list));
    this.socket.emit('drawGuess:roomListRequest');
  }

  showRoomListLoading() {
    if (!this.roomList) return;
    this.roomList.innerHTML = '';
    const loading = document.createElement('p');
    loading.className = 'draw-room-empty';
    loading.textContent = '加载中…';
    loading.style.cssText = 'color:#94a3b8;padding:20px;text-align:center;';
    this.roomList.appendChild(loading);
  }

  doCreateRoom() {
    if (!this.socket?.connected) {
      this.pendingCreate = true;
      this.setModalConnectionState(false);
      this.socket?.connect();
      return;
    }
    const maxPlayers = Number(document.getElementById('draw-max-players-select')?.value ?? 6);
    this.createForm.classList.add('hidden');
    this.enterRoomView();
    this.emit('drawGuess:roomCreate', { playerName: '', maxPlayers });
  }

  doJoinRoom(roomCode) {
    if (!this.socket?.connected) {
      this.pendingJoinCode = roomCode;
      this.setModalConnectionState(false);
      this.socket?.connect();
      return;
    }
    this.joinForm.classList.add('hidden');
    this.enterRoomView();
    this.emit('drawGuess:roomJoin', { roomCode, playerName: '' });
  }

  enterRoomView() {
    this.bindDomEvents();
    this.resizeCanvas();
    this.clearCanvas();
    this.resetRoomState();
  }

  bindDomEvents() {
    window.addEventListener('resize', this.handleResize);
    this.guessForm.addEventListener('submit', this.handleGuessSubmit);
    this.canvas.addEventListener('pointerdown', this.handleCanvasPointerDown);
    this.canvas.addEventListener('pointermove', this.handleCanvasPointerMove);
    this.canvas.addEventListener('pointerup', this.handleCanvasPointerUp);
    this.canvas.addEventListener('pointerleave', this.handleCanvasPointerUp);
    this.canvas.addEventListener('pointercancel', this.handleCanvasPointerUp);
    this.newRoundBtn?.addEventListener('click', this.handleNewRound);
    this.beginBtn?.addEventListener('click', this.handleBeginRound);
    this.undoBtn?.addEventListener('click', this.handleUndoCanvas);
    this.clearBtn?.addEventListener('click', this.handleClearCanvas);
    this.brushBtn?.addEventListener('click', this.handleBrushMode);
    this.eraserBtn?.addEventListener('click', this.handleEraserMode);
    this.brushSizeInput?.addEventListener('input', this.handleBrushSizeChange);
    this.eraserSizeInput?.addEventListener('input', this.handleEraserSizeChange);
    this.leaveRoomBtn?.addEventListener('click', this.handleLeaveRoom);
    this.readyBtn?.addEventListener('click', this.handleReadyToggle);
    this.roomCodeDisplay?.addEventListener('click', this.handleCopyRoomCode);

    this.colorButtons.forEach((button) => {
      const handler = () => this.setBrushColor(button.dataset.brushColor);
      this.colorButtonHandlers.set(button, handler);
      button.addEventListener('click', handler);
    });
  }

  connectSocket() {
    if (this.socket) {
      if (this.socket.connected) {
        this.setModalConnectionState(true);
      } else {
        this.setModalConnectionState(false);
        this.socket.connect();
      }
      return;
    }

    this.socket = io(getSocketUrl(), {
      autoConnect: false,
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      this.setModalConnectionState(true);
      if (this.stageText) this.stageText.textContent = '已连接实时服务，创建或加入房间后即可开始。';
      if (this.joinForm && !this.joinForm.classList.contains('hidden')) {
        this.fetchRoomList();
      }
      if (this.pendingCreate) {
        this.pendingCreate = false;
        this.doCreateRoom();
      }
      if (this.pendingJoinCode) {
        const code = this.pendingJoinCode;
        this.pendingJoinCode = null;
        this.doJoinRoom(code);
      }
    });

    this.socket.on('disconnect', () => {
      this.setModalConnectionState(false);
      if (this.stageText) this.stageText.textContent = '实时连接已断开，请稍候重试。';
    });

    this.socket.on('connect_error', () => {
      this.setModalConnectionState(false);
    });

    this.socket.on('drawGuess:ready', () => {
      if (this.stageText) this.stageText.textContent = '实时服务已就绪，创建或加入房间后即可开始。';
    });

    this.socket.on('drawGuess:roomList', (list) => {
      this.renderRoomList(Array.isArray(list) ? list : []);
    });

    this.socket.on('drawGuess:joined', (payload) => {
      this.playerId = payload.playerId;
      this.roomCode = payload.roomCode;
      this.secretWordPayload = null;
      this.clearCanvas();
      this.replayCanvasEvents(payload.canvasEvents ?? []);
      this.applyRoomState(payload.state);
    });

    this.socket.on('drawGuess:roomUpdate', (state) => {
      this.applyRoomState(state);
    });

    this.socket.on('drawGuess:secretWord', (payload) => {
      this.secretWordPayload = payload;
      this.renderRoomState();
    });

    this.socket.on('drawGuess:canvasStroke', (stroke) => {
      this.drawStroke(stroke);
    });

    this.socket.on('drawGuess:canvasClear', () => {
      this.clearCanvas();
    });

    this.socket.on('drawGuess:canvasSync', (payload) => {
      this.clearCanvas();
      this.replayCanvasEvents(payload?.canvasEvents ?? []);
    });

    this.socket.on('drawGuess:error', (payload) => {
      this.hintText.textContent = payload?.message ?? '操作失败，请稍后重试。';
    });

    this.socket.connect();
  }

  setModalConnectionState(connected) {
    const createSubmitBtn = document.getElementById('draw-create-submit-btn');
    const joinByCodeBtn = document.getElementById('draw-join-by-code-btn');
    const joinRefreshBtn = document.getElementById('draw-join-refresh-btn');

    [createSubmitBtn, joinByCodeBtn, joinRefreshBtn].forEach((button) => {
      if (button) button.disabled = !connected;
    });

    if (createSubmitBtn) {
      createSubmitBtn.textContent = connected ? '创建并进入房间' : '连接中...';
    }
  }

  renderRoomList(list) {
    if (!this.roomList) return;
    this.roomList.innerHTML = '';
    if (!list?.length) {
      const empty = document.createElement('p');
      empty.className = 'draw-room-empty';
      empty.innerHTML =
        '暂无可用房间，请创建新房间。<br><small style="opacity:0.8">提示：用两个标签页分别创建和加入测试，同页离开后房间会被删除。</small>';
      empty.style.cssText = 'color:#94a3b8;padding:20px;text-align:center;font-size:14px;';
      this.roomList.appendChild(empty);
      return;
    }
    list.forEach((room) => {
      const item = document.createElement('div');
      item.className = 'draw-room-item';
      item.innerHTML = `
        <div>
          <strong class="room-code">${room.roomCode}</strong>
          <span>${room.hostName} · ${room.playerCount}/${room.maxPlayers} 人</span>
        </div>
        <button type="button" class="secondary-btn">加入</button>
      `;
      const joinBtn = item.querySelector('button');
      joinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.doJoinRoom(room.roomCode);
      });
      item.addEventListener('click', (e) => {
        if (!e.target.closest('button')) this.doJoinRoom(room.roomCode);
      });
      this.roomList.appendChild(item);
    });
  }

  resetRoomState() {
    this.setViewMode('room');
    this.roomState = null;
    this.roomCode = null;
    this.playerId = null;
    this.secretWordPayload = null;
    if (this.roomCodeDisplay) {
      this.roomCodeDisplay.textContent = '—';
      this.roomCodeDisplay.classList.remove('draw-room-code-copy');
      this.roomCodeDisplay.removeAttribute('title');
    }
    if (this.roomTitle) this.roomTitle.textContent = '房间 未加入';
    if (this.playerCount) this.playerCount.textContent = '0 人';
    if (this.avatarSlots) this.avatarSlots.innerHTML = '';
    this.setGuessEnabled(false);
    if (this.newRoundBtn) {
      this.newRoundBtn.disabled = true;
      this.newRoundBtn.textContent = '开始游戏';
    }
    if (this.beginBtn) this.beginBtn.classList.add('hidden');
    if (this.readyBtn) this.readyBtn.classList.remove('hidden');
    if (this.leaveRoomBtn) this.leaveRoomBtn.classList.add('hidden');
    if (this.stageText) this.stageText.textContent = '先创建或加入房间，再等待房主开始游戏。';
    if (this.wordCaption) this.wordCaption.textContent = '游戏开始后会按顺序轮流作画。';
    if (this.secretWord) this.secretWord.textContent = '准备好就开画';
    if (this.hintText) this.hintText.textContent = '系统会根据猜错次数逐步放提示。';
    if (this.roundDisplay) this.roundDisplay.textContent = '0';
    if (this.scoreDisplay) this.scoreDisplay.textContent = '0';
    if (this.timerDisplay) this.timerDisplay.textContent = '75';
    if (this.guessCount) this.guessCount.textContent = '0 次尝试';
    if (this.guessLog) this.guessLog.innerHTML = '';
    if (this.undoBtn) this.undoBtn.disabled = true;
    this.hideVictoryEffect(true);
    this.setEraserMode(false);
  }

  applyRoomState(state) {
    this.roomState = state;
    this.roomCode = state?.roomCode ?? this.roomCode;
    if (!state?.isGameOver) {
      this.hideVictoryEffect(true);
    }
    if (state?.phase === 'finished') {
      this.secretWordPayload = null;
    }
    this.renderRoomState();
  }

  renderRoomState() {
    if (!this.roomState) {
      this.resetRoomState();
      return;
    }

    this.setViewMode(this.shouldShowBattleView() ? 'battle' : 'room');

    const selfPlayer = this.getSelfPlayer();
    const isHost = selfPlayer?.isHost ?? false;
    const isDrawer = selfPlayer?.isDrawer ?? false;
    const canGuess = this.roomState.phase === 'drawing' && !isDrawer;
    const canDraw = this.roomState.phase === 'drawing' && isDrawer;
    const isInitialWaiting = this.roomState.phase === 'waiting' && this.roomState.round === 0;
    const isGameOver = Boolean(this.roomState.isGameOver);
    const canStartRound = isHost
      && !isGameOver
      && this.roomState.phase === 'waiting'
      && this.roomState.round === 0
      && this.roomState.players.length >= 2
      && this.roomState.allPlayersReady;
    const canResetMatch = isHost && isGameOver;

    if (this.roomCodeDisplay) {
      this.roomCodeDisplay.textContent = this.roomState.roomCode;
      this.roomCodeDisplay.classList.add('draw-room-code-copy');
      this.roomCodeDisplay.setAttribute('title', '点击复制');
    }
    if (this.roomTitle) this.roomTitle.textContent = `房间 ${this.roomState.roomCode}`;
    if (this.playerCount) this.playerCount.textContent = `${this.roomState.players.length}/${this.roomState.maxPlayers} 人`;
    if (this.roundDisplay) this.roundDisplay.textContent = String(this.roomState.round);
    this.scoreDisplay.textContent = String(selfPlayer?.score ?? 0);
    this.timerDisplay.textContent = String(this.roomState.timeLeft);
    this.guessCount.textContent = `${this.roomState.guessAttempts} 次尝试`;
    this.leaveRoomBtn.classList.remove('hidden');
    // 准备 与 开始游戏 互斥：房主未准备时显示准备，准备后显示开始游戏；非房主只显示准备
    // 开始游戏 需至少 2 人且全员准备后才可用
    if (this.readyBtn && this.newRoundBtn) {
      if (isInitialWaiting) {
        if (isHost) {
          if (!selfPlayer?.isReady) {
            this.readyBtn.classList.remove('hidden');
            this.newRoundBtn.classList.add('hidden');
          } else {
            this.readyBtn.classList.add('hidden');
            this.newRoundBtn.classList.remove('hidden');
            this.newRoundBtn.disabled = !canStartRound;
            this.newRoundBtn.textContent = '开始游戏';
          }
        } else {
          this.readyBtn.classList.remove('hidden');
          this.newRoundBtn.classList.add('hidden');
        }
        this.readyBtn.disabled = !selfPlayer;
        this.readyBtn.textContent = selfPlayer?.isReady ? '取消准备' : '准备';
      } else {
        this.readyBtn.classList.add('hidden');
        if (isGameOver) {
          this.newRoundBtn.classList.remove('hidden');
          this.newRoundBtn.disabled = !canResetMatch;
          this.newRoundBtn.textContent = canResetMatch ? '再来一局' : '等待房主重置';
        } else {
          this.newRoundBtn.classList.add('hidden');
        }
      }
    }
    this.beginBtn.classList.toggle('hidden', !(isDrawer && this.roomState.phase === 'memorize' && this.secretWordPayload));
    const canUndo = canDraw;
    if (this.undoBtn) this.undoBtn.disabled = !canUndo;
    this.clearBtn.disabled = !canDraw;
    this.brushBtn.disabled = !canDraw;
    this.eraserBtn.disabled = !canDraw;
    this.colorButtons.forEach((button) => {
      button.disabled = !canDraw;
    });
    this.brushSizeInput.disabled = !canDraw;
    this.eraserSizeInput.disabled = !canDraw;
    this.setGuessEnabled(canGuess);
    this.syncToolUi();

    if (this.avatarSlots) {
      this.avatarSlots.innerHTML = '';
      const maxSlots = this.roomState.maxPlayers;
      for (let i = 0; i < maxSlots; i++) {
        const player = this.roomState.players[i];
        const slot = document.createElement('div');
        slot.className = 'draw-avatar-slot' + (player ? ' filled' : '');
        const roleText = [];
        if (player?.isHost) roleText.push('房主');
        if (player?.isDrawer) roleText.push('画手');
        if (player?.isReady) roleText.push('已准备');
        else if (player) roleText.push('未准备');
        slot.innerHTML = `
          <div class="avatar-placeholder">${player ? player.name.slice(0, 1) : '?'}</div>
          <span class="avatar-name">${player?.name ?? `玩家${i + 1}`}</span>
          <span class="avatar-status">${roleText.join(' · ') || '空位'}</span>
        `;
        this.avatarSlots.appendChild(slot);
      }
    }

    this.renderLogs(this.roomState.logs);

    if (this.roomState.phase === 'waiting') {
      if (this.roomState.round === 0) {
        if (this.roomState.players.length < 2) {
          this.stageText.textContent = selfPlayer?.isReady
            ? '你已准备，等待其他玩家加入房间。'
            : '先点击准备，再等待其他玩家加入。';
          this.wordCaption.textContent = '房主建房成功';
          this.secretWord.textContent = '等待玩家加入';
          this.hintText.textContent = '至少需要 2 名玩家，其他玩家可以通过房间码加入。';
        } else if (!this.roomState.allPlayersReady) {
          this.stageText.textContent = selfPlayer?.isReady
            ? '你已准备，等待当前房间里的其他玩家准备。'
            : '先点击准备，等房主开始。';
          this.wordCaption.textContent = '等待房间内玩家准备';
          this.secretWord.textContent = '等待全员准备';
          this.hintText.textContent = '当前房间里的玩家全部准备完成后，房主就可以开始对战。';
        } else {
          this.stageText.textContent = isHost
            ? '当前房间里的玩家都已准备完成，你可以开始游戏。'
            : '所有人都已准备，等待房主开始游戏。';
          this.wordCaption.textContent = '准备完成';
          this.secretWord.textContent = '等待房主开始';
          this.hintText.textContent = '开始后会按进入房间的顺序轮流担任画手。';
        }
      } else {
        this.stageText.textContent = this.roomState.players.length < 2
          ? '当前人数不足 2 人，对战已暂停。'
          : '等待当前画手准备开始。';
        this.wordCaption.textContent = '等待继续';
        this.secretWord.textContent = this.roomState.players.length < 2 ? '等待玩家恢复人数' : '等待画手准备';
        this.hintText.textContent = '下一位画手点击“我准备好了”后就会开始作画。';
      }
      return;
    }

    if (this.roomState.phase === 'memorize') {
      this.stageText.textContent = isDrawer
        ? '你是本轮画手，准备好后点击“我准备好了”。'
        : `本轮画手是 ${this.roomState.drawerPlayerName}，等待 TA 准备作画。`;
      this.wordCaption.textContent = this.roomState.category
        ? `题材：${this.roomState.category}`
        : '本轮词语已生成';
      this.secretWord.textContent = isDrawer && this.secretWordPayload
        ? this.secretWordPayload.word
        : '画手记词中';
      this.hintText.textContent = isDrawer && this.secretWordPayload
        ? `请记住“${this.secretWordPayload.word}”，然后点击“我准备好了”。`
        : '等待画手记词后正式开始。';
      return;
    }

    if (this.roomState.phase === 'drawing') {
      this.stageText.textContent = isDrawer
        ? '你正在作画，其他玩家正在实时猜词。'
        : `${this.roomState.drawerPlayerName} 正在作画，快来猜词。`;
      this.wordCaption.textContent = this.roomState.category
        ? `题材：${this.roomState.category}`
        : '作画中';
      this.secretWord.textContent = isDrawer && this.secretWordPayload
        ? this.secretWordPayload.word
        : '● ● ●';
      this.hintText.textContent = this.roomState.hintText;
      return;
    }

    if (isGameOver) {
      const winners = this.roomState.players.filter((player) => this.roomState.winnerPlayerIds?.includes(player.id));
      const winnerNames = winners.map((winner) => winner.name).join('、') || '平局';
      const winnerScore = winners[0]?.score ?? 0;
      this.showVictoryEffect(winnerNames, winnerScore, this.roomState.round);
      this.stageText.textContent = `本局已结束（共 ${this.roomState.maxRounds ?? 6} 回合）。`;
      this.wordCaption.textContent = '最终冠军';
      this.secretWord.textContent = `${winnerNames} · ${winnerScore} 分`;
      this.hintText.textContent = isHost
        ? '点击“再来一局”可重置对战并重新准备。'
        : '等待房主重置后开始下一局。';
      return;
    }

    this.stageText.textContent = '本轮已结束，正在切换下一位画手。';
    this.wordCaption.textContent = '正确答案';
    this.secretWord.textContent = this.roomState.revealedAnswer ?? '答案已揭晓';
    this.hintText.textContent = '下一位画手点击“我准备好了”后开始下一回合。';
  }

  renderLogs(logs) {
    this.guessLog.innerHTML = '';
    [...logs].reverse().forEach((entry) => {
      const item = document.createElement('div');
      item.className = `guess-item guess-item-${entry.type}`;
      item.textContent = entry.text;
      this.guessLog.appendChild(item);
    });
  }

  showVictoryEffect(winnerNames, winnerScore, round) {
    if (!this.victoryOverlay || !this.victoryCanvas || !this.victoryCtx) {
      return;
    }

    const key = `${this.roomState?.roomCode ?? ''}|${round}|${winnerNames}|${winnerScore}`;
    if (this.lastVictoryKey === key) {
      return;
    }
    this.lastVictoryKey = key;

    this.victoryTitle.textContent = `${winnerNames} 获胜！`;
    this.victorySubtitle.textContent = `最终得分 ${winnerScore} 分`;
    this.victoryOverlay.classList.remove('hidden');
    this.victoryOverlay.classList.remove('is-active');
    // Force reflow so re-open animation can replay.
    void this.victoryOverlay.offsetWidth;
    this.victoryOverlay.classList.add('is-active');

    this.resizeVictoryCanvas();
    this.startVictoryFireworks();

    if (this.victoryHideTimer) {
      clearTimeout(this.victoryHideTimer);
    }
    this.victoryHideTimer = setTimeout(() => {
      this.victoryOverlay?.classList.remove('is-active');
      this.stopVictoryFireworks();
    }, 4200);
  }

  hideVictoryEffect(resetKey = false) {
    if (this.victoryHideTimer) {
      clearTimeout(this.victoryHideTimer);
      this.victoryHideTimer = null;
    }
    this.stopVictoryFireworks();
    this.victoryOverlay?.classList.remove('is-active');
    this.victoryOverlay?.classList.add('hidden');
    if (resetKey) {
      this.lastVictoryKey = null;
    }
  }

  resizeVictoryCanvas() {
    if (!this.victoryCanvas || !this.victoryOverlay || this.victoryOverlay.classList.contains('hidden')) {
      return;
    }
    const rect = this.victoryOverlay.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    if (this.victoryCanvas.width !== width || this.victoryCanvas.height !== height) {
      this.victoryCanvas.width = width;
      this.victoryCanvas.height = height;
    }
  }

  startVictoryFireworks() {
    if (!this.victoryCtx || !this.victoryCanvas) {
      return;
    }
    this.stopVictoryFireworks();
    this.victoryParticles = [];
    this.victoryLastTickAt = 0;
    this.victoryLastBurstAt = 0;
    this.victoryEndAt = performance.now() + 4200;

    const tick = (now) => {
      if (!this.victoryCtx || !this.victoryCanvas) {
        return;
      }
      const elapsed = this.victoryLastTickAt ? (now - this.victoryLastTickAt) / 1000 : 0.016;
      this.victoryLastTickAt = now;
      const delta = Math.min(0.033, Math.max(0.008, elapsed));
      const ctx = this.victoryCtx;
      const width = this.victoryCanvas.width;
      const height = this.victoryCanvas.height;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
      ctx.fillRect(0, 0, width, height);

      if (now < this.victoryEndAt && (now - this.victoryLastBurstAt >= 340 || this.victoryParticles.length < 12)) {
        this.spawnFireworkBurst();
        this.victoryLastBurstAt = now;
      }

      const nextParticles = [];
      this.victoryParticles.forEach((particle) => {
        particle.vy += 220 * delta;
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        particle.life -= delta;
        if (particle.life <= 0) {
          return;
        }
        nextParticles.push(particle);
        const alpha = Math.max(0, particle.life / particle.maxLife);
        ctx.fillStyle = `rgba(${particle.color.r}, ${particle.color.g}, ${particle.color.b}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fill();
      });
      this.victoryParticles = nextParticles;

      if (now < this.victoryEndAt || this.victoryParticles.length > 0) {
        this.victoryAnimationFrame = requestAnimationFrame(tick);
      } else {
        this.victoryAnimationFrame = null;
      }
    };

    this.victoryAnimationFrame = requestAnimationFrame(tick);
  }

  stopVictoryFireworks() {
    if (this.victoryAnimationFrame) {
      cancelAnimationFrame(this.victoryAnimationFrame);
      this.victoryAnimationFrame = null;
    }
    if (this.victoryCtx && this.victoryCanvas) {
      this.victoryCtx.clearRect(0, 0, this.victoryCanvas.width, this.victoryCanvas.height);
    }
    this.victoryParticles = [];
  }

  spawnFireworkBurst() {
    if (!this.victoryCanvas) {
      return;
    }
    const width = this.victoryCanvas.width;
    const height = this.victoryCanvas.height;
    const centerX = width * (0.2 + Math.random() * 0.6);
    const centerY = height * (0.14 + Math.random() * 0.35);
    const colors = [
      { r: 251, g: 191, b: 36 },
      { r: 56, g: 189, b: 248 },
      { r: 244, g: 114, b: 182 },
      { r: 74, g: 222, b: 128 },
      { r: 248, g: 113, b: 113 },
      { r: 167, g: 139, b: 250 },
    ];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const count = 42 + Math.floor(Math.random() * 22);

    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.25;
      const speed = 80 + Math.random() * 260;
      this.victoryParticles.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 25,
        life: 0.9 + Math.random() * 0.8,
        maxLife: 1.4 + Math.random() * 0.8,
        radius: 1.8 + Math.random() * 2.4,
        color,
      });
    }
  }

  leaveRoom() {
    this.emit('drawGuess:roomLeave');
    this.clearCanvas();
    this.resetRoomState();
    this.modal.classList.remove('hidden');
    this.createForm.classList.add('hidden');
    this.joinForm.classList.add('hidden');
    this.setModalConnectionState(Boolean(this.socket?.connected));
    if (!this.socket?.connected) {
      this.socket?.connect();
    }
  }

  copyRoomCode() {
    const code = this.roomCodeDisplay?.textContent?.trim();
    if (!code || code === '—') return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(() => {
        const el = this.roomCodeDisplay;
        if (!el) return;
        el.textContent = '已复制';
        el.classList.add('draw-room-code-copied');
        setTimeout(() => {
          if (el) {
            el.textContent = this.roomState?.roomCode ?? this.roomCode ?? code;
            el.classList.remove('draw-room-code-copied');
          }
        }, 1200);
      });
    }
  }

  emit(eventName, payload = undefined) {
    if (!this.socket) {
      return;
    }

    this.socket.emit(eventName, payload);
  }

  setGuessEnabled(enabled) {
    this.guessInput.disabled = !enabled;
    if (!enabled) {
      this.guessInput.value = '';
    }
  }

  submitGuess() {
    const guess = this.guessInput.value.trim();
    if (!guess) {
      return;
    }

    this.emit('drawGuess:guessSubmit', { guess });
    this.guessInput.value = '';
  }

  replayCanvasEvents(events) {
    events.forEach((event) => {
      if (event.type === 'clear') {
        this.clearCanvas();
        return;
      }

      this.drawStroke(event.stroke);
    });
  }

  resizeCanvas() {
    const snapshot = this.canvas.width ? this.canvas.toDataURL() : null;
    const { width, height } = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(320, Math.floor(width));
    this.canvas.height = Math.max(240, Math.floor(height));
    this.ctx.fillStyle = '#fffef8';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (snapshot) {
      const image = new Image();
      image.onload = () => {
        this.ctx.drawImage(image, 0, 0, this.canvas.width, this.canvas.height);
      };
      image.src = snapshot;
    }
  }

  ensureCanvasResolution() {
    if (!this.canvas || this.shell.classList.contains('is-room-view')) {
      return;
    }
    const { width, height } = this.canvas.getBoundingClientRect();
    const targetWidth = Math.max(320, Math.floor(width));
    const targetHeight = Math.max(240, Math.floor(height));
    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.resizeCanvas();
    }
  }

  clearCanvas() {
    this.ctx.fillStyle = '#fffef8';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  setBrushColor(color) {
    if (!color) {
      return;
    }
    this.isErasing = false;
    this.brushColor = color;
    this.colorButtons.forEach((button) => {
      button.classList.toggle('selected', button.dataset.brushColor === color);
    });
    this.syncToolUi();
  }

  setEraserMode(enabled) {
    this.isErasing = enabled;
    this.syncToolUi();
  }

  syncToolUi() {
    if (this.brushSizeValue) this.brushSizeValue.textContent = `${this.brushSize}px`;
    if (this.eraserSizeValue) this.eraserSizeValue.textContent = `${this.eraserSize}px`;
    if (this.currentToolLabel) this.currentToolLabel.textContent = this.isErasing ? '橡皮' : '画笔';
    if (this.currentSizeLabel) {
      const currentSize = this.isErasing ? this.eraserSize : this.brushSize;
      this.currentSizeLabel.textContent = `${currentSize}px`;
    }
    if (this.currentColorIndicator) {
      this.currentColorIndicator.style.backgroundColor = this.brushColor;
      this.currentColorIndicator.setAttribute('title', `当前画笔颜色：${this.brushColor}`);
    }
    this.brushBtn?.classList.toggle('selected', !this.isErasing);
    this.eraserBtn?.classList.toggle('selected', this.isErasing);
    this.canvas?.classList.toggle('cursor-brush', !this.isErasing);
    this.canvas?.classList.toggle('cursor-eraser', this.isErasing);
  }

  getCanvasPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  startStroke(event) {
    if (!this.canDraw()) {
      return;
    }
    this.ensureCanvasResolution();

    event.preventDefault();
    this.isDrawing = true;
    this.activeStrokeId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.lastPoint = this.getCanvasPoint(event);
    this.canvas.setPointerCapture(event.pointerId);
  }

  moveStroke(event) {
    if (!this.isDrawing || !this.canDraw()) {
      return;
    }
    this.ensureCanvasResolution();

    const currentPoint = this.getCanvasPoint(event);
    const stroke = {
      from: this.normalizePoint(this.lastPoint),
      to: this.normalizePoint(currentPoint),
      color: this.brushColor,
      size: this.isErasing ? this.eraserSize : this.brushSize,
      isErasing: this.isErasing,
      strokeId: this.activeStrokeId,
    };

    this.drawStroke(stroke);
    this.emit('drawGuess:canvasStroke', stroke);
    this.lastPoint = currentPoint;
  }

  endStroke() {
    this.isDrawing = false;
    this.activeStrokeId = null;
  }

  canDraw() {
    const selfPlayer = this.getSelfPlayer();
    return Boolean(selfPlayer?.isDrawer && this.roomState?.phase === 'drawing');
  }

  getSelfPlayer() {
    return this.roomState?.players.find((player) => player.id === this.playerId) ?? null;
  }

  shouldShowBattleView() {
    if (!this.roomState) {
      return false;
    }

    return this.roomState.round > 0 && this.roomState.phase !== 'waiting';
  }

  setViewMode(mode) {
    const changed = this.currentViewMode !== mode;
    this.currentViewMode = mode;
    this.shell.classList.toggle('is-room-view', mode === 'room');
    this.shell.classList.toggle('is-battle-view', mode === 'battle');
    const gameHeader = document.getElementById('draw-game-header');
    const wordCard = document.getElementById('draw-word-card');
    const toolsCard = document.getElementById('draw-tools-card');
    const showGame = mode === 'battle';
    if (gameHeader) gameHeader.classList.toggle('hidden', !showGame);
    if (wordCard) wordCard.classList.toggle('hidden', !showGame);
    if (toolsCard) toolsCard.classList.toggle('hidden', !showGame);
    if (mode === 'battle' && changed) {
      requestAnimationFrame(() => this.resizeCanvas());
    }
  }

  drawStroke(stroke) {
    const from = this.denormalizePoint(stroke.from);
    const to = this.denormalizePoint(stroke.to);
    this.ctx.save();
    this.ctx.globalCompositeOperation = stroke.isErasing ? 'destination-out' : 'source-over';
    this.ctx.strokeStyle = stroke.isErasing ? 'rgba(0, 0, 0, 1)' : (stroke.color || this.brushColor || '#0f172a');
    this.ctx.lineWidth = Number(stroke.size) || (stroke.isErasing ? this.eraserSize : this.brushSize);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.beginPath();
    this.ctx.moveTo(from.x, from.y);
    this.ctx.lineTo(to.x, to.y);
    this.ctx.stroke();
    this.ctx.restore();
  }

  normalizePoint(point) {
    return {
      x: this.canvas.width ? point.x / this.canvas.width : 0,
      y: this.canvas.height ? point.y / this.canvas.height : 0,
    };
  }

  denormalizePoint(point) {
    return {
      x: point.x * this.canvas.width,
      y: point.y * this.canvas.height,
    };
  }

  destroy() {
    window.removeEventListener('resize', this.handleResize);
    this.guessForm?.removeEventListener('submit', this.handleGuessSubmit);
    this.canvas?.removeEventListener('pointerdown', this.handleCanvasPointerDown);
    this.canvas?.removeEventListener('pointermove', this.handleCanvasPointerMove);
    this.canvas?.removeEventListener('pointerup', this.handleCanvasPointerUp);
    this.canvas?.removeEventListener('pointerleave', this.handleCanvasPointerUp);
    this.canvas?.removeEventListener('pointercancel', this.handleCanvasPointerUp);
    this.newRoundBtn?.removeEventListener('click', this.handleNewRound);
    this.beginBtn?.removeEventListener('click', this.handleBeginRound);
    this.undoBtn?.removeEventListener('click', this.handleUndoCanvas);
    this.clearBtn?.removeEventListener('click', this.handleClearCanvas);
    this.brushBtn?.removeEventListener('click', this.handleBrushMode);
    this.eraserBtn?.removeEventListener('click', this.handleEraserMode);
    this.brushSizeInput?.removeEventListener('input', this.handleBrushSizeChange);
    this.eraserSizeInput?.removeEventListener('input', this.handleEraserSizeChange);
    this.leaveRoomBtn?.removeEventListener('click', this.handleLeaveRoom);
    this.readyBtn?.removeEventListener('click', this.handleReadyToggle);

    this.colorButtons.forEach((button) => {
      const handler = this.colorButtonHandlers.get(button);
      if (handler) {
        button.removeEventListener('click', handler);
      }
    });

    this.hideVictoryEffect(true);

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.layer.classList.add('hidden');
  }
}
