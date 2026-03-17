import * as THREE from 'three';
import { Excavator } from './Excavator.js';
import { SoilSystem } from './SoilSystem.js';
import { RoadSystem } from './RoadSystem.js';
import { LevelManager } from './LevelManager.js';
import { SoundManager } from './SoundManager.js';

export class Game {
  constructor() {
    this.container = document.getElementById('app');
    this.soundManager = new SoundManager();
    this.isDestroyed = false;

    // Scene Setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB); // 晴朗白天天空蓝
    this.scene.fog = new THREE.FogExp2(0x87CEEB, 0.002); // 匹配蓝天的较淡雾效

    // 白天模式不需要星空特效
    // this.createStars();

    // Camera Setup
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(10, 10, 10);
    this.camera.lookAt(0, 0, 0);

    // Renderer Setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // 白天较亮的环境光
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfffae6, 1.2); // 暖黄色的太阳直射光，增强立体感
    dirLight.position.set(20, 30, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    this.scene.add(dirLight);

    // Ground
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x5c4033 }); // Dark brown
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // Game Components
    this.excavator = new Excavator(this.scene, this.soundManager);
    this.soilSystem = new SoilSystem(this.scene, this.soundManager);
    this.roadSystem = new RoadSystem(this.scene);
    this.levelManager = new LevelManager(this);

    this.isGameStarted = false;
    this.isPaused = false;
    this.handleResize = this.onWindowResize.bind(this);
    this.handlePauseKeyDown = (e) => {
      if ((e.key === 'p' || e.key === 'P') && this.isGameStarted && !this.levelManager.isLevelComplete && !this.levelManager.isLevelFailed) {
        this.togglePause();
      }
    };
    this.handlePauseClick = () => {
      if (this.isGameStarted && !this.levelManager.isLevelComplete && !this.levelManager.isLevelFailed) {
        this.togglePause();
      }
    };

    // Event Listeners
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handlePauseKeyDown);

    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', this.handlePauseClick);
    }

    // Start Loop
    this.animate();
  }

  start() {
    this.isGameStarted = true;
    this.isPaused = false;
    document.getElementById('pause-overlay')?.classList.add('hidden');
    document.getElementById('message-overlay')?.classList.add('hidden');
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
      pauseBtn.innerText = '⏸ 暂停';
    }

    if (this.soundManager.ctx.state === 'suspended') {
      this.soundManager.ctx.resume();
    }
    this.soundManager.startEngine();
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    const pauseOverlay = document.getElementById('pause-overlay');
    const pauseBtn = document.getElementById('pause-btn');

    if (this.isPaused) {
      pauseOverlay.classList.remove('hidden');
      pauseBtn.innerText = '▶ 继续';
      if (this.soundManager) this.soundManager.idleEngine(); // 暂停时引擎降低音量
    } else {
      pauseOverlay.classList.add('hidden');
      pauseBtn.innerText = '⏸ 暂停';
      // 继续时重置计时器基准时间，防止累加暂停期间的时间跨度
      if (this.levelManager) {
        this.levelManager.lastUpdateTime = performance.now();
      }
      if (this.soundManager) this.soundManager.startEngine();
    }
  }

  animate() {
    if (this.isDestroyed) {
      return;
    }

    requestAnimationFrame(this.animate.bind(this));

    const dt = 0.016; // Fixed time step for simplicity

    const isGameActive = this.isGameStarted && !this.levelManager.isLevelComplete && !this.levelManager.isLevelFailed && !this.isPaused;

    if (isGameActive) {
      this.excavator.update(dt);
      this.soilSystem.update(dt, this.excavator);
      this.levelManager.update();
    } else if (!this.isGameStarted) {
      // Attract mode: Rotate camera slowly
      const time = Date.now() * 0.0005;
      this.camera.position.x = Math.sin(time) * 20;
      this.camera.position.z = Math.cos(time) * 20;
      this.camera.lookAt(0, 0, 0);
    } else if (this.isPaused) {
      // Game is paused - frozen state
      if (this.soundManager) this.soundManager.idleEngine();
      // DO NOT UPDATE levelManager here so timer completely stops.
    } else {
      // Level Complete/Failed state
      // Optional: Stop engine sound if running
      if (this.soundManager) this.soundManager.idleEngine();
      this.levelManager.update(); // Keep updating UI if needed
    }

    // Camera follow logic (simple) - Only when playing
    if (this.isGameStarted) {
      const targetPos = this.excavator.mesh.position.clone();
      targetPos.y += 10;
      targetPos.z += 15;
      // Simple lerp or just lookAt
      // For now, let's stick to the initial setup or simple follow
      // The initial setup didn't have complex follow, let's just look at excavator
      this.camera.lookAt(this.excavator.mesh.position);
    }

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.isDestroyed = true;
    this.isGameStarted = false;
    this.isPaused = false;

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handlePauseKeyDown);

    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
      pauseBtn.removeEventListener('click', this.handlePauseClick);
      pauseBtn.innerText = '⏸ 暂停';
    }

    document.getElementById('pause-overlay')?.classList.add('hidden');
    document.getElementById('message-overlay')?.classList.add('hidden');

    this.excavator?.destroy?.();
    this.soundManager?.destroy?.();

    this.scene?.traverse((object) => {
      if (object.geometry) {
        object.geometry.dispose();
      }

      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material?.dispose?.());
      }
    });

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.domElement.remove();
    }
  }

  createStars() {
    const starGeometry = new THREE.BufferGeometry();
    const starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.2,
      transparent: true,
      opacity: 0.9,
      fog: false, // 关键：让高空的星星不受黑雾遮挡影响
      sizeAttenuation: true
    });

    const starVertices = [];
    // 生成 2000 个随机星星
    for (let i = 0; i < 2000; i++) {
      const x = (Math.random() - 0.5) * 300;
      const y = Math.random() * 100 + 15; // 限制在空中
      const z = (Math.random() - 0.5) * 300;
      starVertices.push(x, y, z);
    }

    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
    const stars = new THREE.Points(starGeometry, starMaterial);
    this.scene.add(stars);
  }
}
