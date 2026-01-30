
// ... existing imports ...
import * as THREE from 'three';
import { GEOMETRY, MATERIALS, ModelFactory } from '../utils/assets';
import { Obstacle } from '../utils/physics';
import type { Enemy } from '../types/enemy';
import { EnemySpawner } from './enemies/EnemySpawner';
import { EnemyAI } from './enemies/EnemyAI';
import { soundManager } from '../utils/sound';

export type { Enemy };

export const EnemyManager = {
    // ... existing spawn methods ...
    spawn: (
        scene: THREE.Scene,
        playerPos: THREE.Vector3,
        forcedType?: string,
        forcedPos?: THREE.Vector3,
        bossSpawned: boolean = false,
        enemyCount: number = 0
    ) => {
        return EnemySpawner.spawn(scene, playerPos, forcedType, forcedPos, bossSpawned, enemyCount);
    },

    spawnBoss: (scene: THREE.Scene, pos: { x: number, z: number }, bossData: any) => {
        return EnemySpawner.spawnBoss(scene, pos, bossData);
    },

    createCorpse: (enemy: Enemy): THREE.Object3D => {
        return ModelFactory.createCorpse(enemy.mesh);
    },

    createAshPile: (enemy: Enemy): THREE.Object3D => {
        const ash = new THREE.Mesh(GEOMETRY.ashPile, MATERIALS.ash);
        ash.position.copy(enemy.mesh.position);
        ash.position.y = 0.2;
        const baseScale = enemy.originalScale || 1.0;
        ash.scale.set((1 + Math.random() * 0.5) * baseScale, 1 * baseScale, (1 + Math.random() * 0.5) * baseScale);
        return ash;
    },

    explodeEnemy: (
        enemy: Enemy,
        forceVec: THREE.Vector3,
        scene: THREE.Scene,
        particleList: any[]
    ) => {
        scene.remove(enemy.mesh);
        enemy.deathState = 'dead';
        enemy.dead = true;
        enemy.mesh.userData.exploded = true;

        const scale = enemy.originalScale || 1.0;

        for (let i = 0; i < 6; i++) {
            const w = 0.2 + Math.random() * 0.2;
            const h = 0.3 + Math.random() * 0.3;
            const d = 0.2 + Math.random() * 0.2;
            const geo = new THREE.BoxGeometry(w, h, d);
            const colorVar = Math.random() > 0.5 ? 0x8a0303 : 0x550000;
            const mat = new THREE.MeshStandardMaterial({ color: colorVar, roughness: 0.3, metalness: 0.1 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.scale.setScalar(scale);

            mesh.position.copy(enemy.mesh.position);
            mesh.position.x += (Math.random() - 0.5) * 0.5 * scale;
            mesh.position.y += (0.5 + Math.random() * 1.0) * scale;
            mesh.position.z += (Math.random() - 0.5) * 0.5 * scale;
            mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

            scene.add(mesh);

            const limbVel = forceVec.clone().multiplyScalar(0.4 + Math.random() * 0.6);
            limbVel.x += (Math.random() - 0.5) * 6;
            limbVel.z += (Math.random() - 0.5) * 6;
            limbVel.y += 3 + Math.random() * 4;

            particleList.push({ mesh, vel: limbVel, life: 300, maxLife: 300, type: 'limb', rotVel: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(8) });
        }
    },

    generateBossDebris: (enemy: Enemy, count: number) => {
        const chunks = [];
        const pos = enemy.mesh.position.clone();
        for (let i = 0; i < count; i++) {
            const size = 0.5 + Math.random() * 0.8;
            const geo = GEOMETRY.gore;
            const mat = new THREE.MeshStandardMaterial({ color: Math.random() > 0.5 ? enemy.color : 0x660000 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.scale.setScalar(size);
            mesh.position.copy(pos);
            mesh.position.y += 2 + Math.random() * 3;
            mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            const angle = Math.random() * Math.PI * 2;
            const force = 5 + Math.random() * 10;
            const upForce = 5 + Math.random() * 10;
            const vel = new THREE.Vector3(Math.cos(angle) * force, upForce, Math.sin(angle) * force);
            chunks.push({ mesh, vel, rotVel: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5) });
        }
        return chunks;
    },

    update: (
        delta: number,
        now: number,
        playerPos: THREE.Vector3,
        enemies: Enemy[],
        obstacles: Obstacle[],
        onPlayerHit: (damage: number, type: string, enemyPos: THREE.Vector3) => void,
        spawnPart: (x: number, y: number, z: number, type: string, count: number, mesh?: any, vel?: any, color?: number) => void,
        spawnDecal: (x: number, z: number, scale: number, mat?: any) => void,
        onDamageDealt?: (amount: number, isBoss?: boolean) => void
    ) => {
        for (const e of enemies) {
            EnemyAI.updateEnemy(e, now, delta, playerPos, obstacles, {
                onPlayerHit,
                spawnPart,
                spawnDecal,
                onDamageDealt: (amt) => onDamageDealt ? onDamageDealt(amt, !!e.isBoss) : undefined
            });
        }
    },

    // New Cleanup Method
    cleanupDeadEnemies: (
        scene: THREE.Scene,
        enemies: Enemy[],
        now: number,
        state: any, // To update scores/stats
        callbacks: {
            spawnPart: (x: number, y: number, z: number, type: string, count: number, mesh?: any, vel?: any, color?: number) => void;
            spawnDecal: (x: number, z: number, scale: number, mat?: any) => void;
            spawnScrap: (x: number, z: number, amount: number) => void;
            spawnBubble: (text: string, duration: number) => void;
            t: (key: string) => string;
            gainXp: (amount: number) => void;
        }
    ) => {
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            if (e.dead) {
                const wasBoss = !!e.isBoss;

                // Boss Death Logic
                if (wasBoss) {
                    if (!state.bossDefeatedTime) {
                        state.bossDefeatedTime = now;
                        soundManager.playVictory();
                        callbacks.spawnBubble(callbacks.t('ui.threat_neutralized'), 4000);
                        callbacks.spawnScrap(e.mesh.position.x, e.mesh.position.z, 200);
                    }
                } else {
                    // Regular Enemy Scrap Drop Chance (10%)
                    // Reduced amount (5-15) compared to Boss/Chests
                    if (Math.random() < 0.10) {
                        const amount = 5 + Math.floor(Math.random() * 10);
                        callbacks.spawnScrap(e.mesh.position.x, e.mesh.position.z, amount);
                    }
                }

                // Visual Cleanup
                if (!e.mesh.userData.exploded) {
                    if (e.deathState === 'dying_ash') {
                        // Fire Death: Ash Pile, No Blood
                        scene.remove(e.mesh);
                        const ash = EnemyManager.createAshPile(e);
                        scene.add(ash);

                        // Embers effect
                        callbacks.spawnPart(e.mesh.position.x, 0.5, e.mesh.position.z, 'campfire_spark', 10, undefined, undefined, undefined);
                    } else {
                        // Standard Death: Corpse + Blood
                        scene.remove(e.mesh);
                        if (wasBoss) {
                            callbacks.spawnPart(e.mesh.position.x, 2, e.mesh.position.z, 'blood', 30, undefined, undefined, undefined);
                            const debris = EnemyManager.generateBossDebris(e, 15);
                            debris.forEach(d => {
                                scene.add(d.mesh);
                                state.particles.push({ mesh: d.mesh, vel: d.vel, life: 200, maxLife: 200, type: 'chunk', rotVel: d.rotVel });
                            });
                        } else {
                            // Normal corpse is created here
                            const corpse = EnemyManager.createCorpse(e);
                            corpse.position.copy(e.mesh.position);
                            // Ensure corpse is flat on ground (y=0.2 approx) and aligned
                            corpse.position.y = 0.2;
                            scene.add(corpse);

                            // Safeguard: Ensure blood pool exists if it wasn't spawned during falling animation
                            if (!e.bloodSpawned) {
                                const baseScale = e.originalScale || 1.0;
                                const poolSize = (1.5 + Math.random() * 2.5) * baseScale; // Scaled pool
                                callbacks.spawnDecal(e.mesh.position.x, e.mesh.position.z, poolSize, MATERIALS.bloodDecal);
                                // "Pouring out" effect
                                callbacks.spawnPart(
                                    e.mesh.position.x, 0.2, e.mesh.position.z,
                                    'blood',
                                    Math.floor(30 * baseScale),
                                    undefined,
                                    new THREE.Vector3(0, 0.2, 0)
                                );
                            }
                        }
                    }
                }

                // Stats & Rewards
                const kType = e.type || 'Unknown';
                state.killsByType[kType] = (state.killsByType[kType] || 0) + 1;
                state.killsInRun++;
                callbacks.gainXp(e.score);

                // Special Objective
                if (state.sectorState && state.sectorState.hordeTarget) {
                    state.sectorState.hordeKilled = (state.sectorState.hordeKilled || 0) + 1;
                }

                enemies.splice(i, 1);
            }
        }
    }
};
