import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { soundManager } from '../utils/audio/SoundManager';
import { FXSystem } from './FXSystem';
import { PlayerDeathState, DamageID, EnemyAttackType } from '../entities/player/CombatTypes';
import { PERKS, StatusEffectType, PerkCategory } from '../content/perks';
import { MaterialType } from '../content/environment';
import { StatusEffectID, PlayerStatID, PlayerStatusFlags, STATUS_EFFECT_MAP } from '../entities/player/PlayerTypes';
import { SoundID } from '../utils/audio/AudioTypes';
import { EnemyType, EnemyFlags } from '../entities/enemies/EnemyTypes';
import { KMH_TO_MS } from '../content/constants';

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
        const state = session.state;
        if ((state.statusFlags & PlayerStatusFlags.DEAD) !== 0) return;
        if ((state.statusFlags & PlayerStatusFlags.STUNNED) !== 0) return;

        this.updatePassives(session);
        this.checkAdrenalinePatch(session, now);
        this.updateBuffsAndDebuffs(session, dt, now);
        this.applyStatusTicks(session, dt, now);

        // --- BAKE FINAL PRE-CALCULATED STATS (O(1) Access for Systems) ---
        // Final Speed in m/s (Unit conversion + Perk Multipliers)
        const stats = state.statsBuffer;
        stats[PlayerStatID.FINAL_SPEED] = stats[PlayerStatID.SPEED] * stats[PlayerStatID.MULTIPLIER_SPEED] * KMH_TO_MS;
    }

    private checkAdrenalinePatch(session: GameSessionLogic, now: number) {
        const state = session.state;
        const perkID = StatusEffectType.ADRENALINE_PATCH;
        const perk = PERKS[perkID];
        if (!perk) return;

        const hp = state.statsBuffer[PlayerStatID.HP];
        const maxHp = state.statsBuffer[PlayerStatID.MAX_HP];

        if (hp > 0 && hp < maxHp * 0.25) {
            if (now - state.lastAdrenalinePatchTime > (perk.cooldown || 60000)) {
                state.lastAdrenalinePatchTime = now;

                const sID = StatusEffectID.ADRENALINE_PATCH;
                state.effectDurations[sID] = perk.duration || 3000;
                state.effectIntensities[sID] = perk.intensity || 1;

                soundManager.playEffect(SoundID.ADRENALINE_BOOST);
                
                if (!state.discoveredPerks.includes(perkID)) {
                    state.discoveredPerks.push(perkID);
                    session.triggerDiscovery('perk', perkID, perk.displayName, perk.description);
                }
            }
        }
    }

    private cachedFamilyMultipliers = {
        speed: 1.0, reloadTime: 1.0, fireRate: 1.0, damageResist: 1.0, range: 1.0
    };

    public updatePassives(session: GameSessionLogic) {
        this.cachedFamilyMultipliers = { speed: 1.0, reloadTime: 1.0, fireRate: 1.0, damageResist: 1.0, range: 1.0 };
        const family = this.activeFamilyMembers.current;
        const state = session.state;

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
                this.cachedPassives[pIdx++] = passiveId;
                const perk = PERKS[passiveId];

                if (perk && !state.discoveredPerks.includes(passiveId)) {
                    state.discoveredPerks.push(passiveId);
                    session.triggerDiscovery('perk', passiveId, perk.displayName, perk.description);
                }
            }
        }
        this.cachedPassives.length = pIdx;
        
        // --- SYNC TO STATE (Zero-GC) ---
        state.activePassives.length = 0;
        for (let i = 0; i < pIdx; i++) state.activePassives.push(this.cachedPassives[i]);
    }


    private updateBuffsAndDebuffs(session: GameSessionLogic, dt: number, now: number) {
        const state = session.state;
        const stats = state.statsBuffer;

        stats[PlayerStatID.MULTIPLIER_SPEED] = this.cachedFamilyMultipliers.speed;
        stats[PlayerStatID.MULTIPLIER_RELOAD] = this.cachedFamilyMultipliers.reloadTime;
        stats[PlayerStatID.MULTIPLIER_FIRERATE] = this.cachedFamilyMultipliers.fireRate;
        stats[PlayerStatID.MULTIPLIER_DMG_RESIST] = this.cachedFamilyMultipliers.damageResist;
        stats[PlayerStatID.MULTIPLIER_RANGE] = this.cachedFamilyMultipliers.range;

        state.statusFlags &= ~PlayerStatusFlags.DISORIENTED;
        state.activeBuffs.length = 0;
        state.activeDebuffs.length = 0;
        
        for (let i = 0; i < StatusEffectID.COUNT; i++) {
            if (state.effectDurations[i] <= 0) continue;

            const duration = state.effectDurations[i];
            state.effectDurations[i] = Math.max(0, duration - dt * 1000);
            
            // Map index to multipliers and state flags
            if (i === StatusEffectID.ADRENALINE_PATCH) {
                stats[PlayerStatID.MULTIPLIER_SPEED] *= state.effectIntensities[i];
            } else if (i === StatusEffectID.DISORIENTED) {
                state.statusFlags |= PlayerStatusFlags.DISORIENTED;
                session.engine.camera.shake(0.05);
            }

            // HUD Synchronization: Report all non-passive effects to the Active Buff/Debuff arrays
            const perk = PERKS[i];
            if (perk) {
                if (perk.category === PerkCategory.BUFF) {
                    state.activeBuffs.push(i);
                } else if (perk.category === PerkCategory.DEBUFF) {
                    state.activeDebuffs.push(i);
                }
            }
        }
    }

    private applyStatusTicks(session: GameSessionLogic, dt: number, now: number) {
        const state = session.state;

        // Tick DoT every 1 second
        if (Math.floor(now / 1000) !== Math.floor((now - dt * 1000) / 1000)) {
            for (let i = 0; i < StatusEffectID.COUNT; i++) {
                if (state.effectDurations[i] <= 0) continue;

                // Map index to fixed damage logic
                let dmg = 0;
                let dmgID = DamageID.PHYSICAL;
                let effectKey: StatusEffectType | undefined;

                if (i === StatusEffectID.BURNING) {
                    dmg = 5; dmgID = DamageID.BURN; effectKey = StatusEffectType.BURNING;
                } else if (i === StatusEffectID.BLEEDING) {
                    dmg = 3; dmgID = DamageID.BLEED; effectKey = StatusEffectType.BLEEDING;
                } else if (i === StatusEffectID.ELECTRIFIED) {
                    dmg = 2; dmgID = DamageID.ELECTRIC; effectKey = StatusEffectType.ELECTRIFIED;
                }

                if (dmg > 0 && effectKey) {
                    this.handlePlayerHit(session, dmg, null, dmgID, true, effectKey);
                    
                    // Visuals
                    if (i === StatusEffectID.BLEEDING) {
                        FXSystem.spawnPart(session.engine.scene, state.particles, this.playerGroup.position.x, 1.8 + Math.random(), this.playerGroup.position.z, 'blood', 3);
                    } else if (i === StatusEffectID.BURNING) {
                        _v1.set(this.playerGroup.position.x + (Math.random() - 0.5) * 0.5, this.playerGroup.position.y + 1.8, this.playerGroup.position.z + (Math.random() - 0.5) * 0.5);
                        FXSystem.spawnPart(session.engine.scene, state.particles, _v1.x, _v1.y, _v1.z, 'flame', 1);
                    }
                }
            }
        }
    }

    public handlePlayerHit(
        session: GameSessionLogic,
        damage: number,
        attacker: any,
        type: DamageID,
        isDoT: boolean = false,
        effectType?: StatusEffectType,
        effectDuration?: number,
        effectIntensity?: number,
        specificAttackType?: string
    ) {
        const state = session.state;
        const now = state.simTime;

        if ((state.statusFlags & PlayerStatusFlags.DEAD) !== 0 || state.sectorState?.isInvincible) return;

        if (state.effectDurations[StatusEffectID.REFLEX_SHIELD] > 0 || state.effectDurations[StatusEffectID.ADRENALINE_PATCH] > 0) {
            return;
        }

        let actualDmg = damage * state.statsBuffer[PlayerStatID.MULTIPLIER_DMG_RESIST];
        const isBite = type === DamageID.BITE;

        if (!isDoT) {
            if (!isBite && now < (state.invulnerableUntil || 0)) return;
            if (isBite && now < (state.lastBiteTime || 0) + 50) return;
        }

        state.statsBuffer[PlayerStatID.HP] -= actualDmg;

        let attackIndex = isBite ? EnemyAttackType.BITE : EnemyAttackType.HIT;
        if (isDoT && effectType !== undefined) {
            attackIndex = effectType as any;
        }

        // Damage Telemetry
        const damageTracker = session.getSystem('damage_tracker_system') as any;
        if (damageTracker) {
            let sourceKey = type; // Use the direct DamageID (SMI)

            if (attacker) {
                const isBossAttacker = (attacker.statusFlags & EnemyFlags.BOSS) !== 0;
                if (isBossAttacker && attacker.bossId !== undefined) {
                    sourceKey = DamageID.BOSS;
                    // For bosses, attackIndex is their identity in telemetry grouping
                    // but we also want the killerAttackName to be correct.
                    // Wait, if I use attackIndex = attacker.bossId here, I overwrite BITE/HIT.
                    // Let's use a separate local for telemetry recording.
                } else {
                    sourceKey = DamageID.PHYSICAL;
                }
            }

            let telemetryAttackIndex = attackIndex;
            if (attacker && (attacker.statusFlags & EnemyFlags.BOSS) !== 0 && attacker.bossId !== undefined) {
                telemetryAttackIndex = attacker.bossId;
            }

            damageTracker.recordIncomingDamage(session, actualDmg, sourceKey, telemetryAttackIndex, (attacker?.statusFlags & EnemyFlags.BOSS) !== 0);
        }

        if (!isDoT && effectType !== undefined) {
            const perk = PERKS[effectType];
            if (perk) {
                state.effectDurations[effectType] = perk.duration || effectDuration || 0;
                state.effectIntensities[effectType] = effectIntensity !== undefined ? effectIntensity : (perk.intensity || 1);
            }
        }

        if (!isDoT) {
            if (isBite) state.lastBiteTime = now;
            else state.invulnerableUntil = now + 400;
            soundManager.playDamageGrunt();
            state.hurtShake = 1.0;
        }

        state.lastDamageTime = now;

        if (state.particles && !isDoT) {
            FXSystem.spawnPart(session.engine.scene, state.particles, this.playerGroup.position.x, 1.3, this.playerGroup.position.z, 'blood_splat', 5);
        }

        if (state.statsBuffer[PlayerStatID.HP] <= 0) {
            let finalAttackName = specificAttackType || 'HIT';
            if (isDoT && effectType !== undefined) {
                finalAttackName = StatusEffectType[effectType] || 'DOT';
            }
            this.executePlayerDeath(session, attacker, type, finalAttackName, attackIndex, now);
        }
    }

    private executePlayerDeath(session: GameSessionLogic, attacker: any, type: DamageID, attackName: string, attackIndex: number, now: number) {
        const state = session.state;
        state.statusFlags |= PlayerStatusFlags.DEAD;
        state.deathStartTime = now;

        state.killerType = type;

        state.playerDeathState = PlayerDeathState.NORMAL;

        if (type === DamageID.EXPLOSION) state.playerDeathState = PlayerDeathState.GIBBED;
        else if (type === DamageID.BURN) state.playerDeathState = PlayerDeathState.BURNED;
        else if (type === DamageID.DROWNING) state.playerDeathState = PlayerDeathState.DROWNED;

        if (attacker && (attacker.statusFlags & EnemyFlags.BOSS) !== 0 && attacker.bossId !== undefined) {
            state.killerName = this.t(`enemies.bosses.${attacker.bossId}.name`);
            state.killedByEnemy = true;
            // For bosses, the specific attack name is often generic or uses the boss identity
            state.killerAttackName = attackName; 
        } else if (attacker) {
            const enemyNameKey = EnemyType[attacker.type] || 'other';
            state.killerName = this.t(`enemies.zombies.${enemyNameKey}.name`);
            state.killedByEnemy = true;
            
            // Map numeric attack type to Enum String for UI translation (e.g. "BITE")
            const attackEnumName = EnemyAttackType[attackIndex] || attackName;
            state.killerAttackName = attackEnumName;
        } else {
            let envKey = 'ui.unknown_threat';
            if (type === DamageID.DROWNING) envKey = 'ui.drowning';
            else if (type === DamageID.BURN) envKey = 'ui.burning';
            else if (type === DamageID.BLEED) envKey = 'ui.bleeding';
            else if (type === DamageID.ELECTRIC) envKey = 'ui.electrified';
            else if (type === DamageID.FALL) envKey = 'ui.falling';
            else if (type === DamageID.EXPLOSION) envKey = 'ui.explosion';
            
            state.killerName = this.t(envKey);
            state.killedByEnemy = false;
            state.killerAttackName = 'HIDDEN'; // Environment doesn't show attack title in parens
        }

        const input = session.engine.input.state;
        _v1.set(0, 0, 0);
        if (input.w) _v1.z -= 1; if (input.s) _v1.z += 1;
        if (input.a) _v1.x -= 1; if (input.d) _v1.x += 1;

        if (_v1.lengthSq() > 0) {
            state.deathVel.copy(_v1).normalize().multiplyScalar(15);
        } else if (attacker && attacker.mesh) {
            state.deathVel.subVectors(this.playerGroup.position, attacker.mesh.position).normalize().multiplyScalar(12);
        } else {
            state.deathVel.set(0, 0, 12);
        }
        state.deathVel.y = 4;
    }

    clear() { }
}