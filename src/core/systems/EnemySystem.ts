import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { EnemyManager } from '../EnemyManager';
import { FXSystem } from './FXSystem';
import { WorldLootSystem } from './WorldLootSystem';
import { soundManager } from '../../utils/sound';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// --- TYPE DEFINITIONS ---
interface Callbacks {
    spawnBubble: (text: string, duration: number) => void;
    gainXp: (amount: number) => void;
    t: (key: string) => string;
    onBossKilled: (id: number) => void;
}

export class EnemySystem implements System {
    id = 'enemy_system';

    private updateCallbacks: any = null;
    private cleanupCallbacks: any = null;

    constructor(
        private playerGroup: THREE.Group,
        private callbacks: Callbacks
    ) { }

    init(session: GameSessionLogic) {
        const state = session.state;
        const scene = session.engine.scene;

        this.updateCallbacks = {
            onPlayerHit: (damage: number, attacker: any, type: string) => this.handlePlayerHit(session, damage, attacker, type),
            spawnPart: (x: number, y: number, z: number, t: string, c: number, m?: THREE.Object3D, v?: THREE.Vector3, col?: number, s?: number) => this.spawnPart(session, x, y, z, t, c, m, v, col, s),
            spawnDecal: (x: number, z: number, s: number, mat: THREE.Material, type?: string) => this.spawnDecal(session, x, z, s, mat, type),
            spawnBubble: (text: string, dur: number) => this.callbacks.spawnBubble(text, dur),
            onDamageDealt: (dotDamage: number, e: any) => {
                state.damageDealt += dotDamage;
                if (e.isBoss) state.bossDamageDealt += dotDamage;
                this.callbacks.gainXp(Math.ceil(dotDamage));
            }
        };

        this.cleanupCallbacks = {
            spawnPart: (x: number, y: number, z: number, t: string, c: number, m?: THREE.Object3D, v?: THREE.Vector3, col?: number, s?: number) => this.spawnPart(session, x, y, z, t, c, m, v, col, s),
            spawnDecal: (x: number, z: number, s: number, mat: THREE.Material, type?: string) => this.spawnDecal(session, x, z, s, mat, type),
            spawnScrap: (x: number, z: number, amt: number) => WorldLootSystem.spawnScrapExplosion(scene, state.scrapItems, x, z, amt),
            spawnBubble: this.callbacks.spawnBubble,
            t: this.callbacks.t,
            gainXp: this.callbacks.gainXp,
            onBossKilled: this.callbacks.onBossKilled,
            // Register drowned enemy body as a floating prop in the nearest water body
            registerFloatingCorpse: (mesh: THREE.Object3D, pos: THREE.Vector3) => {
                const water = session.engine.water;
                if (!water || water.waterBodies.length === 0) {
                    scene.add(mesh);
                    return;
                }
                // Find nearest water body
                let nearest = water.waterBodies[0];
                let bestDistSq = Infinity;
                for (let i = 0; i < water.waterBodies.length; i++) {
                    const b = water.waterBodies[i];
                    const dx = pos.x - b.surface.bounds.x;
                    const dz = pos.z - b.surface.bounds.z;
                    const dSq = dx * dx + dz * dz;
                    if (dSq < bestDistSq) { bestDistSq = dSq; nearest = b; }
                }
                scene.add(mesh);
                nearest.registerFloatingProp(mesh);
            }
        };
    }

    update(session: GameSessionLogic, dt: number, now: number) {
        const state = session.state;
        const scene = session.engine.scene;

        if (!this.updateCallbacks) this.init(session);

        if (!state.bossIntroActive) {
            EnemyManager.update(
                dt,
                now,
                this.playerGroup.position,
                state.enemies,
                state.collisionGrid,
                session.noiseEvents,
                state.cameraShake,
                state.isDead,
                this.updateCallbacks.onPlayerHit,
                this.updateCallbacks.spawnPart,
                this.updateCallbacks.spawnDecal,
                this.updateCallbacks.spawnBubble,
                this.updateCallbacks.onDamageDealt,
                session.engine.water
            );
        }

        EnemyManager.cleanupDeadEnemies(
            scene,
            state.enemies,
            now,
            state,
            this.cleanupCallbacks,
            dt
        );
    }

