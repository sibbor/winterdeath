import * as THREE from 'three';
import { PLAYER_CHARACTER } from '../../content/constants';
import { MATERIALS } from '../../utils/assets';
import { soundManager } from '../../utils/sound';
import { HudSystem } from './HudSystem';
import { PlayerAnimation } from '../animation/PlayerAnimation';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _zeroV = new THREE.Vector3(0, 0, 0);

// [VINTERDÖD] Återanvändbara states för att undvika objekt-literaler i loopen
const _deathAnimState = {
    isMoving: false, isRushing: false, isRolling: false, rollStartTime: 0,
    staminaRatio: 0, isSpeaking: false, isThinking: false, isIdleLong: false,
    seed: 0, isDead: true, deathStartTime: 0
};

const _griefAnimState = {
    isMoving: false, isRushing: false, isRolling: false, rollStartTime: 0,
    staminaRatio: 1.0, isSpeaking: false, isThinking: true, isIdleLong: false,
    seed: 0
};

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

            // [VINTERDÖD] Undvik spread-operator ({...data}) då det skapar ett nytt objekt.
            // Vi skickar datan direkt från HudSystem.
            const pos = refs.playerGroup ? refs.playerGroup.position : _zeroV;
            const hudData = HudSystem.getHudData(state, pos, refs.fmMesh, refs.input, now, props, distanceTraveled, refs.camera) as any;

            hudData.hp = 0;
            hudData.isDead = true;
            props.onUpdateHUD(hudData);

        } else if (refs.deathPhase.current === 'ANIMATION') {
            if (now - state.deathStartTime > 800) {
                refs.deathPhase.current = 'MESSAGE';
                setDeathPhase('MESSAGE');
            }
        } else if (refs.deathPhase.current === 'MESSAGE') {
            if (now - state.deathStartTime > 1500) {
                refs.deathPhase.current = 'CONTINUE';
                setDeathPhase('CONTINUE');
            }
        }

        // 2. Physics & Falling Movement
        if (refs.playerGroup && state.deathVel) {
            const pgPos = refs.playerGroup.position;

            // Apply Gravity
            state.deathVel.y -= 30 * delta;
            pgPos.addScaledVector(state.deathVel, delta);

            // Ground Collision (Y=0)
            if (pgPos.y <= 0.0) {
                pgPos.y = 0.0;
                state.deathVel.y = 0;
                state.deathVel.x *= 0.9;
                state.deathVel.z *= 0.9;

                // [VINTERDÖD] Använd .copy() istället för .clone() för trail position
                if (!state.lastTrailPos) {
                    // Vi antar att lastTrailPos är initierad som en Vector3 i RuntimeState
                    state.lastTrailPos = pgPos.clone(); // Endast första gången
                }

                // Check distance squared (1.5m squared)
                if (pgPos.distanceToSquared(state.lastTrailPos) > 2.25) {
                    const baseScale = refs.playerMesh?.userData.baseScale || 1.0;
                    callbacks.spawnDecal(
                        pgPos.x,
                        pgPos.z,
                        (0.8 + Math.random() * 0.4) * baseScale,
                        MATERIALS.bloodDecal
                    );
                    state.lastTrailPos.copy(pgPos);
                }
            }

            // Orientation
            const speedSq = state.deathVel.x * state.deathVel.x + state.deathVel.z * state.deathVel.z;
            if (speedSq > 0.1) {
                _v2.set(state.deathVel.x, 0, state.deathVel.z);
                _v1.copy(pgPos).sub(_v2);
                refs.playerGroup.lookAt(_v1);
            } else if (!state.playerBloodSpawned && now - state.deathStartTime > 350) {
                state.playerBloodSpawned = true;
                const baseScale = refs.playerMesh?.userData.baseScale || 1.0;
                callbacks.spawnDecal(pgPos.x, pgPos.z, 2.5 * baseScale, MATERIALS.bloodDecal);
                callbacks.spawnPart(pgPos.x, 0.5, pgPos.z, 'blood', 20);
            }
        }

        // 3. Player Animation Update
        if (refs.playerMesh) {
            // [VINTERDÖD] Använd förallokerad state-scratchpad
            _deathAnimState.deathStartTime = state.deathStartTime;
            PlayerAnimation.update(refs.playerMesh, _deathAnimState, now, 0.016);
        }

        // 4. Family Reaction (Optimized Loop)
        if (refs.familyMembers) {
            const fmList = refs.familyMembers;
            const fmCount = fmList.length;
            const playerPos = refs.playerGroup ? refs.playerGroup.position : _zeroV;

            for (let i = 0; i < fmCount; i++) {
                const fm = fmList[i];
                if (!fm.mesh) continue;

                fm.following = false;
                fm.isMoving = false;

                // Look at fallen player
                fm.mesh.lookAt(playerPos);

                // Find body mesh via platt loop istället för traverse
                const children = fm.mesh.children;
                const childCount = children.length;
                let body: THREE.Mesh | null = null;
                for (let j = 0; j < childCount; j++) {
                    if (children[j].userData.isBody) {
                        body = children[j] as THREE.Mesh;
                        break;
                    }
                }

                if (body) {
                    // [VINTERDÖD] Använd förallokerad grief-state
                    _griefAnimState.seed = fm.seed || 0;
                    PlayerAnimation.update(body, _griefAnimState, now, delta);
                }
            }
        }
    }
};