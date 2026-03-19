import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { soundManager } from '../../utils/SoundManager';
import { FXSystem } from './FXSystem';
import { StatusEffectType, PlayerDeathState, DamageType } from '../../types/combat';
import { PerformanceMonitor } from './PerformanceMonitor';


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

        // 1. Reset Multipliers and tracking arrays
        state.multipliers.speed = 1.0;
        state.multipliers.reloadTime = 1.0;
        state.multipliers.fireRate = 1.0;
        state.multipliers.damageResist = 1.0;
        state.multipliers.range = 1.0;

        state.activePassives.length = 0;
        state.activeBuffs.length = 0;
        state.activeDebuffs.length = 0;
        state.isDisoriented = false;

        // 2. Passives buffs - from Family members
        for (let i = 0; i < family.length; i++) {
            const member = family[i];
            if (!member.following) continue;

            const name = member.name.toLowerCase();
            state.activePassives.push(name);

            // [VINTERDÖD RULE] Multipliers are now applied in their respective systems
            // We just set the passive state here.
            if (name === 'loke') state.multipliers.reloadTime *= 0.8;
            if (name === 'jordan') state.multipliers.range *= 1.15;
            if (name === 'esmeralda') state.multipliers.fireRate *= 1.2;
            if (name === 'nathalie') state.multipliers.damageResist *= 0.9;
        }

        // 3. Buffs and Debuffs from Status Effects
        const effects = state.statusEffects;
        for (const key in effects) {
            const type = key as StatusEffectType;
            const effect = effects[type];
            if (!effect || effect.duration <= 0) continue;

            effect.duration -= dt * 1000;

            // Categorize for HUD
            // Currently all effects in StatusEffectType are debuffs
            state.activeDebuffs.push(type);

            // [VINTERDÖD RULE] Logic below belongs in specific systems if it affects non-stats properties
            // But stats-multipliers (speed, fireRate) can stay here if they are central.
            // User requested "ONLY STATE DATA HERE", so we move specialized logic.
            switch (type) {
                case StatusEffectType.DISORIENTED:
                    state.isDisoriented = true;
                    session.engine.camera.shake(0.05);
                    break;
                case StatusEffectType.BLEEDING:
                    state.multipliers.speed *= 0.9;
                    break;
                case StatusEffectType.BURNING:
                    state.multipliers.speed *= 0.9;
                    break;
                case StatusEffectType.ELECTRIFIED:
                    state.multipliers.speed *= 0.9;
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
            if (now - (effect.lastTick || 0) >= 1000) {
                // Use intensity as damage per second
                const dmg = effect.intensity || 0;
                if (dmg > 0) {
                    const dmgType = type === StatusEffectType.BURNING ? DamageType.BURN :
                        (type === StatusEffectType.BLEEDING ? DamageType.BLEED : DamageType.PHYSICAL);

                    // Track source if available
                    const attacker = effect.sourceType ? { type: effect.sourceType, isBoss: effect.sourceType === 'Boss' } : null;

                    // Use the effect name (e.g., 'BLEEDING') for the breakdown to match user requirements
                    // but we can prepend the source attack if we want to be super detailed.
                    // For now, let's stick to the requested format: "Bleeding", "Burning" etc.
                    const attackName = type;

                    this.handlePlayerHit(session, dmg, attacker, dmgType, true, undefined, undefined, undefined, attackName);

                    // Visuals for status
                    if (type === StatusEffectType.BLEEDING) {
                        FXSystem.spawnPart(session.engine.scene, state.particles, this.playerGroup.position.x, 0.5 + Math.random(), this.playerGroup.position.z, 'blood', 3);
                    } else if (type === StatusEffectType.BURNING) {
                        FXSystem.spawnPart(session.engine.scene, state.particles, this.playerGroup.position.x, 0.5 + Math.random(), this.playerGroup.position.z, 'flame', 5);
                    } else if (type === StatusEffectType.ELECTRIFIED) {
                        FXSystem.spawnPart(session.engine.scene, state.particles, this.playerGroup.position.x, 1.0, this.playerGroup.position.z, 'spark', 4);
                    }
                }
                effect.lastTick = now;
            }
        }
    }

    public handlePlayerHit(
        session: GameSessionLogic,
        damage: number,
        attacker: any,
        type: string | DamageType,
        isDoT: boolean = false,
        effectType?: StatusEffectType,
        effectDuration?: number,
        effectDamage?: number,
        specificAttackType?: string // e.g. "BITTEN" or "HIT"
    ) {
        const state = session.state;
        const now = performance.now();

        if (state.isDead || state.sectorState?.isInvincible) return;

        // Apply Damage Resistance Multiplier (Nathalie)
        let actualDmg = damage * state.multipliers.damageResist;

        //if (PerformanceMonitor.getInstance().consoleLoggingEnabled) {
        console.log(`[PLAYER] HIT | HP: ${state.hp.toFixed(0)} | -${actualDmg.toFixed(1)} (${type}) from ${attacker?.type || 'Other'}${isDoT ? ' [DoT]' : ''} | Effect: ${effectType || 'None'} (${effectDuration || 0}ms)`);
        //}


        const isBite = type === DamageType.BITE;

        // I-frames logic (Skip for DoT damage)
        if (!isDoT) {
            if (!isBite && now < (state.invulnerableUntil || 0)) return;
            if (isBite && now < (state.lastBiteTime || 0) + 50) return;
        }

        // Apply health reduction
        state.hp -= actualDmg;

        // --- NEW: Centralized Damage Tracking ---
        const damageTracker = session.getSystem('damage_tracker_system') as any;
        const sourceName = attacker ? (attacker.isBoss ? 'Boss' : attacker.type) : 'Other';
        const attackName = specificAttackType || (type === DamageType.BITE ? 'BITE' : (isDoT ? type : 'HIT'));

        if (damageTracker) {
            damageTracker.recordIncomingDamage(session, actualDmg, sourceName, attackName, attacker?.isBoss);
        }

        // --- NEW: Register Status Effects ---
        if (effectType && effectDuration && effectDuration > 0) {
            if (!state.statusEffects[effectType]) {
                state.statusEffects[effectType] = { duration: 0, intensity: 0, lastTick: 0 };
            }

            // Set/Overwrite the duration and intensity (damage per second)
            state.statusEffects[effectType]!.duration = effectDuration;
            state.statusEffects[effectType]!.intensity = effectDamage || 0;

            // Track source for DoT
            if (attacker) {
                state.statusEffects[effectType]!.sourceType = attacker.isBoss ? 'Boss' : attacker.type;
                state.statusEffects[effectType]!.sourceAttack = specificAttackType || effectType;
            }

            // Initialization for ticks
            if (state.statusEffects[effectType]!.lastTick === 0) {
                state.statusEffects[effectType]!.lastTick = now;
            }
        }

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

        // Visuals
        if (state.particles && !isDoT) {
            let pType = 'blood_splat';
            let pCount = 5;
            let pScale = 3.0;
            let pColor: number | undefined = undefined;

            switch (type) {
                case DamageType.BITE:
                case DamageType.PHYSICAL:
                case DamageType.BLEED:
                    pType = 'blood_splat';
                    break;
                case DamageType.BURN:
                    pType = 'fire';
                    pCount = 8;
                    pScale = 2.0;
                    break;
                case DamageType.EXPLOSION:
                    pType = 'explosion';
                    pCount = 15;
                    pScale = 1.5;
                    break;
                case DamageType.DROWNING:
                    pType = 'splash';
                    break;
                case DamageType.FALL:
                    pType = 'impact_splat';
                    pColor = 0x888888;
                    pScale = 3.5;
                    break;
                case DamageType.ELECTRIC:
                    pType = 'spark';
                    pCount = 10;
                    pScale = 1.2;
                    break;
                default:
                    pType = 'blood_splat';
                    break;
            }

            FXSystem.spawnPart(
                session.engine.scene,
                state.particles,
                this.playerGroup.position.x,
                1.3,
                this.playerGroup.position.z,
                pType,
                pCount,
                undefined,
                undefined,
                pColor,
                pScale
            );
        }

        // Death check
        if (state.hp <= 0) {
            this.executePlayerDeath(session, attacker, type, attackName, now);
        }
    }

    private executePlayerDeath(session: GameSessionLogic, attacker: any, type: string | DamageType, attackName: string, now: number) {
        const state = session.state;
        state.isDead = true;
        state.deathStartTime = now;

        //if (PerformanceMonitor.getInstance().consoleLoggingEnabled) {
        console.log(`[PLAYER] DIED from ${type} | Attacker: ${attacker?.type || 'Other'}`);
        //}

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
            state.killedByEnemy = true;
        } else if (attacker) {
            state.killerName = this.t(`enemies.${attacker.type}.name`);
            state.killedByEnemy = true;
        } else if (type === DamageType.DROWNING) {
            state.killerName = this.t('ui.drowning');
            state.killedByEnemy = false;
        } else if (type === DamageType.FALL) {
            state.killerName = this.t('ui.falling');
            state.killedByEnemy = false;
        } else {
            state.killerName = this.t('ui.unknown_threat');
            state.killedByEnemy = false;
        }

        state.killerAttackName = attackName;

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