import * as THREE from 'three';
import { GEOMETRY, MATERIALS, ModelFactory } from '../../utils/assets';
import { ZOMBIE_TYPES } from '../../content/constants';
import { ObjectGenerator } from '../world/ObjectGenerator';
import { EnvironmentGenerator } from '../world/EnvironmentGenerator';
import { registerSoundGenerators } from '../../utils/audio/SoundLib';
import { SoundBank } from '../../utils/audio/SoundBank';

let warmedUp = false;
let lastSectorIndex = -1;

export const AssetPreloader = {
    /**
     * Pre-compiles shaders and initializes assets to prevent frame drops during gameplay.
     * Uses incremental batching to keep the UI thread responsive.
     */
    warmupAsync: async (renderer: THREE.WebGLRenderer, envConfig: any, yieldToMain?: () => Promise<void>) => {
        if (warmedUp) return;

        // 0. AUDIO SYSTEM WARMUP
        registerSoundGenerators();
        const soundCore = (window as any).gameEngine?.sound;
        if (soundCore) {
            const essentialSounds = [
                'ui_hover', 'ui_click', 'shot_pistol', 'walker_groan',
                'impact_flesh', 'impact_metal', 'impact_concrete', 'impact_stone', 'impact_wood',
                'door_metal_shut', 'fx_heartbeat', 'ui_level_up',
                'loot_scrap', 'chest_open'
            ];
            essentialSounds.forEach(k => SoundBank.get(soundCore, k));
        }

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);

        // 1. SHADER PERMUTATION SETUP
        // Lights and Fog are critical for shader compilation. We must replicate game conditions.
        if (envConfig) {
            scene.fog = new THREE.FogExp2(envConfig.fogColor || envConfig.bgColor, envConfig.fogDensity);
            scene.background = new THREE.Color(envConfig.bgColor);

            scene.add(new THREE.AmbientLight(0x404040, envConfig.ambientIntensity));

            if (envConfig.moon?.visible) {
                const dirLight = new THREE.DirectionalLight(envConfig.moon.color, envConfig.moon.intensity);
                dirLight.castShadow = true;
                scene.add(dirLight);
            }

            // Add dummy dynamic lights to ensure compiled shaders support them
            scene.add(new THREE.PointLight(0xffaa00, 1, 10));
            scene.add(new THREE.SpotLight(0xffffff, 1));
        }

        // 2. GEOMETRY & MATERIAL BATCHING (Zero-GC approach)
        const dummyRoot = new THREE.Group();
        dummyRoot.position.set(0, 0, -10);
        scene.add(dummyRoot);

        const addToWarmup = (obj: THREE.Object3D) => {
            obj.visible = false; // Stay hidden until batch compilation
            dummyRoot.add(obj);
        };

        // Batch 1: Common Materials
        const matKeys = Object.keys(MATERIALS) as (keyof typeof MATERIALS)[];
        for (let i = 0; i < matKeys.length; i++) {
            const k = matKeys[i];
            if (['road', 'asphalt', 'snow', 'concrete'].includes(k)) continue;
            addToWarmup(new THREE.Mesh(GEOMETRY.box, MATERIALS[k]));
            if (i % 15 === 0 && yieldToMain) await yieldToMain();
        }

        // Batch 2: Characters & Projectiles
        addToWarmup(ModelFactory.createPlayer());
        Object.keys(ZOMBIE_TYPES).forEach(type => {
            addToWarmup(ModelFactory.createZombie(type, ZOMBIE_TYPES[type as keyof typeof ZOMBIE_TYPES]));
        });
        addToWarmup(ModelFactory.createBoss('Boss', { color: 0xff0000, scale: 3 } as any));

        // Batch 3: Environmental Props
        addToWarmup(new THREE.Mesh(GEOMETRY.treeTrunk, MATERIALS.treeTrunk));
        addToWarmup(new THREE.Mesh(GEOMETRY.foliageCluster, MATERIALS.treeLeaves));
        addToWarmup(new THREE.Mesh(GEOMETRY.barrel, MATERIALS.barrel));
        addToWarmup(new THREE.Mesh(GEOMETRY.scrap, MATERIALS.scrap));

        // Batch 4: Special FX pool warmup
        const { FXSystem } = await import('./FXSystem');
        const prefillFX = (geo: THREE.BufferGeometry, mat: THREE.Material, count: number) => {
            for (let i = 0; i < count; i++) {
                const p = new THREE.Mesh(geo, mat);
                p.visible = false;
                p.position.set(0, -1000, 0);
                scene.add(p);
                FXSystem.MESH_POOL.push(p);
            }
        };
        prefillFX(GEOMETRY.particle, MATERIALS.smoke, 100);
        prefillFX(GEOMETRY.flame, MATERIALS.fire, 30);

        if (yieldToMain) await yieldToMain();

        // 3. INCREMENTAL COMPILATION (The "Anti-Stutter" Pass)
        // We compile assets in small visible batches to keep the GPU and Main Thread fluid.
        try {
            // First: Compile global environment
            renderer.compile(scene, camera);
            if (yieldToMain) await yieldToMain();

            const children = dummyRoot.children;
            const batchSize = 4;

            for (let i = 0; i < children.length; i += batchSize) {
                // Hide all, then show only the current batch
                children.forEach(c => c.visible = false);
                for (let j = 0; j < batchSize && (i + j) < children.length; j++) {
                    children[i + j].visible = true;
                }

                renderer.compile(scene, camera);
                if (yieldToMain) await yieldToMain();
            }
        } catch (e) {
            console.warn("Shader warmup failed or interrupted", e);
        }

        // 4. GENERATOR CACHE WARMUP
        // Procedural generation of textures/prototypes is slow; do it here.
        try {
            await EnvironmentGenerator.initPrototypes(yieldToMain);
            await ObjectGenerator.initBuildingPrototypes(yieldToMain);

            // Dummy instances to trigger lazy-loaded logic
            ObjectGenerator.createVehicle('station wagon');
            ObjectGenerator.createBuilding(4, 4, 4, 0x888888);
            EnvironmentGenerator.createRock(2, 2);

            if (yieldToMain) await yieldToMain();
        } catch (e) {
            console.warn("Generator warmup failed", e);
        }

        // 5. CLEANUP
        // Dispose dummy geometries and clear scene to free memory, 
        // while keeping the compiled shader programs in the GPU cache.
        scene.clear();
        warmedUp = true;
    },

    isWarmedUp: () => warmedUp,
    reset: () => { warmedUp = false; lastSectorIndex = -1; },
    getLastSectorIndex: () => lastSectorIndex,
    setLastSectorIndex: (idx: number) => { lastSectorIndex = idx; }
};