import * as THREE from 'three';
import { System, SystemID } from './System';
import { GamePlaySounds } from '../utils/audio/AudioLib';
import { GEOMETRY, MATERIALS } from '../utils/assets';
import { PlayerStatID } from '../entities/player/PlayerTypes';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _tempQuat = new THREE.Quaternion();
const _m4 = new THREE.Matrix4();
const _hiddenMatrix = new THREE.Matrix4().makeTranslation(0, -1000, 0);

export interface ScrapItem {
    velocity: THREE.Vector3;
    value: number;
    grounded: boolean;
    magnetized: boolean;
    life: number;
    spawnTime: number;
    index: number;
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
    active: boolean;
    needsUpdate: boolean;
}

export class WorldLootSystem implements System {
    readonly systemId = SystemID.WORLD_LOOT;
    id = 'world_loot_system';
    enabled = true;
    persistent = true;
    isFixedStep = true;

    private static MAX_SCRAP = 300;
    private instancedMesh: THREE.InstancedMesh;

    // --- ZERO-GC DATA STRUCTURES ---
    private pool: ScrapItem[] = [];

    // Fast iteration lists using contiguous typed memory
    private activeIndices = new Uint16Array(WorldLootSystem.MAX_SCRAP);
    private activeCount = 0;

    private freeIndices = new Uint16Array(WorldLootSystem.MAX_SCRAP);
    private freeCount = 0;

    // Ring-buffer for spawn requests (Zero Object Allocation)
    private spawnQueueX = new Float32Array(512);
    private spawnQueueZ = new Float32Array(512);
    private spawnHead = 0;
    private spawnTail = 0;

    private lastSoundTime = 0;
    private static instance: WorldLootSystem | null = null;

    constructor(
        private playerGroup: THREE.Group,
        scene: THREE.Scene,
        private callbacks?: { gainScrap: (val: number) => void }
    ) {
        this.instancedMesh = new THREE.InstancedMesh(GEOMETRY.scrap, MATERIALS.scrap, WorldLootSystem.MAX_SCRAP);
        this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.instancedMesh.count = WorldLootSystem.MAX_SCRAP;
        this.instancedMesh.frustumCulled = false;
        scene.add(this.instancedMesh);

        // Pre-allocate the physical data objects
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

            // Push to free list
            this.freeIndices[this.freeCount++] = i;
            this.instancedMesh.setMatrixAt(i, _hiddenMatrix);
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true;
        WorldLootSystem.instance = this;
    }

    update(ctx: any, delta: number, simTime: number, renderTime: number) {
        // 1. Process pending spawns from ring buffer
        const pendingSpawns = this.spawnHead - this.spawnTail;
        if (pendingSpawns > 0) {
            const batchSize = Math.min(pendingSpawns, 10);
            for (let i = 0; i < batchSize; i++) {
                const idx = this.spawnTail % 512;
                this.spawnSingle(this.spawnQueueX[idx], this.spawnQueueZ[idx], simTime);
                this.spawnTail++;
            }

            // Reset pointers if empty to prevent integer wrap-around over time
            if (this.spawnHead === this.spawnTail) {
                this.spawnHead = 0;
                this.spawnTail = 0;
            }
        }

        // 2. Physics & Collection update
        const collected = this.updateLoot(this.playerGroup.position, delta, simTime);

        // 3. Callback execution
        if (collected > 0) {
            if (this.callbacks?.gainScrap) {
                this.callbacks.gainScrap(collected);
            } else {
                ctx.state.statsBuffer[PlayerStatID.SCRAP] += collected;
                ctx.state.statsBuffer[PlayerStatID.TOTAL_SCRAP_COLLECTED] += collected;
            }
        }
    }

