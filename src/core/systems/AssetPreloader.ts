
import * as THREE from 'three';
import { GEOMETRY, MATERIALS, ModelFactory } from '../../utils/assets';
import { ZOMBIE_TYPES } from '../../content/constants';

export const AssetPreloader = {
    warmup: (renderer: THREE.WebGLRenderer, envConfig: any) => {
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
        // We place them behind the camera just in case, though this scene isn't rendered to screen
        const dummyRoot = new THREE.Group();
        dummyRoot.position.set(0, 0, -10);
        scene.add(dummyRoot);

        // -- Particles & Projectiles --
        const matKeys = Object.keys(MATERIALS) as (keyof typeof MATERIALS)[];
        matKeys.forEach(k => {
            const mat = MATERIALS[k];
            // Skip large ground/road textures to save time, focus on common shaders
            if (k === 'road' || k === 'asphalt' || k === 'snow' || k === 'concrete') return;

            const mesh = new THREE.Mesh(GEOMETRY.box, mat);
            dummyRoot.add(mesh);

            // If it's a transparent/emissive material, also test on a plane/sphere
            if (mat instanceof THREE.MeshBasicMaterial && mat.transparent) {
                const p = new THREE.Mesh(GEOMETRY.plane, mat);
                dummyRoot.add(p);
            }
        });

        // -- Specific Weapon Geometries --
        // These often have different shader requirements than boxes
        const bullet = new THREE.Mesh(GEOMETRY.bullet, MATERIALS.bullet);
        dummyRoot.add(bullet);
        const grenade = new THREE.Mesh(GEOMETRY.grenade, MATERIALS.grenade);
        dummyRoot.add(grenade);
        const molotov = new THREE.Mesh(GEOMETRY.molotov, MATERIALS.molotov);
        dummyRoot.add(molotov);
        const landingMarker = new THREE.Mesh(GEOMETRY.landingMarker, MATERIALS.landingMarker);
        dummyRoot.add(landingMarker);

        // -- Characters (Skinned Meshes / Groups) --
        // Player
        const player = ModelFactory.createPlayer();
        dummyRoot.add(player);

        // Enemies
        Object.keys(ZOMBIE_TYPES).forEach(type => {
            const z = ModelFactory.createZombie(type, ZOMBIE_TYPES[type as keyof typeof ZOMBIE_TYPES], false);
            dummyRoot.add(z);
        });

        // Boss (Generic placeholder using Boss 0 data to warm up boss shaders)
        const boss = ModelFactory.createZombie('Boss', { color: 0xff0000, scale: 3 } as any, true);
        dummyRoot.add(boss);

        // -- Environmental Props --
        // Trunk & Stylized Foliage
        const trunk = new THREE.Mesh(GEOMETRY.treeTrunk, MATERIALS.treeTrunk);
        dummyRoot.add(trunk);
        const foliage = new THREE.Mesh(GEOMETRY.foliageCluster, MATERIALS.treeLeaves);
        dummyRoot.add(foliage);

        // Interactive Props
        const barrel = new THREE.Mesh(GEOMETRY.barrel, MATERIALS.barrel);
        dummyRoot.add(barrel);
        const explosiveBarrel = new THREE.Mesh(GEOMETRY.barrel, MATERIALS.barrelExplosive);
        dummyRoot.add(explosiveBarrel);
        const chest = new THREE.Mesh(GEOMETRY.chestBody, MATERIALS.chestStandard);
        dummyRoot.add(chest);
        const scrap = new THREE.Mesh(GEOMETRY.scrap, MATERIALS.scrap);
        dummyRoot.add(scrap);

        // -- Weather & Effects --
        const fog = new THREE.Mesh(GEOMETRY.fogParticle, MATERIALS.fog);
        dummyRoot.add(fog);
        const ash = new THREE.Mesh(GEOMETRY.ashPile, MATERIALS.ash);
        dummyRoot.add(ash);

        // Decals (Directly on plane)
        const blood = new THREE.Mesh(GEOMETRY.decal, MATERIALS.bloodDecal);
        dummyRoot.add(blood);
        const scorch = new THREE.Mesh(GEOMETRY.decal, MATERIALS.scorchDecal);
        dummyRoot.add(scorch);

        // -- Narrative / Quest Items & Collectibles --
        const ring = new THREE.Mesh(GEOMETRY.familyRing, MATERIALS.familyRing);
        dummyRoot.add(ring);

        const collectibleTypes = ['phone', 'pacifier', 'axe', 'scarf', 'jacket', 'badge', 'diary', 'ring', 'teddy'];
        collectibleTypes.forEach(type => {
            const model = ModelFactory.createCollectible(type);
            dummyRoot.add(model);
        });

        // 3. Force Compilation
        // renderer.compile is the magic method added in newer Three.js versions to avoid jank
        try {
            renderer.compile(scene, camera);
        } catch (e) {
            console.warn("Shader warmup failed", e);
        }

        // 4. Clean up
        // We remove objects from the scene to drop CPU references, 
        // but the compiled programs remain on the GPU context.
        scene.traverse((obj) => {
            // Do NOT dispose geometry/materials here, as they are shared global assets
            // We only want to dismantle the scene graph
        });

        scene.clear();
    }
};
