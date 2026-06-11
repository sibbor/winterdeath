import * as THREE from 'three';
import { WinterEngine } from '../core/engine/WinterEngine';
import { GEOMETRY, MATERIALS, ModelFactory, createProceduralDiffuse, createProceduralTextures, TREE_DEPTH_MATS } from '../utils/assets';
import { MATERIALS_SKY } from '../utils/assets/materials_sky';
import { TEXTURES, AssetLoader } from '../utils/assets/AssetLoader';
import { createWaterMaterial, WaterGeometryPool } from '../utils/assets/materials_water';
import { MATERIALS_FOG } from '../utils/assets/materials_fog';
import { MATERIALS_WEATHER } from '../utils/assets/materials_weather';
import { WeatherType } from '../core/engine/EnvironmentalTypes';
import { FAMILY_MEMBERS, ZOMBIE_TYPES, BOSSES, WATER_SYSTEM, LIGHT_SYSTEM, LIGHT_SETTINGS } from '../content/constants';
import { VEGETATION_TYPE } from '../content/environment';
import { EnemyType } from '../entities/enemies/EnemyTypes';
import { VEHICLES, VehicleType } from '../content/vehicles';
import { VehicleID } from '../entities/vehicles/VehicleTypes';
import { ObjectGenerator } from '../core/world/generators/ObjectGenerator';
import { VehicleGenerator } from '../core/world/generators/VehicleGenerator';
import { VegetationGenerator } from '../core/world/generators/VegetationGenerator';
import { PoiGenerator } from '../core/world/generators/PoiGenerator';
import { CampWorld, CAMP_SCENE } from '../components/camp/CampWorld';
import { SectorSystem } from './SectorSystem';
import { SectorBuilder } from '../core/world/SectorBuilder';
import { WaterShape } from '../types/WaterTypes';
import { ChestType } from '../game/session/SectorTypes';
import { registerSoundGenerators } from '../utils/audio/AudioLib';
import { audioEngine } from '../utils/audio/AudioEngine';
import { FXSystem } from './FXSystem';
import { COLLECTIBLES } from '../content/collectibles';
import { WEAPONS } from '../content/weapons';
import { FXParticleType } from '../types/FXTypes';
import { checkIsMobileDevice } from '../utils/device';
import { SystemID } from './System';

const warmedModules = new Set<string>();
const activePromises = new Map<string, Promise<void>>();
let lastSectorIndex = -1;

// Global asynkron kö för att skydda Zero-GC scratchpads från Race Conditions
let _globalWarmupQueue: Promise<void> = Promise.resolve();

// --- PERSISTENT SHARED MODEL POOL ---
const sharedPool: THREE.Object3D[] = [];
let sharedPoolPopulated = false;
let sharedPoolCompiled = false;

// --- PERFORMANCE SCRATCHPADS & DUMMIES (Zero-GC) ---
const _dummyMatrix = new THREE.Matrix4();
const _traverseStack: THREE.Object3D[] = [];

// Reusable arrays to prevent GC allocations during sector transitions
const _compileTargets: THREE.Object3D[] = [];
const _cullStatusObjs: THREE.Object3D[] = [];
const _cullStatusBools: boolean[] = [];
const _toRemoveObjs: THREE.Object3D[] = [];

// Pre-allocate dummy water vectors globally
const _dummyRipples: THREE.Vector4[] = [];
const _dummyObjects: THREE.Vector4[] = [];
for (let i = 0; i < WATER_SYSTEM.MAX_RIPPLES; i++) _dummyRipples.push(new THREE.Vector4(0, 0, -1000, 0));
for (let i = 0; i < WATER_SYSTEM.MAX_FLOATING_OBJECTS; i++) _dummyObjects.push(new THREE.Vector4(0, 0, -1000, 0));

