import * as THREE from 'three';
import type React from 'react';
import { GameSessionLogic } from '../GameSessionLogic';
import { System } from './System';
import { PlayerAnimation } from '../animation/PlayerAnimation';
import { WinterEngine } from '../engine/WinterEngine';
import { _buoyancyResult } from './WaterSystem';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3(); // Target Position
const _v3 = new THREE.Vector3(); // Direction

// Single reusable animation state — avoids per-frame object allocation
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
    isDead: false,
    deathStartTime: 0,
    seed: 0
};

export class FamilySystem implements System {
    id = 'family';

    private playerGroup: THREE.Group;
    private activeFamilyMembers: React.MutableRefObject<any[]>;
    private isCinematicRef: React.MutableRefObject<{ active: boolean }>;
    private callbacks: {
        setFoundMemberName: (name: string) => void;
        startCinematic: (mesh: THREE.Group) => void;
    };

    constructor(
        playerGroup: THREE.Group,
        activeFamilyMembers: React.MutableRefObject<any[]>,
        isCinematicRef: React.MutableRefObject<{ active: boolean }>,
        callbacks: {
            setFoundMemberName: (name: string) => void;
            startCinematic: (mesh: THREE.Group) => void;
        }
    ) {
        this.playerGroup = playerGroup;
        this.activeFamilyMembers = activeFamilyMembers;
        this.isCinematicRef = isCinematicRef;
        this.callbacks = callbacks;
    }

    update(_session: GameSessionLogic, delta: number, now: number) {
        const members = this.activeFamilyMembers.current;
        const isCinematicActive = this.isCinematicRef.current.active;
        const state = _session.state;

        // --- Mirror player speed for the follow movement ---
        // Base speed matches PlayerMovementSystem: 15 * stats.speed
        // (stats is not typed on RuntimeState but is set dynamically via the armory station)
        const speedMultiplier = (_session.state as any).stats?.speed ?? 1.0;
        let followSpeed = 15 * speedMultiplier;

        // Apply the same modifiers as the player
        if (state.isSwimming) {
            followSpeed *= 0.35;
        } else if (state.isWading) {
            followSpeed *= 0.6;
        } else if (state.isRushing) {
            followSpeed *= 1.75;
        } else if (state.isRolling) {
            followSpeed *= 2.5;
        }

        // Family members slightly trail behind — apply a small lag so they
        // feel like they're catching up, not teleporting. Clamp to 1.2× player speed max.
        const maxFollowSpeed = followSpeed * 1.25;

        for (let i = 0; i < members.length; i++) {
            const familyMember = members[i];
            if (!familyMember.mesh) continue;

            const fm = familyMember.mesh;
            const userData = fm.userData;

            // --- 1. Ring Pulse Visual ---
            const ring = familyMember.ring;
            if (ring) {
                const isFollowing = familyMember.following;
                ring.visible = !isFollowing;
                if (!isFollowing) {
                    const pulse = 1.0 + Math.sin(now * 0.003) * 0.1;
                    ring.scale.set(pulse, pulse, pulse);
                    ring.rotation.y = now * 0.0005;
                }
            }

            // --- 2. Following Logic ---
            let fmIsMoving = false;
            let fmIsRushing = false;

            if (familyMember.following && !isCinematicActive) {
                _v1.copy(this.playerGroup.position);

                // Stagger positions so they don't all overlap
                if (i > 0) {
                    const sign = i % 2 === 0 ? 1 : -1;
                    const dist = 2.0 + i * 1.2;
                    _v1.x += sign * dist;
                }

                const distSq = fm.position.distanceToSquared(_v1);

                if (distSq > 4.0) {
                    fmIsMoving = true;
                    // If they're far behind, let them move faster to catch up
                    const catchUpBoost = distSq > 25.0 ? 1.4 : 1.0;
                    const actualSpeed = Math.min(maxFollowSpeed, followSpeed * catchUpBoost);

                    _v3.subVectors(_v1, fm.position).normalize();
                    fm.position.addScaledVector(_v3, actualSpeed * delta);
                    fm.lookAt(this.playerGroup.position);
                    userData.lastMoveTime = now;

                    // Mirror rush animation if player is rushing and family is moving fast
                    fmIsRushing = state.isRushing || state.isRolling;
                }
            }

            // --- 3. Animation ---
            let body = userData.cachedBody;
            if (!body) {
                const children = fm.children;
                for (let j = 0; j < children.length; j++) {
                    if (children[j].userData.isBody) {
                        body = children[j];
                        userData.cachedBody = body;
                        break;
                    }
                }
            }

            if (body) {
                const lastMove = userData.lastMoveTime ?? _session.state.startTime;
                const isIdleLong = now - lastMove > 10000;

                _animState.seed = familyMember.seed;
                _animState.isMoving = fmIsMoving;
                _animState.isRushing = fmIsRushing;
                _animState.isRolling = false; // Family members don't dodge-roll
                _animState.staminaRatio = state.stamina / Math.max(1, state.maxStamina);
                _animState.isIdleLong = isIdleLong;

                const engine = WinterEngine.getInstance();
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
    }
}