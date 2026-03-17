import '../style.css';
import { Game } from './Game.js';
import { DrawGuessGame } from './DrawGuessGame.js';

const GAME_MODES = {
  excavator: {
    title: '挖掘机大作战',
    description: '驾驶 3D 挖掘机闯过三道关卡，讲究操作、路线和时间分配。',
    features: [
      'WASD 移动底座，Q/E 旋转驾驶室，方向键控制机械臂。',
      '限时闯关，偏离道路或装错颜色都会直接失败。',
      '适合想要一点操作挑战的玩家。',
    ],
    startLabel: '开始挖掘机大作战',
    lockedHint: '登录成功后才可以开始挖掘机大作战。',
    unlockedHint: (nickname) => `已登录为 ${nickname}，点击开始挖掘机大作战。`,
  },
  drawGuess: {
    title: '你画我猜',
    description: '多人联机实时作画猜词，房主先建房，玩家加入准备后即可开始。',
    features: [
      '房主先创建房间进入等待区，其他玩家输入房间码加入。',
      '当前房间里的玩家都准备好后，房主点击开始第一回合，之后由下一位画手点击“我准备好了”进入新回合。',
      '画笔轨迹、清空画布、猜词记录和积分都会实时同步。',
    ],
    startLabel: '开始你画我猜',
    lockedHint: '登录成功后才可以开始你画我猜。',
    unlockedHint: (nickname) => `已登录为 ${nickname}，点击开始你画我猜。`,
  },
};

const getApiBaseUrls = () => {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return [configuredBaseUrl.replace(/\/$/, '')];
  }

  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  const hostname = window.location.hostname || 'localhost';
  const apiPort = import.meta.env.VITE_API_PORT?.trim() || '3000';

  return ['', `${protocol}//${hostname}:${apiPort}`];
};

const API_BASE_URLS = getApiBaseUrls();
const SESSION_STORAGE_KEY = 'excavator.auth';

const requestLogin = async (payload) => {
  let lastError = null;

  for (const apiBaseUrl of API_BASE_URLS) {
    const requestUrl = `${apiBaseUrl}/api/v1/auth/login`;

    try {
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => null);
      if (response.ok) {
        return result;
      }

      const error = new Error(result?.message ?? `登录失败（HTTP ${response.status}）`);
      error.status = response.status;

      if (!apiBaseUrl && [404, 502, 503, 504].includes(response.status)) {
        lastError = error;
        continue;
      }

      throw error;
    } catch (error) {
      lastError = error;
      if (apiBaseUrl) {
        break;
      }
    }
  }

  throw lastError ?? new Error('登录失败，请稍后重试。');
};

