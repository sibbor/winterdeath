import type React from 'react';
import * as THREE from 'three';
import { GameSessionLogic } from '../GameSessionLogic';
import { System } from './System';
import { PLAYER_CHARACTER } from '../../content/constants';
import { MATERIALS } from '../../utils/assets';
import { soundManager } from '../../utils/sound';
import { HudSystem } from './HudSystem';
import { PlayerAnimation } from '../animation/PlayerAnimation';
import { FXSystem } from './FXSystem';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _zeroV = new THREE.Vector3(0, 0, 0);

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

export class DeathSystem implements System {
    id = 'death';

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

    update(session: GameSessionLogic, delta: number, now: number) {
        const state = session.state;
        if (!state.isDead) return; // Skip immediately when alive — ~0 cost

        const playerGroup = this.playerGroupRef.current;
        const playerMesh = this.playerMeshRef.current;
        const fmMesh = this.fmMeshRef.current?.mesh || null;
        const input = this.inputRef();
        const camera = this.cameraRef();
        const props = this.propsRef.current;

        // Extrahera positionen en gång för att spara prestanda och göra koden renare
        const pgPos = playerGroup ? playerGroup.position : _zeroV;

        // --- 1. Phase Management ---
        if (this.deathPhaseRef.current === 'NONE') {
            this.deathPhaseRef.current = 'ANIMATION';
            this.setDeathPhase('ANIMATION');
            soundManager.playPlayerDeath(PLAYER_CHARACTER.name);

            const hudData = HudSystem.getHudData(state, pgPos, fmMesh, input, now, props, this.distanceTraveledRef.current, camera) as any;
            hudData.hp = 0;
            hudData.isDead = true;
            props.onUpdateHUD(hudData);

        } else if (this.deathPhaseRef.current === 'ANIMATION') {
            if (now - state.deathStartTime > 800) {
                this.deathPhaseRef.current = 'MESSAGE';
                this.setDeathPhase('MESSAGE');
            }
        } else if (this.deathPhaseRef.current === 'MESSAGE') {
            if (now - state.deathStartTime > 1500) {
                this.deathPhaseRef.current = 'CONTINUE';
                this.setDeathPhase('CONTINUE');
            }
        }

        // --- 2. Physics & Falling ---
        if (playerGroup && state.deathVel) {
            state.deathVel.y -= 30 * delta;
            pgPos.addScaledVector(state.deathVel, delta);

            const isExploded = state.killerType === 'BOMBER_EXPLOSION';
            const isBurning = state.killerType === 'BURNED' || state.killerType === 'FLAME';
            const isBiting = state.killerType === 'BITING';

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
            } else if (!isExploded && !state.playerBloodSpawned && now - state.deathStartTime > 350) {
                state.playerBloodSpawned = true;
                const baseScale = (playerMesh as any)?.userData?.baseScale || 1.0;
                this.fxCallbacks.spawnDecal(pgPos.x, pgPos.z, 2.5 * baseScale, MATERIALS.bloodDecal);
                this.fxCallbacks.spawnPart(pgPos.x, 0.5, pgPos.z, 'blood', 20);
            }

            // [VINTERDÖD] Specialized Death Visuals
            if (isBurning && now % 500 < 50) {
                this.fxCallbacks.spawnPart(pgPos.x, 0.5, pgPos.z, 'smoke', 1);
                this.fxCallbacks.spawnPart(pgPos.x, 0.5, pgPos.z, 'spark', 1);
            }

            if (isBiting && this.deathPhaseRef.current === 'ANIMATION') {
                // FIX: Sätt positionen absolut istället för med += för att undvika "drift"
                playerMesh.position.x = Math.sin(now * 0.05) * 0.1;
                playerMesh.position.z = Math.cos(now * 0.05) * 0.1;

                if (now % 300 < 30) {
                    this.fxCallbacks.spawnPart(pgPos.x, 0.8, pgPos.z, 'blood', 5);
                }
            }
        }

        // --- 3. Player Animation & Gibbing ---
        if (state.killerType === 'BOMBER_EXPLOSION') {
            if (playerMesh) playerMesh.visible = false;

            if (!state.playerBloodSpawned) {
                state.playerBloodSpawned = true;
                const baseScale = (playerMesh as any)?.userData?.baseScale || 1.0;

                // FIX: Återanvänd pgPos istället för ternära if-satser om och om igen
                this.fxCallbacks.spawnDecal(pgPos.x, pgPos.z, 4.5 * baseScale, MATERIALS.bloodDecal);
                this.fxCallbacks.spawnPart(pgPos.x, 1.0, pgPos.z, 'blood', 60);
                this.fxCallbacks.spawnPart(pgPos.x, 1.5, pgPos.z, 'meat', 12);
            }
        } else if (playerMesh) {
            _deathAnimState.deathStartTime = state.deathStartTime;
            // FIX: Använd det korrekta 'delta'-värdet, annars pajar animationen för högfrekvensskärmar!
            PlayerAnimation.update(playerMesh as any, _deathAnimState, now, delta);
        }

        // --- 4. Family Grief ---
        const fmList = this.activeFamilyMembers.current;
        for (let i = 0; i < fmList.length; i++) {
            const fm = fmList[i];
            if (!fm.mesh) continue;
            fm.following = false;
            fm.isMoving = false;
            fm.mesh.lookAt(pgPos);

            const children = fm.mesh.children;
            let body: THREE.Mesh | null = null;
            for (let j = 0; j < children.length; j++) {
                if (children[j].userData.isBody) { body = children[j] as THREE.Mesh; break; }
            }
            if (body) {
                _griefAnimState.seed = fm.seed || 0;
                PlayerAnimation.update(body, _griefAnimState, now, delta);
            }
        }

        // --- 5. FX still runs during death ---
        if (playerGroup) {
            FXSystem.update(session.engine.scene, state.particles, state.bloodDecals, delta, 0, now, pgPos, this.fxCallbacks);
        }
    }
}