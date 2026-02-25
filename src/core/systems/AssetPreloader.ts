import * as THREE from 'three';
import { GEOMETRY, MATERIALS, ModelFactory, createProceduralDiffuse } from '../../utils/assets';
import { TEXTURES } from '../../utils/assets/AssetLoader';
import { createWaterMaterial } from '../../utils/assets/materials_water';
import { FAMILY_MEMBERS, ZOMBIE_TYPES, BOSSES } from '../../content/constants';
import { VEHICLES, VehicleType } from '../../content/vehicles';
import { ObjectGenerator } from '../world/ObjectGenerator';
import { EnvironmentGenerator } from '../world/EnvironmentGenerator';
import { registerSoundGenerators } from '../../utils/audio/SoundLib';
import { SoundBank } from '../../utils/audio/SoundBank';
import { PerformanceMonitor } from './PerformanceMonitor';
import { FXSystem } from '../systems/FXSystem';

// [VINTERDÖD] Camp Environment Configuration (Matches CampEnvironment.ts)
const CAMP_ENV = {
    bgColor: 0x161629,
    fogColor: 0x161629,
    fogDensity: 0.01,
    ambientIntensity: 0.4,
    skyLight: {
        visible: true,
        color: 0xaaccff,
        intensity: 0.4
    }
};

const warmedModules = new Set<string>();
const activePromises = new Map<string, Promise<void>>();
let lastSectorIndex = -1;

/**
 * AssetPreloader - Service for warming up shaders and textures before they are needed.
 * This prevents the synchronous hitches caused by Three.js compiling shaders on-demand.
 * [VINTERDÖD] Optimized for Zero-GC and 60FPS transitions.
 */
