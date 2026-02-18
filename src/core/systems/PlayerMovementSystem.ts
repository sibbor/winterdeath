import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { FXSystem } from './FXSystem';
import { Obstacle, applyCollisionResolution } from '../world/CollisionResolution';
import { soundManager } from '../../utils/sound';
import { AIState } from '../../types/enemy';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3(); // Direction / MoveVec
const _v2 = new THREE.Vector3(); // StepVec
const _v3 = new THREE.Vector3(); // TestPos
const _v5 = new THREE.Vector3(); // LookTarget & Outward Vector
const _v6 = new THREE.Vector3(); // Raw move input
const _UP = new THREE.Vector3(0, 1, 0);

export class PlayerMovementSystem implements System {
    id = 'player_movement';

    constructor(private playerGroup: THREE.Group) { }

    update(session: GameSessionLogic, delta: number, now: number) {
        const state = session.state;
        const input = session.engine.input.state;
        const disableInput = session.inputDisabled || false;

        if (state.activeVehicle) {
            state.isMoving = false; // Player model itself isn't running
            return; // Skip normal movement/rotation
        }

        this.handleShake(input, state, delta);

        // Movement logic
        const isMoving = this.handleMovement(
            this.playerGroup,
            input,
            state,
            delta,
            now,
            disableInput,
            session
        );

        state.isMoving = isMoving;

        // Rotation logic
        this.handleRotation(
            this.playerGroup,
            input,
            state,
            session.isMobile,
            disableInput,
            isMoving,
            session
        );
    }

    private handleMovement(
        playerGroup: THREE.Group,
        input: any,
        state: any,
        delta: number,
        now: number,
        disableInput: boolean,
        session: GameSessionLogic
    ): boolean {
        // --- 1. Stamina & Rush Logic ---
        if (!input.space) {
            state.isRushing = false;
            state.spaceDepressed = false;
            state.rushCostPaid = false;
        }
        if (input.space && !state.spaceDepressed) {
            state.spaceDepressed = true;
            state.spacePressTime = now;
            state.rushCostPaid = false;
        }

        if (state.spaceDepressed && !state.isRolling) {
            if (!state.isRushing && now - state.spacePressTime > 150) {
                if (state.stamina >= 2) {
                    if (!state.rushCostPaid) { state.stamina -= 2; state.rushCostPaid = true; }
                    state.isRushing = true;
                }
            }
        }

        let speed = 15;
        if (state.stats?.speed) speed = 15 * state.stats.speed;

        if (state.isRushing) {
            state.lastStaminaUseTime = now;
            if (state.stamina > 0) {
                state.stamina -= 5 * delta;
                speed *= 1.75;

                if ((now / 200 | 0) % 2 === 0) {
                    FXSystem.spawnPart(session.engine.scene, state.particles, playerGroup.position.x, 0.5, playerGroup.position.z, 'smoke', 1);
                }
            } else {
                state.isRushing = false;
            }
        } else if (!state.isRolling) {
            if (now - state.lastStaminaUseTime > 5000) {
                state.stamina = Math.min(state.maxStamina, state.stamina + 15 * delta);
            }
        }

        // Regen HP
        if (state.hp < state.maxHp && !state.isDead && now - state.lastDamageTime > 5000) {
            state.hp = Math.min(state.maxHp, state.hp + 3 * delta);
        }

        let isMoving = false;

        // --- 3. MOVE PROCESSING ---
        if (state.isRolling) {
            if (state.rollDir.lengthSq() === 0) {
                state.rollDir.set(0, 0, 1).applyQuaternion(playerGroup.quaternion).normalize();
            }
            if (now < state.rollStartTime + 300) {
                const rollSpeed = speed * 2.5;
                _v1.copy(state.rollDir).multiplyScalar(rollSpeed * delta);
                this.performMove(playerGroup, _v1, state, session, now, delta);
            } else {
                state.isRolling = false;
            }
        } else if (!disableInput) {
            _v6.set(0, 0, 0);
            if (input.w) _v6.z -= 1; if (input.s) _v6.z += 1;
            if (input.a) _v6.x -= 1; if (input.d) _v6.x += 1;

            if (input.joystickMove) {
                _v6.x += input.joystickMove.x;
                _v6.z += input.joystickMove.y;
            }

            if (_v6.lengthSq() > 0) {
                isMoving = true;
                const camAngle = session.cameraAngle || 0;

                _v1.copy(_v6).normalize();
                if (camAngle !== 0) _v1.applyAxisAngle(_UP, camAngle);
                _v1.multiplyScalar(speed * delta);

                this.performMove(playerGroup, _v1, state, session, now, delta);

                // --- AUDIO: Footsteps ---
                const stepInterval = state.isRushing ? 250 : 400;
                if (now > (state.lastStepTime || 0) + stepInterval) {
                    let inWater = false;
                    const pX = playerGroup.position.x;
                    const pY = playerGroup.position.y;
                    const pZ = playerGroup.position.z;

                    if (session.engine.water) {
                        const ws = session.engine.water;
                        const buoyancy = ws.checkBuoyancy(pX, pY, pZ);

                        if (buoyancy.inWater) {
                            inWater = true;
                            soundManager.playFootstep('water');
                            ws.spawnRipple(pX, pZ, 2, 0.3);
                        }
                    }

                    if (!inWater) {
                        soundManager.playFootstep('step');
                    }
                    state.lastStepTime = now;
                }
            }
        }

        if (isMoving || input.fire || input.space) state.lastActionTime = now;
        return isMoving;
    }

