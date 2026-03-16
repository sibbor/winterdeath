import * as THREE from 'three';
import { SectorDef, SectorContext, AtmosphereZone } from '../../types/sector';
import { MATERIALS, createTextSprite, GEOMETRY } from '../../utils/assets';
import { t } from '../../utils/i18n';
import { SectorGenerator } from '../../core/world/SectorGenerator';
import { ObjectGenerator } from '../../core/world/ObjectGenerator';
import { PathGenerator } from '../../core/world/PathGenerator';
import { EnvironmentGenerator } from '../../core/world/EnvironmentGenerator';
import { CAMERA_HEIGHT } from '../constants';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
const _q1 = new THREE.Quaternion();
const _boatPos = new THREE.Vector3();

export const SECTOR6_ZONES: AtmosphereZone[] = [
    { label: "FOREST OF SHADOWS", x: 0, z: -360, weather: 'rain', bgColor: 0xff0000, fogDensity: 0.005, ambient: 0.2 },
    { label: "ABANDONED FARM", x: 342, z: 111, weather: 'none', bgColor: 0xff00ff, fogDensity: 0.005, ambient: 0.5 },
    { label: "THE VILLAGE", x: 211, z: -291, weather: 'ash', bgColor: 0xffeeee, fogDensity: 0.004, ambient: 0.3 },
    { label: "CRYSTAL LAKE", x: -211, z: -291, weather: 'snow', bgColor: 0x111133, fogDensity: 0.002, ambient: 0.35 },
    { label: "ANCIENT RUINS", x: -342, z: 111, weather: 'ember', bgColor: 0x0000ff, fogDensity: 0.003, ambient: 0.4 }
];

