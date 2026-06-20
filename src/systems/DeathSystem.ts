import type React from 'react';
import * as THREE from 'three';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { System, SystemID } from './System';
import { PlayerDeathState, DamageID } from '../entities/player/CombatTypes';
import { PLAYER } from '../content/constants';
import { MATERIALS } from '../utils/assets';
import { VoiceSounds } from '../utils/audio/AudioLib';
import { audioEngine } from '../utils/audio/AudioEngine';
import { HudSystem } from './HudSystem';
import { PlayerAnimator } from '../entities/player/PlayerAnimator';
import { HudStore } from '../store/HudStore';
import { EnemyManager } from '../entities/enemies/EnemyManager';
import { FXParticleType, FXDecalType } from '../types/FXTypes';
import { PlayerStatusFlags, StatID } from '../types/CareerStats';
import { DeathPhase } from '../types/SessionTypes';

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
    readonly systemId = SystemID.DEATH;
    id = 'death_system';
    enabled = true;
    persistent = false;
    isFixedStep = true;

    private playerGroupRef: React.MutableRefObject<THREE.Group>;
    private playerMeshRef: React.MutableRefObject<THREE.Group>;
    private fmMeshRef: React.MutableRefObject<any>;
    private activeFamilyMembers: React.MutableRefObject<any[]>;
    private deathPhaseRef: React.MutableRefObject<DeathPhase>;
    private inputRef: () => any;
    private cameraRef: () => THREE.Camera;
    private propsRef: React.MutableRefObject<any>;
    private distanceTraveledRef: React.MutableRefObject<number>;
    private fxCallbacks: {
        spawnParticle: (x: number, y: number, z: number, type: FXParticleType, count: number, customMesh?: any, customVel?: any, color?: number, scale?: number, life?: number) => void;
        spawnDecal: (x: number, z: number, scale: number, material?: any, type?: FXDecalType) => void;
    };
    private setDeathPhase: (phase: any) => void;

    constructor(opts: {
        playerGroupRef: React.MutableRefObject<THREE.Group>;
        playerMeshRef: React.MutableRefObject<THREE.Group>;
        fmMeshRef: React.MutableRefObject<any>;
        activeFamilyMembers: React.MutableRefObject<any[]>;
        deathPhaseRef: React.MutableRefObject<DeathPhase>;
        inputRef: () => any;
        cameraRef: () => THREE.Camera;
        propsRef: React.MutableRefObject<any>;
        distanceTraveledRef: React.MutableRefObject<number>;
        fxCallbacks: {
            spawnParticle: (x: number, y: number, z: number, type: FXParticleType, count: number, customMesh?: any, customVel?: any, color?: number, scale?: number, life?: number) => void;
            spawnDecal: (x: number, z: number, scale: number, material?: any, type?: FXDecalType) => void;
        };
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
        if (!(state.combat.statusFlags & PlayerStatusFlags.DEAD)) return;

        const playerGroup = this.playerGroupRef.current;
        const playerMesh = this.playerMeshRef.current;
        const fmMesh = this.fmMeshRef.current?.mesh || null;
        const input = this.inputRef();
        const camera = this.cameraRef();
        const props = this.propsRef.current;

        // Extract position once to save performance and clean up code
        const pgPos = playerGroup ? playerGroup.position : _zeroV;

        const isExploded = state.player.deathState === PlayerDeathState.GIBBED;
        const isBurning = state.player.deathState === PlayerDeathState.BURNED;
        const isDrowning = state.player.deathState === PlayerDeathState.DROWNED;
        const isElectrocuted = state.player.deathState === PlayerDeathState.ELECTROCUTED;
        const isBiting = state.player.killerSource === DamageID.BITE;

        // --- 1. Phase Management ---
        switch (this.deathPhaseRef.current) {
            case DeathPhase.NONE:
                this.deathPhaseRef.current = DeathPhase.ANIMATION;
                this.setDeathPhase(DeathPhase.ANIMATION);
                audioEngine.stopAll();
                VoiceSounds.playDeathScream();

                // Fetch HUD data once for death state to avoid GC hits
                // HUD data now respects the statsBuffer and statusFlags automatically.
                const hudData = HudSystem.getHudData(state, pgPos, fmMesh, input, renderTime, props, this.distanceTraveledRef.current, camera, playerGroup ? playerGroup.rotation.y : 0) as any;
                HudStore.update(hudData);
                break;

            case DeathPhase.ANIMATION:
                if (simTime - state.player.deathStartTime > PLAYER.DEATH_TIMER) {
                    this.deathPhaseRef.current = DeathPhase.MESSAGE;
                    this.setDeathPhase(DeathPhase.MESSAGE);
                }
                break;

            case DeathPhase.MESSAGE:
                if (simTime - state.player.deathStartTime > 3000) {
                    this.deathPhaseRef.current = DeathPhase.CONTINUE;
                    this.setDeathPhase(DeathPhase.CONTINUE);
                }
                break;
        }

        // --- 2. Physics & Falling ---
        if (playerGroup) {
            state.player.deathVel.y -= 30 * delta;
            pgPos.addScaledVector(state.player.deathVel, delta);

            if (pgPos.y <= 0.0) {
                pgPos.y = 0.0;
                state.player.deathVel.y = 0;
                state.player.deathVel.x *= 0.9;
                state.player.deathVel.z *= 0.9;

                if (!state.player.hasLastTrailPos) {
                    state.player.lastTrailPos.copy(pgPos);
                    state.player.hasLastTrailPos = true;
                }

                if (!isExploded && pgPos.distanceToSquared(state.player.lastTrailPos) > 2.25) {
                    const baseScale = (playerMesh as any)?.userData?.baseScale || 1.0;
                    this.fxCallbacks.spawnDecal(pgPos.x, pgPos.z, (0.8 + Math.random() * 0.4) * baseScale, MATERIALS.bloodDecal);
                    state.player.lastTrailPos.copy(pgPos);
                }
            }

            const speedSq = state.player.deathVel.x * state.player.deathVel.x + state.player.deathVel.z * state.player.deathVel.z;
            if (speedSq > 0.1) {
                _v2.set(state.player.deathVel.x, 0, state.player.deathVel.z);
                _v1.copy(pgPos).sub(_v2);
                playerGroup.lookAt(_v1);
            } else if (!isExploded && !isBurning && !isDrowning && !isElectrocuted && !state.player.playerBloodSpawned && renderTime - state.player.deathStartTime > 350) {
                state.player.playerBloodSpawned = true;
                const baseScale = (playerMesh as any)?.userData?.baseScale || 1.0;
                this.fxCallbacks.spawnDecal(pgPos.x, pgPos.z, 2.5 * baseScale, MATERIALS.bloodDecal);
                this.fxCallbacks.spawnParticle(pgPos.x, 1.5, pgPos.z, FXParticleType.BLOOD_SPLATTER, 6);
            }

            // Specialized Death Visuals
            if (isBurning && renderTime % 500 < 50) {
                this.fxCallbacks.spawnParticle(pgPos.x, 0.5, pgPos.z, FXParticleType.SMOKE, 1);
                this.fxCallbacks.spawnParticle(pgPos.x, 0.5, pgPos.z, FXParticleType.SPARK, 1);
            }

            if (isElectrocuted && renderTime % 100 < 20) {
                this.fxCallbacks.spawnParticle(pgPos.x + (Math.random() - 0.5) * 0.5, pgPos.y + 0.5 + Math.random(), pgPos.z + (Math.random() - 0.5) * 0.5, FXParticleType.SPARK, 2);
            }

            if (isBiting && this.deathPhaseRef.current === DeathPhase.ANIMATION) {
                if (renderTime % 300 < 30) {
                    this.fxCallbacks.spawnParticle(pgPos.x, 1.5, pgPos.z, FXParticleType.BLOOD_SPLATTER, 6);
                }
            }

            // --- 2.5 Specialized Death Visuals (Zero-GC Refactor) ---
            switch (state.player.deathState) {
                case PlayerDeathState.DROWNED:
                    // Sinking logic
                    state.player.deathVel.y = -0.5; // Slow sink
                    state.player.deathVel.x *= 0.95;
                    state.player.deathVel.z *= 0.95;

                    if (this.deathPhaseRef.current === DeathPhase.ANIMATION) {
                        if (renderTime % 500 < 50) {
                            this.fxCallbacks.spawnParticle(pgPos.x, pgPos.y + 1.0, pgPos.z, FXParticleType.SPLASH, 2);
                        }
                    }
                    break;

                case PlayerDeathState.BURNED:
                    const age = renderTime - state.player.deathStartTime;
                    const duration = 1500;
                    const progress = Math.min(1.0, age / duration);

                    // Ash Pile Logic
                    if (!state.player.playerAshSpawned) {
                        state.player.playerAshSpawned = true;
                        const ashRenderer = EnemyManager.getAshRenderer();
                        if (ashRenderer) {
                            // [VINTERDÖD FIX] Use world position (pgPos) and group rotation for the ash pile
                            ashRenderer.addAsh(pgPos, playerGroup.rotation, 1.0, 1.0, 0x333333, renderTime, 1500);
                        }
                    }

                    if (renderTime % 100 < 16) {
                        this.fxCallbacks.spawnParticle(pgPos.x, pgPos.y + 1.8, pgPos.z, FXParticleType.ENEMY_EFFECT_FLAME, 1);
                    }

                    // Zero-GC iterative traversal for material updates
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
                    break;
            }
        }

        // --- 3. Player Animation & Gibbing ---
        // --- 3. Player Animation & Gibbing ---
        if (state.player.deathState === PlayerDeathState.GIBBED) {
            if (playerMesh) playerMesh.visible = false;

            if (!state.player.playerBloodSpawned) {
                state.player.playerBloodSpawned = true;
                const baseScale = (playerMesh as any).userData.baseScale || 1.0;

                this.fxCallbacks.spawnDecal(pgPos.x, pgPos.z, 4.5 * baseScale, MATERIALS.bloodDecal);
                this.fxCallbacks.spawnParticle(pgPos.x, 1.0, pgPos.z, FXParticleType.BLOOD_SPLATTER, 20);
                this.fxCallbacks.spawnParticle(
                    pgPos.x, 1.5, pgPos.z,
                    FXParticleType.GORE, 6,
                    undefined, undefined, // TODO: calculate scaling based on player mesh?
                    0x990000,          // Explicit blood red for the player loop
                    baseScale * 2.0    // Proportional to player's geometric mass
                );
            }
        } else if (playerMesh) {
            _deathAnimState.deathStartTime = state.player.deathStartTime;
            _deathAnimState.renderTime = state.renderTime;
            _deathAnimState.simTime = state.simTime;
            (_deathAnimState as any).isBurningDead = isBurning;
            (_deathAnimState as any).isElectrocuted = isElectrocuted;
            (_deathAnimState as any).isBiting = isBiting;
            PlayerAnimator.update(playerMesh as any, _deathAnimState, renderTime, delta);
        }

        // --- 4. Family Grief ---
        const fmList = this.activeFamilyMembers.current;
        for (let i = 0; i < fmList.length; i++) {
            const fm = fmList[i];
            if (!fm.mesh || (!fm.found && !fm.rescued)) continue;
            fm.following = false;

            // --- GATHER AROUND THE BODY (Zero-GC) ---
            const distSq = fm.mesh.position.distanceToSquared(pgPos);
            const stopDist = 1.8;
            const stopDistSq = stopDist * stopDist;
            let isWalking = false;

            if (distSq > stopDistSq && distSq > 0.001) { // Protect against NaN!
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

            // Cached body lookup (O(1) instead of O(N) array scan)
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
                _griefAnimState.staminaRatio = state.player.statsBuffer[StatID.STAMINA] / Math.max(1, state.player.statsBuffer[StatID.MAX_STAMINA]);
                PlayerAnimator.update(body, _griefAnimState, renderTime, delta);
            }
        }
    }
}

