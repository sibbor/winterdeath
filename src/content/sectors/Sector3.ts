import * as THREE from 'three';
import { SectorDef, SectorContext } from '../../game/session/SectorTypes';
import { MATERIALS } from '../../utils/assets';
import { SectorBuilder } from '../../core/world/SectorBuilder';
import { VegetationGenerator } from '../../core/world/generators/VegetationGenerator';
import { CAMERA_HEIGHT } from '../constants';
import { EnemyType } from '../../entities/enemies/EnemyTypes';

const LOCATIONS = {
    SPAWN: {
        PLAYER: { x: 0, z: 0 },
        FAMILY: { x: -40, z: -150, y: 0 },
        BOSS: { x: -40, z: -150 }
    },
    CINEMATIC: {
        OFFSET: { x: 15, y: 12, z: 15 },
        LOOK_AT: { x: 0, y: 1.5, z: 0 }
    },
    COLLECTIBLES: {
        C1: { x: 40, z: -80 },
        C2: { x: -20, z: -60 }
    },
    TRIGGERS: {
        NOISE: { x: 0, z: -50 },
        SHED_SIGHT: { x: -20, z: -120 },
        FOUND_NATHALIE: { x: -40, z: -150 },

        // VINTERDÖD: Added the two on-the-move dialogue triggers
        DIALOGUE_1: { x: 0, z: -20 }, // 20m from spawn
        DIALOGUE_2: { x: 0, z: -50 }  // 50m from spawn
    },
    POIS: {
        SHED: { x: -40, z: -150 }
    }
} as const;

