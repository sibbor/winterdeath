import * as THREE from 'three';
import { SectorDef, SectorContext, AtmosphereZone } from '../../game/session/SectorTypes';
import { MATERIALS } from '../../utils/assets';
import { t } from '../../utils/i18n';
import { SectorBuilder } from '../../core/world/SectorBuilder';
import { ObjectGenerator } from '../../core/world/generators/ObjectGenerator';
import { PathGenerator } from '../../core/world/generators/PathGenerator';
import { NaturePropGenerator } from '../../core/world/generators/NaturePropGenerator';
import { VehicleGenerator } from '../../core/world/generators/VehicleGenerator';
import { GeneratorUtils } from '../../core/world/generators/GeneratorUtils';
import { InteractionType } from '../../systems/InteractionTypes';
import { SoundID } from '../../utils/audio/AudioTypes';
import { NoiseType } from '../../entities/enemies/EnemyBase';
import { VEGETATION_TYPE } from '../../content/environment';
import { CAMERA_HEIGHT } from '../constants';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
const _q1 = new THREE.Quaternion();
const _boatPos = new THREE.Vector3();

// Zero-GC for the bus experiment
const _busOriginalPos = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _rotation = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();

const EXPLODING_BUS_ID = 'playground_bus_explode';
const EXPLODING_BUS_POS = { x: 40, y: 1.5, z: -40 };

export const SECTOR6_ZONES: AtmosphereZone[] = [
    { label: "FOREST OF SHADOWS", x: 0, z: -360, weather: 'rain', bgColor: 0xff0000, fogDensity: 0.005, ambient: 0.2 },
    { label: "ABANDONED FARM", x: 342, z: 111, weather: 'none', bgColor: 0xff00ff, fogDensity: 0.005, ambient: 0.5 },
    { label: "THE VILLAGE", x: 211, z: -291, weather: 'ash', bgColor: 0xffeeee, fogDensity: 0.004, ambient: 0.3 },
    { label: "CRYSTAL LAKE", x: -211, z: -291, weather: 'snow', bgColor: 0x111133, fogDensity: 0.002, ambient: 0.35 },
    { label: "ANCIENT RUINS", x: -342, z: 111, weather: 'ember', bgColor: 0x0000ff, fogDensity: 0.003, ambient: 0.4 }
];

