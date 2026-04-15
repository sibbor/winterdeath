import * as THREE from 'three';
import type React from 'react';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { System } from './System';
import { PlayerAnimator } from '../entities/player/PlayerAnimator';
import { PlayerStatID, PlayerStatusFlags } from '../entities/player/PlayerTypes';
import { WinterEngine } from '../core/engine/WinterEngine';
import { _buoyancyResult } from './WaterSystem';
import { DamageID } from '../entities/player/CombatTypes';
import { FamilyMemberID } from '../content/constants';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3(); // Target Position / Offset
const _v3 = new THREE.Vector3(); // Direction
const _vAim = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);

// Single reusable animation state — avoids per-frame object allocation
const _animState = {
    isMoving: false,
    isRushing: false,
    isDodging: false,
    dodgeStartTime: 0,
    staminaRatio: 1.0,
    isSpeaking: false,
    isThinking: false,
    isIdleLong: false,
    isWading: false,
    isSwimming: false,
    isDead: false,
    deathStartTime: 0,
    seed: 0,
    renderTime: 0,
    simTime: 0
};

export class FamilySystem implements System {
    id = 'family_system';
    isFixedStep = true;
    private static readonly MAX_ENTITIES = 4;

    private playerGroup: THREE.Group;
    private activeFamilyMembers: React.MutableRefObject<any[]>;
    private isCinematicRef: React.MutableRefObject<{ active: boolean }>;
    private callbacks: {
        setFoundMember: (id: FamilyMemberID) => void;
        startCinematic: (mesh: THREE.Group) => void;
    };

    constructor(
        playerGroup: THREE.Group,
        activeFamilyMembers: React.MutableRefObject<any[]>,
        isCinematicRef: React.MutableRefObject<{ active: boolean }>,
        callbacks: {
            setFoundMember: (id: FamilyMemberID) => void;
            startCinematic: (mesh: THREE.Group) => void;
        }
    ) {
        this.playerGroup = playerGroup;
        this.activeFamilyMembers = activeFamilyMembers;
        this.isCinematicRef = isCinematicRef;
        this.callbacks = callbacks;
    }

