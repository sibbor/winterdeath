import * as THREE from 'three';
import { WinterEngine } from '../engine/WinterEngine';
import { GEOMETRY, MATERIALS, ModelFactory, createProceduralDiffuse, createProceduralTextures } from '../../utils/assets';
import { TEXTURES } from '../../utils/assets/AssetLoader';
import { createWaterMaterial } from '../../utils/assets/materials_water';
import { FAMILY_MEMBERS, ZOMBIE_TYPES, BOSSES, PLAYER_CHARACTER, WATER_SYSTEM } from '../../content/constants';
import { TREE_TYPE, LIGHT_SYSTEM } from '../../content/constants';
import { VEHICLES, VehicleType } from '../../content/vehicles';
import { ObjectGenerator } from '../world/ObjectGenerator';
import { VehicleGenerator } from '../world/VehicleGenerator';
import { EnvironmentGenerator } from '../world/EnvironmentGenerator';
import { CampWorld, CAMP_SCENE, stationMaterials, CONST_GEO as CAMP_GEO, CONST_MAT as CAMP_MAT } from '../../components/camp/CampWorld';
import { SectorSystem } from '../systems/SectorSystem';
import { registerSoundGenerators } from '../../utils/audio/SoundLib';
import { SoundBank } from '../../utils/audio/SoundBank';
import { FXSystem } from '../systems/FXSystem';
import { COLLECTIBLES } from '../../content/collectibles';

const warmedModules = new Set<string>();
const activePromises = new Map<string, Promise<void>>();
let lastSectorIndex = -1;

export const TRANSPARENT_UI_ICONS: Record<string, string> = {};