export const Sector6: SectorDef = {
    id: 5,
    name: "sectors.sector_6_name",
    environment: {
        bgColor: 0x020208,
        fogDensity: 0.02,
        ambientIntensity: 0.4,
        ambientColor: 0x404050,
        groundColor: 0x111111,
        fov: 50,
        skyLight: { visible: true, color: 0x6688ff, intensity: 10.0, position: { x: 50, y: 35, z: 50 } },
        cameraOffsetZ: 40,
        cameraHeight: CAMERA_HEIGHT,
        weather: {
            type: 'snow',
            particles: 2000
        },
        wind: {
            strengthMin: 0.05,
            strengthMax: 1.0,
            direction: { x: 1, z: 1 },
            angleVariance: Math.PI / 4
        }
    },
    atmosphereZones: SECTOR6_ZONES,
    groundType: 'SNOW',
    ambientLoop: 'ambient_wind_loop',

    playerSpawn: { x: 0, z: 0 },
    familySpawn: { x: 0, z: 0 },
    bossSpawn: null,

    collectibles: [],

    setupProps: async (ctx: SectorContext) => {
        const { scene } = ctx;

        // DUMMY COLLECTIBLE FOR TESTING
        SectorGenerator.spawnCollectible(ctx, 0, 15, 'dummy_badge_test', 'badge');

        // --- PLAZA (Center 0,0) ---
        // Circular concrete plaza
        const plazaGeo = new THREE.CylinderGeometry(20, 20, 0.6, 32);
        const plazaMat = MATERIALS.concrete;
        const plaza = new THREE.Mesh(plazaGeo, plazaMat);
        plaza.position.set(0, -0.25, 0);
        plaza.receiveShadow = true;
        scene.add(plaza);

        const ambient = new THREE.AmbientLight(0xffffee, 0.4);
        ambient.name = 'AMBIENT_LIGHT';
        scene.add(ambient);

        // Add some lights to the plaza - SHADOWS DISABLED TO PREVENT TEXTURE LIMIT CRASH
        const pl = new THREE.PointLight(0xffaa00, 50, 30);
        pl.position.set(0, 8, 0);
        pl.castShadow = false;
        scene.add(pl);

        // --- INTERACTION STATIONS (Circular Layout) ---
        const stationDist = 13; // Distance from center
        const s_scale = 1.5;   // Magnificent Scale

        // 1. Armory (West)
        SectorGenerator.spawnTerminal(ctx, -stationDist, 0, 'TERMINAL_ARMORY', s_scale);
        const armoryLabel = createTextSprite(t('stations.armory'));
        armoryLabel.position.set(-stationDist, 4.5, 0);
        armoryLabel.scale.set(10, 1.5, 1);
        scene.add(armoryLabel);

        // 2. Enemy Spawner (North)
        SectorGenerator.spawnTerminal(ctx, 0, -stationDist, 'TERMINAL_SPAWNER', s_scale);
        const spawnerLabel = createTextSprite(t('ui.enemy_spawner'));
        spawnerLabel.position.set(0, 4.5, -stationDist);
        spawnerLabel.scale.set(10, 1.5, 1);
        scene.add(spawnerLabel);

        // 3. Environment Control (East)
        SectorGenerator.spawnTerminal(ctx, stationDist, 0, 'TERMINAL_ENV', s_scale);
        const envLabel = createTextSprite(t('ui.environment_control'));
        envLabel.position.set(stationDist, 4.5, 0);
        envLabel.scale.set(10, 1.5, 1);
        scene.add(envLabel);

        // 4. Skill Station (South)
        SectorGenerator.spawnTerminal(ctx, 0, stationDist, 'TERMINAL_SKILLS', s_scale);
        const skillLabel = createTextSprite(t('stations.skills'));
        skillLabel.position.set(0, 4.5, stationDist);
        skillLabel.scale.set(10, 1.5, 1);
        scene.add(skillLabel);

        // Helper for POI Markers
        const addPoiLabel = (label: string, pos: { x: number, z: number }) => {
            const sprite = createTextSprite(label);
            sprite.position.set(pos.x, 25, pos.z);
            sprite.scale.set(20, 5, 1);
            scene.add(sprite);
        };

        // Vehicles at the spawn point
        SectorGenerator.spawnDriveableVehicle(ctx, -20, 10, Math.PI / 1, 'sedan', undefined, false);
        SectorGenerator.spawnDriveableVehicle(ctx, 0, 30, Math.PI / 2, 'timber_truck', undefined, false);
        SectorGenerator.spawnDriveableVehicle(ctx, -20, 20, Math.PI / 3, 'bus', undefined, false);
        SectorGenerator.spawnDriveableVehicle(ctx, 20, 10, Math.PI / 4, 'police', undefined, false);
        SectorGenerator.spawnDriveableVehicle(ctx, 20, 20, Math.PI / 5, 'ambulance', undefined, false);


        // --- BIOME GENERATION ---
        // Iterate through ZONES to generate content
        for (let i = 0; i < SECTOR6_ZONES.length; i++) {
            const zone = SECTOR6_ZONES[i];
            const angle = (i / SECTOR6_ZONES.length) * Math.PI * 2;

            const x = zone.x;
            const z = zone.z;

            // Curved Path from Center to Zone
            const curve = new THREE.QuadraticBezierCurve3(
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(x * 0.5 + Math.sin(angle + 1.5) * 90, 0, z * 0.5 + Math.cos(angle + 1.5) * 90),
                new THREE.Vector3(x, 0, i == 3 ? z + 70 : z)
            );
            const points = curve.getPoints(60);

            // Generate Path
            PathGenerator.createPath(ctx, points, 4, MATERIALS.dirt);

            // Add POI Label
            addPoiLabel(zone.label, { x, z });
        }

        // 1. FOREST
        const p0 = SECTOR6_ZONES[0];
        EnvironmentGenerator.createForest(ctx, { x: p0.x, z: p0.z, w: 180, d: 180 }, 120, 'PINE');
        for (let j = 0; j < 30; j++) {
            const rX = p0.x + (Math.random() - 0.5) * 160;
            const rZ = p0.z + (Math.random() - 0.5) * 160;
            if (Math.abs(rX - p0.x) < 15 && Math.abs(rZ - p0.z) < 15) continue;
            const rock = EnvironmentGenerator.createRock(4 + Math.random() * 4, 2 + Math.random() * 2);
            rock.position.set(rX, 0, rZ);
            scene.add(rock);
            SectorGenerator.addObstacle(ctx, { mesh: rock, position: rock.position, radius: 4, collider: { type: 'sphere', radius: 3 } });
        }

        // 2. FARM
        const p1 = SECTOR6_ZONES[1];
        const farmRect = [
            new THREE.Vector3(p1.x - 90, 0, p1.z - 90),
            new THREE.Vector3(p1.x + 90, 0, p1.z - 90),
            new THREE.Vector3(p1.x + 90, 0, p1.z + 90),
            new THREE.Vector3(p1.x - 90, 0, p1.z + 90),
        ];
        EnvironmentGenerator.fillWheatField(ctx, farmRect, 0.4);

        // --- Tractor (Driveable) ---
        SectorGenerator.spawnDriveableVehicle(ctx, p1.x, p1.z, Math.random() * Math.PI, 'tractor');

        // 3. VILLAGE
        const p2 = SECTOR6_ZONES[2];
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
                SectorGenerator.addObstacle(ctx, { mesh: house, position: house.position, collider: { type: 'box', size: new THREE.Vector3(10, 8, 10) } });
            }
        }

        // --- Car (Driveable) ---
        SectorGenerator.spawnDriveableVehicle(ctx, p2.x, p2.z, Math.PI / 2, 'station_wagon');

        // 4. WATER
        const p3 = SECTOR6_ZONES[3];

        // 4.1. Create the water body (The Lake) + Recessed Bed
        const lake = SectorGenerator.addLake(ctx, p3.x, p3.z, 75, 5.0);

        // 4.2. Large stone
        const bigStone = EnvironmentGenerator.createRock(35, 15, 10);
        bigStone.position.set(p3.x - 30, -2, p3.z + 20);
        bigStone.scale.set(1.5, 1.2, 1.5);
        scene.add(bigStone);

        SectorGenerator.addObstacle(ctx, {
            mesh: bigStone,
            position: bigStone.position,
            radius: 10,
            collider: { type: 'sphere', radius: 10 }
        });

        // Register as splash source for the new 'splash' particles
        if (lake) lake.registerSplashSource(bigStone);

        // 4.3. Boat
        const boatGroup = SectorGenerator.spawnFloatableVehicle(ctx, p3.x, p3.z, Math.random() * Math.PI);
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
            collider: { type: 'sphere', radius: 1.5 },
            type: 'Ball'
        };
        SectorGenerator.addObstacle(ctx, ballObstacle);

        // Save references in state so we can update physics in onUpdate
        ctx.state.interactiveBall = ball;
        ctx.state.interactiveBallObs = ballObstacle;

        // 5. SURPRISE
        const p4 = SECTOR6_ZONES[4];
        // Ruins / Pillars
        for (let k = 0; k < 12; k++) { // More pillars
            const ang = (k / 12) * Math.PI * 2;
            const px = p4.x + Math.sin(ang) * 40; // Wider circle
            const pz = p4.z + Math.cos(ang) * 40;
            const pillar = new THREE.Mesh(new THREE.BoxGeometry(4, 15 + Math.random() * 10, 4), MATERIALS.concrete);
            pillar.position.set(px, 8, pz);
            pillar.castShadow = true;
            scene.add(pillar);
            SectorGenerator.addObstacle(ctx, { mesh: pillar, position: pillar.position, collider: { type: 'box', size: new THREE.Vector3(4, 30, 4) } });
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
            const rock = EnvironmentGenerator.createRock(8, 8);
            rock.position.set(
                pondCenter.x + Math.cos(angle) * (pondRadius + 5),
                -2,
                pondCenter.z + Math.sin(angle) * (pondRadius + 5)
            );
            scene.add(rock);
            SectorGenerator.addObstacle(ctx, { mesh: rock, position: rock.position, radius: 5, collider: { type: 'sphere', radius: 5 } });
        }
    },

    onInteract: (id: string, object: THREE.Object3D, state: any, events: any) => {
        // VEHICLES
        if (object.userData.vehicleDef) {
            state.activeVehicle = object;
            return;
        }

        // STATIONS
        if (id === 'TERMINAL_ARMORY') {
            events.setOverlay('STATION_ARMORY');
        }
        else if (id === 'TERMINAL_SPAWNER') {
            events.setOverlay('STATION_SPAWNER');
        }
        else if (id === 'TERMINAL_ENV') {
            events.setOverlay('STATION_ENVIRONMENT');
        }
        else if (id === 'TERMINAL_SKILLS') {
            events.setOverlay('STATION_SKILLS');
        }
    },

    onUpdate: (dt, now, playerPos, gameState, sectorState, events) => {
        // Extract the ball from state
        const ball = sectorState.interactiveBall;
        const obs = sectorState.interactiveBallObs;

        if (ball && obs) {
            const vel = ball.userData.velocity as THREE.Vector3;

            // Only run physics if the ball actually has speed (optimized)
            if (vel.lengthSq() > 0.001) {
                // 1. Apply speed in X and Z (Y is controlled by the WaterSystem)
                ball.position.x += vel.x * dt;
                ball.position.z += vel.z * dt;

                // 2. Roll the ball visually!
                ball.rotation.x += vel.z * dt * 0.5;
                ball.rotation.z -= vel.x * dt * 0.5;

                // 3. Friction (gradually slows down the ball)
                vel.multiplyScalar(ball.userData.friction || 0.96);

                // 4. Sync the collision box so the player can't walk straight through it
                obs.position.copy(ball.position);

                // Update the SpatialGrid so physics match rendering
                if (gameState.collisionGrid && typeof gameState.collisionGrid.updateObstacle === 'function') {
                    gameState.collisionGrid.updateObstacle(obs);
                }
            }
        }
    }
};