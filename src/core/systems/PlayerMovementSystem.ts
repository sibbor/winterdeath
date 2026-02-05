import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { FXSystem } from './FXSystem';
import { resolveCollision } from '../../utils/physics';

export class PlayerMovementSystem implements System {
    id = 'player_movement';

    constructor(private playerGroup: THREE.Group) { }

    update(session: GameSessionLogic, delta: number, now: number) {
        const state = session.state;
        const input = session.engine.input.state;
        const disableInput = session.inputDisabled || false;

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
            spawnPart
        );

        state.isMoving = isMoving;

        this.handleRotation(
            this.playerGroup,
            input,
            state,
            session.isMobile,
            disableInput,
            isMoving
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
        spawnPart: (x: number, y: number, z: number, type: string, count: number) => void
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
                            // Apply push
                            const colInfo = obs.collider ? `${obs.collider.type} ${JSON.stringify(obs.collider.size || obs.collider.radius)}` : 'MeshCollider';
                            console.log(`[COLLISION] Hit: '${obs.mesh?.name || 'Unnamed'}' (${obs.mesh?.geometry?.type || 'NoGeo'}) [${colInfo}] at (${testPos.x.toFixed(2)}, ${testPos.z.toFixed(2)})`);
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

        // --- Rolling Logic ---
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
                    const moveVec = v.normalize().multiplyScalar(speed * delta);
                    performMove(moveVec);
                }
            }
        }

        if (isMoving || input.fire || input.space) state.lastActionTime = now;

        return isMoving;
    }

    private handleRotation(
        playerGroup: THREE.Group,
        input: any,
        state: any,
        isMobile: boolean,
        disableInput: boolean,
        isMoving: boolean
    ) {
        if (disableInput) return;

        const hasRightStick = input.joystickAim && input.joystickAim.lengthSq() > 0.1;
        const hasLeftStick = input.joystickMove && input.joystickMove.lengthSq() > 0.1;
        const hasMouse = !isMobile && input.aimVector && input.aimVector.lengthSq() > 1;

        if (hasRightStick) {
            // Priority 1 (Mobile): Aim Stick
            const targetX = playerGroup.position.x + input.joystickAim.x * 10;
            const targetZ = playerGroup.position.z + input.joystickAim.y * 10;
            playerGroup.lookAt(targetX, playerGroup.position.y, targetZ);
        }
        else if (isMobile && hasLeftStick) {
            // Priority 2 (Mobile): Move Stick (when not aiming)
            // This fixes the flashlight direction while running on mobile
            const targetX = playerGroup.position.x + input.joystickMove.x * 10;
            const targetZ = playerGroup.position.z + input.joystickMove.y * 10;
            playerGroup.lookAt(targetX, playerGroup.position.y, targetZ);
        }
        else if (hasMouse) {
            // Priority 1 (Desktop): Mouse
            const targetX = playerGroup.position.x + input.aimVector.x;
            const targetZ = playerGroup.position.z + input.aimVector.y;
            playerGroup.lookAt(targetX, playerGroup.position.y, targetZ);
        }
        else if (isMoving && !isMobile) {
            // Priority 2 (Desktop): Keyboard Direction (fallback)
            const moveDir = new THREE.Vector3(0, 0, 0);
            if (input.w) moveDir.z -= 1; if (input.s) moveDir.z += 1; if (input.a) moveDir.x -= 1; if (input.d) moveDir.x += 1;

            if (moveDir.lengthSq() > 0.1) {
                const targetX = playerGroup.position.x + moveDir.x * 10;
                const targetZ = playerGroup.position.z + moveDir.z * 10;
                playerGroup.lookAt(targetX, playerGroup.position.y, targetZ);
            }
        }
    }
}
