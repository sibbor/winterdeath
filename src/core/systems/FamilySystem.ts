import * as THREE from 'three';
import { PlayerAnimation } from '../animation/PlayerAnimation';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3(); // Target Position
const _v3 = new THREE.Vector3(); // Direction

// 1. Create a single, reusable animation state object outside the render loop
const _animState = {
    isMoving: false,
    isRushing: false,
    isRolling: false,
    rollStartTime: 0,
    staminaRatio: 1.0,
    isSpeaking: false,
    isThinking: false,
    isIdleLong: false,
    seed: 0
};

export const FamilySystem = {
    update: (
        familyMember: any,
        playerGroup: THREE.Group,
        state: any,
        isCinematicActive: boolean,
        now: number,
        delta: number,
        callbacks: {
            setFoundMemberName: (name: string) => void;
            startCinematic: (mesh: THREE.Group) => void;
        },
        followerIndex: number = 0
    ) => {
        if (!familyMember.mesh) return;

        const fm = familyMember.mesh;

        // --- 1. Ring Pulse Visual ---
        if (familyMember.ring) {
            familyMember.ring.visible = !familyMember.following;

            if (familyMember.ring.visible) {
                const pulse = 1.0 + Math.sin(now * 0.003) * 0.1;
                familyMember.ring.scale.setScalar(pulse);
                familyMember.ring.rotation.y = now * 0.0005;
            }
        }

        // --- 2. Following Logic ---
        let fmIsMoving = false;

        if (familyMember.following && !isCinematicActive) {
            _v1.copy(playerGroup.position);

            if (followerIndex > 0) {
                // OPTIMIZATION: Replaced heavy trigonometry with simple math.
                // Since angle was always ±0.5 * PI, sin is ±1 and cos is 0.
                const sign = followerIndex % 2 === 0 ? 1 : -1;
                const dist = 2.0 + followerIndex * 1.2;

                // Directly apply offset to the X axis (Z remains unchanged)
                _v1.x += sign * dist;
            }

            const distSq = fm.position.distanceToSquared(_v1);

            if (distSq > 4.0) { // 2.0m threshold
                fmIsMoving = true;

                _v3.subVectors(_v1, fm.position).normalize();

                const speed = 14;
                const moveDist = speed * 0.95 * delta;

                fm.position.addScaledVector(_v3, moveDist);
                fm.lookAt(playerGroup.position);

                fm.userData.lastMoveTime = now;
            }
        }

        // --- 3. Optimized Animation Handling ---
        if (!fm.userData.cachedBody) {
            const body = fm.children.find((c: any) => c.userData.isBody);
            if (body) fm.userData.cachedBody = body;
        }

        const body = fm.userData.cachedBody;

        if (body) {
            if (fm.userData.lastMoveTime === undefined) fm.userData.lastMoveTime = state.startTime;

            const timeSinceMove = now - fm.userData.lastMoveTime;
            const isIdleLong = timeSinceMove > 10000;

            // OPTIMIZATION: Update the reusable scratchpad object instead of creating a new one
            _animState.isMoving = fmIsMoving || familyMember.isMoving;
            _animState.isSpeaking = (familyMember.isSpeaking !== undefined) ? familyMember.isSpeaking : (now < state.speakingUntil);
            _animState.isThinking = (familyMember.isThinking !== undefined) ? familyMember.isThinking : (now < state.thinkingUntil);
            _animState.isIdleLong = isIdleLong && !fmIsMoving;
            _animState.seed = familyMember.seed;

            PlayerAnimation.update(body, _animState, now, delta);
        }
    }
};