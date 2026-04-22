import * as THREE from 'three';
import { PlayerNodes } from './PlayerTypes';

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

    // --- VINTERDÖD: CACHED LEANING FOR SMOOTHER MOTION ---
    leanX?: number;
    leanZ?: number;

    // --- VINTERDÖD: CACHED ENTITY STATE (Phase 13) ---
    nodes?: PlayerNodes;
    baseScale?: number;
    baseY?: number;
}

export const PlayerAnimator = {

    update: (
        mesh: THREE.Mesh | THREE.Object3D,
        animState: AnimState,
        renderTime: number,
        delta: number
    ) => {
        if (!mesh) return;

        const simTime = animState.simTime || renderTime;
        const t = animState.renderTime;
        const seed = animState.seed || 0;

        // --- 1. Math Hoisting (Zero-GC / O(1)) ---
        // Pre-calculate all common transcendental functions once per frame
        const breatheSpeed = 0.003 + ((1.0 - animState.staminaRatio) * 0.012);
        const breatheAmp = 0.02 + ((1.0 - animState.staminaRatio) * 0.06);

        const sinBreathe = Math.sin(t * breatheSpeed + seed);
        const sinIdleLong = Math.sin(t * 0.002 + seed * 0.5);
        const sinShift = Math.sin(t * 0.0006 + seed * 3); // Scaled from 0.001

        // --- 2. Base Variables ---
        let scaleY = 1.0;
        let scaleXZ = 1.0;
        let rotationX = 0;
        let rotationZ = 0;
        let positionY = 0;

        // Variables needed later for movement
        let moveSpeed = 0;
        let wadingFactor = 1.0;
        let bob = 0;

        // --- 3. State Machine (Priority Order) ---

        // Death animation
        if (animState.isDead) {
            const deathDuration = 350;
            const progress = Math.min(1.0, Math.max(0.0, (simTime - (animState.deathStartTime || simTime)) / deathDuration));
            rotationX = -Math.PI / 2 * progress;
            positionY = -0.8 * progress;
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
            const bounce = Math.abs(Math.sin(t * 0.025 + seed));
            positionY = bounce * 0.55;
            scaleY = 1.0 + bounce * 0.15;
            scaleXZ = 1.0 - bounce * 0.07;
            rotationX = -0.2 * bounce;
            rotationZ = Math.sin(t * 0.02 + seed) * 0.08;
        }

        // Hugging close embrace (lean forward + rock side to side)
        else if (animState.isHugging) {
            rotationX = 0.35 + Math.sin(t * 0.004 + seed) * 0.08;
            rotationZ = Math.sin(t * 0.003 + seed * 1.7) * 0.12;
            positionY = Math.sin(t * 0.003 + seed) * 0.04;
        }

        // Swimming Animation: Heavy lean, deep bobbing
        else if (animState.isSwimming) {
            const swimSpeed = 0.008;
            bob = Math.sin(t * swimSpeed);
            rotationX = 1.45; // Flatter "swimming" pose
            positionY = -0.7 + bob * 0.15; // Bobbing in water
            scaleY = 1.0 + bob * 0.05;
            rotationZ = Math.sin(t * swimSpeed * 0.5) * 0.1;
        }

        // Moving animation
        else if (animState.isMoving) {
            const baseFrequency = 0.012;
            const speedRatio = animState.currentSpeedRatio || 1.0;
            moveSpeed = baseFrequency * speedRatio;
            wadingFactor = animState.isWading ? 0.6 : 1.0;

            const moveTime = t * moveSpeed * wadingFactor;
            bob = Math.sin(moveTime);
            const absBob = Math.abs(bob);
            const cosWobble = Math.cos(moveTime);
            const rushFactor = animState.isRushing ? 2.0 : 1.0;

            // --- VINTERDÖD: TARGET LEAN CALCULATION ---
            let targetLeanX = animState.isRushing ? 0.4 : (animState.isWading ? 0.3 : 0.2); // Default framåt
            let targetLeanZ = 0;

            if (animState.isBacking) {
                targetLeanX = -0.15; // Luta bakåt vid backpedal
            } else if (animState.isStrafing) {
                targetLeanX = 0.05; // Luta i stort sett rakt upp
                // Luta axlarna in i rörelseriktningen (Strafe)
                targetLeanZ = (animState.strafeDirection || 0) * 0.25;
            }

            // --- VINTERDÖD: SMOOTH LERPING (ZERO-GC) ---
            // Detta skapar den "fjädrande", mjuka Game Feel-övergången
            animState.leanX = THREE.MathUtils.lerp(animState.leanX || 0, targetLeanX, 10 * delta);
            animState.leanZ = THREE.MathUtils.lerp(animState.leanZ || 0, targetLeanZ, 10 * delta);

            rotationX = animState.leanX;
            rotationZ = animState.leanZ + (cosWobble * 0.05); // Lägg animerings-wobble ovanpå baslutningen

            // Vanka/Bounce beroende på riktning
            if (animState.isBacking) {
                scaleY = 1.0 + (absBob * 0.15 * rushFactor);
                scaleXZ = 1.0 - (absBob * 0.05 * rushFactor);
                positionY = absBob * 0.1; // Lägre bounce
            } else if (animState.isStrafing) {
                scaleY = 1.0 + (absBob * 0.1 * rushFactor);
                scaleXZ = 1.0 - (absBob * 0.05 * rushFactor);
                positionY = absBob * 0.15; // Medel bounce
            } else {
                scaleY = 1.0 + (absBob * 0.1 * rushFactor);
                scaleXZ = 1.0 - (absBob * 0.05 * rushFactor);
                positionY = absBob * 0.2; // Aggressiv framåt-bounce
            }

            if (animState.isWading) positionY += absBob * 0.2;
        }

        // Stationary behaviors
        else {
            // --- VINTERDÖD: Återgå mjukt till upprätt när man stannar ---
            animState.leanX = THREE.MathUtils.lerp(animState.leanX || 0, 0, 10 * delta);
            animState.leanZ = THREE.MathUtils.lerp(animState.leanZ || 0, 0, 10 * delta);

            rotationX = animState.leanX;
            rotationZ = animState.leanZ + (Math.sin(t * 0.001 + seed) * 0.03);

            scaleY = 1.0 + (sinBreathe * breatheAmp * 1.5);
            scaleXZ = 1.0 - (sinBreathe * (breatheAmp * 0.75));

            // Speaking animation
            if (animState.isSpeaking) {
                const talkWobble = Math.sin(t * 0.03) * 0.1;
                scaleY += talkWobble + 0.1;
                scaleXZ -= talkWobble * 0.5;
            }
            // Thinking animation
            else if (animState.isThinking) {
                const nod = Math.sin(t * 0.008);
                rotationX = 0.3 + (nod * 0.1);
                rotationZ += Math.sin(t * 0.003) * 0.1;
            }

            // Idle Long: Adds shiver/shake + breathing
            else if (animState.isIdleLong) {
                const shiverTrigger = Math.sin(t * 0.00015 + seed); // Scaled from 0.001
                if (shiverTrigger > 0.8) rotationZ += Math.sin(t * 0.05) * 0.05;
                if (sinShift > 0.95) {
                    positionY = Math.sin(t * 0.01) * 0.08;
                    rotationX += Math.sin(t * 0.005) * 0.05;
                }
            } else {
                positionY = sinIdleLong * 0.03;
            }
        }

        // --- 4. Apply Optimized Transforms (Zero-Indirection with Fallback) ---
        const baseScale = animState.baseScale ?? (mesh.userData.baseScale || 1.0);
        const baseY = animState.baseY ?? (mesh.userData.baseY || 0);

        mesh.scale.set(scaleXZ * baseScale, scaleY * baseScale, scaleXZ * baseScale);
        mesh.rotation.x = rotationX;
        mesh.rotation.z = rotationZ;
        mesh.position.y = (baseY * scaleY) + positionY;

        // --- 5. Equipment Aim Adjustment (O(1) with Traverse Fallback) ---
        const nodes = animState.nodes;
        if (nodes) {
            if (nodes.gun) {
                nodes.gun.rotation.x = -rotationX;
                nodes.gun.position.y = animState.isSwimming ? 0.6 : 0.4;
                nodes.gun.position.z = animState.isSwimming ? 0.8 : 0.5;
            }
            if (nodes.laserSight) {
                nodes.laserSight.rotation.x = -rotationX;
                nodes.laserSight.position.y = animState.isSwimming ? 0.6 : 0.4;
                nodes.laserSight.position.z = animState.isSwimming ? 0.8 : 0.5;
            }
        } else {
            // Traverse Fallback for non-cached entities (Family members, cinematic props)
            const children = mesh.children;
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                if (child.name === 'gun' || child.userData.isLaserSight) {
                    child.rotation.x = -rotationX;
                    child.position.y = animState.isSwimming ? 0.6 : 0.4;
                    child.position.z = animState.isSwimming ? 0.8 : 0.5;
                }
            }
        }
    }
};