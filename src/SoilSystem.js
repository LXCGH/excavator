import * as THREE from 'three';

export class SoilSystem {
    constructor(scene, soundManager) {
        this.scene = scene;
        this.soundManager = soundManager;
        this.particles = [];
        this.pits = []; // Target zones
        this.gravity = -9.8;
    }

    createPile(x, z, count = 50, color = 0x8b4513) {
        const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        const material = new THREE.MeshStandardMaterial({ color: color });

        for (let i = 0; i < count; i++) {
            const mesh = new THREE.Mesh(geometry, material);

            // Randomize position in a pile shape
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 1.5;
            const px = x + Math.cos(angle) * radius;
            const pz = z + Math.sin(angle) * radius;
            const py = Math.random() * 1; // Height of pile

            mesh.position.set(px, py, pz);
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            // Physics properties (simple)
            mesh.userData = {
                velocity: new THREE.Vector3(0, 0, 0),
                isAttached: false,
                onGround: true,
                color: color // Store color for checking win condition
            };

            this.scene.add(mesh);
            this.particles.push(mesh);
        }
    }

    createPit(x, z, color) {
        const geometry = new THREE.CylinderGeometry(2, 2, 0.1, 32);
        const material = new THREE.MeshBasicMaterial({ color: color, opacity: 0.5, transparent: true });
        const pit = new THREE.Mesh(geometry, material);
        pit.position.set(x, 0.05, z);
        pit.userData = { color: color };
        this.scene.add(pit);
        this.pits.push(pit);
    }

    clear() {
        this.particles.forEach(p => this.scene.remove(p));
        this.pits.forEach(p => this.scene.remove(p));
        this.particles = [];
        this.pits = [];
    }

    update(dt, excavator) {
        const bucketPos = excavator.getBucketWorldPosition();
        const isScooping = excavator.keys[' ']; // Spacebar to scoop

        // Simple interaction radius
        const radius = 1.5;

        this.particles.forEach(p => {
            if (p.userData.isAttached) {
                // Follow bucket
                // We need to attach it relative to the bucket, but for simplicity, just snap to bucket pos + random offset
                // A better way is to add it as a child of the bucket mesh, but that complicates world coordinates.
                // Let's just lerp to bucket pos for now.

                if (!isScooping) {
                    // Drop
                    p.userData.isAttached = false;
                    p.userData.velocity.set(0, 0, 0); // Reset velocity
                } else {
                    // Keep attached
                    p.position.copy(bucketPos).add(new THREE.Vector3(
                        (Math.random() - 0.5) * 0.5,
                        (Math.random() - 0.5) * 0.5,
                        (Math.random() - 0.5) * 0.5
                    ));
                }
            } else {
                // Gravity
                if (p.position.y > 0.15) {
                    p.userData.velocity.y += this.gravity * dt;
                    p.position.addScaledVector(p.userData.velocity, dt);

                    if (p.position.y < 0.15) {
                        p.position.y = 0.15;
                        p.userData.velocity.set(0, 0, 0);
                        p.userData.onGround = true;
                    }
                }

                // Check for scoop
                if (isScooping && p.position.distanceTo(bucketPos) < radius && p.position.y < 2) {
                    // Only pick up if bucket is low enough
                    p.userData.isAttached = true;
                    p.userData.onGround = false;

                    // Particle Effect
                    if (Math.random() > 0.7) {
                        this.createDigEffect(p.position, p.userData.color);
                        if (this.soundManager) this.soundManager.playDigSound();
                    }
                }
            }
        });

        // Update effects
        this.updateEffects(dt);
    }

    createDigEffect(pos, color) {
        if (!this.effects) this.effects = [];

        const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        const material = new THREE.MeshBasicMaterial({ color: color });

        for (let i = 0; i < 5; i++) {
            const p = new THREE.Mesh(geometry, material);
            p.position.copy(pos);
            p.position.x += (Math.random() - 0.5) * 0.5;
            p.position.z += (Math.random() - 0.5) * 0.5;

            p.userData = {
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 2,
                    Math.random() * 3,
                    (Math.random() - 0.5) * 2
                ),
                life: 1.0
            };

            this.scene.add(p);
            this.effects.push(p);
        }
    }

    updateEffects(dt) {
        if (!this.effects) return;

        for (let i = this.effects.length - 1; i >= 0; i--) {
            const p = this.effects[i];
            p.userData.life -= dt;

            if (p.userData.life <= 0) {
                this.scene.remove(p);
                this.effects.splice(i, 1);
            } else {
                p.userData.velocity.y -= 9.8 * dt;
                p.position.addScaledVector(p.userData.velocity, dt);
                p.scale.setScalar(p.userData.life);
            }
        }
    }

    // Check if a pit has enough soil of correct color
    checkWinCondition(level) {
        if (level === 1 || level === 2) {
            // Win if particles are moved away from original spot?
            // Or maybe just "dug up".
            // Let's say win if 80% of particles are moved > 5 units from spawn?
            // Or simpler: Level 1/2 just requires interacting with them.
            // Let's define a "Drop Zone" for Level 1/2 implicitly or explicitly.
            // For now, let's say if they are dropped in a specific area.
            // Actually, the prompt says "dig once to pass".
            // So maybe just picking them up counts?
            // Let's make it: Put them in a generic pit/zone.

            // For simplicity in this prototype:
            // Level 1/2: Count how many particles are in the "target" area.
            // I'll assume the LevelManager sets up a target pit even for Level 1/2.
        }

        // Count particles in pits
        let correct = 0;
        let total = this.particles.length;

        this.pits.forEach(pit => {
            const pitPos = pit.position;
            const pitRadius = 2;

            this.particles.forEach(p => {
                const dist = Math.sqrt(Math.pow(p.position.x - pitPos.x, 2) + Math.pow(p.position.z - pitPos.z, 2));
                if (dist < pitRadius && p.userData.color === pit.userData.color) {
                    correct++;
                }
            });
        });

        return correct;
    }

    checkFailureCondition() {
        let failed = false;
        this.pits.forEach(pit => {
            const pitPos = pit.position;
            const pitRadius = 2;

            this.particles.forEach(p => {
                // Only check if particle is on the ground (not being carried)
                if (!p.userData.isAttached) {
                    const dist = Math.sqrt(Math.pow(p.position.x - pitPos.x, 2) + Math.pow(p.position.z - pitPos.z, 2));
                    // If in pit but wrong color
                    if (dist < pitRadius && p.userData.color !== pit.userData.color) {
                        failed = true;
                    }
                }
            });
        });
        return failed;
    }
}
