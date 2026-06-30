import * as THREE from 'three';
import { SectorDef, SectorBuildContext, ChestType, SectorEvent, SectorEventState, SectorEventConstraint, BossID } from '../../game/session/SectorTypes';
import { GroundType } from '../../core/engine/EnvironmentalTypes';
import { t } from '../../utils/i18n';
import { SectorBuilder } from '../../core/world/SectorBuilder';
import { PathGenerator } from '../../core/world/generators/PathGenerator';
import { SoundID } from '../../utils/audio/AudioTypes';
import { VEGETATION_TYPE } from '../../content/environment';
import { VehicleID } from '../../entities/vehicles/VehicleTypes';
import { CAMERA_HEIGHT } from '../constants';
import { EnemyType, EnemyDeathState } from '../../entities/enemies/EnemyTypes';
import { FamilyMemberID } from '../constants';
import { PoiType, PoiID } from '../../content/pois';
import { ClueID } from '../../content/clues';
import { CollectibleID } from '../../content/collectibles';
import { TriggerType, TriggerActionType, TriggerStatus } from '../../types/TriggerTypes';
import { WeatherType } from '../../core/engine/EnvironmentalTypes';
import { MATERIALS } from '../../utils/assets';
import { ColliderType } from '../../core/world/CollisionResolution';
import { FXParticleType } from '../../types/FXTypes';
import { SectorEventID } from '../sector_events';

const LOCATIONS = {
    SPAWN: {
        PLAYER: { x: 0, z: 0, rot: Math.PI / 1.35 },
        //PLAYER: { x: 145, z: -70 },
        FAMILY: { x: 215, z: -25 },
        BOSS: { x: 192, z: -40 }
    },
    CINEMATIC: {
        OFFSET: { x: 15, y: 15, z: -10 },
        LOOK_AT: { x: 0, y: 2, z: 0 }
    },
    COLLECTIBLES: {
        C1: { x: 275, z: -180 },
        C2: { x: 215, z: -25 }
    },
    TRIGGERS: {
        FOREST_AMBIENT: { x: 20, z: -18 },
        POI_MAST: { x: 215, z: -25 },
        FOUND_ESMERALDA: { x: 215, z: -25 }
    },
    POIS: {
        FARM: { x: 150, z: -120 },
        EGG_FARM: { x: 275, z: -175 },
        BARN: { x: 305, z: -150 },
        MAST: { x: 215, z: -25 },
    },
    PATHS: {
        FOREST_TRAIL: [
            new THREE.Vector3(-17, 0, 31),
            new THREE.Vector3(-14, 0, 21),
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(40, 0, -30),
            new THREE.Vector3(80, 0, -10),
            new THREE.Vector3(120, 0, -50),
            new THREE.Vector3(125, 0, -79),
        ],
        HAGLAREDSVAGEN: [
            new THREE.Vector3(64, 0, -83),
            new THREE.Vector3(140, 0, -83),
            new THREE.Vector3(180, 0, -120),
            new THREE.Vector3(250, 0, -150),
            new THREE.Vector3(320, 0, -120),
            new THREE.Vector3(400, 0, -80),
        ],
        ROAD_TO_MAST: [
            new THREE.Vector3(300, 0, -130),
            new THREE.Vector3(289, 0, -92),
            new THREE.Vector3(245, 0, -75),
            new THREE.Vector3(220, 0, -71),
            new THREE.Vector3(216, 0, -54),
        ],
        FARM_PATH: [
            new THREE.Vector3(159, 0, -142),
            new THREE.Vector3(176, 0, -166),
            new THREE.Vector3(212, 0, -190),
            new THREE.Vector3(255, 0, -183),
        ]
    }
} as const;

// ─── Zero-GC Scratchpads ──────────────────────────────────────────────────────
const _vS2 = new THREE.Vector3();

// Camera cutscene scratch variables (Zero-GC)
const _camStartPos = new THREE.Vector3();
const _camStartLookAt = new THREE.Vector3();
const _tempV1 = new THREE.Vector3();
const _tempV2 = new THREE.Vector3();
const _tempV3 = new THREE.Vector3();

// Mast light

const KEYS = {
    mastEventState: 'state',
    mastEventTimer: 'timer',
} as const;

