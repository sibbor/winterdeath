
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
        }
    ) => {
        if (!familyMember.mesh) return;

        const fm = familyMember.mesh;
        
        // Ring Pulse Visual
        if (familyMember.ring) {
            const pulse = 1.0 + Math.sin(now * 0.003) * 0.1; 
            familyMember.ring.scale.setScalar(pulse);
            familyMember.ring.rotation.y = now * 0.0005; 
        }

        const distSq = fm.position.distanceToSquared(playerGroup.position);
        
        // Following Logic
        let fmIsMoving = false;
        if (familyMember.following) {
            if (distSq > 9.0) {
                fmIsMoving = true;
                const currentPos = fm.position.clone();
                const dir = new THREE.Vector3().subVectors(playerGroup.position, currentPos).normalize();
                
                // Slightly slower than player to avoid clipping inside
                const speed = 14; 
                const moveVec = dir.multiplyScalar(speed * 0.95 * delta);
                
                fm.position.add(moveVec);
                fm.lookAt(playerGroup.position);
            }
        }

        // Animation
        const body = fm.children.find((c: any) => c.userData.isBody) as THREE.Mesh;
        if (body) {
            const timeSinceAction = now - state.lastActionTime;
            const isIdleLong = timeSinceAction > 20000;
            const fmIdleLong = familyMember.following ? isIdleLong : (now - state.startTime > 20000); 
            
            PlayerAnimation.update(body, { 
                isMoving: fmIsMoving, 
                isRushing: false, 
                isRolling: false, 
                rollStartTime: 0, 
                staminaRatio: 1.0, 
                isSpeaking: false, 
                isThinking: now < state.thinkingUntil, 
                isIdleLong: fmIdleLong && !fmIsMoving, 
                seed: familyMember.seed 
            }, now, delta);
        }
    }
};
