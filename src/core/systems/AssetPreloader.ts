import * as THREE from 'three';
import { WinterEngine } from '../engine/WinterEngine';
import { GEOMETRY, MATERIALS, ModelFactory, createProceduralDiffuse, createProceduralTextures } from '../../utils/assets';
import { TEXTURES } from '../../utils/assets/AssetLoader';
import { createWaterMaterial } from '../../utils/assets/materials_water';
import { FAMILY_MEMBERS, ZOMBIE_TYPES, BOSSES, PLAYER_CHARACTER, WATER_SYSTEM, TREE_TYPE, LIGHT_SYSTEM, WIND_SYSTEM, WEATHER_SYSTEM } from '../../content/constants';
import { EnemyType } from '../../types/enemy';
import { VEHICLES, VehicleType } from '../../content/vehicles';
import { ObjectGenerator } from '../world/ObjectGenerator';
import { VehicleGenerator } from '../world/VehicleGenerator';
import { EnvironmentGenerator } from '../world/EnvironmentGenerator';
import { CampWorld, CAMP_SCENE, stationMaterials, CONST_GEO as CAMP_GEO, CONST_MAT as CAMP_MAT } from '../../components/camp/CampWorld';
import { SectorSystem } from '../systems/SectorSystem';
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
let sharedPoolInitialized = false;

