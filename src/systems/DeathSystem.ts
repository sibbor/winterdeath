import type React from 'react';
import * as THREE from 'three';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { System } from './System';
import { PlayerDeathState, DamageType, DamageID } from '../entities/player/CombatTypes';
import { PLAYER_DEATH_TIMER } from '../content/constants';
import { MATERIALS } from '../utils/assets';
import { VoiceSounds } from '../utils/audio/AudioLib';
import { HudSystem } from './HudSystem';
import { PlayerAnimator } from '../entities/player/PlayerAnimator';
import { HudStore } from '../store/HudStore';
import { EnemyManager } from '../entities/enemies/EnemyManager';
import { PlayerStatusFlags, PlayerStatID } from '../entities/player/PlayerTypes';


// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _zeroV = new THREE.Vector3(0, 0, 0);
const _blackColor = new THREE.Color(0x000000); // Used for safe color lerping without GC

const _traverseStack: THREE.Object3D[] = []; // Shared stack to avoid closures during traversal

const _deathAnimState = {
    isMoving: false,
    isRushing: false,
    isDodging: false,
    dodgeStartTime: 0,
    staminaRatio: 0,
    isSpeaking: false,
    isThinking: false,
    isIdleLong: false,
    seed: 0,
    isDead: true,
    deathStartTime: 0,
    renderTime: 0,
    simTime: 0
};

const _griefAnimState = {
    isMoving: false,
    isRushing: false,
    isDodging: false,
    dodgeStartTime: 0,
    staminaRatio: 1.0,
    isSpeaking: false,
    isThinking: true,
    isIdleLong: false,
    seed: 0,
    renderTime: 0,
    simTime: 0
};

export class DeathSystem implements System {
    id = 'death_system';
    isFixedStep = true;

    private playerGroupRef: React.MutableRefObject<THREE.Group>;
    private playerMeshRef: React.MutableRefObject<THREE.Group>;
    private fmMeshRef: React.MutableRefObject<any>;
    private activeFamilyMembers: React.MutableRefObject<any[]>;
    private deathPhaseRef: React.MutableRefObject<string>;
    private inputRef: () => any;
    private cameraRef: () => THREE.Camera;
    private propsRef: React.MutableRefObject<any>;
    private distanceTraveledRef: React.MutableRefObject<number>;
    private fxCallbacks: any;
    private setDeathPhase: (phase: any) => void;

    constructor(opts: {
        playerGroupRef: React.MutableRefObject<THREE.Group>;
        playerMeshRef: React.MutableRefObject<THREE.Group>;
        fmMeshRef: React.MutableRefObject<any>;
        activeFamilyMembers: React.MutableRefObject<any[]>;
        deathPhaseRef: React.MutableRefObject<string>;
        inputRef: () => any;
        cameraRef: () => THREE.Camera;
        propsRef: React.MutableRefObject<any>;
        distanceTraveledRef: React.MutableRefObject<number>;
        fxCallbacks: any;
        setDeathPhase: (phase: any) => void;
    }) {
        this.playerGroupRef = opts.playerGroupRef;
        this.playerMeshRef = opts.playerMeshRef;
        this.fmMeshRef = opts.fmMeshRef;
        this.activeFamilyMembers = opts.activeFamilyMembers;
        this.deathPhaseRef = opts.deathPhaseRef;
        this.inputRef = opts.inputRef;
        this.cameraRef = opts.cameraRef;
        this.propsRef = opts.propsRef;
        this.distanceTraveledRef = opts.distanceTraveledRef;
        this.fxCallbacks = opts.fxCallbacks;
        this.setDeathPhase = opts.setDeathPhase;
    }

    update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        const state = session.state;
        if (!(state.statusFlags & PlayerStatusFlags.DEAD)) return;

        const playerGroup = this.playerGroupRef.current;
        const playerMesh = this.playerMeshRef.current;
        const fmMesh = this.fmMeshRef.current?.mesh || null;
        const input = this.inputRef();
        const camera = this.cameraRef();
        const props = this.propsRef.current;

        // Extract position once to save performance and clean up code
        const pgPos = playerGroup ? playerGroup.position : _zeroV;