// Static arrays to prevent GC allocations
const BUMP_MAPS = ['snow_bump', 'asphalt_bump', 'stone_bump', 'dirt_bump', 'concrete_bump', 'brick_bump', 'bark_rough_bump'];
const FX_SOLID = [FXParticleType.DEBRIS, FXParticleType.SCRAP, FXParticleType.GLASS, FXParticleType.GORE];
const FX_GAS = [
    FXParticleType.FIRE, FXParticleType.LARGE_FIRE, FXParticleType.FLAME, FXParticleType.SPARK, FXParticleType.SMOKE,
    FXParticleType.LARGE_SMOKE, FXParticleType.FLASH, FXParticleType.SPLASH, FXParticleType.IMPACT,
    FXParticleType.SHOCKWAVE, FXParticleType.FROST_NOVA, FXParticleType.SCREECH_WAVE, FXParticleType.ELECTRIC_BEAM,
    FXParticleType.MAGNETIC_SPARKS, FXParticleType.GROUND_IMPACT, FXParticleType.IMPACT_SPLAT,
    FXParticleType.CAMPFIRE_FLAME, FXParticleType.CAMPFIRE_SPARK, FXParticleType.CAMPFIRE_SMOKE, FXParticleType.FLAMETHROWER_FIRE,
    FXParticleType.ENEMY_EFFECT_STUN, FXParticleType.ELECTRIC_FLASH, FXParticleType.ENEMY_EFFECT_FLAME,
    FXParticleType.ENEMY_EFFECT_SPARK, FXParticleType.BLAST_RADIUS,
    FXParticleType.BLOOD_SPLATTER, FXParticleType.BLACK_SMOKE, FXParticleType.DEBRIS_TRAIL
];
const ALL_FX = [...FX_SOLID, ...FX_GAS];
const DEAD_BODY_TYPES = [EnemyType.WALKER, EnemyType.RUNNER, EnemyType.TANK, EnemyType.BLOATER];
const TREE_TYPES = [VEGETATION_TYPE.PINE, VEGETATION_TYPE.SPRUCE, VEGETATION_TYPE.OAK, VEGETATION_TYPE.BIRCH, VEGETATION_TYPE.DEAD_TREE];

// Reusable dummy scene for compilation
const _dummyScene = new THREE.Scene();

