import * as THREE from 'three';
import { SectorDef, SectorContext } from '../../types/sectors';
import { MATERIALS, createTextSprite, GEOMETRY } from '../../utils/assets';
import { t } from '../../utils/i18n';
import { SectorGenerator } from '../../core/world/SectorGenerator';
import { PathGenerator } from '../../core/world/PathGenerator';
import { EnvironmentGenerator } from '../../core/world/EnvironmentGenerator';
import { WaterSystem } from '../../core/systems/WaterSystem';
import { CAMERA_HEIGHT } from '../constants';
import { WeatherType } from '../../types';
import { TriggerHandler } from '../../core/systems/TriggerHandler';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

export const SECTOR6_ZONES = [
    { label: "FOREST OF SHADOWS", x: 0, z: -360, weather: 'rain', fogColor: 0x051105, fogDensity: 0.035, ambient: 0.2 },
    { label: "ABANDONED FARM", x: 342, z: 111, weather: 'none', fogColor: 0x050510, fogDensity: 0.01, ambient: 0.5 },
    { label: "THE VILLAGE", x: 211, z: -291, weather: 'ash', fogColor: 0x111111, fogDensity: 0.04, ambient: 0.3 },
    { label: "CRYSTAL LAKE", x: -211, z: -291, weather: 'snow', fogColor: 0x111133, fogDensity: 0.02, ambient: 0.35 },
    { label: "ANCIENT RUINS", x: -342, z: 111, weather: 'ember', fogColor: 0x221105, fogDensity: 0.03, ambient: 0.4 }
];

