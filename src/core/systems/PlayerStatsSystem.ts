import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { soundManager } from '../../utils/SoundManager';
import { FXSystem } from './FXSystem';
import { StatusEffectType, PlayerDeathState, DamageType } from '../../types/combat';
import { WeaponType } from '../../content/weapons';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class PlayerStatsSystem implements System {
    id = 'player_stats_system';

    constructor(
        private playerGroup: THREE.Group,
        private t: (key: string) => string,
        private activeFamilyMembers: { current: any[] }
    ) { }

    init(session: GameSessionLogic) {
        // Initialized at start
    }

    update(session: GameSessionLogic, dt: number, now: number) {
        if (session.state.isDead) return;

        this.updateBuffsAndDebuffs(session, dt, now);
        this.applyStatusTicks(session, dt, now);
    }

    private updateBuffsAndDebuffs(session: GameSessionLogic, dt: number, now: number) {
        const state = session.state;
        const family = this.activeFamilyMembers.current;

        // 1. Reset Multipliers to 1.0
        state.multipliers.speed = 1.0;
        state.multipliers.reloadTime = 1.0;
        state.multipliers.fireRate = 1.0;
        state.multipliers.damageResist = 1.0;
        state.multipliers.range = 1.0;

        // 2. Apply Family Buffs (Passives)
        for (let i = 0; i < family.length; i++) {
            const member = family[i];
            if (!member.following) continue;

            const name = member.name.toLowerCase();
            if (name === 'loke') state.multipliers.reloadTime *= 0.8;
            if (name === 'jordan') state.multipliers.range *= 1.15;
            if (name === 'esmeralda') state.multipliers.fireRate *= 1.2;
            if (name === 'nathalie') state.multipliers.damageResist *= 0.9;
        }

        // 3. Apply Status Effects
        const effects = state.statusEffects;
        for (const key in effects) {
            const type = key as StatusEffectType;
            const effect = effects[type];
            if (!effect || effect.duration <= 0) continue;

            effect.duration -= dt * 1000;

            switch (type) {
                case StatusEffectType.SLOWED:
                    state.multipliers.speed *= 0.5;
                    break;
                case StatusEffectType.FREEZING:
                    state.multipliers.reloadTime *= 1.25;
                    state.multipliers.fireRate *= 0.75;
                    break;
            }
        }
    }

    private applyStatusTicks(session: GameSessionLogic, dt: number, now: number) {
        const state = session.state;
        const effects = state.statusEffects;

        for (const key in effects) {
            const type = key as StatusEffectType;
            const effect = effects[type];
            if (!effect || effect.duration <= 0) continue;

            // Tick DoT every 1 second
            if (now - effect.lastTick >= 1000) {
                if (type === StatusEffectType.BLEEDING || type === StatusEffectType.BURNING) {
                    const dmg = type === StatusEffectType.BURNING ? 10 : effect.intensity;
                    const dmgType = type === StatusEffectType.BURNING ? DamageType.BURN : DamageType.BLEED;
                    this.handlePlayerHit(session, dmg, null, dmgType, true); // Use silent hit to avoid I-frames if needed?

                    // Visuals for status
                    if (type === StatusEffectType.BLEEDING) {
                        FXSystem.spawnPart(session.engine.scene, state.particles, this.playerGroup.position.x, 0.5 + Math.random(), this.playerGroup.position.z, 'blood', 3);
                    } else if (type === StatusEffectType.BURNING) {
                        FXSystem.spawnPart(session.engine.scene, state.particles, this.playerGroup.position.x, 0.5 + Math.random(), this.playerGroup.position.z, 'flame', 5);
                    }
                }
                effect.lastTick = now;
            }
        }
    }

    public handlePlayerHit(session: GameSessionLogic, damage: number, attacker: any, type: string | DamageType, isDoT: boolean = false) {
        const state = session.state;
        const now = performance.now();

        if (state.isDead || state.sectorState?.isInvincible) return;

        // Apply Damage Resistance Multiplier (Nathalie)
        let actualDmg = damage * state.multipliers.damageResist;

        const isBite = type === DamageType.BITE;

        // I-frames logic (Skip for DoT damage)
        if (!isDoT) {
            if (!isBite && now < (state.invulnerableUntil || 0)) return;
            if (isBite && now < (state.lastBiteTime || 0) + 50) return;
        }

        // Apply health reduction
        state.damageTaken += actualDmg;
        state.hp -= actualDmg;

        if (!isDoT) {
            if (isBite) {
                state.lastBiteTime = now;
            } else {
                state.invulnerableUntil = now + 400;
            }
            soundManager.playDamageGrunt();
            state.hurtShake = 1.0;
        }

        state.lastDamageTime = now;
        if (type === 'Boss') state.bossDamageTaken += actualDmg;

        // Visuals
        if (state.particles && !isDoT) {
            FXSystem.spawnPart(session.engine.scene, state.particles, this.playerGroup.position.x, 1.2, this.playerGroup.position.z, 'splash', 5);
        }

        // Death check
        if (state.hp <= 0) {
            this.executePlayerDeath(session, attacker, type, now);
        }
    }

    private executePlayerDeath(session: GameSessionLogic, attacker: any, type: string | DamageType, now: number) {
        const state = session.state;
        state.isDead = true;
        state.deathStartTime = now;

        console.log("[PlayerStatsSystem] Player died from " + type + ", attacker:", attacker);

        // Setup killer name for UI
        state.killerType = type as string;

        // Determine Death State for Visuals
        state.playerDeathState = PlayerDeathState.NORMAL;

        // Use DamageType enum for clean comparisons
        if (type === DamageType.EXPLOSION) {
            state.playerDeathState = PlayerDeathState.GIBBED;
        } else if (type === DamageType.BURN) {
            state.playerDeathState = PlayerDeathState.BURNED;
        } else if (type === DamageType.DROWNING) {
            state.playerDeathState = PlayerDeathState.DROWNED;
        }

        if (attacker && attacker.isBoss && attacker.bossId !== undefined) {
            state.killerName = this.t(`bosses.${attacker.bossId}.name`);
        } else if (attacker) {
            state.killerName = this.t(`enemies.${attacker.type}.name`);
        } else if (type === DamageType.DROWNING) {
            state.killerName = this.t('ui.drowning');
        } else if (type === DamageType.FALL) {
            state.killerName = this.t('ui.falling');
        } else {
            state.killerName = this.t('ui.unknown_threat');
        }

        const input = session.engine.input.state;
        _v1.set(0, 0, 0);

        // Calculate death vector based on movement input
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

    cleanup(session: GameSessionLogic) {
    }
}