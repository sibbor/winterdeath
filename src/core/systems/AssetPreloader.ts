import * as THREE from 'three';
import { GEOMETRY, MATERIALS, ModelFactory, createProceduralDiffuse, createProceduralTextures } from '../../utils/assets';
import { TEXTURES } from '../../utils/assets/AssetLoader';
import { createWaterMaterial } from '../../utils/assets/materials_water';
import { FAMILY_MEMBERS, ZOMBIE_TYPES, BOSSES, PLAYER_CHARACTER } from '../../content/constants';
import { VEHICLES, VehicleType } from '../../content/vehicles';
import { ObjectGenerator } from '../world/ObjectGenerator';
import { VehicleGenerator } from '../world/VehicleGenerator';
import { EnvironmentGenerator } from '../world/EnvironmentGenerator';
import { CampWorld, CAMP_SCENE, stationMaterials, CONST_GEO as CAMP_GEO, CONST_MAT as CAMP_MAT } from '../../components/camp/CampWorld';
import { SectorSystem } from '../systems/SectorSystem';
import { CameraSystem } from '../systems/CameraSystem';
import { registerSoundGenerators } from '../../utils/audio/SoundLib';
import { SoundBank } from '../../utils/audio/SoundBank';
import { FXSystem } from '../systems/FXSystem';
import { COLLECTIBLES } from '../../content/collectibles';

const warmedModules = new Set<string>();
const activePromises = new Map<string, Promise<void>>();
let lastSectorIndex = -1;

export const TRANSPARENT_UI_ICONS: Record<string, string> = {};

