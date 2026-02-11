import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { FXSystem } from './FXSystem';
import { resolveCollision } from '../../utils/physics';
import { soundManager } from '../../utils/sound';
import { AIState } from '../../types/enemy';

export class PlayerMovementSystem implements System {
    id = 'player_movement';

    constructor(private playerGroup: THREE.Group) { }

    update(session: GameSessionLogic, delta: number, now: number) {
        const state = session.state;
        const input = session.engine.input.state;
        const disableInput = session.inputDisabled || false;

        this.handleShake(input, state, delta);

        const spawnPart = (x: number, y: number, z: number, type: string, count: number) => {
            FXSystem.spawnPart(session.engine.scene, state.particles, x, y, z, type, count);
        };

        const isMoving = this.handleMovement(
            this.playerGroup,
            input,
            state,
            state.obstacles,
            delta,
            now,
            disableInput,
            spawnPart,
            session
        );

        state.isMoving = isMoving;

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
        obstacles: any[],
        delta: number,
        now: number,
        disableInput: boolean,
        spawnPart: (x: number, y: number, z: number, type: string, count: number) => void,
        session: GameSessionLogic
    ): boolean {
        // --- Stamina & Rush Logic ---
        // Fix for infinite drain (space released = stop rushing)
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

        // Hold space to Rush
        if (state.spaceDepressed && !state.isRolling) {
            if (!state.isRushing && now - state.spacePressTime > 150) {
                if (state.stamina >= 10) {
                    if (!state.rushCostPaid) { state.stamina -= 10; state.rushCostPaid = true; }
                    state.isRushing = true;
                }
            }
        }

        let speed = 15;
        // If stats are available (props.stats is not here, but maybe in state if we copied it)
        // Check state.stats.speed if it exists, otherwise default. The original had 15 hardcoded.
        if (state.stats && state.stats.speed) speed = 15 * state.stats.speed;

        if (state.isRushing) {
            state.lastStaminaUseTime = now;
            if (state.stamina > 0) {
                state.stamina -= 30 * delta;
                speed *= 1.75;
                if (Math.floor(now / 200) % 2 === 0) spawnPart(playerGroup.position.x, 0.5, playerGroup.position.z, 'smoke', 1);
            } else {
                state.isRushing = false;
            }
        } else if (!state.isRolling) {
            if (now - state.lastStaminaUseTime > 5000) state.stamina = Math.min(state.maxStamina, state.stamina + 15 * delta);
        }

        // Regen HP
        if (state.hp < state.maxHp && !state.isDead && now - state.lastDamageTime > 5000) {
            state.hp = Math.min(state.maxHp, state.hp + 3 * delta);
        }

        let isMoving = false;

        // --- Rolling Logic ---
        const MAX_STEP = 0.2; // Sub-step size to prevent tunneling

        const performMove = (baseMoveVec: THREE.Vector3) => {
            const dist = baseMoveVec.length();
            if (dist < 0.001) return;

            const steps = Math.ceil(dist / MAX_STEP);
            const stepVec = baseMoveVec.clone().divideScalar(steps);

            for (let s = 0; s < steps; s++) {
                const testPos = playerGroup.position.clone().add(stepVec);

                // Collision Resolution (Iterative)
                for (let i = 0; i < 4; i++) {
                    let adjusted = false;
                    for (const obs of obstacles) {
                        const push = resolveCollision(testPos, 0.5, obs);
                        if (push) {
                            // CHECK FOR ENEMY KNOCKBACK
                            if ((state.isRushing || state.isRolling) && obs.mesh && obs.mesh.userData.entity) {
                                const enemy = obs.mesh.userData.entity;

                                // Can only knockback if not dead
                                if (!enemy.dead) {
                                    // Mass calculation: scale^2 * widthScale (relative to Walker = 1.0)
                                    const mass = (enemy.originalScale * enemy.originalScale * enemy.widthScale);
                                    const massInverse = 1.0 / Math.max(0.5, mass);

                                    // Enhanced Knockback Force (Fly around) - Bosses get less push
                                    const pushMultiplier = (enemy.isBoss ? 0.2 : 1.0) * massInverse;
                                    const force = (state.isRushing ? 10.0 : 4.0) * pushMultiplier;
                                    const lift = (state.isRushing ? 4.0 : 1.5) * pushMultiplier;
                                    const pushDir = baseMoveVec.clone().normalize();

                                    enemy.knockbackVel.set(
                                        pushDir.x * force,
                                        lift,
                                        pushDir.z * force
                                    );

                                    enemy.state = AIState.STUNNED;
                                    enemy.stunTimer = state.isRushing ? 1.5 : 0.8;
                                    enemy.isBlinded = true;
                                    enemy.blindUntil = now + (state.isRushing ? 1500 : 800);

                                    // Visual/Sound
                                    spawnPart(enemy.mesh.position.x, 1, enemy.mesh.position.z, 'hit', 12);
                                    soundManager.playImpact('flesh');
                                }
                            }


                            // Apply push
                            testPos.add(push);
                            adjusted = true;

                            // Cancel velocity in the push direction (Slide)
                            // Project stepVec onto the push normal (normalized push) and subtract?
                            // Simple position correction handles static overlap.
                            // But we should probably adjust the FUTURE steps?
                            // For now, just position correction is standard "slide".
                        }
                    }
                    if (!adjusted) break;
                }
                playerGroup.position.copy(testPos);
            }
        };

        // --- DODGE / RUSH INITIAL HIT (ON ATTACHED ENEMIES) ---
        if (state.isRushing || state.isRolling) {
            for (const enemy of session.state.enemies) {
                if (enemy.dead) continue;
                // If biting us, disorient them!
                if (enemy.state === AIState.BITING) {
                    enemy.state = AIState.STUNNED;
                    enemy.stunTimer = 1.0;
                    enemy.isBlinded = true;
                    enemy.blindUntil = now + 1000;
                    // Note: No knockback force for attached enemies as requested
                    soundManager.playImpact('flesh');
                }
            }
        }

        // --- COLLISION ---
        if (state.isRolling) {
            if (state.rollDir.lengthSq() === 0) {
                if (playerGroup) state.rollDir.copy(new THREE.Vector3(0, 0, 1).applyQuaternion(playerGroup.quaternion).normalize());
            }
            if (now < state.rollStartTime + 300) {
                speed *= 2.5;
                const moveVec = state.rollDir.clone().multiplyScalar(speed * delta);
                performMove(moveVec);
            } else {
                state.isRolling = false;
            }
        }
        // --- Walking Logic ---
        else {
            if (!disableInput) {
                const v = new THREE.Vector3();
                if (input.w) v.z -= 1;
                if (input.s) v.z += 1;
                if (input.a) v.x -= 1;
                if (input.d) v.x += 1;

                // Support mobile joystick movement
                if (input.joystickMove && (input.joystickMove.x !== 0 || input.joystickMove.y !== 0)) {
                    v.x += input.joystickMove.x;
                    v.z += input.joystickMove.y;
                }

                if (v.lengthSq() > 0) {
                    isMoving = true;
                    // --- CAMERA RELATIVE ROTATION ---
                    const angle = session.cameraAngle || 0;
                    const moveVec = v.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).multiplyScalar(speed * delta);
                    performMove(moveVec);
                }
            }
        }

