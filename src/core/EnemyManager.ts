import * as THREE from 'three';
import { GEOMETRY, MATERIALS } from '../utils/assets';
import type { Enemy } from '../types/enemy';
import { EnemySpawner } from './enemies/EnemySpawner';
import { EnemyAI } from './enemies/EnemyAI';
import { soundManager } from '../utils/sound';
import { SpatialGrid } from './world/SpatialGrid';
import { ZombieRenderer } from './renderers/ZombieRenderer';
import { CorpseRenderer } from './renderers/CorpseRenderer';

export type { Enemy };

// --- INTERNAL POOLING & SCRATCHPADS ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 5, 0);
const _syncList: Enemy[] = [];
const enemyPool: Enemy[] = [];

let zombieRenderer: ZombieRenderer | null = null;
let corpseRenderer: CorpseRenderer | null = null;

// --- REUSABLE UPDATE CALLBACKS ---
const _aiCallbacks = {
    onPlayerHit: null as any,
    spawnPart: null as any,
    spawnDecal: null as any,
    spawnBubble: null as any,
    onDamageDealt: null as any,
    playSound: (id: string) => soundManager.playEffect(id),
    onAshStart: (enemy: Enemy) => {
        const scene = enemy.mesh.parent as THREE.Scene;
        if (scene && !enemy.ashPile) {
            const ash = EnemyManager.createAshPile(enemy);
            ash.scale.setScalar(0.001);
            scene.add(ash);
            enemy.ashPile = ash;
        }
    }
};

