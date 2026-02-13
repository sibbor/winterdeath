
import * as THREE from 'three';
import { GEOMETRY, MATERIALS, ModelFactory } from '../../utils/assets';
import { ZOMBIE_TYPES } from '../../content/constants';
import { ObjectGenerator } from '../world/ObjectGenerator';
import { EnvironmentGenerator } from '../world/EnvironmentGenerator';
import { SectorBuilder } from '../world/SectorGenerator';
import { registerSoundGenerators } from '../../utils/audio/SoundLib';
import { SoundBank } from '../../utils/audio/SoundBank';

let warmedUp = false;
let lastSectorIndex = -1;

export const AssetPreloader = {
    warmupAsync: async (renderer: THREE.WebGLRenderer, envConfig: any, yieldToMain?: () => Promise<void>) => {
        if (warmedUp) return;

        // 0. Initialize Sound System
        registerSoundGenerators();

        // Preload essential sounds (non-blocking, handled by Bank)
        const soundCore = (window as any).gameEngine?.sound;
        if (soundCore) {
            [
                'ui_hover', 'ui_click', 'shot_pistol', 'walker_groan',
                'impact_flesh', 'impact_metal', 'impact_concrete', 'impact_stone', 'impact_wood',
                'door_metal_shut', 'fx_heartbeat', 'ui_level_up',
                'loot_scrap', 'chest_open'
            ].forEach(k => {
                SoundBank.get(soundCore, k);
            });
        }

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);

        // 1. Replicate Environment (Fog & Lights are critical for shader permutation)
        if (envConfig) {
            scene.fog = new THREE.FogExp2(envConfig.fogColor || envConfig.bgColor, envConfig.fogDensity);
            scene.background = new THREE.Color(envConfig.bgColor);

            const ambient = new THREE.AmbientLight(0x404040, envConfig.ambientIntensity);
            scene.add(ambient);

            if (envConfig.moon.visible) {
                const dirLight = new THREE.DirectionalLight(envConfig.moon.color, envConfig.moon.intensity);
                dirLight.castShadow = true;
                scene.add(dirLight);
            }

            // Add a PointLight and SpotLight to ensure shaders support them
            const pLight = new THREE.PointLight(0xffaa00, 1, 10);
            scene.add(pLight);

            const sLight = new THREE.SpotLight(0xffffff, 1);
            sLight.castShadow = true;
            scene.add(sLight);
        }

        // 2. Add One of Every Material/Geometry Combo
        const dummyRoot = new THREE.Group();
        dummyRoot.position.set(0, 0, -10);
        scene.add(dummyRoot);

        // -- Particles & Projectiles --
        const matKeys = Object.keys(MATERIALS) as (keyof typeof MATERIALS)[];
        for (const k of matKeys) {
            const mat = MATERIALS[k];
            // Skip large ground/road textures to save time, focus on common shaders
            if (k === 'road' || k === 'asphalt' || k === 'snow' || k === 'concrete') continue;

            const mesh = new THREE.Mesh(GEOMETRY.box, mat);
            dummyRoot.add(mesh);

            if (mat instanceof THREE.MeshBasicMaterial && mat.transparent) {
                const p = new THREE.Mesh(GEOMETRY.plane, mat);
                dummyRoot.add(p);
            }

            // Yield every few materials to keep UI alive
            if (yieldToMain && matKeys.indexOf(k) % 5 === 0) await yieldToMain();
        }

        // -- Specific Weapon Geometries --
        const bullet = new THREE.Mesh(GEOMETRY.bullet, MATERIALS.bullet);
        dummyRoot.add(bullet);
        const grenade = new THREE.Mesh(GEOMETRY.grenade, MATERIALS.grenade);
        dummyRoot.add(grenade);
        const molotov = new THREE.Mesh(GEOMETRY.molotov, MATERIALS.molotov);
        dummyRoot.add(molotov);
        const landingMarker = new THREE.Mesh(GEOMETRY.landingMarker, MATERIALS.landingMarker);
        dummyRoot.add(landingMarker);

        if (yieldToMain) await yieldToMain();

        // -- Characters --
        const player = ModelFactory.createPlayer();
        dummyRoot.add(player);

        const zombieKeys = Object.keys(ZOMBIE_TYPES);
        for (const type of zombieKeys) {
            const z = ModelFactory.createZombie(type, ZOMBIE_TYPES[type as keyof typeof ZOMBIE_TYPES]);
            dummyRoot.add(z);
            if (yieldToMain) await yieldToMain();
        }

        const boss = ModelFactory.createBoss('Boss', { color: 0xff0000, scale: 3 } as any);
        dummyRoot.add(boss);

        // -- Environmental Props --
        const trunk = new THREE.Mesh(GEOMETRY.treeTrunk, MATERIALS.treeTrunk);
        dummyRoot.add(trunk);
        const foliage = new THREE.Mesh(GEOMETRY.foliageCluster, MATERIALS.treeLeaves);
        dummyRoot.add(foliage);

        const barrel = new THREE.Mesh(GEOMETRY.barrel, MATERIALS.barrel);
        dummyRoot.add(barrel);
        const explosiveBarrel = new THREE.Mesh(GEOMETRY.barrel, MATERIALS.barrelExplosive);
        dummyRoot.add(explosiveBarrel);

        const chest = new THREE.Mesh(GEOMETRY.chestBody, MATERIALS.chestStandard);
        dummyRoot.add(chest);
        const chestLid = new THREE.Mesh(GEOMETRY.chestLid, MATERIALS.chestStandard);
        dummyRoot.add(chestLid);
        const chestBig = new THREE.Mesh(GEOMETRY.chestBody, MATERIALS.chestBig);
        dummyRoot.add(chestBig);

        const scrap = new THREE.Mesh(GEOMETRY.scrap, MATERIALS.scrap);
        dummyRoot.add(scrap);

        // -- Instanced Mesh Warmup --
        const instancedScrap = new THREE.InstancedMesh(GEOMETRY.scrap, MATERIALS.scrap, 10);
        instancedScrap.count = 5;
        for (let i = 0; i < 5; i++) {
            instancedScrap.setMatrixAt(i, new THREE.Matrix4().setPosition(i, 0, 0));
        }
        dummyRoot.add(instancedScrap);

        // -- Weather & Effects --
        const fog = new THREE.Mesh(GEOMETRY.fogParticle, MATERIALS.fog);
        dummyRoot.add(fog);

        const snow = new THREE.Mesh(GEOMETRY.weatherParticle, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
        dummyRoot.add(snow);
        const rain = new THREE.Mesh(GEOMETRY.weatherParticle, new THREE.MeshBasicMaterial({ color: 0xaaaaff, transparent: true, opacity: 0.4 }));
        rain.scale.set(0.5, 4.0, 1.0);
        dummyRoot.add(rain);

        const gore = new THREE.Mesh(GEOMETRY.gore, new THREE.MeshStandardMaterial({ color: 0x660000, roughness: 0.2 }));
        dummyRoot.add(gore);
        const flame = new THREE.Mesh(GEOMETRY.flame, new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.8 }));
        dummyRoot.add(flame);
        const shockwave = new THREE.Mesh(GEOMETRY.shockwave, new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending }));
        dummyRoot.add(shockwave);
        const shard = new THREE.Mesh(GEOMETRY.shard, MATERIALS.glassShard);
        dummyRoot.add(shard);

        const crosshair = new THREE.Mesh(GEOMETRY.aimRing, MATERIALS.aimReticle);
        dummyRoot.add(crosshair);

        const ash = new THREE.Mesh(GEOMETRY.ashPile, MATERIALS.ash);
        dummyRoot.add(ash);

        const blood = new THREE.Mesh(GEOMETRY.decal, MATERIALS.bloodDecal);
        dummyRoot.add(blood);
        const scorch = new THREE.Mesh(GEOMETRY.decal, MATERIALS.scorchDecal);
        dummyRoot.add(scorch);

        const bomberRing = new THREE.Mesh(GEOMETRY.blastRadius, MATERIALS.blastRadius);
        dummyRoot.add(bomberRing);

        // -- Darkened Corpse Warmup --
        // Ensures that the material.clone() and multiplyScalar(0.5) logic used for corpses is warmed up
        const deadMat = MATERIALS.zombie.clone();
        deadMat.color.multiplyScalar(0.5);
        const dummyCorpse = new THREE.Mesh(GEOMETRY.zombie, deadMat);
        dummyRoot.add(dummyCorpse);

        // -- UI & Geometries --
        const dummySprite = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
        dummyRoot.add(dummySprite);

        const dodeca = new THREE.Mesh(new THREE.DodecahedronGeometry(1), MATERIALS.stone);
        dummyRoot.add(dodeca);

        const circle = new THREE.Mesh(new THREE.CircleGeometry(1, 8), MATERIALS.ash);
        dummyRoot.add(circle);

        // -- Lighting Prop Geometries --
        const streetPole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 8), MATERIALS.blackMetal);
        dummyRoot.add(streetPole);
        const streetHead = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.8), MATERIALS.blackMetal);
        dummyRoot.add(streetHead);
        const caveFixture = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2), MATERIALS.blackMetal);
        dummyRoot.add(caveFixture);
        const winPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.5), MATERIALS.stone);
        dummyRoot.add(winPlane);

        // -- New POI Materials Warmup --
        [
            MATERIALS.plaster,
            MATERIALS.whiteBrick,
            MATERIALS.wooden_fasade,
            MATERIALS.sheet_metal,
            MATERIALS.glass
        ].forEach(mat => {
            const m = new THREE.Mesh(GEOMETRY.zombie, mat);
            dummyRoot.add(m);
        });


        // Pre-warm FX Pool
        // Create 200 particles of various types to fill the pool
        const { FXSystem } = await import('./FXSystem');
        // Dynamic import to avoid circular dependency if any, though likely safe to import at top.
        // But let's be safe.

        for (let i = 0; i < 100; i++) {
            // Mix of particles to ensure pool has some variety if we were strictly typed,
            // but our pool is generic meshes.
            const p = new THREE.Mesh(GEOMETRY.particle, MATERIALS.smoke);
            p.visible = false;
            p.position.set(0, -1000, 0);
            scene.add(p);
            FXSystem.MESH_POOL.push(p);

            // Add some fire particles too
            if (i < 20) {
                const f = new THREE.Mesh(GEOMETRY.flame, MATERIALS.fire);
                f.visible = false;
                f.position.set(0, -1000, 0);
                scene.add(f);
                FXSystem.MESH_POOL.push(f);
            }
        }

        // Also add some gore chunks
        for (let i = 0; i < 20; i++) {
            const g = new THREE.Mesh(GEOMETRY.gore, MATERIALS.gore);
            g.visible = false;
            g.position.set(0, -1000, 0);
            scene.add(g);
            FXSystem.MESH_POOL.push(g);
        }

        // Add explicit campfire particles to pool
        for (let i = 0; i < 10; i++) {
            const f = new THREE.Mesh(GEOMETRY.flame, MATERIALS.fire);
            f.visible = false;
            f.position.set(0, -1000, 0);
            scene.add(f);
            FXSystem.MESH_POOL.push(f);

            const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), MATERIALS.bullet);
            s.visible = false;
            s.position.set(0, -1000, 0);
            scene.add(s);
            FXSystem.MESH_POOL.push(s);
        }

        const ring = new THREE.Mesh(GEOMETRY.familyRing, MATERIALS.familyRing);
        dummyRoot.add(ring);

        const collectibleTypes = ['phone', 'pacifier', 'axe', 'scarf', 'jacket', 'badge', 'diary', 'ring', 'teddy'];
        for (const type of collectibleTypes) {
            const model = ModelFactory.createCollectible(type);
            dummyRoot.add(model);

            model.traverse((child) => {
                if (child instanceof THREE.Mesh && child.material) {
                    const transMat = (child.material as THREE.Material).clone();
                    transMat.transparent = true;
                    transMat.opacity = 0.5;
                    const transMesh = new THREE.Mesh(child.geometry, transMat);
                    dummyRoot.add(transMesh);
                }
            });
            if (yieldToMain) await yieldToMain();
        }

        // 3. Force Skinning Warmup
        scene.traverse((obj) => {
            if ((obj as any).isSkinnedMesh) {
                const mesh = obj as THREE.SkinnedMesh;
                mesh.skeleton.update();
            }
        });

        // 4. Force Compilation (Incremental with Yielding)
        // Instead of one big compileAsync which might still block or be uncontrolled,
        // we manually compile the scene subsets to ensure responsiveness.
        try {
            // Compile global environment first
            renderer.compile(scene, camera);
            if (yieldToMain) await yieldToMain();

            // Iterate through root children (groups of assets) and compile them individually
            const children = dummyRoot.children.slice();

            // Simpler approach: 
            // 1. Hide all main root children.
            dummyRoot.children.forEach(c => c.visible = false);

            // 2. Reveal and compile one by one
            let batchCount = 0;
            for (const child of children) {
                child.visible = true;
                batchCount++;

                // Compile effective scene
                renderer.compile(scene, camera);

                if (batchCount % 2 === 0 && yieldToMain) await yieldToMain();
            }

        } catch (e) {
            console.warn("Shader warmup failed", e);
        }

        // 5. ObjectGenerator & EnvironmentGenerator Warmup (Force lazy-load of textures & prototypes)
        try {
            // Nature (EnvironmentGenerator) & Buildings (ObjectGenerator)
            await EnvironmentGenerator.initPrototypes(yieldToMain);
            await ObjectGenerator.initBuildingPrototypes(yieldToMain);

            // Dummy Vehicle (Triggers texture generation for cars)
            const dummyCar = ObjectGenerator.createVehicle('station wagon');
            dummyCar.position.set(10, 0, 10);
            dummyRoot.add(dummyCar);

            // Dummy Building
            const dummyBuilding = ObjectGenerator.createBuilding(4, 4, 4, 0x888888);
            dummyBuilding.position.set(-10, 0, 10);
            dummyRoot.add(dummyBuilding);

            // Sector 2 Specific Props
            const dummyRock = EnvironmentGenerator.createRock(2, 2);
            dummyRock.position.set(5, 0, 5);
            dummyRoot.add(dummyRock);

            const dummyCampfire = ObjectGenerator.createCampfire({ scene: dummyRoot, obstacles: [] } as any, 0, 0, 0, 1.0);
            dummyCampfire.position.set(-5, 0, -5);

            const dummyTimberTruck = ObjectGenerator.createVehicle('timber_truck');
            dummyTimberTruck.position.set(0, 0, 15);
            dummyRoot.add(dummyTimberTruck);

            const dummyTimberPile = ObjectGenerator.createTimberPile();
            dummyTimberPile.position.set(5, 0, -5);
            dummyRoot.add(dummyTimberPile);

            const dummyBarrel = ObjectGenerator.createBarrel();
            dummyBarrel.position.set(-5, 0, 5);
            dummyRoot.add(dummyBarrel);

            const dummyStump = EnvironmentGenerator.createTreeStump();
            dummyStump.position.set(2, 0, 2);
            dummyRoot.add(dummyStump);

            // Environmental Features (Grass & Flowers)
            const dummyGrass = EnvironmentGenerator.createGrassTuft();
            dummyGrass.position.set(-2, 0, -2);
            dummyRoot.add(dummyGrass);

            const dummyFlowerPink = EnvironmentGenerator.createFlower(0);
            dummyFlowerPink.position.set(3, 0, -3);
            dummyRoot.add(dummyFlowerPink);

            const dummyFlowerYellow = EnvironmentGenerator.createFlower(1);
            dummyFlowerYellow.position.set(-3, 0, 3);
            dummyRoot.add(dummyFlowerYellow);

            const dummyOpening = SectorBuilder.createMountainOpening();
            dummyOpening.position.set(0, 0, -20);
            dummyRoot.add(dummyOpening);

            if (yieldToMain) await yieldToMain();
        } catch (e) {
            console.warn("ObjectGenerator warmup failed", e);
        }

        // 6. Tech-Magic Visuals Warmup (Additive Blending / Depth Write False)
        const techGroup = new THREE.Group();
        const techRing = new THREE.Mesh(
            new THREE.RingGeometry(0.6, 0.7, 32),
            new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
        );
        techGroup.add(techRing);
        const techBeam = new THREE.Mesh(
            new THREE.CylinderGeometry(0.4, 0.4, 4, 16, 1, true),
            new THREE.MeshBasicMaterial({
                color: 0x0088ff,
                transparent: true,
                opacity: 0.1,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            })
        );
        techGroup.add(techBeam);
        dummyRoot.add(techGroup);

        // 7. Clean up
        scene.clear();
        warmedUp = true;
    },

    isWarmedUp: () => warmedUp,
    reset: () => { warmedUp = false; lastSectorIndex = -1; },

    // Track sector persistence to allow instant-reloads
    getLastSectorIndex: () => lastSectorIndex,
    setLastSectorIndex: (idx: number) => { lastSectorIndex = idx; }
};
