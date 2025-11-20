import * as THREE from 'three';

export class RoadSystem {
    constructor(scene) {
        this.scene = scene;
        this.roads = [];
        this.roadMeshes = [];

        // Define standard road width
        this.width = 4;

        // Create a default road network covering the main play area
        // Central hub at 0,0
        // Paths to piles (approx x: 5-10, z: -8 to 8)
        // Paths to pits (approx x: -5 to -8, z: -8 to 8)

        this.createRoads();
    }

    createRoads() {
        const material = new THREE.MeshStandardMaterial({
            color: 0x555555, // Dark Grey
            roughness: 0.9
        });

        // Define segments: [x, z, width, length, rotationY]
        // Or better: StartPoint, EndPoint, Width

        const segments = [
            // Main Horizontal Axis (West to East)
            { x: 0, z: 0, w: 25, h: 4 }, // From x=-12.5 to 12.5

            // Vertical Branches for Piles (Right side)
            { x: 5, z: 0, w: 4, h: 18 }, // From z=-9 to 9 at x=5
            { x: 10, z: 0, w: 4, h: 10 }, // From z=-5 to 5 at x=10

            // Vertical Branches for Pits (Left side)
            { x: -5, z: 0, w: 4, h: 18 }, // From z=-9 to 9 at x=-5
            { x: -8, z: 0, w: 4, h: 10 }, // From z=-5 to 5 at x=-8
        ];

        segments.forEach(seg => {
            const geometry = new THREE.PlaneGeometry(seg.w, seg.h);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(seg.x, 0.02, seg.z); // Slightly above ground
            mesh.receiveShadow = true;

            this.scene.add(mesh);
            this.roadMeshes.push(mesh);

            // Store bounds for collision
            this.roads.push({
                minX: seg.x - seg.w / 2,
                maxX: seg.x + seg.w / 2,
                minZ: seg.z - seg.h / 2,
                maxZ: seg.z + seg.h / 2
            });
        });
    }

    isOnRoad(position) {
        // Simple AABB check
        // Allow some tolerance (e.g. center of excavator must be on road)
        const x = position.x;
        const z = position.z;

        for (let road of this.roads) {
            if (x >= road.minX && x <= road.maxX &&
                z >= road.minZ && z <= road.maxZ) {
                return true;
            }
        }
        return false;
    }
}
