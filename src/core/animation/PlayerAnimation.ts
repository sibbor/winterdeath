
import * as THREE from 'three';
import { FootprintSystem } from '../systems/FootprintSystem';

export interface AnimState {
    // Movement
    isMoving: boolean;
    isRushing: boolean;
    isRolling: boolean;
    rollStartTime: number;

    // Status
    staminaRatio: number; // 0 to 1 (1 = full)
    isDead?: boolean;
    deathStartTime?: number;

    // Actions
    isSpeaking: boolean; // Derived from speakBounce > 0 or external flag
    isThinking: boolean; // New Trigger state

    // Idle
    isIdleLong: boolean; // > 20s inactive

    // Seed for random idle behaviors to desync characters
    seed: number;
}


export const PlayerAnimation = {
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
        let positionY = 0; // Offset from base height

        const breatheSpeed = 0.003 + ((1.0 - animState.staminaRatio) * 0.012);
        const breatheAmp = 0.02 + ((1.0 - animState.staminaRatio) * 0.06);

        // --- 2. State Machine (Priority Order) ---

        if (animState.isDead) {
            // --- DYING / DEAD ---
            // Faster death animation (350ms)
            const deathDuration = 350;
            const progress = Math.min(1, Math.max(0, (now - (animState.deathStartTime || now)) / deathDuration));

            // Fall over backwards
            rotationX = -Math.PI / 2 * progress;
            // Lower to ground - Sink slightly deeper (-0.8) to look like lying IN snow/mud, not floating on it
            positionY = -0.8 * progress;

        } else if (animState.isRolling) {
            // --- ROLLING (Highest Priority) ---
            const progress = (now - animState.rollStartTime) / 300;
            rotationX = progress * Math.PI * 2;
            const squashFactor = Math.sin(progress * Math.PI);
            scaleY = 1.0 - (squashFactor * 0.4);
            scaleXZ = 1.0 + (squashFactor * 0.4);
            positionY = 0.2; // Lift slightly

        } else if (animState.isMoving) {
            // --- MOVING ---
            const moveSpeed = animState.isRushing ? 0.020 : 0.012;
            const bob = Math.sin(now * moveSpeed);
            const rushFactor = animState.isRushing ? 2.0 : 1.0;

            rotationX = animState.isRushing ? 0.4 : 0.2; // Lean forward
            scaleY = 1.0 + (Math.abs(bob) * 0.1 * rushFactor);
            scaleXZ = 1.0 - (Math.abs(bob) * 0.05 * rushFactor);

            // Subtle Z tilt based on stride
            rotationZ = Math.cos(now * moveSpeed) * 0.05;

        } else {
            // --- STATIONARY (Idle / Breathe / Think / Speak) ---

            // A. Breathing (Always active when stationary)
            const breathe = Math.sin(now * breatheSpeed + animState.seed);
            scaleY = 1.0 + (breathe * breatheAmp);
            scaleXZ = 1.0 - (breathe * (breatheAmp * 0.5));

            // B. Speaking (Overrides body shape)
            if (animState.isSpeaking) {
                const talkWobble = Math.sin(now * 0.03) * 0.1;
                scaleY += talkWobble + 0.1; // Stretch up
                scaleXZ -= talkWobble * 0.5;
            }

            // C. Thinking (Head/Body Nod)
            if (animState.isThinking) {
                // Slow, pensive nod
                const nod = Math.sin(now * 0.008);
                rotationX = 0.3 + (nod * 0.1); // Look down slightly and nod
                rotationZ = Math.sin(now * 0.003) * 0.1; // Slight head tilt
            }

            // D. Long Idle (Random Fidgeting)
            if (animState.isIdleLong && !animState.isSpeaking && !animState.isThinking) {
                // Use multiple sine waves with prime periods to create non-repeating chaos
                const t = now * 0.001;

                /*
                // 1. Gentle Look Around (Y Rotation)
                rotationY = Math.sin(t * 0.4 + animState.seed) * 0.3;

                // 2. Look Up/Down (X Rotation) - Occasional
                const lookUpTrigger = Math.sin(t * 0.3 + animState.seed * 2);
                if (lookUpTrigger > 0.85) rotationX = -0.3; // Look up at moon
                else if (lookUpTrigger < -0.85) rotationX = 0.2; // Look at fire
                */

                // 3. Shiver/Shake (Z Rotation) - Fast jitter
                const shiverTrigger = Math.sin(t * 0.15 + animState.seed);
                if (shiverTrigger > 0.8) {
                    rotationZ = Math.sin(now * 0.05) * 0.03; // Corrected shiver speed
                }

                // 4. Subtle Weight Shift (Position Y)
                const shiftTrigger = Math.sin(t * 0.6 + animState.seed * 3);
                if (shiftTrigger > 0.95) {
                    positionY = Math.sin(now * 0.01) * 0.05;
                }
            }
        }

        // --- 3. Apply Transforms ---
        // Retreive baseScale from userData, defaulting to 1.0 if not set
        const baseScale = mesh.userData.baseScale || 1.0;

        mesh.scale.set(scaleXZ * baseScale, scaleY * baseScale, scaleXZ * baseScale);
        mesh.rotation.x = rotationX;
        mesh.rotation.y = rotationY;
        mesh.rotation.z = rotationZ;

        // Pivot adjustment (Model pivot is usually center, so we offset Y based on scale to keep feet on ground)
        // Base body center is usually at Y=1.0 (for player/humans).
        // Ensure we use the original baseHeight stored in userData if available, scaled by the current animation scaleY.
        const baseHeight = mesh.userData.baseY || 1.0;

        mesh.position.y = (baseHeight * scaleY) + positionY;

        // --- 4. Footprints (New) ---
        if (animState.isMoving || animState.isRushing) {
            const sway = Math.cos(now * (animState.isRushing ? 0.020 : 0.012)); // Same calc as rotationZ
            const lastSway = mesh.userData.lastSway || 0;
            const threshold = 0.8;

            // Trigger on peaks (Weight shift fully over foot)
            const worldPos = new THREE.Vector3();
            mesh.getWorldPosition(worldPos);

            // Calculate world rotation Y
            const worldQuat = new THREE.Quaternion();
            mesh.getWorldQuaternion(worldQuat);
            const euler = new THREE.Euler().setFromQuaternion(worldQuat, 'YXZ');
            const worldRotY = euler.y;

            if (lastSway < threshold && sway >= threshold) {
                // Right Step
                FootprintSystem.addFootprint(worldPos, worldRotY, true);
            } else if (lastSway > -threshold && sway <= -threshold) {
                // Left Step
                FootprintSystem.addFootprint(worldPos, worldRotY, false);
            }

            mesh.userData.lastSway = sway;
        } else {
            // Reset sway tracking when stopped so we don't trigger instantly on resume
            mesh.userData.lastSway = 0;
        }
    }
};
