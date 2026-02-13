
import * as THREE from 'three';
import { SectorDef, SectorContext } from '../../types/sectors';
import { SectorBuilder } from '../../core/world/SectorGenerator';
import { EnvironmentGenerator } from '../../core/world/EnvironmentGenerator';

export const Sector5: SectorDef = {
    id: 4,
    name: "maps.sector_5_name",
    environment: {
        bgColor: 0x111116,
        fogDensity: 0.04, // Dense storm fog
        ambientIntensity: 0.1, // Dark
        groundColor: 0x4a6e4a, // Grass color
        fov: 50,
        moon: { visible: false, color: 0x445566, intensity: 0.2 },
        cameraOffsetZ: 40,
        weather: 'none',
    },
    // Automatic Content
    groundType: 'SNOW',
    ambientLoop: 'ambient_finale_loop',
    // --- SPAWN POINTS ---
    playerSpawn: { x: 300, z: 220 }, // Start at the road entrance (reverse of Sector 1)
    familySpawn: { x: 0, z: 15, y: 1 }, // Pets inside the Villa
    bossSpawn: { x: 0, z: 15 }, // Boss at family location

    cinematic: {
        offset: { x: 15, y: 12, z: 15 },
        lookAtOffset: { x: 0, y: 1.5, z: 0 },
        rotationSpeed: 0.05
    },

    setupProps: async (ctx: SectorContext) => {
        // Reward Chest at boss spawn
        SectorBuilder.spawnChest(ctx, 0, 15, 'big');

        // Add more fire/destruction
        for (let i = 0; i < 20; i++) {
            const x = (Math.random() - 0.5) * 100;
            const z = (Math.random() - 0.5) * 100;
            //ObjectGenerator.createFire(ctx, x, z);
        }

        // Remove the Sector 1 trigger for start tracks if present, to avoid confusion
        const trackTrig = ctx.triggers.find(t => t.id === 's1_start_tracks');
        if (trackTrig) trackTrig.triggered = true;

        // ===== PEACEFUL EPILOGUE MEADOWS =====

        // Dense grass around spawn
        const epilogueGrass = [
            new THREE.Vector3(-30, 0, -30),
            new THREE.Vector3(30, 0, -30),
            new THREE.Vector3(30, 0, 30),
            new THREE.Vector3(-30, 0, 30)
        ];
        await EnvironmentGenerator.fillAreaWithGrass(ctx, epilogueGrass, 2.5);

        // Abundant flowers (peaceful ending)
        const epilogueFlowers1 = [
            new THREE.Vector3(-40, 0, -40),
            new THREE.Vector3(-10, 0, -40),
            new THREE.Vector3(-10, 0, -10),
            new THREE.Vector3(-40, 0, -10)
        ];
        await EnvironmentGenerator.fillAreaWithFlowers(ctx, epilogueFlowers1, 1.2);

        const epilogueFlowers2 = [
            new THREE.Vector3(10, 0, 10),
            new THREE.Vector3(40, 0, 10),
            new THREE.Vector3(40, 0, 40),
            new THREE.Vector3(10, 0, 40)
        ];
        await EnvironmentGenerator.fillAreaWithFlowers(ctx, epilogueFlowers2, 1.2);

        // ===== END EPILOGUE MEADOWS =====
    },

    setupContent: async (ctx: SectorContext) => {
        const { triggers } = ctx;

        // --- FIND PETS EVENT ---
        triggers.push({
            id: 'found_pets',
            position: { x: 0, z: 15 }, // Inside Villa
            radius: 8,
            type: 'EVENT',
            content: '',
            triggered: false,
            actions: [{ type: 'START_CINEMATIC' }]
        });
    },

    onUpdate: (delta, now, playerPos, gameState, sectorState, events) => {
        // Finale Intensity
        if (Math.random() < 0.02 && gameState.enemies.length < 15) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 30 + Math.random() * 20;
            const px = playerPos.x + Math.cos(angle) * dist;
            const pz = playerPos.z + Math.sin(angle) * dist;
            events.spawnZombie('TANK', new THREE.Vector3(px, 0, pz));
        }
    }
};
