import * as THREE from 'three';
import { SectorDef, SectorBuildContext, EnvironmentalZone, TerminalType } from '../../game/session/SectorTypes';
import { TriggerType, TriggerActionType, TriggerStatus } from '../../types/TriggerTypes';
import { MATERIALS } from '../../utils/assets';
import { t } from '../../utils/i18n';
import { SectorBuilder } from '../../core/world/SectorBuilder';
import { ObjectGenerator } from '../../core/world/generators/ObjectGenerator';
import { PathGenerator } from '../../core/world/generators/PathGenerator';
import { NaturePropGenerator } from '../../core/world/generators/NaturePropGenerator';
import { VehicleGenerator } from '../../core/world/generators/VehicleGenerator';
import { GeneratorUtils } from '../../core/world/generators/GeneratorUtils';
import { InteractionType, InteractionShape, InteractionSubType } from '../../systems/ui/UIEventBridge';
import { ToneType, SoundID } from '../../utils/audio/AudioTypes';
import { VehicleID } from '../../entities/vehicles/VehicleTypes';
import { NoiseType } from '../../entities/enemies/EnemyBase';
import { VEGETATION_TYPE } from '../../content/environment';
import { WeatherType, GroundType } from '../../core/engine/EnvironmentalTypes';
import { CAMERA_HEIGHT } from '../constants';
import { StatusEffectID } from '../../content/perks';
import { DamageID, DamageType } from '../../entities/player/CombatTypes';
import { FXParticleType } from '../../types/FXTypes';
import { EnemyFlags } from '../../entities/enemies/EnemyTypes';
import { OverlayType } from '../../components/ui/hud/HudTypes';
import { ColliderType } from '../../core/world/CollisionResolution';

const _v1 = new THREE.Vector3();

// Zero-GC for the bus experiment
const _busOriginalPos = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _rotation = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();

// --- PHYSICS SCRATCHPADS (Zero-GC) ---
const _activeMeshesScratch: THREE.InstancedMesh[] = new Array(16);
let _activeMeshCount = 0;

const EXPLODING_BUS_ID = 'playground_bus_explode';
const EXPLODING_BUS_POS = { x: 40, y: 1.5, z: -40 };

// --- PERK ZONE SCRATCHPADS (Zero-GC) ---
const _v1_pz = new THREE.Vector3();
const _v2_pz = new THREE.Vector3();

// --- PERK ZONE CONFIGURATION ---
const PERK_ZONES = [
    // --- BUFFS ---
    { x: -120, z: 0, radius: 10, effect: StatusEffectID.GIB_MASTER, type: 'buff', color: 0xaa55ff, particle: FXParticleType.GORE },
    { x: -145, z: 25, radius: 10, effect: StatusEffectID.QUICK_FINGER, type: 'buff', color: 0xffcc00, particle: FXParticleType.FLASH },
    { x: -145, z: -25, radius: 10, effect: StatusEffectID.REFLEX_SHIELD, type: 'buff', color: 0x4488ff, particle: FXParticleType.ELECTRIC_FLASH },
    { x: -170, z: 0, radius: 10, effect: StatusEffectID.ADRENALINE_PATCH, type: 'buff', color: 0xffffff, particle: FXParticleType.SHOCKWAVE },

    // --- DEBUFFS ---
    { x: -120, z: 45, radius: 10, effect: StatusEffectID.BURNING, type: 'debuff', color: 0xff3300, particle: FXParticleType.FIRE },
    { x: -95, z: 25, radius: 10, effect: StatusEffectID.DROWNING, type: 'debuff', color: 0x0066ff, particle: FXParticleType.SPLASH },
    { x: -95, z: -25, radius: 10, effect: StatusEffectID.ELECTRIFIED, type: 'debuff', color: 0x00ffff, particle: FXParticleType.SPARK },
    { x: -120, z: -45, radius: 10, effect: StatusEffectID.BLEEDING, type: 'debuff', color: 0xcc0000, particle: FXParticleType.BLOOD_SPLATTER },
    { x: -145, z: -50, radius: 10, effect: StatusEffectID.FREEZING, type: 'debuff', color: 0x88ccff, particle: FXParticleType.SNOW_PUFF },
    { x: -95, z: 50, radius: 10, effect: StatusEffectID.SLOWED, type: 'debuff', color: 0x666666, particle: FXParticleType.SMOKE },
    { x: -70, z: 0, radius: 10, effect: StatusEffectID.STUNNED, type: 'debuff', color: 0xaaaa00, particle: FXParticleType.ENEMY_EFFECT_STUN },
    { x: -120, z: -80, radius: 10, effect: StatusEffectID.DISORIENTED, type: 'debuff', color: 0xff00ff, particle: FXParticleType.MAGNETIC_SPARKS }
];

function createPerkZone(ctx: SectorBuildContext) {
    const { scene } = ctx;

    for (let i = 0; i < PERK_ZONES.length; i++) {
        const zone = PERK_ZONES[i];

        // Ground Circle
        const floorGeo = new THREE.CylinderGeometry(zone.radius, zone.radius, 0.1, 32);
        const floorMat = MATERIALS.concrete.clone();
        floorMat.color.set(zone.color);
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.position.set(zone.x, 0.05, zone.z);
        floor.receiveShadow = true;
        floor.matrixAutoUpdate = false;
        floor.updateMatrix();
        scene.add(floor);

        // Border Ring
        const borderGeo = new THREE.TorusGeometry(zone.radius, 0.3, 8, 48);
        const borderMat = new THREE.MeshBasicMaterial({
            color: zone.type === 'buff' ? 0x22c55e : 0xff3333,
            transparent: true,
            opacity: 0.8
        });
        const border = new THREE.Mesh(borderGeo, borderMat);
        border.position.set(zone.x, 0.1, zone.z);
        border.rotation.x = Math.PI / 2;
        border.matrixAutoUpdate = false;
        border.updateMatrix();
        scene.add(border);

        // Label Sprite
        const labelText = StatusEffectID[zone.effect].replace(/_/g, ' ');
        const sprite = ObjectGenerator.createTextSprite(labelText);
        sprite.position.set(zone.x, 5, zone.z);
        sprite.scale.set(zone.radius * 0.8, zone.radius * 0.2, 1);
        scene.add(sprite);
    }
}

