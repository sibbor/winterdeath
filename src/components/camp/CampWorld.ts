import * as THREE from 'three';
import { GEOMETRY, MATERIALS, ModelFactory } from '../../utils/assets';
import { EnvironmentGenerator } from '../../core/world/EnvironmentGenerator';
import { WinterEngine } from '../../core/engine/WinterEngine';
import { WIND_SYSTEM, WEATHER_SYSTEM } from '../../content/constants';
import { WeatherType } from '../../core/engine/EngineTypes';
import { LogicalLight } from '../../systems/LightSystem';

// ============================================================================
// CONFIGURATION CONSTANTS (Source of truth for Camp & AssetPreloader)
// ============================================================================
export const CAMP_SCENE = {
    starCount: 1200,

    // Fog & Background
    bgColor: 0x161629,
    fog: {
        color: 0x999999, //161629,
        density: 100,
        height: 2
    },
    ambientIntensity: 0.4,
    skyLight: {
        visible: true,
        color: 0xaaccff,
        intensity: 0.4
    },

    // Cameras
    cameraBaseLookAt: new THREE.Vector3(0, 2, -5),
    cameraCinematicLookAt: new THREE.Vector3(0, 8, -5),

    // Lighting
    hemiLight: { sky: 0x444455, ground: 0x111115, intensity: 0.6 },
    dirLight: { color: 0xaaccff, intensity: 0.4, bias: -0.0002 },
    campfireLight: {
        color: 0xff7722,
        intensity: 40,
        distance: 90,
        bias: -0.0005,
        normalBias: 0.02,
        castShadow: true,
        shadowMapSizeWidth: 512,
        shadowMapSizeHeight: 512
    },

    // Stations & Interaction
    interactionRadius: 7.5,
    stationPositions: [
        { id: 'armory', pos: new THREE.Vector3(-6, 0, -3.75) },
        { id: 'sectors', pos: new THREE.Vector3(2.25, 0, -7.125) },
        { id: 'skills', pos: new THREE.Vector3(6, 0, -3.75) },
        { id: 'adventure_log', pos: new THREE.Vector3(-2.25, 0, -7.125) }
    ],

    // Global Colors (Centralized from hardcoded instances)
    colors: {
        white: 0xffffff,
        black: 0x000000,
        darkGrey: 0x111111,
        paper: 0xffffee,
        gold: 0xffff00,
        green: 0x00ff00,
        red: 0xff0000,
        purple: 0xaa00ff,
        moon: 0xffffeb,
        moonHalo: 0xffffee,
        campfireAsh: 0x111111,
        campfireStone: 0x888888,
        campfireLog: 0x5e3723,
        campfireFlame: 0xff5500,
        campfireSpark: 0xffaa00,
        campfireSmoke: 0x333333
    }
};

interface Textures {
    gravel: THREE.Texture;
    stone: THREE.Texture;
    wood: THREE.Texture;
    pine: THREE.Texture;
    halo: THREE.Texture;
    moon_halo?: THREE.Texture;
    tacticalMap: THREE.Texture;
}

export interface CampEffectsState {
    particles: {
        flames: THREE.InstancedMesh;
        sparkles: THREE.InstancedMesh;
        smokes: THREE.InstancedMesh;
        // Zero-GC state buffers: [life, vy, vx, vz, speed, ...]
        flameData: Float32Array;
        sparkleData: Float32Array;
        smokeData: Float32Array;
    };
    starSystem: THREE.Points;
    fireLight: LogicalLight;
}

const _m1 = new THREE.Matrix4();
const _v1 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _s1 = new THREE.Vector3();
const _e1 = new THREE.Euler();
const _traverseStack: THREE.Object3D[] = [];

const FLAME_VARS = 8; // [life, px, py, pz, speed, rx, ry, rz]
const SPARKLE_VARS = 7; // [life, px, py, pz, vx, vy, vz]
const SMOKE_VARS = 5; // [life, px, py, pz, speed]
const _c1 = new THREE.Color();
const _flameStartColor = new THREE.Color(0xffaa22);
const _flameEndColor = new THREE.Color(0xff2200);

// ============================================================================
// SHARED CONSTANTS (Internal use)
// ============================================================================
export const CONST_GEO = {
    flame: new THREE.DodecahedronGeometry(0.6),
    spark: new THREE.BoxGeometry(0.05, 0.05, 0.05),
    smoke: new THREE.PlaneGeometry(1, 1) // Using plane for soft sprite behavior
};

export const CONST_MAT = {
    flame: new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    }),
    spark: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    smoke: new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1.0,
        depthWrite: false,
        side: THREE.DoubleSide
    })
};

// Tag materials as shared assets to prevent disposal during clearActiveScene
for (const key in CONST_MAT) {
    (CONST_MAT as any)[key].userData = { isSharedAsset: true };
}

// --- PROCEDURAL TEXTURES ---
const createSmokeTexture = () => {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.6)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.3)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
};
CONST_MAT.smoke.map = createSmokeTexture();

