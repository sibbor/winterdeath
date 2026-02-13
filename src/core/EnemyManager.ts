import * as THREE from 'three';
import { GEOMETRY, MATERIALS, ModelFactory } from '../utils/assets';
import { Obstacle } from '../utils/physics';
import type { Enemy } from '../types/enemy';
import { EnemySpawner } from './enemies/EnemySpawner';
import { EnemyAI } from './enemies/EnemyAI';
import { soundManager } from '../utils/sound';
import { SpatialGrid } from './world/SpatialGrid';
import { ZombieRenderer } from './renderers/ZombieRenderer';
import { CorpseRenderer } from './renderers/CorpseRenderer';

export type { Enemy };

let zombieRenderer: ZombieRenderer | null = null;
let corpseRenderer: CorpseRenderer | null = null;

export const EnemyManager = {
    init: (scene: THREE.Scene) => {
        if (!zombieRenderer) {
            zombieRenderer = new ZombieRenderer(scene);
        } else {
            zombieRenderer.reAttach(scene);
        }

        if (!corpseRenderer) {
            corpseRenderer = new CorpseRenderer(scene);
        } else {
            corpseRenderer.reAttach(scene);
        }
    },

    cleanup: () => {
        zombieRenderer?.destroy();
        corpseRenderer?.destroy();
        zombieRenderer = null;
        corpseRenderer = null;
    },

    spawn: (
        scene: THREE.Scene,
        playerPos: THREE.Vector3,
        forcedType?: string,
        forcedPos?: THREE.Vector3,
        bossSpawned: boolean = false,
        enemyCount: number = 0
    ) => {
        const enemy = EnemySpawner.spawn(scene, playerPos, forcedType, forcedPos, bossSpawned, enemyCount);
        if (enemy && !enemy.isBoss) {
            enemy.mesh.visible = false;
        }
        return enemy;
    },

    spawnBoss: (scene: THREE.Scene, pos: { x: number, z: number }, bossData: any) => {
        const boss = EnemySpawner.spawnBoss(scene, pos, bossData);
        if (boss) boss.mesh.visible = true;
        return boss;
    },

    spawnHorde: (scene: THREE.Scene, startPos: THREE.Vector3, count: number, bossSpawned: boolean, currentCount: number) => {
        const horde = EnemySpawner.spawnHorde(scene, startPos, count, bossSpawned, currentCount);
        horde.forEach(e => { if (!e.isBoss) e.mesh.visible = false; });
        return horde;
    },

    createCorpse: (enemy: Enemy) => {
        if (corpseRenderer) {
            corpseRenderer.addCorpse(
                enemy.mesh.position,
                enemy.mesh.quaternion,
                enemy.originalScale || 1.0,
                enemy.widthScale || 1.0,
                enemy.color
            );
        }
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
        callbacks: {
            spawnPart: (x: number, y: number, z: number, type: string, count: number, mesh?: THREE.Mesh, vel?: THREE.Vector3, color?: number, scale?: number) => void;
            spawnDecal: (x: number, z: number, scale: number, material?: THREE.Material) => void;
        }
    ) => {
        if (enemy.mesh.userData.exploded) return;
        enemy.mesh.userData.exploded = true;
        enemy.dead = true;

        const scene = enemy.mesh.parent as THREE.Scene;
        if (scene) scene.remove(enemy.mesh);

        const pos = enemy.mesh.position;
        const upVec = new THREE.Vector3(0, 5, 0);
        const exitForce = forceVec.clone().multiplyScalar(0.5).add(upVec);

        // Spawn Blood
        callbacks.spawnPart(pos.x, 1, pos.z, 'blood', 60);
        callbacks.spawnDecal(pos.x, pos.z, 3.0, MATERIALS.bloodDecal);

        // Create random chunks using instanced particles (Massive performance gain)
        const baseScale = enemy.originalScale || 1.0;
        const widthScale = enemy.widthScale || 1.0;
        const bodyMass = baseScale * widthScale;
        const color = enemy.color || 0x660000;

        // Formula: Large enemies explode into many more objects
        const chunkCount = Math.max(5, Math.floor(bodyMass * 12));

        for (let i = 0; i < chunkCount; i++) {
            const vel = exitForce.clone();
            vel.x += (Math.random() - 0.5) * 12;
            vel.y += Math.random() * 6;
            vel.z += (Math.random() - 0.5) * 10;

            const chunkScale = (baseScale * 0.8) * (0.6 + Math.random() * 0.8);

            callbacks.spawnPart(pos.x, pos.y + 1, pos.z, 'chunk', 1, undefined, vel, color, chunkScale);
        }

        soundManager.playExplosion();
    },

    generateBossDebris: (enemy: Enemy, count: number, spawnPart: (x: number, y: number, z: number, type: string, count: number, mesh?: any, vel?: any, color?: number, scale?: number) => void) => {
        const pos = enemy.mesh.position;
        const scale = enemy.originalScale || 1.0;
        const color = enemy.color || 0x660000;

        for (let i = 0; i < count; i++) {
            const chunkScale = (scale * 3.0) / count * (0.8 + Math.random() * 0.4);
            const vel = new THREE.Vector3(
                (Math.random() - 0.5) * 15,
                10 + Math.random() * 15,
                (Math.random() - 0.5) * 15
            );

            // Directly spawn using instanced particles
            spawnPart(pos.x + (Math.random() - 0.5) * 4, 1.5, pos.z + (Math.random() - 0.5) * 4, 'chunk', 1, undefined, vel, color, chunkScale);
        }
    },

    update: (
        delta: number,
        now: number,
        playerPos: THREE.Vector3,
        enemies: Enemy[],
        collisionGrid: SpatialGrid,
        noiseEvents: { pos: THREE.Vector3, radius: number, time: number }[],
        shakeIntensity: number,
        onPlayerHit: (damage: number, attacker: any, type: string) => void,
        spawnPart: (x: number, y: number, z: number, type: string, count: number, mesh?: any, vel?: any, color?: number) => void,
        spawnDecal: (x: number, z: number, scale: number, mat?: any) => void,
        spawnBubble: (text: string, duration: number) => void,
        onDamageDealt?: (amount: number, isBoss?: boolean) => void
    ) => {
        for (const e of enemies) {
            EnemyAI.updateEnemy(e, now, delta, playerPos, collisionGrid, noiseEvents, enemies, shakeIntensity, {
                onPlayerHit,
                spawnPart,
                spawnDecal,
                onDamageDealt: (amt) => onDamageDealt ? onDamageDealt(amt, !!e.isBoss) : undefined,
                playSound: (id) => soundManager.playEffect(id),
                spawnBubble,
                onAshStart: (enemy) => {
                    const scene = enemy.mesh.parent as THREE.Scene;
                    if (scene && !enemy.ashPile) {
                        const ash = EnemyManager.createAshPile(enemy);
                        ash.scale.setScalar(0.001); // Start invisible
                        scene.add(ash);
                        enemy.ashPile = ash;
                    }
                }
            });
        }

        if (zombieRenderer) {
            // Filter out bosses, exploded enemies, and those in special death animations
            zombieRenderer.sync(enemies.filter(e =>
                !e.isBoss &&
                !e.mesh.userData.exploded &&
                e.deathState === 'alive'
            ));
        }
    },

    cleanupDeadEnemies: (
        scene: THREE.Scene,
        enemies: Enemy[],
        now: number,
        state: any,
        callbacks: {
            spawnPart: (x: number, y: number, z: number, type: string, count: number, mesh?: any, vel?: any, color?: number, scale?: number) => void;
            spawnDecal: (x: number, z: number, scale: number, mat?: any) => void;
            spawnScrap: (x: number, z: number, amount: number) => void;
            spawnBubble: (text: string, duration: number) => void;
            t: (key: string) => string;
            gainXp: (amount: number) => void;
            onBossKilled?: (id: number) => void;
        }
    ) => {
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            if (!e.dead) continue;

            if (!e.deathTimer) {
                e.deathTimer = now;
                if (!e.mesh.userData.exploded) {
                    if (e.type === 'RUNNER') soundManager.playRunnerDeath();
                    else if (e.type === 'TANK') soundManager.playTankDeath();
                    else soundManager.playWalkerDeath();
                }
            }

            const age = now - e.deathTimer;

            if (age > 500) {
                const pos = e.mesh.position.clone();
                const wasExploded = e.mesh.userData.exploded;

                if (!wasExploded) {
                    if (e.isBoss || e.type === 'BOMBER') {
                        const upForce = new THREE.Vector3(0, 5, 0);
                        EnemyManager.explodeEnemy(e, upForce, callbacks);
                    } else if (e.deathState === 'dying_ash') {
                        // Burning death: immediately spawn ash pile if not already growing
                        if (!e.ashPile) {
                            scene.remove(e.mesh);
                            const ash = EnemyManager.createAshPile(e);
                            scene.add(ash);
                            e.ashPile = ash;
                            callbacks.spawnPart(pos.x, 0.5, pos.z, 'campfire_spark', 15);
                        } else {
                            // Ensure it's fully grown and visible
                            scene.remove(e.mesh);
                            e.ashPile.scale.setScalar(e.originalScale || 1.0);
                            callbacks.spawnPart(pos.x, 0.5, pos.z, 'campfire_spark', 5);
                            callbacks.spawnPart(pos.x, 0.2, pos.z, 'smoke', 8); // Final smoke burst
                        }
                    } else if (age > 2000) {
                        scene.remove(e.mesh);
                        if (!e.isBoss) {
                            EnemyManager.createCorpse(e);
                        }
                        if (!e.bloodSpawned) {
                            const poolSize = (1.5 + Math.random() * 2.5) * (e.originalScale || 1.0);
                            callbacks.spawnDecal(pos.x, pos.z, poolSize, MATERIALS.bloodDecal);
                            e.bloodSpawned = true;
                        }
                    } else {
                        continue; // Keep waiting
                    }
                }

                // Finalize Rewards
                const kType = e.type || 'Unknown';
                state.killsByType[kType] = (state.killsByType[kType] || 0) + 1;
                state.killsInRun++;
                callbacks.gainXp(e.score || 10);

                if (state.sectorState && state.sectorState.hordeTarget) {
                    state.sectorState.hordeKilled = (state.sectorState.hordeKilled || 0) + 1;
                }

                if (e.isBoss && e.bossId !== undefined && callbacks.onBossKilled) {
                    state.bossDefeatedTime = now;
                    callbacks.onBossKilled(e.bossId);

                    // Restore Boss Scrap drop
                    callbacks.spawnScrap(pos.x, pos.z, 50);

                    // Specific boss debris on removal if it didn't explode earlier
                    if (!wasExploded) {
                        callbacks.spawnPart(pos.x, 2, pos.z, 'blood', 40);
                        EnemyManager.generateBossDebris(e, 15, callbacks.spawnPart);
                    }
                }

                // Cleanup Bomber Ring if any
                if (e.indicatorRing) {
                    const scene = e.indicatorRing.parent;
                    if (scene) scene.remove(e.indicatorRing);
                    e.indicatorRing = undefined;
                }

                enemies.splice(i, 1);
            }
        }
    }
};