export const AssetPreloader = {

    warmupAsync: async (renderer: THREE.WebGLRenderer, target: 'CORE' | 'CAMP' | number, envConfigBase: any = null, yieldToMain?: () => Promise<void>, overrideCamera?: THREE.Camera) => {
        const moduleKey = typeof target === 'number' ? `SECTOR_${target}` : (typeof target === 'string' ? target : 'UNKNOWN');
        if (warmedModules.has(moduleKey)) return;
        if (activePromises.has(moduleKey)) return activePromises.get(moduleKey);

        const warmupLogic = async () => {
            const isCamp = target === 'CAMP';
            const isSector = typeof target === 'number';

            let envConfig = envConfigBase;
            if (isSector && !envConfig) {
                const sectorId = Number(target);
                if (!isNaN(sectorId)) {
                    const sector = SectorSystem.getSector(sectorId);
                    if (sector) envConfig = sector.environment;
                }
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

            // 0. PROCEDURAL TEXTURE CACHE WARMUP
            if (target === 'CORE') {
                beginInternal('asset_warmup_procedural');
                const procedural = createProceduralDiffuse();
                const texs = Object.values(procedural);
                for (let i = 0; i < texs.length; i++) renderer.initTexture(texs[i]);
                endInternal('asset_warmup_procedural');
                if (yieldToMain) await yieldToMain();

                beginInternal('asset_warmup_ui_images');
                const uiIcons = [
                    'pistol.png', 'revolver.png', 'smg.png', 'shotgun.png',
                    'rifle.png', 'minigun.png', 'flamethrower.png', 'arc_cannon.png',
                    'grenade.png', 'molotov.png', 'flashbang.png', 'radio.png'
                ];

                await Promise.all(uiIcons.map(file => new Promise<void>(resolve => {
                    const img = new Image();
                    img.crossOrigin = 'Anonymous';

                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d', { willReadFrequently: true });
                        if (!ctx) {
                            resolve();
                            return;
                        }

                        canvas.width = img.width;
                        canvas.height = img.height;
                        ctx.drawImage(img, 0, 0);

                        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        const data = imageData.data;

                        for (let i = 0; i < data.length; i += 4) {
                            const r = data[i];
                            const g = data[i + 1];
                            const b = data[i + 2];

                            const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

                            if (luminance < 60) {
                                data[i + 3] = 0;
                            } else {
                                data[i] = 255;
                                data[i + 1] = 255;
                                data[i + 2] = 255;
                                data[i + 3] = luminance;
                            }
                        }

                        ctx.putImageData(imageData, 0, 0);
                        TRANSPARENT_UI_ICONS[file] = canvas.toDataURL('image/png');
                        resolve();
                    };

                    img.onerror = () => {
                        console.warn(`[AssetPreloader] Missing UI icon: ${file}`);
                        TRANSPARENT_UI_ICONS[file] = '';
                        resolve();
                    };

                    img.src = `/assets/icons/weapons/${file}`;
                })));

                endInternal('asset_warmup_ui_images');
                if (yieldToMain) await yieldToMain();
            }

            // 1. AUDIO SYSTEM WARMUP
            if (target === 'CORE') {
                beginInternal('asset_warmup_audio');
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
                        'owl_hoot', 'bird_ambience', 'ambient_rustle', 'ambient_metal'
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
                endInternal('asset_warmup_audio');
            }

            const scene = new THREE.Scene();

            const warmupCamera = new CameraSystem();
            if (!overrideCamera) {
                warmupCamera.setPosition(0, 5, 20, true);
                warmupCamera.lookAt(0, 0, 0, true);
            } else {
                warmupCamera.threeCamera.copy(overrideCamera as any);
            }

            // 3. SHADER PERMUTATION SETUP
            beginInternal('asset_warmup_permutations');
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
                    ambientLight.name = 'AMBIENT_LIGHT';
                    scene.add(ambientLight);
                }

                const skyLightRef = envConfig.skyLight;
                if (skyLightRef && skyLightRef.visible) {
                    const lightPos = skyLightRef.position || { x: 80, y: 50, z: 50 };
                    const skyLight = new THREE.DirectionalLight(skyLightRef.color, skyLightRef.intensity);
                    skyLight.name = 'SKY_LIGHT';
                    skyLight.position.set(lightPos.x, lightPos.y, lightPos.z);
                    skyLight.castShadow = true;
                    skyLight.shadow.camera.left = -100;
                    skyLight.shadow.camera.right = 100;
                    skyLight.shadow.camera.top = 100;
                    skyLight.shadow.camera.bottom = -100;
                    skyLight.shadow.camera.far = 300;
                    skyLight.shadow.bias = -0.0005;
                    scene.add(skyLight);
                }
            }

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
                        const mat = mesh.material as any;
                        mesh.receiveShadow = mat && !mat.isMeshBasicMaterial && !mat.isShaderMaterial;

                        if (instancing && !(mesh as any).isInstancedMesh) {
                            const iMesh = new THREE.InstancedMesh(mesh.geometry, mesh.material, 1);
                            iMesh.castShadow = true;
                            iMesh.receiveShadow = mat && !mat.isMeshBasicMaterial && !mat.isShaderMaterial;
                            iMesh.visible = false;
                            dummyRoot.add(iMesh);
                        }
                    }
                });
                dummyRoot.add(obj);
            };

            const addInstancedWarmup = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
                const mesh = new THREE.InstancedMesh(geo, mat, 1);
                mesh.castShadow = true;
                mesh.receiveShadow = mat && !(mat as any).isMeshBasicMaterial && !(mat as any).isShaderMaterial;
                mesh.setMatrixAt(0, new THREE.Matrix4());
                mesh.visible = false;
                dummyRoot.add(mesh);
            };

            if (envConfig && isSector) {
                const spotLight = new THREE.SpotLight(0xffffff, 1);
                spotLight.castShadow = false;
                spotLight.shadow.autoUpdate = false;
                spotLight.shadow.bias = -0.0001;
                scene.add(spotLight);
            }
            endInternal('asset_warmup_permutations');

            // 4. GENERATOR INITIALIZATION
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
            if (target === 'CORE' || isSector || isCamp) {
                const matKeys = Object.keys(MATERIALS) as (keyof typeof MATERIALS)[];
                for (let i = 0; i < matKeys.length; i++) {
                    const k = matKeys[i];
                    if (['road', 'asphalt', 'mountain'].includes(k as string)) continue;
                    const mat = MATERIALS[k] as THREE.Material;
                    addToWarmup(new THREE.Mesh(GEOMETRY.box, mat));
                    if ((mat as any).map) renderer.initTexture((mat as any).map);
                }

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
                } catch (e) { console.warn('[AssetPreloader] Prop warmup failed', e); }

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
                addInstancedWarmup(GEOMETRY.ashPile, MATERIALS.ash);

                const sunflowerStemMat = new THREE.MeshStandardMaterial({ color: 0x228B22 });
                const sunflowerHeadMat = new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.8 });
                const sunflowerCenterMat = new THREE.MeshStandardMaterial({ color: 0x3E2723, roughness: 1.0 });
                ownedMaterials.push(sunflowerStemMat, sunflowerHeadMat, sunflowerCenterMat);
                addInstancedWarmup(GEOMETRY.stone, sunflowerStemMat);
                addInstancedWarmup(GEOMETRY.stone, sunflowerHeadMat);
                addInstancedWarmup(GEOMETRY.stone, sunflowerCenterMat);

                const treeTypes: ('PINE' | 'SPRUCE' | 'OAK' | 'DEAD' | 'BIRCH')[] = ['PINE', 'SPRUCE', 'OAK', 'DEAD', 'BIRCH'];
                for (let i = 0; i < treeTypes.length; i++) {
                    addToWarmup(EnvironmentGenerator.createTree(treeTypes[i], 1.0, 0));
                }

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
                    const collectibleTypes = ['phone', 'pacifier', 'axe', 'jacket', 'badge', 'diary', 'ring', 'teddy'];
                    for (let i = 0; i < collectibleTypes.length; i++) {
                        addToWarmup(ModelFactory.createCollectible(collectibleTypes[i]));
                    }
                } catch (e) {
                    console.warn('[AssetPreloader] Collectible warmup failed', e);
                }

                // [VINTERDÖD FIX] Återställd till InstancedMesh-warmup för att matcha WeatherSystem.
                addInstancedWarmup(GEOMETRY.weatherParticle, MATERIALS.particle_snow);
                addInstancedWarmup(GEOMETRY.weatherParticle, MATERIALS.particle_rain);
                addInstancedWarmup(GEOMETRY.weatherParticle, MATERIALS.particle_ash);
                addInstancedWarmup(GEOMETRY.weatherParticle, MATERIALS.particle_ember);

                const windMats = [MATERIALS.grass, MATERIALS.flower, MATERIALS.treeTrunkBirch, MATERIALS.treeTrunk];
                for (let i = 0; i < windMats.length; i++) {
                    const m = windMats[i];
                    addToWarmup(new THREE.Mesh(GEOMETRY.box, m));
                }

                const waterMats = [MATERIALS.waterLily, MATERIALS.waterLilyFlower, MATERIALS.seaweed];
                for (let i = 0; i < waterMats.length; i++) {
                    addToWarmup(new THREE.Mesh(GEOMETRY.box, waterMats[i]));
                }

                const dummyVec4: THREE.Vector4[] = Array(16).fill(null).map(() => new THREE.Vector4());
                const waterNordic = createWaterMaterial('nordic', 20, 20, dummyVec4, dummyVec4, 'rect');
                const waterIce = createWaterMaterial('ice', 20, 20, dummyVec4, dummyVec4, 'rect');
                ownedMaterials.push(waterNordic, waterIce);

                addToWarmup(new THREE.Mesh(GEOMETRY.box, waterNordic), false);
                addToWarmup(new THREE.Mesh(GEOMETRY.box, waterIce), false);

                addInstancedWarmup(GEOMETRY.scrap, MATERIALS.scrap);

                addToWarmup(ModelFactory.createPlayer());
                for (let i = 0; i < FAMILY_MEMBERS.length; i++) {
                    addToWarmup(ModelFactory.createFamilyMember(FAMILY_MEMBERS[i]));
                }
            }

            if (isSector) {
                const sectorIndex = target as number;

                try {
                    addToWarmup(ObjectGenerator.createBuilding(10, 8, 10, 0xffffff, true, true, 0.2));
                } catch (e) { console.warn('[AssetPreloader] Building warmup failed', e); }

                try {
                    const bossData = BOSSES[sectorIndex] || BOSSES[0];
                    if (bossData) {
                        const bossMesh = ModelFactory.createBoss('Boss', bossData);
                        addToWarmup(bossMesh);
                    }
                } catch (e) {
                    console.warn('[AssetPreloader] Boss warmup failed', e);
                }

                const flashlight = ModelFactory.createFlashlight();
                addToWarmup(flashlight);
                scene.add(flashlight);

                const vehicleTypes = Object.keys(VEHICLES) as VehicleType[];
                for (let i = 0; i < vehicleTypes.length; i++) {
                    const vType = vehicleTypes[i];
                    if (vType === 'boat') {
                        addToWarmup(VehicleGenerator.createBoat());
                    } else {
                        addToWarmup(VehicleGenerator.createVehicle(vType));
                    }
                }

                const dummyRipples = new Array(16).fill(0).map(() => new THREE.Vector4(0, 0, -1000, 0));
                const dummyObjects = new Array(8).fill(0).map(() => new THREE.Vector4(0, 0, 0, 0));
                const nordicWater = createWaterMaterial('nordic', 10, 10, dummyRipples, dummyObjects, 'circle');
                const iceWater = createWaterMaterial('ice', 10, 10, dummyRipples, dummyObjects, 'rect');
                ownedMaterials.push(nordicWater, iceWater);

                const waterSurfaceGeo = new THREE.PlaneGeometry(10, 10, 16, 16);
                waterSurfaceGeo.rotateX(-Math.PI / 2);
                ownedGeometries.push(waterSurfaceGeo);

                const nwMesh = new THREE.Mesh(waterSurfaceGeo, nordicWater);
                const iwMesh = new THREE.Mesh(waterSurfaceGeo, iceWater);
                nwMesh.visible = false; iwMesh.visible = false;
                dummyRoot.add(nwMesh, iwMesh);

                const lilyPadGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 8);
                const lilyStemGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.5, 4);
                const lilyFlowerGeo = new THREE.ConeGeometry(0.15, 0.2, 5);
                const seaweedGeo = new THREE.PlaneGeometry(0.3, 1.5, 2, 4);
                ownedGeometries.push(lilyPadGeo, lilyStemGeo, lilyFlowerGeo, seaweedGeo);

                addInstancedWarmup(lilyPadGeo, MATERIALS.waterLily);
                addInstancedWarmup(lilyFlowerGeo, MATERIALS.waterLilyFlower);
                addInstancedWarmup(seaweedGeo, MATERIALS.seaweed);
                addInstancedWarmup(lilyStemGeo, MATERIALS.seaweed);
            }

            if (isCamp) {
                const dummyTextures = createProceduralTextures();
                const dummyWeather = 'snow';

                const { envState: campState } = await CampWorld.setupCampScene(renderer, scene, warmupCamera as any, dummyTextures as any, dummyWeather, true);

                if (campState.starSystem) {
                    ownedGeometries.push(campState.starSystem.geometry);
                    ownedMaterials.push(campState.starSystem.material as THREE.Material);
                }
                if (campState.particles) {
                    const p = campState.particles;
                    ownedGeometries.push(p.flames.geometry, p.sparkles.geometry, p.smokes.geometry);
                    ownedMaterials.push(p.flames.material as THREE.Material, p.sparkles.material as THREE.Material, p.smokes.material as THREE.Material);
                }

                const dummyActionSpriteMat = new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, depthTest: false });
                const dummyActionSprite = new THREE.Sprite(dummyActionSpriteMat);
                ownedMaterials.push(dummyActionSpriteMat);
                dummyRoot.add(dummyActionSprite);

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

                const dummyEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
                const dummyLine = new THREE.LineSegments(dummyEdges, new THREE.LineBasicMaterial({ color: 0xffffff }));
                addToWarmup(dummyLine);
                ownedMaterials.push(dummyLine.material as THREE.Material);
                ownedGeometries.push(dummyEdges);

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

                const groundMat = MATERIALS.dirt;
                const groundGeo = new THREE.PlaneGeometry(120, 120);
                groundGeo.rotateX(-Math.PI / 2);
                ownedGeometries.push(groundGeo);
                const ground = new THREE.Mesh(groundGeo, groundMat);
                ground.receiveShadow = true;
                addToWarmup(ground, false);

                const campPlayer = ModelFactory.createFamilyMember(PLAYER_CHARACTER);
                addToWarmup(campPlayer);
            }

            if (isSector || target === 'CORE') {
                const fxTypes = [
                    'blood', 'fire', 'large_fire', 'flame', 'spark', 'smoke', 'large_smoke',
                    'debris', 'glass', 'flash', 'splash',
                    'enemy_effect_stun', 'enemy_effect_flame', 'enemy_effect_spark', 'gore', 'blood_splat',
                    'campfire_flame', 'campfire_spark', 'campfire_smoke',
                    'scrap'
                ];
                for (let i = 0; i < fxTypes.length; i++) {
                    const realIMesh = FXSystem._getInstancedMesh(null as any, fxTypes[i]);

                    const dummyIMesh = new THREE.InstancedMesh(realIMesh.geometry, realIMesh.material, 1);
                    dummyIMesh.visible = false;
                    dummyRoot.add(dummyIMesh);

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

                const corpseMatWarmup = MATERIALS.zombie.clone() as THREE.MeshStandardMaterial;
                corpseMatWarmup.color.setHex(0xffffff);
                addToWarmup(new THREE.InstancedMesh(GEOMETRY.zombie, corpseMatWarmup, 1));
                ownedMaterials.push(corpseMatWarmup);
            }

            if (yieldToMain) await yieldToMain();

            // 6. SINGLE FINAL COMPILATION PASS
            beginInternal('asset_warmup_compilation');
            try {
                const children = dummyRoot.children;
                for (let i = 0; i < children.length; i++) children[i].visible = true;

                if ((renderer as any).compileAsync) {
                    await (renderer as any).compileAsync(scene, warmupCamera.threeCamera);
                } else {
                    renderer.compile(scene, warmupCamera.threeCamera);
                }

                const originalViewport = new THREE.Vector4();
                renderer.getViewport(originalViewport);
                renderer.setViewport(0, 0, 1, 1);
                renderer.render(scene, warmupCamera.threeCamera);
                renderer.setViewport(originalViewport);

                for (let i = 0; i < children.length; i++) children[i].visible = false;
                if (yieldToMain) await yieldToMain();
            } catch (e) { console.warn("Compilation warmup failed", e); }
            endInternal('asset_warmup_compilation');

            // SAFE VRAM FLUSH & SCENE CLEANUP
            for (let i = 0; i < ownedGeometries.length; i++) {
                if (ownedGeometries[i]) ownedGeometries[i].dispose();
            }
            for (let i = 0; i < ownedMaterials.length; i++) {
                if (ownedMaterials[i]) ownedMaterials[i].dispose();
            }

            scene.clear();
            if ((renderer as any).renderLists) (renderer as any).renderLists.dispose();

            warmedModules.add(moduleKey);
            endInternal('asset_warmup_total');

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
    setLastSectorIndex: (idx: number) => { lastSectorIndex = idx; },

    releaseSectorAssets: (index: number) => {
        const moduleKey = `SECTOR_${index}`;
        if (warmedModules.has(moduleKey)) {
            warmedModules.delete(moduleKey);
            console.log(`[AssetPreloader] Module [${moduleKey}] released.`);
        }
    }
};