    /**
     * Sub-stepped movement with In-Place Collision Resolution
     */
    private performMove(playerGroup: THREE.Group, baseMoveVec: THREE.Vector3, state: any, session: GameSessionLogic, now: number, delta: number) {
        const dist = baseMoveVec.length();
        if (dist < 0.001) return;

        const MAX_STEP = 0.2;
        const steps = Math.ceil(dist / MAX_STEP);
        _v2.copy(baseMoveVec).divideScalar(steps); // stepVec

        const isDashing = state.isRushing || state.isRolling;

        for (let s = 0; s < steps; s++) {
            _v3.copy(playerGroup.position).add(_v2); // testPos

            // Iterative Collision Resolution
            for (let i = 0; i < 4; i++) {
                let adjusted = false;
                const nearby = state.collisionGrid.getNearbyObstacles(_v3, 2.0);
                const nLen = nearby.length;

                for (let j = 0; j < nLen; j++) {
                    const obs = nearby[j];

                    if (applyCollisionResolution(_v3, 0.5, obs)) {

                        const entityData = obs.mesh?.userData?.entity;

                        // --- Enemy Collision & Knockback Logic ---
                        if (entityData) {
                            const enemy = entityData;

                            // [VINTERDÖD] Bryt Bite-attacken direkt om vi dashar in i dem!
                            if (isDashing && enemy.state === AIState.BITING && !enemy.dead) {
                                enemy.state = AIState.IDLE;
                                enemy.stunTimer = 1.0;
                                enemy.isBlinded = true;
                                enemy.blindUntil = now + 1000;
                                soundManager.playImpact('flesh');
                            }

                            // [VINTERDÖD] Alltid tillåt tackling (men kraften varierar)
                            const canTackle = !enemy.dead && (!enemy.lastTackleTime || now - enemy.lastTackleTime > 300);

                            if (canTackle) {
                                const mass = (enemy.originalScale * enemy.originalScale * (enemy.widthScale || 1.0));
                                const massInverse = 1.0 / Math.max(0.5, mass);
                                const pushMultiplier = (enemy.isBoss ? 0.1 : 1.0) * massInverse; // Bossar rör sig knappt

                                // --- BOWLING-KÄGLOR FYSIK ---
                                // Extremt mycket högre force och lift vid rush!
                                const force = (isDashing ? 45.0 : 8.0) * pushMultiplier;
                                const lift = (isDashing ? 12.0 : 2.0) * pushMultiplier;

                                // 1. Beräkna rörelseriktning
                                _v1.copy(baseMoveVec).normalize();

                                // 2. Beräkna radiell riktning (utåt från spelaren) för att de ska sprida sig åt sidorna
                                _v5.set(
                                    enemy.mesh.position.x - playerGroup.position.x,
                                    0,
                                    enemy.mesh.position.z - playerGroup.position.z
                                ).normalize();

                                // 3. Mixa riktningarna. 2 delar framåt, 1 del utåt.
                                _v1.multiplyScalar(2.0).add(_v5).normalize();

                                // Applicera farten!
                                enemy.knockbackVel.set(_v1.x * force, lift, _v1.z * force);

                                // Tvinga ut dem ur deras nuvarande State så de inte fryser mitt i luften
                                enemy.state = AIState.IDLE;

                                // Ge dem tillräckligt mycket stun så att de hinner landa innan de jagar igen
                                enemy.stunTimer = isDashing ? 2.5 : 0.8;
                                enemy.isBlinded = true;
                                enemy.blindUntil = now + (isDashing ? 2500 : 800);
                                enemy.lastTackleTime = now;

                                if (isDashing) {
                                    FXSystem.spawnPart(session.engine.scene, state.particles, enemy.mesh.position.x, 1, enemy.mesh.position.z, 'hit', 12);
                                    soundManager.playImpact('flesh');
                                }
                            }
                        }
                        adjusted = true;
                    }
                }
                if (!adjusted) break;
            }
            playerGroup.position.copy(_v3);
        }
    }

    private handleShake(input: any, state: any, delta: number) {
        if (!state.shakeIntensity) state.shakeIntensity = 0;
        let shakeInput = 0;

        const inSpace = !!input.space;
        const inFire = !!input.fire;
        const inA = !!input.a;
        const inD = !!input.d;

        if (inSpace && !state.lastSpace) shakeInput += 1;
        if (inFire && !state.lastFire) shakeInput += 1;
        if (inA && !state.lastA) shakeInput += 0.5;
        if (inD && !state.lastD) shakeInput += 0.5;

        state.lastSpace = inSpace;
        state.lastFire = inFire;
        state.lastA = inA;
        state.lastD = inD;

        if (shakeInput > 0) state.shakeIntensity += shakeInput;
        state.shakeIntensity = Math.max(0, state.shakeIntensity - delta * 2.0);
    }

    private handleRotation(playerGroup: THREE.Group, input: any, state: any, isMobile: boolean, disableInput: boolean, isMoving: boolean, session: GameSessionLogic) {
        if (disableInput) return;
        const angle = session.cameraAngle || 0;

        if (isMobile) {
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