import * as THREE from 'three';
import { FootprintSystem } from '../systems/FootprintSystem';

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
    seed: number;
}

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _e1 = new THREE.Euler(0, 0, 0, 'YXZ');

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
        let positionY = 0;

        // Breathe speed based on stamina (heavy breathing when tired)
        const breatheSpeed = 0.003 + ((1.0 - animState.staminaRatio) * 0.012);
        const breatheAmp = 0.02 + ((1.0 - animState.staminaRatio) * 0.06);

        // --- 2. State Machine (Priority Order) ---

        if (animState.isDead) {
            // High-speed death animation (350ms)
            const deathDuration = 350;
            const progress = Math.min(1, Math.max(0, (now - (animState.deathStartTime || now)) / deathDuration));

            rotationX = -Math.PI / 2 * progress;
            positionY = -0.8 * progress; // Sink into snow/ground

        } else if (animState.isRolling) {
            const progress = (now - animState.rollStartTime) / 300;
            rotationX = progress * Math.PI * 2;
            const squashFactor = Math.sin(progress * Math.PI);
            scaleY = 1.0 - (squashFactor * 0.4);
            scaleXZ = 1.0 + (squashFactor * 0.4);
            positionY = 0.2;
        } else if (animState.isSwimming) {
            // Swimming Animation: Heavy lean, deep bobbing
            const swimSpeed = 0.008;
            const bob = Math.sin(now * swimSpeed);
            rotationX = 1.3; // Horizontal "swimming" lean
            positionY = -0.4 + bob * 0.15; // Bobbing in water
            scaleY = 1.0 + bob * 0.05;
            rotationZ = Math.sin(now * swimSpeed * 0.5) * 0.1;
        } else if (animState.isMoving) {
            const moveSpeed = animState.isRushing ? 0.020 : 0.012;
            const wadingFactor = animState.isWading ? 0.6 : 1.0;
            const bob = Math.sin(now * moveSpeed * wadingFactor);
            const rushFactor = animState.isRushing ? 2.0 : 1.0;

            rotationX = animState.isRushing ? 0.4 : (animState.isWading ? 0.3 : 0.2);
            scaleY = 1.0 + (Math.abs(bob) * 0.1 * rushFactor);
            scaleXZ = 1.0 - (Math.abs(bob) * 0.05 * rushFactor);
            rotationZ = Math.cos(now * moveSpeed * wadingFactor) * 0.05;

        } else {
            // Stationary behaviors (Breathing, Speaking, Thinking)
            const breathe = Math.sin(now * breatheSpeed + animState.seed);
            scaleY = 1.0 + (breathe * breatheAmp);
            scaleXZ = 1.0 - (breathe * (breatheAmp * 0.5));

            if (animState.isSpeaking) {
                const talkWobble = Math.sin(now * 0.03) * 0.1;
                scaleY += talkWobble + 0.1;
                scaleXZ -= talkWobble * 0.5;
            }

            if (animState.isThinking) {
                const nod = Math.sin(now * 0.008);
                rotationX = 0.3 + (nod * 0.1); // Pensive lean
                rotationZ = Math.sin(now * 0.003) * 0.1;
            }

            // Long Idle Fidgeting
            if (animState.isIdleLong && !animState.isSpeaking && !animState.isThinking) {
                const t = now * 0.001;
                const shiverTrigger = Math.sin(t * 0.15 + animState.seed);
                if (shiverTrigger > 0.8) {
                    rotationZ = Math.sin(now * 0.05) * 0.03;
                }
                const shiftTrigger = Math.sin(t * 0.6 + animState.seed * 3);
                if (shiftTrigger > 0.95) {
                    positionY = Math.sin(now * 0.01) * 0.05;
                }
            }
        }

        // --- 3. Apply Optimized Transforms ---
        const baseScale = mesh.userData.baseScale || 1.0;
        const baseHeight = mesh.userData.baseY || 1.0;

        mesh.scale.set(scaleXZ * baseScale, scaleY * baseScale, scaleXZ * baseScale);
        mesh.rotation.set(rotationX, rotationY, rotationZ);

        // Adjust pivot to keep feet on ground despite scaling
        mesh.position.y = (baseHeight * scaleY) + positionY;

        // --- 4. Optimized Footprints (Zero-GC) ---
        if ((animState.isMoving || animState.isRushing) && !animState.isSwimming) {
            const moveFreq = animState.isRushing ? 0.020 : 0.012;
            const sway = Math.cos(now * moveFreq);
            const lastSway = mesh.userData.lastSway || 0;
            const threshold = 0.8;

            // Check if we hit a peak (weight shift fully over one foot)
            let triggered = false;
            let isRight = false;

            if (lastSway < threshold && sway >= threshold) {
                triggered = true; isRight = true;
            } else if (lastSway > -threshold && sway <= -threshold) {
                triggered = true; isRight = false;
            }

            if (triggered) {
                // Perform expensive world-space lookups only when a step is actually triggered
                mesh.getWorldPosition(_v1);
                mesh.getWorldQuaternion(_q1);
                _e1.setFromQuaternion(_q1);

                FootprintSystem.addFootprint(_v1, _e1.y, isRight);
            }

            mesh.userData.lastSway = sway;
        } else {
            mesh.userData.lastSway = 0;
        }
    }
};