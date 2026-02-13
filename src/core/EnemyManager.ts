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

export const EnemyManager = {
    /**
     * Initierar renderare och rensar poolen.
     */
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

    /**
     * Spawna fiende med Object Pooling. 
     * Om en fiende återanvänds skrivs dess "DNA" över för att matcha den nya typen.
     */
    spawn: (scene: THREE.Scene, playerPos: THREE.Vector3, forcedType?: string, forcedPos?: THREE.Vector3, bossSpawned: boolean = false, enemyCount: number = 0): Enemy | null => {
        let enemy: Enemy | null = null;

        // Bestäm vilken typ som ska skapas (viktigt för pooling reset)
        const typeToSpawn = forcedType || EnemySpawner.determineType(enemyCount, bossSpawned);

        if (enemyPool.length > 0) {
            enemy = enemyPool.pop()!;
            // VIKTIGT: Vi skickar med typen för att nollställa stats (DNA)
            EnemyManager.resetEnemy(enemy, typeToSpawn, playerPos, forcedPos);
            if (!enemy.mesh.parent) scene.add(enemy.mesh);
        } else {
            enemy = EnemySpawner.spawn(scene, playerPos, typeToSpawn, forcedPos, bossSpawned, enemyCount);
        }

        if (enemy) {
            // InstancedMesh kräver att original-mesh är osynlig
            if (!enemy.isBoss) enemy.mesh.visible = false;
            else enemy.mesh.visible = true;
        }

        return enemy;
    },

    /**
     * Nollställer en fiende för återanvändning.
     * Återställer stats, skala, färg och tillstånd.
     */
    resetEnemy: (e: Enemy, newType: string, playerPos: THREE.Vector3, forcedPos?: THREE.Vector3) => {
        // 1. Applicera stats för den nya typen (Hastighet, HP, Skada, Färg)
        EnemySpawner.applyTypeStats(e, newType);

        // 2. Positionering
        if (forcedPos) {
            e.mesh.position.copy(forcedPos).add({ x: (Math.random() - 0.5) * 4, y: 0, z: (Math.random() - 0.5) * 4 } as any);
        } else {
            const angle = Math.random() * Math.PI * 2;
            const dist = 45 + Math.random() * 30;
            e.mesh.position.set(playerPos.x + Math.cos(angle) * dist, 0, playerPos.z + Math.sin(angle) * dist);
        }

        // 3. Logisk Reset
        e.dead = false;
        e.hp = e.maxHp;
        e.deathState = 'alive';
        e.velocity.set(0, 0, 0);
        e.knockbackVel.set(0, 0, 0);
        e.deathTimer = 0;
        e.bloodSpawned = false;
        e.lastDamageType = 'standard';

        // 4. Visuell Reset (Fixar osynliga/svarta zombies)
        const s = e.originalScale || 1.0;
        const w = e.widthScale || 1.0;
        e.mesh.scale.set(s * w, s, s * w);

        e.mesh.traverse((child: any) => {
            if (child.isMesh && child.material) {
                if (child.material.color) child.material.color.set(e.color || 0xffffff);
                if (child.material.opacity !== undefined) child.material.opacity = 1.0;
            }
        });

        // 5. Status Reset
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

        callbacks.spawnPart(pos.x, 1, pos.z, 'blood', 60);
        callbacks.spawnDecal(pos.x, pos.z, 3.0, MATERIALS.bloodDecal);

        const baseScale = enemy.originalScale || 1.0;
        for (let i = 0; i < 8; i++) {
            _v2.set(_v1.x + (Math.random() - 0.5) * 12, _v1.y + Math.random() * 6, _v1.z + (Math.random() - 0.5) * 10);
            callbacks.spawnPart(pos.x, pos.y + 1, pos.z, 'chunk', 1, undefined, _v2.clone(), enemy.color, baseScale * 0.8);
        }
        soundManager.playExplosion();
    },

    update: (delta: number, now: number, playerPos: THREE.Vector3, enemies: Enemy[], collisionGrid: SpatialGrid, noiseEvents: any[], shakeIntensity: number, onPlayerHit: any, spawnPart: any, spawnDecal: any, spawnBubble: any, onDamageDealt?: any) => {
        collisionGrid.updateEnemyGrid(enemies);
        _syncList.length = 0;

        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];

            EnemyAI.updateEnemy(e, now, delta, playerPos, collisionGrid, noiseEvents, enemies, shakeIntensity, false, {
                onPlayerHit, spawnPart, spawnDecal, spawnBubble,
                onDamageDealt: (amt: number) => onDamageDealt?.(amt, !!e.isBoss),
                playSound: (id: string) => soundManager.playEffect(id),
                onAshStart: (enemy: Enemy) => {
                    const scene = enemy.mesh.parent as THREE.Scene;
                    if (scene && !enemy.ashPile) {
                        const ash = EnemyManager.createAshPile(enemy);
                        ash.scale.setScalar(0.001);
                        scene.add(ash);
                        enemy.ashPile = ash;
                    }
                },
                getLastDamageType: () => e.lastDamageType || 'standard'
            });

            // --- SYNC RENDERER ---
            const s = e.deathState;
            // Rendera alla som inte är poolade ('dead') eller borttagna ('exploded')
            if (!e.isBoss && !e.mesh.userData.exploded && (s === 'alive' || s === 'shot' || s === 'burning' || s === 'electrified')) {
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

            // Vänta 2 sekunder på animationer innan slutgiltig borttagning
            if (age > 2000 && e.deathState !== 'dead') {
                e.deathState = 'dead';
            }

            if (e.deathState === 'dead' || e.mesh.userData.exploded) {
                const type = e.deathState;
                const wasExploded = e.mesh.userData.exploded;

                if (!wasExploded) {
                    switch (type) {
                        case 'exploded':
                        case 'gibbed':
                            EnemyManager.explodeEnemy(e, _up, callbacks);
                            break;
                        case 'burning':
                            scene.remove(e.mesh);
                            if (e.ashPile) e.ashPile.scale.setScalar(e.originalScale || 1.0);
                            break;
                        case 'shot':
                        case 'electrified':
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

                // Stats & Recycling
                const kType = e.type || 'Unknown';
                state.killsByType[kType] = (state.killsByType[kType] || 0) + 1;
                state.killsInRun++;
                callbacks.gainXp(e.score || 10);

                if (e.indicatorRing?.parent) e.indicatorRing.parent.remove(e.indicatorRing);

                // Släpp tillbaka till poolen
                const recycled = enemies.splice(i, 1)[0];
                recycled.dead = true;
                if (!recycled.isBoss) enemyPool.push(recycled);
            }
        }
    }
};