// Inject custom instanceAlpha support into smoke material
CONST_MAT.smoke.onBeforeCompile = (shader) => {
    shader.vertexShader = `
        attribute float instanceAlpha;
        varying float vInstanceAlpha;
        ${shader.vertexShader}
    `.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vInstanceAlpha = instanceAlpha;`
    );
    shader.fragmentShader = `
        varying float vInstanceAlpha;
        ${shader.fragmentShader}
    `.replace(
        '#include <output_fragment>',
        'gl_FragColor.a *= vInstanceAlpha; #include <output_fragment>'
    );
};

// --- PERSISTENT CACHE ---
export const stationTextures: Record<string, THREE.CanvasTexture> = {};
export const stationGeometries: Record<string, THREE.BufferGeometry> = {};
export const stationMaterials: Record<string, THREE.MeshStandardMaterial> = {
    warmWood: new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.8 }),
    darkerWood: new THREE.MeshStandardMaterial({ color: 0x5A3210, roughness: 0.9 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 }),
    ammoGreen: new THREE.MeshStandardMaterial({ color: 0x335533, roughness: 0.6 }),
    medkitRed: new THREE.MeshStandardMaterial({ color: 0xcc0000 })
};

// Tag station materials as shared assets
for (const key in stationMaterials) {
    (stationMaterials as any)[key].userData = { isSharedAsset: true };
}

const CAMP_ENV_CACHE = {
    sky: null as any,
    fire: null as any
};

let cachedTerrainMat: THREE.MeshStandardMaterial | null = null;

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

const getCachedCanvasTexture = (width: number, height: number, type: 'map' | 'note') => {
    const key = `${type}_${width}x${height}`;
    if (stationTextures[key]) return stationTextures[key];

    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = type === 'map' ? '#e3d5b8' : '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#332211'; ctx.lineWidth = 2;

    if (type === 'map') {
        for (let i = 0; i < 8; i++) {
            ctx.beginPath();
            ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 30, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(width / 2 - 20, height / 2 - 20); ctx.lineTo(width / 2 + 20, height / 2 + 20); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(width / 2 + 20, height / 2 - 20); ctx.lineTo(width / 2 - 20, height / 2 + 20); ctx.stroke();
    } else {
        ctx.strokeStyle = '#777777';
        for (let i = 1; i < 6; i++) {
            ctx.beginPath(); ctx.moveTo(10, i * 20); ctx.lineTo(width - 10, i * 20); ctx.stroke();
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    stationTextures[key] = tex;
    return tex;
};

const createOutline = (geo: THREE.BufferGeometry, color: number) => {
    const edges = new THREE.EdgesGeometry(geo);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
    line.visible = false;
    return line;
};

const setupTrees = async (scene: THREE.Scene) => {
    let seed = 12345;
    const srandom = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const treeInstances: { x: number, z: number, scale: number, darken: number }[] = [];

    for (let i = 0; i < 60; i++) {
        const x = (srandom() - 0.5) * 120;
        const z = -45 - srandom() * 80;
        let scale = 1.0 + srandom() * 2.5;
        treeInstances.push({ x, z, scale, darken: 0.12 });
    }

    for (let i = 0; i < 40; i++) {
        const z = -15 - srandom() * 25;
        const zFactor = (z + 15) / -45;
        const maxX = 35 - (zFactor * 20);
        const x = (srandom() - 0.5) * 2 * maxX;
        if (Math.abs(x) < 2) continue;
        let scale = 1.1 + srandom() * 0.9;
        if (x < -15 && x > -20) scale *= 0.6;
        treeInstances.push({ x, z, scale, darken: 1.0 });
    }

    treeInstances.push({ x: -15, z: 2, scale: 1.8, darken: 1.0 });
    treeInstances.push({ x: 15, z: 2, scale: 1.8, darken: 1.0 });
    treeInstances.push({ x: 0, z: -16, scale: 1, darken: 1.0 });

    await EnvironmentGenerator.initNaturePrototypes();
    const normalMatrices: Record<string, THREE.Matrix4[]> = {};
    const darkMatrices: Record<string, THREE.Matrix4[]> = {};
    const dummy = new THREE.Object3D();

    for (let i = 0; i < treeInstances.length; i++) {
        const inst = treeInstances[i];
        dummy.position.set(inst.x, -2.0, inst.z);
        dummy.rotation.set(0, srandom() * Math.PI * 2, 0);
        dummy.scale.setScalar(inst.scale);
        dummy.updateMatrix();

        const variantIdx = Math.floor(Math.abs(inst.x + inst.z)) % 3;
        const key = `PINE_${variantIdx}`;

        if (inst.darken < 0.5) {
            if (!darkMatrices[key]) darkMatrices[key] = [];
            darkMatrices[key].push(new THREE.Matrix4().copy(dummy.matrix));
        } else {
            if (!normalMatrices[key]) normalMatrices[key] = [];
            normalMatrices[key].push(new THREE.Matrix4().copy(dummy.matrix));
        }
    }

    const silhouetteMat = MATERIALS.treeSilhouette;
    for (const key in normalMatrices) EnvironmentGenerator.addInstancedTrees({ scene } as any, key, normalMatrices[key]);
    for (const key in darkMatrices) EnvironmentGenerator.addInstancedTrees({ scene } as any, key, darkMatrices[key], silhouetteMat);
};

const setupSky = (scene: THREE.Object3D, textures: Textures, isWarmup = false) => {
    // 1. Generate or reuse cached heavy assets (Zero-GC approach)
    if (!CAMP_ENV_CACHE.sky) {
        const skyGeo = new THREE.SphereGeometry(15, 32, 32);
        const skyMat = new THREE.MeshBasicMaterial({ color: CAMP_SCENE.colors.moon, fog: false });

        const moonHaloMat = new THREE.SpriteMaterial({
            map: textures.halo || textures.moon_halo || null, color: CAMP_SCENE.colors.moonHalo, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, fog: false, depthWrite: false
        });

        // Pre-calculate stars once
        const starCount = CAMP_SCENE.starCount;
        const starGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const sizes = new Float32Array(starCount);
        const phases = new Float32Array(starCount);
        const twinkleSpeeds = new Float32Array(starCount);

        for (let i = 0; i < starCount; i++) {
            const r = 1800 + Math.random() * 200;
            const theta = Math.random() * Math.PI * 2;
            const phi = (Math.PI / 2) - Math.random() * 1.2;
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.cos(phi);
            positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
            sizes[i] = Math.random() > 0.95 ? 3.0 : (Math.random() > 0.85 ? 2.5 : 2.0);
            phases[i] = Math.random() * Math.PI * 2;
            twinkleSpeeds[i] = Math.random() > 0.9 ? 0.3 + Math.random() * 0.4 : 0.0;
        }

        starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        starGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        starGeo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
        starGeo.setAttribute('twinkleSpeed', new THREE.BufferAttribute(twinkleSpeeds, 1));

        const starMat = new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 } },
            vertexShader: `
                attribute float size; attribute float phase; attribute float twinkleSpeed; varying float vAlpha; uniform float uTime;
                void main() {
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
                    float alpha = 0.8 + 0.2 * sin(phase);
                    if (twinkleSpeed > 0.0) alpha = 0.9 + 0.1 * sin(uTime * twinkleSpeed + phase);
                    vAlpha = alpha; gl_PointSize = size * (2500.0 / -mvPosition.z);
                }
            `,
            fragmentShader: `varying float vAlpha; void main() { vec2 coord = gl_PointCoord - vec2(0.5); if(length(coord) > 0.5) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, vAlpha); }`,
            transparent: true, depthWrite: false,
        });

        // Tag to prevent disposal sweeps if any global GC runs
        skyGeo.userData = { isSharedAsset: true };
        skyMat.userData = { isSharedAsset: true };
        starGeo.userData = { isSharedAsset: true };
        starMat.userData = { isSharedAsset: true };

        CAMP_ENV_CACHE.sky = { skyGeo, skyMat, moonHaloMat, starGeo, starMat };
    }

    const { skyGeo, skyMat, moonHaloMat, starGeo, starMat } = CAMP_ENV_CACHE.sky;

    // 2. Assemble Scene
    const skyBody = new THREE.Mesh(skyGeo, skyMat);
    skyBody.position.set(-120, 80, -350);
    scene.add(skyBody);

    const moonHaloSprite = new THREE.Sprite(moonHaloMat);
    moonHaloSprite.scale.set(120, 120, 1);
    moonHaloSprite.position.copy(skyBody.position);
    scene.add(moonHaloSprite);

    const starSystem = new THREE.Points(starGeo, starMat);
    starSystem.rotation.z = 0.1;
    scene.add(starSystem);

    const skyLight = new THREE.DirectionalLight(CAMP_SCENE.skyLight.color, CAMP_SCENE.skyLight.intensity);
    skyLight.name = 'SKY_LIGHT';
    skyLight.position.set(-80, 150, -100);
    skyLight.castShadow = true;
    skyLight.shadow.mapSize.width = 1024;
    skyLight.shadow.mapSize.height = 1024;
    skyLight.shadow.camera.near = 0.5;
    skyLight.shadow.camera.far = 1000;
    skyLight.shadow.camera.left = -100;
    skyLight.shadow.camera.right = 100;
    skyLight.shadow.camera.top = 100;
    skyLight.shadow.camera.bottom = -100;
    skyLight.shadow.bias = CAMP_SCENE.dirLight.bias;
    scene.add(skyLight);

    return {
        objects: { moon: skyBody, halo: moonHaloSprite, stars: starSystem, light: skyLight },
        geometries: { moon: skyGeo, stars: starGeo },
        materials: { moon: skyMat, halo: moonHaloMat, stars: starMat }
    };
};

const setupCampfire = (scene: THREE.Scene, textures: Textures, isWarmup = false) => {

    // 1. Cache Geometries and Materials (Zero-GC)
    if (!CAMP_ENV_CACHE.fire) {
        CAMP_ENV_CACHE.fire = {
            ashGeo: new THREE.CircleGeometry(1.8, 16),
            ashMat: new THREE.MeshStandardMaterial({ color: CAMP_SCENE.colors.campfireAsh }),
            stoneGeo: new THREE.DodecahedronGeometry(0.4),
            stoneMat: new THREE.MeshStandardMaterial({ color: CAMP_SCENE.colors.campfireStone, roughness: 0.9 }),
            logGeo: new THREE.CylinderGeometry(0.15, 0.15, 2.2),
            logMat: new THREE.MeshStandardMaterial({ color: CAMP_SCENE.colors.campfireLog })
        };
    }

    const cache = CAMP_ENV_CACHE.fire;

    // Assign textures if not already done
    if (!cache.stoneMat.map) {
        cache.stoneMat.map = textures.stone;
        cache.stoneMat.needsUpdate = true;
    }
    if (!cache.logMat.map) {
        cache.logMat.map = textures.wood;
        cache.logMat.needsUpdate = true;
    }

    // 2. Build the visual meshes
    const fireGroup = new THREE.Group();

    const ash = new THREE.Mesh(cache.ashGeo, cache.ashMat);
    ash.rotation.x = -Math.PI / 2;
    ash.position.y = 0.02;
    fireGroup.add(ash);

    for (let i = 0; i < 15; i++) {
        const s = new THREE.Mesh(cache.stoneGeo, cache.stoneMat);
        const angle = (i / 15) * Math.PI * 2;
        s.position.set(Math.cos(angle) * 1.5, 0.15, Math.sin(angle) * 1.5);
        s.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        fireGroup.add(s);
    }

    for (let i = 0; i < 4; i++) {
        const log = new THREE.Mesh(cache.logGeo, cache.logMat);
        log.position.y = 0.25;
        log.rotation.z = Math.PI / 2;
        log.rotation.y = (i / 4) * Math.PI * 2 + Math.PI / 4;
        fireGroup.add(log);
    }

    scene.add(fireGroup);

    // Logical Light - handled by LightSystem
    /*
    OLD POINT LIGHT CONVERTED TO LOGICAL LIGHT:
    const fireLight = new THREE.PointLight(
            CAMP_SCENE.campfireLight.color,
            CAMP_SCENE.campfireLight.intensity,
            CAMP_SCENE.campfireLight.distance
        );
    fireLight.position.set(0, 3, 0);
    fireLight.castShadow = CAMP_SCENE.campfireLight.castShadow;
    fireLight.shadow.mapSize.width = CAMP_SCENE.campfireLight.shadowMapSizeWidth;
    fireLight.shadow.mapSize.height = CAMP_SCENE.campfireLight.shadowMapSizeHeight;
    fireLight.shadow.bias = CAMP_SCENE.campfireLight.bias;
    fireLight.shadow.normalBias = CAMP_SCENE.campfireLight.normalBias;
    */
    const fireLightData: LogicalLight = {
        isLogicalLight: true,
        position: new THREE.Vector3(0, 3, 0), // Mid-fire height
        color: CAMP_SCENE.campfireLight.color,
        intensity: CAMP_SCENE.campfireLight.intensity,
        distance: CAMP_SCENE.campfireLight.distance,
        flickerRate: 0.08,    // Subtle staccato
        flickerSpeed: 0.012,  // Smooth pulse speed
        flickerSpread: 6.0,   // Smooth pulse amplitude (15% of 40)

        // Shadow Specs
        castShadow: CAMP_SCENE.campfireLight.castShadow,
        shadowBias: CAMP_SCENE.campfireLight.bias,
        shadowNormalBias: CAMP_SCENE.campfireLight.normalBias,
        shadowMapSize: CAMP_SCENE.campfireLight.shadowMapSizeWidth
    };

    return fireLightData;
};

// ============================================================================
// EXPORTED MODULE: CampWorld
// ============================================================================
export const CampWorld = {

    setupSky,

    build: async (scene: THREE.Scene, textures: Textures, weather: WeatherType, isWarmup = false) => {

        if (!isWarmup) {
            const engine = WinterEngine.getInstance();

            // Clear SAFE! Keep FogSystem, WeatherSystem and WaterSystem intact
            engine.clearActiveScene(false);

            const camera = engine.camera;

            camera.reset();
            camera.setPosition(0, 10, 22, true);
            camera.set('fov', 50);
            camera.set('far', 2500);
            camera.lookAt(CAMP_SCENE.cameraBaseLookAt.x, CAMP_SCENE.cameraBaseLookAt.y, CAMP_SCENE.cameraBaseLookAt.z, true);

            // --- FOG SYSTEM INTEGRATION ---
            const fogConfig = CAMP_SCENE.fog || { color: CAMP_SCENE.bgColor, density: 25, height: 22.0 };
            const fogColorHex = fogConfig.color !== undefined ? fogConfig.color : CAMP_SCENE.bgColor;
            const fogColor = new THREE.Color(fogColorHex);

            const volDensity = fogConfig.density;
            const fogHeight = fogConfig.height !== undefined ? fogConfig.height : 22.0;

            if (engine.settings.volumetricFog) {
                // Modern fog
                if (engine.fog) engine.fog.sync(volDensity, fogHeight, fogColor);

                if (volDensity > 0) {
                    scene.fog = new THREE.FogExp2(fogColorHex, volDensity * 0.0001);
                } else {
                    scene.fog = null;
                }
            } else {
                // Fallback fog
                if (engine.fog) engine.fog.sync(0, undefined, fogColor);

                if (volDensity > 0) {
                    const fallbackDensity = volDensity < 1.0 ? volDensity : volDensity * 0.0005;
                    scene.fog = new THREE.FogExp2(fogColorHex, fallbackDensity);
                } else {
                    scene.fog = null;
                }
            }
        } else {
            // Safe fallback for warmup phase (AssetPreloader)
            const fogConfig = CAMP_SCENE.fog || { color: CAMP_SCENE.bgColor, density: 25 };
            const fogColorHex = fogConfig.color !== undefined ? fogConfig.color : CAMP_SCENE.bgColor;
            const volDensity = fogConfig.density;
            const fallbackDensity = volDensity < 1.0 ? volDensity : volDensity * 0.0005;
            scene.fog = new THREE.FogExp2(fogColorHex, fallbackDensity);
        }

        scene.background = new THREE.Color(CAMP_SCENE.bgColor);

        const hemiLight = new THREE.HemisphereLight(
            CAMP_SCENE.hemiLight.sky,
            CAMP_SCENE.hemiLight.ground,
            CAMP_SCENE.hemiLight.intensity
        );
        scene.add(hemiLight);

        CampWorld.setupTerrain(scene, textures);

        const { interactables, outlines } = CampWorld.setupStations(scene, textures, CAMP_SCENE.stationPositions);

        const envState = CampWorld.initEffects(scene, textures, weather, isWarmup);

        return { interactables, outlines, envState };
    },

    setupTerrain: (scene: THREE.Scene, textures: Textures) => {
        if (!cachedTerrainMat) {
            cachedTerrainMat = new THREE.MeshStandardMaterial().copy(MATERIALS.dirt as THREE.MeshStandardMaterial);
            cachedTerrainMat.userData = { isSharedAsset: true };
        }

        if (cachedTerrainMat.map && cachedTerrainMat.map.repeat.x !== 60) {
            cachedTerrainMat.map.repeat.set(60, 60);
        }
        if (cachedTerrainMat.bumpMap && cachedTerrainMat.bumpMap.repeat.x !== 60) {
            cachedTerrainMat.bumpMap.repeat.set(60, 60);
        }

        const groundGeo = new THREE.PlaneGeometry(120, 120);
        const ground = new THREE.Mesh(groundGeo, cachedTerrainMat);

        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        setupTrees(scene);
    },

    setupStations: (scene: THREE.Scene, textures: Textures, stationsPos: { id: string, pos: THREE.Vector3 }[]) => {
        const interactables: THREE.Mesh[] = [];
        const outlines: Record<string, THREE.LineSegments> = {};
        const { warmWood: warmWoodMat, darkerWood: darkerWoodMat, metal: metalMat, ammoGreen: ammoGreenMat } = stationMaterials;

        const rackGroup = new THREE.Group();
        const p1 = new THREE.Mesh(GEOMETRY.box, darkerWoodMat); p1.scale.set(0.2, 4.0, 0.2); p1.position.set(-1.8, 2, -0.4); rackGroup.add(p1);
        const p2 = new THREE.Mesh(GEOMETRY.box, darkerWoodMat); p2.scale.set(0.2, 4.0, 0.2); p2.position.set(1.8, 2, -0.4); rackGroup.add(p2);
        for (let i = 0; i < 5; i++) {
            const slat = new THREE.Mesh(GEOMETRY.box, warmWoodMat);
            slat.scale.set(3.6, 0.3, 0.1);
            slat.position.set(0, 0.8 + i * 0.7, -0.4); rackGroup.add(slat);
        }

        const barrelGeo = stationGeometries.barrel || new THREE.CylinderGeometry(0.03, 0.03, 1.2);
        stationGeometries.barrel = barrelGeo;
        for (let i = 0; i < 4; i++) {
            const gun = new THREE.Group();
            const body = new THREE.Mesh(GEOMETRY.box, metalMat);
            body.scale.set(0.2, 1.4, 0.15);
            gun.add(body);
            const barrel = new THREE.Mesh(barrelGeo, metalMat);
            barrel.position.y = 1.3;
            gun.add(barrel);
            gun.position.set(-1.2 + i * 0.8, 0.7, 0.2);
            gun.rotation.x = -0.25;
            rackGroup.add(gun);
        }

        const c1 = new THREE.Mesh(GEOMETRY.box, ammoGreenMat); c1.scale.set(0.8, 0.5, 0.6); c1.position.set(-2.0, 0.25, 0.6); c1.rotation.y = 0.3; rackGroup.add(c1);
        const c2 = new THREE.Mesh(GEOMETRY.box, ammoGreenMat); c2.scale.set(0.8, 0.5, 0.6); c2.position.set(-0.9, 0.25, 0.4); c2.rotation.y = 1.4; rackGroup.add(c2);
        const c3 = new THREE.Mesh(GEOMETRY.box, ammoGreenMat); c3.scale.set(0.8, 0.5, 0.6); c3.position.set(-1.8, 0.75, 0.65); c3.rotation.y = 0.6; rackGroup.add(c3);

        const deskGroup = new THREE.Group();
        const dW = 2.4, dD = 1.4, dH = 1.1;
        const dTop = new THREE.Mesh(GEOMETRY.box, warmWoodMat);
        dTop.scale.set(dW, 0.1, dD);
        dTop.position.y = dH; deskGroup.add(dTop);
        const legPositions = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
        for (let i = 0; i < legPositions.length; i++) {
            const p = legPositions[i];
            const l = new THREE.Mesh(GEOMETRY.box, darkerWoodMat);
            l.scale.set(0.15, dH, 0.15);
            l.position.set(p[0] * (dW / 2 - 0.2), dH / 2, p[1] * (dD / 2 - 0.2));
            deskGroup.add(l);
        }
        for (let i = 0; i < 3; i++) {
            const b = new THREE.Mesh(GEOMETRY.box, new THREE.MeshStandardMaterial({ color: 0x442211 + i * 0x111111 }));
            b.scale.set(0.7, 0.12, 0.9);
            b.position.set(-0.6, dH + 0.06 + (i * 0.13), -0.1);
            b.rotation.y = (Math.random() - 0.5) * 0.4;
            deskGroup.add(b);
        }
        const openBook = new THREE.Group();
        const paperMat = new THREE.MeshStandardMaterial({ color: 0xffffee, roughness: 0.9 });
        const coverMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.8 });
        const cover = new THREE.Mesh(GEOMETRY.box, coverMat);
        cover.scale.set(0.9, 0.04, 0.7);
        openBook.add(cover);
        const pageL = new THREE.Mesh(GEOMETRY.box, paperMat); pageL.scale.set(0.42, 0.03, 0.65); pageL.position.set(-0.2, 0.15, 0); pageL.rotation.z = 0.15; openBook.add(pageL);
        const pageR = new THREE.Mesh(GEOMETRY.box, paperMat); pageR.scale.set(0.42, 0.03, 0.65); pageR.position.set(0.2, 0.15, 0); pageR.rotation.z = -0.15; openBook.add(pageR);
        openBook.position.set(0.6, dH + 0.02, 0.3); openBook.rotation.y = -0.3; deskGroup.add(openBook);

        const mapGroup = new THREE.Group();
        const bW = 3.5, bH = 2.2;
        const mL = new THREE.Mesh(GEOMETRY.box, darkerWoodMat); mL.scale.set(0.2, 4.0, 0.2); mL.position.set(-bW / 2, 2, 0); mapGroup.add(mL);
        const mR = new THREE.Mesh(GEOMETRY.box, darkerWoodMat); mR.scale.set(0.2, 4.0, 0.2); mR.position.set(bW / 2, 2, 0); mapGroup.add(mR);
        const board = new THREE.Mesh(GEOMETRY.box, warmWoodMat); board.scale.set(bW, bH, 0.1); board.position.y = 2.8; mapGroup.add(board);
        const mapGeo = stationGeometries.map_plane || new THREE.PlaneGeometry(2.0, 1.4);
        stationGeometries.map_plane = mapGeo;
        const map = new THREE.Mesh(mapGeo, new THREE.MeshStandardMaterial({ map: getCachedCanvasTexture(256, 256, 'map') }));
        map.position.set(0, 2.8, 0.06); mapGroup.add(map);
        const noteTex = getCachedCanvasTexture(128, 128, 'note');
        const noteGeo = stationGeometries.note_plane || new THREE.PlaneGeometry(0.4, 0.5);
        stationGeometries.note_plane = noteGeo;
        for (let i = 0; i < 3; i++) {
            const note = new THREE.Mesh(noteGeo, new THREE.MeshStandardMaterial({ map: noteTex, transparent: true }));
            const angle = (i / 4) * Math.PI * 2;
            note.position.set(Math.cos(angle) * 1.2, 2.8 + Math.sin(angle) * 0.7, 0.8);
            note.rotation.z = (Math.random() - 0.5) * 1.2;
            mapGroup.add(note);
        }

        const medGroup = new THREE.Group();
        const cH = 5.0, cW = 2.0, cD = 0.8, th = 0.1;
        const back = new THREE.Mesh(GEOMETRY.box, warmWoodMat); back.scale.set(cW, cH, th); back.position.set(0, cH / 2, -cD / 2 + th / 2); medGroup.add(back);
        const sL = new THREE.Mesh(GEOMETRY.box, warmWoodMat); sL.scale.set(th, cH, cD); sL.position.set(-cW / 2 + th / 2, cH / 2, 0); medGroup.add(sL);
        const sR = new THREE.Mesh(GEOMETRY.box, warmWoodMat); sR.scale.set(th, cH, cD); sR.position.set(cW / 2 - th / 2, cH / 2, 0); medGroup.add(sR);
        const top = new THREE.Mesh(GEOMETRY.box, warmWoodMat); top.scale.set(cW, th, cD); top.position.set(0, cH - th / 2, 0); medGroup.add(top);
        const bot = new THREE.Mesh(GEOMETRY.box, warmWoodMat); bot.scale.set(cW, th, cD); bot.position.set(0, th / 2, 0); medGroup.add(bot);
        const cDoor = new THREE.Mesh(GEOMETRY.box, darkerWoodMat); cDoor.scale.set(cW - 0.1, cH * 0.3, th); cDoor.position.set(0, cH * 0.15, cD / 2); medGroup.add(cDoor);
        for (let h = 0; h < 3; h++) {
            const yBase = cH * 0.4 + (h * 1.0);
            const shelf = new THREE.Mesh(GEOMETRY.box, darkerWoodMat); shelf.scale.set(cW - th * 2, th / 2, cD - th); shelf.position.set(0, yBase, 0); medGroup.add(shelf);
            for (let f = 0; f < 3; f++) {
                const isRound = Math.random() > 0.5;
                const bMat = new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff, transparent: true, opacity: 0.8 });
                const b = new THREE.Mesh(isRound ? new THREE.SphereGeometry(0.12, 8, 8) : new THREE.BoxGeometry(0.15, 0.4, 0.15), bMat);
                b.position.set(-0.7 + f * 0.28, yBase + 0.25, 0);
                medGroup.add(b);
                if (isRound) {
                    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2), bMat);
                    neck.position.set(b.position.x, b.position.y + 0.15, b.position.z); medGroup.add(neck);
                }
            }
        }
        const medkit = new THREE.Group();
        const box = new THREE.Mesh(GEOMETRY.box, new THREE.MeshStandardMaterial({ color: 0xcc0000 })); box.scale.set(0.7, 0.4, 0.4); medkit.add(box);
        const crossMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const crossV = new THREE.Mesh(GEOMETRY.box, crossMat); crossV.scale.set(0.15, 0.35, 0.42); crossV.position.set(0, 0, 0.01); medkit.add(crossV);
        const crossH = new THREE.Mesh(GEOMETRY.box, crossMat); crossH.scale.set(0.35, 0.15, 0.42); crossH.position.set(0, 0, 0.01); medkit.add(crossH);
        medkit.position.set(0.5, cH * 0.4 + 0.25, 0); medGroup.add(medkit);

        const rad = 7.5;
        rackGroup.position.set(-rad * 0.8, 0, -rad * 0.5); rackGroup.lookAt(0, 0, 0); scene.add(rackGroup);
        deskGroup.position.set(-rad * 0.3, 0, -rad * 0.95); deskGroup.lookAt(0, 0, 0); scene.add(deskGroup);
        mapGroup.position.set(rad * 0.3, 0, -rad * 0.95); mapGroup.lookAt(0, 0, 0); scene.add(mapGroup);
        medGroup.position.set(rad * 0.8, 0, -rad * 0.5); medGroup.lookAt(0, 0, 0); scene.add(medGroup);

        const rackInteract = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 2), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0 }));
        rackInteract.position.y = 2; rackInteract.userData = { id: 'armory', name: 'armory' }; rackGroup.add(rackInteract); interactables.push(rackInteract);
        const rackOutline = createOutline(new THREE.BoxGeometry(4, 4, 2), CAMP_SCENE.colors.gold); rackOutline.position.y = 2; rackGroup.add(rackOutline); outlines['armory'] = rackOutline;

        const logInteract = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.5, 1.5), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0 }));
        logInteract.position.y = 0.75; logInteract.userData = { id: 'adventure_log', name: 'adventure_log' }; deskGroup.add(logInteract); interactables.push(logInteract);
        const logOutline = createOutline(new THREE.BoxGeometry(2.5, 1.5, 1.5), CAMP_SCENE.colors.green); logOutline.position.y = 0.75; deskGroup.add(logOutline); outlines['adventure_log'] = logOutline;

        const mapInteract = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 1), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0 }));
        mapInteract.position.y = 2; mapInteract.userData = { id: 'sectors', name: 'sectors' }; mapGroup.add(mapInteract); interactables.push(mapInteract);
        const mapOutline = createOutline(new THREE.BoxGeometry(4, 4, 1), CAMP_SCENE.colors.red); mapOutline.position.y = 2; mapGroup.add(mapOutline); outlines['sectors'] = mapOutline;

        const skillInteract = new THREE.Mesh(new THREE.BoxGeometry(2.5, 5, 2), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0 }));
        skillInteract.position.y = 2.5; skillInteract.userData = { id: 'skills', name: 'skills' }; medGroup.add(skillInteract); interactables.push(skillInteract);
        const skillOutline = createOutline(new THREE.BoxGeometry(2.5, 5, 2), CAMP_SCENE.colors.purple); skillOutline.position.y = 2.5; medGroup.add(skillOutline); outlines['skills'] = skillOutline;

        const stationGroups = [rackGroup, deskGroup, mapGroup, medGroup];
        for (let i = 0; i < stationGroups.length; i++) {
            _traverseStack.length = 0;
            _traverseStack.push(stationGroups[i]);

            while (_traverseStack.length > 0) {
                const c = _traverseStack.pop() as any;
                for (let childIdx = 0; childIdx < c.children.length; childIdx++) {
                    _traverseStack.push(c.children[childIdx]);
                }

                if (c.isMesh) {
                    c.castShadow = true;
                    c.userData = c.userData || {};
                    c.userData.isSharedAsset = true;
                }
            }
        }

        return { interactables, outlines };
    },

    initEffects: (scene: THREE.Scene, textures: Textures, weatherType: WeatherType, isWarmup = false): CampEffectsState => {
        const engine = WinterEngine.getInstance();

        if (!isWarmup) {
            engine.wind.setRandomWind(WIND_SYSTEM.MIN_STRENGTH, WIND_SYSTEM.MAX_STRENGTH);
            engine.weather.reAttach(scene);
            engine.weather.sync(weatherType, WEATHER_SYSTEM.DEFAULT_NUM_PARTICLES, 60);
        }

        const { objects: skyObjects } = CampWorld.setupSky(scene, textures, isWarmup);
        const starSystem = skyObjects.stars;
        const fireData = setupCampfire(scene, textures, isWarmup);

        const flameCount = 40;
        const flames = new THREE.InstancedMesh(CONST_GEO.flame, CONST_MAT.flame, flameCount);
        flames.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        flames.userData.isEngineStatic = true;
        scene.add(flames);
        const flameData = new Float32Array(flameCount * FLAME_VARS);

        const sparkleCount = 60;
        const sparkles = new THREE.InstancedMesh(CONST_GEO.spark, CONST_MAT.spark, sparkleCount);
        sparkles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        sparkles.userData.isEngineStatic = true;
        scene.add(sparkles);
        const sparkleData = new Float32Array(sparkleCount * SPARKLE_VARS);

        const smokeCount = 30;
        const smokes = new THREE.InstancedMesh(CONST_GEO.smoke, CONST_MAT.smoke, smokeCount);
        smokes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        smokes.userData.isEngineStatic = true;

        // Setup custom alpha attribute for smoke
        const smokeAlphas = new Float32Array(smokeCount);
        smokes.geometry.setAttribute('instanceAlpha', new THREE.InstancedBufferAttribute(smokeAlphas, 1));

        scene.add(smokes);
        const smokeData = new Float32Array(smokeCount * SMOKE_VARS);

        const state: CampEffectsState = {
            particles: { flames, sparkles, smokes, flameData, sparkleData, smokeData },
            starSystem,
            fireLight: fireData
        };

        // Pre-warm the simulation
        for (let i = 0; i < 20; i++) {
            CampWorld.updateEffects(scene, state, 0.016, i * 0.016, i);
        }
        return state;
    },

    updateEffects: (scene: THREE.Scene, state: CampEffectsState, delta: number, now: number, frame: number) => {
        const engine = WinterEngine.getInstance();
        const wind = engine.wind.current;
        const camera = engine.camera.threeCamera;

        if (state.starSystem) {
            (state.starSystem.material as THREE.ShaderMaterial).uniforms.uTime.value = frame * 0.05;
            state.starSystem.rotateY(-0.00008);
        }

        // Update particles (Smoke, Sparks, etc.) handled here
        const { flames, sparkles, smokes, flameData, sparkleData, smokeData } = state.particles;

        // 1. FLAMES
        if (frame % 2 === 0) {
            for (let i = 0; i < flames.count; i++) {
                const idx = i * FLAME_VARS;
                if (flameData[idx] <= 0) {
                    flameData[idx] = 1.0;
                    flameData[idx + 1] = (Math.random() - 0.5) * 1.5;
                    flameData[idx + 2] = 0.2;
                    flameData[idx + 3] = (Math.random() - 0.5) * 1.5;
                    flameData[idx + 4] = 0.03 + Math.random() * 0.04;
                    flameData[idx + 5] = Math.random() * Math.PI;
                    flameData[idx + 6] = Math.random() * Math.PI;
                    flameData[idx + 7] = Math.random() * Math.PI;
                    break;
                }
            }
        }
        for (let i = 0; i < flames.count; i++) {
            const idx = i * FLAME_VARS;
            if (flameData[idx] > 0) {
                flameData[idx] -= 0.015;
                flameData[idx + 1] += wind.x;
                flameData[idx + 2] += flameData[idx + 4];
                flameData[idx + 3] += wind.y;
                flameData[idx + 6] += 0.05;

                _v1.set(flameData[idx + 1], flameData[idx + 2], flameData[idx + 3]);
                const s = Math.max(0.01, flameData[idx]);
                _s1.set(s, s * 1.2, s);
                _e1.set(flameData[idx + 5], flameData[idx + 6], flameData[idx + 7]);
                _q1.setFromEuler(_e1);
                _m1.compose(_v1, _q1, _s1);
                flames.setMatrixAt(i, _m1);

                // Zero-GC fix: Avoid .setHex() overwriting the object while lerping
                _c1.copy(_flameStartColor).lerp(_flameEndColor, 1.0 - flameData[idx]).multiplyScalar(flameData[idx]);
                flames.setColorAt(i, _c1);

                if (flameData[idx] <= 0) { _m1.makeScale(0, 0, 0); flames.setMatrixAt(i, _m1); }
            }
        }
        flames.instanceMatrix.needsUpdate = true;
        if (flames.instanceColor) flames.instanceColor.needsUpdate = true;

        // 2. SPARKLES
        if (frame % 2 === 0) {
            for (let i = 0; i < sparkles.count; i++) {
                const idx = i * SPARKLE_VARS;
                if (sparkleData[idx] <= 0) {
                    sparkleData[idx] = 1.0;
                    sparkleData[idx + 1] = (Math.random() - 0.5) * 1.0;
                    sparkleData[idx + 2] = 1.0;
                    sparkleData[idx + 3] = (Math.random() - 0.5) * 1.0;
                    sparkleData[idx + 4] = (Math.random() - 0.5) * 0.02;
                    sparkleData[idx + 5] = 0.05 + Math.random() * 0.05;
                    sparkleData[idx + 6] = (Math.random() - 0.5) * 0.02;
                    break;
                }
            }
        }
        for (let i = 0; i < sparkles.count; i++) {
            const idx = i * SPARKLE_VARS;
            if (sparkleData[idx] > 0) {
                sparkleData[idx] -= 0.01;
                sparkleData[idx + 1] += sparkleData[idx + 4] + wind.x * 2.5;
                sparkleData[idx + 2] += sparkleData[idx + 5];
                sparkleData[idx + 3] += sparkleData[idx + 6] + wind.y * 2.5;

                _v1.set(sparkleData[idx + 1], sparkleData[idx + 2], sparkleData[idx + 3]);
                const s = Math.max(0.001, sparkleData[idx] * 0.5);
                _s1.set(s, s, s);
                _m1.compose(_v1, _q1.identity(), _s1);
                sparkles.setMatrixAt(i, _m1);
                if (sparkleData[idx] <= 0) { _m1.makeScale(0, 0, 0); sparkles.setMatrixAt(i, _m1); }
            }
        }
        sparkles.instanceMatrix.needsUpdate = true;

        // 3. SMOKES
        if (frame % 10 === 0) {
            for (let i = 0; i < smokes.count; i++) {
                const idx = i * SMOKE_VARS;
                if (smokeData[idx] <= 0) {
                    smokeData[idx] = 1.0;
                    smokeData[idx + 1] = (Math.random() - 0.5) * 0.5;
                    smokeData[idx + 2] = 2.0;
                    smokeData[idx + 3] = (Math.random() - 0.5) * 0.5;
                    smokeData[idx + 4] = 0.02;
                    break;
                }
            }
        }
        const smokeAlphas = smokes.geometry.getAttribute('instanceAlpha') as THREE.InstancedBufferAttribute;
        for (let i = 0; i < smokes.count; i++) {
            const idx = i * SMOKE_VARS;
            if (smokeData[idx] > 0) {
                smokeData[idx] -= 0.005;
                smokeData[idx + 2] += smokeData[idx + 4];
                smokeData[idx + 1] += wind.x * 1.5;
                smokeData[idx + 3] += wind.y * 1.5;

                _v1.set(smokeData[idx + 1], smokeData[idx + 2], smokeData[idx + 3]);

                const age = (1.0 - smokeData[idx]);
                const s = 1.2 + age * 2.5;
                _s1.set(s, s, s);

                _q1.copy(camera.quaternion);
                _m1.compose(_v1, _q1, _s1);
                smokes.setMatrixAt(i, _m1);

                smokeAlphas.setX(i, smokeData[idx] * 0.3);

                _c1.setHex(0x444444);
                smokes.setColorAt(i, _c1);

                if (smokeData[idx] <= 0) { _m1.makeScale(0, 0, 0); smokes.setMatrixAt(i, _m1); smokeAlphas.setX(i, 0); }
            }
        }
        smokes.instanceMatrix.needsUpdate = true;
        smokeAlphas.needsUpdate = true;
        if (smokes.instanceColor) smokes.instanceColor.needsUpdate = true;
    },

    warmupStationAssets: () => {
        const engine = WinterEngine.getInstance();
        const t1 = getCachedCanvasTexture(256, 256, 'map');
        const t2 = getCachedCanvasTexture(128, 128, 'note');

        if (engine.renderer) {
            engine.renderer.initTexture(t1);
            engine.renderer.initTexture(t2);
        }

        if (!stationGeometries.barrel) stationGeometries.barrel = new THREE.CylinderGeometry(0.03, 0.03, 1.2);
        if (!stationGeometries.map_plane) stationGeometries.map_plane = new THREE.PlaneGeometry(2.0, 1.4);
        if (!stationGeometries.note_plane) stationGeometries.note_plane = new THREE.PlaneGeometry(0.4, 0.5);
    },

    setupFamilyMembers: (scene: THREE.Scene, rescuedIndices: number[], debugMode: boolean, playerCharacter: any, familyMembersData: any[]) => {
        const familyGroup = new THREE.Group();
        const interactables: THREE.Mesh[] = [];
        const familyMembers: any[] = [];
        const activeMembers: any[] = [playerCharacter];

        if (debugMode) {
            for (let i = 0; i < familyMembersData.length; i++) activeMembers.push(familyMembersData[i]);
        } else {
            const indices = rescuedIndices || [];
            for (let i = 0; i < indices.length; i++) {
                const sectorId = indices[i];
                if (sectorId < 4) activeMembers.push(familyMembersData[sectorId]);
                else if (sectorId === 4) { activeMembers.push(familyMembersData[4]); activeMembers.push(familyMembersData[5]); }
            }
        }

        const humans = activeMembers.filter(m => m.race === 'human');
        const animals = activeMembers.filter(m => m.race === 'animal');

        for (let globalIdx = 0; globalIdx < activeMembers.length; globalIdx++) {
            const memberData = activeMembers[globalIdx];
            const member = ModelFactory.createFamilyMember(memberData);

            if (memberData.id === 'player') {
                member.userData.id = `player_${memberData.name}`;
                member.userData.type = 'family';
            }
            let angle = 0, radius = memberData.race === 'animal' ? 5.2 : 5.0;

            if (memberData.race === 'animal') {
                angle = 1.2 + animals.indexOf(memberData) * 0.25;
            } else {
                const idx = humans.indexOf(memberData);
                angle = -(humans.length - 1) * 0.25 / 2 + idx * 0.25;
            }

            member.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
            member.lookAt(0, 0, 0);

            // Zero-GC replacement for .find()
            let bodyMesh = null;
            for (let c = 0; c < member.children.length; c++) {
                if (member.children[c].userData.isBody) {
                    bodyMesh = member.children[c];
                    break;
                }
            }

            if (bodyMesh) interactables.push(bodyMesh as THREE.Mesh);

            const emissiveMaterials: THREE.MeshStandardMaterial[] = [];

            // Zero-GC Stack Traversal instead of .traverse(closure)
            _traverseStack.length = 0;
            _traverseStack.push(member);

            while (_traverseStack.length > 0) {
                const current = _traverseStack.pop() as any;

                for (let c = 0; c < current.children.length; c++) {
                    _traverseStack.push(current.children[c]);
                }

                if (current.isMesh) {
                    const m = current as THREE.Mesh;
                    m.castShadow = true;
                    m.userData.groupId = member.userData.id;
                    m.userData.id = member.userData.id;
                    m.userData.name = member.userData.name;
                    m.userData.type = 'family';

                    if (m.material) {
                        const mats = Array.isArray(m.material) ? m.material : [m.material];
                        const clonedMats = [];

                        for (let i = 0; i < mats.length; i++) {
                            // [VINTERDÖD OPTIMIZATION] Avoid .clone() on materials unless strictly necessary
                            if ('emissive' in mats[i]) {
                                const newMat = new THREE.MeshStandardMaterial().copy(mats[i] as THREE.MeshStandardMaterial);
                                newMat.userData = newMat.userData || {};
                                newMat.userData.isSharedAsset = true;
                                emissiveMaterials.push(newMat);
                                clonedMats.push(newMat);
                            } else {
                                mats[i].userData = mats[i].userData || {};
                                mats[i].userData.isSharedAsset = true;
                                clonedMats.push(mats[i]);
                            }
                        }

                        // Avoid array wrapper if there's only one material
                        m.material = Array.isArray(m.material) || clonedMats.length > 1 ? clonedMats : clonedMats[0];
                    }
                }
            }
            familyGroup.add(member);

            let baseY = member.userData.baseY ?? 0;
            familyMembers.push({
                mesh: member,
                baseY,
                phase: Math.random() * Math.PI * 2,
                bounce: 0,
                name: memberData.name,
                seed: Math.random() * 100,
                emissiveMaterials
            });
        }
        scene.add(familyGroup);
        return { familyMembers, interactables, activeMembers };
    },

};