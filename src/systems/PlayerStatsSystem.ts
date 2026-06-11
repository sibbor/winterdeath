import * as THREE from 'three';
import type React from 'react';
import { System, SystemID } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { DamageID, EnemyAttackType, DamageType } from '../entities/player/CombatTypes';
import { PERKS } from '../content/perks';
import { StatID, PlayerStatusFlags } from '../types/CareerStats';
import { EnemyFlags } from '../entities/enemies/EnemyTypes';
import { MAX_ENTITIES, HEALTH_CRITICAL_THRESHOLD } from '../content/constants';
import { StatusEffectID } from '../types/StatusEffects';
import { audioEngine } from '../utils/audio/AudioEngine';
import { SoundID } from '../utils/audio/AudioTypes';
import { CombatEngine } from '../game/session/CombatEngine';
import { CareerStatsSystem } from './CareerStatsSystem';

export class PlayerStatsSystem implements System {
    readonly systemId = SystemID.PLAYER_STATS;
    id = 'player_stats_system';
    enabled = true;
    persistent = false;
    isFixedStep = true;

    private lastHeartbeatTime = 0;
    private lastPosition = new THREE.Vector3();
    private hasLastPos = false;

    constructor(
        private playerGroup: THREE.Group,
        private distanceTraveledRef?: React.MutableRefObject<number>
    ) { }

    init(session: GameSessionLogic) {
        this.lastHeartbeatTime = 0;
        this.hasLastPos = false;
        if (this.playerGroup) {
            this.lastPosition.copy(this.playerGroup.position);
            this.hasLastPos = true;
        }
    }

    update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        if (!session || !session.engine || !session.state) return;
        const state = session.state;
        if ((state.combat.statusFlags & PlayerStatusFlags.DEAD) !== 0) return;
        if ((state.combat.statusFlags & PlayerStatusFlags.STUNNED) !== 0) return;

        // --- Candidate A: Distance Traveled Tracking (Zero-GC Flat Primitives) ---
        const px = this.playerGroup.position.x;
        const py = this.playerGroup.position.y;
        const pz = this.playerGroup.position.z;

        if (this.hasLastPos) {
            const dx = px - this.lastPosition.x;
            const dy = py - this.lastPosition.y;
            const dz = pz - this.lastPosition.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            if (distSq > 0.0001) {
                const dist = Math.sqrt(distSq);
                state.player.statsBuffer[StatID.TOTAL_DISTANCE_TRAVELED] += dist;
                state.sessionStats.distanceTraveled += dist;
                if (this.distanceTraveledRef) {
                    this.distanceTraveledRef.current += dist;
                }
            }
        } else {
            this.hasLastPos = true;
        }
        this.lastPosition.set(px, py, pz);

        // --- Candidate B: Health Heartbeat Audio Triggering (Hardware-Clock Gated) ---
        const sb = state.player.statsBuffer;
        const hp = sb[StatID.HP];
        const maxHp = sb[StatID.MAX_HP];

        if (hp > 0 && hp < maxHp * HEALTH_CRITICAL_THRESHOLD) {
            const currentTime = audioEngine.audioContext.currentTime;
            if (currentTime - this.lastHeartbeatTime > 0.8) { // 800ms boundary gating
                this.lastHeartbeatTime = currentTime;
                audioEngine.playSound(SoundID.HEARTBEAT, 0.5);
            }
        }
    }

    public handlePlayerHit(
        session: GameSessionLogic,
        damage: number,
        attacker: any,
        damageType: DamageType,
        damageSource: DamageID,
        isDoT: boolean = false,
        effectType?: StatusEffectID,
        effectDuration?: number,
        effectIntensity?: number,
        specificAttackType?: EnemyAttackType
    ): boolean {
        return CombatEngine.handlePlayerHit(
            session,
            damage,
            attacker,
            damageType,
            damageSource,
            isDoT,
            effectType,
            effectDuration,
            effectIntensity,
            specificAttackType
        );
    }

    public onEnemyKilled(session: GameSessionLogic, enemy: any, now: number, weaponId: DamageID, distSq?: number) {
        const state = session.state;
        const streakMax = MAX_ENTITIES.STREAK_BUFFER_SIZE;
        for (let i = 0; i < (streakMax - 1); i++) state.metrics.killStreakBuffer[i] = state.metrics.killStreakBuffer[i + 1];
        state.metrics.killStreakBuffer[streakMax - 1] = now;

        const kill3Time = state.metrics.killStreakBuffer[2];
        if (kill3Time > 0 && (now - kill3Time) < 3000) {
            const cooldown = PERKS[StatusEffectID.ADRENALINE_PATCH]?.cooldown || 15000;
            if (now - (state.combat.lastAdrenalineTime || 0) > cooldown) {
                state.combat.lastAdrenalineTime = now;
                session.systems.perkSystem!.applyPerk(session, StatusEffectID.ADRENALINE_PATCH);
            }
        }

        const kill5Time = state.metrics.killStreakBuffer[0];
        if (kill5Time > 0 && (now - kill5Time) < 5000) {
            const cooldown = PERKS[StatusEffectID.GIB_MASTER]?.cooldown || 30000;
            if (now - (state.combat.lastGibMasterTime || 0) > cooldown) {
                state.combat.lastGibMasterTime = now;
                session.systems.perkSystem!.applyPerk(session, StatusEffectID.GIB_MASTER);
            }
        }

        const qfPerk = PERKS[StatusEffectID.QUICK_FINGER];
        if (qfPerk) {
            const cooldown = qfPerk.cooldown || 10000;
            if (now - (state.combat.lastQuickFingerTime || 0) > cooldown) {
                state.combat.lastQuickFingerTime = now;
                session.systems.perkSystem!.applyPerk(session, StatusEffectID.QUICK_FINGER);
            }
        }

        CareerStatsSystem.recordKill(session, enemy.type, (enemy.statusFlags & EnemyFlags.BOSS) !== 0, enemy.bossId, weaponId, distSq);
    }

    clear() { }
}