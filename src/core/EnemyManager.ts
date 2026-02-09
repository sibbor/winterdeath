
import * as THREE from 'three';
import { GEOMETRY, MATERIALS, ModelFactory } from '../utils/assets';
import { Obstacle } from '../utils/physics';
import type { Enemy } from '../types/enemy';
import { EnemySpawner } from './enemies/EnemySpawner';
import { EnemyAI } from './enemies/EnemyAI';
import { soundManager } from '../utils/sound';

export type { Enemy };

export const EnemyManager = {
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

    spawnHorde: (scene: THREE.Scene, startPos: THREE.Vector3, count: number, bossSpawned: boolean, currentCount: number) => {
        return EnemySpawner.spawnHorde(scene, startPos, count, bossSpawned, currentCount);
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
        callbacks: {
            spawnPart: (x: number, y: number, z: number, type: string, count: number, mesh?: THREE.Mesh, vel?: THREE.Vector3, color?: number) => void;
            spawnDecal: (x: number, z: number, scale: number, material?: THREE.Material) => void;
        }
    ) => {
        if (enemy.mesh.userData.exploded) return;
        enemy.mesh.userData.exploded = true;
        enemy.mesh.visible = false;
        enemy.dead = true;

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
            mesh.scale.setScalar((0.4 + Math.random() * 0.4) * baseScale);

            const vel = exitForce.clone();
            vel.x += (Math.random() - 0.5) * 6;
            vel.y += Math.random() * 4;
            vel.z += (Math.random() - 0.5) * 6;

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
        onPlayerHit: (damage: number, type: string, enemyPos: THREE.Vector3) => void,
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

            if (!e.deathTimer) e.deathTimer = now;
            const age = now - e.deathTimer;

            if (age > 500) { // 0.5s before cleanup (sink/fade)
                const wasBoss = e.type === 'Tank' || e.type === 'Bomber' || e.isBoss;

                if (!e.mesh.userData.exploded) {
                    if (e.deathState === 'dying_ash') {
                        scene.remove(e.mesh);
                        const ash = EnemyManager.createAshPile(e);
                        scene.add(ash);
                        callbacks.spawnPart(e.mesh.position.x, 0.5, e.mesh.position.z, 'campfire_spark', 10);
                    } else {
                        scene.remove(e.mesh);
                        if (wasBoss) {
                            callbacks.spawnPart(e.mesh.position.x, 2, e.mesh.position.z, 'blood', 40);
                            const debris = EnemyManager.generateBossDebris(e, 12);
                            debris.forEach(d => {
                                callbacks.spawnPart(d.mesh.position.x, d.mesh.position.y, d.mesh.position.z, 'chunk', 1, d.mesh, d.vel);
                            });
                        } else {
                            callbacks.spawnPart(e.mesh.position.x, 1, e.mesh.position.z, 'blood', 15);
                        }

                        const corpse = EnemyManager.createCorpse(e);
                        corpse.position.copy(e.mesh.position);
                        corpse.position.y = 0.2;
                        scene.add(corpse);

                        if (!e.bloodSpawned) {
                            const baseScale = e.originalScale || 1.0;
                            const poolSize = (1.5 + Math.random() * 2.5) * baseScale;
                            callbacks.spawnDecal(e.mesh.position.x, e.mesh.position.z, poolSize, MATERIALS.bloodDecal);
                            // Give particles random spread velocity for more "ooze"
                            const spreadVel = new THREE.Vector3(
                                (Math.random() - 0.5) * 1.5,
                                0.5 + Math.random() * 0.5,
                                (Math.random() - 0.5) * 1.5
                            );
                            callbacks.spawnPart(e.mesh.position.x, 0.4, e.mesh.position.z, 'blood', Math.floor(30 * baseScale), undefined, spreadVel);
                            e.bloodSpawned = true;
                        }
                    }
                }

                // Stats & Rewards
                const kType = e.type || 'Unknown';
                state.killsByType[kType] = (state.killsByType[kType] || 0) + 1;
                state.killsInRun++;
                callbacks.gainXp(e.score);

                if (state.sectorState && state.sectorState.hordeTarget) {
                    state.sectorState.hordeKilled = (state.sectorState.hordeKilled || 0) + 1;
                }

                enemies.splice(i, 1);
            }
        }
    }
};
