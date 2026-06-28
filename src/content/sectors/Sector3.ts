import * as THREE from 'three';
import { SectorDef, SectorBuildContext, ChestType, SectorEvent, SectorEventState, SectorEventConstraint, BossID } from '../../game/session/SectorTypes';
import { GroundType } from '../../core/engine/EnvironmentalTypes';
import { SectorBuilder } from '../../core/world/SectorBuilder';
import { VegetationGenerator } from '../../core/world/generators/VegetationGenerator';
import { VEGETATION_TYPE } from '../../content/environment';
import { PoiType, PoiID } from '../../content/pois';
import { ClueID } from '../../content/clues';
import { SectorEventID } from '../../content/sector_events';
import { CollectibleID } from '../../content/collectibles';
import { CAMERA_HEIGHT } from '../constants';
import { EnemyType } from '../../entities/enemies/EnemyTypes';
import { TriggerType, TriggerActionType, TriggerStatus } from '../../types/TriggerTypes';
import { SoundID } from '../../utils/audio/AudioTypes';
import { audioEngine } from '../../utils/audio/AudioEngine';
import { PlayerAnimator } from '../../entities/player/PlayerAnimator';
import { InteractionType, InteractionShape } from '../../systems/ui/UIEventBridge';
import { VehicleID } from '../../entities/vehicles/VehicleTypes';
import { FamilyMemberID } from '../constants';
import { WeatherType } from '../../core/engine/EnvironmentalTypes';
import { UIEventRingBuffer, UIEventType } from '../../systems/ui/UIEventRingBuffer';
import { PathGenerator } from '../../core/world/generators/PathGenerator';
import { MATERIALS } from '../../utils/assets/materials';
import { ColliderType } from '../../core/world/CollisionResolution';
import { FXParticleType } from '../../types/FXTypes';

// ─── Zero-GC Scratchpads ──────────────────────────────────────────────────────
const _vS3a = new THREE.Vector3();
const _vS3b = new THREE.Vector3();
const _animState = {
    isMoving: false, isRushing: false, isDodging: false, dodgeStartTime: 0,
    staminaRatio: 1.0, isSpeaking: false, isThinking: false, isIdleLong: false, isCelebrating: false, isHugging: false,
    isSwimming: false, isWading: false, seed: 0, renderTime: 0, simTime: 0
};
const _familyMembers: THREE.Object3D[] = [];
const _camOnBuilding = new THREE.Vector3(-100, 14, -190);
const _camLookBuilding = new THREE.Vector3(-100, 1, -205);
const _carPos = new THREE.Vector3(); // Initialized in onSectorUpdate or constant

// ─── Epilogue state enum (stored as integer in sectorState.epilogueState) ─────
const EP = {
    IDLE: 0,
    RUSH_TO_NATHALIE: 1, // Family rushing toward building
    AWAIT_INSIDE: 2,   // Camera reset, player regains control
    BOSS_FIGHT: 3,   // Boss fight window
    // --- Post-boss ---
    FAMILY_EXIT: 4,   // Family walk out from building
    PLAYER_WALK: 5,   // Robert walks toward them
    RING_FORM: 6,   // Everyone walks into ring formation
    CELEBRATE: 7,   // Jump + cheer (3000 ms)
    HUG: 8,   // Hug animation
    CAR_ZOOM: 9,   // Camera pans to car (1500 ms)
    DRIVE: 10,  // Player enters car + driving (5000 ms)
    DONE: 11,
    AWAIT_CAR_ENTER: 12,
} as const;

const LOCATIONS = {
    SPAWN: {
        PLAYER: { x: 41, z: 77 },
        FAMILY: { x: -100, z: -200, y: 0 },
        BOSS: { x: -100, z: -200 }
    },
    CINEMATIC: {
        OFFSET: { x: 15, y: 12, z: 15 },
        LOOK_AT: { x: 0, y: 1.5, z: 0 }
    },
    COLLECTIBLES: {
        C1: { x: -25, z: -80 },     // Sand Area badge
        C2: { x: -80, z: -180 }     // Scrapyard area freely placed
    },
    TRIGGERS: {
        NOISE: { x: -30, z: -80 },
        SHED_SIGHT: { x: -100, z: -120 },
        FOUND_NATHALIE: { x: -100, z: -100 }, // at the Scrapyard gate
        DIALOGUE_1: { x: 20, z: 0 },        // Connection gravel road/asphalt road
        DIALOGUE_2: { x: -40, z: 0 }        // 50~60 m into asphalt road
    },
    POIS: {
        SHED: { x: -100, z: -200 }
    },
    // Escape car parked next to the dealership building
    ESCAPE_CAR: { x: -120, z: -200, rot: Math.PI / 2 },
    // Ring positions for the reunion (around a centre point)
    REUNION_CENTER: { x: -102, z: -198 }
} as const;

// Ring offsets for the 5 characters: Loke, Jordan, Esmeralda, Nathalie, Robert
const RING_OFFSETS: [number, number][] = [
    [2.2, 0],
    [-2.2, 0],
    [0, 2.2],
    [0, -2.2],
    [0, 0], // Robert (centre of group, slightly behind)
];

const KEYS = {
    epilogueState: 'state',
    epilogueTimer: 'timer',
    cheerSoundPlayed: 'b1',
    kissSoundPlayed: 'b2',
    epilogueBossDefeated: 'b3',
    epilogueDone: 'b4'
} as const;

