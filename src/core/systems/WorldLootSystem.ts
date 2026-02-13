import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { soundManager } from '../../utils/sound';
import { GEOMETRY, MATERIALS } from '../../utils/assets';

// --- PERFORMANCE SCRATCHPADS ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export interface ScrapItem {
    velocity: THREE.Vector3;
    value: number;
    grounded: boolean;
    magnetized: boolean;
    life: number;
    spawnTime: number;

    // Transform props
    index: number;
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
    active: boolean;
    needsUpdate: boolean; // Flag to skip GPU sync for static items
}

// Reusable object for the spawn queue to prevent GC spikes
interface SpawnRequest {
    x: number;
    z: number;
}

export class WorldLootSystem implements System {
    id = 'world_loot';

    private static MAX_SCRAP = 300; // Increased limit for heavy battles
    private instancedMesh: THREE.InstancedMesh;
    private dummy = new THREE.Object3D();

    private pool: ScrapItem[] = [];
    private freeIndices: number[] = [];

    private spawnQueue: SpawnRequest[] = [];
    private requestPool: SpawnRequest[] = []; // Pool for the queue objects themselves

    private lastSoundTime = 0;
    private static instance: WorldLootSystem | null = null;

    constructor(private playerGroup: THREE.Group, scene: THREE.Scene) {
        this.instancedMesh = new THREE.InstancedMesh(GEOMETRY.scrap, MATERIALS.scrap, WorldLootSystem.MAX_SCRAP);
        this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.instancedMesh.count = WorldLootSystem.MAX_SCRAP;
        this.instancedMesh.frustumCulled = false;
        scene.add(this.instancedMesh);

        // Pre-allocate the entire pool
        for (let i = 0; i < WorldLootSystem.MAX_SCRAP; i++) {
            this.pool.push({
                velocity: new THREE.Vector3(),
                value: 0,
                grounded: false,
                magnetized: false,
                life: 0,
                spawnTime: 0,
                index: i,
                position: new THREE.Vector3(0, -100, 0),
                rotation: new THREE.Euler(),
                scale: new THREE.Vector3(1, 1, 1),
                active: false,
                needsUpdate: false
            });
            this.freeIndices.push(i);

            // Hide initially
            this.updateInstanceMatrix(this.pool[i]);
        }

        // Pre-allocate some requests
        for (let i = 0; i < 50; i++) this.requestPool.push({ x: 0, z: 0 });

        WorldLootSystem.instance = this;
    }

    update(session: GameSessionLogic, dt: number, now: number) {
        // 1. Process Spawn Queue (Staggered)
        const batchSize = Math.min(this.spawnQueue.length, 10);
        for (let i = 0; i < batchSize; i++) {
            const req = this.spawnQueue.shift();
            if (req) {
                this.spawnSingle(req.x, req.z);
                this.requestPool.push(req); // Return request object to pool
            }
        }

        // 2. Update existing loot
        const collected = this.updateLoot(this.playerGroup.position, dt, now);
        if (collected > 0) {
            session.state.collectedScrap += collected;
        }
    }

