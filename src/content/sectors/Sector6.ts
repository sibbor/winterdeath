
import * as THREE from 'three';
import { SectorDef, SectorContext } from '../../types/sectors';
import { MATERIALS } from '../../utils/assets';
import { SectorGenerator } from '../../core/world/SectorGenerator';
import { EnvironmentGenerator } from '../../core/world/EnvironmentGenerator';
import { WaterSystem } from '../../core/systems/WaterSystem';
import { CAMERA_HEIGHT } from '../constants';

export const Sector6: SectorDef = {
    id: 5,
    name: "sectors.sector_6_name",
    environment: {
        bgColor: 0x111116,
        fogDensity: 0.00, // Dense storm fog
        ambientIntensity: 0.5, // Dark
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
        SectorGenerator.spawnChest(ctx, 0, -50, 'big');

        // ===== NEW: Wind-Animated Grass Meadows =====

        // Large central meadow (around player spawn)
        const centralMeadow = [
            new THREE.Vector3(-40, 0, -40),
            new THREE.Vector3(40, 0, -40),
            new THREE.Vector3(40, 0, 40),
            new THREE.Vector3(-40, 0, 40)
        ];
        await EnvironmentGenerator.fillAreaWithGrass(ctx, centralMeadow, 2.5);

        // Flower patches in corners
        const northFlowers = [
            new THREE.Vector3(-80, 0, -80),
            new THREE.Vector3(-50, 0, -80),
            new THREE.Vector3(-50, 0, -50),
            new THREE.Vector3(-80, 0, -50)
        ];
        await EnvironmentGenerator.fillAreaWithFlowers(ctx, northFlowers, 0.8);

        const southFlowers = [
            new THREE.Vector3(50, 0, 50),
            new THREE.Vector3(80, 0, 50),
            new THREE.Vector3(80, 0, 80),
            new THREE.Vector3(50, 0, 80)
        ];
        await EnvironmentGenerator.fillAreaWithFlowers(ctx, southFlowers, 0.8);

        // Dense grass around trees
        const treeGrass1 = [
            new THREE.Vector3(25, 0, -35),
            new THREE.Vector3(35, 0, -35),
            new THREE.Vector3(35, 0, -25),
            new THREE.Vector3(25, 0, -25)
        ];
        await EnvironmentGenerator.fillAreaWithGrass(ctx, treeGrass1, 3.0);

        const treeGrass2 = [
            new THREE.Vector3(-45, 0, 35),
            new THREE.Vector3(-35, 0, 35),
            new THREE.Vector3(-35, 0, 45),
            new THREE.Vector3(-45, 0, 45)
        ];
        await EnvironmentGenerator.fillAreaWithGrass(ctx, treeGrass2, 3.0);

        // ===== END Grass & Flowers =====

        // ===== WATER SYSTEM: Test Lake =====

        // Initialize Water System
        ctx.state.waterSystem = new WaterSystem(scene, 50);

        // Create test lake: 50m east of spawn, 30x50 meters, crystal clear
        const lake = ctx.state.waterSystem.addSurface(
            50,  // x: 50m east
            0,   // z: centered on spawn
            30,  // width: 30m
            50,  // depth: 50m
            'crystal' // Crystal clear water
        );

        // Add collision boundary to prevent walking through water
        const lakeCollider = new THREE.Mesh(
            new THREE.BoxGeometry(30, 10, 50)
        );
        lakeCollider.position.set(50, 5, 0);
        lakeCollider.visible = false;
        lakeCollider.updateMatrixWorld();
        scene.add(lakeCollider);

        SectorGenerator.addObstacle(ctx, {
            mesh: lakeCollider,
            collider: { type: 'box', size: new THREE.Vector3(30, 10, 50) }
        });

        // ===== END WATER SYSTEM =====

        // A few props to test lighting/shadows
        SectorGenerator.spawnContainerStack(ctx, 20, 20, 0.5, 3, 0xcc3333);

        SectorGenerator.spawnTree(ctx, 'pine', 30, -30);
        SectorGenerator.spawnTree(ctx, 'pine', -40, 40);
        SectorGenerator.spawnTree(ctx, 'birch', -20, -20);

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
