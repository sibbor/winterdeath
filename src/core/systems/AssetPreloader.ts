import * as THREE from 'three';
import { GEOMETRY, MATERIALS, ModelFactory, createProceduralDiffuse } from '../../utils/assets';
import { TEXTURES } from '../../utils/assets/AssetLoader';
import { createWaterMaterial } from '../../utils/assets/materials_water';
import { FAMILY_MEMBERS, ZOMBIE_TYPES, BOSSES, PLAYER_CHARACTER, VEHICLE_HEADLIGHT } from '../../content/constants';
import { VEHICLES, VehicleType } from '../../content/vehicles';
import { ObjectGenerator } from '../world/ObjectGenerator';
import { VehicleGenerator } from '../world/VehicleGenerator';
import { EnvironmentGenerator } from '../world/EnvironmentGenerator';
import { CampWorld, stationMaterials } from '../../components/camp/CampWorld';
import { CONST_GEO as CAMP_GEO, CONST_MAT as CAMP_MAT } from '../../components/camp/CampEnvironment';
import { SectorSystem } from '../systems/SectorSystem';
import { registerSoundGenerators } from '../../utils/audio/SoundLib';
import { SoundBank } from '../../utils/audio/SoundBank';
import { PerformanceMonitor } from './PerformanceMonitor';
import { FXSystem } from '../systems/FXSystem';
import { COLLECTIBLES } from '../../content/collectibles';

const warmedModules = new Set<string>();
const activePromises = new Map<string, Promise<void>>();
let lastSectorIndex = -1;