export const AssetPreloader = {
    systemId: SystemID.ASSET_PRELOADER,
    id: 'asset_preloader',
    enabled: true,
    persistent: true,

    isWarmedUp: (module: string = 'CORE') => warmedModules.has(module),

    warmupAsync: async (target: 'CORE' | 'CAMP' | 'SECTOR', yieldToMain?: () => Promise<void>, sectorId?: number) => {
        const moduleKey = target === 'SECTOR' ? `SECTOR_${sectorId ?? 0}` : target;

        // Kapsla in hela uppvärmningen i en task för att läggas i Promise-kön
        const warmupTask = async () => {
            // Swap-and-go 1-Slot Cache for Sectors
            if (target === 'SECTOR') {
                const currentSectorId = sectorId ?? 0;

                // If we are loading a NEW sector, evict the OLD sector from memory
                if (lastSectorIndex !== -1 && lastSectorIndex !== currentSectorId) {
                    const oldModuleKey = `SECTOR_${lastSectorIndex}`;
                    console.log(`[AssetPreloader] ♻️ Swapping cached sector: Evicting ${oldModuleKey} to make room for ${moduleKey}.`);
                    warmedModules.delete(oldModuleKey);
                }

                lastSectorIndex = currentSectorId;
            }

            if (warmedModules.has(moduleKey)) {
                console.log("[AssetPreloader] Already warmed up: ", moduleKey);
                return; // Already compiled
            }

            if (activePromises.has(moduleKey)) {
                console.log("[AssetPreloader] Already warming up: ", moduleKey);
                // Eftersom vi nu köar uppgifter är det osannolikt att detta träffas, 
                // men vi behåller det som skydd ifall UI:t dubbelklickar på något.
                await activePromises.get(moduleKey);
                return;
            }

            const isCore = target === 'CORE';
            const isCamp = target === 'CAMP';
            const isSector = target === 'SECTOR';
            const engine = WinterEngine.getInstance();

            const warmupTimings: Record<string, number> = {};
            const warmupStartTimes: Record<string, number> = {};

            const beginInternal = (id: string) => { warmupStartTimes[id] = performance.now(); };
            const endInternal = (id: string) => {
                const start = warmupStartTimes[id];
                if (start) warmupTimings[id] = (warmupTimings[id] || 0) + (performance.now() - start);
            };

            beginInternal('asset_warmup_total');
            console.info(`[AssetPreloader] ▶ START warming [${moduleKey}]`);

            // =========================================================
            // PHASE 1: CORE DATA FETCHING
            // =========================================================
            if (isCore) {
                beginInternal('core_assets');

                registerSoundGenerators();
                audioEngine.resume();
                FXSystem.preload(_dummyScene);

                if (yieldToMain) await yieldToMain();

                const procedural = createProceduralDiffuse();
                for (const key in procedural) {
                    engine.renderer.initTexture((procedural as any)[key]);
                }

                await AssetLoader.getInstance().waitForTextures();

                for (let i = 0; i < BUMP_MAPS.length; i++) {
                    const tex = (TEXTURES as any)[BUMP_MAPS[i]];
                    if (tex) engine.renderer.initTexture(tex);
                }

                const uiAssetsSet = new Set<string>([
                    '/assets/icons/ui/icon_dodge.png',
                    '/assets/icons/ui/icon_reload.png',
                    '/assets/icons/ui/icon_flashlight.png',
                    '/assets/icons/ui/skill_vitality.png',
                    '/assets/icons/ui/skill_adrenaline.png',
                    '/assets/icons/ui/skill_reflex.png'
                ]);

                for (const key in WEAPONS) {
                    const w = (WEAPONS as any)[key];
                    if (w.icon && w.iconIsPng) uiAssetsSet.add(w.icon);
                }

                const allUiAssets = Array.from(uiAssetsSet);
                const imagePromises: Promise<void>[] = [];
                for (let i = 0; i < allUiAssets.length; i++) {
                    const img = new Image();
                    img.src = allUiAssets[i];
                    imagePromises.push(img.decode().catch(() => { }));
                }
                await Promise.all(imagePromises);
                endInternal('core_assets');

                if (!sharedPoolPopulated) {
                    beginInternal('shared_init');
                    await AssetPreloader._populateSharedPool(engine, yieldToMain);
                    sharedPoolPopulated = true;
                    endInternal('shared_init');
                }

                warmedModules.add(moduleKey);
                endInternal('asset_warmup_total');
                console.info(`[AssetPreloader] ✅ DONE [CORE]`);
                return;
            }

            // =========================================================
            // PHASE 2: SCENE COMPILATION
            // =========================================================
            beginInternal('scene_inject');

            // Clean dummy scene beforehand
            while (_dummyScene.children.length > 0) {
                _dummyScene.remove(_dummyScene.children[0]);
            }

            // Populate with proxy lights - LightSystem will handle it
            // Only add up to 5 lights for warmup. 
            // Most shaders only care about 1-4 lights; adding 100+ is pure overhead.
            const ENGINE_MAX_VISIBLE = Math.min(engine.maxVisibleLights || 3, 5);
            const SHADOW_BUDGET = engine.maxSafeShadows || 1;

            for (let i = 0; i < ENGINE_MAX_VISIBLE; i++) {
                const proxy = new THREE.PointLight(LIGHT_SYSTEM.DEFAULT_COLOR, 0, LIGHT_SYSTEM.DEFAULT_DISTANCE);
                proxy.name = `PreloadProxy_${i}`;
                proxy.userData.isProxy = true;
                proxy.position.set(0, -1000, 0);

                if (i < SHADOW_BUDGET) {
                    proxy.castShadow = true;
                    proxy.shadow.mapSize.set(LIGHT_SETTINGS.SHADOW_MAP_SIZE, LIGHT_SETTINGS.SHADOW_MAP_SIZE);
                    proxy.shadow.bias = LIGHT_SETTINGS.SHADOW_BIAS;
                    proxy.shadow.radius = LIGHT_SETTINGS.SHADOW_RADIUS;
                } else {
                    proxy.castShadow = false;
                }

                _dummyScene.add(proxy);
            }

            // Sync environment
            let envConfig = null;
            let groundType = undefined;

            if (isCamp) {
                envConfig = CAMP_SCENE;
                // Camp default ground is Snow (0)
                groundType = 0;
            } else if (isSector) {
                const sector = await SectorSystem.loadSector(sectorId ?? 0);
                envConfig = sector.environment;
                groundType = sector.ground;
            }

            if (envConfig) {
                engine.syncEnvironment(envConfig, groundType, _dummyScene);


            }

            // Preload FX materials (like _blackSmoke) now that we have a scene
            FXSystem.preload(_dummyScene);

            // Camp
            if (isCamp) {
                const textures = createProceduralTextures();

                // Warm up camp specific materials
                for (const key in MATERIALS) {
                    if (key.startsWith('camp_') && key !== 'camp_star' && key !== 'camp_moonHalo') {
                        const mat = (MATERIALS as any)[key];
                        // Only warm up standard/basic/phong/lambert materials on a BoxGeometry
                        if (mat.isMeshStandardMaterial || mat.isMeshBasicMaterial || mat.isMeshPhongMaterial || mat.isMeshLambertMaterial) {
                            _dummyScene.add(new THREE.Mesh(GEOMETRY.box, mat));
                            if (mat.map) engine.renderer.initTexture(mat.map);
                        }
                    }
                }


                await CampWorld.build(_dummyScene, textures as any, CAMP_SCENE.weather.type, true);

                let lampsInScene = 0;
                _dummyScene.traverse((obj) => { if (obj instanceof THREE.PointLight) lampsInScene++; });
                console.log(`[AssetPreloader] CAMP: Compiling native shader for ${lampsInScene} natural light(s).`);
            }

            // Sector Basic Prep (Flashlight & Lights only)
            else if (isSector) {
                // Players flashlight (PointLight!)
                const dummyFlashlight = ModelFactory.createFlashlight();
                dummyFlashlight.position.set(0, 5, 0);
                _dummyScene.add(dummyFlashlight);
                _dummyScene.add(dummyFlashlight.target);

                // Lighting Proxies are already added in the loop above
                let lampsInScene = 0;
                _dummyScene.traverse((obj) => {
                    if (obj instanceof THREE.PointLight) {
                        lampsInScene++;
                    }
                });
                console.log(`[AssetPreloader] SECTOR: Initialized ${lampsInScene} lighting proxies for warmup.`);
            }
            endInternal('scene_inject');

            // =========================================================
            // PHASE 3: SMART COMPILE SHARED POOL
            // =========================================================
            beginInternal('compilation');

            const isMobile = checkIsMobileDevice();

            // =========================================================
            // iOS WATCHDOG BYPASS (Time-Slicer)
            // =========================================================
            const safeCompileAsync = async (rootNode: THREE.Object3D, logName: string) => {
                // Calculate size of compilation batch
                let objCount = 0;
                _traverseStack.length = 0;
                _traverseStack.push(rootNode);
                while (_traverseStack.length > 0) {
                    const obj = _traverseStack.pop() as any;
                    if (obj.isMesh || obj.isSkinnedMesh) objCount++;
                    for (let i = 0; i < obj.children.length; i++) _traverseStack.push(obj.children[i]);
                }

                // If the batch is small and we are on desktop, use the fast path.
                // Otherwise, use time-slicing to prevent UI freezes.
                if (!isMobile && objCount < 50) {
                    engine.renderer.compile(_dummyScene, engine.camera.threeCamera);
                    return;
                }

                console.log(`📱 [AssetPreloader] Time-slicing ${logName} to bypass iOS Watchdog...`);
                _compileTargets.length = 0;

                _traverseStack.length = 0;
                _traverseStack.push(rootNode);

                while (_traverseStack.length > 0) {
                    const obj = _traverseStack.pop() as THREE.Object3D;
                    // Fast array approach instead of Map. We only push visible objects!
                    if (((obj as any).isMesh || (obj as any).isSkinnedMesh) && obj.visible) {
                        obj.visible = false;
                        _compileTargets.push(obj);
                    }
                    for (let i = 0; i < obj.children.length; i++) _traverseStack.push(obj.children[i]);
                }

                const CHUNK_SIZE = 15;
                for (let i = 0; i < _compileTargets.length; i += CHUNK_SIZE) {
                    const chunkEnd = Math.min(i + CHUNK_SIZE, _compileTargets.length);
                    for (let c = i; c < chunkEnd; c++) _compileTargets[c].visible = true;

                    engine.renderer.compile(_dummyScene, engine.camera.threeCamera);

                    for (let c = i; c < chunkEnd; c++) _compileTargets[c].visible = false;

                    if (yieldToMain) {
                        await yieldToMain();
                    } else {
                        await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
                    }
                }

                // Fast restore. We know all objects in _compileTargets started as visible=true.
                for (let i = 0; i < _compileTargets.length; i++) {
                    _compileTargets[i].visible = true;
                }
            };

            // Compile shared pool once globally!
            if (!sharedPoolCompiled && sharedPoolPopulated) {
                console.log(`[AssetPreloader] Compiling Shared Pool...`);

                const dummyRoot = new THREE.Group();
                _dummyScene.add(dummyRoot);

                const compiledSignatures = new Set<string>();

                for (let i = 0; i < sharedPool.length; i++) {
                    const obj = sharedPool[i];
                    let isUniquePermutation = false;

                    _traverseStack.length = 0;
                    _traverseStack.push(obj);

                    while (_traverseStack.length > 0) {
                        const current = _traverseStack.pop() as any;

                        for (let c = 0; c < current.children.length; c++) {
                            _traverseStack.push(current.children[c]);
                        }

                        if (current.isMesh && current.material) {
                            const isInstanced = !!current.isInstancedMesh;
                            const isSkinned = !!current.isSkinnedMesh;

                            let matIds = '';
                            if (Array.isArray(current.material)) {
                                for (let m = 0; m < current.material.length; m++) {
                                    matIds += current.material[m].uuid;
                                    if (m < current.material.length - 1) matIds += ',';
                                }
                            } else {
                                matIds = current.material.uuid;
                            }

                            const signature = `${matIds}_${isInstanced}_${isSkinned}_${current.castShadow}_${current.receiveShadow}`;

                            if (!compiledSignatures.has(signature)) {
                                compiledSignatures.add(signature);
                                isUniquePermutation = true;
                            }
                        }
                    }

                    if (isUniquePermutation) {
                        obj.visible = true;
                        dummyRoot.add(obj);
                    }
                }

                await safeCompileAsync(dummyRoot, "Shared Pool");

                for (let i = 0; i < dummyRoot.children.length; i++) {
                    dummyRoot.children[i].visible = false;
                }
                _dummyScene.remove(dummyRoot);
                sharedPoolCompiled = true;
            }

            // 4. COMPILE SCENE SPECIFICS & WARMUP FRAME
            if (isSector) {
                // --- FULL SECTOR POPULATION [WARMUP] ---
                // We build the full world here so all meshes are present during the final compile call
                beginInternal('sector_build');
                const sectorDef = SectorSystem.getSector(sectorId ?? 0);
                if (sectorDef) {
                    const warmupCtx = SectorBuilder.createWarmupContext(_dummyScene, sectorId ?? 0, yieldToMain);
                    await SectorBuilder.build(warmupCtx, sectorDef);
                }

                // Boss
                const bossData = BOSSES[sectorId ?? 0];
                if (bossData) {
                    _dummyScene.add(ModelFactory.createBoss('Boss', bossData));
                }

                // Zombies:
                const zombieKeys = Object.keys(ZOMBIE_TYPES);
                for (let i = 0; i < zombieKeys.length; i++) {
                    const typeKey = zombieKeys[i];
                    const zData = ZOMBIE_TYPES[typeKey];
                    const z = ModelFactory.createZombie(`warmup_zombie_${typeKey}`, zData);
                    z.position.set(0, -1000, 0);
                    _dummyScene.add(z);
                }

                // Cleanup loose lights created by SectorBuilder before compilation
                _toRemoveObjs.length = 0;
                _dummyScene.traverse(obj => {
                    if ((obj as any).isPointLight || (obj as any).isSpotLight) {
                        if (!obj.userData.isProxy && obj.name !== 'flashlight') _toRemoveObjs.push(obj);
                    }
                });
                for (let i = 0; i < _toRemoveObjs.length; i++) _toRemoveObjs[i].removeFromParent();

                endInternal('sector_build');
            }

            await safeCompileAsync(_dummyScene, "Sector Specifics");

            const originalVp = new THREE.Vector4();
            engine.renderer.getViewport(originalVp);
            engine.renderer.setViewport(0, 0, 1, 1);

            // Forced GPU Processing (Zero-GC Array implementation)
            _cullStatusObjs.length = 0;
            _cullStatusBools.length = 0;

            _dummyScene.traverse(obj => {
                if ((obj as any).isMesh || (obj as any).isSkinnedMesh) {
                    _cullStatusObjs.push(obj);
                    _cullStatusBools.push(obj.frustumCulled);
                    obj.frustumCulled = false;
                }
            });

            engine.renderer.render(_dummyScene, engine.camera.threeCamera);

            // Restore culling status (Zero-GC fast loop)
            for (let i = 0; i < _cullStatusObjs.length; i++) {
                _cullStatusObjs[i].frustumCulled = _cullStatusBools[i];
            }

            engine.renderer.setViewport(originalVp);

            // Dummy Scene Zero-GC clean-up
            for (let i = _dummyScene.children.length - 1; i >= 0; i--) {
                const child = _dummyScene.children[i];
                _dummyScene.remove(child);

                // If it's a sector warmup, we want to be more aggressive with GC hints
                // by ensuring no hidden references remain in the object hierarchy.
                if (isSector) {
                    child.traverse((obj) => {
                        (obj as any)._preloaderWarmed = true;
                    });
                }
            }

            warmedModules.add(moduleKey);
            warmedModules.add(target);

            endInternal('compilation');
            endInternal('asset_warmup_total');

            const t = warmupTimings;
            const fmt = (k: string) => t[k] !== undefined ? `${t[k].toFixed(1)}ms` : 'skipped';
            console.info(
                `[AssetPreloader] ✅ DONE [${moduleKey}] in ${(t['asset_warmup_total'] ?? 0).toFixed(0)}ms\n` +
                `  ├─ scene inject: ${fmt('scene_inject')}\n` +
                `  └─ compilation:  ${fmt('compilation')}`
            );
        };

        // --- VINTERDÖD FIX: THE RACE CONDITION QUEUE ---
        // Ställ den nya uppvärmningen i kö efter den pågående (om det finns en).
        // Detta skyddar våra globala scratchpads från att bli överskrivna.
        const previousTaskInQueue = _globalWarmupQueue;

        const myPromise = previousTaskInQueue.then(() => {
            const promise = warmupTask().finally(() => { activePromises.delete(moduleKey); });
            activePromises.set(moduleKey, promise);
            return promise;
        });

        // Uppdatera det globala låset till att peka på den nya uppgiften.
        // Vi fångar eventuella fel (.catch) så att kön inte låser sig permanent om en sektor kraschar.
        _globalWarmupQueue = myPromise.catch((err) => {
            console.error(`[AssetPreloader] Warmup failed for ${moduleKey}:`, err);
        });

        return myPromise;
    },

    _populateSharedPool: async (engine: WinterEngine, yieldToMain?: () => Promise<void>) => {

        const matSignatureSet = new Set<string>();

        const add = (obj: THREE.Object3D, createInstanced: boolean = true, forceShadow: boolean = false) => {
            // Fast signature check to prevent adding 100 versions of the same material mesh
            let hasUniqueMat = false;
            _traverseStack.length = 0;
            _traverseStack.push(obj);
            while (_traverseStack.length > 0) {
                const curr = _traverseStack.pop() as any;
                if (curr.isMesh && curr.material) {
                    const uuid = Array.isArray(curr.material) ? curr.material[0].uuid : curr.material.uuid;
                    if (!matSignatureSet.has(uuid)) {
                        matSignatureSet.add(uuid);
                        hasUniqueMat = true;
                    }
                }
                for (let c = 0; c < curr.children.length; c++) _traverseStack.push(curr.children[c]);
            }
            if (!hasUniqueMat && !createInstanced) return;

            obj.visible = false;
            obj.matrixAutoUpdate = false;
            obj.updateMatrix();

            _traverseStack.length = 0;
            _traverseStack.push(obj);

            while (_traverseStack.length > 0) {
                const current = _traverseStack.pop() as any;

                current.matrixAutoUpdate = false;
                current.updateMatrix();

                for (let c = 0; c < current.children.length; c++) {
                    _traverseStack.push(current.children[c]);
                }

                if (current.isMesh) {
                    const mesh = current as THREE.Mesh;
                    if (forceShadow) mesh.castShadow = true;

                    const mat = mesh.material as any;
                    if (forceShadow) {
                        mesh.receiveShadow = mat && !mat.isMeshBasicMaterial && !mat.isShaderMaterial;
                    }

                    if (createInstanced && !current.isInstancedMesh) {
                        const iMesh = new THREE.InstancedMesh(mesh.geometry, mesh.material, 1);
                        iMesh.visible = false;
                        iMesh.matrixAutoUpdate = false;
                        iMesh.updateMatrix();
                        iMesh.setMatrixAt(0, _dummyMatrix);
                        iMesh.castShadow = mesh.castShadow;
                        iMesh.receiveShadow = mesh.receiveShadow;
                        sharedPool.push(iMesh);
                    }
                }
            }
            sharedPool.push(obj);
        };

        // --- PRUNED SHARED POOL (CORE ONLY) ---
        // We only add the absolutely essential base geometries and materials here.
        // Everything else is warmed up via Sector skeletons.

        // Universal Sky System Materials (Shared)
        for (const skyKey in MATERIALS_SKY) {
            const mat = (MATERIALS_SKY as any)[skyKey];
            if (mat.isShaderMaterial) {
                add(new THREE.Points(GEOMETRY.box, mat), false);
            } else if (mat.isSpriteMaterial) {
                add(new THREE.Sprite(mat), false);
            } else {
                add(new THREE.Mesh(GEOMETRY.box, mat), false);
            }
        }
        add(new THREE.Mesh(GEOMETRY.celestialBody, MATERIALS_SKY.moon), false);
        add(new THREE.Mesh(GEOMETRY.celestialBody, MATERIALS_SKY.sun), false);

        add(new THREE.Mesh(GEOMETRY.box, MATERIALS.zombie), false);
        add(new THREE.Mesh(GEOMETRY.sphere, MATERIALS.zombie), false);
        add(new THREE.Mesh(GEOMETRY.barrel, MATERIALS.zombie), false);

        // Core UI/Material testers
        for (const key of ['snow', 'dirt', 'asphalt', 'stone', 'concrete', 'gravel']) {
            const mat = (MATERIALS as any)[key];
            if (mat) add(new THREE.Mesh(GEOMETRY.box, mat), false);
        }


        // Using globally pre-allocated vectors to prevent GC spikes and pre-warm high-density geometry
        const cachedGeo = WaterGeometryPool.getGeometry(10, 10, WaterShape.RECT);
        const coreWaterMat = createWaterMaterial(10, 10, _dummyRipples, _dummyObjects, WaterShape.RECT);
        add(new THREE.Mesh(cachedGeo, coreWaterMat), false);

        // Volumetric Fog material & geometry (Shared)
        const dummyFogMat = MATERIALS_FOG.getMaterial();
        add(new THREE.InstancedMesh(GEOMETRY.plane, dummyFogMat, 1), false);

        // FX
        for (let f = 0; f < ALL_FX.length; f++) {
            const fxType = ALL_FX[f];
            const fxMesh = FXSystem._getInstancedMesh(null as any, fxType);
            const dummy = new THREE.InstancedMesh(fxMesh.geometry, fxMesh.material, 1);

            dummy.matrixAutoUpdate = false;
            dummy.updateMatrix();
            dummy.setMatrixAt(0, _dummyMatrix);

            const isSolid = FX_SOLID.indexOf(fxType) !== -1;
            dummy.castShadow = isSolid;
            dummy.receiveShadow = isSolid;

            add(dummy, false);
            if (yieldToMain) await yieldToMain();
        }

        // Weather materials (instanced volumetric custom ShaderMaterials)
        const weatherTypes = [WeatherType.RAIN, WeatherType.SNOW, WeatherType.ASH, WeatherType.EMBER];
        for (let i = 0; i < weatherTypes.length; i++) {
            const mat = MATERIALS_WEATHER.getMaterial(weatherTypes[i]);
            const iMesh = new THREE.InstancedMesh(GEOMETRY.weatherParticle, mat, 1);
            iMesh.matrixAutoUpdate = false;
            iMesh.updateMatrix();
            iMesh.setMatrixAt(0, _dummyMatrix);
            iMesh.castShadow = false;
            add(iMesh, false);
        }

        // --- COMMON GAME ASSETS ---
        add(ObjectGenerator.createChest(ChestType.BIG), true, true);
        add(ObjectGenerator.createChest(ChestType.STANDARD), true, true);
        add(ObjectGenerator.createBarrel(false), true, true);
        add(ObjectGenerator.createStreetLamp(), true, true);
        add(ObjectGenerator.createFence(), true, true);

        // POI - Only Church as a representative complex building
        add(PoiGenerator.createChurch(), true, true);
        add(PoiGenerator.createCampfire(), true, true);


        // Zombies corpse
        for (let i = 0; i < DEAD_BODY_TYPES.length; i++) add(ObjectGenerator.createDeadBody(DEAD_BODY_TYPES[i]), true, true);

        // Vehicles models
        for (const v in VEHICLES) {
            const vId = Number(v) as VehicleType;
            add(vId === VehicleID.BOAT ? VehicleGenerator.createBoat() : VehicleGenerator.createVehicle(vId), true, true);
        }

        // Player & family models
        add(ModelFactory.createPlayer(), true, true);
        for (let i = 0; i < FAMILY_MEMBERS.length; i++) add(ModelFactory.createFamilyMember(FAMILY_MEMBERS[i]), true, true);

        // Collectible models
        const warmedModels: string[] = [];
        for (const key in COLLECTIBLES) {
            const mType = (COLLECTIBLES as any)[key].modelType;
            if (mType && warmedModels.indexOf(mType) === -1) {
                warmedModels.push(mType);
                add(ModelFactory.createCollectible(mType), true, true);
            }
        }

        await VegetationGenerator.initNaturePrototypes(yieldToMain);
        for (let i = 0; i < TREE_TYPES.length; i++) add(VegetationGenerator.createTree(TREE_TYPES[i], 1.0, 0), true, true);

        const outlineGeo = new THREE.EdgesGeometry(GEOMETRY.box);
        const outlineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
        add(new THREE.LineSegments(outlineGeo, outlineMat), false);

        // --- SPECIAL SHADER PERMUTATIONS (Bypass Runtime Compilation Stutter) ---
        add(new THREE.Mesh(GEOMETRY.chestGlow, MATERIALS.chestGlow), false, false);
        add(new THREE.Mesh(GEOMETRY.chestBigGlow, MATERIALS.chestBigGlow), false, false);
        add(new THREE.Mesh(GEOMETRY.shard, MATERIALS.glassShard), true, false);
        add(new THREE.Mesh(GEOMETRY.grenade, MATERIALS.grenade), false, true);
        add(new THREE.Mesh(GEOMETRY.molotov, MATERIALS.molotov), false, true);
        add(new THREE.Mesh(GEOMETRY.flashbang, MATERIALS.flashbang), false, true);
        add(new THREE.Mesh(GEOMETRY.zombieRing, MATERIALS.zombieRingMaterial), false, false);

        // --- DECAL MATERIALS WARMUP ---
        add(new THREE.Mesh(GEOMETRY.decal, MATERIALS.bloodDecal), false, false);
        add(new THREE.Mesh(GEOMETRY.decal, MATERIALS.bloodStainDecal), false, false);
        add(new THREE.Mesh(GEOMETRY.decal, MATERIALS.scorchDecal), false, false);
        add(new THREE.Mesh(GEOMETRY.decal, MATERIALS.footprintDecal), false, false);
        add(new THREE.Mesh(GEOMETRY.splatterDecal, MATERIALS.bloodDecal), false, false);
        add(new THREE.Mesh(GEOMETRY.splatterDecal, MATERIALS.bloodStainDecal), false, false);

        add(ObjectGenerator.createBuilding(10, 10, 10, 0x888888, true, true, 0.5), false, true);
        add(ObjectGenerator.createBuilding(10, 10, 10, 0x888888, false, true, 0.5), false, true);
    },

    getLastSectorIndex: () => lastSectorIndex,

    setLastSectorIndex: (idx: number) => { lastSectorIndex = idx; },

};