
import * as THREE from 'three';
import { GEOMETRY, MATERIALS, ModelFactory } from '../../utils/assets';
import { ZOMBIE_TYPES } from '../../constants';

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
            // Create a mesh for every material to force compilation
            const mesh = new THREE.Mesh(GEOMETRY.box, MATERIALS[k]);
            dummyRoot.add(mesh);
        });

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
        // Force specific geometries that might not share materials directly with particles
        const tree = new THREE.Mesh(GEOMETRY.treeLeaves, MATERIALS.treeLeaves);
        dummyRoot.add(tree);
        const rock = new THREE.Mesh(GEOMETRY.stone, MATERIALS.stone);
        dummyRoot.add(rock);

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
