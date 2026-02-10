import * as THREE from 'three';
import { GEOMETRY, MATERIALS, ModelFactory } from '../utils/assets';
import { Obstacle } from '../utils/physics';
import type { Enemy } from '../types/enemy';
import { EnemySpawner } from './enemies/EnemySpawner';
import { EnemyAI } from './enemies/EnemyAI';
import { soundManager } from '../utils/sound';
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
            corpseRenderer.addCorpse(enemy.mesh.position, enemy.mesh.quaternion, enemy.originalScale || 1.0, enemy.widthScale || 1.0);
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
            spawnPart: (x: number, y: number, z: number, type: string, count: number, mesh?: THREE.Mesh, vel?: THREE.Vector3, color?: number) => void;
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
        callbacks.spawnPart(pos.x, 1, pos.z, 'blood', 40);
        callbacks.spawnDecal(pos.x, pos.z, 2.5, MATERIALS.bloodDecal);

        // Create random chunks
        const limbCount = 4 + Math.floor(Math.random() * 3);
        const baseScale = enemy.originalScale || 1.0;

        for (let i = 0; i < limbCount; i++) {
            const mesh = new THREE.Mesh(
                GEOMETRY.gore,
                MATERIALS.gore
            );
            mesh.position.copy(pos);
            mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

            // INCREASED SCALE: Make chunks actually visible from top-down
            const limbScale = (0.4 + Math.random() * 0.3) * baseScale;
            mesh.scale.setScalar(limbScale);

            const vel = exitForce.clone();
            vel.x += (Math.random() - 0.5) * 10;
            vel.y += Math.random() * 5;
            vel.z += (Math.random() - 0.5) * 8;

            callbacks.spawnPart(pos.x, pos.y + 1, pos.z, 'chunk', 1, mesh, vel);
        }

        soundManager.playExplosion();
    },

    generateBossDebris: (enemy: Enemy, count: number) => {
        const debrisList: { mesh: THREE.Mesh, vel: THREE.Vector3 }[] = [];
        const pos = enemy.mesh.position;
        const scale = enemy.originalScale || 1.0;

        for (let i = 0; i < count; i++) {
            const size = (0.5 + Math.random() * 1.5) * scale;
            const geo = new THREE.BoxGeometry(size, size, size);
            const mat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(pos.x, 2, pos.z);
            mesh.position.x += (Math.random() - 0.5) * 4;
            mesh.position.z += (Math.random() - 0.5) * 4;

            const vel = new THREE.Vector3(
                (Math.random() - 0.5) * 15,
                10 + Math.random() * 15,
                (Math.random() - 0.5) * 15
            );

            debrisList.push({
                mesh,
                vel
            });
        }
        return debrisList;
    },

    update: (
        delta: number,
        now: number,
        playerPos: THREE.Vector3,
        enemies: Enemy[],
        obstacles: Obstacle[],
        noiseEvents: { pos: THREE.Vector3, radius: number, time: number }[],
        shakeIntensity: number,
        onPlayerHit: (damage: number, attacker: any, type: string) => void,
        spawnPart: (x: number, y: number, z: number, type: string, count: number, mesh?: any, vel?: any, color?: number) => void,
        spawnDecal: (x: number, z: number, scale: number, mat?: any) => void,
        spawnBubble: (text: string, duration: number) => void,
        onDamageDealt?: (amount: number, isBoss?: boolean) => void
    ) => {
        for (const e of enemies) {
            EnemyAI.updateEnemy(e, now, delta, playerPos, obstacles, noiseEvents, enemies, shakeIntensity, {
                onPlayerHit,
                spawnPart,
                spawnDecal,
                onDamageDealt: (amt) => onDamageDealt ? onDamageDealt(amt, !!e.isBoss) : undefined,
                playSound: (id) => soundManager.playEffect(id),
                spawnBubble
            });
        }

        if (zombieRenderer) {
            // Filter out bosses and exploded enemies so they aren't rendered
            zombieRenderer.sync(enemies.filter(e => !e.isBoss && !e.mesh.userData.exploded));
        }
    },

    cleanupDeadEnemies: (
        scene: THREE.Scene,
        enemies: Enemy[],
        now: number,
        state: any,
        callbacks: {
            spawnPart: (x: number, y: number, z: number, type: string, count: number, mesh?: any, vel?: any, color?: number) => void;
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
                    } else if (e.deathState === 'dying_ash' && age > 1000) {
                        scene.remove(e.mesh);
                        const ash = EnemyManager.createAshPile(e);
                        scene.add(ash);
                        callbacks.spawnPart(pos.x, 0.5, pos.z, 'campfire_spark', 10);
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

                    // Specific boss debris on removal if it didn't explode earlier
                    if (!wasExploded) {
                        callbacks.spawnPart(pos.x, 2, pos.z, 'blood', 40);
                        const debris = EnemyManager.generateBossDebris(e, 12);
                        debris.forEach(d => {
                            callbacks.spawnPart(d.mesh.position.x, d.mesh.position.y, d.mesh.position.z, 'chunk', 1, d.mesh, d.vel);
                        });
                    }
                }

                enemies.splice(i, 1);
            }
        }
    }
};
