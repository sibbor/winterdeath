import * as THREE from 'three';
import { GEOMETRY, MATERIALS, ModelFactory } from '../../utils/assets';
import { TEXTURES } from '../../utils/assets/AssetLoader';
import { createWaterMaterial } from '../../utils/assets/materials_water';
import { ZOMBIE_TYPES } from '../../content/constants';
import { ObjectGenerator } from '../world/ObjectGenerator';
import { EnvironmentGenerator } from '../world/EnvironmentGenerator';
import { registerSoundGenerators } from '../../utils/audio/SoundLib';
import { SoundBank } from '../../utils/audio/SoundBank';
import { createProceduralDiffuse } from '../../utils/assets/procedural';
import { VEHICLES, VehicleType } from '../../content/vehicles';

let warmedUp = false;
let lastSectorIndex = -1;

export const AssetPreloader = {
    /**
     * Pre-compiles shaders and initializes assets to prevent frame drops during gameplay.
     * Uses incremental batching to keep the UI thread responsive.
     */
    warmupAsync: async (renderer: THREE.WebGLRenderer, envConfig: any, yieldToMain?: () => Promise<void>) => {
        if (warmedUp) return;

        // 0. PROCEDURAL CACHE WARMUP
        // Generate and cache all procedural textures once before shader compilation starts.
        createProceduralDiffuse();
        if (yieldToMain) await yieldToMain();

        // 1. AUDIO SYSTEM WARMUP
        registerSoundGenerators();
        const soundCore = (window as any).gameEngine?.sound;
        if (soundCore) {
            const essentialSounds = [
                'ui_hover', 'ui_click', 'shot_pistol', 'shot_smg', 'shot_rifle',
                'shot_shotgun', 'shot_revolver', 'shot_minigun',
                'walker_groan', 'walker_death', 'runner_scream', 'tank_roar',
                'impact_flesh', 'impact_metal', 'impact_concrete', 'impact_stone', 'impact_wood',
                'door_metal_shut', 'fx_heartbeat', 'ui_level_up',
                'loot_scrap', 'chest_open', 'ui_chime', 'explosion', 'ignite',
                'vehicle_skid', 'vehicle_engine_car', 'vehicle_engine_boat',
                'step', 'step_snow', 'step_metal', 'step_wood', 'step_water'
            ];
            // Ljud är små resurser att initiera, ingen yield krävs mitt i arrayen
            essentialSounds.forEach(k => SoundBank.get(soundCore, k));
        }

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);

        // 2. SHADER PERMUTATION SETUP
        // Detta tvingar Three.js att generera rätt shader-kod för belysning och dimma.
        if (envConfig) {
            scene.fog = new THREE.FogExp2(envConfig.fogColor || envConfig.bgColor, envConfig.fogDensity);
            scene.background = new THREE.Color(envConfig.bgColor);
            scene.add(new THREE.AmbientLight(0x404040, envConfig.ambientIntensity));

            if (envConfig.skyLight?.visible) {
                const dirLight = new THREE.DirectionalLight(envConfig.skyLight.color, envConfig.skyLight.intensity);
                dirLight.castShadow = true;
                scene.add(dirLight);
            }

            scene.add(new THREE.PointLight(0xffaa00, 1, 10));
            scene.add(new THREE.SpotLight(0xffffff, 1));
        }

        // 3. GEOMETRY & MATERIAL BATCHING (Zero-GC approach)
        const dummyRoot = new THREE.Group();
        dummyRoot.position.set(0, 0, -10);
        scene.add(dummyRoot);

        const addToWarmup = (obj: THREE.Object3D) => {
            obj.visible = false; // Viktigt! Allt är dolt som standard.
            dummyRoot.add(obj);
        };

        // Batch 1: Common Materials
        const matKeys = Object.keys(MATERIALS) as (keyof typeof MATERIALS)[];
        const matLen = matKeys.length;
        for (let i = 0; i < matLen; i++) {
            const k = matKeys[i];
            if (['road', 'asphalt', 'concrete'].includes(k as string)) continue;

            addToWarmup(new THREE.Mesh(GEOMETRY.box, (MATERIALS as any)[k]));

            // Yielda regelbundet för att inte blocka UI-tråden
            if (i % 15 === 0 && yieldToMain) await yieldToMain();
        }

        // Extremely important: Warm up cutout materials properly so they compile once
        addToWarmup(new THREE.Mesh(GEOMETRY.box, MATERIALS.snowCutout));
        addToWarmup(new THREE.Mesh(GEOMETRY.box, MATERIALS.dirtCutout));
        addToWarmup(new THREE.Mesh(GEOMETRY.box, MATERIALS.gravelCutout));

        // Batch 2: Characters & Projectiles
        addToWarmup(ModelFactory.createPlayer());
        Object.keys(ZOMBIE_TYPES).forEach(type => {
            addToWarmup(ModelFactory.createZombie(type, (ZOMBIE_TYPES as any)[type]));
        });
        addToWarmup(ModelFactory.createBoss('Boss', { color: 0xff0000, scale: 3 } as any));

        // Yielda efter stora komplexa modeller
        if (yieldToMain) await yieldToMain();

        // Batch 3: Environmental Props (Static Meshes)
        addToWarmup(new THREE.Mesh(GEOMETRY.treeTrunk, MATERIALS.treeTrunk));
        addToWarmup(new THREE.Mesh(GEOMETRY.foliageCluster, MATERIALS.treeFirNeedles));
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
        prefillFX(GEOMETRY.splash, MATERIALS.splash, 60);
        prefillFX(GEOMETRY.particle, MATERIALS.blood, 200);
        prefillFX(GEOMETRY.particle, MATERIALS.bullet, 50); // Sparks
        prefillFX(GEOMETRY.particle, MATERIALS.stone, 100); // Debris
        prefillFX(GEOMETRY.gore, MATERIALS.gore, 50);

        // Batch 5: Instanced Systems Warmup (Weather & Wind)
        // Shaders for InstancedMesh differ from StandardMesh. We MUST warm up both.
        const addInstancedWarmup = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
            const mesh = new THREE.InstancedMesh(geo, mat, 1);
            mesh.setMatrixAt(0, new THREE.Matrix4());
            addToWarmup(mesh);
        };

        // Weather Particles
        addInstancedWarmup(GEOMETRY.weatherParticle, MATERIALS.particle_snow);
        addInstancedWarmup(GEOMETRY.weatherParticle, MATERIALS.particle_rain);
        addInstancedWarmup(GEOMETRY.weatherParticle, MATERIALS.particle_ash);
        addInstancedWarmup(GEOMETRY.weatherParticle, MATERIALS.particle_ember);

        // Wind-patched Vegetation
        addInstancedWarmup(GEOMETRY.foliageCluster, MATERIALS.hedge);
        addInstancedWarmup(GEOMETRY.foliageCluster, MATERIALS.grass);
        addInstancedWarmup(GEOMETRY.foliageCluster, MATERIALS.flower);
        addInstancedWarmup(GEOMETRY.foliageCluster, MATERIALS.wheat);
        addInstancedWarmup(GEOMETRY.foliageCluster, MATERIALS.treeSilhouette);
        addInstancedWarmup(GEOMETRY.foliageCluster, MATERIALS.treeFirNeedles);
        addInstancedWarmup(GEOMETRY.foliageCluster, MATERIALS.treeLeavesOak);
        addInstancedWarmup(GEOMETRY.foliageCluster, MATERIALS.treeLeavesBirch);
        addInstancedWarmup(GEOMETRY.foliageCluster, MATERIALS.waterLily);
        addInstancedWarmup(GEOMETRY.foliageCluster, MATERIALS.waterLilyFlower);
        addInstancedWarmup(GEOMETRY.foliageCluster, MATERIALS.seaweed);
        addInstancedWarmup(GEOMETRY.treeTrunk, MATERIALS.treeTrunk);
        addInstancedWarmup(GEOMETRY.treeTrunk, MATERIALS.treeTrunkOak);
        addInstancedWarmup(GEOMETRY.treeTrunk, MATERIALS.treeTrunkBirch);
        addInstancedWarmup(GEOMETRY.treeTrunk, MATERIALS.deadWood);

        // UI & Feedback Effects Warmup
        addToWarmup(new THREE.Mesh(GEOMETRY.shockwave, MATERIALS.shockwave));
        addToWarmup(new THREE.Mesh(GEOMETRY.shard, MATERIALS.glassShard));
        addToWarmup(new THREE.Mesh(GEOMETRY.aimRing, MATERIALS.aimReticle));
        addToWarmup(new THREE.Mesh(GEOMETRY.landingMarker, MATERIALS.landingMarker));
        addToWarmup(new THREE.Mesh(GEOMETRY.sphere, MATERIALS.flashWhite));

        if (yieldToMain) await yieldToMain();

        // --- WATER SYSTEM WARMUP ---
        const dummyRipples: THREE.Vector4[] = [];
        const dummyObjects: THREE.Vector4[] = [];
        for (let i = 0; i < 16; i++) {
            dummyRipples.push(new THREE.Vector4(0, 0, -1000, 0));
        }
        for (let i = 0; i < 8; i++) {
            dummyObjects.push(new THREE.Vector4(0, 0, 0, 0));
        }
        const waterMat = createWaterMaterial('nordic', 10, 10, dummyRipples, dummyObjects);
        const waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), waterMat);
        addToWarmup(waterMesh);
        const iceMat = createWaterMaterial('ice', 10, 10, dummyRipples, dummyObjects);
        const iceMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), iceMat);
        addToWarmup(iceMesh);

        if (yieldToMain) await yieldToMain();

        // 4. INCREMENTAL COMPILATION
        try {
            // Kompilerar grundscenen först (dimma, bakgrund, ljus)
            renderer.compile(scene, camera);
            if (yieldToMain) await yieldToMain();

            const children = dummyRoot.children;
            const childLen = children.length;
            const batchSize = 4; // Lämplig storlek, lagom mycket shader compile per frame

            for (let i = 0; i < childLen; i += batchSize) {
                // Istället för att loopa ALLA children och sätta false, sätter vi bara
                // PÅ vår lilla batch om 4...
                for (let j = 0; j < batchSize && (i + j) < childLen; j++) {
                    children[i + j].visible = true;
                }

                // ...tvingar fram WebGL kompileringen av materialen...
                renderer.compile(scene, camera);
                if (yieldToMain) await yieldToMain();

                // ...och stänger sedan AV samma lilla batch direkt. 
                // Extremt mycket snabbare än en fullständig forEach!
                for (let j = 0; j < batchSize && (i + j) < childLen; j++) {
                    children[i + j].visible = false;
                }
            }
        } catch (e) {
            console.warn("Shader warmup failed or interrupted", e);
        }

        // 5. GENERATOR CACHE WARMUP
        try {
            await EnvironmentGenerator.initNaturePrototypes(yieldToMain);
            if (yieldToMain) await yieldToMain();

            // Warm up all vehicle types
            const vehicleTypes = Object.keys(VEHICLES) as VehicleType[];
            for (const vt of vehicleTypes) {
                ObjectGenerator.createVehicle(vt);
            }
            ObjectGenerator.createBoat();
            ObjectGenerator.createBuilding(4, 4, 4, 0x888888);
            EnvironmentGenerator.createWaterLily();
            EnvironmentGenerator.createSeaweed();
            EnvironmentGenerator.createRock(2, 2);

            if (yieldToMain) await yieldToMain();
        } catch (e) {
            console.warn("Generator warmup failed", e);
        }

        // 6. CLEANUP
        // Vi rensar scenen, men vi gör INGEN .dispose() på material/geometri, 
        // eftersom syftet med warmup var just att lägga in dem i Three.js GPU-cache!
        scene.clear();
        warmedUp = true;
    },

    isWarmedUp: () => warmedUp,
    reset: () => { warmedUp = false; lastSectorIndex = -1; },
    getLastSectorIndex: () => lastSectorIndex,
    setLastSectorIndex: (idx: number) => { lastSectorIndex = idx; }
};