import * as THREE from 'three';
import { SectorDef, SectorContext } from '../../game/session/SectorTypes';
import { SectorBuilder } from '../../core/world/SectorBuilder';
import { VegetationGenerator } from '../../core/world/generators/VegetationGenerator';
import { VEGETATION_TYPE } from '../../content/environment';
import { POI_TYPE } from '../../content/pois'
import { CAMERA_HEIGHT } from '../constants';
import { EnemyType } from '../../entities/enemies/EnemyTypes';
import { TriggerType, TriggerActionType, TriggerStatus } from '../../systems/TriggerTypes';
import { SoundID } from '../../utils/audio/AudioTypes';
import { audioEngine } from '../../utils/audio/AudioEngine';
import { PlayerAnimator } from '../../entities/player/PlayerAnimator';
import { InteractionType } from '../../systems/InteractionTypes';
import { FamilyMemberID } from '../constants';
import { WeatherType } from '../../core/engine/EngineTypes';

// ─── Zero-GC Scratchpads ──────────────────────────────────────────────────────
const _vS3a = new THREE.Vector3();
const _vS3b = new THREE.Vector3();

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
} as const;

const LOCATIONS = {
    SPAWN: {
        PLAYER: { x: 0, z: 0 },
        FAMILY: { x: -40, z: -150, y: 0 },
        BOSS: { x: -40, z: -150 }
    },
    CINEMATIC: {
        OFFSET: { x: 15, y: 12, z: 15 },
        LOOK_AT: { x: 0, y: 1.5, z: 0 }
    },
    COLLECTIBLES: {
        C1: { x: 40, z: -80 },
        C2: { x: -20, z: -60 }
    },
    TRIGGERS: {
        NOISE: { x: 0, z: -50 },
        SHED_SIGHT: { x: -20, z: -120 },
        FOUND_NATHALIE: { x: -40, z: -150 },
        DIALOGUE_1: { x: 0, z: -20 },
        DIALOGUE_2: { x: 0, z: -50 }
    },
    POIS: {
        SHED: { x: -40, z: -150 }
    },
    // Escape car parked next to the dealership building
    ESCAPE_CAR: { x: -60, z: -150, rot: Math.PI / 2 },
    // Ring positions for the reunion (around a centre point)
    REUNION_CENTER: { x: -42, z: -148 }
} as const;

// Ring offsets for the 5 characters: Loke, Jordan, Esmeralda, Nathalie, Robert
const RING_OFFSETS: [number, number][] = [
    [2.2, 0],
    [-2.2, 0],
    [0, 2.2],
    [0, -2.2],
    [0, 0], // Robert (centre of group, slightly behind)
];

