import * as THREE from 'three';
import { PlayerAnimation } from '../animation/PlayerAnimation';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3(); // Target Position
const _v2 = new THREE.Vector3(); // Offset / MoveVec
const _v3 = new THREE.Vector3(); // Direction

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

        // --- 1. Ring Pulse Visual (Static logic) ---
        if (familyMember.ring) {
            familyMember.ring.visible = !familyMember.following;

            if (familyMember.ring.visible) {
                const pulse = 1.0 + Math.sin(now * 0.003) * 0.1;
                familyMember.ring.scale.setScalar(pulse);
                familyMember.ring.rotation.y = now * 0.0005;
            }
        }

        // --- 2. Following Logic with Zero-GC Spacing ---
        let fmIsMoving = false;

        if (familyMember.following && !isCinematicActive) {
            // Start with player position without cloning
            _v1.copy(playerGroup.position);

            if (followerIndex > 0) {
                const angle = (followerIndex % 2 === 0 ? 1 : -1) * 0.5;
                const dist = 2.0 + followerIndex * 1.2;

                // Calculate circular offset using scratchpad _v2
                _v2.set(
                    Math.sin(angle * Math.PI) * dist,
                    0,
                    Math.cos(angle * Math.PI) * dist
                );
                _v1.add(_v2); // _v1 is now our final targetPos
            }

            // Optimization: distanceToSquared is much faster than distanceTo
            const distSq = fm.position.distanceToSquared(_v1);

            if (distSq > 4.0) { // 2.0m threshold (2^2)
                fmIsMoving = true;

                // Calculate direction using _v3
                _v3.subVectors(_v1, fm.position).normalize();

                const speed = 14;
                const moveDist = speed * 0.95 * delta;

                // Apply movement
                fm.position.addScaledVector(_v3, moveDist);

                // Rotation: Always face the player (using player position, not target offset)
                fm.lookAt(playerGroup.position);
            }
        }

        // --- 3. Optimized Animation Handling ---
        // Ensure we only look for the body mesh once
        if (!fm.userData.cachedBody) {
            const body = fm.children.find((c: any) => c.userData.isBody);
            if (body) fm.userData.cachedBody = body;
        }

        const body = fm.userData.cachedBody;

        if (body) {
            const timeSinceAction = now - state.lastActionTime;
            const isIdleLong = timeSinceAction > 20000;
            const fmIdleLong = familyMember.following ? isIdleLong : (now - state.startTime > 20000);

            PlayerAnimation.update(body, {
                isMoving: fmIsMoving || familyMember.isMoving,
                isRushing: false,
                isRolling: false,
                rollStartTime: 0,
                staminaRatio: 1.0,
                isSpeaking: (familyMember.isSpeaking !== undefined) ? familyMember.isSpeaking : (now < state.speakingUntil),
                isThinking: (familyMember.isThinking !== undefined) ? familyMember.isThinking : (now < state.thinkingUntil),
                isIdleLong: fmIdleLong && !fmIsMoving,
                seed: familyMember.seed
            }, now, delta);
        }
    }
};