import * as THREE from 'three';
import { FootprintSystem } from '../../systems/FootprintSystem';

export interface AnimState {
    isMoving: boolean;
    isRushing: boolean;
    isRolling: boolean;
    rollStartTime: number;
    staminaRatio: number;
    isDead?: boolean;
    deathStartTime?: number;
    isSpeaking: boolean;
    isThinking: boolean;
    isIdleLong: boolean;
    isWading?: boolean;
    isSwimming?: boolean;
    isStrafing?: boolean;
    isBacking?: boolean;
    strafeDirection?: number;
    renderTime: number;
    seed: number;
}

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();

export const PlayerAnimator = {
    update: (
        mesh: THREE.Mesh,
        animState: AnimState,
        now: number,
        delta: number
    ) => {
        if (!mesh) return;

        // --- 1. Base Variables ---
        let scaleY = 1.0;
        let scaleXZ = 1.0;
        let rotationX = 0;
        let rotationY = 0;
        let rotationZ = 0;
        let positionY = 0;

        // Breathe speed based on stamina (heavy breathing when tired)
        const breatheSpeed = 0.003 + ((1.0 - animState.staminaRatio) * 0.012);
        const breatheAmp = 0.02 + ((1.0 - animState.staminaRatio) * 0.06);

        // Variables needed later for footprints
        let moveSpeed = 0;
        let wadingFactor = 1.0;
        let bob = 0;

        // --- 2. State Machine (Priority Order) ---

        // Death animation
        if (animState.isDead) {
            // High-speed death animation (350ms)
            const deathDuration = 350;
            const progress = Math.min(1, Math.max(0, (now - (animState.deathStartTime || now)) / deathDuration));

            rotationX = -Math.PI / 2 * progress;
            positionY = -0.8 * progress; // Sink into snow/ground
        }

        // Rolling animation
        else if (animState.isRolling) {
            const progress = Math.min(1.0, Math.max(0, (now - animState.rollStartTime) / 300));
            rotationX = progress * Math.PI * 2;
            const squashFactor = Math.sin(progress * Math.PI);
            scaleY = 1.0 - (squashFactor * 0.4);
            scaleXZ = 1.0 + (squashFactor * 0.4);
            positionY = 0.2;
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
            moveSpeed = animState.isRushing ? 0.020 : 0.012;
            wadingFactor = animState.isWading ? 0.6 : 1.0;
            bob = Math.sin(animState.renderTime * moveSpeed * wadingFactor);
            const rushFactor = animState.isRushing ? 2.0 : 1.0;

            if (animState.isBacking) {
                // Lean backwards, bouncy steps
                rotationX = -0.15; // Lean backwards!
                scaleY = 1.0 + (Math.abs(bob) * 0.15 * rushFactor); // More vertical bounce
                scaleXZ = 1.0 - (Math.abs(bob) * 0.05 * rushFactor);
                rotationZ = Math.cos(now * moveSpeed * wadingFactor) * 0.08; // Exaggerated wobble
                positionY = Math.abs(bob) * 0.1; // Add vertical bounce
            } else if (animState.isStrafing) {
                // Lean into the strafe, waddle
                rotationX = 0.05; // Mostly upright
                const strafeLean = (animState.strafeDirection || 0) * 0.2;
                rotationZ = strafeLean + (Math.cos(now * moveSpeed * wadingFactor) * 0.05);
                scaleY = 1.0 + (Math.abs(bob) * 0.1 * rushFactor);
                scaleXZ = 1.0 - (Math.abs(bob) * 0.05 * rushFactor);
                positionY = Math.abs(bob) * 0.15; // Waddling height bounce
            } else {
                // Standard forward movement
                rotationX = animState.isRushing ? 0.4 : (animState.isWading ? 0.3 : 0.2);
                scaleY = 1.0 + (Math.abs(bob) * 0.1 * rushFactor);
                scaleXZ = 1.0 - (Math.abs(bob) * 0.05 * rushFactor);
                rotationZ = Math.cos(now * moveSpeed * wadingFactor) * 0.05;
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

        // --- 5. Optimized Footprints (Zero-GC) ---
        if (animState.isMoving && !animState.isSwimming && !animState.isRolling && !animState.isDead) {

            // We reuse the `bob` and speed variables calculated in step 2!
            const moveFreq = moveSpeed * wadingFactor;
            const sway = Math.cos(animState.renderTime * moveFreq);
            const lastSway = mesh.userData.lastSway || 0;
            const threshold = 0.8;

            let triggered = false;
            let isRight = false;

            if (lastSway < threshold && sway >= threshold) {
                triggered = true; isRight = true;
            } else if (lastSway > -threshold && sway <= -threshold) {
                triggered = true; isRight = false;
            }

            if (triggered) {
                // Fast World Position fallback (assuming mesh.parent is the Scene or a static group)
                if (mesh.parent) {
                    _v1.set(mesh.position.x, mesh.position.y, mesh.position.z);
                    _v1.applyMatrix4(mesh.parent.matrixWorld);
                } else {
                    _v1.copy(mesh.position);
                }
            }

            mesh.userData.lastSway = sway;
        } else {
            mesh.userData.lastSway = 0;
        }
    }
};