export const ENVIRONMENTAL_ZONES: EnvironmentalZone[] = [
    {
        label: "FOREST OF SHADOWS",
        polygon: [
            { x: -150, z: -450 },
            { x: 150, z: -450 },
            { x: 150, z: -250 },
            { x: -150, z: -250 }
        ],
        weather: WeatherType.RAIN,
        bgColor: 0x111122,
        fogDensity: 0.005,
        ambient: 0.2
    },
    { label: "ABANDONED FARM", x: 342, z: 111, outerRadius: 150, innerRadius: 80, weather: WeatherType.NONE, bgColor: 0x221122, fogDensity: 0.005, ambient: 0.5 },
    { label: "THE VILLAGE", x: 211, z: -291, outerRadius: 180, innerRadius: 100, weather: WeatherType.ASH, bgColor: 0x222222, fogDensity: 0.004, ambient: 0.3 },
    { label: "CRYSTAL LAKE", x: -211, z: -291, outerRadius: 200, innerRadius: 120, weather: WeatherType.SNOW, bgColor: 0x111133, fogDensity: 0.002, ambient: 0.35 },
    { label: "ANCIENT RUINS", x: -342, z: 111, outerRadius: 160, innerRadius: 90, weather: WeatherType.EMBER, bgColor: 0x331111, fogDensity: 0.003, ambient: 0.4 }
];

function getDamageTypeForEffect(effectId: StatusEffectID): DamageID {
    switch (effectId) {
        case StatusEffectID.BURNING: return DamageID.BURN;
        case StatusEffectID.BLEEDING: return DamageID.BLEED;
        case StatusEffectID.ELECTRIFIED: return DamageID.ELECTRIC;
        case StatusEffectID.FREEZING: return DamageID.FROST;
        case StatusEffectID.DROWNING: return DamageID.DROWNING;
        default: return DamageID.NONE;
    }
}

