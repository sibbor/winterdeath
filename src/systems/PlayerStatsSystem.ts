import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { soundManager } from '../utils/audio/SoundManager';
import { FXSystem } from './FXSystem';
import { PlayerDeathState, DamageType, EnemyAttackType } from '../entities/player/CombatTypes';
import { PERKS, StatusEffectType, PerkCategory } from '../content/perks';
import { MaterialType } from '../content/environment';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class PlayerStatsSystem implements System {
    id = 'player_stats_system';

    private cachedPassives: StatusEffectType[] = [];

    constructor(
        private playerGroup: THREE.Group,
        private t: (key: string) => string,
        private activeFamilyMembers: { current: any[] }
    ) { }

    init(session: GameSessionLogic) {
        this.updatePassives(session);
    }

    update(session: GameSessionLogic, dt: number, now: number) {
        if (session.state.isDead) return;

        this.updatePassives(session);
        this.checkAdrenalinePatch(session, now);
        this.updateBuffsAndDebuffs(session, dt, now);
        this.applyStatusTicks(session, dt, now);
    }

    private checkAdrenalinePatch(session: GameSessionLogic, now: number) {
        const state = session.state;
        const perk = PERKS[StatusEffectType.ADRENALINE_PATCH];
        if (!perk) return;

        // Trigger at < 25% HP and off cooldown
        if (state.hp > 0 && state.hp < state.maxHp * 0.25) {
            if (now - state.lastAdrenalinePatchTime > (perk.cooldown || 60000)) {
                state.lastAdrenalinePatchTime = now;

                // Add the absolute buff
                state.statusEffects[perk.id] = {
                    duration: perk.duration || 3000,
                    maxDuration: perk.duration || 3000,
                    intensity: perk.intensity || 1,
                    damage: perk.damage || 0,
                    lastTick: now
                };

                soundManager.playEffect('adrenaline_boost');
                console.log(`[BUFF] Gained: ${perk.id} (Adrenaline Patch) | Duration: ${perk.duration}ms`);

                // Discovery
                if (!state.discoveredPerks.includes(perk.id)) {
                    state.discoveredPerks.push(perk.id);
                    session.triggerDiscovery('perk', perk.id, perk.displayName, perk.description);
                }
            }
        }
    }

    // Cached Base Multipliers
    private cachedFamilyMultipliers = {
        speed: 1.0, reloadTime: 1.0, fireRate: 1.0, damageResist: 1.0, range: 1.0
    };

    // Updates passive buffs from family members
    public updatePassives(session: GameSessionLogic) {
        this.cachedFamilyMultipliers = { speed: 1.0, reloadTime: 1.0, fireRate: 1.0, damageResist: 1.0, range: 1.0 };
        const family = this.activeFamilyMembers.current;

        let pIdx = 0;
        for (let i = 0; i < family.length; i++) {
            const member = family[i];
            if (!member.following) continue;

            const name = member.name.toLowerCase();
            let passiveId: StatusEffectType | null = null;

            if (name === 'loke') {
                this.cachedFamilyMultipliers.reloadTime *= (PERKS[StatusEffectType.TRICKSTERS_HASTE]?.intensity || 0.8);
                passiveId = StatusEffectType.TRICKSTERS_HASTE;
            } else if (name === 'jordan') {
                this.cachedFamilyMultipliers.range *= (PERKS[StatusEffectType.EAGLES_SIGHT]?.intensity || 1.15);
                passiveId = StatusEffectType.EAGLES_SIGHT;
            } else if (name === 'esmeralda') {
                this.cachedFamilyMultipliers.fireRate *= (PERKS[StatusEffectType.LEAD_FEVER]?.intensity || 1.2);
                passiveId = StatusEffectType.LEAD_FEVER;
            } else if (name === 'nathalie') {
                this.cachedFamilyMultipliers.damageResist *= (PERKS[StatusEffectType.WINTERS_BONE]?.intensity || 0.9);
                passiveId = StatusEffectType.WINTERS_BONE;
            }

            if (passiveId) {
                const alreadyHas = this.cachedPassives.includes(passiveId);
                this.cachedPassives[pIdx++] = passiveId;

                // Discovery Trigger
                const state = session.state;
                const perk = PERKS[passiveId];

                if (!alreadyHas) {
                    console.log(`[PASSIVE] Sync: Gained ${passiveId} from family member`);
                }

                if (perk && !state.discoveredPerks.includes(passiveId)) {
                    state.discoveredPerks.push(passiveId);
                    session.triggerDiscovery('perk', passiveId, perk.displayName, perk.description);
                }
            }
        }

        this.cachedPassives.length = pIdx;
    }

    private updateBuffsAndDebuffs(session: GameSessionLogic, dt: number, now: number) {
        const state = session.state;

        // 1. Copy the pre-calculated values (O(1) operation)
        state.multipliers.speed = this.cachedFamilyMultipliers.speed;
        state.multipliers.reloadTime = this.cachedFamilyMultipliers.reloadTime;
        state.multipliers.fireRate = this.cachedFamilyMultipliers.fireRate;
        state.multipliers.damageResist = this.cachedFamilyMultipliers.damageResist;
        state.multipliers.range = this.cachedFamilyMultipliers.range;

        // Sync UI-array from cache
        for (let i = 0; i < this.cachedPassives.length; i++) {
            state.activePassives[i] = this.cachedPassives[i];
        }
        state.activePassives.length = this.cachedPassives.length;

        state.isDisoriented = false;
        let buffIdx = 0;
        let debuffIdx = 0;

        // 2. Apply only what changes often (Status Effects)
        const effects = state.statusEffects;
        for (const key in effects) {
            const type = key as StatusEffectType;
            const effect = effects[type];
            if (!effect) continue;

            if (effect.duration <= 0) {
                // Check if it was active last frame to log expiration
                const wasActive = state.activeBuffs.includes(type) || state.activeDebuffs.includes(type);
                if (wasActive) {
                    console.log(`[STATUS] Expired: ${type}`);
                }
                continue;
            }

            effect.duration -= dt * 1000;

            const perk = PERKS[type];
            if (perk) {
                if (perk.category === PerkCategory.BUFF) {
                    state.activeBuffs[buffIdx++] = type;
                } else {
                    state.activeDebuffs[debuffIdx++] = type;
                }

                // Apply intensity (e.g. speed multiplier) if defined
                if (perk.intensity !== undefined) {
                    state.multipliers.speed *= perk.intensity;
                }
            } else {
                console.warn(`[DEBUG] Unknown status effect type: ${type} - check PERKS registry`);
                state.activeDebuffs[debuffIdx++] = type;
            }

            if (type === StatusEffectType.DISORIENTED) {
                state.isDisoriented = true;
                session.engine.camera.shake(0.05);
            }
        }

        state.activeBuffs.length = buffIdx;
        state.activeDebuffs.length = debuffIdx;
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
                const dmg = effect.damage || 0;
                if (dmg > 0) {
                    const dmgType = type === StatusEffectType.BURNING ? DamageType.BURN :
                        (type === StatusEffectType.BLEEDING ? DamageType.BLEED :
                            (type === StatusEffectType.ELECTRIFIED ? DamageType.ELECTRIC : DamageType.PHYSICAL));

                    // Track source if available
                    const attacker = effect.sourceType ? { type: effect.sourceType, isBoss: effect.sourceType === 'Boss' } : null;

                    // Use the effect name (e.g., 'BLEEDING') for the breakdown to match user requirements
                    // but we can prepend the source attack if we want to be super detailed.
                    // For now, let's stick to the requested format: "Bleeding", "Burning" etc.
                    const attackName = type;

                    this.handlePlayerHit(session, dmg, attacker, dmgType, true, undefined, undefined, undefined, attackName);

                    // Visuals for status (Zero-GC: Use local constants or scratchpads if needed, but these are low-frequency)
                    if (type === StatusEffectType.BLEEDING) {
                        FXSystem.spawnPart(session.engine.scene, state.particles, this.playerGroup.position.x, 1.8 + Math.random(), this.playerGroup.position.z, 'blood', 3);
                    } else if (type === StatusEffectType.BURNING) {
                        // Attach high-quality fire to player head, same as enemies
                        _v1.set(this.playerGroup.position.x + (Math.random() - 0.5) * 0.5, this.playerGroup.position.y + 1.8, this.playerGroup.position.z + (Math.random() - 0.5) * 0.5);
                        FXSystem.spawnPart(session.engine.scene, state.particles, _v1.x, _v1.y, _v1.z, 'flame', 1);

                        //FXSystem.spawnPart(session.engine.scene, state.particles, this.playerGroup.position.x, 1.8, this.playerGroup.position.z, 'enemy_effect_flame', 1);
                    } else if (type === StatusEffectType.ELECTRIFIED) {
                        FXSystem.spawnPart(session.engine.scene, state.particles, this.playerGroup.position.x, 1.8, this.playerGroup.position.z, 'spark', 4);
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
        const now = state.simTime;

        if (state.isDead || state.sectorState?.isInvincible) return;

        // --- VEHICLE IMMUNITY ---
        // If the player is inside a vehicle, they are shielded from direct enemy attacks
        if (state.vehicle.active && attacker) {
            soundManager.playImpact(MaterialType.METAL);
            state.hurtShake = 0.4; // Subtle feedback even though no damage is taken
            return;
        }

        // --- NEW: TACTICAL IMMUNITY BUFFS ---
        const reflexShield = state.statusEffects[StatusEffectType.REFLEX_SHIELD];
        const adrenalinePatch = state.statusEffects[StatusEffectType.ADRENALINE_PATCH];

        if ((reflexShield && reflexShield.duration > 0) || (adrenalinePatch && adrenalinePatch.duration > 0)) {
            // Visual feedback for negated hit? 
            // (Standard invulnerableCheck below handles I-frames, but this is absolute)
            return;
        }

        // Apply Damage Resistance Multiplier (Nathalie)
        let actualDmg = damage * state.multipliers.damageResist;

        //if (PerformanceMonitor.getInstance().consoleLoggingEnabled) {
        //console.log(`[PLAYER] HIT | HP: ${state.hp.toFixed(0)} | -${actualDmg.toFixed(1)} (${type}) from ${attacker?.type || 'Other'}${isDoT ? ' [DoT]' : ''} | Effect: ${effectType || 'None'} (${effectDuration || 0}ms)`);
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
        const attackName = specificAttackType || (type === DamageType.BITE ? EnemyAttackType.BITE : (isDoT ? type : EnemyAttackType.HIT));

        if (damageTracker) {
            damageTracker.recordIncomingDamage(session, actualDmg, sourceName, attackName, attacker?.isBoss);
        }

        // --- NEW: Register Status Effects ---
        if (effectType) {
            // console.log(`[DEBUG] Registering effect: ${effectType} für ${effectDuration}ms`);
            if (!state.statusEffects[effectType]) {
                state.statusEffects[effectType] = { duration: 0, maxDuration: 0, intensity: 1, damage: 0, lastTick: 0 };
            }

            const perk = PERKS[effectType];

            // Set/Overwrite the duration, maxDuration and intensity/damage
            // Prioritize PERKS database if available, otherwise use passed values
            state.statusEffects[effectType]!.duration = perk?.duration || effectDuration || 0;
            state.statusEffects[effectType]!.maxDuration = perk?.duration || effectDuration || 0;
            state.statusEffects[effectType]!.intensity = perk?.intensity !== undefined ? perk.intensity : (effectType === StatusEffectType.STUNNED ? 0 : 1);
            state.statusEffects[effectType]!.damage = perk?.damage || effectDamage || 0;

            console.log(`[STATUS] Gained: ${effectType} | Duration: ${state.statusEffects[effectType]!.duration}ms | Dmg: ${state.statusEffects[effectType]!.damage}`);

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
        } else if (type === DamageType.BURN) {
            state.killerName = this.t('ui.burning');
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

    clear() {
    }

}