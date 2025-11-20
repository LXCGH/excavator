import * as THREE from 'three';

export class Excavator {
    constructor(scene, soundManager) {
        this.scene = scene;
        this.soundManager = soundManager;
        this.speed = 5;
        this.rotateSpeed = 2;
        this.armSpeed = 2;

        this.keys = {
            w: false, s: false, a: false, d: false,
            q: false, e: false,
            ArrowUp: false, ArrowDown: false,
            ArrowLeft: false, ArrowRight: false,
            ' ': false
        };

        this.createModel();
        this.initInput();

        this.rotationY = 0; // Track base rotation for camera
    }

    createModel() {
        const material = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.7, metalness: 0.1 }); // Yellow
        const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.9 }); // Dark grey
        const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.6, roughness: 0.2, metalness: 0.8 }); // Glass
        const steelMaterial = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.3, metalness: 0.8 }); // Steel

        // 1. Base (Tracks)
        this.mesh = new THREE.Group();
        this.scene.add(this.mesh);
        this.mesh.position.y = 0.5;

        // Left Track
        const leftTrack = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 3.2), darkMaterial);
        leftTrack.position.set(-0.8, 0, 0);
        this.mesh.add(leftTrack);

        // Right Track
        const rightTrack = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 3.2), darkMaterial);
        rightTrack.position.set(0.8, 0, 0);
        this.mesh.add(rightTrack);

        // Axle/Undercarriage
        const axle = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 1.5), darkMaterial);
        axle.position.y = 0.2;
        this.mesh.add(axle);

        // 2. Cab (Rotates on Base)
        this.cab = new THREE.Group();
        this.cab.position.y = 0.6;
        this.mesh.add(this.cab);

        // Cab Body
        const cabBodyGeo = new THREE.BoxGeometry(1.8, 0.2, 2.2);
        const cabPlatform = new THREE.Mesh(cabBodyGeo, darkMaterial);
        this.cab.add(cabPlatform);

        // Main Cabin
        const cabin = new THREE.Group();
        cabin.position.set(-0.4, 0.8, 0.2);
        this.cab.add(cabin);

        const cabinShape = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 1.5), material);
        cabin.add(cabinShape);

        // Windows
        const frontWindow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.2), glassMaterial);
        frontWindow.position.set(0, 0.1, 0.76);
        cabin.add(frontWindow);

        const sideWindow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1), glassMaterial);
        sideWindow.rotation.y = -Math.PI / 2;
        sideWindow.position.set(-0.61, 0.2, 0);
        cabin.add(sideWindow);

        // Engine Compartment (Behind Cab)
        const engineComp = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 0.8), material);
        engineComp.position.set(0, 0.7, -0.8);
        this.cab.add(engineComp);

        // Exhaust Pipe
        const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8), darkMaterial);
        exhaust.position.set(0.6, 1.4, -1);
        this.cab.add(exhaust);

        // 3. Boom (Attached to Cab)
        this.boom = new THREE.Group();
        this.boom.position.set(0.4, 0.5, 0.8); // Pivot point
        this.cab.add(this.boom);

        // Boom Arm
        const boomGeo = new THREE.BoxGeometry(0.4, 4.5, 0.4);
        const boomMesh = new THREE.Mesh(boomGeo, material);
        boomMesh.position.y = 2.25;
        boomMesh.rotation.x = Math.PI / 8; // Slight bend
        this.boom.add(boomMesh);

        // Hydraulic Piston (Boom)
        const pistonCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2), steelMaterial);
        pistonCyl.position.set(0, 1.5, -0.4);
        pistonCyl.rotation.x = -Math.PI / 8;
        this.boom.add(pistonCyl);

        // 4. Stick (Attached to Boom)
        this.stick = new THREE.Group();
        this.stick.position.set(0, 4.2, 0.8); // Pivot at end of boom
        this.boom.add(this.stick);

        const stickGeo = new THREE.BoxGeometry(0.35, 3, 0.35);
        const stickMesh = new THREE.Mesh(stickGeo, material);
        stickMesh.position.y = -1.2;
        this.stick.add(stickMesh);

        // Hydraulic Piston (Stick)
        const stickPiston = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.5), steelMaterial);
        stickPiston.position.set(0, 0.5, -0.3);
        stickPiston.rotation.x = Math.PI / 4;
        this.stick.add(stickPiston);

        // 5. Bucket (Attached to Stick)
        this.bucket = new THREE.Group();
        this.bucket.position.set(0, -2.8, 0);
        this.stick.add(this.bucket);

        // Bucket Scoop (Curved Shell)
        // Use a cylinder segment for the back/bottom
        const scoopGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.0, 32, 1, true, Math.PI, Math.PI * 1.2);
        const scoopMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, side: THREE.DoubleSide, roughness: 0.9 });
        this.bucketMesh = new THREE.Mesh(scoopGeo, scoopMat);
        this.bucketMesh.rotation.z = Math.PI / 2; // Rotate to lay horizontal
        this.bucketMesh.position.set(0, 0, 0.5); // Offset to align with pivot
        this.bucket.add(this.bucketMesh);

        // Side Plates
        const sideShape = new THREE.Shape();
        sideShape.absarc(0, 0, 0.5, Math.PI, Math.PI * 2.2, false); // Match cylinder arc
        sideShape.lineTo(0, 0); // Close to center

        const sideGeo = new THREE.ShapeGeometry(sideShape);
        const sideMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, side: THREE.DoubleSide });

        const leftSide = new THREE.Mesh(sideGeo, sideMat);
        leftSide.position.set(0, 0.5, 0); // Left edge
        leftSide.rotation.y = -Math.PI / 2;
        this.bucketMesh.add(leftSide);

        const rightSide = new THREE.Mesh(sideGeo, sideMat);
        rightSide.position.set(0, -0.5, 0); // Right edge
        rightSide.rotation.y = -Math.PI / 2;
        this.bucketMesh.add(rightSide);

        // Teeth (on the leading edge)
        // The leading edge is at angle Math.PI * 2.2 on the cylinder
        const angle = Math.PI * 2.2;
        const radius = 0.5;
        const edgeX = radius * Math.cos(angle);
        const edgeY = radius * Math.sin(angle);

        for (let i = -0.4; i <= 0.4; i += 0.2) {
            const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.15, 4), steelMaterial);
            // Position relative to bucketMesh
            tooth.position.set(edgeX, i, edgeY);
            // Point outward
            tooth.rotation.z = angle - Math.PI / 2;
            tooth.rotation.y = Math.PI / 2; // Align with width
            this.bucketMesh.add(tooth);
        }

        // Initial poses
        this.boom.rotation.x = Math.PI / 4;
        this.stick.rotation.x = -Math.PI / 2;
        this.bucket.rotation.x = Math.PI / 4;

        // 6. Flashing Beacon (On top of Cab)
        const beaconGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.2);
        this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 }); // Orange
        const beacon = new THREE.Mesh(beaconGeo, this.beaconMat);
        beacon.position.set(0, 1.7, 0); // Top of cabin
        cabin.add(beacon);

        // Add a point light for effect
        this.beaconLight = new THREE.PointLight(0xffaa00, 0, 5);
        this.beaconLight.position.set(0, 1.9, 0);
        cabin.add(this.beaconLight);

        this.lightTimer = 0;
    }

    initInput() {
        window.addEventListener('keydown', (e) => {
            if (this.keys.hasOwnProperty(e.key)) this.keys[e.key] = true;
        });
        window.addEventListener('keyup', (e) => {
            if (this.keys.hasOwnProperty(e.key)) this.keys[e.key] = false;
        });
    }

    update(dt) {
        // Move Base
        if (this.keys.w) {
            this.mesh.translateZ(this.speed * dt);
        }
        if (this.keys.s) {
            this.mesh.translateZ(-this.speed * dt);
        }

        // Boundary Control
        const limit = 45; // Ground is 100x100, so -50 to 50. Keep some buffer.
        this.mesh.position.x = Math.max(-limit, Math.min(limit, this.mesh.position.x));
        this.mesh.position.z = Math.max(-limit, Math.min(limit, this.mesh.position.z));

        if (this.keys.a) {
            this.mesh.rotateY(this.rotateSpeed * dt);
            this.rotationY += this.rotateSpeed * dt;
        }
        if (this.keys.d) {
            this.mesh.rotateY(-this.rotateSpeed * dt);
            this.rotationY -= this.rotateSpeed * dt;
        }

        // Rotate Cab
        if (this.keys.q) {
            this.cab.rotateY(this.rotateSpeed * dt);
        }
        if (this.keys.e) {
            this.cab.rotateY(-this.rotateSpeed * dt);
        }

        // Move Boom
        if (this.keys.ArrowUp) {
            this.boom.rotation.x -= this.armSpeed * dt;
        }
        if (this.keys.ArrowDown) {
            this.boom.rotation.x += this.armSpeed * dt;
        }

        // Move Stick
        if (this.keys.ArrowLeft) {
            this.stick.rotation.x += this.armSpeed * dt;
        }
        if (this.keys.ArrowRight) {
            this.stick.rotation.x -= this.armSpeed * dt;
        }

        // Bucket Scoop (Space) - Simple animation or toggle
        if (this.keys[' ']) {
            this.bucket.rotation.x += this.armSpeed * dt * 2;
        } else {
            // Return to neutral
            if (this.bucket.rotation.x > 0) {
                this.bucket.rotation.x -= this.armSpeed * dt * 2;
            }
        }

        // Clamp rotations
        this.boom.rotation.x = Math.max(0, Math.min(Math.PI / 2, this.boom.rotation.x));
        this.stick.rotation.x = Math.max(-Math.PI, Math.min(0, this.stick.rotation.x));

        // Sound Logic
        const isMoving = this.keys.w || this.keys.s || this.keys.a || this.keys.d;
        const isArmMoving = this.keys.ArrowUp || this.keys.ArrowDown || this.keys.ArrowLeft || this.keys.ArrowRight || this.keys.q || this.keys.e || this.keys[' '];

        if (isMoving) {
            this.soundManager.revEngine(1.2);
        } else {
            this.soundManager.idleEngine();
        }

        if (isArmMoving && Math.random() > 0.8) { // Don't play every frame
            this.soundManager.playHydraulicSound();
        }

        // Flashing Light Logic
        if (isMoving) {
            this.lightTimer += dt * 10; // Flash speed
            const intensity = (Math.sin(this.lightTimer) + 1) / 2; // 0 to 1

            // Determine Color
            let color = 0xffaa00; // Default Orange (Turning)
            if (this.keys.w) color = 0x00ff00; // Green for Forward
            else if (this.keys.s) color = 0xff0000; // Red for Backward

            // Flash material
            if (intensity > 0.5) {
                this.beaconMat.color.setHex(color); // On
                this.beaconLight.color.setHex(color);
                this.beaconLight.intensity = 2;
            } else {
                this.beaconMat.color.setHex(0x332200); // Off/Dim
                this.beaconLight.intensity = 0;
            }
        } else {
            // Turn off when stopped
            this.beaconMat.color.setHex(0x332200);
            this.beaconLight.intensity = 0;
        }
    }

    // Helper to get bucket world position for soil interaction
    getBucketWorldPosition() {
        const pos = new THREE.Vector3();
        this.bucketMesh.getWorldPosition(pos);
        return pos;
    }
}