    private updateLoot(playerPos: THREE.Vector3, delta: number, simTime: number): number {
        let collectedAmount = 0;
        let gpuNeedsUpdate = false;

        const collectionRangeSq = 4.0;
        const magnetRangeSq = 49.0;
        const magnetSpeed = 30.0;
        const magnetismDelay = 600;

        const px = playerPos.x;
        const py = playerPos.y;
        const pz = playerPos.z;

        // Iterate backwards to safely swap-and-pop active items
        for (let i = this.activeCount - 1; i >= 0; i--) {
            const poolIdx = this.activeIndices[i];
            const item = this.pool[poolIdx];

            // Inlined vector math (Huge V8 CPU cache win)
            const dx = px - item.position.x;
            const dy = py - item.position.y;
            const dz = pz - item.position.z;
            const distSq = dx * dx + dy * dy + dz * dz;

            const canMagnetize = (simTime - item.spawnTime) > magnetismDelay;

            // 1. State logic
            if (!item.magnetized && canMagnetize && distSq < magnetRangeSq) {
                item.magnetized = true;
                item.grounded = false;
                item.needsUpdate = true;
            }

            // 2. Magnetize (physics)
            if (item.magnetized) {
                const dist = Math.max(0.1, Math.sqrt(distSq));
                const pullStrength = 1.0 + (20.0 / (dist + 1.0));

                const speed = magnetSpeed * pullStrength * delta;
                const invDist = 1.0 / dist;

                item.position.x += dx * invDist * speed;
                item.position.y += dy * invDist * speed;
                item.position.z += dz * invDist * speed;

                item.rotation.y += 10.0 * delta;

                const ns = Math.max(0.4, item.scale.x - 1.5 * delta);
                item.scale.set(ns, ns, ns);
                item.needsUpdate = true;

            } else if (!item.grounded) {
                item.velocity.y -= 35 * delta;

                item.position.x += item.velocity.x * delta;
                item.position.y += item.velocity.y * delta;
                item.position.z += item.velocity.z * delta;

                if (item.position.y <= 0.3) {
                    item.position.y = 0.3;
                    item.velocity.y *= -0.4;
                    item.velocity.x *= 0.7;
                    item.velocity.z *= 0.7;

                    if (Math.abs(item.velocity.y) < 0.5) {
                        item.grounded = true;
                        item.velocity.set(0, 0, 0);
                    }
                }
                item.rotation.y += 2.0 * delta;
                item.needsUpdate = true;
            }

            // 3. Collection (VINTERDÖD FIX: 100ms delay to prevent instant collection on spawn)
            const canCollect = (simTime - item.spawnTime) > 100;

            if (canCollect && distSq < collectionRangeSq) {
                collectedAmount += item.value;
                this.deactivateItem(item, i);
                gpuNeedsUpdate = true;

                if (simTime - this.lastSoundTime > 40) {
                    GamePlaySounds.playLootScrap();
                    this.lastSoundTime = simTime;
                }
                continue;
            }

            // 4. Transform Matrix
            if (item.needsUpdate) {
                this.updateInstanceMatrix(item);
                item.needsUpdate = !item.grounded;
                gpuNeedsUpdate = true;
            }
        }

        if (gpuNeedsUpdate) {
            this.instancedMesh.instanceMatrix.needsUpdate = true;
        }

        return collectedAmount;
    }

    private updateInstanceMatrix(item: ScrapItem) {
        _tempQuat.setFromEuler(item.rotation);
        _m4.compose(item.position, _tempQuat, item.scale);
        this.instancedMesh.setMatrixAt(item.index, _m4);
    }

    private deactivateItem(item: ScrapItem, activeArrayIdx: number) {
        item.active = false;
        item.magnetized = false;
        item.grounded = false;
        item.needsUpdate = false;

        // Push to free list
        this.freeIndices[this.freeCount++] = item.index;

        // Hide mesh
        this.instancedMesh.setMatrixAt(item.index, _hiddenMatrix);

        // Swap-and-pop active index to maintain dense packing
        this.activeCount--;
        if (activeArrayIdx !== this.activeCount) {
            this.activeIndices[activeArrayIdx] = this.activeIndices[this.activeCount];
        }
    }

    public static spawnScrapExplosion(scene: THREE.Scene, x: number, z: number, amount: number) {
        if (!WorldLootSystem.instance) return;
        const sys = WorldLootSystem.instance;
        const count = Math.min(Math.ceil(amount / 5), 15);

        for (let i = 0; i < count; i++) {
            // Write to ring buffer safely preventing bounds overflow
            if (sys.spawnHead - sys.spawnTail < 512) {
                const idx = sys.spawnHead % 512;
                sys.spawnQueueX[idx] = x;
                sys.spawnQueueZ[idx] = z;
                sys.spawnHead++;
            }
        }
    }

    private spawnSingle(x: number, z: number, simTime: number) {
        if (this.freeCount === 0) return; // Prevent spawning if pool is fully exhausted

        // Get an unused item from the free list
        const poolIdx = this.freeIndices[--this.freeCount];
        const item = this.pool[poolIdx];

        const angle = Math.random() * Math.PI * 2;
        const horizontalForce = 4 + Math.random() * 6;

        item.active = true;
        item.needsUpdate = true;
        item.grounded = false;
        item.magnetized = false;
        item.spawnTime = simTime;
        item.value = 5 + Math.floor(Math.random() * 10);
        item.position.set(x, 1.5, z);
        item.scale.set(1.0, 1.0, 1.0);
        item.velocity.set(
            Math.cos(angle) * horizontalForce,
            6 + Math.random() * 6,
            Math.sin(angle) * horizontalForce
        );
        item.rotation.set(Math.random(), Math.random(), 0);

        this.updateInstanceMatrix(item);
        this.instancedMesh.instanceMatrix.needsUpdate = true;

        // Add to active iteration list
        this.activeIndices[this.activeCount++] = poolIdx;
    }

    public clear() {
        this.activeCount = 0;
        this.freeCount = 0;

        // Fully reset and hide everything
        for (let i = 0; i < WorldLootSystem.MAX_SCRAP; i++) {
            this.pool[i].active = false;
            this.freeIndices[this.freeCount++] = i;
            this.instancedMesh.setMatrixAt(i, _hiddenMatrix);
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true;

        this.spawnHead = 0;
        this.spawnTail = 0;
    }
}