export const AssetPreloader = {

    /**
     * Pre-compiles shaders and initializes assets for a given module/sector.
     * @param renderer The current WebGL renderer.
     * @param target Target module: 'CORE', 'CAMP', or a sector index (number).
     * @param envConfigBase Optional base environment config for matching fog/lights.
     * @param yieldToMain Callback to return control to the main loop (prevents browser lockup).
     * @param overrideCamera Optional camera for exact shader permutation matching.
     */
    warmupAsync: async (renderer: THREE.WebGLRenderer, target: 'CORE' | 'CAMP' | number, envConfigBase: any = null, yieldToMain?: () => Promise<void>, overrideCamera?: THREE.Camera) => {
        const moduleKey = typeof target === 'number' ? `SECTOR_${target}` : (typeof target === 'string' ? target : 'UNKNOWN');
        if (warmedModules.has(moduleKey)) return;
        if (activePromises.has(moduleKey)) return activePromises.get(moduleKey);

        const warmupLogic = async () => {
            const isCamp = target === 'CAMP';
            const isSector = typeof target === 'number';
            const envConfig = isCamp ? CAMP_ENV : envConfigBase;
            const warmupTimings: Record<string, number> = {};
            const warmupStartTimes: Record<string, number> = {};

            const beginInternal = (id: string) => { warmupStartTimes[id] = performance.now(); };
            const endInternal = (id: string) => {
                const start = warmupStartTimes[id];
                if (start) warmupTimings[id] = (warmupTimings[id] || 0) + (performance.now() - start);
            };

            beginInternal('asset_warmup_total');

            // 0. PROCEDURAL TEXTURE CACHE WARMUP (CORE only)
            if (target === 'CORE') {
                beginInternal('asset_warmup_procedural');
                const procedural = createProceduralDiffuse();
                const texs = Object.values(procedural);
                for (let i = 0; i < texs.length; i++) renderer.initTexture(texs[i]);
                endInternal('asset_warmup_procedural');
                if (yieldToMain) await yieldToMain();
            }

            // 1. AUDIO SYSTEM WARMUP (CORE only, targeted essential sounds)
            if (target === 'CORE') {
                beginInternal('asset_warmup_audio');
                registerSoundGenerators();
                const soundEngine = (window as any).gameEngine?.sound;
                if (soundEngine) {
                    // Load only essential sounds — not the full bank — to keep boot fast
                    const essentialSounds = [
                        'ui_hover', 'ui_click', 'shot_pistol', 'shot_smg', 'shot_rifle',
                        'shot_shotgun', 'shot_revolver', 'shot_minigun',
                        'walker_groan', 'walker_death', 'runner_scream', 'tank_roar',
                        'impact_flesh', 'impact_metal', 'impact_concrete', 'impact_stone', 'impact_wood',
                        'door_metal_shut', 'fx_heartbeat', 'ui_level_up',
                        'loot_scrap', 'chest_open', 'ui_chime', 'explosion', 'ignite',
                        'vehicle_skid', 'vehicle_engine_car', 'vehicle_engine_boat',
                        'step', 'step_snow', 'step_metal', 'step_wood', 'step_water',
                        'owl_hoot', 'bird_ambience'
                    ];
                    for (let i = 0; i < essentialSounds.length; i++) {
                        SoundBank.get(soundEngine, essentialSounds[i]);
                    }
                    // Warm up essential procedural music
                    const essentialMusic = ['ambient_wind_loop', 'ambient_forest_loop', 'prologue_sad'];
                    try {
                        const { createMusicBuffer } = await import('../../utils/audio/SoundLib');
                        for (let i = 0; i < essentialMusic.length; i++) {
                            createMusicBuffer(soundEngine.ctx, essentialMusic[i]);
                            if (yieldToMain) await yieldToMain();
                        }
                    } catch (e) { console.warn('Music warmup skipped', e); }
                }
                endInternal('asset_warmup_audio');
            }

            // 2. SCENE & CAMERA SETUP
            const scene = new THREE.Scene();
            // Dedicated warmup camera prevents frustum culling from skipping shader compilation
            const warmupCamera = (overrideCamera || new THREE.PerspectiveCamera(50, 1, 0.1, 1000)) as THREE.Camera;
            if (!overrideCamera) {
                warmupCamera.position.set(0, 5, 20);
                warmupCamera.lookAt(0, 0, 0);
            }

            // 3. SHADER PERMUTATION SETUP (Fog, Lighting, Shadows)
            beginInternal('asset_warmup_permutations');
            if (envConfig) {
                const fogCol = new THREE.Color(envConfig.fogColor || envConfig.bgColor);
                scene.fog = new THREE.FogExp2(fogCol, envConfig.fogDensity);
                scene.background = fogCol;
                if (envConfig.ambientIntensity !== undefined) {
                    scene.add(new THREE.AmbientLight(0xffffff, envConfig.ambientIntensity));
                }
                scene.add(new THREE.HemisphereLight(0x444455, 0x111115, 0.6));
                if (envConfig.skyLight?.visible) {
                    const dirLight = new THREE.DirectionalLight(envConfig.skyLight.color, envConfig.skyLight.intensity);
                    dirLight.castShadow = true;
                    dirLight.shadow.mapSize.set(1024, 1024);
                    scene.add(dirLight);
                }
                if (isCamp || isSector) {
                    const pointLight = new THREE.PointLight(0xff7722, 40, 90);
                    pointLight.castShadow = false; // [VINTERDÖD] Budgeted: Start OFF, LightingSystem manages shadows.
                    pointLight.shadow.autoUpdate = false;
                    pointLight.shadow.mapSize.set(512, 512);
                    pointLight.shadow.bias = -0.0005;
                    pointLight.shadow.normalBias = 0.02;
                    scene.add(pointLight);
                }
                const spotLight = new THREE.SpotLight(0xffffff, 1);
                spotLight.castShadow = false; // [VINTERDÖD] Budgeted
                spotLight.shadow.autoUpdate = false;
                spotLight.shadow.bias = -0.0001;
                scene.add(spotLight);
            }
            endInternal('asset_warmup_permutations');

            // 4. GENERATOR & PROTOTYPE INITIALIZATION (CORE only)
            if (target === 'CORE') {
                beginInternal('asset_warmup_generators');
                try {
                    await EnvironmentGenerator.initNaturePrototypes(yieldToMain);
                    ObjectGenerator.createBuilding(10, 10, 10, 0x888888);
                    ObjectGenerator.createNeonSign("WARMUP", 0x00ffff, true);
                    ObjectGenerator.createNeonHeart(0xff0000);

                    const bumpMaps = ['snow_bump', 'asphalt_bump', 'stone_bump', 'dirt_bump'];
                    for (let i = 0; i < bumpMaps.length; i++) {
                        const tex = (TEXTURES as any)[bumpMaps[i]];
                        if (tex) renderer.initTexture(tex);
                        if (yieldToMain) await yieldToMain();
                    }

                    // Warm up all vehicle types — stutter guard for first vehicle encounter
                    const vehicleTypes = Object.keys(VEHICLES) as VehicleType[];
                    for (let i = 0; i < vehicleTypes.length; i++) {
                        ObjectGenerator.createVehicle(vehicleTypes[i]);
                    }
                    ObjectGenerator.createBoat();

                    // Water surface shaders — critical for any lake/river biome
                    const dummyRipples: THREE.Vector4[] = [];
                    const dummyObjects: THREE.Vector4[] = [];
                    for (let i = 0; i < 16; i++) dummyRipples.push(new THREE.Vector4(0, 0, -1000, 0));
                    for (let i = 0; i < 8; i++) dummyObjects.push(new THREE.Vector4(0, 0, 0, 0));
                    createWaterMaterial('nordic', 10, 10, dummyRipples, dummyObjects);
                    createWaterMaterial('ice', 10, 10, dummyRipples, dummyObjects);

                    EnvironmentGenerator.createWaterLily();
                    EnvironmentGenerator.createSeaweed();
                    EnvironmentGenerator.createRock(2, 2);
                } catch (e) { console.warn("Generator warmup failed", e); }
                endInternal('asset_warmup_generators');
                if (yieldToMain) await yieldToMain();
            }

            // 5. GEOMETRY & MATERIAL BATCHING
            // [VINTERDÖD] Track all newly allocated objects in separate arrays.
            // NEVER dispose shared MATERIALS.xxx or GEOMETRY.xxx — only our own creations.
            const dummyRoot = new THREE.Group();
            scene.add(dummyRoot);
            const ownedGeometries: THREE.BufferGeometry[] = [];
            const ownedMaterials: THREE.Material[] = [];

            const addToWarmup = (obj: THREE.Object3D) => {
                obj.visible = false;
                obj.traverse((child) => {
                    if ((child as any).isMesh) {
                        const mesh = child as THREE.Mesh;
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;

                        // Alpha-tested materials need a depth material warmed up too
                        if (mesh.material && (mesh.material as any).alphaTest > 0) {
                            if (!mesh.customDepthMaterial) {
                                const depthMat = new THREE.MeshDepthMaterial({
                                    depthPacking: THREE.RGBADepthPacking,
                                    map: (mesh.material as any).map,
                                    alphaTest: (mesh.material as any).alphaTest
                                });
                                mesh.customDepthMaterial = depthMat;
                                ownedMaterials.push(depthMat);
                            }
                        }

                        // InstancedMesh shader differs from regular Mesh — warm up both
                        if (!(mesh as any).isInstancedMesh) {
                            const iMesh = new THREE.InstancedMesh(mesh.geometry, mesh.material, 1);
                            iMesh.castShadow = true;
                            iMesh.receiveShadow = true;
                            iMesh.visible = false;
                            if (mesh.customDepthMaterial) {
                                const depthClone = mesh.customDepthMaterial.clone();
                                iMesh.customDepthMaterial = depthClone;
                                ownedMaterials.push(depthClone);
                            }
                            dummyRoot.add(iMesh);
                        }
                    }
                });
                dummyRoot.add(obj);
            };

            // Helper for InstancedMesh-only warmup (weather, dense foliage, etc.)
            const addInstancedWarmup = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
                const mesh = new THREE.InstancedMesh(geo, mat, 1);
                mesh.setMatrixAt(0, new THREE.Matrix4());
                mesh.visible = false;
                dummyRoot.add(mesh);
            };

            // All shared MATERIALS, GEOMETRY, vegetation, weather, UI — CORE only.
            // SECTOR_N and CAMP have their own dedicated sections below.
            if (target === 'CORE') {
                const matKeys = Object.keys(MATERIALS) as (keyof typeof MATERIALS)[];
                for (let i = 0; i < matKeys.length; i++) {
                    const k = matKeys[i];
                    if (['road', 'asphalt', 'concrete'].includes(k as string)) continue;
                    const mat = MATERIALS[k] as THREE.Material;
                    addToWarmup(new THREE.Mesh(GEOMETRY.box, mat));
                    if ((mat as any).map) renderer.initTexture((mat as any).map);
                    if (i % 10 === 0 && yieldToMain) await yieldToMain();
                }

                // Geometry-specific — unique vertex attributes or blend modes not covered by GEOMETRY.box
                addToWarmup(new THREE.Mesh(GEOMETRY.splash, MATERIALS.splash));
                addToWarmup(new THREE.Mesh(GEOMETRY.decal, MATERIALS.bloodDecal));
                addToWarmup(new THREE.Mesh(GEOMETRY.splatterDecal, MATERIALS.bloodStainDecal));
                addToWarmup(new THREE.Mesh(GEOMETRY.fireZone, MATERIALS.fireZone));
                addToWarmup(new THREE.Mesh(GEOMETRY.ashPile, MATERIALS.ash));
                addToWarmup(new THREE.Mesh(GEOMETRY.fogParticle, MATERIALS.fog));
                addToWarmup(new THREE.Mesh(GEOMETRY.blastRadius, MATERIALS.blastRadius));
                addToWarmup(new THREE.Mesh(GEOMETRY.chestBody, MATERIALS.chestStandard));
                addToWarmup(new THREE.Mesh(GEOMETRY.chestLid, MATERIALS.chestBig));
                addToWarmup(new THREE.Mesh(GEOMETRY.rail, MATERIALS.steel));
                addToWarmup(new THREE.Mesh(GEOMETRY.sleeper, MATERIALS.wood));

                // Composite props — internal sub-materials not in the MATERIALS flat object
                try {
                    addToWarmup(ObjectGenerator.createBarrel(false));
                    addToWarmup(ObjectGenerator.createBarrel(true));
                    addToWarmup(ObjectGenerator.createStreetLamp());
                    addToWarmup(ObjectGenerator.createFence());
                    addToWarmup(ObjectGenerator.createMeshFence());
                    addToWarmup(ObjectGenerator.createContainer());
                    addToWarmup(ObjectGenerator.createCrashedCar());
                    addToWarmup(ObjectGenerator.createElectricPole());
                    addToWarmup(ObjectGenerator.createHaybale());
                    addToWarmup(ObjectGenerator.createTimberPile());
                    addToWarmup(ObjectGenerator.createDeadBody('WALKER'));
                    addToWarmup(ObjectGenerator.createDeadBody('PLAYER'));
                    addToWarmup(ObjectGenerator.createCaveLamp());
                    addToWarmup(ObjectGenerator.createTerminal('ARMORY'));
                    addToWarmup(ObjectGenerator.createRubble(0, 0, 4));
                    addToWarmup(ObjectGenerator.createShelf());
                } catch (e) { console.warn('[AssetPreloader] Prop warmup failed', e); }

                if (yieldToMain) await yieldToMain();

                // UI / Feedback Effects — transparent/additive materials with unique blend modes
                addToWarmup(new THREE.Mesh(GEOMETRY.shockwave, MATERIALS.shockwave));
                addToWarmup(new THREE.Mesh(GEOMETRY.shard, MATERIALS.glassShard));
                addToWarmup(new THREE.Mesh(GEOMETRY.aimRing, MATERIALS.aimReticle));
                addToWarmup(new THREE.Mesh(GEOMETRY.landingMarker, MATERIALS.landingMarker));
                addToWarmup(new THREE.Mesh(GEOMETRY.sphere, MATERIALS.flashWhite));

                // Weather Particles — WeatherSystem uses InstancedMesh (different shader permutation)
                addInstancedWarmup(GEOMETRY.weatherParticle, MATERIALS.particle_snow);
                addInstancedWarmup(GEOMETRY.weatherParticle, MATERIALS.particle_rain);
                addInstancedWarmup(GEOMETRY.weatherParticle, MATERIALS.particle_ash);
                addInstancedWarmup(GEOMETRY.weatherParticle, MATERIALS.particle_ember);

                // Wind-patched Vegetation — InstancedMesh uses a different shader than regular Mesh
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

                // Tree Prototypes (also triggers EnvironmentGenerator caching)
                const treeTypes: ('PINE' | 'SPRUCE' | 'OAK' | 'DEAD' | 'BIRCH')[] = ['PINE', 'SPRUCE', 'OAK', 'DEAD', 'BIRCH'];
                for (let i = 0; i < treeTypes.length; i++) {
                    addToWarmup(EnvironmentGenerator.createTree(treeTypes[i], 1.0, 0));
                }

                // Player, enemies and family members
                addToWarmup(ModelFactory.createPlayer());
                const flashlight = new THREE.SpotLight(0xffffee, 400, 60, Math.PI / 3, 0.6, 1);
                flashlight.castShadow = true;
                addToWarmup(flashlight);

                const zombieKeys = Object.keys(ZOMBIE_TYPES);
                for (let i = 0; i < zombieKeys.length; i++) {
                    const type = zombieKeys[i];
                    const z = ModelFactory.createZombie(type, (ZOMBIE_TYPES as any)[type]);
                    addToWarmup(z);
                    z.traverse(child => {
                        if ((child as any).isMesh) {
                            const iMesh = new THREE.InstancedMesh((child as THREE.Mesh).geometry, (child as THREE.Mesh).material, 100);
                            iMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(300), 3);
                            addToWarmup(iMesh);
                        }
                    });
                }
                for (let i = 0; i < FAMILY_MEMBERS.length; i++) {
                    addToWarmup(ModelFactory.createFamilyMember(FAMILY_MEMBERS[i]));
                }

                if (yieldToMain) await yieldToMain();
            }


            // Camp-specific materials/geometry (allocated fresh — tracked for disposal)
            if (isCamp) {
                const campMats = [
                    new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.8 }),
                    new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.8 }),
                    new THREE.MeshBasicMaterial({ color: 0xffffeb, fog: false })
                ];
                for (let i = 0; i < campMats.length; i++) {
                    ownedMaterials.push(campMats[i]);
                    addToWarmup(new THREE.Mesh(GEOMETRY.box, campMats[i]));
                }
                const campGeoList = [
                    new THREE.CircleGeometry(1.8, 16),
                    new THREE.CylinderGeometry(0.15, 0.15, 2.2),
                    new THREE.DodecahedronGeometry(0.4)
                ];
                for (let i = 0; i < campGeoList.length; i++) {
                    ownedGeometries.push(campGeoList[i]);
                    addToWarmup(new THREE.Mesh(campGeoList[i], MATERIALS.asphalt));
                }
                const lineColors = [0xffff00, 0x00ff00, 0xff0000];
                for (let i = 0; i < lineColors.length; i++) {
                    const edgesGeo = new THREE.EdgesGeometry(GEOMETRY.box);
                    const lineMat = new THREE.LineBasicMaterial({ color: lineColors[i] });
                    ownedGeometries.push(edgesGeo);
                    ownedMaterials.push(lineMat);
                    addToWarmup(new THREE.LineSegments(edgesGeo, lineMat));
                }
            }

            // FX Particle Instancing — all sectors need fire/smoke/blood shaders pre-compiled
            // Not needed for Camp — no combat effects in hub
            if (isSector || target === 'CORE') {
                const fxTypes = [
                    'blood', 'fire', 'large_fire', 'flame', 'spark', 'smoke', 'large_smoke',
                    'debris', 'glass', 'flash', 'splash',
                    'enemy_effect_stun', 'enemy_effect_flame', 'enemy_effect_spark', 'gore'
                ];
                for (let i = 0; i < fxTypes.length; i++) {
                    const fxMesh = FXSystem._getInstancedMesh(scene, fxTypes[i]);
                    addToWarmup(fxMesh);
                }

                // Bullet mesh — individual THREE.Mesh (not instanced), fired every shot.
                // Uses SphereGeometry + MeshBasicMaterial, must be compiled before first shot.
                addToWarmup(new THREE.Mesh(GEOMETRY.bullet, MATERIALS.bullet));

                // Throwable meshes — MeshStandardMaterial triggers GPU shader compilation on first use.
                addToWarmup(new THREE.Mesh(GEOMETRY.molotov, MATERIALS.molotov));
                addToWarmup(new THREE.Mesh(GEOMETRY.flashbang, MATERIALS.flashbang));
                addToWarmup(new THREE.Mesh(GEOMETRY.grenade, MATERIALS.grenade));

                // CorpseRenderer — clones MATERIALS.zombie into a unique MeshStandardMaterial.
                // The cloned material has the same shader permutation but needs its shadow map variant compiled.
                const corpseMatWarmup = MATERIALS.zombie.clone() as THREE.MeshStandardMaterial;
                corpseMatWarmup.color.setHex(0xffffff);
                addToWarmup(new THREE.InstancedMesh(GEOMETRY.zombie, corpseMatWarmup, 1));
                ownedMaterials.push(corpseMatWarmup);
            }

            if (yieldToMain) await yieldToMain();

            // 6. SINGLE FINAL COMPILATION PASS
            // [VINTERDÖD] All objects compiled together — GPU driver batches shader compilation
            // by hardware limit, which is more efficient than per-object roundtrips.
            beginInternal('asset_warmup_compilation');
            try {
                const children = dummyRoot.children;
                for (let i = 0; i < children.length; i++) children[i].visible = true;

                if ((renderer as any).compileAsync) {
                    await (renderer as any).compileAsync(scene, warmupCamera);
                } else {
                    renderer.compile(scene, warmupCamera);
                }

                // Final 1x1 pixel render to flush the GPU pipeline
                const originalViewport = new THREE.Vector4();
                renderer.getViewport(originalViewport);
                renderer.setViewport(0, 0, 1, 1);
                renderer.render(scene, warmupCamera);
                renderer.setViewport(originalViewport);

                for (let i = 0; i < children.length; i++) children[i].visible = false;
                if (yieldToMain) await yieldToMain();
            } catch (e) { console.warn("Compilation warmup failed", e); }
            endInternal('asset_warmup_compilation');

            // [VINTERDÖD] SAFE VRAM FLUSH — only dispose objects WE created.
            // Shared MATERIALS.xxx / GEOMETRY.xxx are live runtime assets and must NOT be disposed.
            for (let i = 0; i < ownedGeometries.length; i++) ownedGeometries[i].dispose();
            for (let i = 0; i < ownedMaterials.length; i++) ownedMaterials[i].dispose();

            scene.clear();
            if ((renderer as any).renderLists) (renderer as any).renderLists.dispose();

            warmedModules.add(moduleKey);
            endInternal('asset_warmup_total');

            console.log(`[AssetPreloader] Warmup Module [${moduleKey}] Complete. Details:`, warmupTimings);
            PerformanceMonitor.getInstance().startFrame();
        };

        const promise = warmupLogic().finally(() => {
            activePromises.delete(moduleKey);
        });
        activePromises.set(moduleKey, promise);
        return promise;
    },

    isWarmedUp: (module: string = 'CORE') => warmedModules.has(module),
    reset: () => {
        warmedModules.clear();
        activePromises.clear();
        lastSectorIndex = -1;
    },
    getLastSectorIndex: () => lastSectorIndex,
    setLastSectorIndex: (idx: number) => { lastSectorIndex = idx; }
};