export const Sector4: SectorDef = {
    id: 4,
    name: "sectors.sector_4_name",
    environment: {
        bgColor: 0x020208,
        fog: {
            density: 0.02,
            color: 0x020208,
            height: 10
        },
        ambientIntensity: 0.4,
        ambientColor: 0x404050,
        groundColor: 0x111111,
        fov: 50,
        skyLight: { visible: true, color: 0x6688ff, intensity: 1.0, position: { x: 50, y: 35, z: 50 } },
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
        SectorBuilder.spawnCollectible(ctx, 0, 15, 'dummy_badge_test', 'badge');

        // --- PLAZA (Center 0,0) ---
        // Circular concrete plaza
        const plazaGeo = new THREE.CylinderGeometry(20, 20, 0.6, 32);
        const plazaMat = MATERIALS.concrete;
        const plaza = new THREE.Mesh(plazaGeo, plazaMat);
        plaza.position.set(0, -0.25, 0);
        plaza.receiveShadow = true;
        scene.add(plaza);

        // Add some lights to the plaza - SHADOWS DISABLED TO PREVENT TEXTURE LIMIT CRASH
        const pl = new THREE.PointLight(0xffaa00, 50, 30);
        pl.position.set(0, 8, 0);
        pl.castShadow = false;
        scene.add(pl);

        // --- INTERACTION STATIONS (Circular Layout) ---
        const stationDist = 13; // Distance from center
        const s_scale = 1.5;   // Magnificent Scale

        // 1. Armory (West)
        SectorBuilder.spawnTerminal(ctx, -stationDist, 0, 'TERMINAL_ARMORY', s_scale);
        const armoryLabel = ObjectGenerator.createTextSprite(t('stations.armory'));
        armoryLabel.position.set(-stationDist, 4.5, 0);
        armoryLabel.scale.set(10, 1.5, 1);
        scene.add(armoryLabel);

        // 2. Enemy Spawner (North)
        SectorBuilder.spawnTerminal(ctx, 0, -stationDist, 'TERMINAL_SPAWNER', s_scale);
        const spawnerLabel = ObjectGenerator.createTextSprite(t('ui.enemy_spawner'));
        spawnerLabel.position.set(0, 4.5, -stationDist);
        spawnerLabel.scale.set(10, 1.5, 1);
        scene.add(spawnerLabel);

        // 3. Environment Control (East)
        SectorBuilder.spawnTerminal(ctx, stationDist, 0, 'TERMINAL_ENV', s_scale);
        const envLabel = ObjectGenerator.createTextSprite(t('ui.environment_control'));
        envLabel.position.set(stationDist, 4.5, 0);
        envLabel.scale.set(10, 1.5, 1);
        scene.add(envLabel);

        // 4. Skill Station (South)
        SectorBuilder.spawnTerminal(ctx, 0, stationDist, 'TERMINAL_SKILLS', s_scale);
        const skillLabel = ObjectGenerator.createTextSprite(t('stations.skills'));
        skillLabel.position.set(0, 4.5, stationDist);
        skillLabel.scale.set(10, 1.5, 1);
        scene.add(skillLabel);

        // Helper for POI Markers
        const addPoiLabel = (label: string, pos: { x: number, z: number }) => {
            const sprite = ObjectGenerator.createTextSprite(label);
            sprite.position.set(pos.x, 25, pos.z);
            sprite.scale.set(20, 5, 1);
            scene.add(sprite);
        };

        // Vehicles at the spawn point
        SectorBuilder.spawnDriveableVehicle(ctx, -20, 10, Math.PI / 1, 'sedan', undefined, false);
        SectorBuilder.spawnDriveableVehicle(ctx, 0, 30, Math.PI / 2, 'timber_truck', undefined, false);
        SectorBuilder.spawnDriveableVehicle(ctx, -20, 20, Math.PI / 3, 'bus', undefined, false);
        SectorBuilder.spawnDriveableVehicle(ctx, 20, 10, Math.PI / 4, 'police', undefined, false);
        SectorBuilder.spawnDriveableVehicle(ctx, 20, 20, Math.PI / 5, 'ambulance', undefined, false);


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
        const forestPoly = [
            new THREE.Vector3(p0.x - 90, 0, p0.z - 90),
            new THREE.Vector3(p0.x + 90, 0, p0.z - 90),
            new THREE.Vector3(p0.x + 90, 0, p0.z + 90),
            new THREE.Vector3(p0.x - 90, 0, p0.z + 90),
        ];
        SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.PINE, forestPoly, 8);
        for (let j = 0; j < 30; j++) {
            const rX = p0.x + (Math.random() - 0.5) * 160;
            const rZ = p0.z + (Math.random() - 0.5) * 160;
            if (Math.abs(rX - p0.x) < 15 && Math.abs(rZ - p0.z) < 15) continue;
            const rock = NaturePropGenerator.createRock(4 + Math.random() * 4, 2 + Math.random() * 2);
            rock.position.set(rX, 0, rZ);
            scene.add(rock);
            SectorBuilder.addObstacle(ctx, { mesh: rock, position: rock.position, radius: 4, collider: { type: 'sphere', radius: 3 } });
        }

        // 2. FARM
        const p1 = SECTOR6_ZONES[1];
        const farmRect = [
            new THREE.Vector3(p1.x - 90, 0, p1.z - 90),
            new THREE.Vector3(p1.x + 90, 0, p1.z - 90),
            new THREE.Vector3(p1.x + 90, 0, p1.z + 90),
            new THREE.Vector3(p1.x - 90, 0, p1.z + 90),
        ];
        SectorBuilder.fillVegetation(ctx, VEGETATION_TYPE.WHEAT, farmRect, 0.4);

        // --- Tractor (Driveable) ---
        SectorBuilder.spawnDriveableVehicle(ctx, p1.x, p1.z, Math.random() * Math.PI, 'tractor');

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
                SectorBuilder.addObstacle(ctx, { mesh: house, position: house.position, collider: { type: 'box', size: new THREE.Vector3(10, 8, 10) } });
            }
        }

        // --- Car (Driveable) ---
        SectorBuilder.spawnDriveableVehicle(ctx, p2.x, p2.z, Math.PI / 2, 'station_wagon');

        // 4. WATER
        const p3 = SECTOR6_ZONES[3];

        // 4.1. Create the water body (The Lake) + Recessed Bed
        const lake = SectorBuilder.addLake(ctx, p3.x, p3.z, 75, 5.0);

        // 4.2. Large stone
        const bigStone = NaturePropGenerator.createRock(35, 15, 10);
        bigStone.position.set(p3.x - 30, -2, p3.z + 20);
        bigStone.scale.set(1.5, 1.2, 1.5);
        scene.add(bigStone);

        SectorBuilder.addObstacle(ctx, {
            mesh: bigStone,
            position: bigStone.position,
            radius: 10,
            collider: { type: 'sphere', radius: 10 }
        });

        // Register as splash source for the new 'splash' particles
        if (lake) lake.registerSplashSource(bigStone);

        // 4.3. Boat
        const boatGroup = SectorBuilder.spawnFloatableVehicle(ctx, p3.x, p3.z, Math.random() * Math.PI);
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
        SectorBuilder.addObstacle(ctx, ballObstacle);

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
            SectorBuilder.addObstacle(ctx, { mesh: pillar, position: pillar.position, collider: { type: 'box', size: new THREE.Vector3(4, 30, 4) } });
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
            SectorBuilder.addObstacle(ctx, { mesh: rock, position: rock.position, radius: 5, collider: { type: 'sphere', radius: 5 } });
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

        const obstacle_bus = { id: EXPLODING_BUS_ID, mesh: colMesh, collider: { type: 'box' as const, size: busSize } };
        SectorBuilder.addObstacle(ctx, obstacle_bus);
        SectorBuilder.setOnFire(ctx, bus, { smoke: true, intensity: 25, distance: 50, onRoof: true });

        SectorBuilder.addInteractable(ctx, bus, {
            id: EXPLODING_BUS_ID,
            label: 'ui.interact_blow_up_bus',
            type: InteractionType.SECTOR_SPECIFIC,
            radius: 15.0
        });
        bus.userData.isInteractable = true;

        // Store references
        (ctx as any).busObject = bus;
        (ctx as any).busColMesh = colMesh;

        // Rubble
        const rubble = SectorBuilder.spawnRubble(ctx, EXPLODING_BUS_POS.x, EXPLODING_BUS_POS.z, 20, MATERIALS.busBlue, Math.PI);
        rubble.position.y = -1000; // Hide initially
        rubble.visible = false;
        rubble.userData.hasLanded = new Uint8Array(rubble.count);
        (ctx as any).busRubble = rubble;
    },

    onInteract: (id: string, object: THREE.Object3D, state: any, events: any) => {
        // VEHICLES
        if (object.userData.vehicleDef) {
            state.vehicle.active = true;
            state.vehicle.mesh = object;
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

        // BUS EXPLOSION
        if (id === EXPLODING_BUS_ID) {
            if (state.sectorState.busExploded || state.sectorState.busPlanting) return;

            state.sectorState.busPlanting = true;
            state.sectorState.busPlantingTime = state.simTime;
            object.userData.isInteractable = false;

            if (events.spawnBubble) events.spawnBubble("Planting explosives...", 500);
            if (events.playSound) events.playSound(SoundID.IMPACT_METAL);
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
                // Update the SpatialGrid so physics match rendering
                if (gameState.collisionGrid && typeof gameState.collisionGrid.updateObstacle === 'function') {
                    gameState.collisionGrid.updateObstacle(obs);
                }
            }
        }

        // --- BUS EXPLOSION EXPERIMENT ---
        if (sectorState.busExploded && !sectorState.busExplosionHandled) {
            sectorState.busExplosionHandled = true;
            sectorState.busExplosionTime = now;

            if (events.playSound) events.playSound(SoundID.EXPLOSION);
            if (events.cameraShake) events.cameraShake(5);

            _busOriginalPos.set(EXPLODING_BUS_POS.x, EXPLODING_BUS_POS.y, EXPLODING_BUS_POS.z);

            if (events.spawnPart) {
                events.spawnPart(_busOriginalPos.x, 2, _busOriginalPos.z, 'shockwave', 1);
                events.spawnPart(_busOriginalPos.x, 2, _busOriginalPos.z, 'large_smoke', 5);
                events.spawnPart(_busOriginalPos.x, 3, _busOriginalPos.z, 'debris', 15);
            }

            if (events.makeNoise) {
                events.makeNoise(_busOriginalPos.clone(), NoiseType.OTHER, 100);
            }

            // Clear bus
            const _busObj = (sectorState.ctx as any).busObject as THREE.Object3D | null;
            const _obsArray = sectorState.ctx.obstacles;

            if (_busObj) {
                SectorBuilder.extinguishFire(sectorState.ctx, _busObj);
                _busObj.visible = false;
                _busObj.position.set(0, -1000, 0);
                _busObj.updateMatrixWorld(true);
                (sectorState.ctx as any).busObject = null;
            }

            if (_obsArray) {
                for (let i = 0; i < _obsArray.length; i++) {
                    const o = _obsArray[i];
                    if (o && o.id === EXPLODING_BUS_ID) {
                        o.collider.size?.set(0, 0, 0);
                        if (o.position) o.position.set(99999, -1000, 99999);
                        if (o.mesh) {
                            o.mesh.position.set(99999, -1000, 99999);
                            o.mesh.visible = false;
                            o.mesh.updateMatrixWorld(true);
                        }
                        _obsArray.splice(i, 1);
                        break;
                    }
                }
            }

            // Activate Rubble
            const rMesh = (sectorState.ctx as any).busRubble;
            if (rMesh) {
                sectorState.busRubble = rMesh;
                rMesh.position.set(_busOriginalPos.x, _busOriginalPos.y, _busOriginalPos.z);
                rMesh.visible = true;
                rMesh.userData.active = true;
                if (rMesh.userData.hasLanded) rMesh.userData.hasLanded.fill(0);

                const data = rMesh.userData;
                for (let i = 0; i < rMesh.count; i++) {
                    const ix = i * 3;
                    const arcAngle = Math.random() * Math.PI * 2;
                    const power = 1.0 + Math.random();
                    const dirX = Math.cos(arcAngle) * power;
                    const dirZ = Math.sin(arcAngle) * power;
                    const dirY = 1.0 + Math.random() * 1.5;
                    const speed = 15 + Math.random() * 20;

                    _v1.set(dirX, dirY, dirZ).normalize().multiplyScalar(speed);
                    data.velocities[ix] = _v1.x;
                    data.velocities[ix + 1] = _v1.y;
                    data.velocities[ix + 2] = _v1.z;

                    data.positions[ix] = (Math.random() - 0.5) * 4;
                    data.positions[ix + 1] = 2 + Math.random() * 2;
                    data.positions[ix + 2] = (Math.random() - 0.5) * 4;

                    // Initialize spin and rotation arrays if they don't exist
                    if (!data.spin) data.spin = new Float32Array(rMesh.count * 3);
                    if (!data.rotations) data.rotations = new Float32Array(rMesh.count * 3);

                    data.spin[ix] = (Math.random() - 0.5) * 10;
                    data.spin[ix + 1] = (Math.random() - 0.5) * 10;
                    data.spin[ix + 2] = (Math.random() - 0.5) * 10;
                }
            }
        }

        // Rubble Physics
        if (sectorState.busRubble && sectorState.busRubble.userData.active) {
            const rubble = sectorState.busRubble;
            const rubbleWeight = 25.0; // [VINTERDÖD FIX] Calibrated for realistic gravity
            const data = rubble.userData;
            let stillMoving = false;
            const elapsed = now - sectorState.busExplosionTime;

            for (let i = 0; i < rubble.count; i++) {
                const ix = i * 3;
                const isAboveGround = data.positions[ix + 1] > 0.5;
                const hasVelY = Math.abs(data.velocities[ix + 1]) > 0.1;
                const hasVelX = Math.abs(data.velocities[ix]) > 0.1;
                const hasVelZ = Math.abs(data.velocities[ix + 2]) > 0.1;

                if (isAboveGround || hasVelY || hasVelX || hasVelZ) {
                    stillMoving = true;
                    const safeDt = Math.min(dt, 0.05);

                    data.velocities[ix + 1] -= rubbleWeight * safeDt;
                    data.positions[ix] += data.velocities[ix] * safeDt;
                    data.positions[ix + 1] += data.velocities[ix + 1] * safeDt;
                    data.positions[ix + 2] += data.velocities[ix + 2] * safeDt;

                    if (data.positions[ix + 1] <= 0.5) {
                        data.positions[ix + 1] = 0.5;
                        data.velocities[ix] *= 0.6;
                        data.velocities[ix + 2] *= 0.6;
                        data.velocities[ix + 1] *= -0.4;

                        if (data.spin) {
                            data.spin[ix] *= 0.5;
                            data.spin[ix + 1] *= 0.5;
                            data.spin[ix + 2] *= 0.5;
                        }

                        if (Math.abs(data.velocities[ix + 1]) < 1.0) data.velocities[ix + 1] = 0;
                        if (Math.abs(data.velocities[ix]) < 0.2) data.velocities[ix] = 0;
                        if (Math.abs(data.velocities[ix + 2]) < 0.2) data.velocities[ix + 2] = 0;

                        if (data.hasLanded && !data.hasLanded[i] && events.playSound) {
                            data.hasLanded[i] = 1;
                            events.playSound(SoundID.IMPACT_METAL);
                        }
                    }

                    if (data.rotations && data.spin) {
                        data.rotations[ix] += data.spin[ix] * safeDt;
                        data.rotations[ix + 1] += data.spin[ix + 1] * safeDt;
                        data.rotations[ix + 2] += data.spin[ix + 2] * safeDt;
                    }

                    _position.set(data.positions[ix], data.positions[ix + 1], data.positions[ix + 2]);
                    if (data.rotations) {
                        _rotation.set(data.rotations[ix], data.rotations[ix + 1], data.rotations[ix + 2]);
                        _quat.setFromEuler(_rotation);
                    } else {
                        _quat.set(0, 0, 0, 1);
                    }

                    const s = data.scales ? data.scales[i] : 1.0;
                    _scale.set(1.5 * s, 0.05 * s, 3.0 * s);

                    _matrix.compose(_position, _quat, _scale);
                    rubble.setMatrixAt(i, _matrix);
                }
            }
            rubble.instanceMatrix.needsUpdate = true;
            if (!stillMoving || elapsed > 10000) {
                data.active = false;
            }
        }
    }
};