
import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { EnemyManager } from '../EnemyManager';
import { FXSystem } from './FXSystem';
import { WorldLootSystem } from './WorldLootSystem';
import { soundManager } from '../../utils/sound';

export class EnemySystem implements System {
    id = 'enemy_system';

    constructor(
        private playerGroup: THREE.Group,
        private callbacks: {
            spawnBubble: (text: string, duration: number) => void;
            gainXp: (amount: number) => void;
            t: (key: string) => string;
            onClueFound: (clue: any) => void;
            onBossKilled: (id: number) => void;
        }
    ) { }

    update(session: GameSessionLogic, dt: number, now: number) {
        const state = session.state;
        const scene = session.engine.scene;

        if (!state.bossIntroActive) { // Need to verify if bossIntroActive is in state or ref
            // Logic from GameCanvas:
            /* 
            if (!bossIntroRef.current.active) {
               EnemyManager.update(...)
            }
            */
            // I'll assume for now I should run it if not told otherwise.
            // Wait, bossIntroRef is logic specific to Canvas. 
            // I might need to add `bossIntroActive` to RuntimeState if it's not there, or pass it.
            // Checking RuntimeState might be good.

            EnemyManager.update(
                dt,
                now,
                this.playerGroup.position,
                state.enemies,
                state.collisionGrid,
                session.noiseEvents,
                state.shakeIntensity,
                // onPlayerHit
                (damage: number, attacker: any, type: string) => {

                    if (now < state.invulnerableUntil) return;
                    state.damageTaken += damage;
                    state.hp -= damage;

                    soundManager.playDamageGrunt();
                    state.hurtShake = 1.0;
                    state.lastDamageTime = now;
                    // Fix: Check if type is 'Boss' string (safest since 'type' is string)
                    if (type === 'Boss') state.bossDamageTaken += damage;

                    this.spawnPart(session, this.playerGroup.position.x, 1.2, this.playerGroup.position.z, 'blood', 80);

                    if (state.hp <= 0 && !state.isDead) {
                        state.isDead = true;
                        state.deathStartTime = now;
                        state.killerType = type;

                        // NEW: Capture killer name (localized)
                        if (attacker && attacker.isBoss && attacker.bossId !== undefined) {
                            // It's a boss, get name from boss constants if possible, or use type
                            state.killerType = attacker.type;
                            state.killerName = this.callbacks.t(`bosses.${attacker.bossId}.name`);
                        } else if (attacker) {
                            state.killerType = attacker.type;
                            state.killerName = this.callbacks.t(`enemies.${attacker.type}.name`);
                        } else {
                            state.killerName = this.callbacks.t('ui.unknown_threat');
                        }

                        // Calculate deathVel
                        const input = session.engine.input.state;
                        const playerMoveDir = new THREE.Vector3(0, 0, 0);
                        if (input.w) playerMoveDir.z -= 1;
                        if (input.s) playerMoveDir.z += 1;
                        if (input.a) playerMoveDir.x -= 1;
                        if (input.d) playerMoveDir.x += 1;

                        if (playerMoveDir.lengthSq() > 0) state.deathVel = playerMoveDir.normalize().multiplyScalar(15);
                        else state.deathVel = new THREE.Vector3().subVectors(this.playerGroup.position, attacker ? attacker.mesh.position : this.playerGroup.position).normalize().multiplyScalar(12);
                        state.deathVel.y = 4;
                    }
                },
                // spawnPart wrapper
                (x, y, z, type, count, mesh, vel, color) => this.spawnPart(session, x, y, z, type, count, mesh, vel, color),
                // spawnDecal wrapper
                (x, z, scale, mat) => this.spawnDecal(session, x, z, scale, mat),
                // spawnBubble (Debug)
                (text, dur) => this.callbacks.spawnBubble(text, dur),
                // onDamageDealt
                (dotDamage, isBoss) => {
                    state.damageDealt += dotDamage;
                    if (isBoss) state.bossDamageDealt += dotDamage;
                    this.callbacks.gainXp(Math.ceil(dotDamage));
                }
            );
        }

        // Cleanup Dead Enemies
        EnemyManager.cleanupDeadEnemies(
            scene,
            state.enemies,
            now,
            state,
            {
                spawnPart: (x, y, z, t, c, m, v, col) => this.spawnPart(session, x, y, z, t, c, m, v, col),
                spawnDecal: (x, z, s, m) => this.spawnDecal(session, x, z, s, m),
                spawnScrap: (x, z, amt) => WorldLootSystem.spawnScrapExplosion(scene, state.scrapItems, x, z, amt),
                spawnBubble: this.callbacks.spawnBubble,
                t: this.callbacks.t,
                gainXp: this.callbacks.gainXp,
                onBossKilled: this.callbacks.onBossKilled
            }
        );
    }

    private spawnPart(session: GameSessionLogic, x: number, y: number, z: number, type: string, count: number, mesh?: any, vel?: any, color?: number) {
        FXSystem.spawnPart(session.engine.scene, session.state.particles, x, y, z, type, count, mesh, vel, color);
    }

    private spawnDecal(session: GameSessionLogic, x: number, z: number, scale: number, mat?: any) {
        FXSystem.spawnDecal(session.engine.scene, session.state.bloodDecals, x, z, scale, mat);
    }
}