export const Sector4: SectorDef = {

    id: 4,
    spawnZombiesOnSector: false,
    environment: {
        bgColor: 0x020208,
        fog: {
            density: 0.02,
            color: 0x020208,
            height: 10
        },
        groundColor: 0x111111,
        ambient: 0.4,
        fov: 50,
        sky: {
            time: 0.8,
            timeScale: 0.05,
            atmosphereColor: 0x0a0a0c,
            celestial: {
                radius: 150, // Scaled up due to distance
                color: 0xffffff,
                position: { x: 500, y: 350, z: 500 }
            },
            light: {
                visible: true,
                color: 0x444444,
                intensity: 1.0,
                castShadow: true
            }
        },
        cameraOffsetZ: 40,
        cameraHeight: CAMERA_HEIGHT,
        weather: {
            type: WeatherType.SNOW,
            particles: 2000
        },
        wind: {
            strengthMin: 0.05,
            strengthMax: 1.0,
            direction: { x: 1, z: 1 },
            angleVariance: Math.PI / 4
        }
    },
    environmentalZones: ENVIRONMENTAL_ZONES,
    ground: GroundType.SNOW,
    ambientLoop: SoundID.AMBIENT_METAL,

    playerSpawn: { x: 0, z: 0 },
    familySpawn: { x: 0, z: 0 },
    bossSpawn: null,

    collectibles: [],

    setupProps: async (ctx: SectorBuildContext) => {
        const { scene } = ctx;

        // Reset Sector 4's bus state on initial load to ensure a clean slate,
        // completely decoupled from other sector states (e.g. Sector 0's exploded tunnel bus).
        if (ctx.sectorState) {
            ctx.sectorState.busExploded = false;
            ctx.sectorState.busPlanting = false;
            ctx.sectorState.busPlantingTime = 0;
            ctx.sectorState.busExplosionHandled = false;
            ctx.sectorState.busExplosionTime = 0;
            ctx.sectorState.lastBusBeep = 0;
        }

        let startTime = performance.now();
        const yieldIfBudgetExceeded = async () => {
            if (performance.now() - startTime > 12) {
                if (ctx.yield) await ctx.yield();
                startTime = performance.now();
            }
        };

        // DUMMY COLLECTIBLE FOR TESTING - Set to respawnable so it's always there
        await SectorBuilder.spawnCollectible(ctx, 0, 15, 'dummy_badge_test', 'badge', true);
        await yieldIfBudgetExceeded();

        // --- PERK ZONE ---
        createPerkZone(ctx);
        await yieldIfBudgetExceeded();

        // --- PLAZA (Center 0,0) ---
        // Circular concrete plaza
        const plazaGeo = new THREE.CylinderGeometry(20, 20, 0.6, 32);
        const plazaMat = MATERIALS.concrete;
        const plaza = new THREE.Mesh(plazaGeo, plazaMat);
        plaza.position.set(0, -0.25, 0);
        plaza.receiveShadow = true;
        scene.add(plaza);

        // Add some lights to the plaza - SHADOWS DISABLED TO PREVENT TEXTURE LIMIT CRASH
        const pl = new THREE.PointLight(0xffaa00, 200, 30);
        pl.position.set(0, 15, 0);
        pl.castShadow = false;
        scene.add(pl);

        // --- INTERACTION TERMINALS ---
        const terminalDist = 13;
        const terminalScale = 2.5;

        // 1. Armory (West)
        await SectorBuilder.spawnTerminal(ctx, -terminalDist, 0, TerminalType.ARMORY, terminalScale);
        const armoryLabel = ObjectGenerator.createTextSprite(t('terminals.armory'));
        armoryLabel.position.set(-terminalDist, 4.5, 0);
        armoryLabel.scale.set(10, 1.5, 1);
        scene.add(armoryLabel);
        await yieldIfBudgetExceeded();

        // 2. Enemy Spawner (North)
        await SectorBuilder.spawnTerminal(ctx, 0, -terminalDist, TerminalType.SPAWNER, terminalScale);
        const spawnerLabel = ObjectGenerator.createTextSprite(t('terminals.spawner'));
        spawnerLabel.position.set(0, 4.5, -terminalDist);
        spawnerLabel.scale.set(10, 1.5, 1);
        scene.add(spawnerLabel);
        await yieldIfBudgetExceeded();

        // 3. Environment Control (East)
        await SectorBuilder.spawnTerminal(ctx, terminalDist, 0, TerminalType.ENVIRONMENT, terminalScale);
        const envLabel = ObjectGenerator.createTextSprite(t('terminals.environment'));
        envLabel.position.set(terminalDist, 4.5, 0);
        envLabel.scale.set(10, 1.5, 1);
        scene.add(envLabel);
        await yieldIfBudgetExceeded();

        // 4. Skill Station (South)
        await SectorBuilder.spawnTerminal(ctx, 0, terminalDist, TerminalType.SKILLS, terminalScale);
        const skillLabel = ObjectGenerator.createTextSprite(t('terminals.skills'));
        skillLabel.position.set(0, 4.5, terminalDist);
        skillLabel.scale.set(10, 1.5, 1);
        scene.add(skillLabel);
        await yieldIfBudgetExceeded();

        // Helper for POI Markers
        const addPoiLabel = (label: string, pos: { x: number, z: number }) => {
            const sprite = ObjectGenerator.createTextSprite(label);
            sprite.position.set(pos.x, 25, pos.z);
            sprite.scale.set(20, 5, 1);
            scene.add(sprite);
        };

        // Vehicles at the spawn point
        await SectorBuilder.spawnDriveableVehicle(ctx, -20, 10, Math.PI / 1, VehicleID.SEDAN, undefined, false);
        await SectorBuilder.spawnDriveableVehicle(ctx, 0, 30, Math.PI / 2, VehicleID.TIMBER_TRUCK, undefined, false);
        await SectorBuilder.spawnDriveableVehicle(ctx, -20, 20, Math.PI / 3, VehicleID.BUS, undefined, false);
        await SectorBuilder.spawnDriveableVehicle(ctx, 20, 10, Math.PI / 4, VehicleID.POLICE, undefined, false);
        await SectorBuilder.spawnDriveableVehicle(ctx, 20, 20, Math.PI / 5, VehicleID.AMBULANCE, undefined, false);
        await yieldIfBudgetExceeded();


        // --- BIOME GENERATION ---
        // Iterate through ZONES to generate content
        for (let i = 0; i < ENVIRONMENTAL_ZONES.length; i++) {
            const zone = ENVIRONMENTAL_ZONES[i];
            const angle = (i / ENVIRONMENTAL_ZONES.length) * Math.PI * 2;

            const x = zone.x || (zone.polygon ? (zone.polygon[0].x + zone.polygon[2].x) / 2 : 0);
            const z = zone.z || (zone.polygon ? (zone.polygon[0].z + zone.polygon[2].z) / 2 : 0);

            // Curved Path from Center to Zone
            const curve = new THREE.QuadraticBezierCurve3(
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(x * 0.5 + Math.sin(angle + 1.5) * 90, 0, z * 0.5 + Math.cos(angle + 1.5) * 90),
                new THREE.Vector3(x, 0, i == 3 ? z + 70 : z)
            );
            const points = curve.getPoints(60);

            // Generate Path
            await PathGenerator.createDirtPath(ctx, points, 4);
            await yieldIfBudgetExceeded();

            // Add POI Label
            addPoiLabel(zone.label, { x, z });
        }

        // 1. FOREST
        const p0 = ENVIRONMENTAL_ZONES[0];
        const center0X = (p0.polygon![0].x + p0.polygon![2].x) / 2;
        const center0Z = (p0.polygon![0].z + p0.polygon![2].z) / 2;

        await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.PINE, [
            new THREE.Vector3(p0.polygon![0].x, 0, p0.polygon![0].z),
            new THREE.Vector3(p0.polygon![1].x, 0, p0.polygon![1].z),
            new THREE.Vector3(p0.polygon![2].x, 0, p0.polygon![2].z),
            new THREE.Vector3(p0.polygon![3].x, 0, p0.polygon![3].z),
        ], 8);
        await yieldIfBudgetExceeded();
        for (let j = 0; j < 30; j++) {
            const rX = center0X + (Math.random() - 0.5) * 160;
            const rZ = center0Z + (Math.random() - 0.5) * 160;
            if (Math.abs(rX - center0X) < 15 && Math.abs(rZ - center0Z) < 15) continue;
            const rock = NaturePropGenerator.createRock(4 + Math.random() * 4, 2 + Math.random() * 2);
            rock.position.set(rX, 0, rZ);
            scene.add(rock);
            await SectorBuilder.addObstacle(ctx, { mesh: rock, position: rock.position, radius: 4, collider: { type: ColliderType.SPHERE, radius: 3 } });
            await yieldIfBudgetExceeded();
        }

        // 2. FARM
        const p1 = ENVIRONMENTAL_ZONES[1];
        const farmRect = [
            new THREE.Vector3(p1.x - 90, 0, p1.z - 90),
            new THREE.Vector3(p1.x + 90, 0, p1.z - 90),
            new THREE.Vector3(p1.x + 90, 0, p1.z + 90),
            new THREE.Vector3(p1.x - 90, 0, p1.z + 90),
        ];
        await SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.WHEAT, farmRect, 0.4);
        await yieldIfBudgetExceeded();

        // --- Tractor (Driveable) ---
        await SectorBuilder.spawnDriveableVehicle(ctx, p1.x, p1.z, Math.random() * Math.PI, VehicleID.TRACTOR);
        await yieldIfBudgetExceeded();

        // 3. VILLAGE
        const p2 = ENVIRONMENTAL_ZONES[2];
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                if (dx === 0 && dz === 0) continue;
                const hx = p2.x + dx * 35;
                const hz = p2.z + dz * 35;
                const house = ObjectGenerator.createBuilding(10, 8, 10, 0xffffff, true, true, 0.2);
                house.position.set(hx, 4, hz);

                // Traverse and force remove shadows from all inside walls, roofs, and windows!
                house.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        child.castShadow = false;
                    }
                });

                scene.add(house);
                await SectorBuilder.addObstacle(ctx, { mesh: house, position: house.position, collider: { type: ColliderType.BOX, size: new THREE.Vector3(10, 8, 10) } });
                await yieldIfBudgetExceeded();
            }
        }

        // --- Car (Driveable) ---
        await SectorBuilder.spawnDriveableVehicle(ctx, p2.x, p2.z, Math.PI / 2, VehicleID.STATION_WAGON);
        await yieldIfBudgetExceeded();

        // 4. WATER
        const p3 = ENVIRONMENTAL_ZONES[3];

        // 4.1. Create the water body (The Lake) + Recessed Bed
        const lake = await SectorBuilder.addLake(ctx, p3.x, p3.z, 75, 5.0);
        await yieldIfBudgetExceeded();

        // 4.2. Large stone
        const bigStone = NaturePropGenerator.createRock(35, 15, 10);
        bigStone.position.set(p3.x - 30, -2, p3.z + 20);
        bigStone.scale.set(1.5, 1.2, 1.5);
        scene.add(bigStone);

        await SectorBuilder.addObstacle(ctx, {
            mesh: bigStone,
            position: bigStone.position,
            radius: 10,
            collider: { type: ColliderType.SPHERE, radius: 10 }
        });
        await yieldIfBudgetExceeded();

        // Register as splash source for the new 'splash' particles
        if (lake) lake.registerSplashSource(bigStone);

        // 4.3. Boat
        const boatGroup = await SectorBuilder.spawnFloatableVehicle(ctx, p3.x, p3.z, Math.random() * Math.PI);
        await yieldIfBudgetExceeded();
        if (lake && boatGroup) {
            lake.registerFloatingProp(boatGroup);
            lake.registerSplashSource(boatGroup);
        }

        // 4.4. Interactive ball
        const ballGeom = new THREE.SphereGeometry(1.5, 16, 16);
        const ballMat = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.4, metalness: 0.1 });
        const ball = new THREE.Mesh(ballGeom, ballMat);

        ball.position.set(p3.x + 10, 5, p3.z + 10);
        ball.castShadow = false;
        ball.userData = {
            isBall: true,
            radius: 1.5,
            mass: 5,
            friction: 0.96,
            velocity: new THREE.Vector3(0, 0, 0)
        };

        ball.matrixAutoUpdate = true;
        scene.add(ball);

        if (lake) {
            lake.registerFloatingProp(ball);
            lake.registerSplashSource(ball);
        }

        const ballObstacle = {
            mesh: ball,
            position: ball.position,
            radius: 1.5,
            collider: { type: ColliderType.SPHERE, radius: 1.5 },
            type: 'Ball'
        };
        await SectorBuilder.addObstacle(ctx, ballObstacle);
        await yieldIfBudgetExceeded();

        // Save references in state so we can update physics in onUpdate
        ctx.state.interactiveBall = ball;
        ctx.state.interactiveBallObs = ballObstacle;

        // 5. SURPRISE
        const p4 = ENVIRONMENTAL_ZONES[4];
        // Ruins / Pillars
        for (let k = 0; k < 12; k++) { // More pillars
            const ang = (k / 12) * Math.PI * 2;
            const px = p4.x + Math.sin(ang) * 40; // Wider circle
            const pz = p4.z + Math.cos(ang) * 40;
            const pillar = new THREE.Mesh(new THREE.BoxGeometry(4, 15 + Math.random() * 10, 4), MATERIALS.concrete);
            pillar.position.set(px, 8, pz);
            pillar.castShadow = true;
            scene.add(pillar);
            await SectorBuilder.addObstacle(ctx, { mesh: pillar, position: pillar.position, collider: { type: ColliderType.BOX, size: new THREE.Vector3(4, 30, 4) } });
            await yieldIfBudgetExceeded();
        }
        // Add a small pond in the center of the ruins
        const pondCenter = { x: p4.x, y: -0.25, z: p4.z };
        const pondRadius = 15;
        const pond = new THREE.Mesh(
            new THREE.CylinderGeometry(pondRadius, pondRadius, 0.5, 32),
            new THREE.MeshStandardMaterial({ color: 0x4a90e2, roughness: 0.3, metalness: 0.1 })
        );
        pond.position.set(pondCenter.x, -0.25, pondCenter.z);
        scene.add(pond);

        // Add some rocks around the pond
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const rock = NaturePropGenerator.createRock(8, 8);
            rock.position.set(
                pondCenter.x + Math.cos(angle) * (pondRadius + 5),
                -2,
                pondCenter.z + Math.sin(angle) * (pondRadius + 5)
            );
            scene.add(rock);
            await SectorBuilder.addObstacle(ctx, { mesh: rock, position: rock.position, radius: 5, collider: { type: ColliderType.SPHERE, radius: 5 } });
            await yieldIfBudgetExceeded();
        }

        // --- EXPLODING BUS EXPERIMENT ---
        const bus = VehicleGenerator.createBus(0x009ddb, false);
        bus.position.set(EXPLODING_BUS_POS.x, EXPLODING_BUS_POS.y, EXPLODING_BUS_POS.z);
        bus.rotation.set(Math.PI / 2, Math.PI / 2, 0); // On its side
        GeneratorUtils.freezeStatic(bus);
        scene.add(bus);

        const busBox = new THREE.Box3().setFromObject(bus);
        const busSize = new THREE.Vector3();
        busBox.getSize(busSize);
        const busCenter = new THREE.Vector3();
        busBox.getCenter(busCenter);

        const colMesh = new THREE.Mesh(new THREE.BoxGeometry(busSize.x, busSize.y, busSize.z));
        colMesh.position.copy(busCenter);
        colMesh.visible = false;
        GeneratorUtils.freezeStatic(colMesh);
        scene.add(colMesh);

        const obstacle_bus = { id: EXPLODING_BUS_ID, mesh: colMesh, collider: { type: ColliderType.BOX, size: busSize } };
        await SectorBuilder.addObstacle(ctx, obstacle_bus);
        await yieldIfBudgetExceeded();
        await SectorBuilder.setOnFire(ctx, bus, { smoke: true, intensity: 25, distance: 50, onRoof: true });
        await yieldIfBudgetExceeded();

        await SectorBuilder.addInteractable(ctx, bus, {
            id: EXPLODING_BUS_ID,
            label: 'ui.plant_explosives',
            type: InteractionType.SECTOR_SPECIFIC,
            subType: InteractionSubType.PLANT_EXPLOSIVE,
            collider: { type: InteractionShape.SPHERE, radius: 15.0 }
        });
        await yieldIfBudgetExceeded();
        bus.userData.isInteractable = true;

        // Store references
        (ctx as any).busObject = bus;
        (ctx as any).busColMesh = colMesh;
        (ctx as any).busCenter = busCenter.clone();
        (ctx as any).busSize = busSize.clone();
        (ctx as any).busObstacle = obstacle_bus;

        // Rubble
        const rubble = await SectorBuilder.spawnRubble(ctx, EXPLODING_BUS_POS.x, EXPLODING_BUS_POS.z, 20, MATERIALS.busBlue, Math.PI);
        await yieldIfBudgetExceeded();
        rubble.position.set(0, 0, 0);
        rubble.visible = false; // [VINTERDÖD FIX] Keep hidden until explosion
        rubble.frustumCulled = false;
        rubble.userData.active = false;
        rubble.userData.hasLanded = new Uint8Array(rubble.count);
        rubble.userData.positions = new Float32Array(rubble.count * 3);
        rubble.userData.velocities = new Float32Array(rubble.count * 3);
        (ctx as any).busRubble = rubble;

        // Tires (4 bouncing tires)
        const tireGeo = new THREE.DodecahedronGeometry(0.8, 1);
        const tireMat = MATERIALS.vehicleTire;
        const tires = new THREE.InstancedMesh(tireGeo, tireMat, 4);
        tires.position.set(0, 0, 0);
        tires.visible = false;
        tires.userData.active = false;
        tires.userData.hasLanded = new Uint8Array(4);
        tires.userData.positions = new Float32Array(4 * 3);
        tires.userData.velocities = new Float32Array(4 * 3);
        tires.userData.rotations = new Float32Array(4 * 3);
        tires.userData.spin = new Float32Array(4 * 3);
        tires.userData.scales = new Float32Array(4).fill(1.0);
        scene.add(tires);
        (ctx as any).busTires = tires;

        // [VINTERDÖD FIX] Restore state if already exploded
        if (ctx.sectorState && ctx.sectorState.busExploded) {
            bus.position.set(0, -1000, 0);
            bus.userData.isInteractable = false;
            rubble.visible = true;
            tires.visible = true;
        }
    },

    onInteract: (id: string, object: THREE.Object3D, state: any, events: any) => {
        // VEHICLES
        if (object.userData.vehicleDef) {
            state.vehicle.active = true;
            state.vehicle.mesh = object;
            return;
        }

        // STATIONS
        if (id === 'terminal_' + TerminalType.ARMORY) {
            events.setOverlay(OverlayType.STATION_ARMORY);
        }
        else if (id === 'terminal_' + TerminalType.SPAWNER) {
            events.setOverlay(OverlayType.STATION_SPAWNER);
        }
        else if (id === 'terminal_' + TerminalType.ENVIRONMENT) {
            events.setOverlay(OverlayType.STATION_ENVIRONMENT);
        }
        else if (id === 'terminal_' + TerminalType.SKILLS) {
            events.setOverlay(OverlayType.STATION_SKILLS);
        }

        // BUS EXPLOSION EVENT
        else if (id === EXPLODING_BUS_ID) {
            if (!state.sectorState || state.sectorState.busExploded || state.sectorState.busPlanting) return;

            state.sectorState.busPlanting = true;
            state.sectorState.busPlantingTime = state.simTime;
            object.userData.isInteractable = false;

            if (events.setBubble) events.setBubble(t("ui.planting_explosives"), 3000);
            if (events.playSound) events.playSound(SoundID.IMPACT_METAL);
        }
    },

    onPlayerRespawn: (ctx: SectorBuildContext, state: any, engine: any) => {
        if (!state.sectorState) return;

        // Reset state variables
        state.sectorState.busExploded = false;
        state.sectorState.busPlanting = false;
        state.sectorState.busPlantingTime = 0;
        state.sectorState.busExplosionHandled = false;
        state.sectorState.busExplosionTime = 0;
        state.sectorState.lastBusBeep = 0;

        // Restore bus visual model
        const bus = (ctx as any).busObject;
        if (bus) {
            bus.position.set(EXPLODING_BUS_POS.x, EXPLODING_BUS_POS.y, EXPLODING_BUS_POS.z);
            bus.userData.isInteractable = true;
        }

        // Hide rubble and tires
        const rubble = (ctx as any).busRubble;
        if (rubble) {
            rubble.visible = false;
            rubble.userData.active = false;
        }
        const tires = (ctx as any).busTires;
        if (tires) {
            tires.visible = false;
            tires.userData.active = false;
        }

        // Restore collision obstacle
        const obstacle_bus = (ctx as any).busObstacle;
        const busSize = (ctx as any).busSize;
        const busCenter = (ctx as any).busCenter;
        if (obstacle_bus && busSize && busCenter) {
            obstacle_bus.collider.size.copy(busSize);
            if (obstacle_bus.mesh) {
                obstacle_bus.mesh.position.copy(busCenter);
            }
            obstacle_bus.position.copy(busCenter);
            obstacle_bus.radius = Math.sqrt(busSize.x * busSize.x + busSize.z * busSize.z) * 0.5;

            // Re-add to obstacles array if not already present
            let exists = false;
            for (let i = 0; i < ctx.obstacles.length; i++) {
                if (ctx.obstacles[i].id === EXPLODING_BUS_ID) {
                    exists = true;
                    ctx.obstacles[i] = obstacle_bus;
                    break;
                }
            }
            if (!exists) {
                ctx.obstacles.push(obstacle_bus);
            }

            // Re-register with streamer so it's placed in correct logic buckets
            if (ctx.worldStreamer && typeof ctx.worldStreamer.registerObstacle === 'function') {
                ctx.worldStreamer.registerObstacle(obstacle_bus);
            }
        }
    },

    setupContent: async (ctx: SectorBuildContext) => {
        // No-op: Perk Zones are handled live in onSectorUpdate for optimal performance and instant feel.
    },

    onSectorUpdate: ({ delta, simTime, renderTime, playerPos, gameState, sectorState, ctx, onPlayerHit, ...events }) => {
        // --- PERK ZONE LOGIC (Zero-GC) ---
        // Ambient visuals and frame-level player + enemy status effect processing

        for (let i = 0; i < PERK_ZONES.length; i++) {
            const zone = PERK_ZONES[i];

            _v1_pz.set(zone.x, 0, zone.z);
            const distSq = playerPos.distanceToSquared(_v1_pz);
            const isInside = distSq < zone.radius * zone.radius;

            // 1. Ambient Visual Feedback: Sparking, boiling, freezing, and burning effects inside the pools constantly
            const particleInterval = zone.effect === StatusEffectID.BURNING ? 100 : 250;
            if (((simTime + i * 150) % particleInterval) < delta * 1000) {
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * zone.radius;
                events.spawnParticle(
                    zone.x + Math.cos(angle) * dist,
                    0.2 + Math.random() * 0.8,
                    zone.z + Math.sin(angle) * dist,
                    zone.particle,
                    1
                );
            }

            // 2. Direct Player Perk Application
            if (isInside && onPlayerHit) {
                const duration = 2000; // Refresh to 2s
                const intensity = zone.type === 'buff' ? 0.0 : 1.0;
                // Directly invoke onPlayerHit: 0 damage, null attacker, isDoT = true, effectType = zone.effect
                onPlayerHit(0, null, DamageType.PHYSICAL, DamageID.OTHER, true, zone.effect, duration, intensity);
            }

            // Apply effects to enemies (Still manual until TriggerSystem supports multi-entity)
            if (zone.type === 'debuff' || zone.type === 'buff') {
                const enemies = gameState.enemies;
                const eLen = enemies.length;
                for (let j = 0; j < eLen; j++) {
                    const e = enemies[j];
                    if (!e || e.hp <= 0) continue;

                    _v2_pz.set(zone.x, 0, zone.z);
                    const eDistSq = e.mesh.position.distanceToSquared(_v2_pz);

                    if (eDistSq < zone.radius * zone.radius) {
                        // Apply effect to enemy based on zone type
                        // [VINTERDÖD HARDENING] We map player buffs to enemy debuffs where applicable
                        const effect = zone.effect;

                        if (effect === StatusEffectID.BURNING) {
                            e.statusFlags |= EnemyFlags.BURNING;
                            e.burnDuration = 1.0;
                        } else if (effect === StatusEffectID.DROWNING) {
                            e.statusFlags |= EnemyFlags.DROWNING;
                            e.hp -= 20 * delta;
                        } else if (effect === StatusEffectID.FREEZING || effect === StatusEffectID.ELECTRIFIED) {
                            e.statusFlags |= EnemyFlags.STUNNED;
                            e.stunDuration = Math.max(e.stunDuration, 0.5);
                        } else if (effect === StatusEffectID.BLEEDING) {
                            e.hp -= 15 * delta;
                            if ((simTime % 500) < delta * 1000) {
                                events.spawnParticle(e.mesh.position.x, 1.5, e.mesh.position.z, FXParticleType.BLOOD_SPLATTER, 2);
                            }
                        } else if (effect === StatusEffectID.QUICK_FINGER) {
                            // Quick Finger zones SLOW DOWN enemies (Chronostatic imbalance)
                            e.stunDuration = Math.max(e.stunDuration, 0.2);
                        }
                    }
                }
            }
        }

        // --- SECTOR 4 LOGIC ---
        // Extract the ball from ctx
        const ball = (ctx as any).interactiveBall;
        const obs = (ctx as any).interactiveBallObs;

        if (ball && obs) {
            const vel = ball.userData.velocity as THREE.Vector3;

            // Only run physics if the ball actually has speed (optimized)
            if (vel.lengthSq() > 0.001) {
                // 1. Apply speed in X and Z (Y is controlled by the WaterSystem)
                ball.position.x += vel.x * delta;
                ball.position.z += vel.z * delta;

                // 2. Roll the ball visually!
                ball.rotation.x += vel.z * delta * 0.5;
                ball.rotation.z -= vel.x * delta * 0.5;

                // 3. Friction (gradually slows down the ball)
                vel.multiplyScalar(ball.userData.friction || 0.96);

                // 4. Sync the collision box so the player can't walk straight through it
                obs.position.copy(ball.position);

                // Update the WorldStreamer so physics match rendering
                if (gameState.worldStreamer && typeof gameState.worldStreamer.updateObstacle === 'function') {
                    gameState.worldStreamer.updateObstacle(obs);
                }
            }
        }

        // --- BUS EXPLOSION EXPERIMENT ---
        if (sectorState.busPlanting && !sectorState.busExploded) {
            const plantingElapsed = simTime - (sectorState.busPlantingTime || 0);

            // Beep every 500ms
            const lastBeep = sectorState.lastBusBeep || 0;
            if (plantingElapsed > lastBeep + 500) {
                sectorState.lastBusBeep = lastBeep + 500;
                if (events.playTone) events.playTone(880, ToneType.SQUARE, 0.05, 0.02);
            }

            if (plantingElapsed > 3000) {
                sectorState.busExploded = true;
                sectorState.busPlanting = false;
            }
        }

        if (sectorState.busExploded && !sectorState.busExplosionHandled) {
            sectorState.busExplosionHandled = true;
            sectorState.busExplosionTime = renderTime;

            if (events.playSound) events.playSound(SoundID.EXPLOSION);
            if (events.cameraShake) events.cameraShake(5);

            _busOriginalPos.set(EXPLODING_BUS_POS.x, EXPLODING_BUS_POS.y, EXPLODING_BUS_POS.z);

            if (events.spawnParticle) {
                // Use new scale parameter for massive cinematic explosion
                events.spawnParticle(_busOriginalPos.x, 2, _busOriginalPos.z, FXParticleType.SHOCKWAVE, 1, undefined, undefined, undefined, 2.5);
                events.spawnParticle(_busOriginalPos.x, 2, _busOriginalPos.z, FXParticleType.LARGE_SMOKE, 8, undefined, undefined, undefined, 2.0);
            }

            if (events.makeNoise) {
                events.makeNoise(_busOriginalPos.clone(), NoiseType.OTHER, 100);
            }

            // Clear bus
            const _busObj = (ctx as any).busObject as THREE.Object3D | null;

            if (_busObj) {
                _busObj.position.set(0, -1000, 0);
            }

            const _obsArray = ctx.obstacles;
            if (_obsArray) {
                for (let i = 0; i < _obsArray.length; i++) {
                    const o = _obsArray[i];
                    if (o && o.id === EXPLODING_BUS_ID) {
                        o.collider.size?.set(0, 0, 0);
                        if (o.position) o.position.set(99999, -1000, 99999);
                        if (o.mesh) {
                            o.mesh.position.set(99999, -1000, 99999);
                        }
                    _obsArray[i] = _obsArray[_obsArray.length - 1];
                    _obsArray.pop();
                    break;
                    }
                }
            }

            // Activate Rubble
            const rMesh = (ctx as any).busRubble;
            if (rMesh) {
                // sectorState.busRubbleActive = true; // Not strictly needed if we just check visibility
                rMesh.position.set(0, 0, 0); // [VINTERDÖD FIX] Snap to origin so absolute instance coordinates work
                rMesh.visible = true;
                rMesh.userData.active = true;
                if (rMesh.userData.hasLanded) rMesh.userData.hasLanded.fill(0);

                const data = rMesh.userData;
                for (let i = 0; i < rMesh.count; i++) {
                    const ix = i * 3;
                    const arcAngle = Math.random() * Math.PI * 2;
                    const power = 1.5 + Math.random();
                    const dirX = Math.cos(arcAngle) * power;
                    const dirZ = Math.sin(arcAngle) * power;
                    const dirY = 3.0 + Math.random() * 4.0; // More vertical burst
                    const speed = 15 + Math.random() * 25;

                    _v1.set(dirX, dirY, dirZ).normalize().multiplyScalar(speed);
                    data.velocities[ix] = _v1.x;
                    data.velocities[ix + 1] = _v1.y;
                    data.velocities[ix + 2] = _v1.z;

                    // [VINTERDÖD FIX] Use absolute world-space start coordinates
                    data.positions[ix] = EXPLODING_BUS_POS.x + (Math.random() - 0.5) * 8;
                    data.positions[ix + 1] = EXPLODING_BUS_POS.y + 1 + Math.random() * 2;
                    data.positions[ix + 2] = EXPLODING_BUS_POS.z + (Math.random() - 0.5) * 8;

                    if (!data.spin) data.spin = new Float32Array(rMesh.count * 3);
                    if (!data.rotations) data.rotations = new Float32Array(rMesh.count * 3);

                    data.spin[ix] = (Math.random() - 0.5) * 20;
                    data.spin[ix + 1] = (Math.random() - 0.5) * 20;
                    data.spin[ix + 2] = (Math.random() - 0.5) * 20;
                }

                // Activate Tires
                const tires = (ctx as any).busTires;
                if (tires) {
                    tires.position.set(0, 0, 0); // [VINTERDÖD FIX] Snap to origin
                    tires.visible = true;
                    tires.userData.active = true;
                    const tData = tires.userData;
                    tData.hasLanded.fill(0);
                    for (let i = 0; i < 4; i++) {
                        const ix = i * 3;
                        tData.positions[ix] = EXPLODING_BUS_POS.x + (Math.random() - 0.5) * 4;
                        tData.positions[ix + 1] = EXPLODING_BUS_POS.y + 2;
                        tData.positions[ix + 2] = EXPLODING_BUS_POS.z + (Math.random() - 0.5) * 4;

                        const angle = Math.random() * Math.PI * 2;
                        const tSpeed = 20 + Math.random() * 15;
                        tData.velocities[ix] = Math.cos(angle) * tSpeed * 0.5;
                        tData.velocities[ix + 1] = 18 + Math.random() * 12;
                        tData.velocities[ix + 2] = Math.sin(angle) * tSpeed * 0.5;

                        tData.spin[ix] = (Math.random() - 0.5) * 30;
                        tData.spin[ix + 1] = (Math.random() - 0.5) * 30;
                        tData.spin[ix + 2] = (Math.random() - 0.5) * 30;
                    }
                }
            }
        }

        // --- RUBBLE & TIRE PHYSICS ---
        _activeMeshCount = 0;
        const busRubble = (ctx as any).busRubble;
        const busTires = (ctx as any).busTires;

        if (busRubble && busRubble.userData.active) _activeMeshesScratch[_activeMeshCount++] = busRubble;
        if (busTires && busTires.userData.active) _activeMeshesScratch[_activeMeshCount++] = busTires;

        for (let mIdx = 0; mIdx < _activeMeshCount; mIdx++) {
            const rubble = _activeMeshesScratch[mIdx];
            const isTire = rubble === busTires;
            const rubbleWeight = isTire ? 35.0 : 75.0;
            const bouncy = isTire ? 0.5 : 0.2;
            const data = rubble.userData;
            let stillMoving = false;
            const elapsed = renderTime - (sectorState.busExplosionTime || 0);

            for (let i = 0; i < rubble.count; i++) {
                const ix = i * 3;

                // [VINTERDÖD FIX] Dynamic ground height lookup
                const groundY = (gameState.worldStreamer && gameState.worldStreamer.getGroundHeight)
                    ? gameState.worldStreamer.getGroundHeight(data.positions[ix], data.positions[ix + 2])
                    : 0.1;
                const minHeight = groundY + (isTire ? 0.8 : 0.2);

                const isAboveGround = data.positions[ix + 1] > minHeight;
                const hasVelY = Math.abs(data.velocities[ix + 1]) > 0.1;
                const hasVelX = Math.abs(data.velocities[ix]) > 0.1;
                const hasVelZ = Math.abs(data.velocities[ix + 2]) > 0.1;

                if (isAboveGround || hasVelY || hasVelX || hasVelZ) {
                    stillMoving = true;
                    const safeDelta = Math.min(delta, 0.05);

                    data.velocities[ix + 1] -= rubbleWeight * safeDelta;
                    data.positions[ix] += data.velocities[ix] * safeDelta;
                    data.positions[ix + 1] += data.velocities[ix + 1] * safeDelta;
                    data.positions[ix + 2] += data.velocities[ix + 2] * safeDelta;

                    if (data.positions[ix + 1] <= minHeight) {
                        data.positions[ix + 1] = minHeight;
                        data.velocities[ix] *= 0.6;
                        data.velocities[ix + 2] *= 0.6;
                        data.velocities[ix + 1] *= -bouncy;

                        if (data.spin) {
                            data.spin[ix] *= 0.6;
                            data.spin[ix + 1] *= 0.6;
                            data.spin[ix + 2] *= 0.6;
                        }

                        if (Math.abs(data.velocities[ix + 1]) < 1.0) data.velocities[ix + 1] = 0;
                        if (Math.abs(data.velocities[ix]) < 0.2) data.velocities[ix] = 0;
                        if (Math.abs(data.velocities[ix + 2]) < 0.2) data.velocities[ix + 2] = 0;

                        if (data.hasLanded && !data.hasLanded[i] && events.playSound && sectorState.busExplosionTime) {
                            // Only play impact sounds during the active explosion window (first 10 seconds)
                            if (simTime - sectorState.busExplosionTime < 10000) {
                                if (!isTire || Math.abs(data.velocities[ix + 1]) > 2) {
                                    events.playSound(isTire ? SoundID.IMPACT_METAL : SoundID.IMPACT_METAL);
                                }
                            }
                            if (Math.abs(data.velocities[ix + 1]) < 2) data.hasLanded[i] = 1;
                        }
                    }

                    if (data.rotations && data.spin) {
                        data.rotations[ix] += data.spin[ix] * safeDelta;
                        data.rotations[ix + 1] += data.spin[ix + 1] * safeDelta;
                        data.rotations[ix + 2] += data.spin[ix + 2] * safeDelta;
                    }

                    _position.set(data.positions[ix], data.positions[ix + 1], data.positions[ix + 2]);
                    if (data.rotations) {
                        _rotation.set(data.rotations[ix], data.rotations[ix + 1], data.rotations[ix + 2]);
                        _quat.setFromEuler(_rotation);
                    } else {
                        _quat.set(0, 0, 0, 1);
                    }

                    if (isTire) {
                        _scale.set(1, 1, 1);
                    } else {
                        const s = data.scales ? data.scales[i] : 1.0;
                        // [VINTERDÖD OPT] Varied bus-like shapes: Panels, Beams, Scrap
                        const type = i % 3;
                        if (type === 0) _scale.set(4.0 * s, 0.4 * s, 6.0 * s); // Huge Panels
                        else if (type === 1) _scale.set(1.5 * s, 0.5 * s, 10.0 * s); // Long Beams
                        else _scale.set(1.5 * s, 1.5 * s, 1.5 * s); // Scrap
                    }

                    _matrix.compose(_position, _quat, _scale);
                    rubble.setMatrixAt(i, _matrix);
                }
            }
            rubble.instanceMatrix.needsUpdate = true;
            if (!stillMoving || elapsed > 15000) {
                data.active = false;
            }
        }
    }
};
