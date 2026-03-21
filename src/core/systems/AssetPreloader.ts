import * as THREE from 'three';
import { WinterEngine } from '../engine/WinterEngine';
import { GEOMETRY, MATERIALS, ModelFactory, createProceduralDiffuse, createProceduralTextures } from '../../utils/assets';
import { TEXTURES } from '../../utils/assets/AssetLoader';
import { createWaterMaterial } from '../../utils/assets/materials_water';
import { FAMILY_MEMBERS, ZOMBIE_TYPES, BOSSES, WATER_SYSTEM, TREE_TYPE, WEATHER_SYSTEM, LIGHT_SYSTEM } from '../../content/constants';
import { EnemyType } from '../../types/enemy';
import { VEHICLES, VehicleType } from '../../content/vehicles';
import { ObjectGenerator } from '../world/ObjectGenerator';
import { VehicleGenerator } from '../world/VehicleGenerator';
import { EnvironmentGenerator } from '../world/EnvironmentGenerator';
import { CampWorld, CAMP_SCENE, stationMaterials, CONST_GEO as CAMP_GEO, CONST_MAT as CAMP_MAT } from '../../components/camp/CampWorld';
import { SectorSystem } from '../systems/SectorSystem';
import { SectorGenerator } from '../world/SectorGenerator';
import { registerSoundGenerators } from '../../utils/audio/SoundLib';
import { soundManager } from '../../utils/SoundManager';
import { SoundBank } from '../../utils/audio/SoundBank';
import { FXSystem } from '../systems/FXSystem';
import { COLLECTIBLES } from '../../content/collectibles';
import { WEAPONS } from '../../content/weapons';

const warmedModules = new Set<string>();
const activePromises = new Map<string, Promise<void>>();
let lastSectorIndex = -1;

// --- PERSISTENT SHARED MODEL POOL ---
const sharedPool: THREE.Object3D[] = [];
let sharedPoolPopulated = false; // Tracks if JS memory is built
let sharedPoolCompiled = false;  // Tracks if WebGL shaders are built

// Static arrays to prevent GC allocations
const BUMP_MAPS = ['snow_bump', 'asphalt_bump', 'stone_bump', 'dirt_bump', 'concrete_bump', 'brick_bump', 'bark_rough_bump'];
const FX_SOLID = ['debris', 'scrap', 'glass', 'gore'];
const FX_GAS = ['fire', 'large_fire', 'flame', 'spark', 'smoke', 'large_smoke', 'flash', 'splash', 'impact', 'blood', 'gore_splat'];
const ALL_FX = [...FX_SOLID, ...FX_GAS];
const DEAD_BODY_TYPES = [EnemyType.WALKER, EnemyType.RUNNER, EnemyType.TANK];
const TREE_TYPES = [TREE_TYPE.PINE, TREE_TYPE.SPRUCE, TREE_TYPE.OAK, TREE_TYPE.BIRCH, TREE_TYPE.DEAD];
const WEATHER_MATS = [MATERIALS.particle_snow, MATERIALS.particle_rain, MATERIALS.particle_ash, MATERIALS.particle_ember];

