import * as THREE from 'three';

export interface AnimState {
    isMoving: boolean;
    isRushing: boolean;
    isDodging: boolean;
    dodgeStartTime: number;
    staminaRatio: number;
    isDead?: boolean;
    deathStartTime?: number;
    isSpeaking: boolean;
    isThinking: boolean;
    isIdleLong: boolean;
    isCelebrating?: boolean;   // Jump+cheer phase
    isHugging?: boolean;       // Hug/embrace phase
    celebrateStartTime?: number;
    isWading?: boolean;
    isSwimming?: boolean;
    isStrafing?: boolean;
    isBacking?: boolean;
    strafeDirection?: number;
    currentSpeedRatio?: number; // New: 1.0 = base speed, 2.0 = full rush, etc.
    renderTime: number;
    simTime: number;
    seed: number;
}

export const PlayerAnimator = {

    update: (
        mesh: THREE.Mesh,
        animState: AnimState,
        renderTime: number
    ) => {
        if (!mesh) return;
        
        const simTime = animState.simTime || renderTime;

        // --- 1. Base Variables ---
        let scaleY = 1.0;
        let scaleXZ = 1.0;
        let rotationX = 0;
        let rotationZ = 0;
        let positionY = 0;

        // Breathe speed based on stamina (heavy breathing when tired)
        const breatheSpeed = 0.003 + ((1.0 - animState.staminaRatio) * 0.012);
        const breatheAmp = 0.02 + ((1.0 - animState.staminaRatio) * 0.06);

        // Variables needed later for movement
        let moveSpeed = 0;
        let wadingFactor = 1.0;
        let bob = 0;

        // --- 2. State Machine (Priority Order) ---

        // Death animation
        if (animState.isDead) {
            // High-speed death animation (350ms)
            const deathDuration = 350;
            const progress = Math.min(1.0, Math.max(0.0, (simTime - (animState.deathStartTime || simTime)) / deathDuration));

            rotationX = -Math.PI / 2 * progress;
            positionY = -0.8 * progress; // Sink into snow/ground
        }

        // Dodging animation (Athletic Leap/Dash pose)
        else if (animState.isDodging) {
            const progress = Math.min(1.0, Math.max(0.0, (simTime - animState.dodgeStartTime) / 300));
            
            rotationX = 0.6 * (1.0 - progress * 0.5);
            const archFactor = Math.sin(progress * Math.PI);
            scaleY = 1.0 + (archFactor * 0.2); 
            scaleXZ = 1.0 - (archFactor * 0.1);
            positionY = archFactor * 0.45;
        }

        // Celebration: Jump + Cheer bounce (rapid vertical pulses)
        else if (animState.isCelebrating) {
            const t = animState.renderTime;
            // Rapid jump frequency (4 bounces/sec)
            const bounce = Math.abs(Math.sin(t * 0.025 + (animState.seed || 0)));
            positionY = bounce * 0.55;
            scaleY = 1.0 + bounce * 0.15;
            scaleXZ = 1.0 - bounce * 0.07;
            // Arms-up lean on each peak (rotX negative = lean back/arms up)
            rotationX = -0.2 * bounce;
            // Slight side swagger
            rotationZ = Math.sin(t * 0.02 + (animState.seed || 0)) * 0.08;
        }

        // Hugging close embrace (lean forward + rock side to side)
        else if (animState.isHugging) {
            const t = animState.renderTime;
            rotationX = 0.35 + Math.sin(t * 0.004 + (animState.seed || 0)) * 0.08;
            rotationZ = Math.sin(t * 0.003 + (animState.seed || 0) * 1.7) * 0.12;
            positionY = Math.sin(t * 0.003 + (animState.seed || 0)) * 0.04;
        }

        // Swimming Animation: Heavy lean, deep bobbing
        else if (animState.isSwimming) {
            const swimSpeed = 0.008;
            bob = Math.sin(animState.renderTime * swimSpeed);
            rotationX = 1.45; // Flatter "swimming" pose
            positionY = -0.7 + bob * 0.15; // Bobbing in water
            scaleY = 1.0 + bob * 0.05;
            rotationZ = Math.sin(animState.renderTime * swimSpeed * 0.5) * 0.1;
        }

        // Moving animation
        else if (animState.isMoving) {
            // --- DYNAMIC BOBBING (Vinterdöd Fix: Scales with actual speed) ---
            const baseFrequency = 0.012;
            const speedRatio = animState.currentSpeedRatio || 1.0;
            moveSpeed = baseFrequency * speedRatio;

            wadingFactor = animState.isWading ? 0.6 : 1.0;
            bob = Math.sin(animState.renderTime * moveSpeed * wadingFactor);
            const rushFactor = animState.isRushing ? 2.0 : 1.0;

            if (animState.isBacking) {
                // Lean backwards, bouncy steps
                rotationX = -0.15;
                scaleY = 1.0 + (Math.abs(bob) * 0.15 * rushFactor); // More vertical bounce
                scaleXZ = 1.0 - (Math.abs(bob) * 0.05 * rushFactor);
                rotationZ = Math.cos(renderTime * moveSpeed * wadingFactor) * 0.08; // Exaggerated wobble
                positionY = Math.abs(bob) * 0.1; // Add vertical bounce
            } else if (animState.isStrafing) {
                // Lean into the strafe, waddle
                rotationX = 0.05; // Mostly upright
                const strafeLean = (animState.strafeDirection || 0) * 0.2;
                rotationZ = strafeLean + (Math.cos(renderTime * moveSpeed * wadingFactor) * 0.05);
                scaleY = 1.0 + (Math.abs(bob) * 0.1 * rushFactor);
                scaleXZ = 1.0 - (Math.abs(bob) * 0.05 * rushFactor);
                positionY = Math.abs(bob) * 0.15; // Waddling height bounce
            } else {
                // Standard forward movement
                rotationX = animState.isRushing ? 0.4 : (animState.isWading ? 0.3 : 0.2);
                scaleY = 1.0 + (Math.abs(bob) * 0.1 * rushFactor);
                scaleXZ = 1.0 - (Math.abs(bob) * 0.05 * rushFactor);
                rotationZ = Math.cos(renderTime * moveSpeed * wadingFactor) * 0.05;
            }

            // Wading Bobbing
            if (animState.isWading) {
                positionY += Math.abs(bob) * 0.2;
            }
        }

        // Stationary behaviors (Breathing, Speaking, Thinking)
        else {
            // Breathing intensity and added subtle bobbing
            const breathe = Math.sin(animState.renderTime * breatheSpeed + animState.seed);
            const idleSine = Math.sin(animState.renderTime * 0.002 + animState.seed * 0.5);

            scaleY = 1.0 + (breathe * breatheAmp * 1.5);
            scaleXZ = 1.0 - (breathe * (breatheAmp * 0.75));

            // Subtle weight shift/sway
            rotationZ = Math.sin(animState.renderTime * 0.001 + animState.seed) * 0.03;

            // Speaking
            if (animState.isSpeaking) {
                const talkWobble = Math.sin(animState.renderTime * 0.03) * 0.1;
                scaleY += talkWobble + 0.1;
                scaleXZ -= talkWobble * 0.5;
            }
            // Thinking
            else if (animState.isThinking) {
                const nod = Math.sin(animState.renderTime * 0.008);
                rotationX = 0.3 + (nod * 0.1); // Pensive lean
                rotationZ += Math.sin(animState.renderTime * 0.003) * 0.1;
            }
            // Long Idle Fidgeting (Shivering/Looking around)
            else if (animState.isIdleLong) {
                const t = animState.renderTime * 0.001;
                const shiverTrigger = Math.sin(t * 0.15 + animState.seed);
                if (shiverTrigger > 0.8) {
                    rotationZ += Math.sin(animState.renderTime * 0.05) * 0.05;
                }
                const shiftTrigger = Math.sin(t * 0.6 + animState.seed * 3);
                if (shiftTrigger > 0.95) {
                    positionY = Math.sin(animState.renderTime * 0.01) * 0.08;
                    rotationX += Math.sin(animState.renderTime * 0.005) * 0.05;
                }
            }
            // Gentle idle bob
            else {
                positionY = idleSine * 0.03;
            }
        }

        // --- 3. Apply Optimized Transforms ---
        const baseScale = mesh.userData.baseScale || 1.0;
        const baseHeight = mesh.userData.baseY || 0;

        mesh.scale.set(scaleXZ * baseScale, scaleY * baseScale, scaleXZ * baseScale);

        // Only set X and Z rotations, Y is controlled by input/mouse
        mesh.rotation.x = rotationX;
        mesh.rotation.z = rotationZ;

        // Adjust pivot to keep feet on ground despite scaling
        mesh.position.y = (baseHeight * scaleY) + positionY;

        // --- 4. Equipment Aim Adjustment (Zero-GC) ---
        const children = mesh.children;
        const cLen = children.length;
        for (let i = 0; i < cLen; i++) {
            const child = children[i] as THREE.Object3D;
            if (child.name === 'gun' || child.userData.isLaserSight) {
                // Keep the weapon horizontal regardless of the character's lean
                child.rotation.x = -rotationX;

                if (animState.isSwimming) {
                    child.position.y = 0.6;
                    child.position.z = 0.8;
                } else {
                    child.position.y = 0.4;
                    child.position.z = 0.5;
                }
            }
        }
    }
};