export const AssetPreloader = {

    warmupAsync: async (target: 'CORE' | 'CAMP' | 'SECTOR', envConfigBase: any = null, yieldToMain?: () => Promise<void>, sectorId?: number) => {
        const moduleKey = target === 'SECTOR' ? `SECTOR_${sectorId ?? 0}` : target;

        if (warmedModules.has(moduleKey)) {
            console.log(`[AssetPreloader] ✅ [${moduleKey}] already warmed — skipping`);
            return;
        }

        if (activePromises.has(moduleKey)) {
            console.log(`[AssetPreloader] ⏳ [${moduleKey}] warmup in progress — awaiting`);
            return activePromises.get(moduleKey);
        }

        const warmupLogic = async () => {
            const isCore = target === 'CORE';
            const isCamp = target === 'CAMP';
            const isSector = target === 'SECTOR';
            const engine = WinterEngine.getInstance();
            const scene = new THREE.Scene();

            // --- 1. RESOLVE CONTEXT ---
            let envConfig = envConfigBase;
            if (isSector && !envConfig) {
                const sId = sectorId ?? 0;
                const sector = SectorSystem.getSector(sId);
                if (sector) envConfig = sector.environment;
            } else if (isCamp && !envConfig) {
                envConfig = CAMP_SCENE;
            }
            if (!envConfig) envConfig = {};

            const warmupTimings: Record<string, number> = {};
            const warmupStartTimes: Record<string, number> = {};
            const beginInternal = (id: string) => { warmupStartTimes[id] = performance.now(); };
            const endInternal = (id: string) => {
                const start = warmupStartTimes[id];
                if (start) warmupTimings[id] = (warmupTimings[id] || 0) + (performance.now() - start);
            };

            beginInternal('asset_warmup_total');
            console.log(`[AssetPreloader] ▶ START warming [${moduleKey}]${isSector ? ` (Sector ${sectorId})` : ''}${sharedPoolInitialized ? ' — shared pool already ready' : ' — shared pool will be built'}`);

            // --- 2. SETUP HARDWARE LIGHTING & FOG ---
            beginInternal('lighting');
            if (envConfig) {
                const fogCol = new THREE.Color(envConfig.fogColor || envConfig.bgColor);
                scene.fog = new THREE.FogExp2(fogCol, envConfig.fogDensity || 0.01);
                scene.background = fogCol;

                if (envConfig.hemiLight) scene.add(new THREE.HemisphereLight(envConfig.hemiLight.sky, envConfig.hemiLight.ground, envConfig.hemiLight.intensity));
                else scene.add(new THREE.AmbientLight(envConfig.ambientColor || 0x404050, envConfig.ambientIntensity || 0.4));

                if (envConfig.skyLight?.visible) {
                    const sky = new THREE.DirectionalLight(envConfig.skyLight.color, envConfig.skyLight.intensity);
                    sky.position.set(50, 50, 50);
                    sky.castShadow = true;
                    scene.add(sky);
                }
            }

            // Hardware PointLight & Shadow Limits
            let engineMaxVisible = (engine as any).maxVisibleLights || LIGHT_SYSTEM.MAX_VISIBLE_LIGHTS;
            let engineMaxShadows = (engine as any).maxSafeShadows || 8;
            for (let i = 0; i < engineMaxVisible; i++) {
                const l = new THREE.PointLight(0xffaa00, 1, 10);
                if (i < engineMaxShadows) l.castShadow = true;
                scene.add(l);
            }
            endInternal('lighting');
            console.log(`[AssetPreloader]   lighting+fog: ${(warmupTimings['lighting'] ?? 0).toFixed(1)}ms (${engineMaxVisible} lights, ${engineMaxShadows} shadow casters)`);

            // --- 3. CORE ASSETS ---
            if (isCore) {
                // Sounds
                beginInternal('asset_warmup_sounds');

                registerSoundGenerators();

                if (soundManager) {
                    // Optimized Generic Sound Warmup: Preloads all registered generators
                    await SoundBank.preloadAllAsync(soundManager.core, yieldToMain || (async () => { }));

                    const { createMusicBuffer } = await import('../../utils/audio/SoundLib');
                    const music = ['ambient_wind_loop', 'ambient_forest_loop', 'ambient_scrapyard_loop', 'ambient_finale_loop', 'boss_metal', 'prologue_sad'];

                    // Await all music buffer creations in parallel (assuming they return promises)
                    await Promise.all(music.map(m => createMusicBuffer(soundManager.core.ctx, m)));
                }

                endInternal('asset_warmup_sounds');
                if (yieldToMain) await yieldToMain();

                // Textures
                beginInternal('asset_warmup_textures');

                const procedural = createProceduralDiffuse();
                Object.values(procedural).forEach(t => engine.renderer.initTexture(t));

                // Bump map initialization
                const bumpMaps = ['snow_bump', 'asphalt_bump', 'stone_bump', 'dirt_bump', 'concrete_bump', 'brick_bump', 'bark_rough_bump'];
                for (let i = 0; i < bumpMaps.length; i++) {
                    const tex = (TEXTURES as any)[bumpMaps[i]];
                    if (tex) engine.renderer.initTexture(tex);
                }

                endInternal('asset_warmup_textures');
                if (yieldToMain) await yieldToMain();

                beginInternal('asset_warmup_ui_images');
                const uiAssetsSet = new Set<string>([
                    '/assets/ui/icon_dash.png',
                    '/assets/ui/icon_reload.png',
                    '/assets/ui/icon_flashlight.png',
                ]);

                // Collect icons from main registries that use PNGs (Generic)
                Object.values(WEAPONS).forEach(w => {
                    if (w.icon && w.iconIsPng) uiAssetsSet.add(w.icon);
                });

                const allUiAssets = Array.from(uiAssetsSet);

                await Promise.all(allUiAssets.map(url => {
                    const img = new Image();
                    img.src = url;
                    return img.decode().catch(() => {
                        console.warn(`[AssetPreloader] Failed to pre-decode UI image: ${url}`);
                    });
                }));

                endInternal('asset_warmup_ui_images');
                if (yieldToMain) await yieldToMain();
            }


            // --- 4. SHARED POOL INITIALIZATION (Union of All Systems) ---
            if (!sharedPoolInitialized) {
                beginInternal('shared_init');

                const add = (obj: THREE.Object3D, createInstanced: boolean = true, forceShadow: boolean = false) => {
                    obj.visible = false;
                    obj.traverse(child => {
                        if ((child as any).isMesh) {
                            const mesh = child as THREE.Mesh;
                            if (forceShadow) mesh.castShadow = true;
                            const mat = mesh.material as any;
                            if (forceShadow) mesh.receiveShadow = mat && !mat.isMeshBasicMaterial && !mat.isShaderMaterial;

                            // Injects InstancedMesh variant for the shader pass
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

                // G1. Warmup Basic Geometry registry (filtered for non-geo keys)
                const geoKeys = Object.keys(GEOMETRY) as (keyof typeof GEOMETRY)[];
                for (let i = 0; i < geoKeys.length; i++) {
                    const geo = GEOMETRY[geoKeys[i]];
                    if (geo instanceof THREE.BufferGeometry) add(new THREE.Mesh(geo, MATERIALS.zombie), false);
                }

                // M1. Warmup Basic Materials (Shader Pass)
                Object.values(MATERIALS).forEach(mat => {
                    if (mat instanceof THREE.Material) {
                        add(new THREE.Mesh(GEOMETRY.box, mat), false);
                        if ((mat as any).map) engine.renderer.initTexture((mat as any).map);
                    }
                });

                // M2. Water Shader Complex
                const dummyRipples = new Array(WATER_SYSTEM.MAX_RIPPLES).fill(null).map(() => new THREE.Vector4(0, 0, -1000, 0));
                const dummyObjects = new Array(WATER_SYSTEM.MAX_FLOATING_OBJECTS).fill(null).map(() => new THREE.Vector4(0, 0, -1000, 0));
                const coreWaterMat = createWaterMaterial(10, 10, dummyRipples, dummyObjects, 'rect');
                add(new THREE.Mesh(GEOMETRY.plane, coreWaterMat), false);

                // FX systems & Shadow logic
                const fxSolid = ['debris', 'scrap', 'glass', 'gore'];
                const fxGas = ['fire', 'large_fire', 'flame', 'spark', 'smoke', 'large_smoke', 'flash', 'splash', 'impact', 'blood', 'gore_splat'];
                const allFX = [...fxSolid, ...fxGas];
                for (let f = 0; f < allFX.length; f++) {
                    const fxMesh = FXSystem._getInstancedMesh(null as any, allFX[f]);
                    const dummy = new THREE.InstancedMesh(fxMesh.geometry, fxMesh.material, 1);
                    dummy.setMatrixAt(0, new THREE.Matrix4());
                    dummy.castShadow = fxSolid.includes(allFX[f]);
                    dummy.receiveShadow = dummy.castShadow;
                    add(dummy, false);
                    if (yieldToMain) await yieldToMain();
                }

                // Weather and Nature
                [MATERIALS.particle_snow, MATERIALS.particle_rain, MATERIALS.particle_ash, MATERIALS.particle_ember].forEach(mat => {
                    const iMesh = new THREE.InstancedMesh(GEOMETRY.weatherParticle, mat, 1);
                    iMesh.setMatrixAt(0, new THREE.Matrix4());
                    iMesh.castShadow = false;
                    add(iMesh, false);
                });

                // Props & Structures (Full Loop)
                add(ObjectGenerator.createBarrel(false), true, true);
                add(ObjectGenerator.createStreetLamp(), true, true);
                add(ObjectGenerator.createFence(), true, true);
                add(ObjectGenerator.createContainer(), true, true);
                add(ObjectGenerator.createTerminal('ARMORY'), true, true);
                [EnemyType.WALKER, EnemyType.RUNNER, EnemyType.TANK].forEach(t => add(ObjectGenerator.createDeadBody(t), true, true));

                // Vehicles & Characters
                Object.keys(VEHICLES).forEach(v => add(v === 'boat' ? VehicleGenerator.createBoat() : VehicleGenerator.createVehicle(v as VehicleType), true, true));
                add(ModelFactory.createPlayer(), true, true);
                FAMILY_MEMBERS.forEach(fm => add(ModelFactory.createFamilyMember(fm), true, true));

                // G2. Collectibles (Shader Warmup)
                const warmedModels: string[] = [];
                const collectibles = Object.values(COLLECTIBLES);
                for (let i = 0; i < collectibles.length; i++) {
                    const mType = (collectibles[i] as any).modelType;
                    if (mType && !warmedModels.includes(mType)) {
                        warmedModels.push(mType);
                        add(ModelFactory.createCollectible(mType), true, true);
                    }
                }


                // Trees (ALL variants)
                await EnvironmentGenerator.initNaturePrototypes(yieldToMain);
                [TREE_TYPE.PINE, TREE_TYPE.SPRUCE, TREE_TYPE.OAK, TREE_TYPE.BIRCH, TREE_TYPE.DEAD].forEach(t => {
                    add(EnvironmentGenerator.createTree(t, 1.0, 0), true, true);
                });

                // Camp Stations & Outlines
                Object.values(stationMaterials).forEach(m => add(new THREE.Mesh(GEOMETRY.box, m), false));
                Object.values(CAMP_MAT).forEach(m => add(new THREE.Mesh(GEOMETRY.box, m), false));
                // Outline warmup (EdgesGeometry + LineBasicMaterial)
                const outlineGeo = new THREE.EdgesGeometry(GEOMETRY.box);
                const outlineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
                add(new THREE.LineSegments(outlineGeo, outlineMat), false);

                sharedPoolInitialized = true;
                endInternal('shared_init');
                if (yieldToMain) await yieldToMain();
            }

            // --- 5. SCENE INJECTION (Universal UNION) ---
            const dummyRoot = new THREE.Group();
            scene.add(dummyRoot);
            // We ALWAYS inject the full shared pool to ensure zero recompiles for zombies/props
            sharedPool.forEach(p => { p.visible = true; dummyRoot.add(p); });

            if (isSector) {
                const sId = sectorId ?? 0;
                const bossData = BOSSES[sId];
                if (bossData) dummyRoot.add(ModelFactory.createBoss('Boss', bossData));
                try {
                    dummyRoot.add(ObjectGenerator.createBuilding(10, 8, 10, 0xffffff, true, true, 0.2));
                } catch (e) { }
            } else if (isCamp) {
                await CampWorld.setupCampScene(scene, createProceduralTextures() as any, 'snow', true);
            }

            // --- 6. FINAL COMPILATION ---
            beginInternal('compilation');
            if ((engine.renderer as any).compileAsync) await (engine.renderer as any).compileAsync(scene, engine.camera.threeCamera);
            else engine.renderer.compile(scene, engine.camera.threeCamera);

            const originalVp = new THREE.Vector4();
            engine.renderer.getViewport(originalVp);
            engine.renderer.setViewport(0, 0, 1, 1);
            engine.renderer.render(scene, engine.camera.threeCamera);
            engine.renderer.setViewport(originalVp);
            endInternal('compilation');

            // CLEANUP
            for (let i = dummyRoot.children.length - 1; i >= 0; i--) {
                const child = dummyRoot.children[i];
                if (sharedPool.includes(child)) {
                    child.visible = false;
                    dummyRoot.remove(child);
                }
            }
            scene.clear();
            warmedModules.add(moduleKey);
            endInternal('asset_warmup_total');

            // --- FINAL REPORT ---
            const t = warmupTimings;
            const fmt = (k: string) => t[k] !== undefined ? `${t[k].toFixed(1)}ms` : 'skipped';
            console.log(
                `[AssetPreloader] ✅ DONE [${moduleKey}] in ${(t['asset_warmup_total'] ?? 0).toFixed(0)}ms\n` +
                `  ├─ lighting:     ${fmt('lighting')}\n` +
                `  ├─ core assets:  ${fmt('core_assets')}\n` +
                `  ├─ shared init:  ${fmt('shared_init')} (pool size: ${sharedPool.length} objects)\n` +
                `  ├─ scene inject: ${fmt('scene_inject')}\n` +
                `  └─ compilation:  ${fmt('compilation')}`
            );
        };

        const promise = warmupLogic().finally(() => { activePromises.delete(moduleKey); });
        activePromises.set(moduleKey, promise);
        return promise;
    },

    isWarmedUp: (module: string = 'CORE') => warmedModules.has(module),
    reset: () => { warmedModules.clear(); activePromises.clear(); lastSectorIndex = -1; sharedPoolInitialized = false; sharedPool.length = 0; },
    getLastSectorIndex: () => lastSectorIndex,
    setLastSectorIndex: (idx: number) => { lastSectorIndex = idx; },
    releaseSectorAssets: (index: number) => {
        const moduleKey = `SECTOR_${index}`;
        if (warmedModules.has(moduleKey)) warmedModules.delete(moduleKey);
    }
};