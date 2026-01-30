
import * as THREE from 'three';
import { SectorDef, SectorContext } from './types';
import { MATERIALS, GEOMETRY } from '../../utils/assets';
import { SectorBuilder } from '../SectorGenerator';

export const Sector4: SectorDef = {
    id: 3,
    name: "maps.scrapyard_name",
    environment: {
        bgColor: 0x110500, // Rusty orange/red sky
        fogDensity: 0.025,
        ambientIntensity: 0.6, // Increased for visibility
        groundColor: 0x2a1a11, // Oily dirt
        fov: 50,
        moon: { visible: true, color: 0xffaa00, intensity: 0.3 }, // Increased
        cameraOffsetZ: 40,
        weather: 'none'
    },
    // --- SPAWN POINTS ---
    playerSpawn: { x: 0, z: 0 },
    familySpawn: { x: -40, z: -150, y: 0 }, // Nathalie hidden in a shed
    bossSpawn: { x: -40, z: -150 }, // Boss at family location

    cinematic: {
        offset: { x: 15, y: 12, z: 15 },
        lookAtOffset: { x: 0, y: 1.5, z: 0 },
        rotationSpeed: 0.05
    },

    generate: (ctx: SectorContext) => {
        const { scene, obstacles, burningBarrels, triggers } = ctx;

        // --- TRIGGERS ---
        triggers.push(
            // Collectible
            { 
                id: 's4_collectible', position: {x: 40, z: -80}, radius: 2, type: 'COLLECTIBLE', content: "clues.s4_collectible", description: "clues.s4_collectible_desc", triggered: false, icon: "🔧",
                actions: [{ type: 'GIVE_REWARD', payload: { sp: 1 } }] 
            },
            // Flavor
            {
                id: 's4_creepy_noise', position: {x: 0, z: -50}, radius: 20, type: 'THOUGHTS', content: "clues.s4_noise", triggered: false,
                actions: [{ type: 'PLAY_SOUND', payload: { id: 'ambient_metal' } }, { type: 'GIVE_REWARD', payload: { xp: 50 } }]
            },
            {
                id: 's4_shed_sight', position: {x: -20, z: -120}, radius: 25, type: 'THOUGHTS', content: "clues.s4_shed", triggered: false,
                actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }]
            },
            
            // --- FIND NATHALIE EVENT ---
            {
                id: 'found_nathalie',
                position: { x: -40, z: -150 }, // Shed
                radius: 8,
                type: 'EVENT',
                content: '',
                triggered: false,
                actions: [{ type: 'START_CINEMATIC' }]
            }
        );

        // Tiled Ground (Dirty)
        // Cover -200 to 200 X, -200 to 100 Z
        const tileSize = 100;
        const tileGeo = new THREE.PlaneGeometry(tileSize, tileSize);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x332211, roughness: 0.8 });

        for(let x = -2; x <= 2; x++) {
            for(let z = -2; z <= 1; z++) {
                const ground = new THREE.Mesh(tileGeo, groundMat);
                ground.rotation.x = -Math.PI/2; 
                ground.position.set(x * tileSize, 0.02, z * tileSize);
                ground.receiveShadow = true;
                scene.add(ground);
            }
        }

        // Stacks of Cars (Maze)
        for(let i=0; i<60; i++) {
            const x = (Math.random()-0.5) * 160;
            const z = -20 - Math.random() * 140;
            
            // Avoid spawn path center
            if (Math.abs(x) < 10 && z > -100) continue;

            const carStackHeight = 1 + Math.floor(Math.random() * 3);
            const rotY = Math.random() * Math.PI * 2;
            
            for(let h=0; h<carStackHeight; h++) {
                SectorBuilder.spawnVolvo(ctx, x, z, rotY, h);
            }
        }

        // Perimeter Trees (New Forest House Style)
        // Add dense trees around the edges to frame the scrapyard
        for(let i=0; i<80; i++) {
            const angle = Math.random() * Math.PI * 2;
            // Radius ~100-150 creates a ring outside the car area
            const r = 100 + Math.random() * 60;
            const x = Math.cos(angle) * r;
            const z = -80 + Math.sin(angle) * r; // Offset Z to center on play area roughly

            SectorBuilder.spawnTree(ctx, x, z, 1.0 + Math.random() * 0.5);
        }

        // Burning Barrels
        for(let i=0; i<10; i++) {
            const x = (Math.random()-0.5) * 100;
            const z = -Math.random() * 150;
            const barrel = new THREE.Mesh(GEOMETRY.barrel, MATERIALS.barrel);
            barrel.position.set(x, 1.25, z);
            scene.add(barrel);
            
            const fire = new THREE.PointLight(0xff6600, 5, 20);
            fire.position.set(x, 4, z);
            scene.add(fire);
            burningBarrels.push({position: new THREE.Vector3(x, 2, z)});
        }

        // The Dealership Building (Nathalie's location)
        const shedGroup = new THREE.Group();
        shedGroup.position.set(-40, 0, -150);
        const shed = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 20), MATERIALS.metalPanel);
        shed.position.y = 4;
        shedGroup.add(shed);
        scene.add(shedGroup);
        obstacles.push({mesh: shedGroup, radius: 12});
        SectorBuilder.spawnDebugMarker(ctx, -40, -150, 10, "OFFICE");

        SectorBuilder.spawnClueMarker(ctx, 40, -80, 'collectible', 'phone'); // Placeholder visual

        // VISUALIZE TRIGGERS (Debug)
        SectorBuilder.visualizeTriggers(ctx);
    },

    onUpdate: (delta, now, playerPos, gameState, sectorState, events) => {
        // Scrapyard ambushes
        if (Math.random() < 0.015 && gameState.enemies.length < 12) {
             const angle = Math.random() * Math.PI * 2;
             const dist = 25 + Math.random() * 20;
             const px = playerPos.x + Math.cos(angle) * dist;
             const pz = playerPos.z + Math.sin(angle) * dist;
             
             // Check if position is occupied by obstacles would be ideal, but simple distance logic works for now
             events.spawnZombie('RUNNER', new THREE.Vector3(px, 0, pz));
        }
    }
};