export const AssetPreloader = {

    warmupAsync: async (target: 'CORE' | 'CAMP' | 'SECTOR', envConfigBase: any = null, yieldToMain?: () => Promise<void>, sectorId?: number) => {
        const moduleKey = target === 'SECTOR' ? `SECTOR_${sectorId ?? 0}` : target;

        if (warmedModules.has(moduleKey)) {
            return; // Already compiled — multiple callers are expected and fine
        }

        if (activePromises.has(moduleKey)) {
            return activePromises.get(moduleKey); // Warmup in progress, attach to existing promise
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
            console.log(`[AssetPreloader] ▶ START warming [${moduleKey}]`);

            // =========================================================
            // PHASE 1: CORE DATA FETCHING (No WebGL Compilation)
            // =========================================================
            if (isCore) {
                beginInternal('core_assets');
                registerSoundGenerators();

                if (soundManager) {
                    await SoundBank.preloadAllAsync(soundManager.core, yieldToMain || (async () => { }));
                    const { createMusicBuffer } = await import('../../utils/audio/SoundLib');
                    const music = ['ambient_wind_loop', 'ambient_forest_loop', 'ambient_scrapyard_loop', 'ambient_finale_loop', 'boss_metal', 'prologue_sad'];

                    // createMusicBuffer returns an AudioBuffer synchronously.
                    // We execute them in a flat loop and avoid allocating any promise arrays.
                    for (let i = 0; i < music.length; i++) {
                        createMusicBuffer(soundManager.core.ctx, music[i]);
                    }
                }
                if (yieldToMain) await yieldToMain();

                const procedural = createProceduralDiffuse();
                const proceduralValues = Object.values(procedural);
                for (let i = 0; i < proceduralValues.length; i++) engine.renderer.initTexture(proceduralValues[i]);

                for (let i = 0; i < BUMP_MAPS.length; i++) {
                    const tex = (TEXTURES as any)[BUMP_MAPS[i]];
                    if (tex) engine.renderer.initTexture(tex);
                }

                const uiAssetsSet = new Set<string>(['/assets/ui/icon_dash.png', '/assets/ui/icon_reload.png', '/assets/ui/icon_flashlight.png']);
                const weaponsArray = Object.values(WEAPONS);
                for (let i = 0; i < weaponsArray.length; i++) {
                    if (weaponsArray[i].icon && weaponsArray[i].iconIsPng) uiAssetsSet.add(weaponsArray[i].icon);
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

                // Populate the Shared Pool in memory (JS side), but do NOT compile it yet.
                if (!sharedPoolPopulated) {
                    beginInternal('shared_init');
                    await AssetPreloader._populateSharedPool(engine, yieldToMain);
                    sharedPoolPopulated = true;
                    endInternal('shared_init');
                }

                warmedModules.add(moduleKey);
                endInternal('asset_warmup_total');
                console.log(`[AssetPreloader] ✅ DONE [CORE] Data fetched in ${(warmupTimings['asset_warmup_total'] ?? 0).toFixed(0)}ms. WebGL compilation deferred to first scene load.`);
                return;
            }

            // =========================================================
            // PHASE 2: SCENE COMPILATION (CAMP or SECTOR)
            // =========================================================
            const scene = new THREE.Scene();

            let envConfig = envConfigBase;
            if (isCamp && !envConfig) {
                envConfig = CAMP_SCENE;
            } else if (isSector && !envConfig) {
                const sectorIndex = sectorId ?? 0;
                const sector = SectorSystem.getSector(sectorIndex);
                if (sector) envConfig = sector.environment;
            }

            // 1. BASE ENVIRONMENT
            beginInternal('lighting');
            if (envConfig) {
                const fogCol = new THREE.Color(envConfig.fogColor || envConfig.bgColor);
                scene.fog = new THREE.FogExp2(fogCol, envConfig.fogDensity || 0.01);
                scene.background = fogCol;

                if (envConfig.hemiLight) {
                    scene.add(new THREE.HemisphereLight(envConfig.hemiLight.sky, envConfig.hemiLight.ground, envConfig.hemiLight.intensity));
                } else {
                    scene.add(new THREE.AmbientLight(envConfig.ambientColor || 0x404050, envConfig.ambientIntensity || 0.4));
                }

                if (envConfig.skyLight?.visible) {
                    const sky = new THREE.DirectionalLight(envConfig.skyLight.color, envConfig.skyLight.intensity);
                    sky.position.set(50, 50, 50);
                    sky.castShadow = true;
                    scene.add(sky);
                }

            }
            endInternal('lighting');

            // 2. INJECT TARGET SCENE (This adds the exact lights the game will use)
            beginInternal('scene_inject');
            const sceneRoot = new THREE.Group();
            scene.add(sceneRoot);

            if (isCamp) {
                await CampWorld.build(scene, TEXTURES as any, 'snow', true);
            } else if (isSector) {
                const sectorIndex = sectorId ?? 0;
                const sectorDef = SectorSystem.getSector(sectorIndex);

                if (sectorDef) {
                    // Ghost-render: build the full sector geometry into a throwaway scene.
                    // setupContent and setupZombies are no-ops via ctx.isWarmup guards in each sector file.
                    // Pass yieldToMain so the build pipeline yields to the browser (loading screen stays responsive).
                    // engine.renderer.compile() at the end of this warmup will catch every shader permutation.
                    const warmupCtx = SectorGenerator.createWarmupContext(scene, sectorIndex, yieldToMain);
                    await SectorGenerator.build(warmupCtx, sectorDef);
                }

                // Inject dummy PointLights matching exactly the runtime LightSystem budget
                // to force compilation of all PointLight and MeshDistanceMaterial variants.
                const maxVisibleLights = (engine as any).maxVisibleLights || LIGHT_SYSTEM.MAX_VISIBLE_LIGHTS || 6;
                const maxShadows = (engine as any).maxSafeShadows ?? LIGHT_SYSTEM.MAX_SHADOW_CASTING_LIGHTS ?? 2;
                
                for (let i = 0; i < maxVisibleLights; i++) {
                    const pl = new THREE.PointLight(0xffaaaa, 1, 50);
                    pl.position.set(i * 10, 10, i * 10); // Spread them out
                    pl.castShadow = i < maxShadows;
                    if (pl.castShadow) {
                        pl.shadow.mapSize.set(256, 256);
                        pl.shadow.bias = -0.005;
                    }
                    sceneRoot.add(pl);
                }

                // Inject dummy Flashlight (SpotLight) to force compilation of MeshDepthMaterial 
                // and `#define SPOT_LIGHT_SHADOWS` permutations.
                const dummyFlashlight = ModelFactory.createFlashlight();
                dummyFlashlight.position.set(0, 5, 0);
                sceneRoot.add(dummyFlashlight);
                sceneRoot.add(dummyFlashlight.target);

                // Boss model
                const bossData = BOSSES[sectorIndex];
                if (bossData) sceneRoot.add(ModelFactory.createBoss('Boss', bossData));
            }
            endInternal('scene_inject');

            // 3. SMART COMPILE SHARED POOL (Inside the perfectly lit scene)
            beginInternal('compilation');
            if (!sharedPoolCompiled && sharedPoolPopulated) {
                const dummyRoot = new THREE.Group();
                scene.add(dummyRoot);

                const compiledSignatures = new Set<string>();

                for (let i = 0; i < sharedPool.length; i++) {
                    const obj = sharedPool[i];
                    let isUniquePermutation = false;

                    obj.traverse((child: any) => {
                        if (child.isMesh && child.material) {
                            const isInstanced = !!child.isInstancedMesh;
                            const isSkinned = !!child.isSkinnedMesh;
                            const matIds = Array.isArray(child.material)
                                ? child.material.map((m: any) => m.uuid).join(',')
                                : child.material.uuid;

                            const signature = `${matIds}_${isInstanced}_${isSkinned}_${child.castShadow}_${child.receiveShadow}`;

                            if (!compiledSignatures.has(signature)) {
                                compiledSignatures.add(signature);
                                isUniquePermutation = true;
                            }
                        }
                    });

                    if (isUniquePermutation) {
                        obj.visible = true;
                        dummyRoot.add(obj);
                    }
                }

                // Compile! Nu har scenen exakt rätt antal ljus för det vi faktiskt laddar.
                engine.renderer.compile(scene, engine.camera.threeCamera);

                for (let i = 0; i < dummyRoot.children.length; i++) {
                    dummyRoot.children[i].visible = false;
                }
                scene.remove(dummyRoot);
                sharedPoolCompiled = true;
            }

            // 4. COMPILE SCENE SPECIFICS & WARMUP FRAME
            engine.renderer.compile(scene, engine.camera.threeCamera);

            const originalVp = new THREE.Vector4();
            engine.renderer.getViewport(originalVp);
            engine.renderer.setViewport(0, 0, 1, 1);
            engine.renderer.render(scene, engine.camera.threeCamera);
            engine.renderer.setViewport(originalVp);

            // Cleanup
            scene.clear();

            warmedModules.add(moduleKey);
            endInternal('compilation');
            endInternal('asset_warmup_total');

            const t = warmupTimings;
            const fmt = (k: string) => t[k] !== undefined ? `${t[k].toFixed(1)}ms` : 'skipped';
            console.log(
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

    /**
     * Builds the persistent JS memory structures for the shared pool.
     * Separated to ensure Zero-GC and clean architecture.
     */
    _populateSharedPool: async (engine: WinterEngine, yieldToMain?: () => Promise<void>) => {
        const add = (obj: THREE.Object3D, createInstanced: boolean = true, forceShadow: boolean = false) => {
            obj.visible = false;
            obj.traverse(child => {
                if ((child as any).isMesh) {
                    const mesh = child as THREE.Mesh;
                    if (forceShadow) mesh.castShadow = true;

                    const mat = mesh.material as any;
                    if (forceShadow) {
                        mesh.receiveShadow = mat && !mat.isMeshBasicMaterial && !mat.isShaderMaterial;
                    }

                    if (createInstanced && !(child as any).isInstancedMesh) {
                        const iMesh = new THREE.InstancedMesh(mesh.geometry, mesh.material, 1);
                        iMesh.visible = false;
                        iMesh.setMatrixAt(0, new THREE.Matrix4());
                        iMesh.castShadow = mesh.castShadow;
                        iMesh.receiveShadow = mesh.receiveShadow;
                        sharedPool.push(iMesh);
                    }
                }
            });
            sharedPool.push(obj);
        };

        const geoKeys = Object.keys(GEOMETRY) as (keyof typeof GEOMETRY)[];
        for (let i = 0; i < geoKeys.length; i++) {
            const geo = GEOMETRY[geoKeys[i]];
            if (geo instanceof THREE.BufferGeometry) add(new THREE.Mesh(geo, MATERIALS.zombie), false);
        }

        const matValues = Object.values(MATERIALS);
        for (let i = 0; i < matValues.length; i++) {
            const mat = matValues[i];
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

        for (let f = 0; f < ALL_FX.length; f++) {
            const fxType = ALL_FX[f];
            const fxMesh = FXSystem._getInstancedMesh(null as any, fxType);
            const dummy = new THREE.InstancedMesh(fxMesh.geometry, fxMesh.material, 1);
            dummy.setMatrixAt(0, new THREE.Matrix4());

            const isSolid = FX_SOLID.indexOf(fxType) !== -1;
            dummy.castShadow = isSolid;
            dummy.receiveShadow = isSolid;

            add(dummy, false);
            if (yieldToMain) await yieldToMain();
        }

        for (let i = 0; i < WEATHER_MATS.length; i++) {
            const iMesh = new THREE.InstancedMesh(GEOMETRY.weatherParticle, WEATHER_MATS[i], 1);
            iMesh.setMatrixAt(0, new THREE.Matrix4());
            iMesh.castShadow = false;
            add(iMesh, false);
        }

        add(ObjectGenerator.createBarrel(false), true, true);
        add(ObjectGenerator.createStreetLamp(), true, true);
        add(ObjectGenerator.createFence(), true, true);
        add(ObjectGenerator.createContainer(), true, true);
        add(ObjectGenerator.createTerminal('ARMORY'), true, true);

        for (let i = 0; i < DEAD_BODY_TYPES.length; i++) add(ObjectGenerator.createDeadBody(DEAD_BODY_TYPES[i]), true, true);

        const vehicleKeys = Object.keys(VEHICLES);
        for (let i = 0; i < vehicleKeys.length; i++) {
            const v = vehicleKeys[i];
            add(v === 'boat' ? VehicleGenerator.createBoat() : VehicleGenerator.createVehicle(v as VehicleType), true, true);
        }

        add(ModelFactory.createPlayer(), true, true);
        for (let i = 0; i < FAMILY_MEMBERS.length; i++) add(ModelFactory.createFamilyMember(FAMILY_MEMBERS[i]), true, true);

        const warmedModels: string[] = [];
        const collectibles = Object.values(COLLECTIBLES);
        for (let i = 0; i < collectibles.length; i++) {
            const mType = (collectibles[i] as any).modelType;
            if (mType && warmedModels.indexOf(mType) === -1) {
                warmedModels.push(mType);
                add(ModelFactory.createCollectible(mType), true, true);
            }
        }

        await EnvironmentGenerator.initNaturePrototypes(yieldToMain);
        for (let i = 0; i < TREE_TYPES.length; i++) add(EnvironmentGenerator.createTree(TREE_TYPES[i], 1.0, 0), true, true);

        const stationMatValues = Object.values(stationMaterials);
        for (let i = 0; i < stationMatValues.length; i++) add(new THREE.Mesh(GEOMETRY.box, stationMatValues[i]), false);

        const campMatValues = Object.values(CAMP_MAT);
        for (let i = 0; i < campMatValues.length; i++) add(new THREE.Mesh(GEOMETRY.box, campMatValues[i]), false);

        const outlineGeo = new THREE.EdgesGeometry(GEOMETRY.box);
        const outlineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
        add(new THREE.LineSegments(outlineGeo, outlineMat), false);
    },

    isWarmedUp: (module: string = 'CORE') => warmedModules.has(module),

    reset: () => {
        warmedModules.clear();
        activePromises.clear();
        lastSectorIndex = -1;
        sharedPoolPopulated = false;
        sharedPoolCompiled = false;
        sharedPool.length = 0;
    },

    /**
     * Resets only the compilation state, keeping the shared pool intact.
     * This allows the engine to recompile shaders without rebuilding the entire asset pool.
     * e.g. when graphics settings are changed.
     */
    resetCompilationOnly: () => {
        warmedModules.clear();
        activePromises.clear();
        sharedPoolCompiled = false;
    },

    getLastSectorIndex: () => lastSectorIndex,
    setLastSectorIndex: (idx: number) => { lastSectorIndex = idx; },

    releaseSectorAssets: (index: number) => {
        const moduleKey = `SECTOR_${index}`;
        if (warmedModules.has(moduleKey)) warmedModules.delete(moduleKey);
    }
};