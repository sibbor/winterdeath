
import * as THREE from 'three';
import { SectorDef, SectorContext } from '../../types/sectors';
import { MATERIALS, GEOMETRY } from '../../utils/assets';
import { SectorBuilder } from '../../core/world/SectorGenerator';
import { ObjectGenerator } from '../../core/world/ObjectGenerator';
import { t } from '../../utils/i18n';
import { CAMERA_HEIGHT } from '../constants';

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
        FOUND_NATHALIE: { x: -40, z: -150 }
    },
    POIS: {
        SHED: { x: -40, z: -150 }
    }
} as const;

export const Sector4: SectorDef = {
    id: 3,
    name: "maps.scrapyard_name",
    environment: {
        bgColor: 0x110500, // Rusty orange/red sky
        fogDensity: 0.02,
        ambientIntensity: 0.6, // Increased for visibility
        groundColor: 0x2a1a11, // Oily dirt
        fov: 40,
        moon: { visible: true, color: 0xffaa00, intensity: 0.3 },
        cameraOffsetZ: 40,
        cameraHeight: CAMERA_HEIGHT,
        weather: 'rain'
    },
    // Automatic Content
    groundType: 'DIRT',
    //bounds: { width: 350, depth: 350 },
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
    },

    setupContent: async (ctx: SectorContext) => {
        const { triggers } = ctx;

        triggers.push(
            { id: 's4_creepy_noise', position: LOCATIONS.TRIGGERS.NOISE, radius: 20, type: 'THOUGHTS', content: "clues.s4_noise", triggered: false, actions: [{ type: 'PLAY_SOUND', payload: { id: 'ambient_metal' } }, { type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 's4_shed_sight', position: LOCATIONS.TRIGGERS.SHED_SIGHT, radius: 25, type: 'THOUGHTS', content: "clues.s4_shed", triggered: false, actions: [{ type: 'GIVE_REWARD', payload: { xp: 50 } }] },
            { id: 'found_nathalie', position: LOCATIONS.TRIGGERS.FOUND_NATHALIE, radius: 8, type: 'EVENT', content: '', triggered: false, actions: [{ type: 'START_CINEMATIC' }, { type: 'TRIGGER_FAMILY_FOLLOW', delay: 2000 }] }
        );

        if (ctx.debugMode) {
            SectorBuilder.visualizeTriggers(ctx);
        }
    },

    setupZombies: async (ctx: SectorContext) => {
        // --- ZOMBIE SPAWNING ---
        for (let i = 0; i < 5; i++) {
            ctx.spawnZombie('WALKER');
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

            // Check if position is occupied by obstacles would be ideal, but simple distance logic works for now
            events.spawnZombie('RUNNER', new THREE.Vector3(px, 0, pz));
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

    hordeSpots.forEach((pos, i) => {
        const count = 6 + Math.floor(ctx.rng() * 4);
        ctx.spawnHorde(count, undefined, pos);
    });
}
