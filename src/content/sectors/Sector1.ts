import * as THREE from 'three';
import { SectorDef, SectorContext } from '../../types/sectors';
import { MATERIALS, GEOMETRY, createTextSprite } from '../../utils/assets';
import { SectorBuilder } from '../../core/world/SectorGenerator';

const R_OFFSET = Math.PI / 2;

export const Sector1: SectorDef = {
    id: 0,
    name: "maps.village_name",
    environment: {
        bgColor: 0x020208,
        fogDensity: 0.02,
        ambientIntensity: 0.6,
        groundColor: 0xddddff,
        fov: 50,
        moon: { visible: true, color: 0x6688ff, intensity: 0.6 },
        cameraOffsetZ: 40,
        weather: 'snow'
    },

    // --- ADJUST SPAWN POINTS HERE ---
    playerSpawn: { x: 22, z: 5 }, // Backyard
    familySpawn: { x: 241, z: -703, y: 0 }, // Loke's spawn location
    bossSpawn: { x: 250, z: -710 },

    // Cinematic Camera Setup
    cinematic: {
        offset: { x: 15, y: 12, z: 15 }, // Lower, more intimate angle
        lookAtOffset: { x: 0, y: 1.5, z: 0 }, // Look slightly up at heads
        rotationSpeed: 0.05 // Slow orbit for dramatic effect
    },

    generate: (ctx: SectorContext) => {
        const { scene, obstacles, flickeringLights, burningBarrels, triggers } = ctx;

        // Roads
        const roadMat = MATERIALS.asphalt;

        // Road 1
        for (let i = 0; i < 5; i++) {
            const segment = new THREE.Mesh(new THREE.PlaneGeometry(100, 16), roadMat);
            segment.rotation.x = -Math.PI / 2;
            segment.position.set(100 + i * 100, 0.02, 220);
            segment.receiveShadow = true;
            scene.add(segment);
        }

        // Road 2
        for (let i = 0; i < 3; i++) {
            const segment = new THREE.Mesh(new THREE.PlaneGeometry(16, 100), roadMat);
            segment.rotation.x = -Math.PI / 2;
            segment.position.set(350, 0.03, 100 + i * 100);
            segment.receiveShadow = true;
            scene.add(segment);
        }

        // Path
        for (let i = 0; i < 2; i++) {
            const segment = new THREE.Mesh(new THREE.PlaneGeometry(100, 8), roadMat);
            segment.rotation.x = -Math.PI / 2;
            segment.position.set(550 + i * 100, 0.02, 250);
            segment.receiveShadow = true;
            scene.add(segment);
        }

        // Lamps
        for (let z = -100; z > -500; z -= 30) { const p = { x: 210, z: z }; SectorBuilder.spawnStreetLamp(ctx, p.x, p.z); }
        for (let x = 100; x < 350; x += 30) { const p = { x: x, z: -340 }; SectorBuilder.spawnStreetLamp(ctx, p.x, p.z); }

        // Villa (Start)
        SectorBuilder.spawnDebugMarker(ctx, 0, 0, 12, "HOME");
        const villaGroup = new THREE.Group(); villaGroup.position.set(0, 0, 15);
        const villaBody = new THREE.Mesh(new THREE.BoxGeometry(20, 7, 14), new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.8 }));
        villaBody.position.y = 3.5; villaBody.castShadow = true; villaGroup.add(villaBody);
        const villaRoof = new THREE.Mesh(new THREE.ConeGeometry(16, 6, 4), MATERIALS.blackMetal);
        villaRoof.position.y = 10;
        villaRoof.rotation.y = Math.PI / 4;
        villaGroup.add(villaRoof);
        villaGroup.rotation.y = R_OFFSET;
        scene.add(villaGroup);
        obstacles.push({ mesh: villaGroup, collider: { type: 'box', size: new THREE.Vector3(20, 20, 14) } });

        // Burning Car
        const carPos = { x: 22, z: 5 };
        SectorBuilder.spawnCar(ctx, carPos.x, carPos.z, 0.3 + R_OFFSET);
        const carFire = new THREE.PointLight(0xff4400, 15, 30); carFire.position.set(carPos.x, 4, carPos.z); scene.add(carFire);
        flickeringLights.push({ light: carFire, baseInt: 10, flickerRate: 0.4 });
        burningBarrels.push({ position: new THREE.Vector3(carPos.x, 2, carPos.z) });

        // POIs
        const pSmu = { x: 120, z: -80 };
        SectorBuilder.spawnDebugMarker(ctx, pSmu.x, pSmu.z, 10, "SMU-GÅRDEN");
        const smu = new THREE.Mesh(new THREE.BoxGeometry(50, 10, 50), new THREE.MeshStandardMaterial({ color: 0x752020 }));
        smu.position.set(pSmu.x, 5, pSmu.z); smu.castShadow = true; scene.add(smu);
        obstacles.push({ mesh: smu, collider: { type: 'box', size: new THREE.Vector3(50, 20, 50) } });

        const fireL = new THREE.PointLight(0xff4400, 20, 60); fireL.position.set(pSmu.x, 8, pSmu.z + 10); scene.add(fireL);
        flickeringLights.push({ light: fireL, baseInt: 15, flickerRate: 0.5 });
        burningBarrels.push({ position: new THREE.Vector3(pSmu.x, 5, pSmu.z) });

        // Church 
        const pChurch = { x: 250, z: -320 };
        SectorBuilder.spawnDebugMarker(ctx, pChurch.x, pChurch.z, 15, "CHURCH");
        const churchGroup = new THREE.Group(); churchGroup.position.set(pChurch.x, 0, pChurch.z);
        churchGroup.rotation.y = R_OFFSET;
        const churchBody = new THREE.Mesh(new THREE.BoxGeometry(15, 12, 15), MATERIALS.brownBrick);
        churchBody.position.y = 6; churchGroup.add(churchBody);
        const tower = new THREE.Mesh(new THREE.BoxGeometry(4, 8, 4), MATERIALS.blackMetal);
        tower.position.set(10, 4, 10); churchGroup.add(tower);
        const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 0.2), MATERIALS.crossEmissive);
        const crossH = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.5, 0.2), MATERIALS.crossEmissive);
        crossV.position.set(0, 8, 7.6); crossH.position.set(0, 8.5, 7.6);
        churchGroup.add(crossV); churchGroup.add(crossH);
        scene.add(churchGroup);
        obstacles.push({ mesh: churchGroup, collider: { type: 'box', size: new THREE.Vector3(15, 20, 15) } });

        const cFire = new THREE.PointLight(0xff6600, 10, 40); cFire.position.set(pChurch.x, 6, pChurch.z); scene.add(cFire);
        flickeringLights.push({ light: cFire, baseInt: 8, flickerRate: 0.3 });
        burningBarrels.push({ position: new THREE.Vector3(pChurch.x, 2, pChurch.z) });

        // Café 
        const pCafe = { x: 210, z: -350 };
        SectorBuilder.spawnDebugMarker(ctx, pCafe.x, pCafe.z, 12, "CAFÉ");
        const cafe = new THREE.Mesh(new THREE.BoxGeometry(15, 12, 12), MATERIALS.yellowBrick);
        cafe.position.set(pCafe.x, 6, pCafe.z); cafe.rotation.y = R_OFFSET; cafe.castShadow = true; scene.add(cafe);
        obstacles.push({ mesh: cafe, collider: { type: 'box', size: new THREE.Vector3(15, 20, 12) } });
        const cafeSign = createTextSprite("Café"); cafeSign.position.set(0, 3, 6.5); cafe.add(cafeSign);

        // Grocery Store
        const pGroc = { x: 240, z: -450 };
        SectorBuilder.spawnDebugMarker(ctx, pGroc.x, pGroc.z, 8, "GROCERY");
        const grocery = new THREE.Mesh(new THREE.BoxGeometry(15, 6, 30), MATERIALS.concrete);
        grocery.position.set(pGroc.x, 3, pGroc.z); grocery.rotation.y = R_OFFSET; grocery.castShadow = true; scene.add(grocery);
        obstacles.push({ mesh: grocery, collider: { type: 'box', size: new THREE.Vector3(15, 20, 30) } });
        const grocSign = createTextSprite("Mataffär"); grocSign.scale.set(8, 2, 1); grocSign.position.set(-8, 2, 0); grocSign.rotation.y = -Math.PI / 2; grocery.add(grocSign);

        // Gym 
        const pGym = { x: 180, z: -430 };
        SectorBuilder.spawnDebugMarker(ctx, pGym.x, pGym.z, 10, "GYM");
        const gym = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 20), MATERIALS.metalPanel);
        gym.position.set(pGym.x, 4, pGym.z); gym.rotation.y = R_OFFSET; gym.castShadow = true; scene.add(gym);
        obstacles.push({ mesh: gym, collider: { type: 'box', size: new THREE.Vector3(20, 20, 20) } });
        const gymSign = createTextSprite("GYM"); gymSign.position.set(0, 3, 10.1); gym.add(gymSign);

        // Pizzeria
        const pPizza = { x: 280, z: -380 };
        SectorBuilder.spawnDebugMarker(ctx, pPizza.x, pPizza.z, 6, "PIZZERIA");
        const pizza = new THREE.Mesh(new THREE.BoxGeometry(12, 5, 12), MATERIALS.brownBrick);
        pizza.position.set(pPizza.x, 2.5, pPizza.z); pizza.rotation.y = R_OFFSET; scene.add(pizza);
        obstacles.push({ mesh: pizza, collider: { type: 'box', size: new THREE.Vector3(12, 10, 12) } });

        // Train Yard
        const pYard = { x: 250, z: -700 };
        SectorBuilder.spawnDebugMarker(ctx, pYard.x, pYard.z, 10, "TRAINYARD");

        // Use new RailTrack generator
        const trackStart = new THREE.Vector3(pYard.x, 0, pYard.z - 50);
        const trackEnd = new THREE.Vector3(pYard.x, 0, pYard.z + 50);
        const tStart = new THREE.Vector3(pYard.x - 50, 0, pYard.z);
        const tEnd = new THREE.Vector3(pYard.x + 50, 0, pYard.z);

        SectorBuilder.createRailTrack(ctx, tStart, tEnd);

        const gravel = new THREE.Mesh(new THREE.PlaneGeometry(120, 40), MATERIALS.gravel);
        gravel.rotation.x = -Math.PI / 2; gravel.position.set(pYard.x, 0.05, pYard.z); gravel.receiveShadow = true; scene.add(gravel);

        // Train
        const loco = new THREE.Group(); loco.position.set(pYard.x, 0, pYard.z); loco.rotation.y = R_OFFSET; // Centered
        const lBody = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 4.5), MATERIALS.train); lBody.position.y = 3; loco.add(lBody);
        const lCab = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 4.6), MATERIALS.train); lCab.position.set(4, 6, 0); loco.add(lCab);
        scene.add(loco);
        obstacles.push({ mesh: loco, collider: { type: 'box', size: new THREE.Vector3(14, 10, 4.5) } });

        // Locomotive Smoke (For Gym Sequence)
        const smokeEmitter = new THREE.Group();
        smokeEmitter.position.set(pYard.x - 4, 7, pYard.z);
        scene.add(smokeEmitter);
        // The FX System in GameCanvas needs to see this to spawn particles? 
        // Or we just add it to burningBarrels list for auto-smoke?
        // Let's force a burning barrel entry high up to simulate smoke stack
        burningBarrels.push({ position: new THREE.Vector3(pYard.x - 4, 7, pYard.z) });

        // The Bus (Blocker)
        const pBus = { x: 250, z: -535 };
        SectorBuilder.spawnDebugMarker(ctx, pBus.x, pBus.z, 8, "BUS");
        const bus = new THREE.Group(); bus.position.set(pBus.x, 0, pBus.z); bus.rotation.y = R_OFFSET;
        const busBody = new THREE.Mesh(new THREE.BoxGeometry(4.5, 4.5, 14), new THREE.MeshStandardMaterial({ color: 0x1133aa }));
        busBody.position.y = 2.25; bus.add(busBody);
        scene.add(bus);
        obstacles.push({ mesh: bus, collider: { type: 'box', size: new THREE.Vector3(4.5, 10, 14) }, id: 'gate' });

        const busFire = new THREE.PointLight(0xffaa00, 8, 30); busFire.position.set(pBus.x, 5, pBus.z); scene.add(busFire);
        burningBarrels.push({ position: new THREE.Vector3(pBus.x, 3, pBus.z) });

        // Ground Plane (Snow) - Restored & Lowered
        const groundGeo = new THREE.PlaneGeometry(2000, 2000);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0xddddff, // Snow White
            roughness: 1.0,
            metalness: 0.1
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.5; // Prevent Z-fighting
        ground.receiveShadow = true;
        scene.add(ground);

        // OPTIMIZED TREES (InstancedMesh)
        // Draw 300 trees with only 2 draw calls!
        const treeCount = 300;
        const trunkGeo = GEOMETRY.treeTrunk;
        const leavesGeo = GEOMETRY.treeLeaves;
        const trunkMat = MATERIALS.treeTrunk;
        const leavesMat = MATERIALS.treeLeaves;

        const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
        const leaves = new THREE.InstancedMesh(leavesGeo, leavesMat, treeCount);
        trunks.castShadow = true;
        leaves.castShadow = true;
        trunks.receiveShadow = true;
        leaves.receiveShadow = true;

        const dummy = new THREE.Object3D();

        for (let i = 0; i < treeCount; i++) {
            const xRaw = (Math.random() - 0.5) * 500;
            const zRaw = -Math.random() * 600;

            // Exclusion Zone (Town Center)
            if (xRaw > 150 && xRaw < 300 && zRaw < -250 && zRaw > -500) {
                // Skip if inside town, but we lose a tree count. 
                // To keep count exact we'd use a while loop, but this is fine for now.
                // Reset matrix to 0 scale to hide it
                dummy.scale.set(0, 0, 0);
                dummy.updateMatrix();
                trunks.setMatrixAt(i, dummy.matrix);
                leaves.setMatrixAt(i, dummy.matrix);
                continue;
            }

            const scale = 0.8 + Math.random() * 1.0;

            // Trunk
            dummy.position.set(xRaw, 2 * scale, zRaw);
            dummy.rotation.set(0, Math.random() * Math.PI, 0);
            dummy.scale.set(scale, scale, scale);
            dummy.updateMatrix();
            trunks.setMatrixAt(i, dummy.matrix);

            // Leaves
            dummy.position.set(xRaw, 8 * scale, zRaw);
            dummy.rotation.set(0, Math.random() * Math.PI, 0); // Rotate leaves differently?
            dummy.scale.set(scale * 1.5, scale * 1.5, scale * 1.5);
            dummy.updateMatrix();
            leaves.setMatrixAt(i, dummy.matrix);

            // Basic Collision (One sphere at base)
            obstacles.push({
                mesh: new THREE.Mesh(), // Dummy mesh for logic
                collider: { type: 'sphere', radius: 2 * scale },
                // We need to manually inject position because mesh is empty
            });
            // Fix: Override position on the obstacle object wrapper if possible, 
            // or just create a cheap invisible mesh for physics if collision is critical.
            // For now, let's skip collision on background trees to save CPU cycles.
        }

        scene.add(trunks);
        scene.add(leaves);

        const posCollectible1 = { x: 204, z: -95 };
        const posCollectible2 = { x: 265, z: -445 };

        // --- TRIGGERS ---
        triggers.push(
            // Collectibles (Action: 1 SP Reward)
            { id: 's1_collectible_1', position: posCollectible1, radius: 2, type: 'COLLECTIBLE', content: "clues.s1_collectible_1", description: "clues.s1_collectible_1_description", triggered: false, icon: "s1_collectible_1_icon", actions: [{ type: 'GIVE_REWARD', payload: { sp: 1 } }] },
            { id: 's1_collectible_2', position: posCollectible2, radius: 10, type: 'COLLECTIBLE', content: "clues.s1_collectible_2", description: "clues.s1_collectible_2_description", triggered: false, icon: "s1_collectible_2_icon", actions: [{ type: 'GIVE_REWARD', payload: { sp: 1 } }] },

            // Clues (Action: 50 XP Reward)
            { id: 's1_start_tracks', position: { x: 18, z: 4 }, radius: 10, type: 'THOUGHTS', content: "clues.s1_start_tracks", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's1_blood_stains', position: { x: 34, z: 47 }, radius: 10, type: 'THOUGHTS', content: "clues.s1_blood_stains", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's1_phone_thought', position: { x: 146, z: -50 }, radius: 4, type: 'THOUGHTS', content: "clues.s1_phone_thought", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's1_still_tracking', position: { x: 200, z: -150 }, radius: 15, type: 'THOUGHTS', content: "clues.s1_still_tracking", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's1_town_center', position: { x: 200, z: -250 }, radius: 100, type: 'THOUGHTS', content: "clues.s1_town_center", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's1_tunnel_blocked', position: { x: 250, z: -535 }, radius: 10, type: 'THOUGHTS', content: "clues.s1_tunnel_blocked", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's1_tunnel_cleared', position: { x: 250, z: -560 }, radius: 10, type: 'THOUGHTS', content: "clues.s1_tunnel_cleared", triggered: false },

            // POIs (Action: 250 XP Reward)
            { id: 's1_poi_building_on_fire', position: { x: 120, z: -80 }, radius: 50, type: 'POI', content: "clues.s1_poi_building_on_fire", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 250 } }] },
            { id: 's1_poi_church', position: { x: 250, z: -320 }, radius: 20, type: 'POI', content: "clues.s1_poi_church", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 250 } }] },
            { id: 's1_poi_cafe', position: { x: 210, z: -350 }, radius: 20, type: 'POI', content: "clues.s1_poi_cafe", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 250 } }] },
            { id: 's1_poi_pizzeria', position: { x: 280, z: -380 }, radius: 20, type: 'POI', content: "clues.s1_poi_pizzeria", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 250 } }] },
            { id: 's1_poi_grocery', position: { x: 240, z: -450 }, radius: 20, type: 'POI', content: "clues.s1_poi_grocery", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 250 } }] },
            { id: 's1_poi_train_yard', position: { x: 250, z: -700 }, radius: 30, type: 'POI', content: "clues.s1_poi_train_yard", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 250 } }] },

            // --- THE GYM EVENT (Trigger #4) ---
            {
                id: 's1_gym_event',
                position: pGym, // {x: 180, z: -430}
                radius: 15,
                type: 'EVENT',
                content: "clues.s1_poi_gym", // Keep original text as fallback/context
                triggered: false,
                actions: [
                    { type: 'GIVE_REWARD', payload: { xp: 250 } }, // Reward for finding Gym
                    { type: 'CAMERA_SHAKE', payload: { amount: 2.0 } },
                    { type: 'PLAY_SOUND', payload: { id: 'explosion' } },
                    // Pan to Train Yard
                    { type: 'CAMERA_PAN', payload: { target: { x: 250, z: -700 }, duration: 2000 } },
                    // After pan (using delay)
                    { type: 'SHOW_TEXT', payload: { text: "What the hell was that?!" }, delay: 2500 },
                    // Start Wave
                    { type: 'START_WAVE', payload: { count: 50 }, delay: 3000 },
                    // Spawn Zombies from Directions
                    // Batch 1: Church (North)
                    { type: 'SPAWN_ENEMY', payload: { type: 'RUNNER', count: 10, pos: { x: 250, z: -320 }, spread: 10 }, delay: 3000 },
                    // Batch 2: Cafe (West)
                    { type: 'SPAWN_ENEMY', payload: { type: 'WALKER', count: 10, pos: { x: 210, z: -350 }, spread: 10 }, delay: 3500 },
                    // Batch 3: Grocery (South)
                    { type: 'SPAWN_ENEMY', payload: { type: 'WALKER', count: 10, pos: { x: 240, z: -450 }, spread: 10 }, delay: 4000 },
                    // More waves follow logic in onUpdate if needed, or define here
                ]
            },

            // --- FIND LOKE EVENT ---
            {
                id: 'found_loke',
                position: { x: 241, z: -703 }, // Loke's spawn location
                radius: 5,
                type: 'EVENT',
                content: '',
                triggered: false,
                actions: [{ type: 'START_CINEMATIC' }]
            }
        );

        // Spawn Visual Markers for Collectibles
        SectorBuilder.spawnClueMarker(ctx, posCollectible1.x, posCollectible1.z, 'collectible 1', 'phone');
        SectorBuilder.spawnClueMarker(ctx, posCollectible2.x, posCollectible2.z, 'collectible 2', 'pacifier');

        // VISUALIZE TRIGGERS (Debug)
        SectorBuilder.visualizeTriggers(ctx);
    },

    onUpdate: (delta, now, playerPos, gameState, sectorState, events) => {
        // Init State
        if (sectorState.hordeKilled === undefined) sectorState.hordeKilled = 0;
        if (sectorState.hordeTarget === undefined) sectorState.hordeTarget = 999; // Default high until event starts
        if (sectorState.busUnlocked === undefined) sectorState.busUnlocked = false;
        if (sectorState.waveActive === undefined) sectorState.waveActive = false;
        if (sectorState.lastSpawnTime === undefined) sectorState.lastSpawnTime = 0;

        // Wave Logic: Spawn reinforcements if wave is active and we haven't reached target kills + active enemies
        // We spawned 30 initially via trigger. We need 20 more to reach 50 kills.
        if (sectorState.waveActive && sectorState.hordeKilled < sectorState.hordeTarget) {
            const activeCount = gameState.enemies.length;
            const totalToKill = sectorState.hordeTarget;

            // Keep population up to ~15 during the event
            if (activeCount < 15 && now - sectorState.lastSpawnTime > 2000) {
                sectorState.lastSpawnTime = now;
                // Spawn randomly around the center plaza
                const center = { x: 230, z: -400 };
                const angle = Math.random() * Math.PI * 2;
                const dist = 30 + Math.random() * 20;
                const pos = new THREE.Vector3(center.x + Math.cos(angle) * dist, 0, center.z + Math.sin(angle) * dist);

                events.spawnZombie('RUNNER', pos);
            }
        }

        // Unlock Bus
        if (sectorState.waveActive && sectorState.hordeKilled >= sectorState.hordeTarget && !sectorState.busUnlocked) {
            sectorState.busUnlocked = true;
            events.setNotification({ visible: true, text: events.t('clues.bus_clear'), icon: '🚌', timestamp: now });
        }

        // Handle Bus Gate
        if (sectorState.busUnlocked) {
            gameState.busUnlocked = true;
        }
    }
};