const esmeraldaMissionEvent: SectorEvent = {
    id: 'esmeralda_mission',
    onStart: (ctx, eventState) => {
        eventState[KEYS.mastEventState] = 0;
        eventState[KEYS.mastEventTimer] = 0;

        // Make gate immune initially
        const gate = ctx.sectorState.gateObstacle;
        if (gate) {
            gate.durability = undefined;
        }

        const enemyWaveSystem = ctx.engine.systems.enemyWave;
        if (enemyWaveSystem) {
            const mastPos = LOCATIONS.POIS.MAST;
            const spawns: Array<{ type: EnemyType; pos: { x: number; z: number } }> = [];
            const mastZombieTypes = [
                EnemyType.WALKER, EnemyType.WALKER, EnemyType.WALKER, EnemyType.WALKER, EnemyType.WALKER,
                EnemyType.WALKER, EnemyType.WALKER, EnemyType.WALKER, EnemyType.WALKER, EnemyType.WALKER,
                EnemyType.RUNNER, EnemyType.RUNNER, EnemyType.RUNNER, EnemyType.RUNNER, EnemyType.RUNNER,
                EnemyType.RUNNER, EnemyType.RUNNER, EnemyType.RUNNER,
                EnemyType.TANK, EnemyType.TANK
            ];
            for (let i = 0; i < mastZombieTypes.length; i++) {
                const angle = (i / mastZombieTypes.length) * Math.PI * 2;
                const radius = 8 + Math.random() * 18;
                const offX = Math.cos(angle) * radius;
                const offZ = Math.sin(angle) * radius;
                spawns.push({
                    type: mastZombieTypes[i],
                    pos: { x: mastPos.x + offX, z: mastPos.z + offZ }
                });
            }
            (ctx.sectorState as any).waveSpawns = spawns;

            enemyWaveSystem.startWaveChain([{
                name: 'Sector 2 Mast Compound',
                disabled: true,
                spawns: spawns,
                attractorPos: { x: mastPos.x, z: mastPos.z }
            }], {
                onWaveComplete: () => {
                    eventState[KEYS.mastEventState] = 5;
                    eventState[KEYS.mastEventTimer] = ctx.simTime;
                    if (ctx.setBubble) {
                        ctx.setBubble(ctx.t('sector_events.2.2.reaction'), 3000);
                    }
                }
            });
        }
    },
    onUpdate: (ctx, eventState) => {
        const { delta, simTime, renderTime, playerPos, gameState, engine } = ctx;
        const triggerSystem = engine.systems.triggerSystem;
        const sectorState = gameState.sectorState;
        let mask = SectorEventConstraint.NONE;

        if (!eventState[KEYS.mastEventState]) eventState[KEYS.mastEventState] = 0;
        const mes = eventState[KEYS.mastEventState];
        const mesTimer = eventState[KEYS.mastEventTimer] || 0;
        const mesElapsed = simTime - mesTimer;

        const mastX = LOCATIONS.POIS.MAST.x;
        const mastZ = LOCATIONS.POIS.MAST.z;
        const mastPos = LOCATIONS.POIS.MAST;

        const scene = ctx.scene;

        if (mes === 0) {
            // Step 1: Reaching the mast triggers a speaking ChatBubble for 'pois.2.0.reaction'
            const playerDist = _tempV1.set(playerPos.x, 0, playerPos.z).distanceTo(_tempV2.set(mastPos.x, 0, mastPos.z));
            if (playerDist < 40) {
                if (ctx.setBubble) {
                    ctx.setBubble('pois.2.0.reaction', (2 << 16) | 3000); // 2 is ChatBubbleSubtype.SPEAK
                }
                eventState[KEYS.mastEventState] = 1;
                eventState[KEYS.mastEventTimer] = simTime;
            }
        }
        else if (mes === 1) {
            // Wait for ChatBubble to finish before starting camera handling
            if (mesElapsed > 2000) {
                _camStartPos.copy(engine.camera.position);
                if (engine.camera.lookAtTarget) {
                    _camStartLookAt.copy(engine.camera.lookAtTarget);
                } else {
                    _camStartLookAt.set(playerPos.x, 0, playerPos.z);
                }
                engine.camera.setCinematic(true);
                gameState.ui.cinematicActive = true;
                eventState[KEYS.mastEventState] = 2;
                eventState[KEYS.mastEventTimer] = simTime;
            }
        }
        else if (mes === 2) {
            // Steps 2 & 3: Camera flies up to the top of the mast, settles/pans, flies down quickly, and pans compound
            const basePos = _tempV1.set(mastPos.x - 15, 5, mastPos.z + 15);
            const topPos = _tempV2.set(mastPos.x - 10, 65, mastPos.z + 10);
            const lookAtTop = _tempV3.set(mastPos.x, 60, mastPos.z);

            if (mesElapsed < 1500) {
                // Phase 1: Fly to base
                const p = mesElapsed / 1500;
                const smoothP = THREE.MathUtils.smoothstep(p, 0, 1);
                engine.camera.setPosition(
                    THREE.MathUtils.lerp(_camStartPos.x, basePos.x, smoothP),
                    THREE.MathUtils.lerp(_camStartPos.y, basePos.y, smoothP),
                    THREE.MathUtils.lerp(_camStartPos.z, basePos.z, smoothP)
                );
                engine.camera.lookAt(
                    _tempV3.set(
                        THREE.MathUtils.lerp(_camStartLookAt.x, mastPos.x, smoothP),
                        THREE.MathUtils.lerp(_camStartLookAt.y, 2, smoothP),
                        THREE.MathUtils.lerp(_camStartLookAt.z, mastPos.z, smoothP)
                    )
                );
            }
            else if (mesElapsed < 3500) {
                // Phase 2: Fly to top
                const p = (mesElapsed - 1500) / 2000;
                const smoothP = THREE.MathUtils.smoothstep(p, 0, 1);
                engine.camera.setPosition(
                    THREE.MathUtils.lerp(basePos.x, topPos.x, smoothP),
                    THREE.MathUtils.lerp(basePos.y, topPos.y, smoothP),
                    THREE.MathUtils.lerp(basePos.z, topPos.z, smoothP)
                );
                engine.camera.lookAt(
                    _tempV3.set(
                        THREE.MathUtils.lerp(mastPos.x, lookAtTop.x, smoothP),
                        THREE.MathUtils.lerp(2, lookAtTop.y, smoothP),
                        THREE.MathUtils.lerp(mastPos.z, lookAtTop.z, smoothP)
                    )
                );
            }
            else if (mesElapsed < 11500) {
                // Phase 3: Settle at the top and pan around (8000 ms = 2000 ms longer than original 6000 ms)
                const circleElapsed = mesElapsed - 3500;
                const angle = circleElapsed * 0.0005;
                const radius = 15;
                const focusPosX = lookAtTop.x + Math.sin(angle) * radius;
                const focusPosY = lookAtTop.y + 5;
                const focusPosZ = lookAtTop.z + Math.cos(angle) * radius;

                engine.camera.setPosition(focusPosX, focusPosY, focusPosZ);
                engine.camera.lookAt(lookAtTop);
            }
            else if (mesElapsed < 12000) {
                // Phase 4: Quickly fly down (~500 ms) to the base of the mast
                const lastAngle = 8000 * 0.0005;
                const lastPosX = lookAtTop.x + Math.sin(lastAngle) * 15;
                const lastPosY = lookAtTop.y + 5;
                const lastPosZ = lookAtTop.z + Math.cos(lastAngle) * 15;

                const p = (mesElapsed - 11500) / 500;
                const smoothP = THREE.MathUtils.smoothstep(p, 0, 1);
                engine.camera.setPosition(
                    THREE.MathUtils.lerp(lastPosX, basePos.x, smoothP),
                    THREE.MathUtils.lerp(lastPosY, basePos.y, smoothP),
                    THREE.MathUtils.lerp(lastPosZ, basePos.z, smoothP)
                );
                engine.camera.lookAt(
                    _tempV3.set(
                        THREE.MathUtils.lerp(lookAtTop.x, mastPos.x, smoothP),
                        THREE.MathUtils.lerp(lookAtTop.y, 2, smoothP),
                        THREE.MathUtils.lerp(lookAtTop.z, mastPos.z, smoothP)
                    )
                );
            }
            else if (mesElapsed < 15000) {
                // Phase 5: Fly over compound showing base/building/enemies for 3000 ms
                const p = (mesElapsed - 12000) / 3000;
                const smoothP = THREE.MathUtils.smoothstep(p, 0, 1);
                engine.camera.setPosition(
                    THREE.MathUtils.lerp(basePos.x, mastPos.x - 25, smoothP),
                    THREE.MathUtils.lerp(basePos.y, 15, smoothP),
                    THREE.MathUtils.lerp(basePos.z, mastPos.z - 15, smoothP)
                );
                engine.camera.lookAt(
                    _tempV3.set(
                        THREE.MathUtils.lerp(mastPos.x, mastPos.x, smoothP),
                        2,
                        THREE.MathUtils.lerp(mastPos.z, mastPos.z - 15, smoothP)
                    )
                );
            }
            else if (mesElapsed < 16000) {
                // Phase 6: Return smoothly to player camera (1000 ms)
                const p = (mesElapsed - 15000) / 1000;
                const smoothP = THREE.MathUtils.smoothstep(p, 0, 1);
                const targetX = playerPos.x;
                const targetY = playerPos.y + CAMERA_HEIGHT;
                const targetZ = playerPos.z + 40;

                engine.camera.setPosition(
                    THREE.MathUtils.lerp(mastPos.x - 25, targetX, smoothP),
                    THREE.MathUtils.lerp(15, targetY, smoothP),
                    THREE.MathUtils.lerp(mastPos.z - 15, targetZ, smoothP)
                );
                engine.camera.lookAt(
                    _tempV3.set(
                        THREE.MathUtils.lerp(mastPos.x, playerPos.x, smoothP),
                        THREE.MathUtils.lerp(2, playerPos.y, smoothP),
                        THREE.MathUtils.lerp(mastPos.z - 15, playerPos.z, smoothP)
                    )
                );
            }
            else {
                // End camera override, restore player control
                engine.camera.setCinematic(false);
                gameState.ui.cinematicActive = false;

                // Step 4: Now the destroyable gate can take damage
                const gate = sectorState.gateObstacle;
                if (gate) {
                    gate.durability = 120;
                }

                eventState[KEYS.mastEventState] = 3;
                eventState[KEYS.mastEventTimer] = simTime;
            }
        }
        else if (mes === 3) {
            // Wait for the gate to be destroyed
            const gate = sectorState.gateObstacle;
            if (!gate || gate.isMutated || gate.durability <= 0) {
                // Step 5: EnemyWave gets enabled (handled via gate's onDestroyObject callback)
                eventState[KEYS.mastEventState] = 4;
                eventState[KEYS.mastEventTimer] = simTime;
            }
        }
        else if (mes === 4) {
            // Wait for the EnemyWave to be defeated
            if (sectorState && !sectorState.waveActive) {
                eventState[KEYS.mastEventState] = 5;
                eventState[KEYS.mastEventTimer] = simTime;
            }
        }
        else if (mes === 5) {
            // Step 6: Trigger the dialogue with Esmeralda. Esmeralda gets rescued and starts following.
            if (mesElapsed > 1500 && scene) {
                if (!sectorState.esmeraldaMesh) {
                    sectorState.esmeraldaMesh = scene.children.find(
                        (c: any) => (c.userData.isFamilyMember || c.userData.type === 'family') && c.userData.name === 'Esmeralda'
                    );
                }
                const esmeralda = sectorState.esmeraldaMesh as any;

                if (esmeralda) {
                    if (!sectorState.esmeraldaWalkTarget) {
                        _vS2.set(mastX, 0, mastZ + 20);
                        sectorState.esmeraldaWalkTarget = _vS2.clone();
                    }

                    esmeralda.position.lerp(sectorState.esmeraldaWalkTarget, 0.04);

                    // Update camera override to follow Esmeralda
                    if (ctx.setCameraOverride) {
                        ctx.setCameraOverride({
                            active: true,
                            targetPos: new THREE.Vector3(esmeralda.position.x - 8, esmeralda.position.y + 12, esmeralda.position.z + 18),
                            lookAtPos: esmeralda.position.clone(),
                            endTime: simTime + 100
                        });
                    }

                    if (esmeralda.position.distanceTo(sectorState.esmeraldaWalkTarget) < 2.0) {
                        eventState[KEYS.mastEventState] = 55;
                        eventState[KEYS.mastEventTimer] = simTime;

                        if (ctx.setCameraOverride) {
                            ctx.setCameraOverride(null);
                        }
                    }
                } else {
                    if (mesElapsed > 5000) {
                        eventState[KEYS.mastEventState] = 55;
                        eventState[KEYS.mastEventTimer] = simTime;
                    }
                }
            }
        }
        else if (mes === 55) {
            // Wait for player to get close to Esmeralda
            if (scene) {
                const esmeralda = sectorState.esmeraldaMesh || scene.children.find(
                    (c: any) => (c.userData.isFamilyMember || c.userData.type === 'family') && c.userData.name === 'Esmeralda'
                );
                if (esmeralda) {
                    const dist = playerPos.distanceTo(esmeralda.position);
                    if (dist < 4.0) {
                        eventState[KEYS.mastEventState] = 6;
                        eventState[KEYS.mastEventTimer] = simTime;

                        if (ctx.startCinematic) {
                            ctx.startCinematic(esmeralda, 2, 0); // Sector 2, Dialogue 0
                        }

                        const idx = triggerSystem.getTriggerById(FamilyMemberID.ESMERALDA, TriggerType.EVENT);
                        if (idx !== -1) {
                            triggerSystem.setStatusFlag(idx, TriggerStatus.ACTIVE, true);
                            triggerSystem.setStatusFlag(idx, TriggerStatus.TRIGGERED, false);
                        }
                    }
                }
            }
        }
        else if (mes === 6) {
            // Wait for the cinematic dialogue to finish. Boss intro starts as a consequence.
            if (!gameState.ui.cinematicActive) {
                eventState[KEYS.mastEventState] = 7;
                eventState[KEYS.mastEventTimer] = simTime;
            }
        }
        else if (mes === 7) {
            if (!sectorState.bossSpawned) {
                sectorState.bossSpawned = true;
                ctx.onAction({ type: TriggerActionType.SPAWN_BOSS, payload: { bossId: BossID.SECTOR_2 } });
            }
        }

        // Apply cinematic active constraint flags
        if (mes === 1 || mes === 2 || mes === 6 || gameState.ui.cinematicActive) {
            mask |= SectorEventConstraint.DISABLE_INPUT | SectorEventConstraint.DISABLE_TELEPORT | SectorEventConstraint.HIDE_HUD;
        }

        return mask;
    },
    onPlayerRespawn: (ctx, state, engine, eventState) => {
        // If checkpoint is active for Esmeralda, player respawns at boss (gate is already destroyed)
        const isBossCheckpoint = state.checkpoint && state.checkpoint.active && state.checkpoint.familyMemberId === FamilyMemberID.ESMERALDA;
        if (isBossCheckpoint) {
            eventState[KEYS.mastEventState] = 7;
            eventState[KEYS.mastEventTimer] = engine.simTime;
            state.sectorState.bossSpawned = false; // Reset so boss spawns again
            return;
        }

        // Otherwise reset everything back to start
        eventState[KEYS.mastEventState] = 0;
        eventState[KEYS.mastEventTimer] = 0;
        state.sectorState.waveActive = false;
        state.sectorState.waveDisabled = false;
        state.sectorState.esmeraldaWalkTarget = null;
        state.sectorState.bossSpawned = false;

        const gate = state.sectorState.gateObstacle;
        if (gate) {
            gate.durability = undefined; // starts immune again
            if (gate.isMutated) {
                gate.isMutated = false;
                if (gate.mesh) gate.mesh.visible = true;
                const streamer = engine.systems.worldStreamer;
                if (streamer) {
                    streamer.registerObstacle(gate);
                }
            }
        }

        const enemyWaveSystem = engine.systems.enemyWave;
        if (enemyWaveSystem) {
            enemyWaveSystem.reset();
            const spawns = state.sectorState.waveSpawns;
            if (spawns) {
                const mastPos = LOCATIONS.POIS.MAST;
                enemyWaveSystem.startWaveChain([{
                    name: 'Sector 2 Mast Compound',
                    disabled: true,
                    spawns: spawns,
                    attractorPos: { x: mastPos.x, z: mastPos.z }
                }], {
                    onWaveComplete: () => {
                        eventState[KEYS.mastEventState] = 5;
                        eventState[KEYS.mastEventTimer] = engine.simTime;
                    }
                });
            }
        }
    }
};