export const EnemyManager = {
    init: (scene: THREE.Scene) => {
        if (!zombieRenderer) zombieRenderer = new ZombieRenderer(scene);
        else zombieRenderer.reAttach(scene);

        if (!corpseRenderer) corpseRenderer = new CorpseRenderer(scene);
        else corpseRenderer.reAttach(scene);

        enemyPool.length = 0;
    },

    cleanup: () => {
        zombieRenderer?.destroy();
        corpseRenderer?.destroy();
        zombieRenderer = null;
        corpseRenderer = null;
        enemyPool.length = 0;
    },

    spawn: (scene: THREE.Scene, playerPos: THREE.Vector3, forcedType?: string, forcedPos?: THREE.Vector3, bossSpawned: boolean = false, enemyCount: number = 0): Enemy | null => {
        let enemy: Enemy | null = null;
        const typeToSpawn = forcedType || EnemySpawner.determineType(enemyCount, bossSpawned);

        if (enemyPool.length > 0) {
            enemy = enemyPool.pop()!;
            EnemyManager.resetEnemy(enemy, typeToSpawn, playerPos, forcedPos);
            if (!enemy.mesh.parent) scene.add(enemy.mesh);
        } else {
            enemy = EnemySpawner.spawn(scene, playerPos, typeToSpawn, forcedPos, bossSpawned, enemyCount);
        }

        if (enemy) {
            if (!enemy.isBoss) enemy.mesh.visible = false;
            else enemy.mesh.visible = true;
        }

        return enemy;
    },

    resetEnemy: (e: Enemy, newType: string, playerPos: THREE.Vector3, forcedPos?: THREE.Vector3) => {
        EnemySpawner.applyTypeStats(e, newType);

        if (forcedPos) {
            _v1.set((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4);
            e.mesh.position.copy(forcedPos).add(_v1);
        } else {
            const angle = Math.random() * Math.PI * 2;
            const dist = 45 + Math.random() * 30;
            e.mesh.position.set(playerPos.x + Math.cos(angle) * dist, 0, playerPos.z + Math.sin(angle) * dist);
        }

        e.dead = false;
        e.hp = e.maxHp;
        e.deathState = 'alive';
        e.velocity.set(0, 0, 0);
        e.knockbackVel.set(0, 0, 0);
        e.deathTimer = 0;
        e.bloodSpawned = false;
        e.lastDamageType = 'standard';

        const s = e.originalScale || 1.0;
        const w = e.widthScale || 1.0;
        e.mesh.scale.set(s * w, s, s * w);

        e.mesh.traverse((child: any) => {
            if (child.isMesh && child.material) {
                if (child.material.color) child.material.color.set(e.color || 0xffffff);
                if (child.material.opacity !== undefined) child.material.opacity = 1.0;
            }
        });

        e.stunTimer = 0;
        e.blindTimer = 0;
        e.burnTimer = 0;
        e.isBurning = false;
        e.mesh.userData.exploded = false;
        e.mesh.userData.baseY = undefined;

        if (e.indicatorRing) e.indicatorRing.visible = false;
    },

    spawnBoss: (scene: THREE.Scene, pos: { x: number, z: number }, bossData: any) => {
        const boss = EnemySpawner.spawnBoss(scene, pos, bossData);
        if (boss) boss.mesh.visible = true;
        return boss;
    },

    spawnHorde: (scene: THREE.Scene, startPos: THREE.Vector3, count: number, bossSpawned: boolean, currentCount: number) => {
        const horde: Enemy[] = [];
        for (let i = 0; i < count; i++) {
            const enemy = EnemyManager.spawn(scene, startPos, undefined, startPos, bossSpawned, currentCount + i);
            if (enemy) horde.push(enemy);
        }
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
        const s = enemy.originalScale || 1.0;
        ash.scale.set((1 + Math.random() * 0.5) * s, 1 * s, (1 + Math.random() * 0.5) * s);
        return ash;
    },

    explodeEnemy: (enemy: Enemy, forceVec: THREE.Vector3, callbacks: any) => {
        if (enemy.mesh.userData.exploded) return;
        enemy.mesh.userData.exploded = true;

        const scene = enemy.mesh.parent as THREE.Scene;
        if (scene) scene.remove(enemy.mesh);

        const pos = enemy.mesh.position;
        _v1.copy(forceVec).multiplyScalar(0.5).add(_up);

        // [VINTERDÖD] Bossar exploderar i mycket fler bitar
        const isBoss = enemy.isBoss;
        const mult = isBoss ? 3 : 1;

        // [VINTERDÖD] Uppdaterad logik: 10 droppar, 1 stor pöl
        callbacks.spawnPart(pos.x, 1, pos.z, 'blood', 10 * mult);
        callbacks.spawnDecal(pos.x, pos.z, isBoss ? 6.0 : 3.0, MATERIALS.bloodDecal);

        const baseScale = enemy.originalScale || 1.0;

        // [VINTERDÖD] 5 chunks
        for (let i = 0; i < 5 * mult; i++) {
            _v2.set(_v1.x + (Math.random() - 0.5) * 12, _v1.y + Math.random() * 6, _v1.z + (Math.random() - 0.5) * 10);
            callbacks.spawnPart(pos.x, pos.y + 1, pos.z, 'chunk', 1, undefined, _v2.clone(), enemy.color, baseScale * (isBoss ? 1.5 : 0.8));
        }
        soundManager.playExplosion();
    },

    update: (delta: number, now: number, playerPos: THREE.Vector3, enemies: Enemy[], collisionGrid: SpatialGrid, noiseEvents: any[], shakeIntensity: number, onPlayerHit: any, spawnPart: any, spawnDecal: any, spawnBubble: any, onDamageDealt?: any) => {
        collisionGrid.updateEnemyGrid(enemies);
        _syncList.length = 0;

        _aiCallbacks.onPlayerHit = onPlayerHit;
        _aiCallbacks.spawnPart = spawnPart;
        _aiCallbacks.spawnDecal = spawnDecal;
        _aiCallbacks.spawnBubble = spawnBubble;
        _aiCallbacks.onDamageDealt = onDamageDealt;

        const len = enemies.length;
        for (let i = 0; i < len; i++) {
            const e = enemies[i];

            EnemyAI.updateEnemy(e, now, delta, playerPos, collisionGrid, noiseEvents, enemies, shakeIntensity, false, _aiCallbacks);

            const s = e.deathState;
            if (s === 'burning') {
                e.mesh.visible = true;
            }
            else if (!e.isBoss && !e.mesh.userData.exploded && (s === 'alive' || s === 'shot' || s === 'electrified')) {
                e.mesh.visible = false;
                _syncList.push(e);
            }
        }

        if (zombieRenderer) zombieRenderer.sync(_syncList);
    },

    cleanupDeadEnemies: (scene: THREE.Scene, enemies: Enemy[], now: number, state: any, callbacks: any) => {
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];

            if (e.deathState === 'alive') continue;

            if (!e.deathTimer) {
                e.deathTimer = now;
                if (!e.mesh.userData.exploded) {
                    if (e.type === 'RUNNER') soundManager.playRunnerDeath();
                    else if (e.type === 'TANK') soundManager.playTankDeath();
                    else soundManager.playWalkerDeath();
                }
            }

            const age = now - e.deathTimer;

            const isElectrified = e.deathState === 'electrified';
            const cleanupDelay = isElectrified ? 1000 : 2000;
            const shouldCleanup = (age > cleanupDelay) || (e.deathState === 'dead') || e.mesh.userData.exploded;

            if (shouldCleanup) {
                let cleanupType = e.deathState;
                if (cleanupType === 'dead') {
                    // [VINTERDÖD FIX] Bossar har inget lik ("corpse"), tvinga dem att sprängas så de inte bara försvinner!
                    if (e.isBoss || e.mesh.userData.exploded) cleanupType = 'exploded';
                    else if (e.mesh.userData.electrocuted) cleanupType = 'electrified';
                    else if (e.mesh.userData.gibbed) cleanupType = 'gibbed';
                    else if (e.mesh.userData.ashSpawned) cleanupType = 'burning';
                    else cleanupType = 'shot';
                }

                const wasExploded = e.mesh.userData.exploded;

                if (!wasExploded) {
                    switch (cleanupType) {
                        case 'exploded':
                            EnemyManager.explodeEnemy(e, _up, callbacks);
                            break;
                        case 'gibbed':
                            if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
                            break;
                        case 'burning':
                            if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
                            break;
                        case 'electrified':
                            scene.remove(e.mesh);
                            if (!e.isBoss) EnemyManager.createCorpse(e);
                            if (!e.bloodSpawned) {
                                callbacks.spawnDecal(e.mesh.position.x, e.mesh.position.z, (1.2 + Math.random() * 0.5) * (e.originalScale || 1.0), MATERIALS.scorchDecal);
                                e.bloodSpawned = true;
                            }
                            break;
                        case 'shot':
                        default:
                            scene.remove(e.mesh);
                            if (!e.isBoss) EnemyManager.createCorpse(e);
                            if (!e.bloodSpawned) {
                                callbacks.spawnDecal(e.mesh.position.x, e.mesh.position.z, (1.5 + Math.random() * 2.5) * (e.originalScale || 1.0), MATERIALS.bloodDecal);
                                e.bloodSpawned = true;
                            }
                            break;
                    }
                }

                const kType = e.type || 'Unknown';
                state.killsByType[kType] = (state.killsByType[kType] || 0) + 1;
                state.killsInRun++;
                callbacks.gainXp(e.score || 10);

                if (e.indicatorRing?.parent) e.indicatorRing.parent.remove(e.indicatorRing);

                const recycled = enemies.splice(i, 1)[0];
                recycled.dead = true;
                recycled.deathState = 'dead';
                if (!recycled.isBoss) enemyPool.push(recycled);
            }
        }
    }
};