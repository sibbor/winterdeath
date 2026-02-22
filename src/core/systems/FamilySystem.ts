import * as THREE from 'three';
import { PlayerAnimation } from '../animation/PlayerAnimation';
import { Engine } from '../engine/Engine';
import { _buoyancyResult } from './WaterSystem';

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
    isWading: false,
    isSwimming: false,
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
        // [VINTERDÖD] Cachea referensen för att undvika onödiga hash-map uppslagningar i JS-motorn
        const userData = fm.userData;

        // --- 1. Ring Pulse Visual ---
        const ring = familyMember.ring;
        if (ring) {
            const isFollowing = familyMember.following;
            ring.visible = !isFollowing;

            if (!isFollowing) {
                const pulse = 1.0 + Math.sin(now * 0.003) * 0.1;
                // [VINTERDÖD] set(x,y,z) kringgår det extra anropet i setScalar
                ring.scale.set(pulse, pulse, pulse);
                ring.rotation.y = now * 0.0005;
            }
        }

        // --- 2. Following Logic ---
        let fmIsMoving = false;

        if (familyMember.following && !isCinematicActive) {
            _v1.copy(playerGroup.position);

            if (followerIndex > 0) {
                // OPTIMIZATION: Replaced heavy trigonometry with simple math.
                const sign = followerIndex % 2 === 0 ? 1 : -1;
                const dist = 2.0 + followerIndex * 1.2;

                // Directly apply offset to the X axis (Z remains unchanged)
                _v1.x += sign * dist;
            }

            const distSq = fm.position.distanceToSquared(_v1);

            if (distSq > 4.0) { // 2.0m threshold
                fmIsMoving = true;

                _v3.subVectors(_v1, fm.position).normalize();

                // [VINTERDÖD] Pre-kalkylerad hastighet (14 * 0.95 = 13.3)
                const moveDist = 13.3 * delta;

                fm.position.addScaledVector(_v3, moveDist);
                fm.lookAt(playerGroup.position);

                userData.lastMoveTime = now;
            }
        }

        // --- 3. Optimized Animation Handling ---
        let body = userData.cachedBody;
        if (!body) {
            // [VINTERDÖD] Utplånade .find(). Rå, platt loop istället för callbacks och array-allokering.
            const children = fm.children;
            const len = children.length;
            for (let i = 0; i < len; i++) {
                if (children[i].userData.isBody) {
                    body = children[i];
                    userData.cachedBody = body;
                    break;
                }
            }
        }

        if (body) {
            let lastMove = userData.lastMoveTime;
            if (lastMove === undefined) {
                lastMove = state.startTime;
                userData.lastMoveTime = lastMove;
            }

            const timeSinceMove = now - lastMove;
            const isIdleLong = timeSinceMove > 10000;

            // [VINTERDÖD] Direkt uppdatering av scratchpad. Tvingar även till booleans med dubbla negationer (!!) vid behov.
            _animState.seed = familyMember.seed;

            // Add aquatic state check for family members
            const engine = Engine.getInstance();
            if (engine?.water) {
                engine.water.checkBuoyancy(fm.position.x, fm.position.y, fm.position.z);
                _animState.isSwimming = _buoyancyResult.depth > 1.2;
                _animState.isWading = _buoyancyResult.depth > 0.4 && !_animState.isSwimming;
            } else {
                _animState.isSwimming = false;
                _animState.isWading = false;
            }

            PlayerAnimation.update(body, _animState, now, delta);
        }
    }
};