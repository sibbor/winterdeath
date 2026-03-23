import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { FXSystem } from './FXSystem';
import { StatusEffectType, DamageType } from '../entities/player/CombatTypes';
import { applyCollisionResolution } from '../core/world/CollisionResolution';
import { soundManager } from '../utils/SoundManager';
import { EnemyManager } from '../entities/enemies/EnemyManager';
import { _buoyancyResult } from './WaterSystem';
import { NoiseType } from '../entities/enemies/EnemyTypes';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);

export class PlayerMovementSystem implements System {
    id = 'player_movement';

    constructor(private playerGroup: THREE.Group) { }

    update(session: GameSessionLogic, delta: number, now: number) {
        const state = session.state;
        const input = session.engine.input.state;
        const disableInput = session.inputDisabled || false;

        const currentSectorData = (session.engine.renderer as any)._sectorData || (session as any).currentSectorData;
        const env = currentSectorData?.environment;

        // --- APPLY DYNAMIC MULTIPLIERS ---
        const speedMult = state.multipliers.speed;
        const baseSpeed = state.stats.speed;
        const currentSpeed = baseSpeed * speedMult * 10;

        if (state.activeVehicle) {
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

    private _shieldMesh: THREE.Mesh | null = null;
    private updateInvincibleGlow(state: any, now: number) {
        if (state.sectorState?.isInvincible) {
            if (!this._shieldMesh) {
                const geo = new THREE.SphereGeometry(1.2, 32, 32);
                const mat = new THREE.MeshBasicMaterial({
                    color: 0x00ffff,
                    transparent: true,
                    opacity: 0.15,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide
                });
                this._shieldMesh = new THREE.Mesh(geo, mat);
                this._shieldMesh.position.y = 1.0;
                this.playerGroup.add(this._shieldMesh);
            }
            // Pulse effect
            const pulse = 0.15 + Math.sin(now * 0.005) * 0.05;
            (this._shieldMesh.material as THREE.MeshBasicMaterial).opacity = pulse;
            const s = 1.0 + Math.sin(now * 0.005) * 0.05;
            this._shieldMesh.scale.setScalar(s);
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

        const isRushing = state.isRushing;
        let speed = currentSpeed;

        // --- 2. WATER PHYSICS & DRAG ---
        let inWater = false;
        let isSwimming = state.isSwimming || false;
        let isWading = false;

        if (session.engine.water) {
            session.engine.water.checkBuoyancy(playerGroup.position.x, playerGroup.position.y, playerGroup.position.z);
            inWater = _buoyancyResult.inWater && !state.activeVehicle;

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
            soundManager.playEffect('steam_hiss'); // Assume this exists or use fallback
        }

        // --- 4. STAMINA & REGENERATION ---
        const waterStaminaDrain = isSwimming ? 7 : (isWading ? 3 : 0);
        if (waterStaminaDrain > 0 && !state.activeVehicle) {
            state.lastStaminaUseTime = now;
            state.stamina = Math.max(0, state.stamina - waterStaminaDrain * delta);
            if (isSwimming && state.stamina <= 0) {
                speed *= 0.5; // Exhaustion penalty while swimming

                // Drowning Damage
                if (now - (state.lastDrownTick || 0) > 1000) {
                    state.lastDrownTick = now;
                    // Trigger drowning hit
                    const statsSys = session.getSystem('player_stats_system') as any;
                    if (statsSys) {
                        statsSys.handlePlayerHit(session, 15, null, DamageType.DROWNING, true);
                    }
                }
            }
        }

        if (state.isRushing) {
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

        let isMoving = false;

        // --- 3. MOVE PROCESSING ---
        if (state.isRolling) {
            if (state.rollDir.lengthSq() === 0) {
                state.rollDir.set(0, 0, 1).applyQuaternion(playerGroup.quaternion).normalize();
            }

            if (!state.rollSmokeSpawned && !inWater) {
                state.rollSmokeSpawned = true;
                soundManager.playFootstep('step');
                session.makeNoise(playerGroup.position, NoiseType.PLAYER_ROLLING); // Added rolling noise
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
            } else {
                state.isRolling = false;
                state.rollSmokeSpawned = false;
            }
        } else if (!disableInput) {
            _v6.set(0, 0, 0);
            if (input.w) _v6.z -= 1; if (input.s) _v6.z += 1;
            if (input.a) _v6.x -= 1; if (input.d) _v6.x += 1;

            if (input.joystickMove) {
                _v6.x += input.joystickMove.x;
                _v6.z += input.joystickMove.y;
            }

            const isDisoriented = !!state.statusEffects?.[StatusEffectType.DISORIENTED]?.duration && state.statusEffects[StatusEffectType.DISORIENTED].duration > 0;
            if (isDisoriented) {
                // Jerky rotation and movement noise
                const noise = Math.sin(now * 0.01) * 0.5;
                _v6.x += noise;
                if (now % 300 < 50) {
                    _v6.x += (Math.random() - 0.5) * 2;
                    _v6.z += (Math.random() - 0.5) * 2;
                }
            }

            if (_v6.lengthSq() > 0) {
                isMoving = true;
                const camAngle = session.cameraAngle || 0;

                _v1.copy(_v6).normalize();
                if (camAngle !== 0) _v1.applyAxisAngle(_UP, camAngle);
                _v1.multiplyScalar(speed * delta);

                this.performMove(playerGroup, _v1, state, session, now, delta);

                const stepInterval = state.isSwimming ? 350 : (state.isRushing ? 250 : 400);
                if (now > (state.lastStepTime || 0) + stepInterval) {
                    if (inWater) {
                        if (isSwimming) {
                            soundManager.playSwimming();
                            FXSystem.spawnPart(session.engine.scene, state.particles, playerGroup.position.x, playerGroup.position.y + 1.0, playerGroup.position.z, 'splash', 3);
                            session.makeNoise(playerGroup.position, NoiseType.PLAYER_SWIM);
                        } else {
                            soundManager.playFootstep('water');
                            session.makeNoise(playerGroup.position, NoiseType.PLAYER_WALK);
                        }

                        if (session.engine.water) {
                            const ripplePower = isSwimming ? 4.0 : 1.5;
                            session.engine.water.spawnRipple(playerGroup.position.x, playerGroup.position.z, ripplePower);
                        }
                    } else {
                        soundManager.playFootstep('step');
                        if (state.isRushing) {
                            FXSystem.spawnPart(
                                session.engine.scene, state.particles,
                                playerGroup.position.x, 0.2, playerGroup.position.z,
                                'large_smoke', 1, undefined, undefined, 0xcccccc, 0.8
                            );
                            session.makeNoise(playerGroup.position, NoiseType.PLAYER_RUSH);
                        } else {
                            session.makeNoise(playerGroup.position, NoiseType.PLAYER_WALK);
                        }
                    }
                    state.lastStepTime = now;
                }
            }
        }

        if (isMoving || input.fire || input.space) state.lastActionTime = now;
        return isMoving;
    }

    private performMove(playerGroup: THREE.Group, baseMoveVec: THREE.Vector3, state: any, session: GameSessionLogic, now: number, delta: number) {
        const dist = baseMoveVec.length();
        if (dist < 0.001) return;

        const MAX_STEP = 0.2;
        const steps = Math.ceil(dist / MAX_STEP);
        _v2.copy(baseMoveVec).divideScalar(steps);

        const isDashing = state.isRushing || state.isRolling;

        for (let s = 0; s < steps; s++) {
            _v3.copy(playerGroup.position).add(_v2);

            for (let i = 0; i < 4; i++) {
                let adjusted = false;

                // --- 1. FIENDE-KOLLISION (PLOGEN) ---
                // FIX: Vi måste specifikt be griden om att ge oss FIENDER!
                const searchRadius = isDashing ? 2.5 : 1.0;
                const nearbyEnemies = state.collisionGrid.getNearbyEnemies(_v3, searchRadius);
                const eLen = nearbyEnemies.length;

                for (let j = 0; j < eLen; j++) {
                    const enemy = nearbyEnemies[j];
                    const distSq = _v3.distanceToSquared(enemy.mesh.position);

                    // PLOG-RADIE: Större än deras attackradie så vi träffar dem FÖRST!
                    const hitRadiusSq = isDashing ? 4.5 : 0.8;

                    if (distSq < hitRadiusSq) {
                        // EnemyManager handles the knockback
                        EnemyManager.applyKnockback(enemy, _v3, baseMoveVec, isDashing, state, session.engine.scene, now);

                        // Om vi INTE dashar, hantera mjuk kollision så vi inte går igenom dem
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
                // Griden hämtar nu bara stenar, fordon och träd här
                const nearbyObs = state.collisionGrid.getNearbyObstacles(_v3, 2.5);
                const nLen = nearbyObs.length;

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
                playerGroup.lookAt(_v5.x, playerGroup.position.y, _v5.z);
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
                playerGroup.lookAt(_v5.x, playerGroup.position.y, _v5.z);

            } else if (isMoving) {
                if (_v6.lengthSq() > 0) {
                    _v1.copy(_v6).normalize();
                    if (angle !== 0) _v1.applyAxisAngle(_UP, angle);

                    _v5.set(
                        playerGroup.position.x + _v1.x * 10,
                        playerGroup.position.y,
                        playerGroup.position.z + _v1.z * 10
                    );
                    playerGroup.lookAt(_v5.x, playerGroup.position.y, _v5.z);
                }
            }
        }
    }
}