        // --- 1. Phase Management ---
        if (this.deathPhaseRef.current === 'NONE') {
            this.deathPhaseRef.current = 'ANIMATION';
            this.setDeathPhase('ANIMATION');
            VoiceSounds.playDeathScream();

            // Fetch HUD data once for death state to avoid GC hits
            // HUD data now respects the statsBuffer and statusFlags automatically.
            const hudData = HudSystem.getHudData(state, pgPos, fmMesh, input, renderTime, props, this.distanceTraveledRef.current, camera) as any;
            HudStore.update(hudData);

        } else if (this.deathPhaseRef.current === 'ANIMATION') {
            if (simTime - state.deathStartTime > PLAYER_DEATH_TIMER) {
                this.deathPhaseRef.current = 'MESSAGE';
                this.setDeathPhase('MESSAGE');
            }
        } else if (this.deathPhaseRef.current === 'MESSAGE') {
            if (simTime - state.deathStartTime > 3000) {
                this.deathPhaseRef.current = 'CONTINUE';
                this.setDeathPhase('CONTINUE');
            }
        }

        // --- 2. Physics & Falling ---
        if (playerGroup) {
            state.deathVel.y -= 30 * delta;
            pgPos.addScaledVector(state.deathVel, delta);

            const isExploded = state.playerDeathState === PlayerDeathState.GIBBED;
            const isBurning = state.playerDeathState === PlayerDeathState.BURNED;
            const isDrowning = state.playerDeathState === PlayerDeathState.DROWNED;
            const isElectrocuted = state.playerDeathState === PlayerDeathState.ELECTROCUTED;
            const isBiting = state.killerType === DamageID.BITE;


            if (pgPos.y <= 0.0) {
                pgPos.y = 0.0;
                state.deathVel.y = 0;
                state.deathVel.x *= 0.9;
                state.deathVel.z *= 0.9;

                if (!state.hasLastTrailPos) {
                    state.lastTrailPos.copy(pgPos);
                    state.hasLastTrailPos = true;
                }

                if (!isExploded && pgPos.distanceToSquared(state.lastTrailPos) > 2.25) {
                    const baseScale = (playerMesh as any)?.userData?.baseScale || 1.0;
                    this.fxCallbacks.spawnDecal(pgPos.x, pgPos.z, (0.8 + Math.random() * 0.4) * baseScale, MATERIALS.bloodDecal);
                    state.lastTrailPos.copy(pgPos);
                }
            }

            const speedSq = state.deathVel.x * state.deathVel.x + state.deathVel.z * state.deathVel.z;
            if (speedSq > 0.1) {
                _v2.set(state.deathVel.x, 0, state.deathVel.z);
                _v1.copy(pgPos).sub(_v2);
                playerGroup.lookAt(_v1);
            } else if (!isExploded && !isBurning && !isDrowning && !isElectrocuted && !state.playerBloodSpawned && renderTime - state.deathStartTime > 350) {
                state.playerBloodSpawned = true;
                const baseScale = (playerMesh as any)?.userData?.baseScale || 1.0;
                this.fxCallbacks.spawnDecal(pgPos.x, pgPos.z, 2.5 * baseScale, MATERIALS.bloodDecal);
                this.fxCallbacks.spawnPart(pgPos.x, 1.5, pgPos.z, 'blood_splatter', 6);
            }

            // Specialized Death Visuals
            if (isBurning && renderTime % 500 < 50) {
                this.fxCallbacks.spawnPart(pgPos.x, 0.5, pgPos.z, 'smoke', 1);
                this.fxCallbacks.spawnPart(pgPos.x, 0.5, pgPos.z, 'spark', 1);
            }

            if (isBiting && this.deathPhaseRef.current === 'ANIMATION') {
                playerMesh.position.x = Math.sin(renderTime * 0.05) * 0.1;
                playerMesh.position.z = Math.cos(renderTime * 0.05) * 0.1;

                if (renderTime % 300 < 30) {
                    this.fxCallbacks.spawnPart(pgPos.x, 1.5, pgPos.z, 'blood_splatter', 6);
                }
            }

            // Enhanced DROWNED & BURNED Visuals
            if (state.playerDeathState === PlayerDeathState.DROWNED) {
                // Sinking logic
                state.deathVel.y = -0.5; // Slow sink
                state.deathVel.x *= 0.95;
                state.deathVel.z *= 0.95;

                if (this.deathPhaseRef.current === 'ANIMATION') {
                    if (renderTime % 500 < 50) {
                        this.fxCallbacks.spawnPart(pgPos.x, pgPos.y + 1.0, pgPos.z, 'splash', 2);
                    }
                }
            } else if (state.playerDeathState === PlayerDeathState.BURNED) {
                const age = renderTime - state.deathStartTime;
                const duration = 1500;
                const progress = Math.min(1.0, age / duration);

                // Ash Pile Logic
                if (!state.playerAshSpawned) {
                    state.playerAshSpawned = true;
                    const ashRenderer = EnemyManager.getAshRenderer();
                    if (ashRenderer) {
                        // [VINTERDÖD FIX] Use world position (pgPos) and group rotation for the ash pile
                        ashRenderer.addAsh(pgPos, playerGroup.rotation, 1.0, 1.0, 0x333333, renderTime, 1500);
                    }
                }

                if (renderTime % 100 < 16) {
                    this.fxCallbacks.spawnPart(pgPos.x, pgPos.y + 1.8, pgPos.z, 'enemy_effect_flame', 1);
                }

                // Shrink and Char
                const shrink = 1.0 - progress;
                playerMesh.scale.setScalar(shrink);

                // VINTERDÖD FIX: Zero-GC iterative traversal for material updates
                _traverseStack.length = 0;
                _traverseStack.push(playerMesh);

                while (_traverseStack.length > 0) {
                    const child = _traverseStack.pop() as any;

                    if (child.isMesh && child.material && child.material.color) {
                        child.material.color.lerp(_blackColor, progress * 0.1);
                    }

                    if (child.children) {
                        for (let i = 0; i < child.children.length; i++) {
                            _traverseStack.push(child.children[i]);
                        }
                    }
                }

                if (progress >= 1.0) {
                    playerMesh.visible = false;
                }
            }
        }

