import * as THREE from 'three';
import { WinterEngine } from '../core/engine/WinterEngine';
import { GEOMETRY, MATERIALS, ModelFactory, createProceduralDiffuse, createProceduralTextures } from '../utils/assets';
import { TEXTURES } from '../utils/assets/AssetLoader';
import { createWaterMaterial } from '../utils/assets/materials_water';
import { FAMILY_MEMBERS, ZOMBIE_TYPES, BOSSES, WATER_SYSTEM, TREE_TYPE, LIGHT_SETTINGS, FLASHLIGHT } from '../content/constants';
import { EnemyType } from '../entities/enemies/EnemyTypes';
import { VEHICLES, VehicleType } from '../content/vehicles';
import { ObjectGenerator } from '../core/world/generators/ObjectGenerator';
import { VehicleGenerator } from '../core/world/generators/VehicleGenerator';
import { VegetationGenerator } from '../core/world/generators/VegetationGenerator';
import { CampWorld, CAMP_SCENE, stationMaterials, CONST_GEO as CAMP_GEO, CONST_MAT as CAMP_MAT } from '../components/camp/CampWorld';
import { SectorSystem } from './SectorSystem';
import { registerSoundGenerators } from '../utils/audio/SoundLib';
import { soundManager } from '../utils/audio/SoundManager';
import { SoundBank } from '../utils/audio/SoundBank';
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

// Preloadern keeps track of what lighting the pool is baked for.
let sharedPoolCompiledTarget: 'CAMP' | 'SECTOR' | null = null;

// --- PERFORMANCE SCRATCHPADS & DUMMIES (Zero-GC) ---
const _dummyMatrix = new THREE.Matrix4();
const _traverseStack: THREE.Object3D[] = [];
const _NOOP_ASYNC = async () => { };

// Static arrays to prevent GC allocations
const BUMP_MAPS = ['snow_bump', 'asphalt_bump', 'stone_bump', 'dirt_bump', 'concrete_bump', 'brick_bump', 'bark_rough_bump'];
const FX_SOLID = ['debris', 'scrap', 'glass', 'gore'];
const FX_GAS = [
    'fire', 'large_fire', 'flame', 'spark', 'smoke', 'large_smoke', 'flash', 'splash', 'impact', 'blood', 'gore_splat',
    'shockwave', 'frost_nova', 'screech_wave', 'electric_beam', 'magnetic_sparks', 'ground_impact', 'impact_splat',
    'blood_splat', 'campfire_flame', 'campfire_spark', 'campfire_smoke', 'flamethrower_fire',
    'enemy_effect_stun', 'electric_flash', 'enemy_effect_flame', 'enemy_effect_spark', 'blastRadius'
];
const ALL_FX = [...FX_SOLID, ...FX_GAS];
const DEAD_BODY_TYPES = [EnemyType.WALKER, EnemyType.RUNNER, EnemyType.TANK, EnemyType.BOMBER];
const TREE_TYPES = [TREE_TYPE.PINE, TREE_TYPE.SPRUCE, TREE_TYPE.OAK, TREE_TYPE.BIRCH, TREE_TYPE.DEAD];
const WEATHER_MATS = [MATERIALS.particle_snow, MATERIALS.particle_rain, MATERIALS.particle_ash, MATERIALS.particle_ember];

