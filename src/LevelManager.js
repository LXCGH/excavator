export class LevelManager {
    constructor(game) {
        this.game = game;
        this.currentLevel = 1;
        this.isLevelComplete = false;

        this.ui = {
            level: document.getElementById('level-display'),
            objective: document.getElementById('objective-display'),
            timer: document.getElementById('timer-display'),
            timerCard: document.querySelector('.timer-card'),
            overlay: document.getElementById('message-overlay'),
            message: document.getElementById('message-text'),
            nextBtn: document.getElementById('next-level-btn'),
            restartBtn: document.getElementById('restart-level-btn')
        };

        this.ui.nextBtn.addEventListener('click', () => this.nextLevel());
        this.ui.restartBtn.addEventListener('click', () => this.loadLevel(this.currentLevel));

        this.loadLevel(this.currentLevel);
    }

    loadLevel(level) {
        this.currentLevel = level;
        this.isLevelComplete = false;
        this.isLevelFailed = false;
        this.ui.overlay.classList.add('hidden');
        this.ui.restartBtn.classList.add('hidden');
        this.ui.nextBtn.classList.remove('hidden');
        this.ui.level.innerText = level;

        this.game.soilSystem.clear();

        // Reset Excavator position
        this.game.excavator.mesh.position.set(0, 0.5, 0);
        this.game.excavator.mesh.rotation.set(0, 0, 0);
        this.game.excavator.rotationY = 0;

        // Default time
        this.timeLeft = 60;

        switch (level) {
            case 1:
                this.setupLevel1();
                break;
            case 2:
                this.setupLevel2();
                break;
            case 3:
                this.setupLevel3();
                break;
            default:
                this.setupLevel1(); // Loop back or end
                break;
        }

        this.updateTimerDisplay();
    }

    setupLevel1() {
        this.ui.objective.innerText = "挖掉那堆土，把它倒进坑里！";
        this.timeLeft = 60;
        // 1 Pile
        this.game.soilSystem.createPile(5, 5, 30, 0x8b4513);
        // 1 Target Pit
        this.game.soilSystem.createPit(-5, 5, 0x8b4513);

        this.targetCount = 20; // Need to move 20 particles to pit
    }

    setupLevel2() {
        this.ui.objective.innerText = "挖掉所有3堆土！";
        this.timeLeft = 90; // More work, but tighter relative to 1 pile
        // 3 Piles
        this.game.soilSystem.createPile(5, 5, 30, 0x8b4513);
        this.game.soilSystem.createPile(5, -5, 30, 0x8b4513);
        this.game.soilSystem.createPile(10, 0, 30, 0x8b4513);

        // 1 Target Pit (Larger maybe?)
        this.game.soilSystem.createPit(-5, 0, 0x8b4513);

        this.targetCount = 85;
    }

    setupLevel3() {
        this.ui.objective.innerText = "颜色分类！把红土倒进红坑，蓝土倒进蓝坑。";
        this.timeLeft = 150;
        // 5 Piles (Colored)
        // Red
        this.game.soilSystem.createPile(5, 5, 20, 0xff0000);
        // Blue
        this.game.soilSystem.createPile(5, -5, 20, 0x0000ff);
        // Green
        this.game.soilSystem.createPile(10, 0, 20, 0x00ff00);
        // Yellow
        this.game.soilSystem.createPile(8, 8, 20, 0xffff00);
        // Purple
        this.game.soilSystem.createPile(8, -8, 20, 0x800080);

        // Pits
        this.game.soilSystem.createPit(-5, 5, 0xff0000); // Red Pit
        this.game.soilSystem.createPit(-5, -5, 0x0000ff); // Blue Pit
        this.game.soilSystem.createPit(-8, 0, 0x00ff00); // Green Pit
        this.game.soilSystem.createPit(-5, 8, 0xffff00); // Yellow Pit
        this.game.soilSystem.createPit(-5, -8, 0x800080); // Purple Pit

        this.targetCount = 95; // Total correct
    }

    update() {
        if (this.isLevelComplete || this.isLevelFailed) return;

        // Timer Logic
        // Assuming update is called ~60fps. Better to pass dt.
        // But Game.js passes nothing to update(). Let's fix Game.js or just use a simple decrement.
        // Actually, let's use performance.now() or just decrement by 1/60.
        const prevTime = Math.ceil(this.timeLeft);
        this.timeLeft -= 0.016; // Approx 60fps
        const currTime = Math.ceil(this.timeLeft);

        if (currTime !== prevTime) {
            // Second changed
            this.updateTimerDisplay();

            if (currTime <= 10 && currTime > 0) {
                // Play sound and animate
                if (this.game.soundManager) this.game.soundManager.playCountdownSound();
                this.ui.timerCard.classList.add('tick');
                setTimeout(() => this.ui.timerCard.classList.remove('tick'), 200);
            }
        }

        if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            this.failLevel("时间到！");
            this.updateTimerDisplay();
            return;
        }

        // Check failure first
        if (this.game.soilSystem.checkFailureCondition()) {
            this.failLevel("失败！颜色错误！");
            return;
        }

        // Check Road Constraint
        if (!this.game.roadSystem.isOnRoad(this.game.excavator.mesh.position)) {
            // Allow a small grace period or check if strictly off
            // For now, immediate fail
            this.failLevel("失败！偏离道路！");
            return;
        }

        const correctParticles = this.game.soilSystem.checkWinCondition(this.currentLevel);

        // Check win
        if (correctParticles >= this.targetCount) {
            this.completeLevel();
        }
    }

    failLevel(reason = "失败！") {
        this.isLevelFailed = true;
        this.ui.message.innerText = reason;
        this.ui.overlay.classList.remove('hidden');
        this.ui.nextBtn.classList.add('hidden');
        this.ui.restartBtn.classList.remove('hidden');
    }

    updateTimerDisplay() {
        this.ui.timer.innerText = Math.ceil(this.timeLeft);
    }

    completeLevel() {
        this.isLevelComplete = true;
        this.ui.message.innerText = `第 ${this.currentLevel} 关完成！`;
        this.ui.overlay.classList.remove('hidden');
        if (this.game.soundManager) this.game.soundManager.playSuccessSound();
    }

    nextLevel() {
        this.loadLevel(this.currentLevel + 1);
    }
}
