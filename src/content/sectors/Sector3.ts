
import * as THREE from 'three';
import { SectorDef, SectorContext } from '../../types/sectors';
import { MATERIALS, GEOMETRY } from '../../utils/assets';
import { SectorBuilder } from '../../core/world/SectorGenerator';
import { t } from '../../utils/i18n';

export const Sector3: SectorDef = {
    id: 2,
    name: "maps.mast_name",
    environment: {
        bgColor: 0x051015, // Dark blue/green night
        fogDensity: 0.03,
        ambientIntensity: 0.5, // Increased for visibility
        groundColor: 0x112211, // Forest floor
        fov: 60,
        moon: { visible: true, color: 0x88ffaa, intensity: 0.4 }, // Increased intensity
        cameraOffsetZ: 45,
        weather: 'none' // Dense forest, maybe rain instead?
    },
    // --- SPAWN POINTS ---
    playerSpawn: { x: 0, z: 0 },
    familySpawn: { x: 10, z: -200, y: 0 }, // Esmeralda at the base of the mast
    bossSpawn: { x: 10, z: -200 }, // Boss at family location

    cinematic: {
        offset: { x: 10, y: 15, z: 15 },
        lookAtOffset: { x: 0, y: 2, z: 0 },
        rotationSpeed: 0.02
    },

    generate: (ctx: SectorContext) => {
        const { scene, obstacles, triggers } = ctx;

        // --- TRIGGERS ---
        triggers.push(
            // Collectible
            {
                id: 's3_collectible', position: { x: -20, z: -100 }, radius: 2, type: 'COLLECTIBLE', content: "clues.s3_collectible", description: "clues.s3_collectible_desc", triggered: false, icon: "🔍",
                actions: [{ type: 'GIVE_REWARD', payload: { sp: 1 } }]
            },
            // Flavor
            {
                id: 's3_forest_noise', position: { x: 0, z: -50 }, radius: 20, type: 'THOUGHTS', content: "clues.s3_forest_noise", triggered: false,
                actions: [{ type: 'PLAY_SOUND', payload: { id: 'ambient_rustle' } }, { type: 'GIVE_REWARD', payload: { xp: 50 } }]
            },
            {
                id: 's3_mast_sight', position: { x: 0, z: -150 }, radius: 30, type: 'THOUGHTS', content: "clues.s3_mast_sight", triggered: false,
                actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }]
            },

            // --- FIND ESMERALDA EVENT ---
            {
                id: 'found_esmeralda',
                position: { x: 10, z: -200 }, // Mast Base
                radius: 8,
                type: 'EVENT',
                content: '',
                triggered: false,
                actions: [{ type: 'START_CINEMATIC' }]
            }
        );

        // Tiled Ground (Gravel/Forest Floor)
        const tileSize = 100;
        const tileGeo = new THREE.PlaneGeometry(tileSize, tileSize);

        // Cover -200 to 200 X, -300 to 100 Z
        for (let x = -2; x <= 2; x++) {
            for (let z = -3; z <= 1; z++) {
                const ground = new THREE.Mesh(tileGeo, MATERIALS.gravel);
                ground.rotation.x = -Math.PI / 2;
                ground.position.set(x * tileSize, 0.02, z * tileSize);
                ground.receiveShadow = true;
                scene.add(ground);
            }
        }

        // Dense Forest Path
        for (let z = 20; z > -250; z -= 15) {
            // Create a path width of ~20 units
            for (let x = -100; x < 100; x += 10) {
                if (Math.abs(x) < 15) continue; // Clear path

                if (Math.random() > 0.2) {
                    const jitterX = (Math.random() - 0.5) * 10;
                    const jitterZ = (Math.random() - 0.5) * 10;
                    const scale = 1 + Math.random();

                    SectorBuilder.spawnTree(ctx, x + jitterX, z + jitterZ, scale);
                }
            }
        }

        // The Mast
        const mastGroup = new THREE.Group();
        mastGroup.position.set(0, 0, -210);

        // Base
        const base = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 10), MATERIALS.concrete);
        mastGroup.add(base);

        // Structure (Simplified Lattice)
        const mastGeo = new THREE.CylinderGeometry(1, 6, 60, 4);
        const mast = new THREE.Mesh(mastGeo, MATERIALS.mast);
        mast.position.y = 30;
        mastGroup.add(mast);

        // Red Beacon
        const beacon = new THREE.PointLight(0xff0000, 5, 200);
        beacon.position.y = 60;
        mastGroup.add(beacon);

        scene.add(mastGroup);
        obstacles.push({ mesh: mastGroup, radius: 8 });
        SectorBuilder.spawnDebugMarker(ctx, 0, -210, 10, t('maps.mast_name'));

        // Fences
        for (let x = -20; x <= 20; x += 4) {
            const f = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 0.2), MATERIALS.blackMetal);
            f.position.set(x, 2, -190);
            scene.add(f);
        }

        SectorBuilder.spawnClueMarker(ctx, -20, -100, t('clues.s3_collectible'), 'phone');

        // VISUALIZE TRIGGERS (Debug)
        SectorBuilder.visualizeTriggers(ctx);
    },

    onUpdate: (delta, now, playerPos, gameState, sectorState, events) => {
        // Simple ambient spawning in forest
        if (Math.random() < 0.01 && gameState.enemies.length < 10) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 30 + Math.random() * 20;
            const px = playerPos.x + Math.cos(angle) * dist;
            const pz = playerPos.z + Math.sin(angle) * dist;
            // Only spawn if off-path
            if (Math.abs(px) > 15) {
                events.spawnZombie('WALKER', new THREE.Vector3(px, 0, pz));
            }
        }
    }
};