export const Sector3: SectorDef = {
    id: 3,
    name: "sectors.sector_3_name",
    environment: {
        bgColor: 0x110500,
        fog: {
            density: 200,
            color: 0x020208,
            height: 10
        },
        ambientIntensity: 0.6,
        ambientColor: 0x404050,
        groundColor: 0x2a1a11,
        fov: 40,
        skyLight: { visible: true, color: 0xffaa00, intensity: 3.0 },
        cameraOffsetZ: 40,
        cameraHeight: CAMERA_HEIGHT,
        weather: {
            type: WeatherType.EMBER,
            particles: 2000
        },
        wind: {
            strengthMin: 0.05,
            strengthMax: 1.0,
            direction: { x: 1, z: 1 },
            angleVariance: Math.PI / 4
        }
    },
    groundType: 'DIRT',
    ambientLoop: SoundID.AMBIENT_FOREST,
    playerSpawn: LOCATIONS.SPAWN.PLAYER,
    bossSpawn: LOCATIONS.SPAWN.BOSS,

    collectibles: [
        { id: 's3_collectible_1', x: LOCATIONS.COLLECTIBLES.C1.x, z: LOCATIONS.COLLECTIBLES.C1.z },
        { id: 's3_collectible_2', x: LOCATIONS.COLLECTIBLES.C2.x, z: LOCATIONS.COLLECTIBLES.C2.z }
    ],

    cinematic: {
        offset: LOCATIONS.CINEMATIC.OFFSET,
        lookAtOffset: LOCATIONS.CINEMATIC.LOOK_AT,
        rotationSpeed: 0.05
    },

    setupProps: async (ctx: SectorContext) => {
        const { scene } = ctx;
        (ctx as any).sectorState.ctx = ctx;

        // Reward Chest at boss spawn
        SectorBuilder.spawnChest(ctx, LOCATIONS.SPAWN.BOSS.x, LOCATIONS.SPAWN.BOSS.z, 'big');

        // Stacks of Cars (Maze) — Sektor 4 Bilskroten
        for (let i = 0; i < 60; i++) {
            const x = (Math.random() - 0.5) * 160;
            const z = -20 - Math.random() * 140;
            if (Math.abs(x) < 10 && z > -100) continue;
            const carStackHeight = 1 + Math.floor(Math.random() * 3);
            const rotY = Math.random() * Math.PI * 2;
            await SectorBuilder.spawnVehicleStack(ctx, x, z, rotY, carStackHeight);
        }

        // Perimeter Trees
        for (let i = 0; i < 80; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 100 + Math.random() * 60;
            const x = Math.cos(angle) * r;
            const z = -80 + Math.sin(angle) * r;
            await SectorBuilder.spawnTree(ctx, 'spruce', x, z, 1.0 + Math.random() * 0.5);
        }

        // The Dealership Building (Nathalie hiding here)
        SectorBuilder.spawnPoi(ctx, POI_TYPE.DEALERSHIP, -40, -150, 0);

        // Escape car parked next to the building — starts NOT interactable.
        // It becomes interactable during the epilogue car zoom.
        const escapeCar = SectorBuilder.spawnDriveableVehicle(
            ctx,
            LOCATIONS.ESCAPE_CAR.x,
            LOCATIONS.ESCAPE_CAR.z,
            LOCATIONS.ESCAPE_CAR.rot,
            'station_wagon',
            0x223344,
            false  // addInteractable = false initially
        );
        if (escapeCar) {
            escapeCar.name = 's3_escape_car';
            escapeCar.userData.isInteractable = false; // locked until epilogue
        }

        // ── Industrial Decay ──
        const industrialWeeds = [
            new THREE.Vector3(-20, 0, -20),
            new THREE.Vector3(20, 0, -20),
            new THREE.Vector3(20, 0, 20),
            new THREE.Vector3(-20, 0, 20)
        ];
        SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.GRASS, industrialWeeds, 0.4);

        for (let i = 0; i < 15; i++) {
            const deadTree = VegetationGenerator.createDeadTree('standing', 0.6 + Math.random() * 0.4);
            const angle = Math.random() * Math.PI * 2;
            const dist = 30 + Math.random() * 40;
            deadTree.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
            ctx.scene.add(deadTree);
        }

        // Nathalie - At the dealership, not following yet
        SectorBuilder.spawnFamily(ctx, FamilyMemberID.NATHALIE, LOCATIONS.SPAWN.FAMILY.x, LOCATIONS.SPAWN.FAMILY.z, Math.PI, { following: false, found: false });
    },

    setupContent: async (ctx: SectorContext) => {
        if (ctx.isWarmup) return;
        SectorBuilder.addTriggers(ctx, [
            // Part 1 — on the gravel path
            {
                id: 's3_dialogue_1',
                position: LOCATIONS.TRIGGERS.DIALOGUE_1,
                radius: 15,
                type: TriggerType.EVENT,
                content: '',
                statusFlags: TriggerStatus.ACTIVE | TriggerStatus.ONCE,
                actions: [{ type: TriggerActionType.START_CINEMATIC, payload: { sectorId: 3, scriptId: 0 } }]
            },
            // Part 2 — deeper into the scrapyard
            {
                id: 's3_dialogue_2',
                position: LOCATIONS.TRIGGERS.DIALOGUE_2,
                radius: 15,
                type: TriggerType.EVENT,
                content: '',
                statusFlags: TriggerStatus.ACTIVE | TriggerStatus.ONCE,
                actions: [{ type: TriggerActionType.START_CINEMATIC, payload: { sectorId: 3, scriptId: 1 } }]
            },
            // Part 3 — close to the building where Nathalie is hiding.
            // Starts INACTIVE so it only fires after the player has explored.
            // Activated in onUpdate after dialogue_2 has played.
            {
                id: 's3_found_nathalie',
                position: LOCATIONS.TRIGGERS.FOUND_NATHALIE,
                familyId: FamilyMemberID.NATHALIE,
                radius: 18,
                type: TriggerType.EVENT,
                content: '',
                statusFlags: TriggerStatus.ONCE, // INACTIVE — activated after Part 2
                actions: [{ type: TriggerActionType.START_CINEMATIC, payload: { familyId: FamilyMemberID.NATHALIE, sectorId: 3, scriptId: 2 } }]
            },

            { id: 's3_creepy_noise', position: LOCATIONS.TRIGGERS.NOISE, radius: 20, type: TriggerType.THOUGHT, content: "clues.3.0.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.PLAY_SOUND, payload: { id: SoundID.AMBIENT_METAL } }, { type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
            { id: 's3_poi_shed', position: LOCATIONS.TRIGGERS.SHED_SIGHT, radius: 25, type: TriggerType.POI, content: "pois.3.0.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
            { id: 's3_poi_scrapyard', position: { x: 0, z: -100 }, radius: 100, type: TriggerType.POI, content: "pois.3.1.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] }
        ]);
    },

    setupZombies: async (ctx: SectorContext) => {
        if (ctx.isWarmup) return;
        for (let i = 0; i < 5; i++) {
            ctx.spawnZombie(EnemyType.WALKER);
        }
        spawnSectorHordes(ctx);
    },

    onUpdate: (delta, simTime, renderTime, playerPos, gameState, sectorState, events) => {
        // ── Routine scrapyard ambushes ──
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
            const t = gameState.triggers?.find((t: any) => t.id === 's3_found_nathalie');
            if (t) {
                t.statusFlags = TriggerStatus.ACTIVE | TriggerStatus.ONCE;
                t.triggered = false; // Maintain boolean compatibility
            }
        }
        // Stamp when Part 2 cinematic has started
        if (!sectorState.part2Played && sectorState.pendingTrigger === null) {
            // Mark Part 2 as played once s3_dialogue_2 trigger fires
            const d2 = gameState.triggers?.find((t: any) => t.id === 's3_dialogue_2');
            if (d2?.triggered) sectorState.part2Played = true;
        }

        // ── RUSH_TO_NATHALIE signal from dialogue's last line ──
        if (sectorState.pendingTrigger === 'RUSH_TO_NATHALIE') {
            sectorState.pendingTrigger = null;
            sectorState.epilogueState = EP.RUSH_TO_NATHALIE;
            sectorState.epilogueTimer = simTime;
        }

        // ── Boss-defeat signal absorbed here before GameSessionLoop fires concludeSector ──
        // We do NOT want the automatic 4s→conclude flow. Instead we run the epilogue sequence.
        if (gameState.bossDefeatedTime > 0 && !sectorState.epilogueBossDefeated) {
            sectorState.epilogueBossDefeated = true;
            // Prevent GameSessionLoop from triggering concludeSector by zeroing it immediately.
            // We will call it ourselves after the full epilogue.
            gameState.bossDefeatedTime = -1;
            sectorState.epilogueState = EP.FAMILY_EXIT;
            sectorState.epilogueTimer = simTime;
        }

        // ══════════════════════════════════════════════════════════════════════
        // EPILOGUE STATE MACHINE
        // ══════════════════════════════════════════════════════════════════════
        if (!sectorState.epilogueState) sectorState.epilogueState = EP.IDLE;
        const ep = sectorState.epilogueState;
        const elapsed = simTime - (sectorState.epilogueTimer || 0);

        const sceneHost = (events as any).scene || (gameState as any).scene;
        const scene = sceneHost as THREE.Scene;

        // Helper: gather all family members from scene
        const getFamilyMembers = () => {
            const result: any[] = [];
            if (!scene) return result;
            const ch = scene.children;
            for (let i = 0; i < ch.length; i++) {
                if (ch[i].userData.isFamilyMember || ch[i].userData.type === 'family') result.push(ch[i]);
            }
            return result;
        };

        // Camera positions for the rush sequence
        const camOnBuilding = new THREE.Vector3(-40, 14, -140); // wide shot: player + family + building
        const camLookBuilding = new THREE.Vector3(-40, 1, -155);
        const carPos = new THREE.Vector3(LOCATIONS.ESCAPE_CAR.x, 0, LOCATIONS.ESCAPE_CAR.z);

        // ── EP.RUSH_TO_NATHALIE ─────────────────────────────────────────────
        if (ep === EP.RUSH_TO_NATHALIE) {
            // Lock camera on wide shot showing player, family, and building
            if (elapsed < 100 && events.setCameraOverride) {
                events.setCameraOverride({
                    active: true,
                    targetPos: camOnBuilding,
                    lookAtPos: camLookBuilding,
                    endTime: renderTime + 60000
                });
            }

            // Move all following family members toward the dealership entrance
            const family = getFamilyMembers();
            const buildingPos = _vS3a.set(
                LOCATIONS.POIS.SHED.x,
                0,
                LOCATIONS.POIS.SHED.z - 5  // just in front of the door
            );
            let allInside = true;
            for (let i = 0; i < family.length; i++) {
                const fm = family[i];
                if (!fm.position) continue;
                // Stop normal FamilySystem from controlling them
                fm.userData.overrideFollowing = true;
                _vS3b.subVectors(buildingPos, fm.position);
                const dist = _vS3b.length();
                if (dist > 1.0) {
                    allInside = false;
                    _vS3b.normalize();
                    const rushSpeed = 6.0 * delta; // faster than walk
                    fm.position.addScaledVector(_vS3b, Math.min(rushSpeed, dist));
                    fm.lookAt(buildingPos);

                    // Animate body
                    const body = fm.userData.cachedBody || fm.children.find((c: any) => c.userData.isBody);
                    fm.userData.cachedBody = body;
                    if (body) {
                        PlayerAnimator.update(body, {
                            isMoving: true, isRushing: true, isDodging: false, dodgeStartTime: 0,
                            staminaRatio: 1.0, isSpeaking: false, isThinking: false, isIdleLong: false,
                            isSwimming: false, isWading: false, seed: fm.userData.seed || 0,
                            renderTime, simTime
                        }, renderTime);
                    }
                } else {
                    // Hide them once at the door (they've "entered")
                    fm.visible = false;
                }
            }

            if (allInside && elapsed > 500) {
                // All family inside — wait 1000 ms then reset camera & give control back
                if (elapsed > 1500) {
                    sectorState.epilogueState = EP.AWAIT_INSIDE;
                    sectorState.epilogueTimer = simTime;
                    if (events.setCameraOverride) events.setCameraOverride(null);
                    window.dispatchEvent(new CustomEvent('show_hud'));
                }
            }
        }

        // ── EP.AWAIT_INSIDE ─────────────────────────────────────────────────
        else if (ep === EP.AWAIT_INSIDE) {
            // Player has 2000 ms of free control — then SPAWN_BOSS is handled by dialogue system already
            if (elapsed > 2000) {
                sectorState.epilogueState = EP.BOSS_FIGHT;
                sectorState.epilogueTimer = simTime;
            }
        }

        // EP.BOSS_FIGHT — just wait for bossDefeatedTime signal (handled above)

        // ── EP.FAMILY_EXIT ──────────────────────────────────────────────────
        else if (ep === EP.FAMILY_EXIT) {
            // Aim camera at the building exit
            if (elapsed < 100 && events.setCameraOverride) {
                events.setCameraOverride({
                    active: true,
                    targetPos: camOnBuilding,
                    lookAtPos: camLookBuilding,
                    endTime: renderTime + 60000
                });
                window.dispatchEvent(new CustomEvent('hide_hud'));
            }

            const family = getFamilyMembers();

            // Reveal all family members and walk them out of the building
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
                        PlayerAnimator.update(body, {
                            isMoving: true, isRushing: false, isDodging: false, dodgeStartTime: 0,
                            staminaRatio: 1.0, isSpeaking: false, isThinking: false, isIdleLong: false,
                            isSwimming: false, isWading: false, seed: fm.userData.seed || 0, renderTime, simTime
                        }, renderTime);
                    }
                }
            }

            if (allOut && elapsed > 300) {
                sectorState.epilogueState = EP.PLAYER_WALK;
                sectorState.epilogueTimer = simTime;
                // Store player's boss-kill position so Robert walks FROM there
                sectorState.robertWalkStart = playerPos.clone();
            }
        }

        // ── EP.PLAYER_WALK ──────────────────────────────────────────────────
        else if (ep === EP.PLAYER_WALK) {
            // Robert's mesh is the playerGroup — move it toward the reunion centre
            const center = _vS3a.set(LOCATIONS.REUNION_CENTER.x, 0, LOCATIONS.REUNION_CENTER.z);
            _vS3b.subVectors(center, playerPos);
            const dist = _vS3b.length();
            if (dist > 1.5) {
                _vS3b.normalize();
                // We can't directly teleport playerPos (read-only snapshot), but we can
                // signal the camera and let the FamilySystem form the ring early.
                // The player retains control but we orient the camera.
            }
            // Wait for player to walk close enough OR timeout
            if (dist < 4.0 || elapsed > 5000) {
                sectorState.epilogueState = EP.RING_FORM;
                sectorState.epilogueTimer = simTime;
            }
        }

        // ── EP.RING_FORM ────────────────────────────────────────────────────
        else if (ep === EP.RING_FORM) {
            const cx = LOCATIONS.REUNION_CENTER.x;
            const cz = LOCATIONS.REUNION_CENTER.z;
            const family = getFamilyMembers();
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
                // Face the centre
                fm.lookAt(cx, 0, cz);
                const body = fm.userData.cachedBody || fm.children.find((c: any) => c.userData.isBody);
                if (body) {
                    PlayerAnimator.update(body, {
                        isMoving: dist > 0.3, isRushing: false, isDodging: false, dodgeStartTime: 0,
                        staminaRatio: 1.0, isSpeaking: false, isThinking: false, isIdleLong: false,
                        isSwimming: false, isWading: false, seed: fm.userData.seed || 0, renderTime, simTime
                    }, renderTime);
                }
            }

            if ((allFormed || elapsed > 3000) && elapsed > 500) {
                sectorState.epilogueState = EP.CELEBRATE;
                sectorState.epilogueTimer = simTime;
                sectorState.cheerSoundPlayed = false;
            }
        }

        // ── EP.CELEBRATE (3000 ms) ──────────────────────────────────────────
        else if (ep === EP.CELEBRATE) {
            if (!sectorState.cheerSoundPlayed) {
                sectorState.cheerSoundPlayed = true;
                audioEngine.playSound(SoundID.VO_FAMILY_CHEER, 0.9);
                audioEngine.playSound(SoundID.UI_VICTORY, 0.5);
            }

            const family = getFamilyMembers();
            for (let i = 0; i < family.length; i++) {
                const fm = family[i];
                const body = fm.userData.cachedBody || fm.children.find((c: any) => c.userData.isBody);
                if (body) {
                    PlayerAnimator.update(body, {
                        isMoving: false, isRushing: false, isDodging: false, dodgeStartTime: 0,
                        staminaRatio: 1.0, isSpeaking: true, isCelebrating: true, isThinking: false, isIdleLong: false,
                        isSwimming: false, isWading: false, seed: fm.userData.seed || 0, renderTime, simTime
                    }, renderTime);
                }
            }

            if (elapsed > 3000) {
                sectorState.epilogueState = EP.HUG;
                sectorState.epilogueTimer = simTime;
                sectorState.kissSoundPlayed = false;
            }
        }

        // ── EP.HUG ──────────────────────────────────────────────────────────
        else if (ep === EP.HUG) {
            if (!sectorState.kissSoundPlayed) {
                sectorState.kissSoundPlayed = true;
                audioEngine.playSound(SoundID.VO_FAMILY_KISS, 0.85);
            }

            const family = getFamilyMembers();
            for (let i = 0; i < family.length; i++) {
                const fm = family[i];
                const body = fm.userData.cachedBody || fm.children.find((c: any) => c.userData.isBody);
                if (body) {
                    PlayerAnimator.update(body, {
                        isMoving: false, isRushing: false, isDodging: false, dodgeStartTime: 0,
                        staminaRatio: 1.0, isSpeaking: false, isHugging: true, isThinking: false, isIdleLong: false,
                        isSwimming: false, isWading: false, seed: fm.userData.seed || 0, renderTime, simTime
                    }, renderTime);
                }
            }

            // After hug, zoom camera to the escape car
            if (elapsed > 3500) {
                sectorState.epilogueState = EP.CAR_ZOOM;
                sectorState.epilogueTimer = simTime;

                // Activate the escape car interaction
                if (scene) {
                    const escapeCar = scene.getObjectByName('s3_escape_car');
                    if (escapeCar) {
                        escapeCar.userData.isInteractable = true;
                        // Re-register with collision grid
                        SectorBuilder.addInteractable(
                            (sectorState.ctx || null),
                            escapeCar,
                            {
                                id: 's3_escape_car',
                                type: InteractionType.VEHICLE,
                                label: 'ui.interact_enter_car',
                                radius: 4.0
                            }
                        );
                    }
                }
            }
        }

        // ── EP.CAR_ZOOM (1500 ms) ────────────────────────────────────────────
        else if (ep === EP.CAR_ZOOM) {
            if (elapsed < 100 && events.setCameraOverride) {
                // Pan camera to frame the escape car
                const carCamPos = carPos.clone().add(new THREE.Vector3(0, 8, 10));
                events.setCameraOverride({
                    active: true,
                    targetPos: carCamPos,
                    lookAtPos: carPos,
                    endTime: renderTime + 1700
                });
            }

            if (elapsed > 1500) {
                sectorState.epilogueState = EP.DRIVE;
                sectorState.epilogueTimer = simTime;
                // Return camera control to player and show HUD
                if (events.setCameraOverride) events.setCameraOverride(null);
                window.dispatchEvent(new CustomEvent('show_hud'));
                // Player can now interact with the car
            }
        }

        // ── EP.DRIVE (5000 ms) ───────────────────────────────────────────────
        else if (ep === EP.DRIVE) {
            // After 5 seconds of driving, trigger the sector report
            if (elapsed > 5000 && !sectorState.epilogueDone) {
                sectorState.epilogueDone = true;
                sectorState.epilogueState = EP.DONE;
                // Drive into the sunset — trigger ScreenSectorReport (final epilogue screen)
                events.onAction([
                    { type: 'CONCLUDE_SECTOR', payload: { isExtraction: true } }
                ]);
            }
        }
    }
};

function spawnSectorHordes(ctx: SectorContext) {
    if (!ctx.spawnHorde) return;

    const hordeSpots = [
        new THREE.Vector3(0, 0, -50),
        new THREE.Vector3(-20, 0, -130),
        new THREE.Vector3(30, 0, -200),
        new THREE.Vector3(80, 0, -80),
        new THREE.Vector3(-80, 0, -80)
    ];

    for (let i = 0; i < hordeSpots.length; i++) {
        const count = 6 + Math.floor(ctx.rng() * 4);
        ctx.spawnHorde(count, undefined, hordeSpots[i]);
    }
}