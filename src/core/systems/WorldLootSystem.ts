import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { soundManager } from '../../utils/sound';
import { GEOMETRY, MATERIALS } from '../../utils/assets';

export interface ScrapItem {
    velocity: THREE.Vector3;
    value: number;
    grounded: boolean;
    magnetized: boolean;
    life: number; // Despawn timer
    spawnTime: number; // For magnetism delay

    // Instancing props
    index: number;
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
    active: boolean;
}

export class WorldLootSystem implements System {
    id = 'world_loot';

    // Config
    private static MAX_SCRAP = 200;

    // Instancing
    private instancedMesh: THREE.InstancedMesh;
    private dummy = new THREE.Object3D();

    // Pool
    private pool: ScrapItem[] = [];

    constructor(private playerGroup: THREE.Group, scene: THREE.Scene) {
        // Create Instanced Mesh
        this.instancedMesh = new THREE.InstancedMesh(GEOMETRY.scrap, MATERIALS.scrap, WorldLootSystem.MAX_SCRAP);
        this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // Provide hint for frequent updates
        this.instancedMesh.count = 0; // Start with 0 visible
        this.instancedMesh.frustumCulled = false; // Easier to manage simple loot bounds check manually if needed, or trust Three.js
        scene.add(this.instancedMesh);

        // Initialize Pool
        for (let i = 0; i < WorldLootSystem.MAX_SCRAP; i++) {
            this.pool.push({
                velocity: new THREE.Vector3(),
                value: 0,
                grounded: false,
                magnetized: false,
                life: 0,
                spawnTime: 0,
                index: i,
                position: new THREE.Vector3(0, -100, 0), // Start hidden
                rotation: new THREE.Euler(),
                scale: new THREE.Vector3(1, 1, 1),
                active: false
            });

            // Set initial position off-screen
            this.dummy.position.set(0, -100, 0);
            this.dummy.updateMatrix();
            this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
        }

        // Register static accessor for global usage (temporary bridge for legacy calls)
        WorldLootSystem.instance = this;
    }

    private static instance: WorldLootSystem | null = null;

    update(session: GameSessionLogic, dt: number, now: number) {
        const state = session.state;
        // const scene = session.engine.scene; // No longer adding/removing from scene directly

        const collected = this.updateLoot(
            this.playerGroup.position,
            dt,
            now
        );

        if (collected > 0) {
            state.collectedScrap += collected;
        }
    }

