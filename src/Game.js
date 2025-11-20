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

    // Scene Setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // Sky blue
    this.scene.fog = new THREE.Fog(0x87ceeb, 10, 50);

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
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
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
    const startBtn = document.getElementById('start-game-btn');
    const startScreen = document.getElementById('start-screen');

    startBtn.addEventListener('click', () => {
      this.isGameStarted = true;
      startScreen.style.display = 'none';

      // Init Audio
      if (this.soundManager.ctx.state === 'suspended') {
        this.soundManager.ctx.resume();
      }
      this.soundManager.startEngine();
    });

    // Event Listeners
    window.addEventListener('resize', this.onWindowResize.bind(this));
    // Removed auto-start listeners

    // Start Loop
    this.animate();
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    requestAnimationFrame(this.animate.bind(this));

    const dt = 0.016; // Fixed time step for simplicity

    const isGameActive = this.isGameStarted && !this.levelManager.isLevelComplete && !this.levelManager.isLevelFailed;

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
    } else {
      // Level Complete/Failed state
      // Optional: Stop engine sound if running
      if (this.soundManager) this.soundManager.idleEngine();
      this.levelManager.update(); // Keep updating UI/Timer logic if needed (though timer stops on fail)
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
}