/**
 * AssetPreloader - Service for warming up shaders and textures before they are needed.
 * This prevents the synchronous hitches caused by Three.js compiling shaders on-demand.
 * Optimized for Zero-GC.
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
            const envConfig = envConfigBase;
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

                // --- HTML UI ICON PRELOAD ---
                beginInternal('asset_warmup_ui_images');
                const uiIcons = [
                    'pistol.png', 'revolver.png', 'smg.png', 'shotgun.png',
                    'rifle.png', 'minigun.png', 'flamethrower.png', 'arc_cannon.png',
                    'grenade.png', 'molotov.png', 'flashbang.png', 'radio.png'
                ];

                // Force the browser to fetch the images and put them in RAM/Cache
                await Promise.all(uiIcons.map(file => new Promise<void>(resolve => {
                    const img = new Image();
                    img.onload = () => resolve();
                    // If an image is missing, log a warning but let the game continue loading
                    img.onerror = () => {
                        console.warn(`[AssetPreloader] missing UI icon: ${file}`);
                        resolve();
                    };
                    img.src = `/assets/icons/weapons/${file}`;
                })));

                endInternal('asset_warmup_ui_images');
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
                        'ui_hover', 'ui_click', 'ui_confirm', 'ui_chime',
                        'shot_pistol', 'shot_smg', 'shot_rifle',
                        'shot_shotgun', 'shot_revolver', 'shot_minigun',
                        'shot_arc_cannon', 'shot_flamethrower',
                        'pin_pull', 'ignite', 'explosion',
                        'walker_groan', 'walker_attack', 'walker_death',
                        'runner_scream', 'runner_attack', 'runner_death',
                        'tank_roar', 'tank_smash', 'tank_death',
                        'bomber_beep', 'step_zombie',
                        'impact_flesh', 'impact_metal', 'impact_concrete', 'impact_stone', 'impact_wood', 'blood_splat',
                        'door_metal_shut', 'door_metal_open', 'heartbeat', 'ui_level_up',
                        'loot_scrap', 'chest_open',
                        'vehicle_skid', 'vehicle_engine_car', 'vehicle_engine_boat',
                        'step', 'step_snow', 'step_metal', 'step_wood', 'step_water', 'swimming',
                        'mech_mag_out', 'mech_mag_in', 'mech_empty_click', 'mech_holster',
                        'owl_hoot', 'bird_ambience', 'ambient_rustle', 'ambient_metal'
                    ];
                    for (let i = 0; i < essentialSounds.length; i++) {
                        SoundBank.get(soundEngine, essentialSounds[i]);
                    }
                    // Warm up essential procedural music
                    const essentialMusic = [
                        'ambient_wind_loop', 'ambient_forest_loop', 'ambient_scrapyard_loop',
                        'ambient_finale_loop', 'boss_metal', 'prologue_sad'
                    ];
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

            // --- WARMUP HELPERS (Defined early for use in all sections) ---
            const dummyRoot = new THREE.Group();
            scene.add(dummyRoot);
            const ownedGeometries: THREE.BufferGeometry[] = [];
            const ownedMaterials: THREE.Material[] = [];

            const addToWarmup = (obj: THREE.Object3D, instancing: boolean = true) => {
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
                        if (instancing && !(mesh as any).isInstancedMesh) {
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

            const addInstancedWarmup = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
                const mesh = new THREE.InstancedMesh(geo, mat, 1);
                mesh.setMatrixAt(0, new THREE.Matrix4());
                mesh.visible = false;
                dummyRoot.add(mesh);
            };

            // 3. SHADER PERMUTATION SETUP (Fog, Lighting, Shadows)
            beginInternal('asset_warmup_permutations');
            if (envConfig) {
                const fogCol = new THREE.Color(envConfig.fogColor || envConfig.bgColor);
                scene.fog = new THREE.FogExp2(fogCol, envConfig.fogDensity);
                scene.background = fogCol;
                // [VINTERDÖD] AmbientLight is only for Sectors. Camp uses Hemi + Dir + Point only.
                if (envConfig.ambientIntensity !== undefined && !isCamp) {
                    scene.add(new THREE.AmbientLight(0xffffff, envConfig.ambientIntensity));
                }
                scene.add(new THREE.HemisphereLight(0x444455, 0x111115, 0.6));
                // [VINTERDÖD] Lighting Parity: Match bias and normalBias from CampEnvironment.ts
                if (isCamp || isSector) {
                    const skyLightRef = envConfig.skyLight || { color: 0xaaccff, intensity: 0.4 };
                    const dirLight = new THREE.DirectionalLight(skyLightRef.color, skyLightRef.intensity);
                    dirLight.position.set(-80, 150, -100);
                    dirLight.castShadow = true;
                    dirLight.shadow.mapSize.width = 1024;
                    dirLight.shadow.mapSize.height = 1024;
                    dirLight.shadow.bias = isCamp ? -0.0002 : -0.001;
                    scene.add(dirLight);

                    const pointLight = new THREE.PointLight(0xff7722, 40, 90);
                    pointLight.position.set(0, 3, 0);
                    pointLight.castShadow = true;
                    pointLight.shadow.mapSize.width = 512;
                    pointLight.shadow.mapSize.height = 512;
                    pointLight.shadow.bias = -0.0005;
                    pointLight.shadow.normalBias = 0.02;
                    scene.add(pointLight);
                }

                if (isSector) {
                    // Flashlight Parity (SpotLight)
                    // Used in Sectors; matches flashlight setup in GameSession.tsx
                    const flashlight = ModelFactory.createFlashlight();
                    addToWarmup(flashlight);
                    scene.add(flashlight);

                    const spotLight = new THREE.SpotLight(0xffffff, 1);
                    spotLight.castShadow = false; // Budgeted
                    spotLight.shadow.autoUpdate = false;
                    spotLight.shadow.bias = -0.0001;
                    scene.add(spotLight);
                }
            }
            endInternal('asset_warmup_permutations');

            // 4. GENERATOR & PROTOTYPE INITIALIZATION (CORE only)
            if (target === 'CORE') {
                beginInternal('asset_warmup_generators');
                try {
                    await EnvironmentGenerator.initNaturePrototypes(yieldToMain);
                    ObjectGenerator.createBuilding(10, 10, 10, 0x888888);
                    ObjectGenerator.createStorefrontBuilding(10, 10, 10);
                    ObjectGenerator.createGlassStaircase(2, 5, 2);
                    ObjectGenerator.createNeonSign("WARMUP", 0x00ffff, true);
                    ObjectGenerator.createNeonHeart(0xff0000);

                    const bumpMaps = ['snow_bump', 'asphalt_bump', 'stone_bump', 'dirt_bump', 'concrete_bump', 'brick_bump', 'bark_rough_bump'];
                    for (let i = 0; i < bumpMaps.length; i++) {
                        const tex = (TEXTURES as any)[bumpMaps[i]];
                        if (tex) renderer.initTexture(tex);
                        if (yieldToMain) await yieldToMain();
                    }

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
                    ObjectGenerator.createHedge();
                    ObjectGenerator.createWheatStalk();
                    const dummyCtx = (window as any).gameEngine?.sectorContext;
                    if (dummyCtx) {
                        ObjectGenerator.createCampfire(dummyCtx, -1000, -1000);
                        ObjectGenerator.createFire(dummyCtx, -1000, -1000);
                    }
                } catch (e) { console.warn("Generator warmup failed", e); }
                endInternal('asset_warmup_generators');
                if (yieldToMain) await yieldToMain();
            }

            // 5. GEOMETRY & MATERIAL BATCHING
            if (target === 'CORE') {
                const matKeys = Object.keys(MATERIALS) as (keyof typeof MATERIALS)[];
                for (let i = 0; i < matKeys.length; i++) {
                    const k = matKeys[i];
                    // Skip materials requiring special geometry
                    if (['road', 'asphalt', 'concrete', 'mountain', 'concreteDoubleSided'].includes(k as string)) continue;
                    const mat = MATERIALS[k] as THREE.Material;
                    addToWarmup(new THREE.Mesh(GEOMETRY.box, mat));
                    if ((mat as any).map) renderer.initTexture((mat as any).map);
                    if (i % 10 === 0 && yieldToMain) await yieldToMain();
                }

                // Geometry-specific — unique vertex attributes or blend modes not covered by GEOMETRY.box
                addToWarmup(new THREE.Mesh(GEOMETRY.splash, MATERIALS.splash));
                addToWarmup(new THREE.Mesh(GEOMETRY.bloodSplat, MATERIALS.bloodSplat));
                addToWarmup(new THREE.Mesh(GEOMETRY.decal, MATERIALS.bloodDecal));
                addToWarmup(new THREE.Mesh(GEOMETRY.splatterDecal, MATERIALS.bloodStainDecal));
                addToWarmup(new THREE.Mesh(GEOMETRY.fireZone, MATERIALS.fireZone));
                addToWarmup(new THREE.Mesh(GEOMETRY.fogParticle, MATERIALS.fog));
                addToWarmup(new THREE.Mesh(GEOMETRY.blastRadius, MATERIALS.blastRadius));
                addToWarmup(new THREE.Mesh(GEOMETRY.chestBody, MATERIALS.chestStandard));
                addToWarmup(new THREE.Mesh(GEOMETRY.chestLid, MATERIALS.chestBig));
                addToWarmup(new THREE.Mesh(GEOMETRY.rail, MATERIALS.steel));
                addToWarmup(new THREE.Mesh(GEOMETRY.sleeper, MATERIALS.wood));

                // Pre-warm Double Sided Concrete
                addToWarmup(new THREE.Mesh(GEOMETRY.box, MATERIALS.concreteDoubleSided));

                // Pre-warm Mountain Material
                const dummyMountainGeo = new THREE.BufferGeometry();
                const dummyPos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
                const dummyNorm = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
                const dummyCol = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1]);

                dummyMountainGeo.setAttribute('position', new THREE.BufferAttribute(dummyPos, 3));
                dummyMountainGeo.setAttribute('normal', new THREE.BufferAttribute(dummyNorm, 3));
                dummyMountainGeo.setAttribute('color', new THREE.BufferAttribute(dummyCol, 3));

                addToWarmup(new THREE.Mesh(dummyMountainGeo, MATERIALS.mountain));
                // Track for proper disposal after compilation to prevent memory leak
                ownedGeometries.push(dummyMountainGeo);

                // Composite props — internal sub-materials not in the MATERIALS flat object
                try {
                    addToWarmup(ObjectGenerator.createBarrel(false));
                    addToWarmup(ObjectGenerator.createBarrel(true));
                    addToWarmup(ObjectGenerator.createStreetLamp());
                    addToWarmup(ObjectGenerator.createFence());
                    addToWarmup(ObjectGenerator.createMeshFence());
                    addToWarmup(ObjectGenerator.createContainer());
                    addToWarmup(ObjectGenerator.createElectricPole());
                    addToWarmup(ObjectGenerator.createHaybale());
                    addToWarmup(ObjectGenerator.createTimberPile());
                    addToWarmup(ObjectGenerator.createDeadBody('WALKER'));
                    addToWarmup(ObjectGenerator.createDeadBody('RUNNER'));
                    addToWarmup(ObjectGenerator.createDeadBody('TANK'));
                    addToWarmup(ObjectGenerator.createDeadBody('BOMBER'));
                    addToWarmup(ObjectGenerator.createDeadBody('PLAYER'));
                    addToWarmup(ObjectGenerator.createDeadBody('HUMAN'));
                    addToWarmup(ObjectGenerator.createCaveLamp());
                    addToWarmup(ObjectGenerator.createTerminal('ARMORY'));
                    addToWarmup(ObjectGenerator.createTerminal('SPAWNER'));
                    addToWarmup(ObjectGenerator.createTerminal('ENV'));
                    addToWarmup(ObjectGenerator.createRubble(0, 0, 4));
                    addToWarmup(ObjectGenerator.createShelf());
                    addToWarmup(ObjectGenerator.createScarecrow(0, 0)); // Sector 3
                } catch (e) { console.warn('[AssetPreloader] Prop warmup failed', e); }

                if (yieldToMain) await yieldToMain();

                // UI / Feedback Effects — transparent/additive materials with unique blend modes
                addToWarmup(new THREE.Mesh(GEOMETRY.shockwave, MATERIALS.shockwave));
                addToWarmup(new THREE.Mesh(GEOMETRY.shard, MATERIALS.glassShard));
                addToWarmup(new THREE.Mesh(GEOMETRY.aimRing, MATERIALS.aimReticle));
                addToWarmup(new THREE.Mesh(GEOMETRY.landingMarker, MATERIALS.landingMarker));
                addToWarmup(new THREE.Mesh(GEOMETRY.sphere, MATERIALS.flashWhite));

                addInstancedWarmup(GEOMETRY.foliageCluster, MATERIALS.treeLeavesBirch);

                addInstancedWarmup(GEOMETRY.treeTrunk, MATERIALS.treeTrunk);
                addInstancedWarmup(GEOMETRY.treeTrunk, MATERIALS.treeTrunkOak);
                addInstancedWarmup(GEOMETRY.treeTrunk, MATERIALS.treeTrunkBirch);
                addInstancedWarmup(GEOMETRY.treeTrunk, MATERIALS.deadWood);

                // AshRenderer needs InstancedMesh warmup for smooth fading
                addInstancedWarmup(GEOMETRY.ashPile, MATERIALS.ash);

                // Sunflowers (Sector 3) — inline materials created in addInstancedSunflowers.
                // We must warm up each instanced mesh type separately.
                const sunflowerStemMat = new THREE.MeshStandardMaterial({ color: 0x228B22 });
                const sunflowerHeadMat = new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.8 });
                const sunflowerCenterMat = new THREE.MeshStandardMaterial({ color: 0x3E2723, roughness: 1.0 });
                ownedMaterials.push(sunflowerStemMat, sunflowerHeadMat, sunflowerCenterMat);
                addInstancedWarmup(GEOMETRY.stone, sunflowerStemMat);   // Dummy geo — shader only needs the material permutation
                addInstancedWarmup(GEOMETRY.stone, sunflowerHeadMat);
                addInstancedWarmup(GEOMETRY.stone, sunflowerCenterMat);

                // Tree Prototypes (also triggers EnvironmentGenerator caching)
                const treeTypes: ('PINE' | 'SPRUCE' | 'OAK' | 'DEAD' | 'BIRCH')[] = ['PINE', 'SPRUCE', 'OAK', 'DEAD', 'BIRCH'];
                for (let i = 0; i < treeTypes.length; i++) {
                    addToWarmup(EnvironmentGenerator.createTree(treeTypes[i], 1.0, 0));
                }

                // Player model
                addToWarmup(ModelFactory.createPlayer());

                // Enemy models
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

                // Family member models
                for (let i = 0; i < FAMILY_MEMBERS.length; i++) {
                    addToWarmup(ModelFactory.createFamilyMember(FAMILY_MEMBERS[i]));
                }

                if (yieldToMain) await yieldToMain();

                // Collectibles - Warm up all unique model types for Adventure Log
                try {
                    const collectibleTypes = ['phone', 'pacifier', 'axe', 'jacket', 'badge', 'diary', 'ring', 'teddy'];
                    for (let i = 0; i < collectibleTypes.length; i++) {
                        addToWarmup(ModelFactory.createCollectible(collectibleTypes[i]));
                    }
                } catch (e) {
                    console.warn('[AssetPreloader] Collectible CORE warmup failed', e);
                }
            }

            // Dynamic Environmental Warmup (Runs for every module to ensure environment-specific shaders are compiled)
            if (target === 'CORE' || isSector || isCamp) {
                // Weather Particles (InstancedMesh + MeshStandardMaterial + Fog)
                addInstancedWarmup(GEOMETRY.weatherParticle, MATERIALS.particle_snow);
                addInstancedWarmup(GEOMETRY.weatherParticle, MATERIALS.particle_rain);
                addInstancedWarmup(GEOMETRY.weatherParticle, MATERIALS.particle_ash);
                addInstancedWarmup(GEOMETRY.weatherParticle, MATERIALS.particle_ember);

                // Wind-active vegetation (Basic & Instanced permutations)
                const windMats = [MATERIALS.grass, MATERIALS.flower, MATERIALS.treeTrunkBirch, MATERIALS.treeTrunk];
                for (let i = 0; i < windMats.length; i++) {
                    const m = windMats[i];
                    addToWarmup(new THREE.Mesh(GEOMETRY.box, m)); // Standard mesh
                }

                // [VINTERDÖD] WaterSystem Parity (CORE block)
                // Common aquatic materials
                const waterMats = [MATERIALS.waterLily, MATERIALS.waterLilyFlower, MATERIALS.seaweed];
                for (let i = 0; i < waterMats.length; i++) {
                    addToWarmup(new THREE.Mesh(GEOMETRY.box, waterMats[i]));
                }

                // ShaderMaterial primary water surfaces (Nordic and Ice)
                const dummyVec4: THREE.Vector4[] = Array(16).fill(null).map(() => new THREE.Vector4());
                const waterNordic = createWaterMaterial('nordic', 20, 20, dummyVec4, dummyVec4, 'rect');
                const waterIce = createWaterMaterial('ice', 20, 20, dummyVec4, dummyVec4, 'rect');
                ownedMaterials.push(waterNordic, waterIce);

                addToWarmup(new THREE.Mesh(GEOMETRY.box, waterNordic), false);
                addToWarmup(new THREE.Mesh(GEOMETRY.box, waterIce), false);
            }

            if (isSector) {
                // Aquatic Flora (Real geometries used in WaterSystem)
                const lilyPadGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 8);
                const lilyStemGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.5, 4);
                const lilyFlowerGeo = new THREE.ConeGeometry(0.15, 0.2, 5);
                const seaweedGeo = new THREE.PlaneGeometry(0.3, 1.5, 2, 4);
                ownedGeometries.push(lilyPadGeo, lilyStemGeo, lilyFlowerGeo, seaweedGeo);

                addInstancedWarmup(lilyPadGeo, MATERIALS.waterLily);
                addInstancedWarmup(lilyFlowerGeo, MATERIALS.waterLilyFlower);
                addInstancedWarmup(seaweedGeo, MATERIALS.seaweed);
                addInstancedWarmup(lilyStemGeo, MATERIALS.seaweed);

                // Vehicle Warmup - All types to ensure shader compilation matches environment
                const vehicleTypes = Object.keys(VEHICLES) as VehicleType[];
                for (let i = 0; i < vehicleTypes.length; i++) {
                    const v = VehicleGenerator.createVehicle(vehicleTypes[i]);

                    // [FIX] Klipp bort lampan från warmup-modellen! 
                    // Annars får vi 7 skuggkastande lampor i samma scen och kraschar WebGL.
                    const internalLight = v.getObjectByName(VEHICLE_HEADLIGHT.name);
                    if (internalLight && internalLight.parent) {
                        internalLight.parent.remove(internalLight);
                        // Disposea denna dummy-lampas tillhörigheter för att undvika läckage
                        if ((internalLight as THREE.Light).shadow?.map) {
                            (internalLight as THREE.Light).shadow.map.dispose();
                        }
                    }

                    // Track geometries for disposal
                    v.traverse((child) => {
                        if ((child as THREE.Mesh).isMesh) {
                            ownedGeometries.push((child as THREE.Mesh).geometry);
                        }
                    });
                    addToWarmup(v);
                }

                // Vehicle headlight parity (SpotLight)
                // Used in Sectors; matches vehicle headlight setup in VehicleGenerator.ts
                const vehicleHeadlight = VehicleGenerator.createHeadlamp();
                addToWarmup(vehicleHeadlight);
                scene.add(vehicleHeadlight);

                // Boat - Warm up with shadows to match VehicleMovementSystem/ObjectGenerator
                const boat = VehicleGenerator.createBoat();

                // Samma fix för båten
                const boatLight = boat.getObjectByName(VEHICLE_HEADLIGHT.name);
                if (boatLight && boatLight.parent) {
                    boatLight.parent.remove(boatLight);
                    if ((boatLight as THREE.Light).shadow?.map) {
                        (boatLight as THREE.Light).shadow.map.dispose();
                    }
                }

                boat.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        ownedGeometries.push((child as THREE.Mesh).geometry);
                    }
                });

                addToWarmup(boat);

                // Water Surfaces - nordic and ice styles
                const dummyRipples = new Array(16).fill(0).map(() => new THREE.Vector4(0, 0, -1000, 0));
                const dummyObjects = new Array(8).fill(0).map(() => new THREE.Vector4(0, 0, 0, 0));
                const nordicWater = createWaterMaterial('nordic', 10, 10, dummyRipples, dummyObjects, 'circle');
                const iceWater = createWaterMaterial('ice', 10, 10, dummyRipples, dummyObjects, 'rect');
                ownedMaterials.push(nordicWater, iceWater);

                const waterSurfaceGeo = new THREE.PlaneGeometry(10, 10, 16, 16);
                waterSurfaceGeo.rotateX(-Math.PI / 2);
                ownedGeometries.push(waterSurfaceGeo);

                // Water surface mesh itself DOES NOT cast shadows
                const nwMesh = new THREE.Mesh(waterSurfaceGeo, nordicWater);
                const iwMesh = new THREE.Mesh(waterSurfaceGeo, iceWater);
                nwMesh.visible = false; iwMesh.visible = false;
                dummyRoot.add(nwMesh, iwMesh);
            }

            // Camp-specific materials/geometry (allocated fresh — tracked for disposal)
            if (isCamp) {
                // 1. STATIONS & CANVASES
                CampWorld.warmupStationAssets(renderer);

                // Use the exported geometries for warmup meshes
                const barrelGeo = (CampWorld as any).stationGeometries.barrel;
                const mapGeo = (CampWorld as any).stationGeometries.map_plane;
                const noteGeo = (CampWorld as any).stationGeometries.note_plane;

                if (barrelGeo) {
                    const barrel = new THREE.Mesh(barrelGeo, stationMaterials.metal);
                    addToWarmup(barrel, false); // Stations never instance in Camp
                    ownedGeometries.push(barrelGeo);
                }
                if (mapGeo) {
                    const map = new THREE.Mesh(mapGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
                    addToWarmup(map, false);
                    ownedGeometries.push(mapGeo);
                }
                if (noteGeo) {
                    const note = new THREE.Mesh(noteGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
                    addToWarmup(note, false);
                    ownedGeometries.push(noteGeo);
                }

                // 2. CELESTIAL BODIES (Moon, Stars, Halo)
                try {
                    // Moon Body
                    const moonGeo = new THREE.SphereGeometry(15, 32, 32);
                    const moonMat = new THREE.MeshBasicMaterial({ color: 0xffffeb, fog: false });
                    ownedGeometries.push(moonGeo);
                    ownedMaterials.push(moonMat);
                    addToWarmup(new THREE.Mesh(moonGeo, moonMat), false); // Moon is unique

                    // Moon Halo (Sprite shader is unique)
                    const haloMat = new THREE.SpriteMaterial({ color: 0xffffee, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, fog: false });
                    ownedMaterials.push(haloMat);
                    const halo = new THREE.Sprite(haloMat);
                    dummyRoot.add(halo);

                    // Star System (ShaderMaterial + Points is a unique pipeline)
                    const starMat = new THREE.ShaderMaterial({
                        uniforms: { uTime: { value: 0 } },
                        vertexShader: `
                            attribute float size; attribute float phase; attribute float twinkleSpeed; varying float vAlpha; uniform float uTime;
                            void main() {
                                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
                                float alpha = 0.8 + 0.2 * sin(phase);
                                if (twinkleSpeed > 0.0) alpha = 0.9 + 0.1 * sin(uTime * twinkleSpeed + phase);
                                vAlpha = alpha; gl_PointSize = size * (2500.0 / -mvPosition.z);
                            }
                        `,
                        fragmentShader: `varying float vAlpha; void main() { vec2 coord = gl_PointCoord - vec2(0.5); if(length(coord) > 0.5) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, vAlpha); }`,
                        transparent: true, depthWrite: false
                    });
                    const starGeo = new THREE.BufferGeometry();
                    starGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
                    starGeo.setAttribute('size', new THREE.BufferAttribute(new Float32Array([1]), 1));
                    starGeo.setAttribute('phase', new THREE.BufferAttribute(new Float32Array([0]), 1));
                    starGeo.setAttribute('twinkleSpeed', new THREE.BufferAttribute(new Float32Array([0]), 1));
                    ownedMaterials.push(starMat);
                    ownedGeometries.push(starGeo);
                    const stars = new THREE.Points(starGeo, starMat);
                    dummyRoot.add(stars);
                } catch (e) { console.warn("Sky warmup failed", e); }

                if (yieldToMain) await yieldToMain();

                // 2. STATIONS (Geometries & Materials)
                const campGeos = [
                    new THREE.CircleGeometry(1.8, 16),      // Ash
                    new THREE.CylinderGeometry(0.15, 0.15, 2.2), // Logs
                    new THREE.CylinderGeometry(0.03, 0.03, 1.2), // Barrels/Wires
                    new THREE.SphereGeometry(0.12, 8, 8),   // Bottles (round)
                    new THREE.BoxGeometry(0.15, 0.4, 0.15),  // Bottles (square)
                    new THREE.PlaneGeometry(2.0, 1.4),      // Map
                    new THREE.PlaneGeometry(0.4, 0.5),      // Notes
                    CAMP_GEO.flame,
                    CAMP_GEO.spark,
                    CAMP_GEO.smoke
                ];

                for (let i = 0; i < campGeos.length; i++) {
                    const geo = campGeos[i];
                    if (geo !== CAMP_GEO.flame && geo !== CAMP_GEO.spark && geo !== CAMP_GEO.smoke) {
                        ownedGeometries.push(geo);
                    }
                    addToWarmup(new THREE.Mesh(geo, stationMaterials.warmWood), false);
                    addToWarmup(new THREE.Mesh(geo, stationMaterials.medkitRed), false);

                    // Campfire Particle Parity
                    addToWarmup(new THREE.Mesh(geo, CAMP_MAT.flame), false);
                    addToWarmup(new THREE.Mesh(geo, CAMP_MAT.spark), false);
                    addToWarmup(new THREE.Mesh(geo, CAMP_MAT.smoke), false);
                }

                // Silhouette Trees (InstancedMesh variant)
                addInstancedWarmup(GEOMETRY.treeTrunk, MATERIALS.treeSilhouette);
                addInstancedWarmup(GEOMETRY.foliageCluster, MATERIALS.treeSilhouette);

                if (yieldToMain) await yieldToMain();

                // 3. GROUND PLANE (Cloned material with tiling)
                const groundMat = MATERIALS.dirt.clone();
                if (groundMat.map) groundMat.map.repeat.set(60, 60);
                if (groundMat.bumpMap) groundMat.bumpMap.repeat.set(60, 60);
                ownedMaterials.push(groundMat);
                const groundGeo = new THREE.PlaneGeometry(120, 120);
                groundGeo.rotateX(-Math.PI / 2);
                ownedGeometries.push(groundGeo);
                const ground = new THREE.Mesh(groundGeo, groundMat);
                ground.receiveShadow = true;
                addToWarmup(ground, false);

                // Player Model Parity
                const campPlayer = ModelFactory.createFamilyMember(PLAYER_CHARACTER);
                addToWarmup(campPlayer);
            }

            // FX Particle Instancing
            if (isSector || target === 'CORE') {
                const fxTypes = [
                    'blood', 'fire', 'large_fire', 'flame', 'spark', 'smoke', 'large_smoke',
                    'debris', 'glass', 'flash', 'splash',
                    'enemy_effect_stun', 'enemy_effect_flame', 'enemy_effect_spark', 'gore', 'blood_splat',
                    'campfire_flame', 'campfire_spark', 'campfire_smoke'
                ];
                for (let i = 0; i < fxTypes.length; i++) {
                    const realIMesh = FXSystem._getInstancedMesh(null as any, fxTypes[i]);

                    const dummyIMesh = new THREE.InstancedMesh(realIMesh.geometry, realIMesh.material, 1);
                    dummyIMesh.visible = false;
                    dummyRoot.add(dummyIMesh);

                    // Restore shadow settings
                    if (fxTypes[i] === 'debris' || fxTypes[i] === 'scrap' || fxTypes[i] === 'glass' || fxTypes[i] === 'gore') {
                        dummyIMesh.castShadow = true;
                        dummyIMesh.receiveShadow = true;
                    } else {
                        dummyIMesh.castShadow = false;
                        dummyIMesh.receiveShadow = false;
                    }
                }

                // Bullet mesh
                addToWarmup(new THREE.Mesh(GEOMETRY.bullet, MATERIALS.bullet));

                // Throwable meshes
                addToWarmup(new THREE.Mesh(GEOMETRY.molotov, MATERIALS.molotov));
                addToWarmup(new THREE.Mesh(GEOMETRY.flashbang, MATERIALS.flashbang));
                addToWarmup(new THREE.Mesh(GEOMETRY.grenade, MATERIALS.grenade));

                // CorpseRenderer
                const corpseMatWarmup = MATERIALS.zombie.clone() as THREE.MeshStandardMaterial;
                corpseMatWarmup.color.setHex(0xffffff);
                addToWarmup(new THREE.InstancedMesh(GEOMETRY.zombie, corpseMatWarmup, 1));
                ownedMaterials.push(corpseMatWarmup);

                // Collectibles
                try {
                    const sector = SectorSystem.getSector(target as number);
                    if (sector && sector.collectibles) {
                        for (let i = 0; i < sector.collectibles.length; i++) {
                            const item = sector.collectibles[i];
                            const def = COLLECTIBLES[item.id];
                            if (def) {
                                addToWarmup(ModelFactory.createCollectible(def.modelType));
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[AssetPreloader] Failed to warmup sector collectibles', e);
                }
            }

            if (yieldToMain) await yieldToMain();

            // 6. SINGLE FINAL COMPILATION PASS
            beginInternal('asset_warmup_compilation');
            try {
                const children = dummyRoot.children;
                for (let i = 0; i < children.length; i++) children[i].visible = true;

                if ((renderer as any).compileAsync) {
                    await (renderer as any).compileAsync(scene, warmupCamera);
                } else {
                    renderer.compile(scene, warmupCamera);
                }

                // Final 1x1 pixel render
                const originalViewport = new THREE.Vector4();
                renderer.getViewport(originalViewport);
                renderer.setViewport(0, 0, 1, 1);
                renderer.render(scene, warmupCamera);
                renderer.setViewport(originalViewport);

                for (let i = 0; i < children.length; i++) children[i].visible = false;
                if (yieldToMain) await yieldToMain();
            } catch (e) { console.warn("Compilation warmup failed", e); }
            endInternal('asset_warmup_compilation');

            // SAFE VRAM FLUSH
            for (let i = 0; i < ownedGeometries.length; i++) ownedGeometries[i].dispose();
            for (let i = 0; i < ownedMaterials.length; i++) ownedMaterials[i].dispose();

            // Rensa explicit upp eventuella skuggkartor från lampor i dummy-scenen
            scene.traverse((obj) => {
                if ((obj as any).isLight && (obj as THREE.Light).shadow && (obj as THREE.Light).shadow.map) {
                    (obj as THREE.Light).shadow.map!.dispose();
                }
            });

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
    setLastSectorIndex: (idx: number) => { lastSectorIndex = idx; },

    /**
     * Explicitly unmarks a sector as warmed up.
     * Use this when transitioning away from a sector to allow it to be re-cleaned and re-warmed.
     */
    releaseSectorAssets: (index: number) => {
        const moduleKey = `SECTOR_${index}`;
        if (warmedModules.has(moduleKey)) {
            warmedModules.delete(moduleKey);
            console.log(`[AssetPreloader] Module [${moduleKey}] released.`);
        }
    }
};