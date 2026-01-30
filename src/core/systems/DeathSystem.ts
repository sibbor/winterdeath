
import * as THREE from 'three';
import { PLAYER_CHARACTER } from '../../content/constants';
import { MATERIALS } from '../../utils/assets';
import { soundManager } from '../../utils/sound';
import { HudSystem } from './HudSystem';
import { PlayerAnimation } from '../animation/PlayerAnimation';

export const DeathSystem = {
    update: (
        state: any,
        refs: {
            deathPhase: { current: string };
            playerGroup: THREE.Group | null;
            playerMesh: THREE.Mesh | null;
            fmMesh: THREE.Object3D | null;
            input: any;
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
        // 1. Phase Management
        if (refs.deathPhase.current === 'NONE') {
            refs.deathPhase.current = 'ANIMATION';
            setDeathPhase('ANIMATION');

            soundManager.playPlayerDeath(PLAYER_CHARACTER.name);

            // Force HUD Update (0 HP)
            props.onUpdateHUD({
                ...HudSystem.getHudData(state, refs.playerGroup?.position || new THREE.Vector3(), refs.fmMesh, refs.input, now, props, distanceTraveled),
                hp: 0,
                isDead: true
            });

        } else if (refs.deathPhase.current === 'ANIMATION') {
            if (now - state.deathStartTime > 1500) {
                refs.deathPhase.current = 'MESSAGE';
                setDeathPhase('MESSAGE');
            }
        } else if (refs.deathPhase.current === 'MESSAGE') {
            if (now - state.deathStartTime > 2500) {
                refs.deathPhase.current = 'CONTINUE';
                setDeathPhase('CONTINUE');
            }
        }

        // 2. Physics & Movement
        if (refs.playerGroup && state.deathVel) {
            // Gravity
            state.deathVel.y -= 30 * delta;

            // Move
            const moveDelta = state.deathVel.clone().multiplyScalar(delta);
            refs.playerGroup.position.add(moveDelta);

            // Ground Collision
            if (refs.playerGroup.position.y <= 0.0) {
                refs.playerGroup.position.y = 0.0;
                state.deathVel.y = 0;
                state.deathVel.x *= 0.9; // Friction
                state.deathVel.z *= 0.9;

                // Player Blood Trail
                if (!state.lastTrailPos) state.lastTrailPos = refs.playerGroup.position.clone();
                if (refs.playerGroup.position.distanceTo(state.lastTrailPos) > 1.5) {
                    const baseScale = refs.playerMesh?.userData.baseScale || 1.0;
                    callbacks.spawnDecal(refs.playerGroup.position.x, refs.playerGroup.position.z, (0.8 + Math.random() * 0.4) * baseScale, MATERIALS.bloodDecal);
                    state.lastTrailPos.copy(refs.playerGroup.position);
                }
            }

            // Orientation
            const speedSq = state.deathVel.x * state.deathVel.x + state.deathVel.z * state.deathVel.z;
            if (speedSq > 0.1) {
                refs.playerGroup.lookAt(refs.playerGroup.position.clone().sub(new THREE.Vector3(state.deathVel.x, 0, state.deathVel.z)));
            } else if (!state.playerBloodSpawned && now - state.deathStartTime > 350) {
                // Stop & Pool
                state.playerBloodSpawned = true;
                const baseScale = refs.playerMesh?.userData.baseScale || 1.0;
                callbacks.spawnDecal(refs.playerGroup.position.x, refs.playerGroup.position.z, 2.5 * baseScale, MATERIALS.bloodDecal);
                callbacks.spawnPart(refs.playerGroup.position.x, 0.5, refs.playerGroup.position.z, 'blood', 20, undefined, undefined, undefined);
            }
        }

        // 3. Animation
        if (refs.playerMesh) {
            PlayerAnimation.update(refs.playerMesh, {
                isMoving: false, isRushing: false, isRolling: false, rollStartTime: 0,
                staminaRatio: 0, isSpeaking: false, isThinking: false, isIdleLong: false,
                seed: 0, isDead: true, deathStartTime: state.deathStartTime
            }, now, 0.016); // Keeping fixed delta for consistent animation framerate
        }
    }
};
