import * as THREE from 'three';
import { SectorDef, SectorContext, AtmosphereZone } from '../../types/SectorEnvironment';
import { MATERIALS, createTextSprite, GEOMETRY } from '../../utils/assets';
import { t } from '../../utils/i18n';
import { SectorGenerator } from '../../core/world/SectorGenerator';
import { ObjectGenerator } from '../../core/world/ObjectGenerator';
import { PathGenerator } from '../../core/world/PathGenerator';
import { EnvironmentGenerator } from '../../core/world/EnvironmentGenerator';
import { WaterSystem } from '../../core/systems/WaterSystem';
import { WeatherSystem } from '../../core/systems/WeatherSystem';
import { WindSystem } from '../../core/systems/WindSystem';
import { CAMERA_HEIGHT } from '../constants';
import { TriggerHandler } from '../../core/systems/TriggerHandler';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
const _q1 = new THREE.Quaternion();

// Water ripples
const _lastPlayerRipple: number = 0;
const _lastBoatRipple: number = 0;
const _boatPos = new THREE.Vector3(); // Zero-GC scratchpad

export const SECTOR6_ZONES: AtmosphereZone[] = [
    { label: "FOREST OF SHADOWS", x: 0, z: -360, weather: 'rain', bgColor: 0xff0000, fogDensity: 0.035, ambient: 0.2 },
    { label: "ABANDONED FARM", x: 342, z: 111, weather: 'none', bgColor: 0xff00ff, fogDensity: 0.01, ambient: 0.5 },
    { label: "THE VILLAGE", x: 211, z: -291, weather: 'ash', bgColor: 0xffeeee, fogDensity: 0.04, ambient: 0.3 },
    { label: "CRYSTAL LAKE", x: -211, z: -291, weather: 'snow', bgColor: 0x111133, fogDensity: 0.02, ambient: 0.35 },
    { label: "ANCIENT RUINS", x: -342, z: 111, weather: 'ember', bgColor: 0x0000ff, fogDensity: 0.03, ambient: 0.4 }
];

