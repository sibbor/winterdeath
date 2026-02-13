import * as THREE from 'three';
import { PLAYER_CHARACTER } from '../../content/constants';
import { MATERIALS } from '../../utils/assets';
import { soundManager } from '../../utils/sound';
import { HudSystem } from './HudSystem';
import { PlayerAnimation } from '../animation/PlayerAnimation';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3(); // Used for LookAt target
const _v2 = new THREE.Vector3(); // Used for temporary math
const _v3 = new THREE.Vector3(); // Used for distance checks
const _zeroV = new THREE.Vector3(0, 0, 0);

export const DeathSystem = {
    update: (
        state: any,
        refs: {
            deathPhase: { current: string };
            playerGroup: THREE.Group | null;
            playerMesh: THREE.Mesh | null;
            fmMesh: THREE.Object3D | null;
            familyMembers?: any[];
            input: any;
            camera: THREE.Camera;
        },
        setDeathPhase: (phase: any) => void,
        props: any,
        now: number,
        delta: number,
        distanceTraveled: number,
        callbacks: {
            spawnDecal: (x: number, z: number, scale: number, mat?: any) => void;
            spawnPart: (x: number, y: number, z: number, type: string, count: number, mesh?: any, vel?: any, color?: number) => void;
        }
    ) => {
        // 1. Phase Management & Initial Death Trigger
        if (refs.deathPhase.current === 'NONE') {
            refs.deathPhase.current = 'ANIMATION';
            setDeathPhase('ANIMATION');

            soundManager.playPlayerDeath(PLAYER_CHARACTER.name);

            // Force HUD Update (0 HP) - Using fallback vector if playerGroup is null
            const pos = refs.playerGroup ? refs.playerGroup.position : _zeroV;
            props.onUpdateHUD({
                ...HudSystem.getHudData(state, pos, refs.fmMesh, refs.input, now, props, distanceTraveled, refs.camera),
                hp: 0,
                isDead: true
            });

        } else if (refs.deathPhase.current === 'ANIMATION') {
            // Transition to Message after 800ms
            if (now - state.deathStartTime > 800) {
                refs.deathPhase.current = 'MESSAGE';
                setDeathPhase('MESSAGE');
            }
        } else if (refs.deathPhase.current === 'MESSAGE') {
            // Allow Continue after 1500ms
            if (now - state.deathStartTime > 1500) {
                refs.deathPhase.current = 'CONTINUE';
                setDeathPhase('CONTINUE');
            }
        }

        // 2. Physics & Falling Movement
        if (refs.playerGroup && state.deathVel) {
            // Apply Gravity (30 units/s^2)
            state.deathVel.y -= 30 * delta;

            // Move playerGroup using pre-calculated delta
            refs.playerGroup.position.addScaledVector(state.deathVel, delta);

            // Ground Collision (Y=0)
            if (refs.playerGroup.position.y <= 0.0) {
                refs.playerGroup.position.y = 0.0;
                state.deathVel.y = 0;
                state.deathVel.x *= 0.9; // Friction X
                state.deathVel.z *= 0.9; // Friction Z

                // Player Blood Trail (Optimized distance check)
                if (!state.lastTrailPos) {
                    state.lastTrailPos = refs.playerGroup.position.clone();
                }

                // Check distance squared (2.25 = 1.5m squared) to avoid Math.sqrt()
                if (refs.playerGroup.position.distanceToSquared(state.lastTrailPos) > 2.25) {
                    const baseScale = refs.playerMesh?.userData.baseScale || 1.0;
                    callbacks.spawnDecal(
                        refs.playerGroup.position.x,
                        refs.playerGroup.position.z,
                        (0.8 + Math.random() * 0.4) * baseScale,
                        MATERIALS.bloodDecal
                    );
                    state.lastTrailPos.copy(refs.playerGroup.position);
                }
            }

            // Orientation: Face the direction of the fall
            const speedSq = state.deathVel.x * state.deathVel.x + state.deathVel.z * state.deathVel.z;
            if (speedSq > 0.1) {
                // Zero-GC LookAt calculation
                _v2.set(state.deathVel.x, 0, state.deathVel.z);
                _v1.copy(refs.playerGroup.position).sub(_v2);
                refs.playerGroup.lookAt(_v1);
            } else if (!state.playerBloodSpawned && now - state.deathStartTime > 350) {
                // Execute final blood pool spawn when movement stops
                state.playerBloodSpawned = true;
                const baseScale = refs.playerMesh?.userData.baseScale || 1.0;
                callbacks.spawnDecal(refs.playerGroup.position.x, refs.playerGroup.position.z, 2.5 * baseScale, MATERIALS.bloodDecal);
                callbacks.spawnPart(refs.playerGroup.position.x, 0.5, refs.playerGroup.position.z, 'blood', 20);
            }
        }

        // 3. Player Animation Update
        if (refs.playerMesh) {
            PlayerAnimation.update(refs.playerMesh, {
                isMoving: false, isRushing: false, isRolling: false, rollStartTime: 0,
                staminaRatio: 0, isSpeaking: false, isThinking: false, isIdleLong: false,
                seed: 0, isDead: true, deathStartTime: state.deathStartTime
            }, now, 0.016); // Maintain fixed timestep for animation consistency
        }

        // 4. Family Reaction (Optimized Loop)
        if (refs.familyMembers) {
            for (let i = 0; i < refs.familyMembers.length; i++) {
                const fm = refs.familyMembers[i];
                if (!fm.mesh) continue;

                // Freeze movement and look at the fallen player
                fm.following = false;
                fm.isMoving = false;

                if (refs.playerGroup) {
                    fm.mesh.lookAt(refs.playerGroup.position);
                }

                // Find the body mesh for grief animation (Thinking state as proxy)
                // Use children array directly to minimize traversal
                const children = fm.mesh.children;
                let body: THREE.Mesh | null = null;
                for (let j = 0; j < children.length; j++) {
                    if (children[j].userData.isBody) {
                        body = children[j] as THREE.Mesh;
                        break;
                    }
                }

                if (body) {
                    PlayerAnimation.update(body, {
                        isMoving: false,
                        isRushing: false,
                        isRolling: false,
                        rollStartTime: 0,
                        staminaRatio: 1.0,
                        isSpeaking: false,
                        isThinking: true, // Used for Grief animation
                        isIdleLong: false,
                        seed: fm.seed || 0
                    }, now, delta);
                }
            }
        }
    }
};