export const Sector2: SectorDef = {
    id: 2,
    environment: {
        bgColor: 0x051015,
        fog: {
            density: 200,
            color: 0x020208,
            height: 10
        },
        groundColor: 0x112211,
        ambient: 0.5,
        fov: 50,
        sky: {
            time: 0.2,
            atmosphereColor: 0x051015,
            hemi: {
                skyColor: 0x1a2e3a,   // Cool rain-cloud teal — overcast night sky fill
                groundColor: 0x1a1a12, // Muted wet earth tone
                intensity: 0.6
            },
            celestial: {
                radius: 10,
                color: 0xffffff,
                position: { x: 50, y: 35, z: 50 }
            },
            light: {
                visible: true,
                color: 0x88ffaa,
                intensity: 0.6,
                castShadow: true
            }
        },
        cameraOffsetZ: 40,
        cameraHeight: CAMERA_HEIGHT,
        weather: {
            type: WeatherType.RAIN,
            particles: 3000
        },
        wind: {
            strengthMin: 0.5,
            strengthMax: 1.0,
            //direction: { x: 1, z: 1 },
            angleVariance: Math.PI / 4
        }
    },

    // Set to SNOW as requested for clear visual debugging
    ground: GroundType.SNOW,
    ambientLoop: SoundID.AMBIENT_CAVE,

    playerSpawn: LOCATIONS.SPAWN.PLAYER,
    bossSpawn: LOCATIONS.SPAWN.BOSS,

    collectibles: [
        { id: CollectibleID.S2_COLLECTIBLE_1, x: LOCATIONS.COLLECTIBLES.C1.x, z: LOCATIONS.COLLECTIBLES.C1.z },
        { id: CollectibleID.S2_COLLECTIBLE_2, x: LOCATIONS.COLLECTIBLES.C2.x, z: LOCATIONS.COLLECTIBLES.C2.z }
    ],

    setupProps: async (ctx: SectorBuildContext) => {
        const { scene } = ctx;

        let startTime = performance.now();
        const yieldIfBudgetExceeded = async () => {
            if (performance.now() - startTime > 12) {
                if (ctx.yield) await ctx.yield();
                startTime = performance.now();
            }
        };

        // --- 1. PATHS AND SPLINES ---
        const trailCurve = await PathGenerator.createDirtPath(ctx, [...LOCATIONS.PATHS.FOREST_TRAIL], 3);
        await yieldIfBudgetExceeded();
        const hagCurve = await PathGenerator.createGravelRoad(ctx, [...LOCATIONS.PATHS.HAGLAREDSVAGEN], 6);
        await yieldIfBudgetExceeded();
        await PathGenerator.createGravelRoad(ctx, [...LOCATIONS.PATHS.ROAD_TO_MAST], 6);
        await yieldIfBudgetExceeded();

        // Rocks around the mast
        SectorBuilder.spawnRock(ctx, 223, -93, 20, 15);
        SectorBuilder.spawnRock(ctx, 224, -90, 15, 25);
        SectorBuilder.spawnRock(ctx, 211, -80, 22, 10);
        SectorBuilder.spawnRock(ctx, 203, -62, 11, 18);
        SectorBuilder.spawnRock(ctx, 233, -64, 10, 8);
        SectorBuilder.spawnRock(ctx, 233, -64, 10, 8);

        // Farm path bending SOUTH
        const farmCurve = await PathGenerator.createDirtPath(ctx, [...LOCATIONS.PATHS.FARM_PATH], 3);
        await yieldIfBudgetExceeded();

        const gravelGeo = new THREE.CylinderGeometry(25, 25, 0.1, 16);
        const gravelMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 1.0 });

        const farmGravel = new THREE.Mesh(gravelGeo, gravelMat);
        farmGravel.position.set(LOCATIONS.POIS.FARM.x, 0.02, LOCATIONS.POIS.FARM.z);
        farmGravel.receiveShadow = true;
        scene.add(farmGravel);

        const fhGravel = new THREE.Mesh(gravelGeo, gravelMat);
        fhGravel.position.set(LOCATIONS.POIS.EGG_FARM.x, 0.02, LOCATIONS.POIS.EGG_FARM.z);
        fhGravel.receiveShadow = true;
        scene.add(fhGravel);

        await SectorBuilder.spawnChest(ctx, LOCATIONS.SPAWN.BOSS.x, LOCATIONS.SPAWN.BOSS.z, ChestType.BIG);
        await yieldIfBudgetExceeded();

        // --- 2. BUILDINGS & PROPS ---
        // POI - Farm
        await SectorBuilder.spawnPoi(ctx, PoiType.FARM, LOCATIONS.POIS.FARM.x, LOCATIONS.POIS.FARM.z, (3 * Math.PI) / 4);
        await yieldIfBudgetExceeded();

        await SectorBuilder.spawnDeadBody(ctx, LOCATIONS.POIS.FARM.x + 5, LOCATIONS.POIS.FARM.z + 5, EnemyType.WALKER, Math.random() * Math.PI);
        await SectorBuilder.spawnDeadBody(ctx, LOCATIONS.POIS.FARM.x - 5, LOCATIONS.POIS.FARM.z + 10, EnemyType.RUNNER, Math.random() * Math.PI);
        await SectorBuilder.spawnDeadBody(ctx, LOCATIONS.POIS.FARM.x + 10, LOCATIONS.POIS.FARM.z - 5, EnemyType.TANK, Math.random() * Math.PI);
        await yieldIfBudgetExceeded();

        await SectorBuilder.spawnDriveableVehicle(ctx, LOCATIONS.POIS.FARM.x - 20, LOCATIONS.POIS.FARM.z + 5, (3 * Math.PI) / 2, VehicleID.TRACTOR);
        await SectorBuilder.spawnHaybale(ctx, LOCATIONS.POIS.FARM.x + 15, LOCATIONS.POIS.FARM.z - 5, Math.random() * Math.PI, 1.2);
        await SectorBuilder.spawnHaybale(ctx, LOCATIONS.POIS.FARM.x + 18, LOCATIONS.POIS.FARM.z - 2, Math.random() * Math.PI, 1.1);
        await SectorBuilder.spawnHaybale(ctx, LOCATIONS.POIS.FARM.x + 4, LOCATIONS.POIS.FARM.z - 8, Math.random() * Math.PI, 1.0);
        await yieldIfBudgetExceeded();

        // Timberpiles + timbertruck
        await SectorBuilder.spawnTimberPile(ctx, LOCATIONS.POIS.FARM.x - 15, LOCATIONS.POIS.FARM.z + 10, Math.PI / 4, 1.2);
        await SectorBuilder.spawnTimberPile(ctx, LOCATIONS.POIS.FARM.x - 12, LOCATIONS.POIS.FARM.z + 14, Math.PI / 3, 1.0);
        await SectorBuilder.spawnDriveableVehicle(ctx, 136, -92, -Math.PI / 3, VehicleID.TIMBER_TRUCK, 0x334433);
        await yieldIfBudgetExceeded();

        // POI - Egg farm
        await SectorBuilder.spawnPoi(ctx, PoiType.EGG_FARM, LOCATIONS.POIS.EGG_FARM.x, LOCATIONS.POIS.EGG_FARM.z, (3 * Math.PI) / 4);
        await SectorBuilder.spawnPoi(ctx, PoiType.BARN, LOCATIONS.POIS.BARN.x, LOCATIONS.POIS.BARN.z, (3 * Math.PI) / 4);
        await yieldIfBudgetExceeded();

        // Abandoned House 1: North of Farmhouse (Birch Forest)
        const house1Coords = { x: 350, z: -130 };
        await SectorBuilder.spawnBuilding(ctx, house1Coords.x, house1Coords.z, 12, 5, 12, Math.PI / 4, 0x445544, false);
        await SectorBuilder.spawnDeadBody(ctx, house1Coords.x + 5, house1Coords.z + 5, 'HUMAN', Math.random() * Math.PI);
        await yieldIfBudgetExceeded();

        // Abandoned House 2: South near boundary
        const house2Coords = { x: 310, z: -90 };
        await SectorBuilder.spawnBuilding(ctx, house2Coords.x, house2Coords.z, 15, 6, 15, -Math.PI / 3, 0x333333, false);
        await SectorBuilder.spawnDeadBody(ctx, house2Coords.x - 5, house2Coords.z - 5, 'HUMAN', Math.random() * Math.PI);
        await yieldIfBudgetExceeded();

        // --- 3. SPLINE-BASED PROCEDURAL VEGETATION ---
        const trailPts = trailCurve.getSpacedPoints(80);
        const hagPts = hagCurve.getSpacedPoints(120);
        const farmPathPts = farmCurve.getSpacedPoints(60);

        // --- 4.3 Forest ---
        const forestOffset = 7;
        const forestDepth = 35;

        // Strict filters: x < 115 stops before crossroads. z > -75 prevents bleeding onto Haglaredsvägen (z:-83).
        const filterTrailNorth = (points: THREE.Vector3[]) => points.filter(p => p.x < 115 && p.z > -75);
        const sprucePolyNorth = [
            ...filterTrailNorth(PathGenerator.getOffsetPoints(trailPts, -forestOffset)),
            ...filterTrailNorth(PathGenerator.getOffsetPoints(trailPts, -(forestOffset + forestDepth))).reverse()
        ];
        sprucePolyNorth.forEach(p => p.y = 0);
        await SectorBuilder.fillVegetation(ctx, [VEGETATION_TYPE.SPRUCE, VEGETATION_TYPE.PINE], sprucePolyNorth, 12);
        await yieldIfBudgetExceeded();

        // Dead trees
        const filterTrailSouth = (points: THREE.Vector3[]) => points.filter(p => p.x < 115);
        const deadTreePoly = [
            ...filterTrailSouth(PathGenerator.getOffsetPoints(trailPts, forestOffset)),
            ...filterTrailSouth(PathGenerator.getOffsetPoints(trailPts, forestOffset + forestDepth)).reverse()
        ];
        deadTreePoly.forEach(p => p.y = 0);
        await SectorBuilder.fillVegetation(ctx, [VEGETATION_TYPE.DEAD_TREE], deadTreePoly, 12);
        await yieldIfBudgetExceeded();

        // --- 4.4 Wheat Fields ---
        const wheatOffset = 7;
        const wheatDepth = 35;

        const wheatField1 = [
            new THREE.Vector3(112, 0, -86),
            new THREE.Vector3(112, 0, -120),
            new THREE.Vector3(77, 0, -120),
            new THREE.Vector3(77, 0, -88),
        ]
        await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.WHEAT, wheatField1, 0.4);
        await yieldIfBudgetExceeded();
        await SectorBuilder.createScarecrow(ctx, 100, -100);
        await yieldIfBudgetExceeded();

        const filterWheat2 = (points: THREE.Vector3[]) => points.filter(p => p.x > 170 && p.x < 240);
        const wheatPoly2 = [
            ...filterWheat2(PathGenerator.getOffsetPoints(hagPts, wheatOffset)),
            ...filterWheat2(PathGenerator.getOffsetPoints(hagPts, wheatOffset + wheatDepth)).reverse()
        ];
        wheatPoly2.forEach(p => p.y = 0);
        await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.WHEAT, wheatPoly2, 0.4);
        await yieldIfBudgetExceeded();
        await SectorBuilder.createScarecrow(ctx, 205, -135);
        await yieldIfBudgetExceeded();

        // 4.7 Flowers (Nested dynamically between Farm Path and Haglaredsvägen)
        const filterFlowersFarm = (points: THREE.Vector3[]) => points.filter(p => p.x > 160 && p.x < 250);
        const filterFlowersHag = (points: THREE.Vector3[]) => points.filter(p => p.x > 160 && p.x < 250);

        const flowerPoly = [
            ...filterFlowersFarm(PathGenerator.getOffsetPoints(farmPathPts, 4)),       // Outer south boundary of farm path
            ...filterFlowersHag(PathGenerator.getOffsetPoints(hagPts, -4)).reverse()   // Inner north boundary of Haglaredsvägen
        ];
        flowerPoly.forEach(p => p.y = 0);
        await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.FLOWER, flowerPoly, 0.9);
        await yieldIfBudgetExceeded();

        // 4.8 Sunflowers (Strictly SOUTH of Haglaredsvägen, East of Mast Road)
        const sunflowerPoly1 = [
            new THREE.Vector3(310, 0, -110),
            new THREE.Vector3(360, 0, -110),
            new THREE.Vector3(360, 0, -80),
            new THREE.Vector3(310, 0, -80)
        ];
        await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.SUNFLOWER, sunflowerPoly1, 0.4);
        await yieldIfBudgetExceeded();

        const sunflowerPoly2 = [
            new THREE.Vector3(310, 0, -70),
            new THREE.Vector3(360, 0, -70),
            new THREE.Vector3(360, 0, -40),
            new THREE.Vector3(310, 0, -40)
        ];
        await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.SUNFLOWER, sunflowerPoly2, 0.4);
        await yieldIfBudgetExceeded();

        // 4.4 Birch Forest (Wrapping North and East of House 1)
        const birchPolyL = [
            new THREE.Vector3(260, 0, -280),
            new THREE.Vector3(330, 0, -280),
            new THREE.Vector3(330, 0, -220),
            new THREE.Vector3(300, 0, -220),
            new THREE.Vector3(300, 0, -240),
            new THREE.Vector3(260, 0, -240)
        ];
        await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.BIRCH, birchPolyL, 15);
        await yieldIfBudgetExceeded();

        // 4.5 Dead Trees (soth & east the mast)
        const deadForestPoly = [
            new THREE.Vector3(185, 0, 16),
            new THREE.Vector3(185, 0, 50),
            new THREE.Vector3(285, 0, 50),
            new THREE.Vector3(302, 0, -60),
            new THREE.Vector3(270, 0, -70),
            new THREE.Vector3(252, 0, -67),
            new THREE.Vector3(245, 0, -46),
            new THREE.Vector3(245, 0, 16),
        ];
        await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.DEAD_TREE, deadForestPoly, 18);
        await yieldIfBudgetExceeded();

        // --- 4. LAKE & GRASS ---
        const lakeCoords = { x: 255, z: -117 };
        const lake = SectorBuilder.addLake(ctx, lakeCoords.x, lakeCoords.z, 25, 7.0);

        // Rock in the lake
        const rockInLake = SectorBuilder.spawnRock(ctx, lakeCoords.x - 20, lakeCoords.z + 10, 25, 25, 15);
        if (lake && rockInLake) lake.registerSplashSource(rockInLake);
        await yieldIfBudgetExceeded();

        // Boat
        const boatGroup = await SectorBuilder.spawnFloatableVehicle(ctx, lakeCoords.x - 12.5, lakeCoords.z, Math.random() * Math.PI);
        if (lake && boatGroup) {
            lake.registerFloatingProp(boatGroup);
            lake.registerSplashSource(boatGroup);
        }
        await yieldIfBudgetExceeded();

        // Sparse Grass (Stretching from South/East of Lake down to the Mast)
        const sparseGrassPoly = [
            new THREE.Vector3(90, 0, 50),
            new THREE.Vector3(180, 0, 40),
            new THREE.Vector3(220, 0, 5),   // Approaching mast
            new THREE.Vector3(180, 0, -10),
            new THREE.Vector3(120, 0, 10)
        ];
        await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.GRASS, sparseGrassPoly, 0.4);
        await yieldIfBudgetExceeded();

        // --- 5. MOUNTAIN BOUNDARY ---
        SectorBuilder.createMountain(ctx, [
            new THREE.Vector3(124, 0, 16),
            new THREE.Vector3(139, 0, -22),
            new THREE.Vector3(150, 0, -53),
            new THREE.Vector3(233, 0, -106)
        ], 10, 7);

        // Generate contiguous physical bounding boxes along the mountain's spline curve
        const mountainCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(124, 0, 16),
            new THREE.Vector3(139, 0, -22),
            new THREE.Vector3(150, 0, -53),
            new THREE.Vector3(233, 0, -106)
        ]);
        const mLength = mountainCurve.getLength();
        const mSteps = Math.ceil(mLength / 6.0); // Step every 6 meters for overlapping coverage
        const mPt = new THREE.Vector3();
        const mTan = new THREE.Vector3();

        for (let i = 0; i <= mSteps; i++) {
            const t = i / mSteps;
            mountainCurve.getPointAt(t, mPt);
            mountainCurve.getTangentAt(t, mTan).normalize();

            // Rotate collider to align with the local direction of the mountain ridge
            const angle = Math.atan2(mTan.x, mTan.z);
            const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);

            ctx.obstacles.push({
                position: mPt.clone(),
                quaternion: quat,
                collider: {
                    type: ColliderType.BOX,
                    size: new THREE.Vector3(12, 15, 12), // 12m width and depth to match visual base
                    center: new THREE.Vector3(0, 7.5, 0)
                }
            });
        }
        await yieldIfBudgetExceeded();

        // --- 6. THE MAST ---
        const mastPos = LOCATIONS.POIS.MAST;

        const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x222222 }));
        asphalt.rotation.x = -Math.PI / 2;
        asphalt.position.set(mastPos.x, 0.05, mastPos.z);
        asphalt.receiveShadow = true;
        scene.add(asphalt);

        await SectorBuilder.createFence(ctx, [
            new THREE.Vector3(mastPos.x - 30, 0, mastPos.z + 30),
            new THREE.Vector3(mastPos.x - 30, 0, mastPos.z - 30),
            new THREE.Vector3(mastPos.x - 5, 0, mastPos.z - 30)
        ], 'black', 2.5);
        await yieldIfBudgetExceeded();

        await SectorBuilder.createFence(ctx, [
            new THREE.Vector3(mastPos.x + 5, 0, mastPos.z - 30),
            new THREE.Vector3(mastPos.x + 30, 0, mastPos.z - 30),
            new THREE.Vector3(mastPos.x + 30, 0, mastPos.z + 30),
            new THREE.Vector3(mastPos.x - 30, 0, mastPos.z + 30)
        ], 'black', 2.5);
        await yieldIfBudgetExceeded();

        // --- 6.1 DESTROYABLE COMPOUND GATE ---
        const gateGroup = new THREE.Group();
        gateGroup.position.set(mastPos.x, 0, mastPos.z - 30);

        const postGeo = new THREE.BoxGeometry(0.2, 2.5, 0.2);
        const postMat = MATERIALS.blackMetal || new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8 });
        const postLeft = new THREE.Mesh(postGeo, postMat);
        postLeft.position.set(-5, 1.25, 0);
        gateGroup.add(postLeft);

        const postRight = new THREE.Mesh(postGeo, postMat);
        postRight.position.set(5, 1.25, 0);
        gateGroup.add(postRight);

        const gateFrameGeo = new THREE.BoxGeometry(10, 0.15, 0.15);
        const frameTop = new THREE.Mesh(gateFrameGeo, postMat);
        frameTop.position.set(0, 2.3, 0);
        gateGroup.add(frameTop);

        const frameBottom = new THREE.Mesh(gateFrameGeo, postMat);
        frameBottom.position.set(0, 0.2, 0);
        gateGroup.add(frameBottom);

        const frameMiddle = new THREE.Mesh(gateFrameGeo, postMat);
        frameMiddle.position.set(0, 1.25, 0);
        gateGroup.add(frameMiddle);

        const barGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.1, 8);
        for (let i = -4.5; i <= 4.5; i += 0.9) {
            const bar = new THREE.Mesh(barGeo, postMat);
            bar.position.set(i, 1.25, 0);
            gateGroup.add(bar);
        }
        scene.add(gateGroup);

        const gateObstacle = {
            mesh: gateGroup,
            position: gateGroup.position,
            collider: {
                type: ColliderType.BOX,
                size: new THREE.Vector3(10, 2.5, 1.0),
                center: new THREE.Vector3(0, 1.25, 0)
            },
            durability: undefined, // starts immune; set to 120 after camera flyover
            maxDurability: 120,
            excludedWeapons: [],
            onDestroyObject: (session: any, obstacle: any) => {
                const waveSystem = session.systems.enemyWave;
                if (waveSystem) {
                    waveSystem.enableActiveWave();
                }

                // Spawn debris particles / sparks / sounds when gate is destroyed
                if (session.systems.weaponFX) {
                    const pos = obstacle.position;
                    session.systems.weaponFX.spawnParticle(pos.x, 1.25, pos.z, FXParticleType.DEBRIS, 30);
                    session.systems.weaponFX.spawnParticle(pos.x, 1.25, pos.z, FXParticleType.SPARK, 20);
                }
            }
        };
        SectorBuilder.addObstacle(ctx, gateObstacle);
        (ctx.sectorState as any).gateObstacle = gateObstacle;
        await yieldIfBudgetExceeded();

        await SectorBuilder.spawnBuilding(ctx, mastPos.x, mastPos.z, 15, 5, 12, Math.PI / 2, 0x555555, false);
        await yieldIfBudgetExceeded();

        // The Mast
        const mastGroup = new THREE.Group();
        mastGroup.position.set(mastPos.x, 5, mastPos.z);

        const mast = await SectorBuilder.spawnPoi(ctx, PoiType.MAST, mastPos.x, mastPos.z, 0);
        mast.name = "POI_MAST";
        (ctx as any).mastLightHub = mast.getObjectByName("mastWarningLights") || null;
        await yieldIfBudgetExceeded();

        // Esmeralda - Inside the building, not following yet
        await SectorBuilder.spawnFamily(ctx, FamilyMemberID.ESMERALDA, LOCATIONS.SPAWN.FAMILY.x, LOCATIONS.SPAWN.FAMILY.z, Math.PI, { following: false, found: false, visible: true });
    },

    setupContent: async (ctx: SectorBuildContext) => {
        if (ctx.isWarmup) return; // Triggers produce no GPU state — skip during preloader ghost-render
        // Triggers:
        SectorBuilder.addTriggers(ctx, [
            // ESMERALDA CINEMATIC TRIGGER — starts INACTIVE.
            // Activated by onUpdate once all mast-area zombies are cleared.
            {
                id: FamilyMemberID.ESMERALDA,
                position: LOCATIONS.TRIGGERS.FOUND_ESMERALDA,
                familyId: FamilyMemberID.ESMERALDA,
                radius: 8,
                type: TriggerType.EVENT,
                content: '',
                statusFlags: TriggerStatus.ONCE, // Starts INACTIVE — activated after kill clear
                actions: [{ type: TriggerActionType.START_CINEMATIC, payload: { familyId: FamilyMemberID.ESMERALDA, sectorId: 2, dialogueId: 0 } }]
            },
            // MAST ZONE — player entering this activates the zombie kill event
            {
                id: SectorEventID.S2_MAST_ZONE_ENTER,
                position: LOCATIONS.TRIGGERS.POI_MAST,
                radius: 40,
                type: TriggerType.EVENT,
                content: "pois.2.0.reaction",
                statusFlags: TriggerStatus.ACTIVE | TriggerStatus.ONCE,
                actions: [] // Consumed in onUpdate via mastEventState
            },
            { id: ClueID.S2_FOREST_NOISE, position: LOCATIONS.TRIGGERS.FOREST_AMBIENT, radius: 8, type: TriggerType.CLUE, content: "clues.2.0.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
            /*
            {
                id: PoiID.S2_MAST,
                position: LOCATIONS.TRIGGERS.POI_MAST,
                radius: 50,
                type: TriggerType.POI,
                content: "pois.2.0.reaction",
                statusFlags: TriggerStatus.ACTIVE,
                actions: [
                    { type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }
                ]
            },
            */
            { id: PoiID.S2_FARM, position: LOCATIONS.POIS.FARM, radius: 20, type: TriggerType.POI, content: "pois.2.1.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
            { id: ClueID.S2_TRACTOR, position: { x: LOCATIONS.POIS.FARM.x + 10, z: LOCATIONS.POIS.FARM.z + 10 }, radius: 8, type: TriggerType.CLUE, content: "clues.2.2.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 50 } }] },
            { id: PoiID.S2_EGG_FARM, position: LOCATIONS.POIS.EGG_FARM, radius: 20, type: TriggerType.POI, content: "pois.2.2.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] },
            { id: PoiID.S2_BARN, position: LOCATIONS.POIS.BARN, radius: 20, type: TriggerType.POI, content: "pois.2.3.reaction", statusFlags: TriggerStatus.ACTIVE, actions: [{ type: TriggerActionType.GIVE_REWARD, payload: { xp: 500 } }] }
        ]);
    },

    setupZombies: async (ctx: SectorBuildContext) => {
        if (ctx.isWarmup || !ctx.spawnHorde) return; // No enemy spawning during preloader ghost-render

        const hordeSpots = [
            new THREE.Vector3(40, 0, -30),
            new THREE.Vector3(150, 0, -120),
            new THREE.Vector3(180, 0, -130),
            new THREE.Vector3(-250, 0, -50),
            new THREE.Vector3(300, 0, -100)
        ];

        for (let i = 0; i < hordeSpots.length; i++) {
            const count = 5 + Math.floor(ctx.rng() * 5);
            ctx.spawnHorde(count, undefined, hordeSpots[i]);
        }
    },

    onSectorUpdate: ({ delta, simTime, renderTime, playerPos, gameState, sectorState, ctx, ...events }) => {
        // --- SECTOR 2: ESMERALDA MISSION LOGIC ---
        // Rotating mast warning light (every frame, Zero-GC)
        const mastLightHub = (ctx as any).mastLightHub;
        if (mastLightHub) {
            mastLightHub.rotation.y += delta * 2.0;
        }
    },

    events: [esmeraldaMissionEvent]
};