export const Sector3: SectorDef = {
    id: 3,
    name: "sectors.sector_3_name",
    environment: {
        bgColor: 0x110500,
        fog: {
            density: 200,
            color: 0x020208,
            height: 10
        },
        ambientIntensity: 0.6,
        ambientColor: 0x404050,
        groundColor: 0x2a1a11,
        fov: 40,
        skyLight: { visible: true, color: 0xffaa00, intensity: 3.0 },
        cameraOffsetZ: 40,
        cameraHeight: CAMERA_HEIGHT,
        weather: {
            type: 'ember',
            particles: 2000
        },
        wind: {
            strengthMin: 0.05,
            strengthMax: 1.0,
            direction: { x: 1, z: 1 },
            angleVariance: Math.PI / 4
        }
    },
    // Automatic Content
    groundType: 'DIRT',
    ambientLoop: 'ambient_scrapyard_loop',
    // --- SPAWN POINTS ---
    playerSpawn: LOCATIONS.SPAWN.PLAYER,
    familySpawn: LOCATIONS.SPAWN.FAMILY,
    bossSpawn: LOCATIONS.SPAWN.BOSS,

    // Auto-Spawn Collectibles
    collectibles: [
        { id: 's4_collectible_1', x: LOCATIONS.COLLECTIBLES.C1.x, z: LOCATIONS.COLLECTIBLES.C1.z },
        { id: 's4_collectible_2', x: LOCATIONS.COLLECTIBLES.C2.x, z: LOCATIONS.COLLECTIBLES.C2.z }
    ],

    cinematic: {
        offset: LOCATIONS.CINEMATIC.OFFSET,
        lookAtOffset: LOCATIONS.CINEMATIC.LOOK_AT,
        rotationSpeed: 0.05
    },

    setupProps: async (ctx: SectorContext) => {
        const { scene, obstacles } = ctx;
        (ctx as any).sectorState.ctx = ctx;

        // Reward Chest at boss spawn
        SectorBuilder.spawnChest(ctx, LOCATIONS.SPAWN.BOSS.x, LOCATIONS.SPAWN.BOSS.z, 'big');

        // Stacks of Cars (Maze) - Sektor 4 Bilskroten
        for (let i = 0; i < 60; i++) {
            const x = (Math.random() - 0.5) * 160;
            const z = -20 - Math.random() * 140;
            if (Math.abs(x) < 10 && z > -100) continue;
            const carStackHeight = 1 + Math.floor(Math.random() * 3);
            const rotY = Math.random() * Math.PI * 2;
            await SectorBuilder.spawnVehicleStack(ctx, x, z, rotY, carStackHeight);
        }

        // Perimeter Trees
        for (let i = 0; i < 80; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 100 + Math.random() * 60;
            const x = Math.cos(angle) * r;
            const z = -80 + Math.sin(angle) * r;
            await SectorBuilder.spawnTree(ctx, 'spruce', x, z, 1.0 + Math.random() * 0.5);
        }

        // The Dealership Building
        const shedGroup = new THREE.Group();
        shedGroup.position.set(-40, 0, -150);
        const shed = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 20), MATERIALS.metalPanel);
        shed.position.y = 4;
        shedGroup.add(shed);
        scene.add(shedGroup);
        SectorBuilder.addObstacle(ctx, {
            mesh: shedGroup,
            collider: { type: 'sphere', radius: 12 }
        });

        // ===== INDUSTRIAL DECAY =====

        // Sparse weeds breaking through concrete
        const industrialWeeds = [
            new THREE.Vector3(-20, 0, -20),
            new THREE.Vector3(20, 0, -20),
            new THREE.Vector3(20, 0, 20),
            new THREE.Vector3(-20, 0, 20)
        ];
        await VegetationGenerator.fillAreaWithGrass(ctx, industrialWeeds, 0.4);

        // Dead/dying trees (only standing, industrial feel)
        for (let i = 0; i < 15; i++) {
            const deadTree = VegetationGenerator.createDeadTree('standing', 0.6 + Math.random() * 0.4);
            const angle = Math.random() * Math.PI * 2;
            const dist = 30 + Math.random() * 40;
            deadTree.position.set(
                Math.cos(angle) * dist,
                0,
                Math.sin(angle) * dist
            );
            ctx.scene.add(deadTree);
        }
        // ===== END INDUSTRIAL DECAY =====
    },

    setupContent: async (ctx: SectorContext) => {
        if (ctx.isWarmup) return; // Triggers produce no GPU state — skip during preloader ghost-render
        // Triggers
        SectorBuilder.addTriggers(ctx, [
            // Dialogue Part 1 (Gravel Path)
            {
                id: 's4_dialogue_1',
                position: LOCATIONS.TRIGGERS.DIALOGUE_1,
                radius: 15,
                type: 'EVENT',
                content: '',
                triggered: false,
                // VINTERDÖD FIX: Points to index 3 (Sector 4), starts at line 0 automatically.
                actions: [{ type: 'START_CINEMATIC', payload: { scriptId: 3 } }]
            },

            // Dialogue Part 2 (RV40)
            {
                id: 's4_dialogue_2',
                position: LOCATIONS.TRIGGERS.DIALOGUE_2,
                radius: 15,
                type: 'EVENT',
                content: '',
                triggered: false,
                // VINTERDÖD FIX: Points to Sector 4 script, but we must start at line 6 (index 6 in the array)
                // We pass 'lineIndex' to the payload so the cinematic system knows where to begin.
                actions: [{ type: 'START_CINEMATIC', payload: { scriptId: 3, lineIndex: 6 } }]
            },

            // Dialogue Part 3 (Final Boss/Nathalie)
            {
                id: 'found_nathalie',
                position: LOCATIONS.TRIGGERS.FOUND_NATHALIE,
                familyId: 3,
                radius: 12,
                type: 'EVENT',
                content: '',
                triggered: false,
                // Starts the final dialogue at line 14. 
                // The dialog script will then fire ['FAMILY_MEMBER_FOUND', 'SPAWN_BOSS']
                actions: [{ type: 'START_CINEMATIC', payload: { scriptId: 3, lineIndex: 14 } }]
            },

            { id: 's4_creepy_noise', position: LOCATIONS.TRIGGERS.NOISE, radius: 20, type: 'THOUGHT', content: "clues.3.0.reaction", triggered: false, actions: [{ type: 'PLAY_SOUND', payload: { id: 'ambient_metal' } }, { type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's4_poi_shed', position: LOCATIONS.TRIGGERS.SHED_SIGHT, radius: 25, type: 'POI', content: "pois.3.0.reaction", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] },
            { id: 's4_poi_scrapyard', position: { x: 0, z: -100 }, radius: 100, type: 'POI', content: "pois.3.1.reaction", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 500 } }] }
        ]);
    },

    setupZombies: async (ctx: SectorContext) => {
        if (ctx.isWarmup) return; // No enemy spawning during preloader ghost-render
        // --- ZOMBIE SPAWNING ---
        for (let i = 0; i < 5; i++) {
            ctx.spawnZombie(EnemyType.WALKER);
        }

        spawnSectorHordes(ctx);
    },

    onUpdate: (delta, now, playerPos, gameState, sectorState, events) => {
        // Scrapyard ambushes
        if (Math.random() < 0.015 && gameState.enemies.length < 12) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 25 + Math.random() * 20;
            const px = playerPos.x + Math.cos(angle) * dist;
            const pz = playerPos.z + Math.sin(angle) * dist;

            events.spawnZombie(EnemyType.RUNNER, new THREE.Vector3(px, 0, pz));
        }
    }
};

function spawnSectorHordes(ctx: SectorContext) {
    if (!ctx.spawnHorde) return;

    // Defined Horde Locations (Scrapyard)
    const hordeSpots = [
        new THREE.Vector3(0, 0, -50),   // Near Start
        new THREE.Vector3(-20, 0, -130), // Shed Front
        new THREE.Vector3(30, 0, -200),  // Deep Scrapyard
        new THREE.Vector3(80, 0, -80),   // Right Flank
        new THREE.Vector3(-80, 0, -80)   // Left Flank
    ];

    for (let i = 0; i < hordeSpots.length; i++) {
        const count = 6 + Math.floor(ctx.rng() * 4);
        ctx.spawnHorde(count, undefined, hordeSpots[i]);
    }
}