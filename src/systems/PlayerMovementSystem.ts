import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { FXSystem } from './FXSystem';
import { DamageID } from '../entities/player/CombatTypes';
import { PERKS, StatusEffectType } from '../content/perks';
import { applyCollisionResolution } from '../core/world/CollisionResolution';
import { soundManager } from '../utils/audio/SoundManager';
import { EnemyManager } from '../entities/enemies/EnemyManager';
import { _buoyancyResult } from './WaterSystem';
import { NOISE_RADIUS, NoiseType } from '../entities/enemies/EnemyTypes';
import { GEOMETRY, MATERIALS } from '../utils/assets';
import { FootprintSystem } from './FootprintSystem';
import { PlayerStatID, PlayerStatusFlags } from '../entities/player/PlayerTypes';
import { SoundID } from '../utils/audio/AudioTypes';

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
    id = 'player_movement';

    // Zero-GC context bridge for EnemyManager physics 
    private _knockbackCtx: any = {
        collisionGrid: null,
        applyDamage: null,
        scene: null,
        engine: null,
        particles: null
    };

    private _shieldMesh: THREE.Mesh | null = null;

    constructor(private playerGroup: THREE.Group) { }

    update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        const state = session.state;
        const stats = state.statsBuffer;

        if ((state.statusFlags & PlayerStatusFlags.DEAD) !== 0) return;
        if ((state.statusFlags & PlayerStatusFlags.STUNNED) !== 0) return;

        // --- CINEMATIC LOCK (Zero-Velocity) ---
        // As per guardrail: Kill velocity and return early to prevent "sliding" during focus
        if (state.cinematicActive) {
            state.isMoving = false;
            if (this.playerGroup.userData.velocity) {
                this.playerGroup.userData.velocity.set(0, 0, 0);
            }
            return;
        }

        const input = session.engine.input.state;
        const disableInput = session.inputDisabled || false;

        // --- APPLY DYNAMIC MULTIPLIERS (DOD) ---
        // Final Speed is pre-calculated in m/s (Unit conversion + Perk Multipliers) by PlayerStatsSystem
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
        const perkID = StatusEffectType.REFLEX_SHIELD;
        const perk = PERKS[perkID];
        if (!perk) return;

        // Trigger if off cooldown
        if (simTime - state.lastReflexShieldTime > perk.cooldown) {
            state.lastReflexShieldTime = simTime;

            // Add the buff (Zero-GC SoA)
            state.effectDurations[perkID] = perk.duration || 500;
            state.effectIntensities[perkID] = 1;

            // Discovery (Numeric SMI check)
            if (!state.discoveredPerks.includes(perkID as any)) {
                state.discoveredPerks.push(perkID as any);
                session.triggerDiscovery('perk', perkID, perk.displayName, perk.description);
            }
        }
    }

    private updateInvincibleGlow(state: any, renderTime: number) {
        if (state.sectorState.isInvincible) {
            if (!this._shieldMesh) {
                this._shieldMesh = new THREE.Mesh(GEOMETRY.reflexShield, MATERIALS.reflexShield);
                this._shieldMesh.position.y = 1.0;
                this.playerGroup.add(this._shieldMesh);
            }

            // Pulse effect
            const sineWave = Math.sin(renderTime * 0.005) * 0.05;

            (this._shieldMesh.material as THREE.MeshBasicMaterial).opacity = 0.15 + sineWave;
            this._shieldMesh.scale.setScalar(1.0 + sineWave);
            this._shieldMesh.visible = true;
        } else if (this._shieldMesh) {
            this._shieldMesh.visible = false;
        }
    }

    private handleMovement(
        playerGroup: THREE.Group,
        input: any,
        state: any,
        delta: number,
        simTime: number,
        disableInput: boolean,
        session: GameSessionLogic,
        currentSpeed: number
    ): boolean {
        const stats = state.statsBuffer;

        // --- 1. Ability Triggering (Rush & Dodge) ---
        if (!input.space) {
            if (state.isRushing) {
                state.isRushing = false;
                state.lastRushEndTime = simTime;
            }

            // Check for Dodge trigger on release (Short Press)
            if (state.spaceDepressed && !state.isDodging && !state.isRushing) {
                const pressDuration = simTime - state.spacePressTime;
                if (pressDuration < 150) {
                    if (stats[PlayerStatID.STAMINA] >= 15) {
                        stats[PlayerStatID.STAMINA] -= 15;
                        state.lastStaminaUseTime = simTime;
                        state.isDodging = true;
                        state.dodgeStartTime = simTime;
                        state.dodgeDir.set(0, 0, 0);
                    }
                }
            }

            state.spaceDepressed = false;
            state.rushCostPaid = false;
        }

        // Initiation
        if (input.space && !state.spaceDepressed && !disableInput) {
            state.spaceDepressed = true;
            state.spacePressTime = simTime;
            state.rushCostPaid = false;
        }

        // Handle Rush (Hold Space)
        if (state.spaceDepressed && !state.isDodging && !state.isRushing) {
            if (simTime - state.spacePressTime >= 150) {
                if (stats[PlayerStatID.STAMINA] >= 10) {
                    state.isRushing = true;
                    stats[PlayerStatID.STAMINA] -= 2;
                    state.rushCostPaid = true;
                    state.lastStaminaUseTime = simTime;

                    // --- BUFF: Trigger Shield on Initiation ---
                    this.checkReflexShield(session, simTime);
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

            if (inWater) {
                const flatDepth = _buoyancyResult.baseWaterLevel - _buoyancyResult.groundY;

                if (flatDepth > 1.25) {
                    isSwimming = true;
                    speed *= 0.35;
                } else if (flatDepth > 0.95 && isSwimming) {
                    isSwimming = true;
                    speed *= 0.35;
                } else if (flatDepth > 0.4) {
                    isSwimming = false;
                    isWading = true;
                    speed *= 0.6;
                } else {
                    isSwimming = false;
                    speed *= 0.85;
                }

                const swimY = _buoyancyResult.waterLevel - 0.35;
                const targetY = isSwimming ? swimY : _buoyancyResult.groundY;
                playerGroup.position.y = THREE.MathUtils.lerp(playerGroup.position.y, targetY, 4 * delta);
            } else {
                isSwimming = false;
                isWading = false;
                if (playerGroup.position.y !== 0) {
                    playerGroup.position.y = THREE.MathUtils.lerp(playerGroup.position.y, 0, 15 * delta);
                    if (Math.abs(playerGroup.position.y) < 0.01) playerGroup.position.y = 0;
                }
            }
        }

        state.isSwimming = isSwimming;
        state.isWading = isWading;

        // --- 3. EXTINGUISH BURNING IN WATER ---
        if (inWater && state.effectDurations[StatusEffectType.BURNING] > 0) {
            state.effectDurations[StatusEffectType.BURNING] = 0;
            soundManager.playSound(SoundID.STEAM_HISS);
        }

        // --- 4. STAMINA & REGENERATION ---
        const waterStaminaDrain = isSwimming ? 7 : (isWading ? 3 : 0);
        if (waterStaminaDrain > 0 && !state.vehicle.active) {
            state.lastStaminaUseTime = simTime;
            stats[PlayerStatID.STAMINA] = Math.max(0, stats[PlayerStatID.STAMINA] - waterStaminaDrain * delta);

            if (isSwimming && stats[PlayerStatID.STAMINA] < 0.1) {
                speed *= 0.5;

                // --- Unified Drowning Logic ---
                // We only apply the status effect here. The PlayerStatsSystem handles the damage tick.
                if (state.callbacks && state.callbacks.onPlayerHit) {
                    state.callbacks.onPlayerHit(0, null, DamageID.DROWNING, true, StatusEffectType.DROWNING, 1500);
                }
            }
        }

        if (state.isRushing) {
            this.checkReflexShield(session, simTime);

            // --- CONSOLIDATED RUSH SPEED (2.0x) ---
            speed *= 2.0;

            // --- STEADY STAMINA DRAIN (22/sec) ---
            stats[PlayerStatID.STAMINA] = Math.max(0, stats[PlayerStatID.STAMINA] - delta * 22);
            state.lastStaminaUseTime = simTime;
            state.statusFlags |= PlayerStatusFlags.RUSHING;

            if (stats[PlayerStatID.STAMINA] <= 0) {
                state.statusFlags |= PlayerStatusFlags.EXHAUSTED;
                state.isRushing = false;
                state.lastRushEndTime = simTime;
                state.statusFlags &= ~PlayerStatusFlags.RUSHING;
            } else if (stats[PlayerStatID.STAMINA] >= stats[PlayerStatID.MAX_STAMINA] * 0.5) {
                state.statusFlags &= ~PlayerStatusFlags.EXHAUSTED;
            }
        }
        else if (!state.isDodging && !state.isRushing && waterStaminaDrain === 0) {
            // Natural regeneration only if idle/walking and not soon after stamina use
            if (simTime - state.lastStaminaUseTime > 2500) {
                stats[PlayerStatID.STAMINA] = Math.min(stats[PlayerStatID.MAX_STAMINA], stats[PlayerStatID.STAMINA] + 15 * delta);
            }
        }

        if (stats[PlayerStatID.HP] < stats[PlayerStatID.MAX_HP] &&
            !(state.statusFlags & PlayerStatusFlags.DEAD) &&
            simTime - state.lastDamageTime > 5000) {
            stats[PlayerStatID.HP] = Math.min(stats[PlayerStatID.MAX_HP], stats[PlayerStatID.HP] + 3 * delta);
        }

        let isMovingVal = false;

        // --- 3. MOVE PROCESSING ---
        if (state.isDodging) {
            if (state.dodgeDir.lengthSq() === 0) {
                // Set direction once at start of dodge
                _v6.set(0, 0, 0);
                if (input.w) _v6.z -= 1; if (input.s) _v6.z += 1;
                if (input.a) _v6.x -= 1; if (input.d) _v6.x += 1;

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
                soundManager.playSound(SoundID.DASH);
                session.makeNoise(playerGroup.position, NoiseType.PLAYER_DODGING, NOISE_RADIUS[NoiseType.PLAYER_DODGING]);

                FXSystem.spawnPart(
                    session.engine.scene, state.particles,
                    playerGroup.position.x, 0.5, playerGroup.position.z,
                    'large_smoke', 2, undefined, undefined, 0xcccccc, 1.2
                );
            }

            if (simTime < state.dodgeStartTime + 300) {
                const dodgeSpeed = speed * 2.5;
                _v1.copy(state.dodgeDir).multiplyScalar(dodgeSpeed * delta);
                this.performMove(playerGroup, _v1, state, session, simTime, delta);
                isMovingVal = true;
            } else {
                state.isDodging = false;
                state.dodgeSmokeSpawned = false;
                state.dodgeDir.set(0, 0, 0);
                state.lastDodgeEndTime = simTime;
            }
        } else if (!disableInput) {
            _v6.set(0, 0, 0);
            if (input.w) _v6.z -= 1; if (input.s) _v6.z += 1;
            if (input.a) _v6.x -= 1; if (input.d) _v6.x += 1;

            if (input.joystickMove) {
                _v6.x += input.joystickMove.x;
                _v6.z += input.joystickMove.y;
            }

            const disorientedDuration = state.effectDurations[StatusEffectType.DISORIENTED];
            const isDisoriented = disorientedDuration > 0;

            if (isDisoriented) {
                const noise = Math.sin(simTime * 0.01) * 0.5;
                _v6.x += noise;
                if (simTime % 300 < 50) {
                    _v6.x += (Math.random() - 0.5) * 2;
                    _v6.z += (Math.random() - 0.5) * 2;
                }
            }

            if (_v6.lengthSq() > 0) {
                isMovingVal = true;
                const camAngle = session.cameraAngle || 0;

                _v1.copy(_v6).normalize();
                if (camAngle !== 0) _v1.applyAxisAngle(_UP, camAngle);

                _forward.set(0, 0, 1).applyQuaternion(playerGroup.quaternion).normalize();
                const dot = _forward.dot(_v1);

                state.isBacking = dot < -0.4;
                state.isStrafing = Math.abs(dot) < 0.4;

                if (state.isStrafing) {
                    _right.crossVectors(_forward, _UP).normalize();
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
                            isSwimming
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

        if (isMovingVal || input.fire || input.space) state.lastActionTime = simTime;
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
            this._knockbackCtx.collisionGrid = state.collisionGrid;
            this._knockbackCtx.applyDamage = state.callbacks?.applyDamage;
            this._knockbackCtx.scene = session.engine.scene;
            this._knockbackCtx.engine = session.engine;
            this._knockbackCtx.particles = state.particles;

            // UNIFIED PLOW PHYSICS (Data-driven ragdoll scaling)
            EnemyManager.knockbackEnemies(
                this._knockbackCtx,
                playerGroup.position,
                searchRadius,
                state.isDodging ? 25 : 15, // Max Force
                state.isDodging ? 5 : 2,   // Max Damage
                DamageID.PHYSICAL
            );
        }

        for (let s = 0; s < steps; s++) {
            _v3.copy(playerGroup.position).add(_v2);

            const nearbyObs = state.collisionGrid.getNearbyObstacles(_v3, 2.5);
            const nLen = nearbyObs.length;

            for (let i = 0; i < 4; i++) {
                let adjusted = false;

                // --- 1. ENEMY COLLISION RESOLUTION (Standard Soft Shove) ---
                const nearbyEnemies = state.collisionGrid.getNearbyEnemies(_v3, 1.2);
                for (let j = 0; j < nearbyEnemies.length; j++) {
                    const enemy = nearbyEnemies[j];
                    const distSq = _v3.distanceToSquared(enemy.mesh.position);
                    if (distSq < 0.6) {
                        const overlap = 0.77 - Math.sqrt(distSq);
                        _v1.subVectors(_v3, enemy.mesh.position).normalize().multiplyScalar(overlap);
                        _v3.add(_v1);
                        adjusted = true;
                    }
                }

                // --- 2. STANDARD WALL/OBJECT COLLISION ---
                for (let j = 0; j < nLen; j++) {
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
            const stick = (input.joystickAim?.lengthSq() > 0.25) ? input.joystickAim : (input.joystickMove?.lengthSq() > 0.1 ? input.joystickMove : null);

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
            if (input.aimVector && input.aimVector.lengthSq() > 1) {
                _v1.set(input.aimVector.x, 0, input.aimVector.y);
                if (angle !== 0) _v1.applyAxisAngle(_UP, angle);

                _v5.set(
                    playerGroup.position.x + _v1.x,
                    playerGroup.position.y,
                    playerGroup.position.z + _v1.z
                );
                playerGroup.lookAt(_v5);

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