    update(_session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        const members = this.activeFamilyMembers.current;
        const isCinematicActive = this.isCinematicRef.current.active;
        const state = _session.state;
        const isDead = (state.statusFlags & PlayerStatusFlags.DEAD) !== 0;

        // --- Mirror player speed for the follow movement ---
        const baseSpeed = state.statsBuffer[PlayerStatID.FINAL_SPEED];
        const playerCurrentSpeed = baseSpeed * state.currentSpeedRatio;

        // Family follows at exactly the player's current speed
        let followSpeed = playerCurrentSpeed;

        const maxFollowSpeed = followSpeed * 1.5;

        const activeVehicle = state.vehicle.active ? state.vehicle.mesh : null;
        const inVehicle = !!activeVehicle;

        for (let i = 0; i < members.length; i++) {
            const familyMember = members[i];
            if (!familyMember.mesh) continue;

            const fm = familyMember.mesh;
            const userData = fm.userData;

            if (!fm.visible) fm.visible = true;

            // --- 0. VEHICLE RIDING LOGIC ---
            if (inVehicle) {
                if (!familyMember.following) continue;

                const def = activeVehicle.userData.vehicleDef;
                const suspY = state.vehicle.suspY || 0;

                if (familyMember.ring && familyMember.ring.visible) {
                    familyMember.ring.visible = false;
                }

                let pX = 0, pY = 0, pZ = 0;
                const dX = def?.seatOffset?.x || -0.4;
                const dY = def?.seatOffset?.y || 0.6;
                const dZ = def?.seatOffset?.z || 0.0;

                if (i === 0) { pX = -dX; pY = dY; pZ = dZ; }
                else if (i === 1) { pX = dX; pY = dY; pZ = dZ - 1.2; }
                else if (i === 2) { pX = 0; pY = dY; pZ = dZ - 1.2; }
                else if (i === 3) { pX = -dX; pY = dY; pZ = dZ - 1.2; }
                else if (i === 4) { pX = dX * 0.8; pY = dY + 0.1; pZ = dZ - 2.2; }
                else if (i === 5) { pX = -dX * 0.8; pY = dY + 0.1; pZ = dZ - 2.2; }
                else { pX = 0; pY = dY + 0.1; pZ = dZ - 2.2; }

                _v1.set(pX, pY + suspY, pZ);
                _v1.applyQuaternion(activeVehicle.quaternion);

                fm.position.copy(activeVehicle.position).add(_v1);
                fm.quaternion.copy(activeVehicle.quaternion);

                let body = userData.cachedBody;
                if (!body) {
                    body = fm.children.find((c: any) => c.userData.isBody);
                    if (body) userData.cachedBody = body;
                }
                if (body) {
                    _animState.seed = familyMember.seed;
                    _animState.isMoving = false;
                    _animState.isRushing = false;
                    _animState.isDodging = false;
                    _animState.isSwimming = false;
                    _animState.isWading = false;
                    _animState.isIdleLong = false;
                    _animState.renderTime = renderTime;
                    _animState.simTime = simTime;
                    PlayerAnimator.update(body, _animState, renderTime);
                }

                familyMember.wasInVehicle = true;
                continue;
            }

            // --- 0.5 VEHICLE EXIT LOGIC ---
            if (familyMember.wasInVehicle) {
                familyMember.wasInVehicle = false;
                const spreadX = (i % 2 === 0 ? 1 : -1) * (1.5 + (i * 0.4));
                const spreadZ = (Math.random() - 0.5) * 2.0;

                fm.position.copy(this.playerGroup.position);
                fm.position.x += spreadX;
                fm.position.z += spreadZ;
                fm.rotation.set(0, 0, 0);
                familyMember.lastMoveTime = simTime;
            }

            // --- 1. Ring Pulse Visual (Render Time) ---
            const ring = familyMember.ring;
            if (ring) {
                const isFollowing = familyMember.following;
                ring.visible = !(isFollowing || isDead);

                if (ring.visible) {
                    const pulse = 1.0 + Math.sin(renderTime * 0.003) * 0.1;
                    ring.scale.set(pulse, pulse, pulse);
                    ring.updateMatrix();
                }
            }

            // --- 2. Following Logic (Simulation Time) ---
            let fmIsMoving = false;
            let fmIsRushing = false;

            if (familyMember.following && !isCinematicActive && !isDead) {
                const row = Math.floor(i / 2) + 1;

                const backDist = 2.0 + row * 1.2;
                const sideSign = i % 2 === 0 ? -1 : 1;
                const sideDist = 1.5 + (i % 2) * 0.5;

                let localX = sideSign * sideDist;
                let localZ = -backDist;

                // --- VINTERDÖD: AIM-AVOIDANCE LOGIC ---
                const engine = WinterEngine.getInstance();
                const input = engine?.input?.state;
                if (input?.aimVector && input.aimVector.lengthSq() > 0.1) {
                    const camAngle = (engine as any).session?.cameraAngle || 0;
                    _vAim.set(input.aimVector.x, 0, input.aimVector.y).normalize();
                    if (camAngle !== 0) _vAim.applyAxisAngle(_UP, camAngle);

                    // Compute relative aim direction normalized to player rotation
                    const pRot = this.playerGroup.rotation.y;
                    const cosP = Math.cos(-pRot);
                    const sinP = Math.sin(-pRot);
                    const relAimX = _vAim.x * cosP + _vAim.z * sinP;
                    const relAimZ = -_vAim.x * sinP + _vAim.z * cosP;

                    // If player is aiming backwards or towards the follower slot
                    const dotAim = (relAimX * (localX / sideDist)) + (relAimZ * (localZ / backDist));
                    
                    if (dotAim > 0.5) { // If they are in the crosshair cone
                        // Push laterally away from the aim ray
                        const repulsionForce = (dotAim - 0.5) * 2.0; 
                        localX += sideSign * repulsionForce * 2.5;
                        localZ -= repulsionForce * 1.5; // Also push slightly further back
                    }
                }

                const pRot = this.playerGroup.rotation.y;
                const cos = Math.cos(pRot);
                const sin = Math.sin(pRot);

                _v1.copy(this.playerGroup.position);
                _v1.x += localX * cos + localZ * sin;
                _v1.z += -localX * sin + localZ * cos;

                const distSq = fm.position.distanceToSquared(_v1);

                const dist = Math.sqrt(distSq);

                if (dist > 0.15) { // VINTERDÖD FIX: Tightened epsilon for near-instant reaction
                    fmIsMoving = true;

                    // --- ELASTIC CATCH-UP BOOST ---
                    // 1.0x at formation spot, scaling up to 2.5x if separated.
                    // This ensures they can close the gap even while the player is rushing.
                    const elasticBoost = 1.0 + Math.min(1.5, dist / 4.0);
                    const actualSpeed = Math.min(followSpeed * 3.0, followSpeed * elasticBoost);

                    const step = actualSpeed * delta;

                    _v3.subVectors(_v1, fm.position).normalize();

                    // Precision move (Remove the 1.9m buffer)
                    const moveDist = Math.min(step, dist);

                    fm.position.addScaledVector(_v3, moveDist);
                    fm.lookAt(this.playerGroup.position);

                    familyMember.lastMoveTime = simTime;
                    fmIsRushing = state.isRushing || state.isDodging || dist > 3.0;
                }
            }

            if (!isCinematicActive && !inVehicle && !isDead && familyMember.spawnPos) {
                const distSq = fm.position.distanceToSquared(familyMember.spawnPos);
                if (distSq > 1.0) {
                    fmIsMoving = true;
                    const dist = Math.sqrt(distSq);
                    const step = followSpeed * 0.8 * delta;

                    _v3.subVectors(familyMember.spawnPos, fm.position).normalize();
                    const moveDist = Math.min(step, dist);

                    fm.position.addScaledVector(_v3, moveDist);
                    fm.lookAt(familyMember.spawnPos);
                    familyMember.lastMoveTime = simTime;
                }
            }

            // --- 3. Animation (Synchronized Logic + Smooth Visuals) ---
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
                const lastMove = familyMember.lastMoveTime ?? 0;
                const isIdleLong = simTime - lastMove > 10000;

                _animState.seed = familyMember.seed;
                _animState.isMoving = fmIsMoving;
                _animState.isRushing = fmIsRushing;
                _animState.isDodging = false;
                _animState.staminaRatio = state.statsBuffer[PlayerStatID.STAMINA] / Math.max(1, state.statsBuffer[PlayerStatID.MAX_STAMINA]);

                _animState.isIdleLong = isIdleLong;

                // VINTERDÖD FIX: Simulation clock bound state flags
                _animState.isSpeaking = simTime < (familyMember.speakingUntil || 0);
                _animState.isThinking = simTime < (familyMember.thinkingUntil || 0);

                const engine = WinterEngine.getInstance();
                if (engine?.water) {
                    engine.water.checkBuoyancy(fm.position.x, fm.position.y, fm.position.z, renderTime);
                    _animState.isSwimming = _buoyancyResult.depth > 1.2;
                    _animState.isWading = _buoyancyResult.depth > 0.4 && !_animState.isSwimming;

                    if (_buoyancyResult.inWater) {
                        const swimY = _buoyancyResult.waterLevel - 0.35;
                        const targetY = _animState.isSwimming ? swimY : _buoyancyResult.groundY;
                        fm.position.y = THREE.MathUtils.lerp(fm.position.y, targetY, 4 * delta);

                        if (_animState.isSwimming || _animState.isWading) {
                            const rx = familyMember.lastRippleX ?? fm.position.x + 99;
                            const rz = familyMember.lastRippleZ ?? fm.position.z + 99;
                            const dx = fm.position.x - rx;
                            const dz = fm.position.z - rz;

                            if (dx * dx + dz * dz > 0.5) {
                                engine.water.spawnRipple(fm.position.x, fm.position.z, state.simTime, _animState.isSwimming ? 0.8 : 0.5);
                                familyMember.lastRippleX = fm.position.x;
                                familyMember.lastRippleZ = fm.position.z;
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

                _animState.renderTime = renderTime;
                _animState.simTime = simTime;
                PlayerAnimator.update(body, _animState, renderTime);
            }
        }
    }
}