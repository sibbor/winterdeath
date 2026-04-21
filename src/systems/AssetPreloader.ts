import * as THREE from 'three';
import { WinterEngine } from '../core/engine/WinterEngine';
import { GEOMETRY, MATERIALS, ModelFactory, createProceduralDiffuse, createProceduralTextures, TREE_DEPTH_MATS } from '../utils/assets';
import { TEXTURES } from '../utils/assets/AssetLoader';
import { createWaterMaterial } from '../utils/assets/materials_water';
import { WeatherType } from '../core/engine/EngineTypes';
import { FAMILY_MEMBERS, ZOMBIE_TYPES, BOSSES, WATER_SYSTEM, LIGHT_SETTINGS, FLASHLIGHT } from '../content/constants';
import { VEGETATION_TYPE } from '../content/environment';
import { EnemyType } from '../entities/enemies/EnemyTypes';
import { VEHICLES, VehicleType } from '../content/vehicles';
import { ObjectGenerator } from '../core/world/generators/ObjectGenerator';
import { VehicleGenerator } from '../core/world/generators/VehicleGenerator';
import { VegetationGenerator } from '../core/world/generators/VegetationGenerator';
import { PoiGenerator } from '../core/world/generators/PoiGenerator';
import { CampWorld, CAMP_SCENE } from '../components/camp/CampWorld';
import { SectorSystem } from './SectorSystem';
import { registerSoundGenerators } from '../utils/audio/AudioLib';
import { audioEngine } from '../utils/audio/AudioEngine';
import { FXSystem } from './FXSystem';
import { COLLECTIBLES } from '../content/collectibles';
import { WEAPONS } from '../content/weapons';
import { checkIsMobileDevice } from '../utils/device';

const warmedModules = new Set<string>();
const activePromises = new Map<string, Promise<void>>();
let lastSectorIndex = -1;

// --- PERSISTENT SHARED MODEL POOL ---
const sharedPool: THREE.Object3D[] = [];
let sharedPoolPopulated = false;

// We no longer strictly care about sharedPoolCompiledTarget shifting if proxies are standardized
let sharedPoolCompiled = false;

// --- PERFORMANCE SCRATCHPADS & DUMMIES (Zero-GC) ---
const _dummyMatrix = new THREE.Matrix4();
const _traverseStack: THREE.Object3D[] = [];
const _NOOP_ASYNC = async () => { };

// Static arrays to prevent GC allocations
const BUMP_MAPS = ['snow_bump', 'asphalt_bump', 'stone_bump', 'dirt_bump', 'concrete_bump', 'brick_bump', 'bark_rough_bump'];
const FX_SOLID = ['debris', 'scrap', 'glass', 'gore'];
const FX_GAS = [
    'fire', 'large_fire', 'flame', 'spark', 'smoke', 'large_smoke', 'flash', 'splash', 'impact',
    'shockwave', 'frost_nova', 'screech_wave', 'electric_beam', 'magnetic_sparks', 'ground_impact', 'impact_splat',
    'campfire_flame', 'campfire_spark', 'campfire_smoke', 'flamethrower_fire',
    'enemy_effect_stun', 'electric_flash', 'enemy_effect_flame', 'enemy_effect_spark', 'blastRadius',
    'blood_splatter', 'black_smoke', 'debris_trail'
];
const ALL_FX = [...FX_SOLID, ...FX_GAS];
const DEAD_BODY_TYPES = [EnemyType.WALKER, EnemyType.RUNNER, EnemyType.TANK, EnemyType.BOMBER];
const TREE_TYPES = [VEGETATION_TYPE.PINE, VEGETATION_TYPE.SPRUCE, VEGETATION_TYPE.OAK, VEGETATION_TYPE.BIRCH, VEGETATION_TYPE.DEAD_TREE];
const WEATHER_MATS = [MATERIALS.particle_snow, MATERIALS.particle_rain, MATERIALS.particle_ash, MATERIALS.particle_ember];

// Reusable dummy scene for compilation
const _dummyScene = new THREE.Scene();

