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

    // Spawn Queue to avoid CPU spikes
    private spawnQueue: { x: number, z: number }[] = [];
    private lastSoundTime = 0;

    constructor(private playerGroup: THREE.Group, scene: THREE.Scene) {
        // ... (existing constructor logic)
        this.instancedMesh = new THREE.InstancedMesh(GEOMETRY.scrap, MATERIALS.scrap, WorldLootSystem.MAX_SCRAP);
        this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.instancedMesh.count = 0;
        this.instancedMesh.frustumCulled = false;
        scene.add(this.instancedMesh);

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
                active: false
            });
            this.dummy.position.set(0, -100, 0);
            this.dummy.updateMatrix();
            this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
        }
        WorldLootSystem.instance = this;
    }

    private static instance: WorldLootSystem | null = null;

    update(session: GameSessionLogic, dt: number, now: number) {
        const state = session.state;

        // Process Spawn Queue (Max 3 per frame to keep it smooth)
        const batchSize = Math.min(this.spawnQueue.length, 3);
        if (batchSize > 0) {
            for (let i = 0; i < batchSize; i++) {
                const sps = this.spawnQueue.shift();
                if (sps) this.spawnSingle(sps.x, sps.z);
            }
        }

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
        this.instancedMesh.count = WorldLootSystem.MAX_SCRAP;

        for (const item of this.pool) {
            if (!item.active) continue;

            needsUpdate = true;

            // 1. Physics (Gravity & Bouncing)
            if (!item.magnetized) {
                if (!item.grounded) {
                    item.velocity.y -= 30 * delta;
                    item.position.x += item.velocity.x * delta;
                    item.position.y += item.velocity.y * delta;
                    item.position.z += item.velocity.z * delta;

                    if (item.position.y <= 0.3) {
                        item.position.y = 0.3;
                        item.velocity.y *= -0.5;
                        item.velocity.x *= 0.8;
                        item.velocity.z *= 0.8;

                        if (Math.abs(item.velocity.y) < 0.5) {
                            item.grounded = true;
                            item.velocity.set(0, 0, 0);
                        }
                    }
                }
                item.rotation.y += 1.0 * delta;
                item.rotation.z += 1.0 * delta;
            }

            // 2. Magnetism
            const distSq = item.position.distanceToSquared(playerPos);
            const magnetismDelay = 800;
            const canMagnetize = (now - item.spawnTime) > magnetismDelay;

            if (canMagnetize && distSq < magnetRange * magnetRange) {
                item.magnetized = true;
                item.grounded = false;
            }

            if (item.magnetized) {
                const dir = new THREE.Vector3().subVectors(playerPos, item.position).normalize();
                const speed = magnetSpeed * (1 + (10 / (distSq + 0.1)));
                item.position.add(dir.multiplyScalar(speed * delta));
                const scale = Math.max(0.1, item.scale.x - 2.0 * delta);
                item.scale.setScalar(scale);
            }

            // 3. Collection
            if (distSq < collectionRange) {
                collectedAmount += item.value;
                this.deactivateItem(item);

                // Throttle sound to avoid audio clipping/lag
                if (now - this.lastSoundTime > 50) {
                    soundManager.playLootingScrap();
                    this.lastSoundTime = now;
                }
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
        this.dummy.position.set(0, -100, 0);
        this.dummy.updateMatrix();
        this.instancedMesh.setMatrixAt(item.index, this.dummy.matrix);
        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    public static spawnScrapExplosion(
        _scene: THREE.Scene,
        _scrapItems: any[],
        x: number,
        z: number,
        amount: number
    ) {
        if (!WorldLootSystem.instance) return;
        const system = WorldLootSystem.instance;

        const count = Math.min(Math.ceil(amount / 10), 20);

        // Add to queue for staggered spawning in update()
        for (let i = 0; i < count; i++) {
            system.spawnQueue.push({ x, z });
        }
    }

    private spawnSingle(x: number, z: number) {
        const item = this.pool.find(p => !p.active);
        if (!item) return;

        const angle = Math.random() * Math.PI * 2;
        const force = 0.2 + Math.random() * 0.3;

        item.active = true;
        item.position.set(x, 1, z);
        item.velocity.set(Math.cos(angle) * force * 10, 5 + Math.random() * 5, Math.sin(angle) * force * 10);
        item.rotation.set(0, Math.random() * Math.PI, 0);
        item.scale.set(1, 1, 1);
        item.value = 10 + Math.floor(Math.random() * 10);
        item.grounded = false;
        item.magnetized = false;
        item.life = 60.0;
        item.spawnTime = performance.now();

        this.dummy.position.copy(item.position);
        this.dummy.rotation.copy(item.rotation);
        this.dummy.scale.copy(item.scale);
        this.dummy.updateMatrix();
        this.instancedMesh.setMatrixAt(item.index, this.dummy.matrix);
        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }
}
