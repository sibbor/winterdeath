import * as THREE from 'three';
import { System, SystemID } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { FXSystem } from './FXSystem';
import { FXParticleType } from '../types/FXTypes';
import { DamageID, AbilityID, DamageType } from '../entities/player/CombatTypes';
import { ABILITIES } from '../content/abilities';
import { PERKS, StatusEffectID } from '../content/perks';
import { applyCollisionResolution } from '../core/world/CollisionResolution';
import { audioEngine } from '../utils/audio/AudioEngine';
import { EnemyManager } from '../entities/enemies/EnemyManager';
import { _buoyancyResult } from './WaterSystem';
import { NOISE_RADIUS, NoiseType } from '../entities/enemies/EnemyTypes';
import { GEOMETRY, MATERIALS } from '../utils/assets';
import { FootprintSystem } from './FootprintSystem';
import { PlayerStatID, PlayerStatusFlags } from '../entities/player/PlayerTypes';
import { SoundID } from '../utils/audio/AudioTypes';
import { PlayerStatsSystem } from './PlayerStatsSystem';
import { InputAction } from '../core/engine/InputManager';
import { StatsBridge } from '../core/data/StatsBridge';
import { KMH_TO_MS, PLAYER, PHYSICS, COMBAT } from '../content/constants';

// --- SPEED AUDIT TELEMETRY (DEPRECATED) ---
// Audit variables removed for Zero-GC compliance. Logging moved to TelemetrySystem.

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();

export class PlayerMovementSystem implements System {
    readonly systemId = SystemID.PLAYER_MOVEMENT;
    id = 'player_movement';
    enabled = true;
    persistent = false;
    isFixedStep = true;

    // Zero-GC context bridge for EnemyManager physics 
    private _knockbackCtx: any = {
        worldStreamer: null,
        applyDamage: null,
        scene: null,
        engine: null,
        spawnParticle: null
    };

    private _invincibilityMesh: THREE.Mesh | null = null;
    private _buffShieldMesh: THREE.Mesh | null = null;
    private _statsSystem: PlayerStatsSystem | null = null;

    constructor(private playerGroup: THREE.Group) {
        // 100% Zero-GC Mesh Pre-allocation
        this._invincibilityMesh = new THREE.Mesh(GEOMETRY.reflexShield, MATERIALS.reflexShield);
        this._invincibilityMesh.position.y = 1.0;
        this._invincibilityMesh.visible = false;
        this.playerGroup.add(this._invincibilityMesh);
    }

    init(session: GameSessionLogic) {
        this._statsSystem = session.getSystem<PlayerStatsSystem>(SystemID.PLAYER_STATS);
    }

    update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        if (!session || !session.engine || !session.state) return;

        const state = session.state;
        const stats = state.statsBuffer;
        if (!stats) return;

        if ((state.statusFlags & PlayerStatusFlags.DEAD) !== 0) return;
        if ((state.statusFlags & PlayerStatusFlags.STUNNED) !== 0) return;

        // --- CINEMATIC LOCK (Zero-Velocity) ---
        if (state.cinematicActive) {
            state.isMoving = false;
            state.velocity.set(0, 0, 0);
            return;
        }

        const input = session.engine.input.state;
        const disableInput = session.inputDisabled || false;

        // --- 1. SSoT SPEED AGGREGATION (Zero-GC) ---
        // Vinterdöd Refactor: Use the frame-perfect baked speed calculated by the PerkSystem.
        const currentSpeed = stats[PlayerStatID.FINAL_SPEED];

        if (state.vehicle.active) {
            state.isMoving = false;
            return;
        }

        const isMoving = this.handleMovement(
            this.playerGroup,
            input,
            state,
            delta,
            simTime,
            renderTime,
            disableInput,
            session,
            currentSpeed
        );

        state.isMoving = isMoving;

        this.handleRotation(
            this.playerGroup,
            input,
            state,
            session.isMobileDevice,
            disableInput,
            isMoving,
            session
        );

