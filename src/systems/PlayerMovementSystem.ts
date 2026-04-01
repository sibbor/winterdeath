import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { FXSystem } from './FXSystem';
import { StatusEffectType, DamageType, PerkCategory } from '../entities/player/CombatTypes';
import { PERKS } from '../content/perks';
import { applyCollisionResolution } from '../core/world/CollisionResolution';
import { soundManager } from '../utils/audio/SoundManager';
import { EnemyManager } from '../entities/enemies/EnemyManager';
import { _buoyancyResult } from './WaterSystem';
import { NOISE_RADIUS, NoiseType } from '../entities/enemies/EnemyTypes';
import { GEOMETRY, MATERIALS } from '../utils/assets';

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

    constructor(private playerGroup: THREE.Group) { }

    update(session: GameSessionLogic, delta: number, now: number) {
        const state = session.state;

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

        const engineRenderer = session.engine.renderer as any;
        const currentSectorData = engineRenderer._sectorData ?? (session as any).currentSectorData;
        const env = currentSectorData.environment;

        // --- APPLY DYNAMIC MULTIPLIERS ---
        const speedMult = state.multipliers.speed;
        const baseSpeed = state.speed;
        const currentSpeed = (baseSpeed * speedMult) / 3.6;

        if (state.vehicle.active) {
            state.isMoving = false;
            return;
        }

        const isMoving = this.handleMovement(
            this.playerGroup,
            input,
            state,
            delta,
            now,
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

        this.updateInvincibleGlow(state, now);
    }

    private checkReflexShield(session: GameSessionLogic, now: number) {
        const state = session.state;
        const perk = PERKS[StatusEffectType.REFLEX_SHIELD];
        if (!perk) return;

        // Trigger if off cooldown
        if (now - state.lastReflexShieldTime > perk.cooldown) {
            state.lastReflexShieldTime = now;

            // Add the buff for 500ms
            state.statusEffects[perk.id] = {
                duration: perk.duration,
                maxDuration: perk.duration,
                intensity: 1,
                damage: 0,
                lastTick: now
            };

            // Discovery
            if (!state.discoveredPerks.includes(perk.id)) {
                state.discoveredPerks.push(perk.id);
                session.triggerDiscovery('perk', perk.id, perk.displayName, perk.description);
            }
        }
    }

    private _shieldMesh: THREE.Mesh | null = null;
    private updateInvincibleGlow(state: any, now: number) {
        if (state.sectorState.isInvincible) {
            if (!this._shieldMesh) {
                this._shieldMesh = new THREE.Mesh(GEOMETRY.reflexShield, MATERIALS.reflexShield);
                this._shieldMesh.position.y = 1.0;
                this.playerGroup.add(this._shieldMesh);
            }

            // Pulse effect
            const sineWave = Math.sin(now * 0.005) * 0.05;

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
        now: number,
        disableInput: boolean,
        session: GameSessionLogic,
        currentSpeed: number
    ): boolean {
        // --- 1. Stamina, Shove & Rush Logic ---
        if (!input.space) {
            state.isRushing = false;
            state.spaceDepressed = false;
            state.rushCostPaid = false;
        }

        // Shove triggers immediately on Space press
        if (input.space && !state.spaceDepressed && !disableInput) {
            state.spaceDepressed = true;
            state.spacePressTime = now;
            state.rushCostPaid = false;
            EnemyManager.applyShove(playerGroup, 4.0, state, session.engine.scene, now);
        }

        if (state.spaceDepressed && !state.isRolling) {
            if (!state.isRushing && now - state.spacePressTime > 150) {
                if (state.stamina >= 2) {
                    if (!state.rushCostPaid) { state.stamina -= 2; state.rushCostPaid = true; }
                    state.isRushing = true;
                }
            }
        }

        let speed = currentSpeed;

        // --- 2. WATER PHYSICS & DRAG ---
        let inWater = false;
        let isSwimming = state.isSwimming || false;
        let isWading = false;

        if (session.engine.water) {
            session.engine.water.checkBuoyancy(playerGroup.position.x, playerGroup.position.y, playerGroup.position.z);
            inWater = _buoyancyResult.inWater && !state.vehicle.active;

            if (inWater) {
                const flatDepth = _buoyancyResult.baseWaterLevel - _buoyancyResult.groundY;

                if (flatDepth > 1.25) {
                    isSwimming = true; speed *= 0.35;
                } else if (flatDepth > 0.95 && isSwimming) {
                    isSwimming = true; speed *= 0.35;
                } else if (flatDepth > 0.4) {
                    isSwimming = false; isWading = true; speed *= 0.6;
                } else {
                    isSwimming = false; speed *= 0.85;
                }

                const swimY = _buoyancyResult.waterLevel - 0.35;
                const targetY = isSwimming ? swimY : _buoyancyResult.groundY;
                playerGroup.position.y = THREE.MathUtils.lerp(playerGroup.position.y, targetY, 4 * delta);
            } else {
                isSwimming = false; isWading = false;
                if (playerGroup.position.y !== 0) {
                    playerGroup.position.y = THREE.MathUtils.lerp(playerGroup.position.y, 0, 15 * delta);
                    if (Math.abs(playerGroup.position.y) < 0.01) playerGroup.position.y = 0;
                }
            }
        }

        state.isSwimming = isSwimming;
        state.isWading = isWading;

        // --- 3. EXTINGUISH BURNING IN WATER ---
        if (inWater && state.statusEffects[StatusEffectType.BURNING]) {
            state.statusEffects[StatusEffectType.BURNING].duration = 0;
            soundManager.playEffect('steam_hiss');
        }

        // --- 4. STAMINA & REGENERATION ---
        const waterStaminaDrain = isSwimming ? 7 : (isWading ? 3 : 0);
        if (waterStaminaDrain > 0 && !state.vehicle.active) {
            state.lastStaminaUseTime = now;
            state.stamina = Math.max(0, state.stamina - waterStaminaDrain * delta);
            if (isSwimming && state.stamina <= 0) {
                speed *= 0.5; // Exhaustion penalty while swimming

                // Drowning Damage
                if (now - state.lastDrownTick > 1000) {
                    state.lastDrownTick = now;
                    if (state.callbacks && state.callbacks.onPlayerHit) {
                        state.callbacks.onPlayerHit(15, null, DamageType.DROWNING, true, StatusEffectType.DROWNING, 2000, 15, DamageType.DROWNING);
                    }
                }
            }
        }

        if (state.isRushing) {
            this.checkReflexShield(session, now);
            state.lastStaminaUseTime = now;
            if (state.stamina > 0) {
                state.stamina -= 5 * delta;
                speed *= 1.5;
            } else {
                state.isRushing = false;
            }
        } else if (!state.isRolling && waterStaminaDrain === 0) {
            if (now - state.lastStaminaUseTime > 5000) {
                state.stamina = Math.min(state.maxStamina, state.stamina + 15 * delta);
            }
        }

        if (state.hp < state.maxHp && !state.isDead && now - state.lastDamageTime > 5000) {
            state.hp = Math.min(state.maxHp, state.hp + 3 * delta);
        }

        let isMovingVal = false;

        // --- 3. MOVE PROCESSING ---
        if (state.isRolling) {
            if (state.rollDir.lengthSq() === 0) {
                state.rollDir.set(0, 0, 1).applyQuaternion(playerGroup.quaternion).normalize();
            }

            if (!state.rollSmokeSpawned && !inWater) {
                state.rollSmokeSpawned = true;
                this.checkReflexShield(session, now);
                soundManager.playFootstep('step');
                session.makeNoise(playerGroup.position, NoiseType.PLAYER_ROLLING, NOISE_RADIUS.PLAYER_ROLLING);
                FXSystem.spawnPart(
                    session.engine.scene, state.particles,
                    playerGroup.position.x, 0.5, playerGroup.position.z,
                    'large_smoke', 2, undefined, undefined, 0xcccccc, 1.2
                );
            }

            if (now < state.rollStartTime + 300) {
                const rollSpeed = speed * 2.5;
                _v1.copy(state.rollDir).multiplyScalar(rollSpeed * delta);
                this.performMove(playerGroup, _v1, state, session, now, delta);
                isMovingVal = true;
            } else {
                state.isRolling = false;
                state.rollSmokeSpawned = false;
                state.rollDir.set(0, 0, 0); // Clear to avoid ghosting
            }
        } else if (!disableInput) {
            _v6.set(0, 0, 0);
            if (input.w) _v6.z -= 1; if (input.s) _v6.z += 1;
            if (input.a) _v6.x -= 1; if (input.d) _v6.x += 1;

            if (input.joystickMove) {
                _v6.x += input.joystickMove.x;
                _v6.z += input.joystickMove.y;
            }

            const disoriented = state.statusEffects[StatusEffectType.DISORIENTED];
            const isDisoriented = disoriented && disoriented.duration > 0;
            if (isDisoriented) {
                const noise = Math.sin(now * 0.01) * 0.5;
                _v6.x += noise;
                if (now % 300 < 50) {
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

                _v1.multiplyScalar(speed * delta);

                this.performMove(playerGroup, _v1, state, session, now, delta);

                const stepInterval = state.isSwimming ? 350 : (state.isRushing ? 250 : 400);
                if (now - state.lastStepTime > stepInterval) {
                    state.lastStepTime = now;

                    let noiseType = NoiseType.PLAYER_WALK;
                    let noiseRadius = NOISE_RADIUS.PLAYER_WALK;

                    if (inWater) {
                        if (isSwimming) {
                            noiseType = NoiseType.PLAYER_SWIM;
                            noiseRadius = NOISE_RADIUS.PLAYER_SWIM;
                            soundManager.playSwimming();
                            FXSystem.spawnPart(session.engine.scene, state.particles, playerGroup.position.x, playerGroup.position.y + 1.0, playerGroup.position.z, 'splash', 3);
                            session.engine.water?.spawnRipple(playerGroup.position.x, playerGroup.position.z, 4.0);
                        } else {
                            soundManager.playFootstep('water');
                            session.engine.water?.spawnRipple(playerGroup.position.x, playerGroup.position.z, 1.5);
                        }
                    } else {
                        soundManager.playFootstep('step');
                        if (state.isRushing) {
                            noiseType = NoiseType.PLAYER_RUSH;
                            noiseRadius = NOISE_RADIUS.PLAYER_RUSH;
                            FXSystem.spawnPart(
                                session.engine.scene, state.particles,
                                playerGroup.position.x, 0.2, playerGroup.position.z,
                                'large_smoke', 1, undefined, undefined, 0xcccccc, 0.8
                            );
                        }
                    }

                    session.makeNoise(playerGroup.position, noiseType, noiseRadius);
                }
            } else {
                state.isBacking = false;
                state.isStrafing = false;
                state.strafeDirection = 0;
            }
        }

        if (isMovingVal || input.fire || input.space) state.lastActionTime = now;
        return isMovingVal;
    }

    private performMove(playerGroup: THREE.Group, baseMoveVec: THREE.Vector3, state: any, session: GameSessionLogic, now: number, delta: number) {
        const dist = baseMoveVec.length();
        if (dist < 0.001) return;

        const MAX_STEP = 0.2;
        const steps = Math.ceil(dist / MAX_STEP);
        _v2.copy(baseMoveVec).divideScalar(steps);

        const isDashing = state.isRushing || state.isRolling;
        const searchRadius = isDashing ? 2.5 : 1.0;

        for (let s = 0; s < steps; s++) {
            _v3.copy(playerGroup.position).add(_v2);

            const nearbyEnemies = state.collisionGrid.getNearbyEnemies(_v3, searchRadius);
            const nearbyObs = state.collisionGrid.getNearbyObstacles(_v3, 2.5);

            const eLen = nearbyEnemies.length;
            const nLen = nearbyObs.length;

            for (let i = 0; i < 4; i++) {
                let adjusted = false;

                // --- 1. ENEMY COLLISION (THE PLOW) ---
                for (let j = 0; j < eLen; j++) {
                    const enemy = nearbyEnemies[j];
                    const distSq = _v3.distanceToSquared(enemy.mesh.position);
                    const hitRadiusSq = isDashing ? 4.5 : 0.8;

                    if (distSq < hitRadiusSq) {
                        EnemyManager.applyKnockback(enemy, _v3, baseMoveVec, isDashing, state, session.engine.scene, now);

                        if (!isDashing) {
                            const overlap = Math.sqrt(hitRadiusSq) - Math.sqrt(distSq);
                            if (overlap > 0 && distSq > 0.001) {
                                _v1.subVectors(_v3, enemy.mesh.position).normalize().multiplyScalar(overlap);
                                _v3.add(_v1);
                                adjusted = true;
                            }
                        }
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
                            let pushForce = (isDashing ? 6.0 : 1.5) * massInverse;

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