export const AssetPreloader = {

    isWarmedUp: (module: string = 'CORE') => warmedModules.has(module),

    warmupAsync: async (target: 'CORE' | 'CAMP' | 'SECTOR', yieldToMain?: () => Promise<void>, sectorId?: number) => {
        const moduleKey = target === 'SECTOR' ? `SECTOR_${sectorId ?? 0}` : target;

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
            return activePromises.get(moduleKey);
        }

        const warmupLogic = async () => {
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

                for (let i = 0; i < BUMP_MAPS.length; i++) {
                    const tex = (TEXTURES as any)[BUMP_MAPS[i]];
                    if (tex) engine.renderer.initTexture(tex);
                }

                const uiAssetsSet = new Set<string>([
                    '/assets/icons/ui/icon_dodge.png',
                    '/assets/icons/ui/icon_reload.png',
                    '/assets/icons/ui/icon_flashlight.png'
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
            const ENGINE_MAX_VISIBLE = engine.maxVisibleLights;
            const SHADOW_BUDGET = engine.maxSafeShadows;

            for (let i = 0; i < ENGINE_MAX_VISIBLE; i++) {
                const proxy = new THREE.PointLight(LIGHT_SETTINGS.DEFAULT_COLOR, 0, LIGHT_SETTINGS.DEFAULT_DISTANCE);
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
            if (isCamp) {
                envConfig = CAMP_SCENE;
            } else if (isSector) {
                envConfig = SectorSystem.getSector(sectorId ?? 0).environment;
            }

            if (envConfig) {
                engine.syncEnvironment(envConfig, _dummyScene);
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

                // Camp specials (formerly in global pool)
                _dummyScene.add(new THREE.Points(GEOMETRY.box, MATERIALS.camp_star));
                _dummyScene.add(new THREE.Sprite(MATERIALS.camp_moonHalo));

                await CampWorld.build(_dummyScene, textures as any, WeatherType.SNOW, true);

                let lampsInScene = 0;
                _dummyScene.traverse((obj) => { if (obj instanceof THREE.PointLight) lampsInScene++; });
                console.log(`[AssetPreloader] CAMP: Compiling native shader for ${lampsInScene} natural light(s).`);
            }

            // Sector
            else if (isSector) {
                // Players flashlight (PointLight!)
                const dummyFlashlight = ModelFactory.createFlashlight();
                dummyFlashlight.position.set(0, 5, 0);
                _dummyScene.add(dummyFlashlight);
                _dummyScene.add(dummyFlashlight.target);

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

                    _traverseStack.length = 0;
                    _traverseStack.push(z);
                    while (_traverseStack.length > 0) {
                        const child = _traverseStack.pop() as THREE.Object3D;
                        if ((child as THREE.Mesh).isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                        for (let c = 0; c < child.children.length; c++) {
                            _traverseStack.push(child.children[c]);
                        }
                    }
                    _dummyScene.add(z);
                }

                // --- LIGHTING STABILIZATION ---
                let removedLamps = 0;
                const toRemove: THREE.Object3D[] = [];

                _traverseStack.length = 0;
                _traverseStack.push(_dummyScene);

                while (_traverseStack.length > 0) {
                    const obj = _traverseStack.pop() as THREE.Object3D;
                    if ((obj as any).isPointLight || (obj as any).isSpotLight) {
                        if (!obj.userData.isProxy && obj.name !== FLASHLIGHT.name) {
                            toRemove.push(obj);
                            removedLamps++;
                        }
                    }
                    for (let i = 0; i < obj.children.length; i++) _traverseStack.push(obj.children[i]);
                }

                for (let i = 0; i < toRemove.length; i++) {
                    toRemove[i].removeFromParent();
                }

                let lampsInScene = 0;
                _dummyScene.traverse((obj) => {
                    if (obj instanceof THREE.PointLight) {
                        lampsInScene++;
                    }
                });
                console.log(`[AssetPreloader] SECTOR: Compiling strict shader for ${lampsInScene} proxied light(s). Removed ${removedLamps} loose lights.`);
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
                if (!isMobile) {
                    engine.renderer.compile(_dummyScene, engine.camera.threeCamera);
                    return;
                }

                console.log(`📱 [AssetPreloader] Time-slicing ${logName} to bypass iOS Watchdog...`);
                const compileTargets: THREE.Object3D[] = [];
                const visibilityMap = new Map<THREE.Object3D, boolean>();

                _traverseStack.length = 0;
                _traverseStack.push(rootNode);

                while (_traverseStack.length > 0) {
                    const obj = _traverseStack.pop() as THREE.Object3D;
                    visibilityMap.set(obj, obj.visible);
                    if (((obj as any).isMesh || (obj as any).isSkinnedMesh) && obj.visible) {
                        obj.visible = false;
                        compileTargets.push(obj);
                    }
                    for (let i = 0; i < obj.children.length; i++) _traverseStack.push(obj.children[i]);
                }

                const CHUNK_SIZE = 15;
                for (let i = 0; i < compileTargets.length; i += CHUNK_SIZE) {
                    const chunkEnd = Math.min(i + CHUNK_SIZE, compileTargets.length);
                    for (let c = i; c < chunkEnd; c++) compileTargets[c].visible = true;

                    engine.renderer.compile(_dummyScene, engine.camera.threeCamera);

                    for (let c = i; c < chunkEnd; c++) compileTargets[c].visible = false;

                    if (yieldToMain) {
                        await yieldToMain();
                    } else {
                        await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
                    }
                }

                for (let i = 0; i < compileTargets.length; i++) {
                    const obj = compileTargets[i];
                    if (visibilityMap.has(obj)) obj.visible = visibilityMap.get(obj)!;
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
            await safeCompileAsync(_dummyScene, "Sector Specifics");

            const originalVp = new THREE.Vector4();
            engine.renderer.getViewport(originalVp);
            engine.renderer.setViewport(0, 0, 1, 1);

            engine.renderer.render(_dummyScene, engine.camera.threeCamera);
            engine.renderer.setViewport(originalVp);

            // Dummy Scene Zero-GC clean-up
            for (let i = _dummyScene.children.length - 1; i >= 0; i--) {
                const child = _dummyScene.children[i];
                _dummyScene.remove(child);
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

        const promise = warmupLogic().finally(() => { activePromises.delete(moduleKey); });
        activePromises.set(moduleKey, promise);
        return promise;
    },

    _populateSharedPool: async (engine: WinterEngine, yieldToMain?: () => Promise<void>) => {

        const add = (obj: THREE.Object3D, createInstanced: boolean = true, forceShadow: boolean = false) => {
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

        for (const key in GEOMETRY) {
            const geo = (GEOMETRY as any)[key];
            if (geo instanceof THREE.BufferGeometry) add(new THREE.Mesh(geo, MATERIALS.zombie), false);
        }

        for (const key in MATERIALS) {
            if (key.startsWith('camp_')) continue;
            const mat = (MATERIALS as any)[key];
            if (mat instanceof THREE.Material) {
                add(new THREE.Mesh(GEOMETRY.box, mat), false);
                if ((mat as any).map) engine.renderer.initTexture((mat as any).map);
            }
        }

        const dummyRipples: THREE.Vector4[] = [];
        for (let i = 0; i < WATER_SYSTEM.MAX_RIPPLES; i++) dummyRipples.push(new THREE.Vector4(0, 0, -1000, 0));

        const dummyObjects: THREE.Vector4[] = [];
        for (let i = 0; i < WATER_SYSTEM.MAX_FLOATING_OBJECTS; i++) dummyObjects.push(new THREE.Vector4(0, 0, -1000, 0));

        const coreWaterMat = createWaterMaterial(10, 10, dummyRipples, dummyObjects, 'rect');
        add(new THREE.Mesh(GEOMETRY.plane, coreWaterMat), false);

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

        // Weather materials (instanced)
        for (let i = 0; i < WEATHER_MATS.length; i++) {
            const iMesh = new THREE.InstancedMesh(GEOMETRY.weatherParticle, WEATHER_MATS[i], 1);
            iMesh.matrixAutoUpdate = false;
            iMesh.updateMatrix();
            iMesh.setMatrixAt(0, _dummyMatrix);
            iMesh.castShadow = false;
            add(iMesh, false);
        }

        add(ObjectGenerator.createChest('standard'), true, true);
        add(ObjectGenerator.createChest('big'), true, true);
        add(ObjectGenerator.createBarrel(false), true, true);
        add(ObjectGenerator.createStreetLamp(), true, true);
        add(ObjectGenerator.createFence(), true, true);
        add(ObjectGenerator.createContainer(), true, true);
        add(ObjectGenerator.createTerminal('ARMORY'), true, true);
        add(ObjectGenerator.createLocomotive(), false, true);
        add(ObjectGenerator.createStandardTunnel(), false, true);

        // POIs
        add(PoiGenerator.createChurch(), true, true);
        add(PoiGenerator.createCafe(), true, true);
        add(PoiGenerator.createGroceryStore(), true, true);
        add(PoiGenerator.createGym(), true, true);
        add(PoiGenerator.createPizzeria(), true, true);
        add(PoiGenerator.createDealership(), true, true);
        add(PoiGenerator.createMast(), true, true);
        add(PoiGenerator.createSmu(), true, true);
        add(PoiGenerator.createFarm(), true, true);
        add(PoiGenerator.createEggFarm(), true, true);
        add(PoiGenerator.createBarn(), true, true);
        add(PoiGenerator.createTrainTunnel([]), false, true);
        add(PoiGenerator.createCampfire(), true, true);

        // Zombies corpse
        for (let i = 0; i < DEAD_BODY_TYPES.length; i++) add(ObjectGenerator.createDeadBody(DEAD_BODY_TYPES[i]), true, true);

        // Vehicles models
        for (const v in VEHICLES) {
            add(v === 'boat' ? VehicleGenerator.createBoat() : VehicleGenerator.createVehicle(v as VehicleType), true, true);
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

        add(ObjectGenerator.createBuilding(10, 10, 10, 0x888888, true, true, 0.5), false, true);
        add(ObjectGenerator.createBuilding(10, 10, 10, 0x888888, false, true, 0.5), false, true);
    },

    getLastSectorIndex: () => lastSectorIndex,

    setLastSectorIndex: (idx: number) => { lastSectorIndex = idx; },

    releaseSectorAssets: (index: number) => {
        // We DO NOT delete the sector from cache here anymore!
        // By keeping it, we allow the sector to survive in memory when returning to Camp.
        // It will be evicted automatically in warmupAsync if a completely new sector is loaded.
    }

};