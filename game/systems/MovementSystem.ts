
import * as THREE from 'three';
import { resolveCollision, Obstacle } from '../../utils/physics';

export const MovementSystem = {
    update: (
        playerGroup: THREE.Group,
        input: any,
        state: any,
        obstacles: Obstacle[],
        delta: number,
        now: number,
        disableInput: boolean,
        spawnPart: (x: number, y: number, z: number, type: string, count: number) => void
    ) => {
        // --- Stamina & Rush Logic ---
        if (input.space && !state.spaceDepressed) { 
            state.spaceDepressed = true; 
            state.spacePressTime = now; 
            state.rushCostPaid = false; 
        }

        if (state.spaceDepressed && !state.isRolling) { 
            // Hold space to Rush
            if (!state.isRushing && now - state.spacePressTime > 150) { 
                if (state.stamina >= 10) { 
                    if (!state.rushCostPaid) { state.stamina -= 10; state.rushCostPaid = true; } 
                    state.isRushing = true; 
                } 
            } 
        }

        let speed = 15; // Base speed, should come from stats ideally but hardcoded in original for now
        // If stats are available in state, use them: speed = 15 * state.speedMultiplier;

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
        if (state.isRolling) { 
            if (state.rollDir.lengthSq() === 0) { 
                if (playerGroup) state.rollDir.copy(new THREE.Vector3(0, 0, 1).applyQuaternion(playerGroup.quaternion).normalize()); 
            }
            if (now < state.rollStartTime + 300) { 
                speed *= 2.5; 
                const moveVec = state.rollDir.clone().multiplyScalar(speed * delta); 
                const testPos = playerGroup.position.clone().add(moveVec);
                
                // Collision
                for(let i=0; i<3; i++) { 
                    let adjusted = false; 
                    for (const obs of obstacles) { 
                        const push = resolveCollision(testPos, 0.5, obs); 
                        if (push) { testPos.add(push); adjusted = true; } 
                    } 
                    if(!adjusted) break; 
                }
                playerGroup.position.copy(testPos);
            } else {
                state.isRolling = false; 
            }
        } 
        // --- Walking Logic ---
        else { 
            if (!disableInput) {
                const v = new THREE.Vector3(); 
                if(input.w) v.z-=1; if(input.s) v.z+=1; if(input.a) v.x-=1; if(input.d) v.x+=1; 
                
                if (v.lengthSq() > 0) {
                    isMoving = true;
                    const moveVec = v.normalize().multiplyScalar(speed * delta); 
                    const testPos = playerGroup.position.clone().add(moveVec);
                    
                    // Collision
                    for(let i=0; i<3; i++) { 
                        let adjusted = false; 
                        for (const obs of obstacles) { 
                            const push = resolveCollision(testPos, 0.5, obs); 
                            if (push) { testPos.add(push); adjusted = true; } 
                        } 
                        if(!adjusted) break; 
                    }
                    playerGroup.position.copy(testPos);
                }
            }
        }
        
        if (isMoving || input.fire || input.space) state.lastActionTime = now;

        return isMoving;
    }
};