export const AssetPreloader = {

    isWarmedUp: (module: string = 'CORE') => warmedModules.has(module),

    warmupAsync: async (target: 'CORE' | 'CAMP' | 'SECTOR', yieldToMain?: () => Promise<void>, sectorId?: number) => {
        const moduleKey = target === 'SECTOR' ? `SECTOR_${sectorId ?? 0}` : target;

        if (warmedModules.has(moduleKey)) {
            return; // Already compiled
        }

        if (activePromises.has(moduleKey)) {
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

                if (soundManager) {
                    try {
                        await SoundBank.preloadAllAsync(soundManager.core, yieldToMain || _NOOP_ASYNC);
                    } catch (e) {
                        console.error("[AssetPreloader] SoundBank preloading failed:", e);
                    }

                    try {
                        const { createMusicBuffer } = await import('../utils/audio/SoundLib');
                        const music = ['ambient_wind_loop', 'ambient_forest_loop', 'ambient_scrapyard_loop', 'ambient_finale_loop', 'boss_metal', 'prologue_sad'];

                        for (let i = 0; i < music.length; i++) {
                            createMusicBuffer(soundManager.core.ctx, music[i]);
                        }
                    } catch (e) {
                        console.warn("[AssetPreloader] Music buffering deferred.");
                    }
                }

                if (yieldToMain) await yieldToMain();

                const procedural = createProceduralDiffuse();
                for (const key in procedural) {
                    engine.renderer.initTexture((procedural as any)[key]);
                }

                for (let i = 0; i < BUMP_MAPS.length; i++) {
                    const tex = (TEXTURES as any)[BUMP_MAPS[i]];
                    if (tex) engine.renderer.initTexture(tex);
                }

                const uiAssetsSet = new Set<string>(['/assets/icons/ui/icon_dash.png', '/assets/icons/ui/icon_reload.png', '/assets/icons/ui/icon_flashlight.png']);

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

            // Dummy scene to compile shaders
            const dummyScene = new THREE.Scene();

            // Populate with proxy lights - LightSystem will handle it
            const ENGINE_MAX_VISIBLE = engine.maxVisibleLights;
            const SHADOW_BUDGET = engine.maxSafeShadows;

            for (let i = 0; i < ENGINE_MAX_VISIBLE; i++) {
                const proxy = new THREE.PointLight(LIGHT_SETTINGS.DEFAULT_COLOR, 0, LIGHT_SETTINGS.DEFAULT_DISTANCE); proxy.name = `PreloadProxy_${i}`;
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

                dummyScene.add(proxy);
            }

            // Sync environment
            let envConfig = null;
            if (isCamp) {
                envConfig = CAMP_SCENE;
            } else if (isSector) {
                envConfig = SectorSystem.getSector(sectorId ?? 0).environment;
            }

            if (envConfig) {
                engine.syncEnvironment(envConfig, dummyScene);
            }

            // Preload FX materials (like _blackSmoke) now that we have a scene
            FXSystem.preload(dummyScene);

            // Camp
            if (isCamp) {
                const textures = createProceduralTextures();
                await CampWorld.build(dummyScene, textures as any, 'snow', true);

                let lampsInScene = 0;
                dummyScene.traverse((obj) => { if (obj instanceof THREE.PointLight) lampsInScene++; });
                console.log(`[AssetPreloader] CAMP: Compiling native shader for ${lampsInScene} natural light(s).`);
            }

            // Sector
            else if (isSector) {
                // Players flashlight (PointLight!)
                const dummyFlashlight = ModelFactory.createFlashlight();
                dummyFlashlight.position.set(0, 5, 0);
                dummyScene.add(dummyFlashlight);
                dummyScene.add(dummyFlashlight.target);

                // Boss
                const bossData = BOSSES[sectorId ?? 0];
                if (bossData) {
                    dummyScene.add(ModelFactory.createBoss('Boss', bossData));
                }

                // Zombies:
                const zombieKeys = Object.keys(ZOMBIE_TYPES);
                for (let i = 0; i < zombieKeys.length; i++) {
                    const typeKey = zombieKeys[i];
                    const zData = ZOMBIE_TYPES[typeKey];

                    const z = ModelFactory.createZombie(`warmup_zombie_${typeKey}`, zData);
                    z.position.set(0, -1000, 0);
                    z.traverse(child => {
                        if ((child as THREE.Mesh).isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });
                    dummyScene.add(z);
                }

                // --- LIGHTING STABILIZATION ---
                // We must ensure the preloader compiles for EXACTLY the maximum allowed lights.
                // If we have random lights from SectorGenerator, they will mess up the shader count.
                let removedLamps = 0;
                const toRemove: THREE.Object3D[] = [];
                dummyScene.traverse((obj) => {
                    if (obj instanceof THREE.PointLight || obj instanceof THREE.SpotLight) {
                        if (!obj.userData.isProxy && obj.name !== FLASHLIGHT.name) {
                            toRemove.push(obj);
                            removedLamps++;
                        }
                    }
                });
                for (let i = 0; i < toRemove.length; i++) {
                    toRemove[i].removeFromParent();
                }

                let lampsInScene = 0;
                dummyScene.traverse((obj) => {
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
            // VINTERDÖD FIX: iOS WATCHDOG BYPASS (Time-Slicer)
            // Ligger nu där den hör hemma: direkt i Preloadern.
            // =========================================================
            const safeCompileAsync = async (rootNode: THREE.Object3D, logName: string) => {
                if (!isMobile) {
                    // PC/Mac är starka nog att ta smällen synkront
                    engine.renderer.compile(dummyScene, engine.camera.threeCamera);
                    return;
                }

                console.log(`📱 [AssetPreloader] Time-slicing ${logName} to bypass iOS Watchdog...`);
                const compileTargets: THREE.Object3D[] = [];
                const visibilityMap = new Map<THREE.Object3D, boolean>();

                rootNode.traverse((obj) => {
                    visibilityMap.set(obj, obj.visible);
                    // Endast meshar som är tända för kompilering ska chunkas
                    if (((obj as any).isMesh || (obj as any).isSkinnedMesh) && obj.visible) {
                        obj.visible = false;
                        compileTargets.push(obj);
                    }
                });

                const CHUNK_SIZE = 15;
                for (let i = 0; i < compileTargets.length; i += CHUNK_SIZE) {
                    const chunk = compileTargets.slice(i, i + CHUNK_SIZE);
                    chunk.forEach(obj => obj.visible = true);
                    engine.renderer.compile(dummyScene, engine.camera.threeCamera);
                    chunk.forEach(obj => obj.visible = false);

                    // Nollställ Apple's Watchdog Timer
                    if (yieldToMain) {
                        await yieldToMain();
                    } else {
                        await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
                    }
                }

                // Återställ
                rootNode.traverse((obj) => {
                    if (visibilityMap.has(obj)) {
                        obj.visible = visibilityMap.get(obj)!;
                    }
                });
            };

            const currentTargetType = isCamp ? 'CAMP' : 'SECTOR';

            if (sharedPoolCompiledTarget !== currentTargetType && sharedPoolPopulated) {
                console.log(`[AssetPreloader] Context shift detected (${sharedPoolCompiledTarget} -> ${currentTargetType}). Recompiling Shared Pool...`);

                const dummyRoot = new THREE.Group();
                dummyScene.add(dummyRoot);

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

                // VINTERDÖD: Ersatt sync compile mot vår asynkrona räddare
                await safeCompileAsync(dummyRoot, "Shared Pool");

                for (let i = 0; i < dummyRoot.children.length; i++) {
                    dummyRoot.children[i].visible = false;
                }
                dummyScene.remove(dummyRoot);

                sharedPoolCompiledTarget = currentTargetType;
            }

            // 4. COMPILE SCENE SPECIFICS & WARMUP FRAME
            // VINTERDÖD: Även detta tvingade tidigare fram sync-compiles som dödade iOS.
            await safeCompileAsync(dummyScene, "Sector Specifics");

            const originalVp = new THREE.Vector4();
            engine.renderer.getViewport(originalVp);
            engine.renderer.setViewport(0, 0, 1, 1);

            // Eftersom vi nu kompilerat allt via safeCompileAsync, är denna render-call extremt billig!
            engine.renderer.render(dummyScene, engine.camera.threeCamera);
            engine.renderer.setViewport(originalVp);

            // Dummy Scene Zero-GC clean-up
            for (let i = dummyScene.children.length - 1; i >= 0; i--) {
                const child = dummyScene.children[i];
                dummyScene.remove(child);
            }

            warmedModules.add(moduleKey);
            warmedModules.add(target);

            endInternal('compilation');
            endInternal('asset_warmup_total');

            const t = warmupTimings;
            const fmt = (k: string) => t[k] !== undefined ? `${t[k].toFixed(1)}ms` : 'skipped';
            console.info(
                `[AssetPreloader] ✅ DONE [${moduleKey}] in ${(t['asset_warmup_total'] ?? 0).toFixed(0)}ms\n` +
                `  ├─ lighting:     ${fmt('lighting')}\n` +
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

        for (const key in stationMaterials) {
            add(new THREE.Mesh(GEOMETRY.box, (stationMaterials as any)[key]), false);
        }

        for (const key in CAMP_MAT) {
            add(new THREE.Mesh(GEOMETRY.box, (CAMP_MAT as any)[key]), false);
        }

        const outlineGeo = new THREE.EdgesGeometry(GEOMETRY.box);
        const outlineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
        add(new THREE.LineSegments(outlineGeo, outlineMat), false);

        // --- SPECIAL SHADER PERMUTATIONS (Bypass Runtime Compilation Stutter) ---
        // These ensure the GPU has compiled the EXACT shader combinations used in-game.
        // Redundant body/lid meshes removed as ObjectGenerator covers them above.

        // 1. CHEST GLOWS (Require forceShadow: false to prevent incorrect shader logic)
        add(new THREE.Mesh(GEOMETRY.chestGlow, MATERIALS.chestGlow), false, false);
        add(new THREE.Mesh(GEOMETRY.chestBigGlow, MATERIALS.chestBigGlow), false, false);

        // 2. GLASS (Shattering effects)
        add(new THREE.Mesh(GEOMETRY.shard, MATERIALS.glassShard), true, false);

        // 3. THROWABLES (Meshes visible during projectile flight)
        add(new THREE.Mesh(GEOMETRY.grenade, MATERIALS.grenade), false, true);
        add(new THREE.Mesh(GEOMETRY.molotov, MATERIALS.molotov), false, true);
        add(new THREE.Mesh(GEOMETRY.flashbang, MATERIALS.flashbang), false, true);
    },

    getLastSectorIndex: () => lastSectorIndex,

    setLastSectorIndex: (idx: number) => { lastSectorIndex = idx; },

    releaseSectorAssets: (index: number) => {
        const moduleKey = `SECTOR_${index}`;
        if (warmedModules.has(moduleKey)) warmedModules.delete(moduleKey);
    }

};