const epilogueEvent: SectorEvent = {
    id: 'epilogue_event',
    onStart: (ctx, eventState) => {
        eventState[KEYS.epilogueState] = EP.IDLE;
        eventState[KEYS.epilogueTimer] = 0;
        eventState[KEYS.cheerSoundPlayed] = false;
        eventState[KEYS.kissSoundPlayed] = false;
        eventState[KEYS.epilogueBossDefeated] = false;
        eventState[KEYS.epilogueDone] = false;
    },
    onUpdate: (ctx, eventState) => {
        const { delta, simTime, renderTime, playerPos, gameState, engine } = ctx;
        const sectorState = gameState.sectorState;
        let mask = SectorEventConstraint.NONE;

        if (!eventState[KEYS.epilogueState]) eventState[KEYS.epilogueState] = EP.IDLE;
        const ep = eventState[KEYS.epilogueState];
        const elapsed = simTime - (eventState[KEYS.epilogueTimer] || 0);

        const scene = ctx.scene;

        // Helper: gather all family members from scene (Zero-GC)
        const updateFamilyMembers = () => {
            _familyMembers.length = 0;
            if (!scene) return;
            const ch = scene.children;
            for (let i = 0; i < ch.length; i++) {
                if (ch[i].userData.isFamilyMember || ch[i].userData.type === 'family') _familyMembers.push(ch[i]);
            }
        };

        _carPos.set(LOCATIONS.ESCAPE_CAR.x, 0, LOCATIONS.ESCAPE_CAR.z);

        // ── RUSH_TO_NATHALIE signal from dialogue's last line ──
        if (sectorState.pendingTrigger === 'RUSH_TO_NATHALIE') {
            sectorState.pendingTrigger = null;
            eventState[KEYS.epilogueState] = EP.RUSH_TO_NATHALIE;
            eventState[KEYS.epilogueTimer] = simTime;
        }

        // ── Boss-defeat signal absorbed here before GameSessionLoop fires endSector ──
        if (gameState.bossDefeatedTime > 0 && !eventState[KEYS.epilogueBossDefeated]) {
            eventState[KEYS.epilogueBossDefeated] = true;
            gameState.bossDefeatedTime = -1;
            eventState[KEYS.epilogueState] = EP.FAMILY_EXIT;
            eventState[KEYS.epilogueTimer] = simTime;
        }

        if (ep === EP.RUSH_TO_NATHALIE) {
            if (elapsed < 100 && ctx.setCameraOverride) {
                ctx.setCameraOverride({
                    active: true,
                    targetPos: _camOnBuilding,
                    lookAtPos: _camLookBuilding,
                    endTime: renderTime + 60000
                });
            }

            updateFamilyMembers();
            const family = _familyMembers;
            const buildingPos = _vS3a.set(
                LOCATIONS.POIS.SHED.x,
                0,
                LOCATIONS.POIS.SHED.z - 5
            );
            let allInside = true;
            for (let i = 0; i < family.length; i++) {
                const fm = family[i];
                if (!fm.position) continue;
                fm.userData.overrideFollowing = true;
                _vS3b.subVectors(buildingPos, fm.position);
                const dist = _vS3b.length();
                if (dist > 1.0) {
                    allInside = false;
                    _vS3b.normalize();
                    const rushSpeed = 6.0 * delta;
                    fm.position.addScaledVector(_vS3b, Math.min(rushSpeed, dist));
                    fm.lookAt(buildingPos);

                    const body = fm.userData.cachedBody || fm.children.find((c: any) => c.userData.isBody);
                    fm.userData.cachedBody = body;
                    if (body) {
                        _animState.isMoving = true;
                        _animState.isRushing = true;
                        _animState.isDodging = false;
                        _animState.dodgeStartTime = 0;
                        _animState.staminaRatio = 1.0;
                        _animState.isSpeaking = false;
                        _animState.isThinking = false;
                        _animState.isCelebrating = false;
                        _animState.isHugging = false;
                        _animState.isIdleLong = false;
                        _animState.isSwimming = false;
                        _animState.isWading = false;
                        _animState.seed = fm.userData.seed || 0;
                        _animState.renderTime = renderTime;
                        _animState.simTime = simTime;

                        PlayerAnimator.update(body, _animState, renderTime, delta);
                    }
                } else {
                    fm.visible = false;
                }
            }

            if (allInside && elapsed > 500) {
                if (elapsed > 1500) {
                    eventState[KEYS.epilogueState] = EP.AWAIT_INSIDE;
                    eventState[KEYS.epilogueTimer] = simTime;
                    if (ctx.setCameraOverride) ctx.setCameraOverride(null);
                    UIEventRingBuffer.push(UIEventType.HUD_VISIBILITY, 1, 0, simTime);
                }
            }
        }
        else if (ep === EP.AWAIT_INSIDE) {
            if (elapsed > 2000) {
                eventState[KEYS.epilogueState] = EP.BOSS_FIGHT;
                eventState[KEYS.epilogueTimer] = simTime;
            }
        }
        else if (ep === EP.BOSS_FIGHT) {
            if (!sectorState.bossSpawned) {
                sectorState.bossSpawned = true;
                ctx.onAction({ type: TriggerActionType.SPAWN_BOSS, payload: { bossId: BossID.SECTOR_3 } });
            }
        }
        else if (ep === EP.FAMILY_EXIT) {
            if (elapsed < 100 && ctx.setCameraOverride) {
                ctx.setCameraOverride({
                    active: true,
                    targetPos: _camOnBuilding,
                    lookAtPos: _camLookBuilding,
                    endTime: renderTime + 60000
                });
                UIEventRingBuffer.push(UIEventType.HUD_VISIBILITY, 0, 0, simTime);
            }

            updateFamilyMembers();
            const family = _familyMembers;

            const exitTarget = _vS3a.set(LOCATIONS.REUNION_CENTER.x, 0, LOCATIONS.REUNION_CENTER.z + 5);
            let allOut = true;
            for (let i = 0; i < family.length; i++) {
                const fm = family[i];
                fm.visible = true;
                fm.userData.overrideFollowing = true;
                _vS3b.subVectors(exitTarget, fm.position);
                const dist = _vS3b.length();
                if (dist > 1.2) {
                    allOut = false;
                    _vS3b.normalize();
                    fm.position.addScaledVector(_vS3b, Math.min(5.0 * delta, dist));
                    fm.lookAt(exitTarget);
                    const body = fm.userData.cachedBody || fm.children.find((c: any) => c.userData.isBody);
                    fm.userData.cachedBody = body;
                    if (body) {
                        _animState.isMoving = true;
                        _animState.isRushing = false;
                        _animState.isDodging = false;
                        _animState.dodgeStartTime = 0;
                        _animState.staminaRatio = 1.0;
                        _animState.isSpeaking = false;
                        _animState.isThinking = false;
                        _animState.isCelebrating = false;
                        _animState.isHugging = false;
                        _animState.isIdleLong = false;
                        _animState.isSwimming = false;
                        _animState.isWading = false;
                        _animState.seed = fm.userData.seed || 0;
                        _animState.renderTime = renderTime;
                        _animState.simTime = simTime;

                        PlayerAnimator.update(body, _animState, renderTime, delta);
                    }
                }
            }

            if (allOut && elapsed > 300) {
                eventState[KEYS.epilogueState] = EP.PLAYER_WALK;
                eventState[KEYS.epilogueTimer] = simTime;
                sectorState.robertWalkStart = playerPos.clone();
            }
        }
        else if (ep === EP.PLAYER_WALK) {
            const center = _vS3a.set(LOCATIONS.REUNION_CENTER.x, 0, LOCATIONS.REUNION_CENTER.z);
            _vS3b.subVectors(center, playerPos);
            const dist = _vS3b.length();
            if (dist < 4.0 || elapsed > 5000) {
                eventState[KEYS.epilogueState] = EP.RING_FORM;
                eventState[KEYS.epilogueTimer] = simTime;
            }
        }
        else if (ep === EP.RING_FORM) {
            const cx = LOCATIONS.REUNION_CENTER.x;
            const cz = LOCATIONS.REUNION_CENTER.z;
            updateFamilyMembers();
            const family = _familyMembers;
            let allFormed = true;

            for (let i = 0; i < family.length; i++) {
                const fm = family[i];
                const off = RING_OFFSETS[i % RING_OFFSETS.length];
                const tx = cx + off[0];
                const tz = cz + off[1];
                _vS3a.set(tx, 0, tz);
                _vS3b.subVectors(_vS3a, fm.position);
                const dist = _vS3b.length();
                if (dist > 0.3) {
                    allFormed = false;
                    _vS3b.normalize();
                    fm.position.addScaledVector(_vS3b, Math.min(4.0 * delta, dist));
                }
                fm.lookAt(cx, 0, cz);
                const body = fm.userData.cachedBody || fm.children.find((c: any) => c.userData.isBody);
                if (body) {
                    _animState.isMoving = dist > 0.3;
                    _animState.isRushing = false;
                    _animState.isDodging = false;
                    _animState.dodgeStartTime = 0;
                    _animState.staminaRatio = 1.0;
                    _animState.isSpeaking = false;
                    _animState.isThinking = false;
                    _animState.isCelebrating = false;
                    _animState.isHugging = false;
                    _animState.isIdleLong = false;
                    _animState.isSwimming = false;
                    _animState.isWading = false;
                    _animState.seed = fm.userData.seed || 0;
                    _animState.renderTime = renderTime;
                    _animState.simTime = simTime;

                    PlayerAnimator.update(body, _animState, renderTime, delta);
                }
            }

            if ((allFormed || elapsed > 3000) && elapsed > 500) {
                eventState[KEYS.epilogueState] = EP.CELEBRATE;
                eventState[KEYS.epilogueTimer] = simTime;
                eventState[KEYS.cheerSoundPlayed] = false;
            }
        }
        else if (ep === EP.CELEBRATE) {
            if (!eventState[KEYS.cheerSoundPlayed]) {
                eventState[KEYS.cheerSoundPlayed] = true;
                audioEngine.playSound(SoundID.VO_FAMILY_CHEER, 0.9);
                audioEngine.playSound(SoundID.UI_VICTORY, 0.5);
            }

            updateFamilyMembers();
            const family = _familyMembers;
            for (let i = 0; i < family.length; i++) {
                const fm = family[i];
                const body = fm.userData.cachedBody || fm.children.find((c: any) => c.userData.isBody);
                if (body) {
                    _animState.isMoving = false;
                    _animState.isRushing = false;
                    _animState.isDodging = false;
                    _animState.dodgeStartTime = 0;
                    _animState.staminaRatio = 1.0;
                    _animState.isSpeaking = true;
                    _animState.isCelebrating = true;
                    _animState.isThinking = false;
                    _animState.isHugging = false;
                    _animState.isIdleLong = false;
                    _animState.isSwimming = false;
                    _animState.isWading = false;
                    _animState.seed = fm.userData.seed || 0;
                    _animState.renderTime = renderTime;
                    _animState.simTime = simTime;

                    PlayerAnimator.update(body, _animState, renderTime, delta);
                }
            }

            if (elapsed > 3000) {
                eventState[KEYS.epilogueState] = EP.HUG;
                eventState[KEYS.epilogueTimer] = simTime;
                eventState[KEYS.kissSoundPlayed] = false;
            }
        }
        else if (ep === EP.HUG) {
            if (!eventState[KEYS.kissSoundPlayed]) {
                eventState[KEYS.kissSoundPlayed] = true;
                audioEngine.playSound(SoundID.VO_FAMILY_KISS, 0.85);
            }

            updateFamilyMembers();
            const family = _familyMembers;
            for (let i = 0; i < family.length; i++) {
                const fm = family[i];
                const body = fm.userData.cachedBody || fm.children.find((c: any) => c.userData.isBody);
                if (body) {
                    _animState.isMoving = false;
                    _animState.isRushing = false;
                    _animState.isDodging = false;
                    _animState.dodgeStartTime = 0;
                    _animState.staminaRatio = 1.0;
                    _animState.isSpeaking = false;
                    _animState.isHugging = true;
                    _animState.isThinking = false;
                    _animState.isCelebrating = false;
                    _animState.isIdleLong = false;
                    _animState.isSwimming = false;
                    _animState.isWading = false;
                    _animState.seed = fm.userData.seed || 0;
                    _animState.renderTime = renderTime;
                    _animState.simTime = simTime;

                    PlayerAnimator.update(body, _animState, renderTime, delta);
                }
            }

            if (elapsed > 3500) {
                eventState[KEYS.epilogueState] = EP.AWAIT_CAR_ENTER;
                eventState[KEYS.epilogueTimer] = simTime;

                if (scene) {
                    const escapeCar = scene.getObjectByName('s3_escape_car');
                    if (escapeCar) {
                        escapeCar.userData.isInteractable = true;
                        SectorBuilder.addInteractable(
                            ctx.ctx,
                            escapeCar,
                            {
                                id: 's3_escape_car',
                                type: InteractionType.VEHICLE,
                                label: 'ui.interact_enter_car',
                                collider: { type: InteractionShape.SPHERE, radius: 4.0 }
                            }
                        );
                    }
                }
            }
        }
        else if (ep === EP.AWAIT_CAR_ENTER) {
            // Once the player enters the car, start the car zoom camera sequence!
            if (gameState.vehicle && gameState.vehicle.active) {
                eventState[KEYS.epilogueState] = EP.CAR_ZOOM;
                eventState[KEYS.epilogueTimer] = simTime;
            }
        }
        else if (ep === EP.CAR_ZOOM) {
            if (elapsed < 100 && ctx.setCameraOverride) {
                const carCamPos = _vS3a.copy(_carPos).add(_vS3b.set(0, 8, 10));
                ctx.setCameraOverride({
                    active: true,
                    targetPos: carCamPos,
                    lookAtPos: _carPos,
                    endTime: renderTime + 1700
                });
            }

            if (elapsed > 1500) {
                eventState[KEYS.epilogueState] = EP.DRIVE;
                eventState[KEYS.epilogueTimer] = simTime;

                if (ctx.setCameraOverride) ctx.setCameraOverride(null);

                UIEventRingBuffer.push(UIEventType.HUD_VISIBILITY, 1, 0, simTime);
            }
        }
        else if (ep === EP.DRIVE) {
            if (elapsed > 5000 && !eventState[KEYS.epilogueDone]) {
                eventState[KEYS.epilogueDone] = true;
                eventState[KEYS.epilogueState] = EP.DONE;
                if (ctx.onAction) {
                    ctx.onAction([
                        { type: TriggerActionType.END_SECTOR, payload: { isCompleted: true } }
                    ]);
                }
            }
        }

        // Hide/disable rules during non-gameplay states of epilogue
        if (ep !== EP.IDLE && ep !== EP.AWAIT_INSIDE && ep !== EP.BOSS_FIGHT && ep !== EP.DRIVE && ep !== EP.DONE) {
            mask |= SectorEventConstraint.DISABLE_INPUT | SectorEventConstraint.DISABLE_TELEPORT | SectorEventConstraint.HIDE_HUD;
        }

        return mask;
    },
    onPlayerRespawn: (ctx, state, engine, eventState) => {
        const isBossCheckpoint = state.checkpoint && state.checkpoint.active && state.checkpoint.familyMemberId === FamilyMemberID.NATHALIE;
        if (isBossCheckpoint) {
            eventState[KEYS.epilogueState] = EP.BOSS_FIGHT;
            eventState[KEYS.epilogueTimer] = engine.simTime;
            state.sectorState.bossSpawned = false; // Reset so boss spawns again

            // Keep family members inside the building and hidden during boss fight
            const shedPos = LOCATIONS.POIS.SHED;
            const ch = ctx.scene.children;
            for (let i = 0; i < ch.length; i++) {
                const c = ch[i];
                if (c.userData.isFamilyMember || c.userData.type === 'family') {
                    c.position.set(shedPos.x, 0, shedPos.z - 5);
                    c.userData.overrideFollowing = true;
                    c.visible = false;
                }
            }
            return;
        }

        eventState[KEYS.epilogueState] = EP.IDLE;
        eventState[KEYS.epilogueTimer] = 0;
        eventState[KEYS.cheerSoundPlayed] = false;
        eventState[KEYS.kissSoundPlayed] = false;
        eventState[KEYS.epilogueBossDefeated] = false;
        eventState[KEYS.epilogueDone] = false;
        state.sectorState.part2Played = false;
        state.sectorState.nathalieUnlocked = false;
        state.sectorState.bossSpawned = false;

        const escapeCar = ctx.scene.getObjectByName('s3_escape_car');
        if (escapeCar) {
            escapeCar.userData.isInteractable = false;
        }

        // Put Nathalie back to her spawn position inside the building, set following=false
        const ch = ctx.scene.children;
        for (let i = 0; i < ch.length; i++) {
            const c = ch[i];
            if (c.userData.isFamilyMember || c.userData.type === 'family') {
                if (c.userData.name === 'Nathalie') {
                    c.position.set(LOCATIONS.SPAWN.FAMILY.x, 0, LOCATIONS.SPAWN.FAMILY.z);
                    c.userData.overrideFollowing = false;
                    c.visible = true;
                } else {
                    // Reset following and overrideFollowing for Jordan, Loke, Esmeralda
                    c.userData.overrideFollowing = false;
                    c.visible = true;
                }
            }
        }

        // Reset Nathalie's found/following state in activeFamilyMembers
        const fms = state.activeFamilyMembers;
        if (fms) {
            for (let i = 0; i < fms.length; i++) {
                if (fms[i].id === FamilyMemberID.NATHALIE) {
                    fms[i].found = false;
                    fms[i].following = false;
                } else {
                    fms[i].found = true;
                    fms[i].following = true;
                }
            }
        }

        // Reset trigger states for dialogues so they can trigger again
        const triggerSystem = engine.systems.triggerSystem;
        if (triggerSystem) {
            const triggersToReset = [FamilyMemberID.NATHALIE, SectorEventID.S3_DIALOGUE_2];
            for (const tid of triggersToReset) {
                const idx = triggerSystem.getTriggerById(tid, TriggerType.EVENT);
                if (idx !== -1) {
                    triggerSystem.setStatusFlag(idx, TriggerStatus.TRIGGERED, false);
                    triggerSystem.setStatusFlag(idx, TriggerStatus.ACTIVE, tid !== FamilyMemberID.NATHALIE); // Nathalie starts inactive
                }
            }
        }
    }
};