    private updateLoot(
        playerPos: THREE.Vector3,
        delta: number,
        now: number
    ): number {
        let collectedAmount = 0;
        const collectionRange = 2.0;
        const magnetRange = 5.0;
        const magnetSpeed = 25.0;

        let needsUpdate = false;
        let activeCount = 0; // We could track this, but .count property usually determines render count. 
        // However, with pooling we often keep .count high or manage swap.
        // Simpler here: Always render all, but move inactive ones far away? 
        // OR: Keep active ones at indices 0..count. Swapping is complex logic.
        // EASIEST: Update ALL active ones. Inactive ones stay where they are (offscreen).
        // We set .count to MAX_SCRAP to ensure all slots are available?
        // Optimization: Only update dirty matrices.

        this.instancedMesh.count = WorldLootSystem.MAX_SCRAP; // Ensure all slots renderable (some might be hidden)

        for (const item of this.pool) {
            if (!item.active) continue;

            needsUpdate = true;

            // 1. Physics (Gravity & Bouncing)
            if (!item.magnetized) {
                if (!item.grounded) {
                    item.velocity.y -= 30 * delta; // Gravity
                    item.position.add(item.velocity.clone().multiplyScalar(delta));

                    // Ground Bounce
                    if (item.position.y <= 0.3) {
                        item.position.y = 0.3;
                        item.velocity.y *= -0.5; // Bounce dampening
                        item.velocity.x *= 0.8;  // Friction
                        item.velocity.z *= 0.8;

                        if (Math.abs(item.velocity.y) < 0.5) {
                            item.grounded = true;
                            item.velocity.set(0, 0, 0);
                        }
                    }
                }

                // Idle Rotation
                item.rotation.y += 1.0 * delta;
                item.rotation.z += 1.0 * delta;
            }

            // 2. Magnetism (Attract to player)
            const distSq = item.position.distanceToSquared(playerPos);
            const magnetismDelay = 800; // ms to wait before magnetizing
            const canMagnetize = (now - item.spawnTime) > magnetismDelay;

            if (canMagnetize && distSq < magnetRange * magnetRange) {
                item.magnetized = true;
                item.grounded = false; // Lift off ground
            }

            if (item.magnetized) {
                const dir = new THREE.Vector3().subVectors(playerPos, item.position).normalize();
                // Accelerate towards player
                const speed = magnetSpeed * (1 + (10 / (distSq + 0.1))); // Faster as it gets closer
                item.position.add(dir.multiplyScalar(speed * delta));
                // Shrink as it gets absorbed
                const scale = Math.max(0.1, item.scale.x - 2.0 * delta);
                item.scale.setScalar(scale);
            }

            // 3. Collection
            if (distSq < collectionRange) { // Close enough to collect
                collectedAmount += item.value;
                this.deactivateItem(item);

                // Play small click sound per item
                if (Math.random() > 0.3) soundManager.playLootingScrap();
                continue;
            }

            // 4. Update Matrix
            this.dummy.position.copy(item.position);
            this.dummy.rotation.copy(item.rotation);
            this.dummy.scale.copy(item.scale);
            this.dummy.updateMatrix();
            this.instancedMesh.setMatrixAt(item.index, this.dummy.matrix);
        }

        if (needsUpdate) {
            this.instancedMesh.instanceMatrix.needsUpdate = true;
        }

        return collectedAmount;
    }

    private deactivateItem(item: ScrapItem) {
        item.active = false;
        // Move offscreen immediately
        this.dummy.position.set(0, -100, 0);
        this.dummy.updateMatrix();
        this.instancedMesh.setMatrixAt(item.index, this.dummy.matrix);
        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    public static spawnScrapExplosion(
        scene: THREE.Scene, // Parameter kept for compatibility but ignored/checked against current
        scrapItems: any[], // State array kept for compatibility? WE SHOULD REMOVE RELIANCE ON STATE ARRAY
        x: number,
        z: number,
        amount: number
    ) {
        if (!WorldLootSystem.instance) return;
        const system = WorldLootSystem.instance;

        const count = Math.min(Math.ceil(amount / 10), 20);

        // Spawn the first few immediately for instant feedback
        const immediateCount = Math.min(5, count);
        for (let i = 0; i < immediateCount; i++) {
            system.spawnSingle(x, z);
        }

        // Spread the rest across next few frames to avoid lag spike
        const remaining = count - immediateCount;
        for (let i = 0; i < remaining; i++) {
            setTimeout(() => {
                system.spawnSingle(x, z);
            }, i * 8); // 8ms between each spawn (spread over ~120ms)
        }
    }

    private spawnSingle(x: number, z: number) {
        // Find free slot
        const item = this.pool.find(p => !p.active);
        if (!item) return; // Pool exhausted

        const angle = Math.random() * Math.PI * 2;
        const force = 0.2 + Math.random() * 0.3;

        item.active = true;
        item.position.set(x, 1, z);
        item.velocity.set(Math.cos(angle) * force * 10, 5 + Math.random() * 5, Math.sin(angle) * force * 10);
        item.rotation.set(0, 0, 0);
        item.scale.set(1, 1, 1);
        item.value = 10 + Math.floor(Math.random() * 10);
        item.grounded = false;
        item.magnetized = false;
        item.life = 60.0;
        item.spawnTime = performance.now();

        // Trigger initial matrix update in next frame loop or do it here if needed immediately?
        // Doing it immediately requires manual matrix update
        this.dummy.position.copy(item.position);
        this.dummy.rotation.copy(item.rotation);
        this.dummy.scale.copy(item.scale);
        this.dummy.updateMatrix();
        this.instancedMesh.setMatrixAt(item.index, this.dummy.matrix);
        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }
}