        this.updateInvincibleGlow(state, session.state.renderTime);
    }

    private checkReflexShield(session: GameSessionLogic, simTime: number) {
        const state = session.state;
        const perkID = StatusEffectID.REFLEX_SHIELD;

        const perk = PERKS[perkID];
        const cooldown = perk?.cooldown ?? 10000;

        if (simTime - state.lastReflexShieldTime > cooldown) {
            state.lastReflexShieldTime = simTime;

            // Centralized Trigger (Clears debuffs!)
            const perkSystem = session.getSystem<any>(SystemID.PERK_SYSTEM);
            if (perkSystem) {
                perkSystem.applyPerk(session, perkID);
            }
        }
    }

    private updateInvincibleGlow(state: any, renderTime: number) {
        if (state.sectorState.isInvincible && this._invincibilityMesh) {

            // Pulse effect
            const sineWave = Math.sin(renderTime * PLAYER.INVULNERABILITY_PULSE_SPEED) * 0.05;

            (this._invincibilityMesh.material as THREE.MeshBasicMaterial).opacity = 0.15 + sineWave;
            this._invincibilityMesh.scale.setScalar(1.0 + sineWave);
            this._invincibilityMesh.visible = true;
        } else if (this._invincibilityMesh) {
            this._invincibilityMesh.visible = false;
        }
    }

    private handleMovement(
        playerGroup: THREE.Group,
        input: any,
        state: any,
        delta: number,
        simTime: number,
        renderTime: number,
        disableInput: boolean,
        session: GameSessionLogic,
        currentSpeed: number
    ): boolean {
        const stats = state.statsBuffer;

        // --- 1. Ability Triggering (Rush & Dodge) ---
        const acts = input.actions;
        if (!acts[InputAction.DODGE]) {
            // Check for Dodge trigger on release (Short Press)
            if (state.spaceDepressed) {
                const pressDuration = simTime - state.spacePressTime;

                // Increased window (150->200ms) and added '!state.isDodging' check
                const dodgeCost = ABILITIES[AbilityID.DODGE].staminaCost || 20;
                if (!state.isRushing && !state.isDodging && pressDuration < PLAYER.DODGE_PRESS_THRESHOLD) {
                    if (stats[PlayerStatID.STAMINA] >= dodgeCost) {
                        stats[PlayerStatID.STAMINA] -= dodgeCost;
                        state.lastStaminaUseTime = simTime;
                        state.isDodging = true;
                        state.dodgeStartTime = simTime; // Logic MUST use simTime for parity
                        state.dodgeDir.set(0, 0, 0); // Reset to recalc next frame

                        // --- TRACK NEW METRIC (UNIFIED) ---
                        const tracker = session.getSystem<any>(SystemID.DAMAGE_TRACKER);
                        if (tracker) tracker.recordDodge(session);

                        this.checkReflexShield(session, simTime);
                    }
                }
            }

            if (state.isRushing) {
                state.isRushing = false;
                state.lastRushEndTime = simTime;
                // Clear flag immediately for responsive animation
                state.statusFlags &= ~PlayerStatusFlags.RUSHING;
            }

            state.spaceDepressed = false;
            state.rushCostPaid = false;
        } else {
            // Initiation
            if (!state.spaceDepressed && !disableInput) {
                state.spaceDepressed = true;
                state.spacePressTime = simTime;
                state.rushCostPaid = false;
            }

            // Handle Rush Elevation (Hold Space)
            if (state.spaceDepressed && !state.isDodging) {
                if (simTime - state.spacePressTime >= PLAYER.RUSH_HOLD_THRESHOLD) { // Increased threshold to avoid accidental dodge blocking
                    if (stats[PlayerStatID.STAMINA] >= 1.0) { // Check for minimal stamina to CONTINUE rushing
                        if (!state.isRushing) {
                            state.isRushing = true;
                            state.rushCostPaid = true;
                            state.statusFlags |= PlayerStatusFlags.RUSHING;

                            // --- TRACK NEW METRIC (UNIFIED) ---
                            const tracker = session.getSystem<any>(SystemID.DAMAGE_TRACKER);
                            if (tracker) tracker.recordRush(session);
                        }

                        state.lastStaminaUseTime = simTime;
                        this.checkReflexShield(session, simTime);
                    } else {
                        state.isRushing = false;
                        state.statusFlags &= ~PlayerStatusFlags.RUSHING;
                    }
                }
            }
        }

        let speed = currentSpeed;

        // --- 2. WATER PHYSICS & DRAG ---
        let inWater = false;
        let isSwimming = state.isSwimming || false;
        let isWading = false;

        if (session.engine.water) {
            session.engine.water.checkBuoyancy(playerGroup.position.x, playerGroup.position.y, playerGroup.position.z, session.state.renderTime);
            inWater = _buoyancyResult.inWater && !state.vehicle.active;

            const groundY = session.engine.ground ? session.engine.ground.getGroundHeight(playerGroup.position.x, playerGroup.position.z, session) : 0;

            if (inWater) {
                const flatDepth = _buoyancyResult.baseWaterLevel - _buoyancyResult.groundY;

                if (flatDepth > PHYSICS.SWIM_DEPTH_MAX) {
                    isSwimming = true;
                    speed *= 0.525; // 50% faster (0.35 * 1.5)
                } else if (flatDepth > PHYSICS.SWIM_DEPTH_MID && isSwimming) {
                    isSwimming = true;
                    speed *= 0.525;
                } else if (flatDepth > PHYSICS.WADE_DEPTH) {
                    isSwimming = false;
                    isWading = true;
                    speed *= 0.9; // 50% faster (0.6 * 1.5)
                } else {
                    isSwimming = false;
                    speed *= 0.85;
                }

                const swimY = _buoyancyResult.waterLevel - PHYSICS.SWIM_Y_OFFSET;
                const targetY = isSwimming ? swimY : groundY;
                playerGroup.position.y = THREE.MathUtils.lerp(playerGroup.position.y, targetY, 4 * delta);
            } else {
                isSwimming = false;
                isWading = false;
                if (playerGroup.position.y !== groundY) {
                    playerGroup.position.y = THREE.MathUtils.lerp(playerGroup.position.y, groundY, 15 * delta);
                    if (Math.abs(playerGroup.position.y - groundY) < 0.01) playerGroup.position.y = groundY;
                }
            }
        }

        state.isSwimming = isSwimming;
        state.isWading = isWading;

        // --- 3. EXTINGUISH BURNING IN WATER ---
        if (inWater && state.effectDurations[StatusEffectID.BURNING] > 0) {
            state.effectDurations[StatusEffectID.BURNING] = 0;
            audioEngine.playSound(SoundID.STEAM_HISS);
        }

        // --- 4. STAMINA & REGENERATION ---
        const waterStaminaDrain = isSwimming ? COMBAT.STAMINA_DRAIN_SWIM : (isWading ? COMBAT.STAMINA_DRAIN_WADE : 0);
        if (waterStaminaDrain > 0 && !state.vehicle.active) {
            state.lastStaminaUseTime = simTime;
            stats[PlayerStatID.STAMINA] = Math.max(0, stats[PlayerStatID.STAMINA] - waterStaminaDrain * delta);

            if (isSwimming && stats[PlayerStatID.STAMINA] < 0.1) {
                speed *= 0.5;

                // --- Unified Drowning Logic ---
                // We only apply the status effect here. The PlayerStatsSystem handles the damage tick.
                if (state.callbacks && state.callbacks.onPlayerHit) {
                    state.callbacks.onPlayerHit(0, null, DamageType.DROWNING, DamageID.DROWNING, true, StatusEffectID.DROWNING, 1500);
                }
            }
        }

        const rushRampSpeed = delta * PLAYER.RUSH_RAMP_SPEED; // 2 seconds for full ramp

        if (state.isRushing) {
            this.checkReflexShield(session, simTime);

            // --- PROGRESSIVE RAMP-UP (2.0s) ---
            state.rushFactor = Math.min(1.0, state.rushFactor + rushRampSpeed);

            // --- DYNAMIC STAMINA DRAIN (Ramping based on Ability DB) ---
            const ability = ABILITIES[AbilityID.RUSH];
            const drainRate = (ability.staminaCost || 5) + (state.rushFactor * 17);
            stats[PlayerStatID.STAMINA] = Math.max(0, stats[PlayerStatID.STAMINA] - delta * drainRate);
            state.lastStaminaUseTime = simTime;
            state.statusFlags |= PlayerStatusFlags.RUSHING;

            if (stats[PlayerStatID.STAMINA] <= 0) {
                state.isRushing = false;
                state.lastRushEndTime = simTime;
                state.statusFlags &= ~PlayerStatusFlags.RUSHING;
            }
        } else {
            // --- VINTERDÖD FIX: Properly ramp down when not rushing ---
            state.rushFactor = Math.max(0, state.rushFactor - rushRampSpeed);
            state.statusFlags &= ~PlayerStatusFlags.RUSHING;
        }

        // --- 4. FINAL VELOCITY RESOLUTION ---
        // Apply Rush Multiplier (1.0x to 2.0x) universally to the pre-calculated speed.
        // This ensures perk modifiers are correctly inherited during the rush ramp.
        speed *= (1.0 + state.rushFactor);

        // Update Speed Ratio for Animation Sync (Base = 1.0)
        state.currentSpeedRatio = speed / Math.max(0.001, currentSpeed);

        if (!state.isDodging && !state.isRushing && waterStaminaDrain === 0) {
            // Natural regeneration only if idle/walking and not soon after stamina use
            if (simTime - state.lastStaminaUseTime > COMBAT.STAMINA_REGEN_DELAY) {
                stats[PlayerStatID.STAMINA] = Math.min(stats[PlayerStatID.MAX_STAMINA], stats[PlayerStatID.STAMINA] + COMBAT.STAMINA_REGEN_IDLE * delta);
            }
        }

        if (stats[PlayerStatID.HP] < stats[PlayerStatID.MAX_HP] &&
            !(state.statusFlags & PlayerStatusFlags.DEAD) &&
            simTime - state.lastDamageTime > COMBAT.HP_REGEN_DELAY) {
            stats[PlayerStatID.HP] = Math.min(stats[PlayerStatID.MAX_HP], stats[PlayerStatID.HP] + COMBAT.HP_REGEN_IDLE * delta);
        }

        let isMovingVal = false;

        // --- 3. MOVE PROCESSING ---
        if (state.isDodging) {
            if (state.dodgeDir.lengthSq() === 0) {
                // Set direction once at start of dodge
                _v6.set(0, 0, 0);
                if (acts[InputAction.UP]) _v6.z -= 1; if (acts[InputAction.DOWN]) _v6.z += 1;
                if (acts[InputAction.LEFT]) _v6.x -= 1; if (acts[InputAction.RIGHT]) _v6.x += 1;

                if (_v6.lengthSq() > 0) {
                    const camAngle = session.cameraAngle || 0;
                    state.dodgeDir.copy(_v6).normalize();
                    if (camAngle !== 0) state.dodgeDir.applyAxisAngle(_UP, camAngle);
                } else {
                    state.dodgeDir.set(0, 0, 1).applyQuaternion(playerGroup.quaternion).normalize();
                }
            }

            if (!state.dodgeSmokeSpawned && !inWater) {
                state.dodgeSmokeSpawned = true;
                this.checkReflexShield(session, simTime);
                audioEngine.playSound(SoundID.DASH);
                session.makeNoise(playerGroup.position, NoiseType.PLAYER_DODGING, NOISE_RADIUS[NoiseType.PLAYER_DODGING]);

                // Perk: Quick Finger
                // Proximity-Based perfect dodge mechanic
                if (session.worldStreamer) {
                    const pool = session.worldStreamer.getEnemyPool();
                    const poolIdx = pool.nextIndex();
                    session.worldStreamer.getNearbyEnemies(playerGroup.position.x, playerGroup.position.z, 5, poolIdx);

                    if (pool.getCount(poolIdx) > 0) {
                        const perkSystem = session.getSystem<any>(SystemID.PERK_SYSTEM);
                        if (perkSystem) {
                            perkSystem.applyPerk(session, StatusEffectID.QUICK_FINGER);
                        }
                    }
                }

                FXSystem.spawnParticle(
                    session.engine.scene, state.particles,
                    playerGroup.position.x, 0.5, playerGroup.position.z,
                    FXParticleType.LARGE_SMOKE, 2, undefined, undefined, 0xcccccc, 1.2
                );
            }

            if (simTime < state.dodgeStartTime + COMBAT.DODGE_DURATION) {
                const dodgeSpeed = speed * 2.5;
                _v1.copy(state.dodgeDir).multiplyScalar(dodgeSpeed * delta);
                this.performMove(playerGroup, _v1, state, session, simTime, delta);
                isMovingVal = true;

                // UNIFIED STATE SYNC
                state.statusFlags |= PlayerStatusFlags.DODGING;
            } else {
                state.isDodging = false;
                state.statusFlags &= ~PlayerStatusFlags.DODGING;
                state.dodgeSmokeSpawned = false;
                state.dodgeDir.set(0, 0, 0);
                state.lastDodgeEndTime = simTime;
            }
        } else if (!disableInput) {
            _v6.set(0, 0, 0);
            if (acts[InputAction.UP]) _v6.z -= 1; if (acts[InputAction.DOWN]) _v6.z += 1;
            if (acts[InputAction.LEFT]) _v6.x -= 1; if (acts[InputAction.RIGHT]) _v6.x += 1;

            if (input.joystickMove) {
                _v6.x += input.joystickMove.x;
                _v6.z += input.joystickMove.y;
            }

            const disorientedDuration = state.effectDurations[StatusEffectID.DISORIENTED];
            const isDisoriented = disorientedDuration > 0;

            if (isDisoriented) {
                const noise = Math.sin(simTime * PLAYER.DISORIENTED_NOISE_SCALE) * PLAYER.DISORIENTED_DRIFT_MAGNITUDE;
                _v6.x += noise;
                if (simTime % 300 < 50) {
                    _v6.x += (Math.random() - 0.5) * 2;
                    _v6.z += (Math.random() - 0.5) * 2;
                }
            }

            if (_v6.lengthSq() > 0) {
                isMovingVal = true;
                const camAngle = session.cameraAngle || 0;

                // If it's a joystick, we DON'T necessarily want to normalize to 1.0 
                // if we want analog walking, BUT the game design specifies digital-like speed.
                // However, we MUST ensure the magnitude never exceeds 1.0.
                const mag = _v6.length();
                if (mag > 1.0) _v6.normalize();

                _v1.copy(_v6);
                if (camAngle !== 0) _v1.applyAxisAngle(_UP, camAngle);

                // Zero-GC, Branchless & Normalize-free dot product
                _forward.set(0, 0, 1).applyQuaternion(playerGroup.quaternion);
                const dot = _forward.dot(_v1);

                state.isBacking = dot < -0.4;
                state.isStrafing = Math.abs(dot) < 0.4;

                if (state.isStrafing) {
                    // Bypass heavy crossVectors and Math.sqrt. 
                    // An orthogonal vector to (x, 0, z) on the Y-plane is simply (-z, 0, x).
                    _right.set(-_forward.z, 0, _forward.x);
                    state.strafeDirection = Math.sign(_right.dot(_v1));
                } else {
                    state.strafeDirection = 0;
                }

                const oldX = playerGroup.position.x;
                const oldZ = playerGroup.position.z;

                // Motion-Based Triggering
                _v1.multiplyScalar(speed * delta);
                this.performMove(playerGroup, _v1, state, session, simTime, delta);

                const dx = playerGroup.position.x - oldX;
                const dz = playerGroup.position.z - oldZ;
                const movedDist = Math.sqrt(dx * dx + dz * dz);

                const intendedDist = speed * delta;
                const mobilityRatio = movedDist / Math.max(0.001, intendedDist);

                // Velocity Gate: Accumulate ONLY if moving decisively
                if (mobilityRatio > 0.2 && movedDist > 0.001) {
                    state.distanceSinceLastStep += movedDist;

                    const distMult = state.isRushing ? 0.8 : 1.0;
                    const reqDist = state.minStepDistance * distMult;

                    if (state.distanceSinceLastStep >= reqDist) {
                        state.distanceSinceLastStep = 0;
                        state.lastStepRight = !state.lastStepRight;

                        FootprintSystem.addFootprint(
                            session,
                            playerGroup.position,
                            playerGroup.rotation.y,
                            state.lastStepRight,
                            state.isRushing,
                            inWater,
                            isSwimming,
                            session.worldStreamer.getGroundMaterial(playerGroup.position.x, playerGroup.position.z)
                        );

                        let noiseType = NoiseType.PLAYER_WALK;
                        let noiseRadius = NOISE_RADIUS[NoiseType.PLAYER_WALK];

                        if (isSwimming) {
                            noiseType = NoiseType.PLAYER_SWIM;
                            noiseRadius = NOISE_RADIUS[NoiseType.PLAYER_SWIM];
                        } else if (state.isRushing) {
                            noiseType = NoiseType.PLAYER_RUSH;
                            noiseRadius = NOISE_RADIUS[NoiseType.PLAYER_RUSH];
                        }

                        session.makeNoise(playerGroup.position, noiseType, noiseRadius);
                    }
                } else {
                    // We are pushing against a wall or stuck
                    state.distanceSinceLastStep = 0;
                }
            } else {
                state.isBacking = false;
                state.isStrafing = false;
                state.strafeDirection = 0;
                state.distanceSinceLastStep = 0;
            }
        }

        if (isMovingVal || acts[InputAction.FIRE] || acts[InputAction.DODGE]) state.lastActionTime = simTime;
        return isMovingVal;
    }

    private performMove(playerGroup: THREE.Group, baseMoveVec: THREE.Vector3, state: any, session: GameSessionLogic, simTime: number, delta: number) {
        const dist = baseMoveVec.length();
        if (dist < 0.001) return;

        const MAX_STEP = 0.2;
        const steps = Math.ceil(dist / MAX_STEP);
        _v2.copy(baseMoveVec).divideScalar(steps);

        const canKnockback = state.isRushing || state.isDodging;
        const searchRadius = canKnockback ? 2.5 : 1.0;

        if (canKnockback) {
            // Populate Zero-GC context for the plow physics
            this._knockbackCtx.worldStreamer = session.worldStreamer;
            this._knockbackCtx.applyDamage = state.callbacks?.applyDamage;
            this._knockbackCtx.scene = session.engine.scene;
            this._knockbackCtx.engine = session.engine;
            this._knockbackCtx.spawnParticle = session.spawnParticle;

            // UNIFIED PLOW PHYSICS (Data-driven ragdoll scaling)
            EnemyManager.knockbackEnemies(
                this._knockbackCtx,
                playerGroup.position,
                searchRadius,
                state.isDodging ? 15 : 50, // Max Force
                0,                         // Max Damage (Damage only applied on landing!)
                DamageType.PHYSICAL,
                state.isDodging ? DamageID.DODGE : DamageID.RUSH
            );
        }

        const distMoved = _v2.length();

        // Hoist per-frame work outside the relaxation loop:
        // - Distance tracking fires once per move call, not per sub-step.
        // - Enemy spatial query: enemies don't relocate between sub-steps of a single frame.
        //   Query once at the player's current position with a small radius (1.2m).
        const streamer = session.worldStreamer;

        const tracker = session.getSystem<any>(SystemID.DAMAGE_TRACKER);
        if (tracker) {
            tracker.recordDistance(session, distMoved);
            if (state.isRushing) {
                tracker.recordRushDistance(session, distMoved);
            }
        }

        const enPool = streamer.getEnemyPool();
        const enPoolIdx = enPool.nextIndex();
        streamer.getNearbyEnemies(playerGroup.position.x, playerGroup.position.z, 1.2, enPoolIdx);
        const nearbyEnemies = enPool.getPool(enPoolIdx);
        const enCount = enPool.getCount(enPoolIdx);

        for (let s = 0; s < steps; s++) {
            _v3.copy(playerGroup.position).add(_v2);

            const obsPool = streamer.getObstaclePool();
            const obsPoolIdx = obsPool.nextIndex();
            streamer.getNearbyObstacles(_v3.x, _v3.z, 2.5, obsPoolIdx);

            const nearbyObs = obsPool.getPool(obsPoolIdx);
            const obsCount = obsPool.getCount(obsPoolIdx);

            for (let i = 0; i < 4; i++) {
                let adjusted = false;

                // --- 1. ENEMY COLLISION RESOLUTION (Standard Soft Shove) ---
                for (let j = 0; j < enCount; j++) {
                    const enemy = nearbyEnemies[j];
                    const distSq = _v3.distanceToSquared(enemy.mesh.position);
                    if (distSq < PHYSICS.SOFT_SHOVE_RADIUS_SQ) {
                        // Sqrt Purge! 
                        // Using squared approximation for soft shove (RADIUS_SQ - distSq) * force
                        const overlap = (PHYSICS.SOFT_SHOVE_RADIUS_SQ - distSq) * PHYSICS.SOFT_SHOVE_FORCE;
                        _v1.subVectors(_v3, enemy.mesh.position).normalize().multiplyScalar(overlap);
                        _v3.add(_v1);
                        adjusted = true;
                    }
                }

                // --- 2. STANDARD WALL/OBJECT COLLISION ---
                for (let j = 0; j < obsCount; j++) {
                    const obs = nearbyObs[j];

                    if (applyCollisionResolution(_v3, 0.5, obs)) {
                        adjusted = true;

                        if (obs.mesh && obs.mesh.userData.velocity) {
                            const mass = obs.mesh.userData.mass || 1000.0;
                            const massInverse = 1.0 / Math.max(0.5, mass);
                            let pushForce = (canKnockback ? 6.0 : 1.5) * massInverse;

                            _v1.copy(_v3).sub(playerGroup.position).normalize().multiplyScalar(pushForce);
                            if (obs.mesh.userData.isBall) _v1.multiplyScalar(2.0);

                            (obs.mesh.userData.velocity as THREE.Vector3).add(_v1);
                        }
                    }
                }

                // If no collision occurred during this iteration, we don't need to iterate again!
                if (!adjusted) break;
            }

            playerGroup.position.copy(_v3);
        }
    }

    private handleRotation(playerGroup: THREE.Group, input: any, state: any, isMobileDevice: boolean, disableInput: boolean, isMoving: boolean, session: GameSessionLogic) {
        if (disableInput) return;
        const angle = session.cameraAngle || 0;

        if (isMobileDevice) {
            const joystickAim = input.joystickAim;
            const isAiming = joystickAim && joystickAim.lengthSq() > 0.25;
            const stick = isAiming ? joystickAim : (input.joystickMove?.lengthSq() > 0.1 ? input.joystickMove : null);

            // If we are charging a throwable, we only rotate to the stick IF it's an aim stick.
            // If the aim stick is released while charging, we remain facing the locked throw rotation
            // and IGNORE the movement stick for rotation.
            if (state.throwChargeStart > 0) {
                if (isAiming) {
                    _v1.set(stick.x, 0, stick.y);
                    if (angle !== 0) _v1.applyAxisAngle(_UP, angle);
                    _v5.set(playerGroup.position.x + _v1.x * 10, playerGroup.position.y, playerGroup.position.z + _v1.z * 10);
                    playerGroup.lookAt(_v5);
                } else {
                    // Lock to the cached throw rotation
                    playerGroup.quaternion.copy(state.throwChargeRotation);
                }
                return;
            }

            if (stick) {
                _v1.set(stick.x, 0, stick.y);
                if (angle !== 0) _v1.applyAxisAngle(_UP, angle);

                _v5.set(
                    playerGroup.position.x + _v1.x * 10,
                    playerGroup.position.y,
                    playerGroup.position.z + _v1.z * 10
                );
                playerGroup.lookAt(_v5);
            }
        } else {
            // --- DESKTOP / MOUSE ---
            const isCharging = state.throwChargeStart > 0;
            const hasAimInput = input.aimVector && input.aimVector.lengthSq() > 1;

            if (hasAimInput) {
                _v1.set(input.aimVector.x, 0, input.aimVector.y);
                if (angle !== 0) _v1.applyAxisAngle(_UP, angle);

                _v5.set(
                    playerGroup.position.x + _v1.x,
                    playerGroup.position.y,
                    playerGroup.position.z + _v1.z
                );
                playerGroup.lookAt(_v5);
            } else if (isCharging) {
                // Keep facing the throw direction even if mouse isn't moving
                playerGroup.quaternion.copy(state.throwChargeRotation);
            } else if (isMoving) {
                if (_v6.lengthSq() > 0) {
                    _v1.copy(_v6).normalize();
                    if (angle !== 0) _v1.applyAxisAngle(_UP, angle);

                    _v5.set(
                        playerGroup.position.x + _v1.x * 10,
                        playerGroup.position.y,
                        playerGroup.position.z + _v1.z * 10
                    );
                    playerGroup.lookAt(_v5);
                }
            }
        }
    }
}