export const Sector6: SectorDef = {
    id: 5,
    name: "sectors.sector_6_name", // "The Playground"
    environment: {
        bgColor: 0x050510,
        fogDensity: 0.01,
        ambientIntensity: 0.4,
        groundColor: 0x111111,
        fov: 50,
        moon: { visible: true, color: 0x88ccff, intensity: 0.5 },
        cameraOffsetZ: 40,
        cameraHeight: CAMERA_HEIGHT,
        weather: 'none',
        weatherDensity: 0,
    },
    // Automatic Content
    groundType: 'NONE', // Custom handling via generate
    ambientLoop: 'ambient_wind_loop',

    playerSpawn: { x: 0, z: 0 },
    familySpawn: { x: 5, z: 5 }, // Just for safety
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

        // --- GLOBAL LIGHTING (Sun/Moon for Overrides) ---
        const sun = new THREE.DirectionalLight(0xffddaa, 1.0);
        sun.position.set(50, 100, 50);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 500;
        sun.shadow.camera.left = -200;
        sun.shadow.camera.right = 200;
        sun.shadow.camera.top = 200;
        sun.shadow.camera.bottom = -200;
        sun.name = 'SUN_LIGHT';
        scene.add(sun);

        const moon = new THREE.DirectionalLight(0x4444ff, 0.4);
        moon.position.set(-50, 100, -50);
        moon.name = 'MOON_LIGHT';
        scene.add(moon);

        const ambient = new THREE.AmbientLight(0x404040, 0.4);
        ambient.name = 'AMBIENT_LIGHT';
        scene.add(ambient);

        // --- GROUND (Gravel) ---
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), MATERIALS.gravel);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.8; // Lowered to prevent Z-fighting with water (y=0) and clipping when waves dip
        ground.receiveShadow = true;
        ground.userData = { isGround: true };
        scene.add(ground);

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
        armoryLabel.scale.set(6, 1.5, 1);
        scene.add(armoryLabel);

        // 2. Enemy Spawner (North)
        SectorGenerator.spawnTerminal(ctx, 0, -12, 'TERMINAL_SPAWNER');
        const spawnerLabel = createTextSprite(t('ui.enemy_spawner'));
        spawnerLabel.position.set(0, 3.5, -12);
        spawnerLabel.scale.set(6, 1.5, 1);
        scene.add(spawnerLabel);

        // 3. Environment Control (East)
        SectorGenerator.spawnTerminal(ctx, 12, 0, 'TERMINAL_ENV');
        const envLabel = createTextSprite(t('ui.environment_control'));
        envLabel.position.set(12, 3.5, 0);
        envLabel.scale.set(6, 1.5, 1);
        scene.add(envLabel);


        // --- PATHS TO BIOMES ---
        const pathRadius = 360; // 3x Scale (was 120)

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

        // 3. VILLAGE
        const p2 = SECTOR6_ZONES[2];
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                if (dx === 0 && dz === 0) continue;
                const hx = p2.x + dx * 35;
                const hz = p2.z + dz * 35;
                const house = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 10), MATERIALS.wooden_fasade);
                house.position.set(hx, 4, hz);
                house.castShadow = true;
                scene.add(house);
                SectorGenerator.addObstacle(ctx, { mesh: house, position: house.position, collider: { type: 'box', size: new THREE.Vector3(10, 10, 10) } });
            }
        }
        const campfire = new THREE.PointLight(0xff6600, 10, 60);
        campfire.position.set(p2.x, 2, p2.z);
        scene.add(campfire);

        // 4. WATER
        const p3 = SECTOR6_ZONES[3];
        // Create Water System and Lake

        // Initialize WaterSystem if not exists
        if (!ctx.state.sectorState.waterSystem) {
            ctx.state.sectorState.waterSystem = new WaterSystem(scene);
        }
        const ws = ctx.state.sectorState.waterSystem as WaterSystem;

        // Lake Surface - Scaled
        ws.addSurface(p3.x, p3.z, 200, 200, 'crystal', 'circle');

        // Add Sand/Beach logic later or manually place ring?

        // --- LARGE STONE WITH FOAM ---
        const bigStone = EnvironmentGenerator.createRock(12, 12); // Reduced height to look sunken? Or just big.
        bigStone.position.set(p3.x - 20, -2, p3.z + 15);
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

        // --- CUSTOM WOODEN BOAT ---
        const boatGroup = new THREE.Group();
        boatGroup.position.set(p3.x, 0.5, p3.z);
        boatGroup.rotation.y = Math.random() * Math.PI; // Random initial rotation

        // Material
        const boatMat = MATERIALS.wooden_fasade.clone();
        boatMat.color.setHex(0x5c4033); // Dark Wood

        // 1. Floor (Deck)
        const floorGeo = new THREE.BoxGeometry(3.0, 0.2, 7.0);
        const floor = new THREE.Mesh(floorGeo, boatMat);
        floor.position.y = 0.1;
        floor.castShadow = true;
        floor.receiveShadow = true;
        boatGroup.add(floor);

        // 2. Sides (Port & Starboard)
        const sideGeo = new THREE.BoxGeometry(0.2, 1.2, 7.0);

        const port = new THREE.Mesh(sideGeo, boatMat);
        port.position.set(1.6, 0.7, 0);
        port.rotation.z = -0.2; // Angle out
        port.castShadow = true;
        boatGroup.add(port);

        const starboard = new THREE.Mesh(sideGeo, boatMat);
        starboard.position.set(-1.6, 0.7, 0);
        starboard.rotation.z = 0.2; // Angle out
        starboard.castShadow = true;
        boatGroup.add(starboard);

        // 3. Stern (Back)
        const sternGeo = new THREE.BoxGeometry(3.4, 1.2, 0.2);
        const stern = new THREE.Mesh(sternGeo, boatMat);
        stern.position.set(0, 0.7, 3.5);
        stern.castShadow = true;
        boatGroup.add(stern);

        // 4. Bow (Front) - Tapered
        // We use two angled sides meeting at a point
        const bowLen = 2.5;
        const bowGeo = new THREE.BoxGeometry(0.2, 1.2, bowLen * 1.5); // Slightly longer to overlap

        const portBow = new THREE.Mesh(bowGeo, boatMat);
        portBow.position.set(0.8, 0.7, -4.2);
        portBow.rotation.y = -0.35; // Angle in
        portBow.rotation.z = -0.2;  // Angle out (match sides)
        portBow.castShadow = true;
        boatGroup.add(portBow);

        const starBow = new THREE.Mesh(bowGeo, boatMat);
        starBow.position.set(-0.8, 0.7, -4.2);
        starBow.rotation.y = 0.35; // Angle in
        starBow.rotation.z = 0.2;  // Angle out
        starBow.castShadow = true;
        boatGroup.add(starBow);

        // 5. Seats
        const seatGeo = new THREE.BoxGeometry(3.2, 0.1, 0.8);
        const seat1 = new THREE.Mesh(seatGeo, boatMat); seat1.position.set(0, 0.6, 1.5); boatGroup.add(seat1);
        const seat2 = new THREE.Mesh(seatGeo, boatMat); seat2.position.set(0, 0.6, -1.0); boatGroup.add(seat2);

        // 6. Keel/Detail (Optional)
        // Helps visually anchor it in water
        const keel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 9.0), boatMat);
        keel.position.y = -0.2;
        boatGroup.add(keel);


        boatGroup.castShadow = true;
        // boatGroup.receiveShadow = true; // Children cast shadow

        // Physics Data
        boatGroup.userData = {
            isBoat: true,
            velocity: new THREE.Vector3(),
            angularVelocity: new THREE.Vector3(),
            radius: 5,
            mass: 200,
            friction: 0.96,
            rotationalDrag: 0.95
        };

        scene.add(boatGroup);
        SectorGenerator.addObstacle(ctx, { mesh: boatGroup, position: boatGroup.position, radius: 7, collider: { type: 'box', size: new THREE.Vector3(5, 2, 12) } });

        // Interactive Ball
        // (Keep Ball logic below)

        // Interactive Ball
        const ball = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 16), new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.4, metalness: 0.1 }));
        ball.position.set(p3.x + 10, 5, p3.z + 10);
        ball.castShadow = true;
        ball.userData = { isBall: true, velocity: new THREE.Vector3(), angularVelocity: new THREE.Vector3(), radius: 1.5, mass: 5, friction: 0.98 };
        scene.add(ball);

        // Store for Physics Update
        ctx.state.sectorState.physicsProps = [boatGroup, ball, bigStone]; // Added bigStone here to be safe, though we pushed it earlier too. 
        // Actually, pushing twice is bad. 
        // The earlier push was: `(ctx.state.sectorState.physicsProps as any[]).push(bigStone);`
        // But `physicsProps` might be undefined then.
        // Let's just define it cleanly here.

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
    },

    onUpdate: (dt, now, playerPos, gameState, sectorState, events) => {
        if (sectorState.waterSystem) {
            sectorState.waterSystem.update(dt);
        }

        // Variable hoisting for scope access
        const weatherSystem = (events as any).weatherSystem;
        const scene = events.scene;

        // --- TRIGGER LOGIC (Critical for Stations) ---
        TriggerHandler.checkTriggers(playerPos, gameState, now, {
            spawnBubble: (t) => events.t(t), // Simplified bubble, usually managed by SectorSystem
            removeVisual: (id) => { },
            onClueFound: (clue) => {
                if (gameState?.stats?.cluesFound && gameState.stats.cluesFound.indexOf(clue.id) === -1) {
                    gameState.stats.cluesFound.push(clue.id);
                }
            },
            onTrigger: (type, duration) => { },
            onAction: (action) => {
                if (action.type === 'OPEN_UI') {
                    events.setInteraction({
                        id: `station_${action.payload.ui}`,
                        text: action.payload.ui === 'armory' ? events.t('ui.open_armory') :
                            action.payload.ui === 'spawner' ? events.t('ui.open_spawner') :
                                events.t('ui.open_env'),
                        action: () => {
                            // Managed by GameSession using ID detection
                        }
                    });
                }
            },
            collectedCluesRef: { current: gameState?.stats?.cluesFound || [] },
            t: events.t
        });

        // --- ATMOSPHERE LOGIC ---

        if (playerPos && weatherSystem && scene) {
            const px = playerPos.x;
            const pz = playerPos.z;

            let targetFogColor = new THREE.Color(0x050510); // Default
            let targetFogDensity = 0.01;
            // let targetAmbient = 0.4; // Valid if we can access ambient light

            // Check for manual override
            const override = sectorState.envOverride;
            if (override) {
                if (override.fogColor !== undefined) targetFogColor.setHex(override.fogColor);
                if (override.fogDensity !== undefined) targetFogDensity = override.fogDensity;

                // Apply Light Overrides
                events.setLight({
                    sunColor: override.sunColor !== undefined ? new THREE.Color(override.sunColor) : undefined,
                    // sunIntensity handled by generic prop if added? SectorSystem setLight doesn't handle intensity on lights directly yet, just ambient.
                    // SectorSystem.ts setLight impl:
                    // if (params.sunColor) sun.color.copy...
                    // It does NOT have sunIntensity. I should add it or accept it's color-based.
                    // existing code uses sun.intensity = override.sunIntensity.
                    // I will assume color handles brightness or ignore intensity for now, or update SectorSystem?
                    // I'll update SectorSystem later if needed, for now color is key.
                    moonColor: override.moonColor !== undefined ? new THREE.Color(override.moonColor) : undefined,
                });
                // We'll need to update SectorSystem to handle sunIntensity if we want full parity, but color is main request.

                // Apply Wind Override
                if (override.windDirection !== undefined && override.windStrength !== undefined) {
                    const rad = override.windDirection * (Math.PI / 180);
                    events.setWind(rad, override.windStrength);
                } else {
                    events.resetWind();
                }
            } else {
                events.resetWind();
            }

            let activeWeather: WeatherType = 'none';
            let maxWeight = 0;

            // Only calculate zone blending if NO hard overrides for fog?
            // Actually, override should probably take precedence. 
            // If override is active, we might skip zone logic for fog, but maybe keep weather?
            // User put weather toggles in the same UI.

            // Let's apply zone logic FIRST, then overwrite if override exists.

            if (!override) {
                // Check zones
                for (let i = 0; i < SECTOR6_ZONES.length; i++) {
                    const z = SECTOR6_ZONES[i];
                    const dist = Math.sqrt((px - z.x) ** 2 + (pz - z.z) ** 2);
                    const radius = 120;
                    const blendEnd = 180;

                    if (dist < blendEnd) {
                        let weight = 1.0;
                        if (dist > radius) {
                            weight = 1.0 - ((dist - radius) / (blendEnd - radius));
                        }

                        if (weight > maxWeight) {
                            maxWeight = weight;
                            activeWeather = z.weather as WeatherType;
                        }

                        if (weight > 0.5) {
                            targetFogColor.setHex(z.fogColor);
                            targetFogDensity = z.fogDensity;
                            // targetAmbient = z.ambient;
                        }
                    }
                }
            } else {
                // Even with override, we might want weather from zones? 
                // Or stick to current weather. 
                // The Station UI has weather buttons too, which update `gameState.weather`.
                // So `events.weatherSystem` should already be using `gameState.weather` via sync?
                // Wait, `weatherSystem.sync` is called IN THIS LOOP below.

                // If we have an override, we probably shouldn't auto-set weather from zones just by moving.
                // Let's assume Manual Mode disables Zone Auto-Weather.
            }

            // Re-apply override if needed (to ensure it beats zone logic)
            if (override) {
                if (override.fogColor !== undefined) targetFogColor.setHex(override.fogColor);
                if (override.fogDensity !== undefined) targetFogDensity = override.fogDensity;
            }

            // Apply Atmosphere
            if (scene.fog instanceof THREE.FogExp2) {
                scene.fog.color.lerp(targetFogColor, 0.05); // Faster lerp for responsiveness
                scene.fog.density = THREE.MathUtils.lerp(scene.fog.density, targetFogDensity, 0.05);
            }

            // Apply Weather (Only if NOT overridden, or if we want zones to still work?)
            // If user manually sets weather via UI, `gameState.weather` updates. 
            // But here we check `maxWeight > 0.6` to auto-set weather.
            // We should check if "Manual Mode" is on. 
            // `sectorState.envOverride` implies Manual Mode.

            if (!override) {
                if (maxWeight > 0.6) {
                    weatherSystem.sync(activeWeather, 1600);
                } else if (maxWeight < 0.3) {
                    weatherSystem.sync('none', 0);
                }
            }
        }

        // Physics Props Logic
        if (sectorState.physicsProps) {
            const props = sectorState.physicsProps as THREE.Mesh[];
            const waterSystem = sectorState.waterSystem as WaterSystem;

            // --- PLAYER WATER LOGIC ---
            if (waterSystem && playerPos) {
                const pBuoyancy = waterSystem.checkBuoyancy(playerPos.x, playerPos.y, playerPos.z);

                // Entry Splash
                if (pBuoyancy.inWater && !sectorState.playerWasInWater) {
                    waterSystem.spawnRipple(playerPos.x, playerPos.z, 3, 0.3);
                    // Play splash sound relative to player? 
                    // events.playSound('splash') if available, or just visual for now.
                    events.emitNoise(playerPos, 20, 'splash'); // Noise for AI
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
                if (!sectorState.lastPlayerPos) sectorState.lastPlayerPos = new THREE.Vector3();
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

                        // Splash on entry (simple check: if was not in water?)
                        // Requires storing prev state. For now just rely on impact.

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
                    if (ud.isBoat) {
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
                }
            }
        }
    }
};
