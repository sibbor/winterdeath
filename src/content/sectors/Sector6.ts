
import * as THREE from 'three';
import { SectorDef, SectorContext } from '../../types/sectors';
import { MATERIALS } from '../../utils/assets';
import { SectorBuilder } from '../../core/world/SectorGenerator';
import { ObjectGenerator } from '../../core/world/ObjectGenerator';
import { CAMERA_HEIGHT } from '../constants';

export const Sector6: SectorDef = {
    id: 5,
    name: "maps.benchmark",
    environment: {
        bgColor: 0x111116,
        fogDensity: 0.04, // Dense storm fog
        ambientIntensity: 0.1, // Dark
        groundColor: 0x4a6e4a, // Grass color
        fov: 50,
        moon: { visible: false, color: 0x445566, intensity: 0.2 },
        cameraOffsetZ: 40,
        cameraHeight: CAMERA_HEIGHT,
        weather: 'rain', // Stormy
        weatherDensity: 2000, // Heavy rain
    },
    // Automatic Content
    groundType: 'NONE', // Custom handling via generate
    ambientLoop: 'ambient_wind_loop',

    playerSpawn: { x: 0, z: 0 },
    familySpawn: { x: 10, z: 10 },
    bossSpawn: { x: 0, z: -50 },

    collectibles: [],

    setupProps: async (ctx: SectorContext) => {
        const { scene } = ctx;

        // Ground Plane (Grass)
        const groundGeo = new THREE.PlaneGeometry(200, 200, 32, 32);
        const groundMat = MATERIALS.grass;
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        // Reward Chest at boss spawn
        SectorBuilder.spawnChest(ctx, 0, -50, 'big');

        // Grass Field (Instanced)
        // 50,000 blades for benchmark
        if (ObjectGenerator.createGrassField) {
            ObjectGenerator.createGrassField(ctx, 0, 0, 180, 180, 50000);
        }

        // A few props to test lighting/shadows
        SectorBuilder.spawnContainerStack(ctx, 20, 20, 0.5, 3, 0xcc3333);

        SectorBuilder.spawnTree(ctx, 'pine', 30, -30);
        SectorBuilder.spawnTree(ctx, 'pine', -40, 40);
        SectorBuilder.spawnTree(ctx, 'birch', -20, -20);

        // Lighting Test (Point Light)
        const pl = new THREE.PointLight(0xffaa00, 5, 20);
        pl.position.set(0, 5, 20);
        pl.castShadow = true;
        scene.add(pl);
    },

    onUpdate: (dt, now, playerPos, gameState, sectorState, events) => {
        // Benchmark Logic or dynamic events can go here
    }
};