export const Sector3: SectorDef = {
    id: 3,
    environment: {
        bgColor: 0x071b0c,
        fog: {
            density: 250,
            color: 0x020a05,
            height: 10
        },
        groundColor: 0x2a1a11,
        ambient: 0.4,
        fov: 40,
        sky: {
            time: 0.5,
            timeScale: 0.05,
            atmosphereColor: 0x071b0c,
            celestial: {
                radius: 20,
                color: 0xffffff,
                position: { x: 50, y: 35, z: 50 }
            },
            light: {
                visible: true,
                color: 0x88ffaa,
                intensity: 1.5,
                castShadow: true
            }
        },
        cameraOffsetZ: 40,
        cameraHeight: CAMERA_HEIGHT,
        weather: {
            type: WeatherType.NONE,
            particles: 0
        },
        wind: {
            strengthMin: 0.05,
            strengthMax: 1.0,
            direction: { x: 1, z: 1 },
            angleVariance: Math.PI / 4
        }
    },
    ground: GroundType.DIRT,
    ambientLoop: SoundID.AMBIENT_FOREST,
    playerSpawn: LOCATIONS.SPAWN.PLAYER,
    bossSpawn: LOCATIONS.SPAWN.BOSS,

    collectibles: [
        { id: CollectibleID.S3_COLLECTIBLE_1, x: LOCATIONS.COLLECTIBLES.C1.x, z: LOCATIONS.COLLECTIBLES.C1.z },
        { id: CollectibleID.S3_COLLECTIBLE_2, x: LOCATIONS.COLLECTIBLES.C2.x, z: LOCATIONS.COLLECTIBLES.C2.z }
    ],

    cinematic: {
        offset: { x: 6, y: 5, z: 6 },
        lookAtOffset: { x: 0, y: 1.5, z: 0 },
        rotationSpeed: 0.015
    },

    setupProps: async (ctx: SectorBuildContext) => {
        let startTime = performance.now();
        const yieldIfBudgetExceeded = async () => {
            if (performance.now() - startTime > 12) {
                if (ctx.yield) await ctx.yield();
                startTime = performance.now();
            }
        };

        // Helper function for segment distance checks to avoid placing trees on roads/features
        const distanceToSegment = (x: number, z: number, x1: number, z1: number, x2: number, z2: number): number => {
            const dx = x2 - x1;
            const dz = z2 - z1;
            const lenSq = dx * dx + dz * dz;
            if (lenSq === 0) return Math.sqrt((x - x1) * (x - x1) + (z - z1) * (z - z1));
            let t = ((x - x1) * dx + (z - z1) * dz) / lenSq;
            t = Math.max(0, Math.min(1, t));
            const projX = x1 + t * dx;
            const projZ = z1 + t * dz;
            return Math.sqrt((x - projX) * (x - projX) + (z - projZ) * (z - projZ));
        };

        const isNearPath = (x: number, z: number) => {
            // Gravel road: curve from (50, 100) -> (30, 50) -> (20, 12)
            if (distanceToSegment(x, z, 50, 100, 30, 50) < 6) return true;
            if (distanceToSegment(x, z, 30, 50, 20, 12) < 6) return true;

            // Highway: from x = 80 to -120 at z = 0 (width 24, so half width is 12 + margin = 14)
            if (Math.abs(z) < 14 && x > -150 && x < 100) return true;

            // Tiny asphalt road: from (-100, 0) -> (-90, -50) -> (-100, -100)
            if (distanceToSegment(x, z, -100, 0, -90, -50) < 6) return true;
            if (distanceToSegment(x, z, -90, -50, -100, -100) < 6) return true;

            // Sand area: centered at (-25, -80), radius 20
            const dx = x - (-25);
            const dz = z - (-80);
            if (dx * dx + dz * dz < 20 * 20) return true;

            // Scrapyard area: from x = -160 to -40, z = -100 to -260
            if (x > -165 && x < -35 && z > -265 && z < -95) return true;

            return false;
        };

        // --- 1. ROADS AND PATHS ---
        // Gravel road slightly curved ~100m - ends at z = 12 (highway edge) to avoid flickering
        const gravelCurve = await PathGenerator.createGravelRoad(ctx, [
            new THREE.Vector3(50, 0, 100),
            new THREE.Vector3(30, 0, 50),
            new THREE.Vector3(20, 0, 12)
        ], 5);
        await yieldIfBudgetExceeded();

        // Old Highway (asphalt road ~200m) - width tripled from 8 to 24
        await PathGenerator.createRoad(ctx, [
            new THREE.Vector3(80, 0, 0),
            new THREE.Vector3(-120, 0, 0)
        ], 24);
        await yieldIfBudgetExceeded();

        // Add highway lines to the road (double yellow line in center, white dashed lines on the sides)
        const yellowLineMat = new THREE.MeshBasicMaterial({ color: 0xffcc00, side: THREE.DoubleSide });
        const whiteLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
        const centerLineGeo = new THREE.PlaneGeometry(200, 0.15);

        const yellowLineLeft = new THREE.Mesh(centerLineGeo, yellowLineMat);
        yellowLineLeft.rotation.x = -Math.PI / 2;
        yellowLineLeft.position.set(-20, 0.16, -0.15);
        yellowLineLeft.matrixAutoUpdate = false;
        yellowLineLeft.updateMatrix();
        ctx.scene.add(yellowLineLeft);

        const yellowLineRight = new THREE.Mesh(centerLineGeo, yellowLineMat);
        yellowLineRight.rotation.x = -Math.PI / 2;
        yellowLineRight.position.set(-20, 0.16, 0.15);
        yellowLineRight.matrixAutoUpdate = false;
        yellowLineRight.updateMatrix();
        ctx.scene.add(yellowLineRight);

        const dashGeo = new THREE.PlaneGeometry(3, 0.15);
        for (let x = -120; x <= 80; x += 6) {
            const dash1 = new THREE.Mesh(dashGeo, whiteLineMat);
            dash1.rotation.x = -Math.PI / 2;
            dash1.position.set(x + 1.5, 0.16, 6);
            dash1.matrixAutoUpdate = false;
            dash1.updateMatrix();
            ctx.scene.add(dash1);

            const dash2 = new THREE.Mesh(dashGeo, whiteLineMat);
            dash2.rotation.x = -Math.PI / 2;
            dash2.position.set(x + 1.5, 0.16, -6);
            dash2.matrixAutoUpdate = false;
            dash2.updateMatrix();
            ctx.scene.add(dash2);
        }
        await yieldIfBudgetExceeded();

        // Tiny asphalt road lightly curved from Highway to Scrapyard Gate
        const scrapyardRoadCurve = await PathGenerator.createRoad(ctx, [
            new THREE.Vector3(-100, 0, 0),
            new THREE.Vector3(-90, 0, -50),
            new THREE.Vector3(-100, 0, -100)
        ], 5, null, 8); // Asphalt
        await yieldIfBudgetExceeded();

        // --- 2. SAND AREA & PATH ---
        // Sand Area centered at (-25, -80) - Organic blob shape stretching to (-55, -70)
        const sandShape = new THREE.Shape();
        const numPoints = 24;
        const baseRadius = 18;
        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            let r = baseRadius + Math.sin(angle * 3) * 4 + Math.cos(angle * 5) * 2;

            // Project direction onto target vector (-30, 10) in local space to stretch westwards to (-55, -70)
            const targetDir = new THREE.Vector2(-30, 10).normalize();
            const currentDir = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
            const dot = currentDir.dot(targetDir);
            if (dot > 0) {
                r += dot * 15;
            }

            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            if (i === 0) {
                sandShape.moveTo(x, y);
            } else {
                sandShape.lineTo(x, y);
            }
        }
        sandShape.closePath();
        const sandGeo = new THREE.ShapeGeometry(sandShape);
        const sandMesh = new THREE.Mesh(sandGeo, (MATERIALS as any).sand || MATERIALS.dirt);
        sandMesh.rotation.x = -Math.PI / 2;
        sandMesh.position.set(-25, 0.05, -80);
        sandMesh.receiveShadow = true;
        ctx.scene.add(sandMesh);
        ctx.engine.systems.worldStreamer.registerGroundMaterial(-25, -80, 20, 14); // 14 = MaterialType.SAND
        await yieldIfBudgetExceeded();

        // Sand path starting at (-9, -12) and lingering up to the sand area
        await PathGenerator.createSandPath(ctx, [
            new THREE.Vector3(-9, 0, -12),
            new THREE.Vector3(2, 0, -33),
            new THREE.Vector3(6, 0, -54),
            new THREE.Vector3(1, 0, -69),
            new THREE.Vector3(-13, 0, -74),
        ], 4);
        await yieldIfBudgetExceeded();

        // Sand path lingering through the dead wood area, from the west side of the sand area to (-94, -86)
        await PathGenerator.createSandPath(ctx, [
            new THREE.Vector3(-55, 0, -80),
            new THREE.Vector3(-75, 0, -83),
            new THREE.Vector3(-94, 0, -86)
        ], 3.5);
        await yieldIfBudgetExceeded();

        // Spawn Sand piles (rubble) in the sand area
        for (let i = 0; i < 4; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 5 + Math.random() * 8;
            await SectorBuilder.spawnRubble(ctx, -25 + Math.cos(angle) * dist, -80 + Math.sin(angle) * dist, 5, (MATERIALS as any).sand || MATERIALS.dirt);
            await yieldIfBudgetExceeded();
        }

        // Spawn Stones around the sand area
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const dist = 17 + Math.random() * 3;
            const rWidth = 2 + Math.random() * 3;
            const rHeight = 1.5 + Math.random() * 2;
            const stone = await SectorBuilder.spawnRock(ctx, -25 + Math.cos(angle) * dist, -80 + Math.sin(angle) * dist, rWidth, rHeight);
            stone.position.y = -rHeight * 0.1;
            stone.updateMatrix();
            await yieldIfBudgetExceeded();
        }

        // Spawn one even larger rock, one large rock, multiple medium rocks, and lots of small rocks around (12, -75)
        const rockCenter = new THREE.Vector2(12, -75);
        const placedRocks: { x: number, z: number, r: number }[] = [];

        const tryPlaceRock = async (scale: number, height: number) => {
            const minDistanceFactor = 0.7; // Allow up to 30% overlap for natural look
            for (let attempt = 0; attempt < 50; attempt++) {
                const angle = Math.random() * Math.PI * 2;
                // Square root of random number ensures uniform distribution within the circle
                const dist = Math.sqrt(Math.random()) * 20;
                const x = rockCenter.x + Math.cos(angle) * dist;
                const z = rockCenter.y + Math.sin(angle) * dist;

                let overlaps = false;
                for (const other of placedRocks) {
                    const dx = x - other.x;
                    const dz = z - other.z;
                    const distSq = dx * dx + dz * dz;
                    const minDist = (scale + other.r) * minDistanceFactor;
                    if (distSq < minDist * minDist) {
                        overlaps = true;
                        break;
                    }
                }

                if (!overlaps) {
                    placedRocks.push({ x, z, r: scale });
                    const stone = await SectorBuilder.spawnRock(ctx, x, z, scale, height);
                    stone.position.y = -height * 0.1;
                    stone.updateMatrix();
                    await yieldIfBudgetExceeded();
                    return true;
                }
            }
            return false;
        };

        // 1 Even Larger Rock
        await tryPlaceRock(16 + Math.random() * 4, 10 + Math.random() * 4);

        // 1 Large Rock (100% larger than original 6-8 range)
        await tryPlaceRock(12 + Math.random() * 4, 8 + Math.random() * 4);

        // 5 Medium Rocks (100% larger than original 3-4.5 range)
        for (let i = 0; i < 5; i++) {
            await tryPlaceRock(6 + Math.random() * 3, 4 + Math.random() * 3);
        }

        // 15 Small Rocks (100% larger than original 1-2 range)
        for (let i = 0; i < 15; i++) {
            await tryPlaceRock(2 + Math.random() * 2, 1.6 + Math.random() * 1.4);
        }

        // Three (3) chests around the sand area
        await SectorBuilder.spawnChest(ctx, -15, -90, ChestType.STANDARD);
        await SectorBuilder.spawnChest(ctx, -30, -70, ChestType.STANDARD);
        await SectorBuilder.spawnChest(ctx, -10, -75, ChestType.STANDARD);
        await yieldIfBudgetExceeded();

        // --- 3. SCRAPYARD BOUNDS, FENCE & GATE ---
        // Scrapyard Dealership Building (POI) moved northwest
        await SectorBuilder.spawnPoi(ctx, PoiType.DEALERSHIP, -100, -200, 0);
        await yieldIfBudgetExceeded();

        // Reward Chest at boss spawn (next to Dealership POI)
        await SectorBuilder.spawnChest(ctx, LOCATIONS.SPAWN.BOSS.x, LOCATIONS.SPAWN.BOSS.z, ChestType.BIG);
        await yieldIfBudgetExceeded();

        // Five (5) chests around the scrapyard section
        await SectorBuilder.spawnChest(ctx, -140, -150, ChestType.STANDARD);
        await SectorBuilder.spawnChest(ctx, -60, -220, ChestType.STANDARD);
        await SectorBuilder.spawnChest(ctx, -70, -120, ChestType.STANDARD);
        await SectorBuilder.spawnChest(ctx, -130, -240, ChestType.STANDARD);
        await SectorBuilder.spawnChest(ctx, -120, -110, ChestType.STANDARD);
        await yieldIfBudgetExceeded();

        // Scrapyard fence
        await SectorBuilder.createFence(ctx, [
            new THREE.Vector3(-160, 0, -100),
            new THREE.Vector3(-160, 0, -260),
            new THREE.Vector3(-40, 0, -260),
            new THREE.Vector3(-40, 0, -100),
            new THREE.Vector3(-95, 0, -100)
        ], 'mesh', 2.5);
        await yieldIfBudgetExceeded();

        await SectorBuilder.createFence(ctx, [
            new THREE.Vector3(-160, 0, -100),
            new THREE.Vector3(-105, 0, -100)
        ], 'mesh', 2.5);
        await yieldIfBudgetExceeded();

        // Gate that can be opened manually
        const gateGroup = new THREE.Group();
        gateGroup.position.set(-100, 0, -100);
        gateGroup.name = 's3_scrapyard_gate';

        const postGeo = new THREE.BoxGeometry(0.3, 2.5, 0.3);
        const postMat = MATERIALS.blackMetal || new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8 });
        const postLeft = new THREE.Mesh(postGeo, postMat);
        postLeft.position.set(-5, 1.25, 0);
        gateGroup.add(postLeft);

        const postRight = new THREE.Mesh(postGeo, postMat);
        postRight.position.set(5, 1.25, 0);
        gateGroup.add(postRight);

        const gateFrameGeo = new THREE.BoxGeometry(9.6, 0.15, 0.15);
        const frameTop = new THREE.Mesh(gateFrameGeo, postMat);
        frameTop.position.set(0, 2.3, 0);
        gateGroup.add(frameTop);

        const frameBottom = new THREE.Mesh(gateFrameGeo, postMat);
        frameBottom.position.set(0, 0.2, 0);
        gateGroup.add(frameBottom);

        const barGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.1, 8);
        for (let i = -4.5; i <= 4.5; i += 0.9) {
            const bar = new THREE.Mesh(barGeo, postMat);
            bar.position.set(i, 1.25, 0);
            gateGroup.add(bar);
        }
        ctx.scene.add(gateGroup);

        const gateObstacle = {
            mesh: gateGroup,
            position: gateGroup.position,
            collider: {
                type: ColliderType.BOX,
                size: new THREE.Vector3(10, 2.5, 1.0),
                center: new THREE.Vector3(0, 1.25, 0)
            },
            durability: 120,
            maxDurability: 120,
            excludedWeapons: [],
            onDestroyObject: (session: any, obstacle: any) => {
                obstacle.isMutated = true;
                if (obstacle.mesh) obstacle.mesh.visible = false;
                const gp = obstacle.position;
                session.callbacks.spawnParticle(gp.x, 1.25, gp.z, FXParticleType.DEBRIS, 30);
                audioEngine.playSound(SoundID.EXPLOSION, 0.8);
            }
        };
        ctx.sectorState.gateObstacle = gateObstacle;
        SectorBuilder.addObstacle(ctx, gateObstacle);
        await yieldIfBudgetExceeded();

        // Stacks of Cars (Maze) - moved northwest and fits inside fence
        for (let i = 0; i < 50; i++) {
            const x = -150 + Math.random() * 100;
            const z = -250 + Math.random() * 140;
            // Don't spawn on dealership building, escape car, or gate path
            const dxShed = x - (-100);
            const dzShed = z - (-200);
            if (dxShed * dxShed + dzShed * dzShed < 350) continue;

            const dxGate = x - (-100);
            const dzGate = z - (-100);
            if (dxGate * dxGate + dzGate * dzGate < 200) continue;

            const carStackHeight = 1 + Math.floor(Math.random() * 3);
            const rotY = Math.random() * Math.PI * 2;
            await SectorBuilder.spawnVehicleStack(ctx, x, z, rotY, carStackHeight);
            await yieldIfBudgetExceeded();
        }

        // Escape car parked next to building
        const escapeCar = await SectorBuilder.spawnDriveableVehicle(
            ctx,
            LOCATIONS.ESCAPE_CAR.x,
            LOCATIONS.ESCAPE_CAR.z,
            LOCATIONS.ESCAPE_CAR.rot,
            VehicleID.STATION_WAGON,
            0x223344,
            false
        );
        if (escapeCar) {
            escapeCar.name = 's3_escape_car';
            escapeCar.userData.isInteractable = false;
        }
        await yieldIfBudgetExceeded();

        // Street sign reading "Borås Bildemontering" at the intersection
        await SectorBuilder.spawnNeonSign(ctx, -106, 0.5, Math.PI / 2, 'Borås Bildemontering', 0x00ff88, true, 1.2);
        await yieldIfBudgetExceeded();

        // --- 4. ENVIRONMENT AND TREES ---
        // Dense Spruce Wood Polygons
        // Coordinates adjusted to start at z = 18 (avoid highway overlap) and end at x = 10 (avoid gravel road/forest overlap)
        const spruceSouthHighway = [
            new THREE.Vector3(-150, 0, 18),
            new THREE.Vector3(10, 0, 18),
            new THREE.Vector3(10, 0, 45),
            new THREE.Vector3(-150, 0, 45)
        ];
        await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.SPRUCE, spruceSouthHighway, 8);
        await yieldIfBudgetExceeded();

        const forestOffset = 8;
        const forestDepth = 60;
        const forestSamples = 40;
        const fPoints = gravelCurve.getSpacedPoints(forestSamples);

        const gravelForestLeft = [
            ...PathGenerator.getOffsetPoints(fPoints, -forestOffset),
            ...PathGenerator.getOffsetPoints(fPoints, -(forestOffset + forestDepth)).reverse()
        ];
        const gravelForestRight = [
            ...PathGenerator.getOffsetPoints(fPoints, forestOffset),
            ...PathGenerator.getOffsetPoints(fPoints, forestOffset + forestDepth).reverse()
        ];

        for (let i = 0; i < gravelForestLeft.length; i++) gravelForestLeft[i].y = 0;
        for (let i = 0; i < gravelForestRight.length; i++) gravelForestRight[i].y = 0;

        await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.SPRUCE, gravelForestLeft, 8);
        await yieldIfBudgetExceeded();

        await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.SPRUCE, gravelForestRight, 8);
        await yieldIfBudgetExceeded();

        // TODO: fix so it aligns well on the north side of the sand area
        const spruceSouthSand = [
            new THREE.Vector3(-45, 0, -45),
            new THREE.Vector3(10, 0, -45),
            new THREE.Vector3(10, 0, -62),
            new THREE.Vector3(-45, 0, -62)
        ];
        await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.BIRCH, spruceSouthSand, 8);
        await yieldIfBudgetExceeded();

        // TODO: fix so it aligns well on the north side of the sand area
        const spruceNorthSand = [
            new THREE.Vector3(-45, 0, -98),
            new THREE.Vector3(10, 0, -98),
            new THREE.Vector3(10, 0, -82),
            new THREE.Vector3(-45, 0, -82)
        ];
        await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.BIRCH, spruceNorthSand, 8);
        await yieldIfBudgetExceeded();

        const spruceEastSand = [
            new THREE.Vector3(-2, 0, -14),
            new THREE.Vector3(7, 0, -34),
            new THREE.Vector3(10, 0, -55),
            new THREE.Vector3(27, 0, -63),
            new THREE.Vector3(47, 0, -63),
            new THREE.Vector3(80, 0, -63),
            new THREE.Vector3(80, 0, -14),
        ];
        await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.SPRUCE, spruceEastSand, 8);
        await yieldIfBudgetExceeded();

        // Dead trees around sand area
        for (let i = 0; i < 10; i++) {
            const deadTree = VegetationGenerator.createDeadTree('standing', 0.6 + Math.random() * 0.4);
            const angle = Math.random() * Math.PI * 2;
            const dist = 14 + Math.random() * 8;
            deadTree.position.set(-25 + Math.cos(angle) * dist, 0, -80 + Math.sin(angle) * dist);
            ctx.scene.add(deadTree);
            await yieldIfBudgetExceeded();
        }

        // Dead trees (brown area in Image 1):
        // Carved dynamically as an offset along the right (east) side of the scrapyard road.
        // We split it into two zones to allow the sand path to pass through cleanly at z = -80 to -86.
        const deadwoodOffset = 5;
        const deadwoodDepth = 30; // Reduced from 55 to stop around x = -60 to -65
        const deadwoodSamples = 20;
        const sPoints = scrapyardRoadCurve.getSpacedPoints(deadwoodSamples);

        const rawPointsLeft = PathGenerator.getOffsetPoints(sPoints, deadwoodOffset);
        const rawPointsRight = PathGenerator.getOffsetPoints(sPoints, deadwoodOffset + deadwoodDepth);

        // Zone 1: South of the sand path (z from -15 to -75)
        const deadWoodPolySouth: THREE.Vector3[] = [];
        // Zone 2: North of the sand path (z from -89 to -98)
        const deadWoodPolyNorth: THREE.Vector3[] = [];

        // Build South Poly
        for (let i = 0; i < rawPointsLeft.length; i++) {
            const p = rawPointsLeft[i];
            if (p.z > -75 && p.z < -15) {
                const limitEast = p.z < -45 ? -58 : -48;
                deadWoodPolySouth.push(new THREE.Vector3(Math.min(p.x, limitEast), 0, p.z));
            }
        }
        for (let i = rawPointsRight.length - 1; i >= 0; i--) {
            const p = rawPointsRight[i];
            if (p.z > -75 && p.z < -15) {
                const limitEast = p.z < -45 ? -58 : -48;
                deadWoodPolySouth.push(new THREE.Vector3(Math.min(p.x, limitEast), 0, p.z));
            }
        }

        // Build North Poly
        for (let i = 0; i < rawPointsLeft.length; i++) {
            const p = rawPointsLeft[i];
            if (p.z < -89 && p.z > -98) {
                deadWoodPolyNorth.push(new THREE.Vector3(Math.min(p.x, -58), 0, p.z));
            }
        }
        for (let i = rawPointsRight.length - 1; i >= 0; i--) {
            const p = rawPointsRight[i];
            if (p.z < -89 && p.z > -98) {
                deadWoodPolyNorth.push(new THREE.Vector3(Math.min(p.x, -58), 0, p.z));
            }
        }

        if (deadWoodPolySouth.length >= 3) {
            await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.DEAD_TREE, deadWoodPolySouth, 6);
            await yieldIfBudgetExceeded();
        }
        if (deadWoodPolyNorth.length >= 3) {
            await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.DEAD_TREE, deadWoodPolyNorth, 6);
            await yieldIfBudgetExceeded();
        }

        // Highway blocked to the East (right) by burning cars in line standing in both lines
        const car1 = await SectorBuilder.spawnVehicle(ctx, 39, 2, Math.PI, VehicleID.STATION_WAGON, 0x111111);
        await SectorBuilder.setOnFire(ctx, car1, { smoke: true, intensity: 3 });
        await yieldIfBudgetExceeded();

        const car2 = await SectorBuilder.spawnVehicle(ctx, 39, -2, -Math.PI / 2, VehicleID.SEDAN, 0x222222);
        await SectorBuilder.setOnFire(ctx, car2, { smoke: true, intensity: 3 });
        await yieldIfBudgetExceeded();

        const car3 = await SectorBuilder.spawnVehicle(ctx, 41, 1.5, Math.PI / 1.3 + 0.2, VehicleID.STATION_WAGON, 0x111111);
        await SectorBuilder.setOnFire(ctx, car3, { smoke: true, intensity: 2.5 });
        await yieldIfBudgetExceeded();

        const car4 = await SectorBuilder.spawnVehicle(ctx, 41, -2.5, -Math.PI / 1.5 - 0.2, VehicleID.SEDAN, 0x222222);
        await SectorBuilder.setOnFire(ctx, car4, { smoke: true, intensity: 2.5 });
        await yieldIfBudgetExceeded();

        // TODO: FIX THIS
        // Dynamic Environmental zone with dark light and ember weather covering the scrapyard
        SectorBuilder.addEnvironmentalZone(ctx, {
            label: 'Scrapyard Ember Zone',
            x: -100,
            z: -180,
            outerRadius: 120,
            weather: WeatherType.EMBER,
            weatherDensity: 2000,
            bgColor: 0x110500, // Dark amber/red background
            fogDensity: 30,    // Thick fog
            ambient: 0.6
        });

        // Nathalie - At the dealership
        await SectorBuilder.spawnFamily(ctx, FamilyMemberID.NATHALIE, LOCATIONS.SPAWN.FAMILY.x, LOCATIONS.SPAWN.FAMILY.z, Math.PI, { following: false, found: false, visible: true });
    },

    setupContent: async (ctx: SectorBuildContext) => {
        if (ctx.isWarmup) return;
        SectorBuilder.addTriggers(ctx, [
            // Part 1 — on the gravel path connection
            {
                id: SectorEventID.S3_DIALOGUE_1,
                position: LOCATIONS.TRIGGERS.DIALOGUE_1,
                radius: 15,
                type: TriggerType.EVENT,
                statusFlags: TriggerStatus.ACTIVE | TriggerStatus.ONCE,
                actions: [{ type: TriggerActionType.START_CINEMATIC, payload: { sectorId: 3, dialogueId: 0, targetName: 'PLAYER' } }]
            },
            // Part 2 — deeper into the scrapyard
            {
                id: SectorEventID.S3_DIALOGUE_2,
                position: LOCATIONS.TRIGGERS.DIALOGUE_2,
                radius: 15,
                type: TriggerType.EVENT,
                statusFlags: TriggerStatus.ACTIVE | TriggerStatus.ONCE,
                actions: [{ type: TriggerActionType.START_CINEMATIC, payload: { sectorId: 3, dialogueId: 1, targetName: 'PLAYER' } }]
            },
            // Part 3 — close to the building where Nathalie is hiding.
            // Starts INACTIVE so it only fires after the player has explored.
            // Activated in onUpdate after dialogue_2 has played.
            {
                id: FamilyMemberID.NATHALIE,
                position: LOCATIONS.TRIGGERS.FOUND_NATHALIE,
                familyId: FamilyMemberID.NATHALIE,
                radius: 18,
                type: TriggerType.EVENT,
                statusFlags: TriggerStatus.ONCE, // INACTIVE — activated after Part 2
                actions: [{ type: TriggerActionType.START_CINEMATIC, payload: { familyId: FamilyMemberID.NATHALIE, sectorId: 3, dialogueId: 2 } }]
            },

            { id: ClueID.S3_CREEPY_NOISE, position: LOCATIONS.TRIGGERS.NOISE, radius: 20, type: TriggerType.CLUE, content: "clues.3.0.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.PLAY_SOUND, payload: { id: SoundID.AMBIENT_METAL } }, { type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
            { id: PoiID.S3_SHED, position: LOCATIONS.TRIGGERS.SHED_SIGHT, radius: 25, type: TriggerType.POI, content: "pois.3.0.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
            { id: PoiID.S3_SCRAPYARD, position: { x: -100, z: -180 }, radius: 100, type: TriggerType.POI, content: "pois.3.1.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] }
        ]);
    },

    setupZombies: async (ctx: SectorBuildContext) => {
        if (ctx.isWarmup) return;
        // Keep zombies in the scrapyard
        for (let i = 0; i < 5; i++) {
            ctx.spawnZombie(EnemyType.WALKER, new THREE.Vector3(-100 + (Math.random() - 0.5) * 50, 0, -180 + (Math.random() - 0.5) * 50));
        }

        // Spawn 5-10 zombies in the sand area
        const sandZombieCount = 7 + Math.floor(ctx.rng() * 3);
        for (let i = 0; i < sandZombieCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 12;
            ctx.spawnZombie(EnemyType.WALKER, new THREE.Vector3(
                -25 + Math.cos(angle) * dist,
                0,
                -80 + Math.sin(angle) * dist
            ));
        }

        // Hordes
        const hordeSpots = [
            new THREE.Vector3(-65, 0, -50),
            new THREE.Vector3(-120, 0, -130),
            new THREE.Vector3(-70, 0, -200),
        ];

        for (let i = 0; i < hordeSpots.length; i++) {
            const count = 6 + Math.floor(ctx.rng() * 4);
            ctx.spawnHorde(count, undefined, hordeSpots[i]);
        }
    },

    onSectorUpdate: ({ delta, simTime, renderTime, playerPos, gameState, sectorState, ctx, engine, ...events }) => {
        const triggerSystem = engine.systems.triggerSystem;

        // --- SECTOR 3: NATHALIE MISSION LOGIC ---
        if (Math.random() < 0.015 && gameState.enemies.length < 12 && !sectorState.epilogueBossDefeated) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 25 + Math.random() * 20;
            events.spawnZombie(EnemyType.RUNNER, new THREE.Vector3(
                playerPos.x + Math.cos(angle) * dist,
                0,
                playerPos.z + Math.sin(angle) * dist
            ));
        }

        // ── Activate Part 3 trigger after Part 2 has played ──
        if (!sectorState.nathalieUnlocked && sectorState.pendingTrigger === null && sectorState.part2Played) {
            sectorState.nathalieUnlocked = true;
            const t = triggerSystem.metadata.find((t: any) => t.id === FamilyMemberID.NATHALIE);
            if (t) {
                const idx = triggerSystem.getTriggerById(FamilyMemberID.NATHALIE, TriggerType.EVENT);
                if (idx !== -1) {
                    triggerSystem.setStatusFlag(idx, TriggerStatus.ACTIVE, true);
                    triggerSystem.setStatusFlag(idx, TriggerStatus.TRIGGERED, false);
                }
            }
        }
        // Stamp when Part 2 cinematic has started
        if (!sectorState.part2Played && sectorState.pendingTrigger === null) {
            // Mark Part 2 as played once s3_dialogue_2 trigger fires
            const idx = triggerSystem.getTriggerById(SectorEventID.S3_DIALOGUE_2, TriggerType.EVENT);
            if (idx !== -1 && triggerSystem.isTriggered(idx)) sectorState.part2Played = true;
        }
    },

    events: [epilogueEvent]
};