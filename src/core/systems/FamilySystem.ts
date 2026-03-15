import * as THREE from 'three';
import type React from 'react';
import { GameSessionLogic } from '../GameSessionLogic';
import { System } from './System';
import { PlayerAnimator } from '../animation/PlayerAnimator';
import { WinterEngine } from '../engine/WinterEngine';
import { _buoyancyResult } from './WaterSystem';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3(); // Target Position / Offset
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
        const speedMultiplier = (_session.state as any).stats?.speed ?? 1.0;
        let followSpeed = 15 * speedMultiplier;

        if (state.isSwimming) {
            followSpeed *= 0.35;
        } else if (state.isWading) {
            followSpeed *= 0.6;
        } else if (state.isRushing) {
            followSpeed *= 1.75;
        } else if (state.isRolling) {
            followSpeed *= 2.5;
        }

        const maxFollowSpeed = followSpeed * 1.25;
        const activeVehicle = (state as any).activeVehicle;
        const inVehicle = !!activeVehicle;

        for (let i = 0; i < members.length; i++) {
            const familyMember = members[i];
            if (!familyMember.mesh) continue;

            const fm = familyMember.mesh;
            const userData = fm.userData;

            // Ensure they are always visible (whether in car or outside)
            if (!fm.visible) fm.visible = true;

            // --- 0. VEHICLE RIDING LOGIC ---
            if (inVehicle) {
                // [VINTERDÖD FIX] Only put family members IN the vehicle if they are actively following!
                // Unrescued family members waiting in the sector should stay where they are.
                if (!familyMember.following) continue;

                const def = activeVehicle.userData.vehicleDef;
                const suspY = activeVehicle.userData.suspY || 0;

                // Hide the interaction ring while riding
                if (familyMember.ring && familyMember.ring.visible) {
                    familyMember.ring.visible = false;
                }

                // Determine dynamic passenger seat offsets for the whole family
                let pX = 0, pY = 0, pZ = 0;

                // Get driver offset as base reference
                const dX = def?.seatOffset?.x || -0.4;
                const dY = def?.seatOffset?.y || 0.6;
                const dZ = def?.seatOffset?.z || 0.0;

                // Specific seat mapping (Assuming Spelaren/Robert is driving)
                if (i === 0) {
                    // Nathalie (Adult) - Front Passenger
                    pX = -dX; pY = dY; pZ = dZ;
                } else if (i === 1) {
                    // Loke (Child 1) - Back Left
                    pX = dX; pY = dY; pZ = dZ - 1.2;
                } else if (i === 2) {
                    // Esmeralda (Child 2) - Back Middle
                    pX = 0; pY = dY; pZ = dZ - 1.2;
                } else if (i === 3) {
                    // Jordan (Child 3) - Back Right
                    pX = -dX; pY = dY; pZ = dZ - 1.2;
                } else if (i === 4) {
                    // Cat 1 - Trunk Left
                    pX = dX * 0.8; pY = dY + 0.1; pZ = dZ - 2.2;
                } else if (i === 5) {
                    // Cat 2 - Trunk Right
                    pX = -dX * 0.8; pY = dY + 0.1; pZ = dZ - 2.2;
                } else {
                    // Fallback if more members
                    pX = 0; pY = dY + 0.1; pZ = dZ - 2.2;
                }

                // Apply vehicle rotation to the local offset
                _v1.set(pX, pY + suspY, pZ);
                _v1.applyQuaternion(activeVehicle.quaternion);

                // Lock position and rotation to the vehicle
                fm.position.copy(activeVehicle.position).add(_v1);
                fm.quaternion.copy(activeVehicle.quaternion);

                // Force Idle Animation
                let body = userData.cachedBody;
                if (!body) {
                    body = fm.children.find((c: any) => c.userData.isBody);
                    if (body) userData.cachedBody = body;
                }
                if (body) {
                    _animState.seed = familyMember.seed;
                    _animState.isMoving = false;
                    _animState.isRushing = false;
                    _animState.isRolling = false;
                    _animState.isSwimming = false;
                    _animState.isWading = false;
                    _animState.isIdleLong = false;
                    PlayerAnimator.update(body, _animState, now, delta);
                }

                userData.wasInVehicle = true;
                continue; // Skip the rest of the loop (following logic)
            }

            // --- 0.5 VEHICLE EXIT LOGIC ---
            if (userData.wasInVehicle) {
                userData.wasInVehicle = false;

                // Smooth dismount: Spread the active family members out so they don't clip
                const spreadX = (i % 2 === 0 ? 1 : -1) * (1.5 + (i * 0.4));
                const spreadZ = (Math.random() - 0.5) * 2.0;

                fm.position.copy(this.playerGroup.position);
                fm.position.x += spreadX;
                fm.position.z += spreadZ;

                // [VINTERDÖD FIX] Don't force y=0 here, let the animation system handle floor alignment 
                // based on buoyancy or ground checks in the next frame to prevent "pop" or sinking.
                fm.rotation.set(0, 0, 0); // Reset rotation so they don't lean
                userData.lastMoveTime = now; // Reset idle timer
            }

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
                // --- FORMATION LOGIC ---
                // We want them to follow staggered behind the player
                // Get player's forward/right vectors
                const pRot = this.playerGroup.rotation.y;
                const cos = Math.cos(pRot);
                const sin = Math.sin(pRot);

                // Forward vector (approx): [sin, 0, cos]
                // Right vector (approx): [cos, 0, -sin]

                // Staggering: 
                // i=0 (Loke): Slightly left-behind
                // i=1 (Jordan): Slightly right-behind
                // i=2 (Esmeralda): Further left-behind
                // etc.
                const sideSign = i % 2 === 0 ? -1 : 1;
                const row = Math.floor(i / 2) + 1; // 1, 2, 3...

                const backDist = 2.0 + row * 1.2;
                const sideDist = 1.5 + (i % 2) * 0.5;

                // Local offset relative to player (z is back, x is side)
                const localX = sideSign * sideDist;
                const localZ = -backDist;

                // Rotate local offset to world space
                _v1.copy(this.playerGroup.position);
                _v1.x += localX * cos + localZ * sin;
                _v1.z += -localX * sin + localZ * cos;

                const distSq = fm.position.distanceToSquared(_v1);


                if (distSq > 4.0) { // 2.0m threshold
                    fmIsMoving = true;

                    // Teleport catch-up if they get stuck incredibly far behind
                    if (distSq > 900.0) {
                        fm.position.copy(_v1);
                    } else {
                        // If they're far behind, let them move faster to catch up
                        const catchUpBoost = distSq > 25.0 ? 1.4 : 1.0;
                        const actualSpeed = Math.min(maxFollowSpeed, followSpeed * catchUpBoost);

                        _v3.subVectors(_v1, fm.position).normalize();
                        fm.position.addScaledVector(_v3, actualSpeed * delta);
                        fm.lookAt(this.playerGroup.position);
                    }
                    userData.lastMoveTime = now;
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

                // [VINTERDÖD MOD] Support speaking/thinking for family members during gameplay
                _animState.isSpeaking = now < (userData.speakingUntil || 0);
                _animState.isThinking = now < (userData.thinkingUntil || 0);

                const engine = WinterEngine.getInstance();
                if (engine?.water) {
                    engine.water.checkBuoyancy(fm.position.x, fm.position.y, fm.position.z);
                    _animState.isSwimming = _buoyancyResult.depth > 1.2;
                    _animState.isWading = _buoyancyResult.depth > 0.4 && !_animState.isSwimming;

                    if (_buoyancyResult.inWater) {
                        const swimY = _buoyancyResult.waterLevel - 0.35;
                        const targetY = _animState.isSwimming ? swimY : _buoyancyResult.groundY;
                        fm.position.y = THREE.MathUtils.lerp(fm.position.y, targetY, 4 * delta);

                        if (_animState.isSwimming || _animState.isWading) {
                            const rx = userData.lastRippleX ?? fm.position.x + 99;
                            const rz = userData.lastRippleZ ?? fm.position.z + 99;
                            const dx = fm.position.x - rx;
                            const dz = fm.position.z - rz;
                            if (dx * dx + dz * dz > 0.5) {
                                engine.water.spawnRipple(fm.position.x, fm.position.z, _animState.isSwimming ? 0.8 : 0.5);
                                userData.lastRippleX = fm.position.x;
                                userData.lastRippleZ = fm.position.z;
                            }
                        }
                    } else {
                        _animState.isSwimming = false;
                        _animState.isWading = false;
                        if (fm.position.y !== 0) {
                            fm.position.y = THREE.MathUtils.lerp(fm.position.y, 0, 15 * delta);
                            if (Math.abs(fm.position.y) < 0.01) fm.position.y = 0;
                        }
                    }
                } else {
                    _animState.isSwimming = false;
                    _animState.isWading = false;
                }

                PlayerAnimator.update(body, _animState, now, delta);
            }
        }
    }
}