        // --- 3. Player Animation & Gibbing ---
        if (state.playerDeathState === PlayerDeathState.GIBBED) {
            if (playerMesh) playerMesh.visible = false;

            if (!state.playerBloodSpawned) {
                state.playerBloodSpawned = true;
                const baseScale = (playerMesh as any).userData.baseScale;

                this.fxCallbacks.spawnDecal(pgPos.x, pgPos.z, 4.5 * baseScale, MATERIALS.bloodDecal);
                this.fxCallbacks.spawnPart(pgPos.x, 1.0, pgPos.z, 'blood_splatter', 20);
                this.fxCallbacks.spawnPart(pgPos.x, 1.5, pgPos.z, 'meat', 12);
            }
        } else if (playerMesh) {
            _deathAnimState.deathStartTime = state.deathStartTime;
            _deathAnimState.renderTime = state.renderTime;
            _deathAnimState.simTime = state.simTime;
            PlayerAnimator.update(playerMesh as any, _deathAnimState, renderTime);
        }

        // --- 4. Family Grief ---
        const fmList = this.activeFamilyMembers.current;
        for (let i = 0; i < fmList.length; i++) {
            const fm = fmList[i];
            if (!fm.mesh) continue;
            fm.following = false;

            // --- GATHER AROUND THE BODY (Zero-GC) ---
            const distSq = fm.mesh.position.distanceToSquared(pgPos);
            const stopDist = 1.8;
            const stopDistSq = stopDist * stopDist;
            let isWalking = false;

            if (distSq > stopDistSq && distSq > 0.001) { // VINTERDÖD FIX: Protect against NaN!
                // Move towards player
                _v1.subVectors(pgPos, fm.mesh.position).normalize();
                fm.mesh.position.addScaledVector(_v1, 3.5 * delta); // Moderate walking speed
                isWalking = true;
            }

            fm.isMoving = isWalking;
            fm.mesh.lookAt(pgPos);

            // --- UNIQUE CRYING SOUNDS ---
            const lastCry = (fm as any)._lastCryTime;
            const cryDelay = (fm as any)._cryDelay;

            if (renderTime - lastCry > cryDelay) {
                (fm as any)._lastCryTime = renderTime;
                (fm as any)._cryDelay = 4000 + Math.random() * 6000;
                VoiceSounds.playCrying(fm.mesh.position);
            }

            // VINTERDÖD FIX: Cached body lookup (O(1) instead of O(N) array scan)
            let body = fm.mesh.userData.cachedBody;

            if (!body) {
                const children = fm.mesh.children;
                for (let j = 0; j < children.length; j++) {
                    if (children[j].userData.isBody) {
                        body = children[j] as THREE.Mesh;
                        fm.mesh.userData.cachedBody = body;
                        break;
                    }
                }
            }

            if (body) {
                _griefAnimState.seed = fm.seed || 0;
                _griefAnimState.isMoving = isWalking;
                _griefAnimState.renderTime = state.renderTime;
                _griefAnimState.simTime = state.simTime;
                _griefAnimState.staminaRatio = state.statsBuffer[PlayerStatID.STAMINA] / Math.max(1, state.statsBuffer[PlayerStatID.MAX_STAMINA]);
                PlayerAnimator.update(body, _griefAnimState, renderTime);
            }
        }
    }
}