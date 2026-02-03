import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { soundManager } from '../../utils/sound';
import { GEOMETRY, MATERIALS } from '../../utils/assets';

export interface ScrapItem {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    value: number;
    grounded: boolean;
    magnetized: boolean;
    life: number; // Despawn timer
    spawnTime: number; // For magnetism delay
}

export class WorldLootSystem implements System {
    id = 'world_loot';

    constructor(private playerGroup: THREE.Group) { }

    update(session: GameSessionLogic, dt: number, now: number) {
        const state = session.state;
        const scene = session.engine.scene;

        const collected = this.updateLoot(
            scene,
            state.scrapItems,
            this.playerGroup.position,
            dt,
            now
        );

        if (collected > 0) {
            state.collectedScrap += collected;
        }
    }

    private updateLoot(
        scene: THREE.Scene,
        scrapItems: ScrapItem[],
        playerPos: THREE.Vector3,
        delta: number,
        now: number
    ): number {
        let collectedAmount = 0;
        const collectionRange = 2.0;
        const magnetRange = 5.0;
        const magnetSpeed = 25.0;

        for (let i = scrapItems.length - 1; i >= 0; i--) {
            const item = scrapItems[i];

            // 1. Physics (Gravity & Bouncing)
            if (!item.magnetized) {
                if (!item.grounded) {
                    item.velocity.y -= 30 * delta; // Gravity
                    item.mesh.position.add(item.velocity.clone().multiplyScalar(delta));

                    // Ground Bounce
                    if (item.mesh.position.y <= 0.3) {
                        item.mesh.position.y = 0.3;
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
                item.mesh.rotation.y += 1.0 * delta;
                item.mesh.rotation.z += 1.0 * delta;
            }

            // 2. Magnetism (Attract to player)
            const distSq = item.mesh.position.distanceToSquared(playerPos);
            const magnetismDelay = 800; // ms to wait before magnetizing
            const canMagnetize = (now - item.spawnTime) > magnetismDelay;

            if (canMagnetize && distSq < magnetRange * magnetRange) {
                item.magnetized = true;
                item.grounded = false; // Lift off ground
            }

            if (item.magnetized) {
                const dir = new THREE.Vector3().subVectors(playerPos, item.mesh.position).normalize();
                // Accelerate towards player
                const speed = magnetSpeed * (1 + (10 / (distSq + 0.1))); // Faster as it gets closer
                item.mesh.position.add(dir.multiplyScalar(speed * delta));
                // Shrink as it gets absorbed
                const scale = Math.max(0.1, item.mesh.scale.x - 2.0 * delta);
                item.mesh.scale.setScalar(scale);
            }

            // 3. Collection
            if (distSq < collectionRange) { // Close enough to collect
                collectedAmount += item.value;
                scene.remove(item.mesh);
                scrapItems.splice(i, 1);
                // Play small click sound per item
                if (Math.random() > 0.5) soundManager.playUiHover();
                continue;
            }
        }

        return collectedAmount;
    }

    public static spawnScrapExplosion(
        scene: THREE.Scene,
        scrapItems: ScrapItem[],
        x: number,
        z: number,
        amount: number
    ) {
        const count = Math.min(Math.ceil(amount / 10), 20);

        // Spawn the first few immediately for instant feedback
        const immediateCount = Math.min(5, count);
        for (let i = 0; i < immediateCount; i++) {
            spawnSingleScrap(scene, scrapItems, x, z);
        }

        // Spread the rest across next few frames to avoid lag spike
        const remaining = count - immediateCount;
        for (let i = 0; i < remaining; i++) {
            setTimeout(() => {
                spawnSingleScrap(scene, scrapItems, x, z);
            }, i * 8); // 8ms between each spawn (spread over ~120ms)
        }
    }
}

function spawnSingleScrap(scene: THREE.Scene, scrapItems: ScrapItem[], x: number, z: number) {
    const s = new THREE.Mesh(GEOMETRY.scrap, MATERIALS.scrap);
    s.position.set(x, 1, z);
    scene.add(s);
    const angle = Math.random() * Math.PI * 2;
    const force = 0.2 + Math.random() * 0.3;

    scrapItems.push({
        mesh: s,
        value: 10 + Math.floor(Math.random() * 10),
        velocity: new THREE.Vector3(Math.cos(angle) * force * 10, 5 + Math.random() * 5, Math.sin(angle) * force * 10),
        grounded: false,
        magnetized: false,
        life: 60.0,
        spawnTime: performance.now()
    });
}