    public handlePlayerHit(session: GameSessionLogic, damage: number, attacker: any, type: string) {
        const state = session.state;
        const now = performance.now();

        if (state.isDead || state.sectorState.isInvincible) return;

        const isBite = type === 'BITING';

        // Om det är en stor krock/explosion gäller vanliga I-frames (ex 400ms)
        if (!isBite && now < (state.invulnerableUntil || 0)) return;

        // Om det är ett bett, sänker vi skyddet till 50ms! 
        // Detta gör att upp till 20 zombies KAN bita dig på en sekund om du blir helt omringad.
        if (isBite && now < (state.lastBiteTime || 0) + 50) return;

        state.damageTaken += damage;
        state.hp -= damage;

        if (isBite) {
            state.lastBiteTime = now;
        } else {
            state.invulnerableUntil = now + 400;
        }

        soundManager.playDamageGrunt();
        state.hurtShake = 1.0;
        state.lastDamageTime = now;

        if (type === 'Boss') state.bossDamageTaken += damage;

        this.spawnPart(session, this.playerGroup.position.x, 1.2, this.playerGroup.position.z, 'blood', 80);

        if (state.hp <= 0) {
            this.executePlayerDeath(session, attacker, type, now);
        }
    }

    private executePlayerDeath(session: GameSessionLogic, attacker: any, type: string, now: number) {
        const state = session.state;
        state.isDead = true;
        state.deathStartTime = now;
        state.killerType = type;

        if (attacker && attacker.isBoss && attacker.bossId !== undefined) {
            state.killerType = type === 'BOMBER_EXPLOSION' ? type : attacker.type;
            state.killerName = this.callbacks.t(`bosses.${attacker.bossId}.name`);
        } else if (attacker) {
            state.killerType = type === 'BOMBER_EXPLOSION' ? type : attacker.type;
            state.killerName = this.callbacks.t(`enemies.${attacker.type}.name`);
        } else {
            state.killerType = type;
            state.killerName = this.callbacks.t('ui.unknown_threat');
        }

        const input = session.engine.input.state;
        _v1.set(0, 0, 0);

        if (input.w) _v1.z -= 1;
        if (input.s) _v1.z += 1;
        if (input.a) _v1.x -= 1;
        if (input.d) _v1.x += 1;

        if (_v1.lengthSq() > 0) {
            state.deathVel.copy(_v1).normalize().multiplyScalar(15);
        } else {
            if (attacker && attacker.mesh) {
                _v2.copy(attacker.mesh.position);
                state.deathVel.subVectors(this.playerGroup.position, _v2).normalize().multiplyScalar(12);
            } else {
                state.deathVel.set(0, 0, 12);
            }
        }

        state.deathVel.y = 4;
    }

    private spawnPart(session: GameSessionLogic, x: number, y: number, z: number, type: string, count: number, mesh?: THREE.Object3D, vel?: THREE.Vector3, color?: number, scale?: number) {
        if (!session.state.particles) return;
        FXSystem.spawnPart(session.engine.scene, session.state.particles, x, y, z, type, count, mesh, vel, color, scale);
    }

    private spawnDecal(session: GameSessionLogic, x: number, z: number, scale: number, mat?: THREE.Material, type?: string) {
        if (!session.state.bloodDecals) return;
        FXSystem.spawnDecal(session.engine.scene, session.state.bloodDecals, x, z, scale, mat, type);
    }

    cleanup(session: GameSessionLogic) {
        this.updateCallbacks = null;
        this.cleanupCallbacks = null;
    }
}