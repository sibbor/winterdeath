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
import { StatID, PlayerStatusFlags } from '../types/CareerStats';
import { SoundID } from '../utils/audio/AudioTypes';
import { InputAction } from '../core/engine/InputManager';
import { PLAYER, PHYSICS, COMBAT } from '../content/constants';
import { CareerStatsSystem } from './CareerStatsSystem';
import { MaterialType } from '../content/environment';

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
        handleEnemyHit: null,
        scene: null,
        engine: null,
        spawnParticle: null
    };

    private _invincibilityMesh: THREE.Mesh | null = null;
    private _buffShieldMesh: THREE.Mesh | null = null;

    constructor(private playerGroup: THREE.Group) {
        // 100% Zero-GC Mesh Pre-allocation
        this._invincibilityMesh = new THREE.Mesh(GEOMETRY.reflexShield, MATERIALS.reflexShield);
        this._invincibilityMesh.position.y = 1.0;
        this._invincibilityMesh.visible = false;
        this.playerGroup.add(this._invincibilityMesh);
    }

    init(session: GameSessionLogic) {
    }

    update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        if (!session || !session.engine || !session.state) return;

        const state = session.state;
        const stats = state.player.statsBuffer;
        if (!stats) return;

        if ((state.combat.statusFlags & PlayerStatusFlags.DEAD) !== 0) return;
        if ((state.combat.statusFlags & PlayerStatusFlags.STUNNED) !== 0) return;

        // --- CINEMATIC LOCK (Zero-Velocity) ---
        if (state.ui.cinematicActive) {
            state.player.isMoving = false;
            state.player.velocity.set(0, 0, 0);
            return;
        }

        const input = session.engine.input.state;
        const disableInput = session.inputDisabled || false;

        // --- 1. SSoT SPEED AGGREGATION (Zero-GC) ---
        // Vinterdöd Refactor: Use the frame-perfect baked speed calculated by the PerkSystem.
        const currentSpeed = stats[StatID.FINAL_SPEED];

        if (state.vehicle.active) {
            state.player.isMoving = false;
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

        state.player.isMoving = isMoving;

        this.handleRotation(
            this.playerGroup,
            input,
            state,
            session.isMobileDevice,
            disableInput,
            isMoving,
            session
        );

        // Sync player aimDirection with final mesh rotation for continuous weapons (e.g. Flamethrower)
        _v1.set(0, 0, 1).applyQuaternion(this.playerGroup.quaternion);
        state.player.aimDirection.set(_v1.x, _v1.z).normalize();

        this.updateInvincibleGlow(state, session.state.renderTime);
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
        const stats = state.player.statsBuffer;

        // --- 1. Ability Triggering (Rush & Dodge) ---
        const acts = input.actions;
        if (!acts[InputAction.DODGE]) {
            // Check for Dodge trigger on release (Short Press)
            if (state.inputState.spaceDepressed) {
                const pressDuration = simTime - state.player.spacePressTime;

                // Increased window (150->200ms) and added '!state.isDodging' check
                const dodgeCost = ABILITIES[AbilityID.DODGE].staminaCost || 20;
                if (!state.player.isRushing && !state.player.isDodging && pressDuration < PLAYER.DODGE_PRESS_THRESHOLD) {
                    if (stats[StatID.STAMINA] >= dodgeCost) {
                        stats[StatID.STAMINA] -= dodgeCost;
                        state.player.lastStaminaUseTime = simTime;
                        state.player.isDodging = true;
                        state.player.dodgeStartTime = simTime; // Logic MUST use simTime for parity
                        state.player.dodgeDir.set(0, 0, 0); // Reset to recalc next frame

                        // --- TRACK NEW METRIC (UNIFIED) ---
                        CareerStatsSystem.recordDodge(session);
                    }
                }
            }

            if (state.player.isRushing) {
                state.player.isRushing = false;
                state.player.lastRushEndTime = simTime;
                // Clear flag immediately for responsive animation
                state.combat.statusFlags &= ~PlayerStatusFlags.RUSHING;
            }

            state.inputState.spaceDepressed = false;
            state.player.rushCostPaid = false;
        } else {
            // Initiation
            if (!state.inputState.spaceDepressed && !disableInput) {
                state.inputState.spaceDepressed = true;
                state.player.spacePressTime = simTime;
                state.player.rushCostPaid = false;
            }

            // Handle Rush Elevation (Hold Space)
            if (state.inputState.spaceDepressed && !state.player.isDodging) {
                if (simTime - state.player.spacePressTime >= PLAYER.RUSH_HOLD_THRESHOLD) {
                    const rushCost = ABILITIES[AbilityID.RUSH].staminaCost || 25;
                    const canStartOrContinue = state.player.isRushing ? (stats[StatID.STAMINA] > 0) : (stats[StatID.STAMINA] >= rushCost);

                    if (canStartOrContinue) {
                        if (!state.player.isRushing) {
                            state.player.isRushing = true;
                            state.player.rushCostPaid = true;
                            state.combat.statusFlags |= PlayerStatusFlags.RUSHING;

                            // --- TRACK NEW METRIC (UNIFIED) ---
                            CareerStatsSystem.recordRush(session);
                        }

                        state.player.lastStaminaUseTime = simTime;
                    } else {
                        state.player.isRushing = false;
                        state.combat.statusFlags &= ~PlayerStatusFlags.RUSHING;
                    }
                }
            }
        }

        let speed = currentSpeed;

        // --- 2. WATER PHYSICS & DRAG ---
        let inWater = false;
        let isSwimming = state.player.isSwimming || false;
        let isWading = false;

        if (session.engine.systems.ground) {
            // getGroundHeight is the SSoT: it applies the frame-stamped cache, Y-height gate,
            // and water-proximity gate before calling checkBuoyancy — populating _buoyancyResult
            // as a side-effect. No direct checkBuoyancy call is needed here.
            const groundY = session.engine.systems.ground.getGroundHeight(
                playerGroup.position.x, playerGroup.position.z, session, playerGroup.position.y
            );
            inWater = _buoyancyResult.inWater && !state.vehicle.active;

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
                playerGroup.position.y = THREE.MathUtils.lerp(playerGroup.position.y, targetY, Math.min(1.0, 4 * delta));
            } else {
                isSwimming = false;
                isWading = false;
                if (playerGroup.position.y !== groundY) {
                    playerGroup.position.y = THREE.MathUtils.lerp(playerGroup.position.y, groundY, Math.min(1.0, 15 * delta));
                    if (Math.abs(playerGroup.position.y - groundY) < 0.01) playerGroup.position.y = groundY;
                }
            }
        }


        state.player.isSwimming = isSwimming;
        state.player.isWading = isWading;

        // Cleanse drowning debuff immediately when player is no longer swimming (reached ground/wading depth)
        if (!isSwimming && state.combat.effectDurations[StatusEffectID.DROWNING] > 0) {
            state.combat.effectDurations[StatusEffectID.DROWNING] = 0;
        }

        // --- 3. EXTINGUISH BURNING IN WATER ---
        if (inWater && state.combat.effectDurations[StatusEffectID.BURNING] > 0) {
            state.combat.effectDurations[StatusEffectID.BURNING] = 0;
            audioEngine.playSound(SoundID.STEAM_HISS);
        }

        // --- 4. STAMINA & REGENERATION ---
        const waterStaminaDrain = isSwimming ? COMBAT.STAMINA_DRAIN_SWIM : (isWading ? COMBAT.STAMINA_DRAIN_WADE : 0);
        if (waterStaminaDrain > 0 && !state.vehicle.active) {
            state.player.lastStaminaUseTime = simTime;
            stats[StatID.STAMINA] = Math.max(0, stats[StatID.STAMINA] - waterStaminaDrain * delta);

            if (isSwimming && stats[StatID.STAMINA] < 0.1) {
                speed *= 0.5;

                // --- Unified Drowning Logic ---
                // We only apply the status effect here. The PlayerStatsSystem handles the damage tick.
                if (state.callbacks && state.callbacks.handlePlayerHit) {
                    state.callbacks.handlePlayerHit(0, null, DamageType.DROWNING, DamageID.DROWNING, true, StatusEffectID.DROWNING, 1500);
                }
            }
        }

        const rushRampSpeed = delta * PLAYER.RUSH_RAMP_SPEED; // 2 seconds for full ramp

        if (state.player.isRushing) {
            // --- PROGRESSIVE RAMP-UP (2.0s) ---
            state.player.rushFactor = Math.min(1.0, state.player.rushFactor + rushRampSpeed);

            // --- DYNAMIC STAMINA DRAIN (Ramping based on Ability DB) ---
            const ability = ABILITIES[AbilityID.RUSH];
            const drainRate = (ability.staminaCost || 5) + (state.player.rushFactor * 17);
            stats[StatID.STAMINA] = Math.max(0, stats[StatID.STAMINA] - delta * drainRate);
            state.player.lastStaminaUseTime = simTime;
            state.combat.statusFlags |= PlayerStatusFlags.RUSHING;

            if (stats[StatID.STAMINA] <= 0) {
                state.player.isRushing = false;
                state.player.lastRushEndTime = simTime;
                state.combat.statusFlags &= ~PlayerStatusFlags.RUSHING;
            }
        } else {
            // --- Properly ramp down when not rushing ---
            state.player.rushFactor = Math.max(0, state.player.rushFactor - rushRampSpeed);
            state.combat.statusFlags &= ~PlayerStatusFlags.RUSHING;
        }

        // --- 4. FINAL VELOCITY RESOLUTION ---
        // Apply Rush Multiplier (1.0x to 2.0x) universally to the pre-calculated speed.
        // This ensures perk modifiers are correctly inherited during the rush ramp.
        speed *= (1.0 + state.player.rushFactor);

        // Update Speed Ratio for Animation Sync (Base = 1.0)
        state.player.currentSpeedRatio = speed / Math.max(0.001, currentSpeed);

        if (!state.player.isDodging && !state.player.isRushing && waterStaminaDrain === 0) {
            // Natural regeneration only if idle/walking and not soon after stamina use
            if (simTime - state.player.lastStaminaUseTime > COMBAT.STAMINA_REGEN_DELAY) {
                stats[StatID.STAMINA] = Math.min(stats[StatID.MAX_STAMINA], stats[StatID.STAMINA] + COMBAT.STAMINA_REGEN_IDLE * delta);
            }
        }

        if (stats[StatID.HP] < stats[StatID.MAX_HP] &&
            !(state.combat.statusFlags & PlayerStatusFlags.DEAD) &&
            simTime - state.player.lastDamageTime > COMBAT.HP_REGEN_DELAY) {
            stats[StatID.HP] = Math.min(stats[StatID.MAX_HP], stats[StatID.HP] + COMBAT.HP_REGEN_IDLE * delta);
        }

        let isMovingVal = false;

        // --- 3. MOVE PROCESSING ---
        if (state.player.isDodging) {
            if (state.player.dodgeDir.lengthSq() === 0) {
                // Set direction once at start of dodge
                _v6.set(0, 0, 0);
                if (acts[InputAction.UP]) _v6.z -= 1; if (acts[InputAction.DOWN]) _v6.z += 1;
                if (acts[InputAction.LEFT]) _v6.x -= 1; if (acts[InputAction.RIGHT]) _v6.x += 1;

                if (_v6.lengthSq() > 0) {
                    const camAngle = session.cameraAngle || 0;
                    state.player.dodgeDir.copy(_v6).normalize();
                    if (camAngle !== 0) state.player.dodgeDir.applyAxisAngle(_UP, camAngle);
                } else {
                    state.player.dodgeDir.set(0, 0, 1).applyQuaternion(playerGroup.quaternion).normalize();
                }
            }

            if (!state.player.dodgeSmokeSpawned && !inWater) {
                state.player.dodgeSmokeSpawned = true;
                audioEngine.playSound(SoundID.DODGE);
                session.makeNoise(playerGroup.position, NoiseType.PLAYER_DODGING, NOISE_RADIUS[NoiseType.PLAYER_DODGING]);

                // Perk: Quick Finger
                // Proximity-Based perfect dodge mechanic
                if (session.systems.worldStreamer) {
                    const pool = session.systems.worldStreamer.getEnemyPool();
                    const poolIdx = pool.nextIndex();
                    session.systems.worldStreamer.getNearbyEnemies(playerGroup.position.x, playerGroup.position.z, 5, poolIdx);

                    if (pool.getCount(poolIdx) > 0) {
                        session.systems.perkSystem!.applyPerk(session, StatusEffectID.QUICK_FINGER);
                    }
                }

                FXSystem.spawnParticle(
                    session.engine.scene, state.combat.particles,
                    playerGroup.position.x, 0.5, playerGroup.position.z,
                    FXParticleType.LARGE_SMOKE, 2, undefined, undefined, 0xcccccc, 1.2
                );
            }

            if (simTime < state.player.dodgeStartTime + COMBAT.DODGE_DURATION) {
                const dodgeSpeed = speed * 2.5;
                _v1.copy(state.player.dodgeDir).multiplyScalar(dodgeSpeed * delta);
                this.performMove(playerGroup, _v1, state, session, simTime, delta);
                isMovingVal = true;

                // SPAWN DODGE SMOKE CONTINUOUSLY
                if (Math.random() < 0.4) {
                    if (inWater) {
                        FXSystem.spawnParticle(
                            session.engine.scene, state.combat.particles,
                            playerGroup.position.x, playerGroup.position.y + 0.1, playerGroup.position.z,
                            FXParticleType.SPLASH, 1, undefined, undefined, 0xeeeeff, 0.8
                        );
                    } else {
                        const groundMat = session.systems.worldStreamer?.getGroundMaterial(playerGroup.position.x, playerGroup.position.z) || 0;
                        let pType = FXParticleType.SMOKE;
                        let pColor = 0xaaaaaa;
                        if (groundMat === MaterialType.SNOW || groundMat === MaterialType.NONE) { pType = FXParticleType.SNOW_PUFF; pColor = 0xffffff; }
                        else if (groundMat === MaterialType.DIRT || groundMat === MaterialType.WOOD) { pColor = 0x886644; }

                        FXSystem.spawnParticle(
                            session.engine.scene, state.combat.particles,
                            playerGroup.position.x, playerGroup.position.y + 0.1, playerGroup.position.z,
                            pType, 1, undefined, undefined, pColor, 0.4
                        );
                    }
                }

                // UNIFIED STATE SYNC
                state.combat.statusFlags |= PlayerStatusFlags.DODGING;
            } else {
                state.player.isDodging = false;
                state.combat.statusFlags &= ~PlayerStatusFlags.DODGING;
                state.player.dodgeSmokeSpawned = false;
                state.player.dodgeDir.set(0, 0, 0);
                state.player.lastDodgeEndTime = simTime;
            }
        } else if (!disableInput) {
            _v6.set(0, 0, 0);
            if (acts[InputAction.UP]) _v6.z -= 1; if (acts[InputAction.DOWN]) _v6.z += 1;
            if (acts[InputAction.LEFT]) _v6.x -= 1; if (acts[InputAction.RIGHT]) _v6.x += 1;

            if (input.joystickMove) {
                _v6.x += input.joystickMove.x;
                _v6.z += input.joystickMove.y;
            }

            const disorientedDuration = state.combat.effectDurations[StatusEffectID.DISORIENTED];
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

                state.player.isBacking = dot < -0.4;
                state.player.isStrafing = Math.abs(dot) < 0.4;

                if (state.player.isStrafing) {
                    // Bypass heavy crossVectors and Math.sqrt. 
                    // An orthogonal vector to (x, 0, z) on the Y-plane is simply (-z, 0, x).
                    _right.set(-_forward.z, 0, _forward.x);
                    state.player.strafeDirection = Math.sign(_right.dot(_v1));
                } else {
                    state.player.strafeDirection = 0;
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
                    state.player.distanceSinceLastStep += movedDist;

                    const distMult = state.player.isRushing ? 0.8 : 1.0;
                    const reqDist = state.player.minStepDistance * distMult;

                    if (state.player.distanceSinceLastStep >= reqDist) {
                        state.player.distanceSinceLastStep = 0;
                        state.player.lastStepRight = !state.player.lastStepRight;

                        let groundMaterial = session.systems.worldStreamer ? session.systems.worldStreamer.getGroundMaterial(playerGroup.position.x, playerGroup.position.z) : 0

                        FootprintSystem.addFootprint(
                            session,
                            playerGroup.position,
                            playerGroup.rotation.y,
                            state.player.lastStepRight,
                            state.player.isRushing,
                            inWater,
                            isSwimming,
                            groundMaterial
                        );

                        let noiseType = NoiseType.PLAYER_WALK;
                        let noiseRadius = NOISE_RADIUS[NoiseType.PLAYER_WALK];

                        if (inWater) {
                            FXSystem.spawnParticle(
                                session.engine.scene, state.combat.particles,
                                playerGroup.position.x, playerGroup.position.y + 0.1, playerGroup.position.z,
                                FXParticleType.SPLASH, 1, undefined, undefined, 0xeeeeff, 0.8
                            );
                        }

                        if (isSwimming) {
                            noiseType = NoiseType.PLAYER_SWIM;
                            noiseRadius = NOISE_RADIUS[NoiseType.PLAYER_SWIM];
                        } else if (state.player.isRushing) {
                            noiseType = NoiseType.PLAYER_RUSH;
                            noiseRadius = NOISE_RADIUS[NoiseType.PLAYER_RUSH];

                            if (!inWater) {
                                const groundMat = session.systems.worldStreamer?.getGroundMaterial(playerGroup.position.x, playerGroup.position.z) || 0;
                                let pType = FXParticleType.SMOKE;
                                let pColor = 0xaaaaaa;
                                if (groundMat === MaterialType.SNOW || groundMat === MaterialType.NONE) { pType = FXParticleType.SNOW_PUFF; pColor = 0xffffff; }
                                else if (groundMat === MaterialType.DIRT || groundMat === MaterialType.WOOD) { pColor = 0x886644; }

                                FXSystem.spawnParticle(
                                    session.engine.scene, state.combat.particles,
                                    playerGroup.position.x, playerGroup.position.y + 0.1, playerGroup.position.z,
                                    pType, 1, undefined, undefined, pColor, 0.4
                                );
                            }
                        }

                        session.makeNoise(playerGroup.position, noiseType, noiseRadius);
                    }
                } else {
                    // We are pushing against a wall or stuck
                    state.player.distanceSinceLastStep = 0;
                }
            } else {
                state.player.isBacking = false;
                state.player.isStrafing = false;
                state.player.strafeDirection = 0;
                state.player.distanceSinceLastStep = 0;
            }
        }

        if (isMovingVal || acts[InputAction.FIRE] || acts[InputAction.DODGE]) state.player.lastActionTime = simTime;
        return isMovingVal;
    }

    private performMove(playerGroup: THREE.Group, baseMoveVec: THREE.Vector3, state: any, session: GameSessionLogic, simTime: number, delta: number) {
        const dist = baseMoveVec.length();
        if (dist < 0.001) return;

        const MAX_STEP = 0.2;
        const steps = Math.ceil(dist / MAX_STEP);
        _v2.copy(baseMoveVec).divideScalar(steps);

        const canKnockback = state.player.isRushing || state.player.isDodging;
        const searchRadius = canKnockback ? 2.5 : 1.0;

        if (canKnockback) {
            // Populate Zero-GC context for the plow physics
            this._knockbackCtx.worldStreamer = session.systems.worldStreamer;
            this._knockbackCtx.handleEnemyHit = state.handleEnemyHit;
            this._knockbackCtx.scene = session.engine.scene;
            this._knockbackCtx.engine = session.engine;
            this._knockbackCtx.spawnParticle = session.spawnParticle;

            // UNIFIED PLOW PHYSICS (Data-driven ragdoll scaling)
            EnemyManager.knockbackEnemies(
                this._knockbackCtx,
                playerGroup.position,
                searchRadius,
                state.player.isDodging ? 15 : 40, // Max Force
                50,                               // Max Damage (Damage only applied on landing!)
                DamageType.PHYSICAL,
                state.player.isDodging ? DamageID.DODGE : DamageID.RUSH,
                state.player.isDodging ? state.player.dodgeDir : baseMoveVec
            );
        }

        const distMoved = _v2.length();

        // Hoist per-frame work outside the relaxation loop:
        // - Distance tracking fires once per move call, not per sub-step.
        // - Enemy spatial query: enemies don't relocate between sub-steps of a single frame.
        //   Query once at the player's current position with a small radius (1.2m).
        const streamer = session.systems.worldStreamer;

        CareerStatsSystem.recordDistance(session, distMoved);
        if (state.player.isRushing) {
            CareerStatsSystem.recordRushDistance(session, distMoved);
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
            if (state.combat.throwChargeStart > 0) {
                if (isAiming) {
                    _v1.set(stick.x, 0, stick.y);
                    if (angle !== 0) _v1.applyAxisAngle(_UP, angle);
                    _v5.set(playerGroup.position.x + _v1.x * 10, playerGroup.position.y, playerGroup.position.z + _v1.z * 10);
                    playerGroup.lookAt(_v5);
                } else {
                    // Lock to the cached throw rotation
                    playerGroup.quaternion.copy(state.combat.throwChargeRotation);
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
            const isCharging = state.combat.throwChargeStart > 0;
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
                playerGroup.quaternion.copy(state.combat.throwChargeRotation);
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