    private updateLoot(playerPos: THREE.Vector3, delta: number, now: number): number {
        let collectedAmount = 0;
        let gpuNeedsUpdate = false;

        const collectionRangeSq = 4.0; // 2.0m radius
        const magnetRangeSq = 49.0;     // 7.0m radius (Increased for better feel)
        const magnetSpeed = 30.0;
        const magnetismDelay = 600;

        for (let i = 0; i < this.pool.length; i++) {
            const item = this.pool[i];
            if (!item.active) continue;

            const distSq = item.position.distanceToSquared(playerPos);
            const canMagnetize = (now - item.spawnTime) > magnetismDelay;

            // --- 1. STATE LOGIC ---
            if (!item.magnetized && canMagnetize && distSq < magnetRangeSq) {
                item.magnetized = true;
                item.grounded = false;
                item.needsUpdate = true;
            }

            // --- 2. PHYSICS & MOVEMENT ---
            if (item.magnetized) {
                // Fly toward player with increasing speed
                _v1.subVectors(playerPos, item.position).normalize();
                const pullStrength = 1.0 + (20.0 / (Math.sqrt(distSq) + 1.0));
                item.position.addScaledVector(_v1, magnetSpeed * pullStrength * delta);

                // Spin faster when magnetized
                item.rotation.y += 10.0 * delta;

                // Shrink slightly as it gets closer
                item.scale.setScalar(Math.max(0.4, item.scale.x - 1.5 * delta));
                item.needsUpdate = true;
            }
            else if (!item.grounded) {
                // Apply Gravity
                item.velocity.y -= 35 * delta;
                item.position.addScaledVector(item.velocity, delta);

                // Simple Ground Collision
                if (item.position.y <= 0.3) {
                    item.position.y = 0.3;
                    item.velocity.y *= -0.4; // Dampened bounce
                    item.velocity.x *= 0.7;
                    item.velocity.z *= 0.7;

                    if (Math.abs(item.velocity.y) < 0.5) {
                        item.grounded = true;
                        item.velocity.set(0, 0, 0);
                    }
                }
                // Idle spin
                item.rotation.y += 2.0 * delta;
                item.needsUpdate = true;
            }

            // --- 3. COLLECTION ---
            if (distSq < collectionRangeSq) {
                collectedAmount += item.value;
                this.deactivateItem(item);

                if (now - this.lastSoundTime > 40) {
                    soundManager.playUiPickup();
                    this.lastSoundTime = now;
                }
                gpuNeedsUpdate = true;
                continue;
            }

            // --- 4. GPU SYNC (Only if transform changed) ---
            if (item.needsUpdate) {
                this.updateInstanceMatrix(item);
                item.needsUpdate = !item.grounded; // Stop updating if grounded
                gpuNeedsUpdate = true;
            }
        }

        if (gpuNeedsUpdate) {
            this.instancedMesh.instanceMatrix.needsUpdate = true;
        }

        return collectedAmount;
    }

    private updateInstanceMatrix(item: ScrapItem) {
        this.dummy.position.copy(item.position);
        this.dummy.rotation.copy(item.rotation);
        this.dummy.scale.copy(item.scale);
        this.dummy.updateMatrix();
        this.instancedMesh.setMatrixAt(item.index, this.dummy.matrix);
    }

    private deactivateItem(item: ScrapItem) {
        item.active = false;
        item.magnetized = false;
        item.grounded = false;
        item.needsUpdate = false;
        this.freeIndices.push(item.index);

        // Move out of sight immediately
        this.dummy.position.set(0, -100, 0);
        this.dummy.updateMatrix();
        this.instancedMesh.setMatrixAt(item.index, this.dummy.matrix);
    }

    public static spawnScrapExplosion(scene: THREE.Scene, _legacy: any[], x: number, z: number, amount: number) {
        if (!WorldLootSystem.instance) return;
        const sys = WorldLootSystem.instance;

        // Visual count is a fraction of the actual value
        const count = Math.min(Math.ceil(amount / 5), 15);

        for (let i = 0; i < count; i++) {
            const req = sys.requestPool.pop() || { x: 0, z: 0 };
            req.x = x;
            req.z = z;
            sys.spawnQueue.push(req);
        }
    }

    private spawnSingle(x: number, z: number) {
        if (this.freeIndices.length === 0) return;

        const idx = this.freeIndices.pop()!;
        const item = this.pool[idx];

        const angle = Math.random() * Math.PI * 2;
        const horizontalForce = 4 + Math.random() * 6;

        item.active = true;
        item.needsUpdate = true;
        item.grounded = false;
        item.magnetized = false;
        item.spawnTime = performance.now();
        item.value = 5 + Math.floor(Math.random() * 10);

        item.position.set(x, 1.5, z);
        item.scale.setScalar(1.0);
        item.velocity.set(
            Math.cos(angle) * horizontalForce,
            6 + Math.random() * 6, // Vertical pop
            Math.sin(angle) * horizontalForce
        );
        item.rotation.set(Math.random(), Math.random(), 0);

        this.updateInstanceMatrix(item);
        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    public cleanup() {
        this.pool = [];
        this.spawnQueue = [];
        this.freeIndices = [];
        WorldLootSystem.instance = null;
    }
}