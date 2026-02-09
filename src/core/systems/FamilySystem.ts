
import * as THREE from 'three';
import { PlayerAnimation } from '../animation/PlayerAnimation';

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

        // Ring Pulse Visual
        if (familyMember.ring) {
            // Only show ring if NOT following (waiting to be found)
            familyMember.ring.visible = !familyMember.following;

            if (familyMember.ring.visible) {
                const pulse = 1.0 + Math.sin(now * 0.003) * 0.1;
                familyMember.ring.scale.setScalar(pulse);
                familyMember.ring.rotation.y = now * 0.0005;
            }
        }

        // Following Logic with Spacing
        let fmIsMoving = false;
        if (familyMember.following && !isCinematicActive) {
            // Calculate a target offset position relative to the player
            // followerIndex 0 stays behind, 1 slightly left, 2 slightly right, etc.
            const targetPos = playerGroup.position.clone();

            if (followerIndex > 0) {
                const angle = (followerIndex % 2 === 0 ? 1 : -1) * 0.5; // Alternating sides
                const dist = 2.0 + followerIndex * 1.2;

                // Get player "back" direction (based on current map movement or just generic Z if standing still)
                // For simplicity, we'll just use a circular offset around the player's follow radius
                const offset = new THREE.Vector3(
                    Math.sin(angle * Math.PI) * dist,
                    0,
                    Math.cos(angle * Math.PI) * dist
                );
                targetPos.add(offset);
            }

            const distSq = fm.position.distanceToSquared(targetPos);

            if (distSq > 4.0) { // Tighter stop distance if we have an offset
                fmIsMoving = true;
                const currentPos = fm.position.clone();
                const dir = new THREE.Vector3().subVectors(targetPos, currentPos).normalize();

                // Slightly slower than player to avoid clipping inside
                const speed = 14;
                const moveVec = dir.multiplyScalar(speed * 0.95 * delta);

                fm.position.add(moveVec);
                fm.lookAt(playerGroup.position); // Always look at the player
            }
        }

        // Animation
        let body = fm.userData.cachedBody;
        if (!body) {
            body = fm.children.find((c: any) => c.userData.isBody);
            if (body) fm.userData.cachedBody = body;
        }

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