        if (isMoving || input.fire || input.space) state.lastActionTime = now;

        return isMoving;
    }

    private handleShake(input: any, state: any, delta: number) {
        // Simple shake detection: Alternating inputs or rapid fire
        // We'll track specific input combos in state
        if (!state.shakeIntensity) state.shakeIntensity = 0;

        let shakeInput = 0;
        // Check for "Action" button mashing (Space/Fire)
        if (input.space && !state.lastSpace) shakeInput += 1;
        if (input.fire && !state.lastFire) shakeInput += 1;

        // Track A/D Direction change?
        if (input.a && !state.lastA) shakeInput += 0.5;
        if (input.d && !state.lastD) shakeInput += 0.5;

        state.lastSpace = input.space;
        state.lastFire = input.fire;
        state.lastA = input.a;
        state.lastD = input.d;

        if (shakeInput > 0) {
            state.shakeIntensity += shakeInput;
        }

        // Decay
        state.shakeIntensity = Math.max(0, state.shakeIntensity - delta * 2.0);
    }

    private handleRotation(
        playerGroup: THREE.Group,
        input: any,
        state: any,
        isMobile: boolean,
        disableInput: boolean,
        isMoving: boolean,
        session: GameSessionLogic
    ) {
        if (disableInput) return;

        const angle = session.cameraAngle || 0;
        const hasRightStick = input.joystickAim && input.joystickAim.lengthSq() > 0.25;
        const hasLeftStick = input.joystickMove && input.joystickMove.lengthSq() > 0.1;
        const hasMouse = !isMobile && input.aimVector && input.aimVector.lengthSq() > 1;

        if (hasRightStick) {
            // Priority 1 (Mobile): Aim Stick (Explicit Override)
            const aimVec = new THREE.Vector3(input.joystickAim.x, 0, input.joystickAim.y).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
            const targetX = playerGroup.position.x + aimVec.x * 10;
            const targetZ = playerGroup.position.z + aimVec.z * 10;
            playerGroup.lookAt(targetX, playerGroup.position.y, targetZ);
        }
        else if (isMobile && hasLeftStick) {
            // Priority 2 (Mobile): Move Stick (ONLY if Right Stick is Idle)
            const moveVec = new THREE.Vector3(input.joystickMove.x, 0, input.joystickMove.y).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
            const targetX = playerGroup.position.x + moveVec.x * 10;
            const targetZ = playerGroup.position.z + moveVec.z * 10;
            playerGroup.lookAt(targetX, playerGroup.position.y, targetZ);
        }
        else if (hasMouse) {
            // Priority 1 (Desktop): Mouse
            const aimVec = new THREE.Vector3(input.aimVector.x, 0, input.aimVector.y).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
            const targetX = playerGroup.position.x + aimVec.x;
            const targetZ = playerGroup.position.z + aimVec.z;
            playerGroup.lookAt(targetX, playerGroup.position.y, targetZ);
        }
        else if (isMoving && !isMobile) {
            // Priority 2 (Desktop): Keyboard Direction (fallback)
            const moveDirRaw = new THREE.Vector3(0, 0, 0);
            if (input.w) moveDirRaw.z -= 1; if (input.s) moveDirRaw.z += 1; if (input.a) moveDirRaw.x -= 1; if (input.d) moveDirRaw.x += 1;

            if (moveDirRaw.lengthSq() > 0.1) {
                const moveDir = moveDirRaw.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
                const targetX = playerGroup.position.x + moveDir.x * 10;
                const targetZ = playerGroup.position.z + moveDir.z * 10;
                playerGroup.lookAt(targetX, playerGroup.position.y, targetZ);
            }
        }
    }
}