export const AssetPreloader = {

    warmupAsync: async (target: 'CORE' | 'CAMP' | 'SECTOR', envConfigBase: any = null, yieldToMain?: () => Promise<void>, sectorId?: number) => {
        const moduleKey = target === 'SECTOR' ? `SECTOR_${sectorId ?? 0}` : target;
        if (warmedModules.has(moduleKey)) return;
        if (activePromises.has(moduleKey)) return activePromises.get(moduleKey);

        const warmupLogic = async () => {
            const isCore = target === 'CORE';
            const isCamp = target === 'CAMP';
            const isSector = target === 'SECTOR';

            // Engine and Scene
            const engine = WinterEngine.getInstance();
            const scene = new THREE.Scene();

            // Environmental config
            let envConfig = envConfigBase;
            if (isSector && !envConfig) {
                const sId = sectorId ?? 0;
                const sector = SectorSystem.getSector(sId);
                if (sector) envConfig = sector.environment;
            } else if (isCamp && !envConfig) {
                envConfig = CAMP_SCENE;
            }
            if (!envConfig) envConfig = {};

            // Warmup timings
            const warmupTimings: Record<string, number> = {};
            const warmupStartTimes: Record<string, number> = {};

            const beginInternal = (id: string) => { warmupStartTimes[id] = performance.now(); };
            const endInternal = (id: string) => {
                const start = warmupStartTimes[id];
                if (start) warmupTimings[id] = (warmupTimings[id] || 0) + (performance.now() - start);
            };

            beginInternal('AssetPreloader -> Total');

            // --- 1. SETUP LIGHTING & ENVIRONMENT FIRST ---
            // Three.js compiles shaders based on the active lights in the scene.
            // Lighting MUST be setup before we add materials and geometries.
            beginInternal('AssetPreloader: Environment Setup');
            if (envConfig) {
                const fogCol = new THREE.Color(envConfig.fogColor || envConfig.bgColor);
                scene.fog = new THREE.FogExp2(fogCol, envConfig.fogDensity);
                scene.background = fogCol;

                if (envConfig.hemiLight) {
                    const hemi = new THREE.HemisphereLight(
                        envConfig.hemiLight.sky,
                        envConfig.hemiLight.ground,
                        envConfig.hemiLight.intensity
                    );
                    scene.add(hemi);
                } else {
                    const ambientLight = new THREE.AmbientLight(
                        envConfig.ambientColor || 0x404050,
                        envConfig.ambientIntensity || 0.4
                    );
                    ambientLight.name = LIGHT_SYSTEM.AMBIENT_LIGHT;
                    scene.add(ambientLight);
                }

                const skyLightRef = envConfig.skyLight;
                if (skyLightRef && skyLightRef.visible) {
                    const lightPos = skyLightRef.position || { x: 80, y: 50, z: 50 };
                    const skyLight = new THREE.DirectionalLight(skyLightRef.color, skyLightRef.intensity);
                    skyLight.name = LIGHT_SYSTEM.SKY_LIGHT;
                    skyLight.position.set(lightPos.x, lightPos.y, lightPos.z);
                    skyLight.castShadow = true;
                    // Shadow bounds
                    skyLight.shadow.camera.left = -100;
                    skyLight.shadow.camera.right = 100;
                    skyLight.shadow.camera.top = 100;
                    skyLight.shadow.camera.bottom = -100;
                    skyLight.shadow.camera.far = 300;
                    skyLight.shadow.bias = -0.0005;
                    scene.add(skyLight);
                }
            }

            if (isCore) {
                // Get the limits from WinterEngine
                let engineMaxVisible = (engine as any).maxVisibleLights;
                let engineMaxShadows = (engine as any).maxSafeShadows;

                // If WinterEngine hasn't set the limits yet (e.g. during hot-reload in React), calculate it directly:
                if (engineMaxShadows === undefined || engineMaxVisible === undefined) {
                    const maxTex = engine.renderer.capabilities.maxTextures;
                    engineMaxShadows = Math.min(LIGHT_SYSTEM.MAX_SHADOW_CASTING_LIGHTS, Math.max(0, maxTex - 12));
                    engineMaxVisible = LIGHT_SYSTEM.MAX_VISIBLE_LIGHTS;
                }

                // Sync with dynamic Hardware Limits
                for (let i = 0; i < engineMaxVisible; i++) {
                    const dummyLight = new THREE.PointLight(0xffaa00, 1, 10);
                    if (i < engineMaxShadows) {
                        dummyLight.castShadow = true;
                    }
                    scene.add(dummyLight);
                }
            }
            endInternal('AssetPreloader: Environment Setup');

            const dummyRoot = new THREE.Group();
            scene.add(dummyRoot);

            // GC Tracking Arrays
            const ownedGeometries: THREE.BufferGeometry[] = [];
            const ownedMaterials: THREE.Material[] = [];
            const ownedObjects: THREE.Object3D[] = []; // Track created meshes/instanced meshes to avoid GC leaks

            const addToWarmup = (obj: THREE.Object3D, instancing: boolean = true, forceShadow: boolean = true) => {
                obj.visible = false;
                obj.traverse((child) => {
                    if ((child as any).isLight) {
                        (child as THREE.Light).castShadow = false;
                    }
                    if ((child as any).isMesh) {
                        const mesh = child as THREE.Mesh;
                        if (forceShadow) mesh.castShadow = true;

                        const mat = mesh.material as any;
                        if (forceShadow) mesh.receiveShadow = mat && !mat.isMeshBasicMaterial && !mat.isShaderMaterial;

                        if (instancing && !(mesh as any).isInstancedMesh) {
                            const iMesh = new THREE.InstancedMesh(mesh.geometry, mesh.material, 1);
                            if (forceShadow) {
                                iMesh.castShadow = true;
                                iMesh.receiveShadow = mat && !mat.isMeshBasicMaterial && !mat.isShaderMaterial;
                            }
                            iMesh.visible = false;
                            iMesh.setMatrixAt(0, new THREE.Matrix4());
                            dummyRoot.add(iMesh);
                            ownedObjects.push(iMesh);
                        }
                    }
                });
                dummyRoot.add(obj);
                ownedObjects.push(obj);
            };

            const addInstancedWarmup = (geo: THREE.BufferGeometry, mat: THREE.Material, castShadow: boolean = true) => {
                const mesh = new THREE.InstancedMesh(geo, mat, 1);
                mesh.castShadow = castShadow;
                mesh.receiveShadow = castShadow && mat && !(mat as any).isMeshBasicMaterial && !(mat as any).isShaderMaterial;
                mesh.setMatrixAt(0, new THREE.Matrix4());
                mesh.visible = false;
                dummyRoot.add(mesh);
                ownedObjects.push(mesh);
            };

            // --- CORE ---
            if (isCore) {
                beginInternal('AssetPreloader: CORE -> Procedural Textures');
                const procedural = createProceduralDiffuse();
                const texKeys = Object.keys(procedural);
                for (let i = 0; i < texKeys.length; i++) {
                    const key = texKeys[i];
                    engine.renderer.initTexture((procedural as any)[key]);
                }
                endInternal('AssetPreloader: CORE -> Procedural Textures');
                if (yieldToMain) await yieldToMain();

                beginInternal('AssetPreloader: CORE -> UI Images');
                const uiAssets = [
                    '/assets/ui/icon_dash.png',
                    '/assets/ui/icon_reload.png',
                    '/assets/ui/icon_flashlight.png',
                    '/assets/icons/weapons/smg.png',
                    '/assets/icons/weapons/shotgun.png',
                    '/assets/icons/weapons/rifle.png',
                    '/assets/icons/weapons/pistol.png',
                    '/assets/icons/weapons/revolver.png',
                    '/assets/icons/weapons/grenade.png',
                    '/assets/icons/weapons/molotov.png',
                    '/assets/icons/weapons/flashbang.png',
                    '/assets/icons/weapons/minigun.png',
                    '/assets/icons/weapons/flamethrower.png',
                    '/assets/icons/weapons/arc_cannon.png',
                    '/assets/icons/weapons/radio.png'
                ];

                // Load images without map/forEach
                const imagePromises = [];
                for (let i = 0; i < uiAssets.length; i++) {
                    const url = uiAssets[i];
                    const img = new Image();
                    img.src = url;
                    imagePromises.push(img.decode().catch(() => {
                        console.warn(`[AssetPreloader] Failed to pre-decode UI image: ${url}`);
                    }));
                }
                await Promise.all(imagePromises);
                endInternal('AssetPreloader: CORE -> UI Images');
                if (yieldToMain) await yieldToMain();

                beginInternal('AssetPreloader: CORE -> Audio');
                registerSoundGenerators();
                const soundEngine = (window as any).gameEngine?.sound;
                if (soundEngine) {
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
                        'owl_hoot', 'bird_ambience', 'ambient_rustle', 'ambient_metal', 'dash',
                        'BITE', 'jump_impact', 'heavy_smash'
                    ];
                    for (let i = 0; i < essentialSounds.length; i++) {
                        SoundBank.get(soundEngine, essentialSounds[i]);
                    }

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
                endInternal('AssetPreloader: CORE -> Audio');

                beginInternal('AssetPreloader: CORE -> Generators');
                try {
                    await EnvironmentGenerator.initNaturePrototypes(yieldToMain);

                    const bumpMaps = ['snow_bump', 'asphalt_bump', 'stone_bump', 'dirt_bump', 'concrete_bump', 'brick_bump', 'bark_rough_bump'];
                    for (let i = 0; i < bumpMaps.length; i++) {
                        const tex = (TEXTURES as any)[bumpMaps[i]];
                        if (tex) engine.renderer.initTexture(tex);
                        if (yieldToMain) await yieldToMain();
                    }

                    const dummyCtx = (window as any).gameEngine?.sectorContext;
                    if (dummyCtx) {
                        ObjectGenerator.createCampfire(dummyCtx, -1000, -1000);
                        ObjectGenerator.createFire(dummyCtx, -1000, -1000);
                    }
                } catch (e) { console.warn("Generator warmup failed", e); }
                endInternal('AssetPreloader: CORE -> Generators');
                if (yieldToMain) await yieldToMain();

                beginInternal('AssetPreloader: CORE -> Props & Trees');
                const treeTypes: TREE_TYPE[] = [TREE_TYPE.PINE, TREE_TYPE.SPRUCE, TREE_TYPE.OAK, TREE_TYPE.DEAD, TREE_TYPE.BIRCH];
                for (let i = 0; i < treeTypes.length; i++) {
                    addToWarmup(EnvironmentGenerator.createTree(treeTypes[i], 1.0, 0));
                }
                addInstancedWarmup(GEOMETRY.foliageCluster, MATERIALS.treeLeavesBirch);
                addInstancedWarmup(GEOMETRY.treeTrunk, MATERIALS.treeTrunk);
                addInstancedWarmup(GEOMETRY.treeTrunk, MATERIALS.treeTrunkOak);
                addInstancedWarmup(GEOMETRY.treeTrunk, MATERIALS.treeTrunkBirch);
                addInstancedWarmup(GEOMETRY.treeTrunk, MATERIALS.deadWood);

                addInstancedWarmup(GEOMETRY.weatherParticle, MATERIALS.particle_snow, false);
                addInstancedWarmup(GEOMETRY.weatherParticle, MATERIALS.particle_rain, false);
                addInstancedWarmup(GEOMETRY.weatherParticle, MATERIALS.particle_ash, false);
                addInstancedWarmup(GEOMETRY.weatherParticle, MATERIALS.particle_ember, false);

                const windMats = [MATERIALS.grass, MATERIALS.flower, MATERIALS.treeTrunkBirch, MATERIALS.treeTrunk];
                for (let i = 0; i < windMats.length; i++) {
                    const m = windMats[i];
                    const dummyWindMesh = new THREE.Mesh(GEOMETRY.box, m);
                    addToWarmup(dummyWindMesh);
                }

                addToWarmup(ModelFactory.createPlayer());
                for (let i = 0; i < FAMILY_MEMBERS.length; i++) {
                    addToWarmup(ModelFactory.createFamilyMember(FAMILY_MEMBERS[i]));
                }

                try {
                    const warmedModels: string[] = [];
                    const allCollectibles = Object.values(COLLECTIBLES) as any[];

                    for (let i = 0; i < allCollectibles.length; i++) {
                        const mType = allCollectibles[i].modelType;
                        if (mType && warmedModels.indexOf(mType) === -1) {
                            warmedModels.push(mType);
                            addToWarmup(ModelFactory.createCollectible(mType));
                        }
                    }
                } catch (e) {
                    console.warn('[AssetPreloader] Collectible warmup failed', e);
                }
                endInternal('AssetPreloader: CORE -> Props & Trees');
                if (yieldToMain) await yieldToMain();

                beginInternal('AssetPreloader: CORE -> FX');
                const fxTypes = [
                    'blood', 'fire', 'large_fire', 'flame', 'spark', 'smoke', 'large_smoke',
                    'debris', 'glass', 'flash', 'splash',
                    'enemy_effect_stun', 'enemy_effect_flame', 'enemy_effect_spark', 'gore', 'blood_splat', 'impact_splat',
                    'campfire_flame', 'campfire_spark', 'campfire_smoke',
                    'scrap',
                    'electric_beam', 'screech_wave', 'ground_impact', 'shockwave', 'frost_nova', 'magnetic_sparks', 'impact'
                ];
                for (let i = 0; i < fxTypes.length; i++) {
                    const realIMesh = FXSystem._getInstancedMesh(null as any, fxTypes[i]);
                    const dummyIMesh = new THREE.InstancedMesh(realIMesh.geometry, realIMesh.material, 1);
                    dummyIMesh.visible = false;
                    dummyRoot.add(dummyIMesh);
                    ownedObjects.push(dummyIMesh);

                    if (fxTypes[i] === 'debris' || fxTypes[i] === 'scrap' || fxTypes[i] === 'glass' || fxTypes[i] === 'gore') {
                        dummyIMesh.castShadow = true;
                        const mat = dummyIMesh.material as any;
                        dummyIMesh.receiveShadow = mat && !mat.isMeshBasicMaterial && !mat.isShaderMaterial;
                    } else {
                        dummyIMesh.castShadow = false;
                        dummyIMesh.receiveShadow = false;
                    }
                }

                addToWarmup(new THREE.Mesh(GEOMETRY.bullet, MATERIALS.bullet));
                addToWarmup(new THREE.Mesh(GEOMETRY.molotov, MATERIALS.molotov));
                addToWarmup(new THREE.Mesh(GEOMETRY.flashbang, MATERIALS.flashbang));
                addToWarmup(new THREE.Mesh(GEOMETRY.grenade, MATERIALS.grenade));

                // Avoid .clone(), create proper copy to avoid memory accumulation issues if called often
                const corpseMatWarmup = new THREE.MeshStandardMaterial().copy(MATERIALS.zombie as THREE.MeshStandardMaterial);
                corpseMatWarmup.color.setHex(0xffffff);
                addToWarmup(new THREE.InstancedMesh(GEOMETRY.zombie, corpseMatWarmup, 1));
                ownedMaterials.push(corpseMatWarmup);
                endInternal('AssetPreloader: CORE -> FX');
            }

            // --- SECTOR ---
            if (isSector) {
                beginInternal('AssetPreloader: SECTOR');
                const dummyTextures = createProceduralTextures();

                const matKeys = Object.keys(MATERIALS) as (keyof typeof MATERIALS)[];
                for (let i = 0; i < matKeys.length; i++) {
                    const k = matKeys[i];
                    if (['road', 'asphalt', 'mountain'].includes(k as string)) continue;
                    const mat = MATERIALS[k] as THREE.Material;
                    addToWarmup(new THREE.Mesh(GEOMETRY.box, mat));
                    if ((mat as any).map) engine.renderer.initTexture((mat as any).map);
                }

                addInstancedWarmup(GEOMETRY.ashPile, MATERIALS.ash);

                addToWarmup(new THREE.Mesh(GEOMETRY.splash, MATERIALS.splash), false, false);
                addToWarmup(new THREE.Mesh(GEOMETRY.bloodSplat, MATERIALS.bloodSplat), false, false);
                addToWarmup(new THREE.Mesh(GEOMETRY.impactSplat, MATERIALS.impactSplat), false, false);
                addToWarmup(new THREE.Mesh(GEOMETRY.decal, MATERIALS.bloodDecal), false, false);
                addToWarmup(new THREE.Mesh(GEOMETRY.splatterDecal, MATERIALS.bloodStainDecal), false, false);
                addToWarmup(new THREE.Mesh(GEOMETRY.fireZone, MATERIALS.fireZone), false, false);
                addToWarmup(new THREE.Mesh(GEOMETRY.fogParticle, MATERIALS.fog), false, false);
                addToWarmup(new THREE.Mesh(GEOMETRY.blastRadius, MATERIALS.blastRadius), false, false);

                addToWarmup(new THREE.Mesh(GEOMETRY.chestBody, MATERIALS.chestStandard));
                addToWarmup(new THREE.Mesh(GEOMETRY.chestLid, MATERIALS.chestBig));
                addToWarmup(new THREE.Mesh(GEOMETRY.rail, MATERIALS.steel));
                addToWarmup(new THREE.Mesh(GEOMETRY.sleeper, MATERIALS.wood));

                const dummyMountainGeo = new THREE.BufferGeometry();
                const dummyPos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
                const dummyNorm = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
                const dummyCol = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1]);

                dummyMountainGeo.setAttribute('position', new THREE.BufferAttribute(dummyPos, 3));
                dummyMountainGeo.setAttribute('normal', new THREE.BufferAttribute(dummyNorm, 3));
                dummyMountainGeo.setAttribute('color', new THREE.BufferAttribute(dummyCol, 3));

                addToWarmup(new THREE.Mesh(dummyMountainGeo, MATERIALS.mountain));
                ownedGeometries.push(dummyMountainGeo);

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
                    addToWarmup(ObjectGenerator.createRubble(0, 0, 4, MATERIALS.busBlue));
                    addToWarmup(ObjectGenerator.createShelf());
                    addToWarmup(ObjectGenerator.createScarecrow(0, 0));
                } catch (e) {
                    console.warn('[AssetPreloader] Prop warmup failed', e);
                }

                addToWarmup(new THREE.Mesh(GEOMETRY.shockwave, MATERIALS.shockwave));
                addToWarmup(new THREE.Mesh(GEOMETRY.shard, MATERIALS.glassShard));
                addToWarmup(new THREE.Mesh(GEOMETRY.aimRing, MATERIALS.aimReticle));
                addToWarmup(new THREE.Mesh(GEOMETRY.landingMarker, MATERIALS.landingMarker));
                addToWarmup(new THREE.Mesh(GEOMETRY.sphere, MATERIALS.flashWhite));

                const sunflowerStemMat = new THREE.MeshStandardMaterial({ color: 0x228B22 });
                const sunflowerHeadMat = new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.8 });
                const sunflowerCenterMat = new THREE.MeshStandardMaterial({ color: 0x3E2723, roughness: 1.0 });
                ownedMaterials.push(sunflowerStemMat, sunflowerHeadMat, sunflowerCenterMat);
                addInstancedWarmup(GEOMETRY.stone, sunflowerStemMat);
                addInstancedWarmup(GEOMETRY.stone, sunflowerHeadMat);
                addInstancedWarmup(GEOMETRY.stone, sunflowerCenterMat);

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

                try {
                    const sectorIndex = sectorId ?? 0;
                    const bossData = BOSSES[sectorIndex] || BOSSES[0];
                    if (bossData) {
                        addToWarmup(ModelFactory.createBoss('Boss', bossData));
                    }
                } catch (e) {
                    console.warn('[AssetPreloader] Boss warmup failed', e);
                }

                // Water System & Vegitation
                const dummyRipples = new Array(WATER_SYSTEM.MAX_RIPPLES).fill(null).map(() => new THREE.Vector4(0, 0, -1000, 0));
                const dummyObjects = new Array(WATER_SYSTEM.MAX_FLOATING_OBJECTS).fill(null).map(() => new THREE.Vector4(0, 0, -1000, 0));
                const coreWaterMat = createWaterMaterial(10, 10, dummyRipples, dummyObjects, 'rect');
                ownedMaterials.push(coreWaterMat);

                const waterSurfaceGeo = new THREE.PlaneGeometry(10, 10, 16, 16);
                waterSurfaceGeo.rotateX(-Math.PI / 2);
                ownedGeometries.push(waterSurfaceGeo);

                const nwMesh = new THREE.Mesh(waterSurfaceGeo, coreWaterMat);
                nwMesh.visible = false;
                dummyRoot.add(nwMesh);
                ownedObjects.push(nwMesh);

                const lilyPadGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 8);
                const lilyStemGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.5, 4);
                const lilyFlowerGeo = new THREE.ConeGeometry(0.15, 0.2, 5);
                const seaweedGeo = new THREE.PlaneGeometry(0.3, 1.5, 2, 4);
                ownedGeometries.push(lilyPadGeo, lilyStemGeo, lilyFlowerGeo, seaweedGeo);

                const waterMats = [MATERIALS.waterLily, MATERIALS.waterLilyFlower, MATERIALS.seaweed];
                for (let i = 0; i < waterMats.length; i++) {
                    addToWarmup(new THREE.Mesh(GEOMETRY.box, waterMats[i]));
                }

                addInstancedWarmup(lilyPadGeo, MATERIALS.waterLily);
                addInstancedWarmup(lilyFlowerGeo, MATERIALS.waterLilyFlower);
                addInstancedWarmup(seaweedGeo, MATERIALS.seaweed);
                addInstancedWarmup(lilyStemGeo, MATERIALS.seaweed);

                addInstancedWarmup(GEOMETRY.scrap, MATERIALS.scrap);

                try {
                    addToWarmup(ObjectGenerator.createBuilding(10, 8, 10, 0xffffff, true, true, 0.2));
                    addToWarmup(ObjectGenerator.createBuilding(10, 10, 10, 0x888888));
                    addToWarmup(ObjectGenerator.createStorefrontBuilding(10, 10, 10));
                    addToWarmup(ObjectGenerator.createGlassStaircase(2, 5, 2));
                    addToWarmup(ObjectGenerator.createNeonSign("WARMUP", 0x00ffff, true));
                    addToWarmup(ObjectGenerator.createNeonHeart(0xff0000));
                    addToWarmup(EnvironmentGenerator.createRock(2, 2));
                    addToWarmup(ObjectGenerator.createHedge());
                    addToWarmup(ObjectGenerator.createWheatStalk());
                } catch (e) { console.warn('[AssetPreloader] Building warmup failed', e); }

                const vehicleTypes = Object.keys(VEHICLES) as VehicleType[];
                for (let i = 0; i < vehicleTypes.length; i++) {
                    const vType = vehicleTypes[i];
                    if (vType === 'boat') {
                        addToWarmup(VehicleGenerator.createBoat());
                    } else {
                        addToWarmup(VehicleGenerator.createVehicle(vType));
                    }
                }
                endInternal('AssetPreloader: SECTOR');
            }

            // --- CAMP ---
            if (isCamp) {
                beginInternal('AssetPreloader: CAMP');
                const dummyTextures = createProceduralTextures();
                const dummyWeather = 'snow';

                // Fetch the scene, but DO NOT track its internal heavy objects for disposal!
                await CampWorld.setupCampScene(scene, dummyTextures as any, dummyWeather, true);

                const dummyActionSpriteMat = new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, depthTest: false });
                const dummyActionSprite = new THREE.Sprite(dummyActionSpriteMat);
                ownedMaterials.push(dummyActionSpriteMat);
                dummyRoot.add(dummyActionSprite);
                ownedObjects.push(dummyActionSprite);

                const dummyActionBasicMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false });
                const dummyActionMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), dummyActionBasicMat);
                ownedMaterials.push(dummyActionBasicMat);
                addToWarmup(dummyActionMesh, false);

                if (yieldToMain) await yieldToMain();

                const rangeCircle = new THREE.Mesh(
                    new THREE.RingGeometry(4.8, 5.0, 32),
                    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
                );
                addToWarmup(rangeCircle);
                ownedMaterials.push(rangeCircle.material as THREE.Material);
                ownedGeometries.push(rangeCircle.geometry);

                const campfireFlame = new THREE.Mesh(CAMP_GEO.flame, CAMP_MAT.flame);
                const campfireSpark = new THREE.Mesh(CAMP_GEO.spark, CAMP_MAT.spark);
                const campfireSmoke = new THREE.Mesh(CAMP_GEO.smoke, CAMP_MAT.smoke);
                addToWarmup(campfireFlame);
                addToWarmup(campfireSpark);
                addToWarmup(campfireSmoke);

                // Station oulines:
                const dummyEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
                ownedGeometries.push(dummyEdges);

                // Dynamisk uppvärmning baserad på din "Single Source of Truth" i CampWorld
                const outlineColors = [
                    CAMP_SCENE.colors.gold,   // Armory
                    CAMP_SCENE.colors.green,  // Adventure Log
                    CAMP_SCENE.colors.red,    // Sectors
                    CAMP_SCENE.colors.purple  // Skills
                ];

                for (let i = 0; i < outlineColors.length; i++) {
                    // VIKTIGT: Vi måste ha linewidth: 2 för att matcha CampWorld exakt!
                    const mat = new THREE.LineBasicMaterial({ color: outlineColors[i], linewidth: 2 });
                    const dummyLine = new THREE.LineSegments(dummyEdges, mat);
                    addToWarmup(dummyLine, false);
                    ownedMaterials.push(mat);
                }

                const campGeos = [
                    new THREE.CircleGeometry(1.8, 16),
                    new THREE.CylinderGeometry(0.15, 0.15, 2.2),
                    new THREE.CylinderGeometry(0.03, 0.03, 1.2),
                    new THREE.SphereGeometry(0.12, 8, 8),
                    new THREE.BoxGeometry(0.15, 0.4, 0.15),
                    new THREE.PlaneGeometry(2.0, 1.4),
                    new THREE.PlaneGeometry(0.4, 0.5),
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

                    addToWarmup(new THREE.Mesh(geo, CAMP_MAT.flame), false);
                    addToWarmup(new THREE.Mesh(geo, CAMP_MAT.spark), false);
                    addToWarmup(new THREE.Mesh(geo, CAMP_MAT.smoke), false);
                }

                addInstancedWarmup(GEOMETRY.treeTrunk, MATERIALS.treeSilhouette);
                addInstancedWarmup(GEOMETRY.foliageCluster, MATERIALS.treeSilhouette);

                if (yieldToMain) await yieldToMain();

                const campPlayer = ModelFactory.createFamilyMember(PLAYER_CHARACTER);
                addToWarmup(campPlayer);
                endInternal('AssetPreloader: CAMP');
            }

            if (yieldToMain) await yieldToMain();

            // --- 6. SINGLE FINAL COMPILATION PASS ---
            beginInternal('AssetPreloader: Final Compilation');
            try {
                // Ensure everything is briefly visible so compilation triggers
                const children = dummyRoot.children;
                for (let i = 0; i < children.length; i++) children[i].visible = true;

                if ((engine.renderer as any).compileAsync) {
                    await (engine.renderer as any).compileAsync(scene, engine.camera.threeCamera);
                } else {
                    engine.renderer.compile(scene, engine.camera.threeCamera);
                }

                // Force GPU upload with a minimal 1x1 render
                const originalViewport = new THREE.Vector4();
                engine.renderer.getViewport(originalViewport);
                engine.renderer.setViewport(0, 0, 1, 1);
                engine.renderer.render(scene, engine.camera.threeCamera);
                engine.renderer.setViewport(originalViewport);

                for (let i = 0; i < children.length; i++) children[i].visible = false;
                if (yieldToMain) await yieldToMain();
            } catch (e) { console.warn("Compilation warmup failed", e); }
            endInternal('AssetPreloader: Final Compilation');

            // --- ZERO-GC CLEANUP ---
            for (let i = 0; i < ownedGeometries.length; i++) {
                if (ownedGeometries[i]) ownedGeometries[i].dispose();
            }
            for (let i = 0; i < ownedMaterials.length; i++) {
                if (ownedMaterials[i]) ownedMaterials[i].dispose();
            }
            // Cleanup any mesh instantiations created within AssetPreloader
            for (let i = 0; i < ownedObjects.length; i++) {
                const obj = ownedObjects[i];
                if (obj.parent) obj.parent.remove(obj);
            }
            ownedObjects.length = 0; // Clear array

            scene.clear();
            if ((engine.renderer as any).renderLists) (engine.renderer as any).renderLists.dispose();

            warmedModules.add(moduleKey);
            endInternal('AssetPreloader -> Total');

            console.log(`[AssetPreloader] Warmup Module [${moduleKey}] Complete. Details:`, warmupTimings);
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

    setLastSectorIndex: (idx: number) => {
        lastSectorIndex = idx;
    },

    releaseSectorAssets: (index: number) => {
        const moduleKey = `SECTOR_${index}`;
        if (warmedModules.has(moduleKey)) {
            warmedModules.delete(moduleKey);
            console.log(`[AssetPreloader] Module [${moduleKey}] released.`);
        }
    }
};