window.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const usernameInput = document.getElementById('username-input');
  const passwordInput = document.getElementById('password-input');
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const loginStatus = document.getElementById('login-status');
  const authSummary = document.getElementById('auth-summary');
  const nicknameDisplay = document.getElementById('nickname-display');
  const startBtn = document.getElementById('start-game-btn');
  const startHint = document.getElementById('start-hint');
  const startScreen = document.getElementById('start-screen');
  const modeCards = [...document.querySelectorAll('[data-game-mode]')];
  const modeTitle = document.getElementById('mode-title');
  const modeDescription = document.getElementById('mode-description');
  const modeFeatureList = document.getElementById('mode-feature-list');
  const infoPanel = document.getElementById('info-panel');
  const timerContainer = document.getElementById('timer-container');
  const pauseOverlay = document.getElementById('pause-overlay');
  const messageOverlay = document.getElementById('message-overlay');
  const drawGuessLayer = document.getElementById('draw-guess-layer');
  const backToLobbyBtn = document.getElementById('back-to-lobby-btn');
  const drawGuessBackBtn = document.getElementById('draw-guess-back-btn');

  let activeGame = null;
  let currentSession = null;
  let selectedMode = 'drawGuess';

  const setStatus = (message, tone = 'info') => {
    loginStatus.textContent = message;
    loginStatus.dataset.tone = tone;
  };

  const showExcavatorUi = (visible) => {
    infoPanel.classList.toggle('hidden', !visible);
    timerContainer.classList.toggle('hidden', !visible);

    if (!visible) {
      pauseOverlay.classList.add('hidden');
      messageOverlay.classList.add('hidden');
    }
  };

  const showDrawGuessUi = (visible) => {
    drawGuessLayer.classList.toggle('hidden', !visible);
  };

  const renderModeDetails = () => {
    const mode = GAME_MODES[selectedMode];
    modeCards.forEach((card) => {
      card.classList.toggle('selected', card.dataset.gameMode === selectedMode);
    });

    modeTitle.textContent = mode.title;
    modeDescription.textContent = mode.description;
    modeFeatureList.innerHTML = '';
    mode.features.forEach((feature) => {
      const item = document.createElement('li');
      item.textContent = feature;
      modeFeatureList.appendChild(item);
    });

    if (currentSession) {
      startBtn.disabled = false;
      startBtn.textContent = mode.startLabel;
      startHint.textContent = mode.unlockedHint(currentSession.nickname);
    } else {
      startBtn.disabled = true;
      startBtn.textContent = `登录后开始${mode.title}`;
      startHint.textContent = mode.lockedHint;
    }
  };

  const destroyActiveGame = () => {
    if (activeGame?.destroy) {
      activeGame.destroy();
    }
    activeGame = null;
    document.getElementById('app').innerHTML = '';
  };

  const openLobby = () => {
    destroyActiveGame();
    showExcavatorUi(false);
    showDrawGuessUi(false);
    startScreen.classList.remove('hidden');
    renderModeDetails();
  };

  const launchSelectedGame = () => {
    if (!currentSession) {
      return;
    }

    destroyActiveGame();
    startScreen.classList.add('hidden');

    if (selectedMode === 'excavator') {
      showDrawGuessUi(false);
      showExcavatorUi(true);
      activeGame = new Game();
      activeGame.start();
      return;
    }

    showExcavatorUi(false);
    showDrawGuessUi(true);
    activeGame = new DrawGuessGame(currentSession);
    activeGame.showStartModal();
  };

  const setAuthenticatedState = (session) => {
    currentSession = session;

    if (session) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      loginForm.classList.add('hidden');
      authSummary.classList.remove('hidden');
      nicknameDisplay.textContent = session.nickname;
      setStatus('登录成功，已解锁双游戏大厅。', 'success');
      renderModeDetails();
      return;
    }

    localStorage.removeItem(SESSION_STORAGE_KEY);
    loginForm.classList.remove('hidden');
    authSummary.classList.add('hidden');
    usernameInput.value = 'player';
    passwordInput.value = 'excavator123';
    destroyActiveGame();
    showExcavatorUi(false);
    showDrawGuessUi(false);
    startScreen.classList.remove('hidden');
    setStatus('默认演示账号：player / excavator123', 'info');
    renderModeDetails();
  };

  const restoreSession = () => {
    const rawSession = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!rawSession) {
      setAuthenticatedState(null);
      return;
    }

    try {
      const session = JSON.parse(rawSession);
      if (!session?.token || !session?.nickname) {
        setAuthenticatedState(null);
        return;
      }

      setAuthenticatedState(session);
    } catch (error) {
      console.error('Failed to restore session', error);
      setAuthenticatedState(null);
    }
  };

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = {
      username: usernameInput.value.trim(),
      password: passwordInput.value.trim(),
    };

    if (!payload.username || !payload.password) {
      setStatus('请输入用户名和密码。', 'error');
      return;
    }

    loginBtn.disabled = true;
    setStatus('登录中，请稍候...', 'info');

    try {
      const result = await requestLogin(payload);
      setAuthenticatedState(result.data);
    } catch (error) {
      console.error('Login failed', error);
      setStatus(error.message ?? '登录失败，请稍后重试。', 'error');
    } finally {
      loginBtn.disabled = false;
    }
  });

  logoutBtn.addEventListener('click', () => {
    setAuthenticatedState(null);
  });

  startBtn.addEventListener('click', () => {
    launchSelectedGame();
  });

  modeCards.forEach((card) => {
    card.addEventListener('click', () => {
      selectedMode = card.dataset.gameMode;
      renderModeDetails();
    });
  });

  backToLobbyBtn.addEventListener('click', openLobby);
  drawGuessBackBtn?.addEventListener('click', openLobby);

  window.addEventListener('drawGuess:cancel', () => {
    destroyActiveGame();
    showDrawGuessUi(false);
    startScreen.classList.remove('hidden');
    renderModeDetails();
  });

  restoreSession();
});