export const Sector6: SectorDef = {
    id: 5,
    name: "sectors.sector_6_name",
    environment: {
        bgColor: 0xffff00,
        fogDensity: 0.01,
        ambientIntensity: 0.4,
        groundColor: 0x111111,
        fov: 50,
        skyLight: { visible: true, color: 0x88ccff, intensity: 0.5, position: { x: 50, y: 100, z: 50 } },
        cameraOffsetZ: 40,
        cameraHeight: CAMERA_HEIGHT,
        weather: 'rain',
        weatherDensity: 0.5,
    },
    atmosphereZones: SECTOR6_ZONES,
    groundType: 'GRAVEL',
    ambientLoop: 'ambient_wind_loop',

    playerSpawn: { x: 0, z: -0 },
    familySpawn: { x: 0, z: 0 },
    bossSpawn: { x: 0, z: -100 },

    collectibles: [],

    setupProps: async (ctx: SectorContext) => {
        const { scene } = ctx;

        // --- PLAZA (Center 0,0) ---
        // Circular concrete plaza
        const plazaGeo = new THREE.CylinderGeometry(20, 20, 0.5, 32);
        const plazaMat = MATERIALS.concrete;
        const plaza = new THREE.Mesh(plazaGeo, plazaMat);
        plaza.position.set(0, -0.25, 0);
        plaza.receiveShadow = true;
        scene.add(plaza);

        const ambient = new THREE.AmbientLight(0x404040, 0.4);
        ambient.name = 'AMBIENT_LIGHT';
        scene.add(ambient);

        // --- GROUND (Gravel) ---
        /*
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), MATERIALS.gravel);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.8; // Lowered to prevent Z-fighting with water (y=0) and clipping when waves dip
        ground.receiveShadow = true;
        ground.userData = { isGround: true };
        scene.add(ground);
        */

        // Add some lights to the plaza
        const pl = new THREE.PointLight(0xffaa00, 5, 30);
        pl.position.set(0, 8, 0);
        pl.castShadow = true;
        scene.add(pl);

        // --- INTERACTION STATIONS ---
        // 1. Armory (West)
        SectorGenerator.spawnTerminal(ctx, -12, 0, 'TERMINAL_ARMORY');
        const armoryLabel = createTextSprite(t('stations.armory'));
        armoryLabel.position.set(-12, 3.5, 0);
        armoryLabel.scale.set(10, 1.5, 1);
        scene.add(armoryLabel);

        // 2. Enemy Spawner (North)
        SectorGenerator.spawnTerminal(ctx, 0, -12, 'TERMINAL_SPAWNER');
        const spawnerLabel = createTextSprite(t('ui.enemy_spawner'));
        spawnerLabel.position.set(0, 3.5, -12);
        spawnerLabel.scale.set(10, 1.5, 1);
        scene.add(spawnerLabel);

        // 3. Environment Control (East)
        SectorGenerator.spawnTerminal(ctx, 12, 0, 'TERMINAL_ENV');
        const envLabel = createTextSprite(t('ui.environment_control'));
        envLabel.position.set(12, 3.5, 0);
        envLabel.scale.set(10, 1.5, 1);
        scene.add(envLabel);

        // Helper for POI Markers
        const addPoiLabel = (label: string, pos: { x: number, z: number }) => {
            const sprite = createTextSprite(label);
            sprite.position.set(pos.x, 25, pos.z);
            sprite.scale.set(20, 5, 1);
            scene.add(sprite);
        };

        // --- BIOME GENERATION ---
        // Iterate through ZONES to generate content
        for (let i = 0; i < SECTOR6_ZONES.length; i++) {
            const zone = SECTOR6_ZONES[i];
            const angle = (i / SECTOR6_ZONES.length) * Math.PI * 2;

            // Re-calc position just to be safe/consistent with curve logic 
            // (or trust zone.x/z if I update SECTOR6_ZONES correctly)
            const x = zone.x;
            const z = zone.z;

            // Curved Path from Center to Zone
            const curve = new THREE.QuadraticBezierCurve3(
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(x * 0.5 + Math.sin(angle + 1.5) * 90, 0, z * 0.5 + Math.cos(angle + 1.5) * 90),
                new THREE.Vector3(x, 0, z)
            );
            const points = curve.getPoints(60);

            // Generate Path
            if (i === 3) { // Water/Lake Path
                PathGenerator.createGravelPath(ctx, points, 8);
            } else {
                PathGenerator.createGravelPath(ctx, points, 8);
            }

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

        // --- Tractor ---
        const tractor = ObjectGenerator.createVehicle('tractor');

        // Calculate position and rotation upfront. Avoid math inside loops if this is part of one.
        tractor.position.set(p1.x, 0.5, p1.z);
        tractor.rotation.y = Math.random() * Math.PI;

        // Physics Data
        tractor.userData = {
            id: 'tractor_1',
            vehicleDef: {
                type: 'CAR',
                speed: 40,
                turnSpeed: 2.5,
                acceleration: 15.0,
                friction: 0.98,
                mass: 1000,
                drag: 0.92,
                seats: 2,
                forward: { x: 0, y: 0, z: 1 }
            },
            interactionRadius: 8.0,
            velocity: new THREE.Vector3(),
            angularVelocity: new THREE.Vector3(),
            radius: 5
        };

        SectorGenerator.addInteractable(ctx, tractor, {
            id: 'tractor_1',
            label: 'ui.enter_vehicle',
            type: 'sector_specific',
            radius: 8.0
        });

        scene.add(tractor);
        SectorGenerator.addObstacle(ctx, { mesh: tractor, position: tractor.position, radius: 7, collider: { type: 'box', size: new THREE.Vector3(5, 2, 12) } });


        // 3. VILLAGE
        const p2 = SECTOR6_ZONES[2];
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                if (dx === 0 && dz === 0) continue;
                const hx = p2.x + dx * 35;
                const hz = p2.z + dz * 35;
                const house = ObjectGenerator.createBuilding(10, 8, 10, 0xffffff, true, true, 0.2);
                house.position.set(hx, 4, hz);
                house.castShadow = true;

                scene.add(house);
                SectorGenerator.addObstacle(ctx, { mesh: house, position: house.position, collider: { type: 'box', size: new THREE.Vector3(10, 8, 10) } });
            }
        }

        // --- CAR ---
        const car = ObjectGenerator.createVehicle('station_wagon');

        // Calculate position and rotation upfront. Avoid math inside loops if this is part of one.
        car.position.set(p2.x, 0.5, p2.z);
        car.rotation.y = Math.PI / 0.5;

        // Physics Data
        car.userData = {
            id: 'car_1',
            vehicleDef: {
                type: 'CAR',
                speed: 150, // Max speed
                turnSpeed: 5.0,
                acceleration: 15.0,
                friction: 0.98,
                mass: 1500,
                drag: 0.92,
                seats: 5,
                forward: { x: 0, y: 0, z: 1 }
            },
            interactionRadius: 8.0,
            velocity: new THREE.Vector3(),
            angularVelocity: new THREE.Vector3(),
            radius: 5
        };

        SectorGenerator.addInteractable(ctx, car, {
            id: 'car_1',
            label: 'ui.enter_vehicle',
            type: 'sector_specific',
            radius: 8.0
        });

        scene.add(car);
        SectorGenerator.addObstacle(ctx, { mesh: car, position: car.position, radius: 7, collider: { type: 'box', size: new THREE.Vector3(5, 2, 12) } });


        // 4. WATER
        const p3 = SECTOR6_ZONES[3];

        // Initialize WaterSystem if not exists
        if (!ctx.state.sectorState.waterSystem) {
            ctx.state.sectorState.waterSystem = new WaterSystem(scene);
        }
        const waterSystem = ctx.state.sectorState.waterSystem as WaterSystem;

        // Lake Surface - Scaled
        waterSystem.addSurface(p3.x, p3.z, 200, 200, 'crystal', 'circle');

        // --- LARGE STONE WITH FOAM ---
        const bigStone = EnvironmentGenerator.createRock(35, 15); // Reduced height to look sunken? Or just big.
        bigStone.position.set(p3.x - 30, -2, p3.z + 20);
        bigStone.scale.set(1.5, 1.2, 1.5);
        scene.add(bigStone);
        SectorGenerator.addObstacle(ctx, { mesh: bigStone, position: bigStone.position, radius: 10, collider: { type: 'sphere', radius: 10 } });

        // Permanent splash/foam effect stored in userData for the update loop to find
        bigStone.userData.isSplashSource = true;
        bigStone.userData.velocity = new THREE.Vector3(); // Prevent crash
        ctx.state.sectorState.physicsProps = ctx.state.sectorState.physicsProps || [];
        // Note: We add it to physicsProps in the array definition below

        // Actually, better to handle the effect separately or make it "static" in physics.
        bigStone.userData.isStatic = true;

        // --- WOODEN BOAT ---
        const boatGroup = ObjectGenerator.createBoat();

        // Calculate position and rotation upfront. Avoid math inside loops if this is part of one.
        boatGroup.position.set(p3.x, 0.5, p3.z);
        boatGroup.rotation.y = Math.random() * Math.PI;

        // Physics Data
        boatGroup.userData = {
            id: 'boat_1',
            vehicleDef: {
                type: 'BOAT',
                speed: 15,
                turnSpeed: 1.5,
                acceleration: 8.0,
                friction: 0.98,
                mass: 200,
                drag: 0.92,
                seats: 2,
                forward: { x: 0, y: 0, z: 1 }
            },
            interactionRadius: 8.0,
            velocity: new THREE.Vector3(),
            angularVelocity: new THREE.Vector3(),
            radius: 5
        };

        SectorGenerator.addInteractable(ctx, boatGroup, {
            id: 'boat_1',
            label: 'ui.enter_vehicle',
            type: 'sector_specific',
            radius: 8.0
        });

        scene.add(boatGroup);
        SectorGenerator.addObstacle(ctx, { mesh: boatGroup, position: boatGroup.position, radius: 7, collider: { type: 'box', size: new THREE.Vector3(5, 2, 12) } });

        // Interactive Ball
        const ball = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 16), new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.4, metalness: 0.1 }));
        ball.position.set(p3.x + 10, 5, p3.z + 10);
        ball.castShadow = true;
        ball.userData = { isBall: true, velocity: new THREE.Vector3(), angularVelocity: new THREE.Vector3(), radius: 1.5, mass: 5, friction: 0.98 };
        scene.add(ball);

        // Store for Physics Update
        ctx.state.sectorState.physicsProps = [boatGroup, ball];
        if (bigStone) (ctx.state.sectorState.physicsProps as any[]).push(bigStone);

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
            window.dispatchEvent(new CustomEvent('open_station', { detail: { type: 'armory' } }));
        }
        else if (id === 'TERMINAL_SPAWNER') {
            window.dispatchEvent(new CustomEvent('open_station', { detail: { type: 'spawner' } }));
        }
        else if (id === 'TERMINAL_ENV') {
            window.dispatchEvent(new CustomEvent('open_station', { detail: { type: 'environment' } })); // Check correct type string
        }
    },

    onUpdate: (dt, now, playerPos, gameState, sectorState, events) => {
        // Environment systems are now owned by the Engine
        const waterSystem = gameState.engine.water;
        const weatherSystem = gameState.engine.weather;
        const windSystem = gameState.engine.wind;

        if (waterSystem) {

            const scene = events.scene;

            // Physics Props Logic
            if (sectorState.physicsProps) {
                const props = sectorState.physicsProps as THREE.Mesh[];

                // --- PLAYER WATER LOGIC ---
                if (playerPos) {
                    const pBuoyancy = waterSystem.checkBuoyancy(playerPos.x, playerPos.y, playerPos.z);

                    // Entry Splash
                    if (pBuoyancy.inWater && !sectorState.playerWasInWater) {
                        waterSystem.spawnRipple(playerPos.x, playerPos.z, 3, 0.3);
                        events.emitNoise(playerPos, 20, 'splash');
                    }

                    // Moving Ripples
                    if (pBuoyancy.inWater) {
                        // Check movement
                        if (sectorState.lastPlayerPos) {
                            const dist = playerPos.distanceTo(sectorState.lastPlayerPos);
                            if (dist > 0.1 && Math.random() < 0.5) {
                                waterSystem.spawnRipple(playerPos.x, playerPos.z, 1.5, 0.1);
                            }
                        }
                    }

                    // Update State
                    sectorState.playerWasInWater = pBuoyancy.inWater;
                    if (!sectorState.lastPlayerPos) sectorState.lastPlayerPos = new THREE.Vector3(); // One-time allocation
                    sectorState.lastPlayerPos.copy(playerPos);
                }

                for (let i = 0; i < props.length; i++) {
                    const prop = props[i];
                    const ud = prop.userData;
                    const pos = prop.position;

                    // 1. Gravity / Buoyancy
                    if (!ud.isStatic) {
                        const buoyancy = waterSystem ? waterSystem.checkBuoyancy(pos.x, pos.y, pos.z) : { inWater: false, waterLevel: 0 };

                        if (buoyancy.inWater) {
                            // Float
                            const depth = buoyancy.waterLevel - pos.y;
                            if (depth > 0) {
                                // Upward force (Buoyancy) - stronger if deeper
                                ud.velocity.y += depth * 10 * dt;
                                // Damping in water
                                ud.velocity.multiplyScalar(0.9);
                            }

                            // Water Current / Bobbing
                            ud.velocity.y += Math.sin(now * 0.003 + pos.x) * 0.05 * dt;

                            // Ripples if moving
                            const speed = Math.sqrt(ud.velocity.x * ud.velocity.x + ud.velocity.z * ud.velocity.z);
                            if (speed > 0.5 && Math.random() < 0.3) {
                                waterSystem.spawnRipple(pos.x, pos.z, 2, 0.1);
                            }

                            // Splash Particles (if fast)
                            if (speed > 2.0 && Math.random() < 0.15) {
                                // Assuming spawnPart exists on ctx, if not we might need to use ctx.callbacks or sim
                                if ((events as any).spawnPart) (events as any).spawnPart(pos.x, 0.1, pos.z, 'splash', 3);
                            }

                        } else {
                            // Gravity
                            ud.velocity.y -= 20 * dt;
                        }

                        // 2. Player Collision (Simple Radial Push)
                        _v1.copy(playerPos).setY(pos.y); // Player pos at same height
                        const distSq = pos.distanceToSquared(_v1);
                        const combinedRadius = ud.radius + 1.0; // Player radius approx 1.0

                        if (distSq < combinedRadius * combinedRadius) {
                            // Push
                            _v2.subVectors(pos, _v1).normalize();
                            const force = 10.0; // Push strength
                            ud.velocity.addScaledVector(_v2, force * dt);

                            // Also wake up if sleeping?
                        }

                        // 3. Integrate
                        pos.addScaledVector(ud.velocity, dt * 10); // Scale velocity to match game units/speed? Or just dt

                        // Ground Floor collision (lake bed?)
                        if (pos.y < -5) {
                            pos.y = -5;
                            ud.velocity.y = 0;
                        }

                        // Directional Drag for Boat
                        if (ud.vehicleDef?.type === 'BOAT') {
                            const savedY = ud.velocity.y;
                            // Forward
                            _v3.set(0, 0, 1).applyQuaternion(prop.quaternion);
                            // Right
                            _v2.set(1, 0, 0).applyQuaternion(prop.quaternion);

                            const fSpeed = ud.velocity.dot(_v3);
                            const rSpeed = ud.velocity.dot(_v2);

                            // Reconstruct with asymmetric friction
                            ud.velocity.copy(_v3).multiplyScalar(fSpeed * 0.98).add(_v2.multiplyScalar(rSpeed * 0.90));
                            ud.velocity.y = savedY;

                            if (ud.angularVelocity) {
                                prop.rotation.y += ud.angularVelocity.y * dt;
                                ud.angularVelocity.multiplyScalar(0.95);
                            }
                        } else {
                            // Standard Friction
                            ud.velocity.multiplyScalar(ud.friction || 0.98);
                        }

                        // Update Matrix
                        prop.updateMatrixWorld();
                    }

                    // Splash Source (Big Stone)
                    if (ud.isSplashSource && waterSystem) {
                        if (Math.random() < 0.3) {
                            waterSystem.spawnRipple(pos.x + (Math.random() - 0.5) * 6, pos.z + (Math.random() - 0.5) * 6, 5, 0.2);
                        }
                        events.spawnPart(pos.x, 0, pos.z, 'foam', 1);
                    }
                }
            }
        }
    }
};