import * as THREE from 'three';
import { TEXTURES } from './AssetLoader';
import { createProceduralDiffuse } from './procedural'
import { patchCutoutMaterial, patchWaterVegetationMaterial } from './materials_water';
import { patchWindMaterial } from './materials_wind';

// --- HELPERS ---
const createSmokeTexture = () => {
    if (typeof document === 'undefined') return new THREE.Texture();
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.6)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.3)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
};

const setupSmokeMaterial = (mat: THREE.MeshBasicMaterial) => {
    mat.map = createSmokeTexture();
    mat.onBeforeCompile = (shader) => {
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
};

const createBrakeGlowTexture = () => {
    if (typeof document === 'undefined') return new THREE.Texture();
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 512, 512);

    const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 250);

    gradient.addColorStop(0, 'rgba(255, 30, 0, 1.0)');   // White/orange/hot core
    gradient.addColorStop(0.2, 'rgba(180, 0, 0, 0.5)');  // Intense red
    gradient.addColorStop(0.5, 'rgba(50, 0, 0, 0.1)');   // Faint red glow
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');        // Exact black/transparent at the edge

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    return tex;
};

// Pre-define common colors
const DIFFUSE = createProceduralDiffuse();

// Global cache
let _sharedGlowTexture: THREE.CanvasTexture | null = null;

export const getSharedGlowTexture = (): THREE.CanvasTexture => {
    if (!_sharedGlowTexture) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d')!;

        // VINTERDÖD: Perfekt radiell gradient för Additive Blending
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.4)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);

        _sharedGlowTexture = new THREE.CanvasTexture(canvas);

        // Zero-GC Optimering: Stäng av mipmaps för mjuka gradienter
        _sharedGlowTexture.generateMipmaps = false;
        _sharedGlowTexture.minFilter = THREE.LinearFilter;
    }
    return _sharedGlowTexture;
};

export const MATERIALS = {
    // ---- WEATHER PARTICLES (not patched - the CPU handle these) ----
    particle_snow: new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        side: THREE.DoubleSide
    }),
    particle_rain: new THREE.MeshBasicMaterial({
        color: 0xaaaaff,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        side: THREE.DoubleSide
    }),
    particle_ash: new THREE.MeshBasicMaterial({
        color: 0x333333,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        side: THREE.DoubleSide
    }),
    particle_ember: new THREE.MeshBasicMaterial({
        color: 0xff4400,
        transparent: true,
        opacity: 1.0,
        depthWrite: false,
        side: THREE.DoubleSide
    }),

    // ---- ENVIRONMENTAL (VEGETATION & TRÄD - ALLA PATCHADE) ----
    grass: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0x4a6e4a,
        roughness: 1.0,
        flatShading: true,
        side: THREE.DoubleSide
    })),
    flower: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.8,
        vertexColors: true,
        side: THREE.DoubleSide
    })),
    wheat: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        roughness: 1.0,
        flatShading: true,
        side: THREE.DoubleSide
    })),
    grassTuft: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0x3a7d3a,
        roughness: 1.0,
        flatShading: true,
        side: THREE.DoubleSide
    })),
    hedge: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0x2d4c1e,
        roughness: 0.9,
        flatShading: true
    })),
    // ---- NATURAL & VEGETATION ----
    waterLily: patchWaterVegetationMaterial(new THREE.MeshStandardMaterial({
        color: 0x4a7c59,
        roughness: 0.8,
        flatShading: true,
        side: THREE.DoubleSide
    })),
    waterLilyFlower: patchWaterVegetationMaterial(new THREE.MeshStandardMaterial({
        color: 0xffeebb,
        roughness: 0.8,
        flatShading: true,
        side: THREE.DoubleSide
    })),
    seaweed: patchWaterVegetationMaterial(new THREE.MeshStandardMaterial({
        color: 0x2e5c3e,
        roughness: 0.9,
        flatShading: true,
        side: THREE.DoubleSide
    })),
    treeSilhouette: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0x1e1e1e,
        roughness: 1.0,
        metalness: 0.0,
        flatShading: true,
        side: THREE.DoubleSide
    })),
    treeFirNeedles: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0x2d4c1e, // Deep green base
        roughness: 0.9,
        flatShading: true,
        side: THREE.DoubleSide
    })),
    treeLeavesOak: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0x4a6b30, // Green for Oak
        roughness: 0.9,
        flatShading: true,
        side: THREE.DoubleSide
    })),
    treeLeavesBirch: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0x8DA331, // Yellowish-Green for Birch
        roughness: 0.9,
        flatShading: true,
        side: THREE.DoubleSide
    })),
    treeTrunk: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0x4a3c31, // Flat dark brown
        roughness: 1.0,
        flatShading: true
    })),
    treeTrunkBirch: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.9,
        flatShading: true
    })),
    treeTrunkOak: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0x5a504a,
        roughness: 1.0,
        bumpMap: TEXTURES.bark_rough_bump,
        bumpScale: 0.1,
        flatShading: true
    })),
    deadWood: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0x5c5046,
        roughness: 1.0,
        map: DIFFUSE.bark,
        flatShading: true
    })),

    mountain: (() => {
        // Clone so the repeat settings don't affect MATERIALS.stone
        const mountainMap = DIFFUSE.stone.clone();
        mountainMap.wrapS = mountainMap.wrapT = THREE.RepeatWrapping;
        mountainMap.repeat.set(12, 12); // Large rock face tiling
        mountainMap.needsUpdate = true;
        const mountainBump = TEXTURES.stone_bump.clone();
        mountainBump.wrapS = mountainBump.wrapT = THREE.RepeatWrapping;
        mountainBump.repeat.set(12, 12);
        mountainBump.needsUpdate = true;
        return new THREE.MeshStandardMaterial({
            vertexColors: true,   // Vertex colors tint/modulate the texture
            map: mountainMap,
            bumpMap: mountainBump,
            bumpScale: 0.3,
            flatShading: true,
            roughness: 0.95,
            side: THREE.DoubleSide
        });
    })(),
    stone: new THREE.MeshStandardMaterial({
        color: 0x888888,
        map: DIFFUSE.stone,
        roughness: 0.9,
        bumpMap: TEXTURES.stone_bump,
        bumpScale: 0.2
    }),
    ash: new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.9
    }),
    fog: new THREE.MeshBasicMaterial({
        color: 0x111116,
        transparent: true,
        opacity: 0.1,
        depthWrite: false
    }),
    hay: new THREE.MeshStandardMaterial({ color: 0xedc05d, roughness: 1.0, bumpMap: DIFFUSE.gravel, bumpScale: 0.2 }),
    logEnd: new THREE.MeshStandardMaterial({ color: 0xbc8f8f, roughness: 0.8, bumpMap: DIFFUSE.stone, bumpScale: 0.1 }),
    windowLit: new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffffaa, emissiveIntensity: 5 }),
    windowDark: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9, metalness: 0.1 }),
    upWindow: new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffffaa, emissiveIntensity: 0.5 }),
    caveLampBulb: new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffffaa, emissiveIntensity: 20 }),
    caveLampCage: new THREE.MeshStandardMaterial({ color: 0x333333, wireframe: true }),
    scarecrowPost: new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 }),
    scarecrowHead: new THREE.MeshStandardMaterial({ color: 0xeadbaf, roughness: 1.0 }),
    scarecrowShirt: new THREE.MeshStandardMaterial({ color: 0x6b8e23, roughness: 0.8 }),
    scarecrowHat: new THREE.MeshStandardMaterial({ color: 0x4a3c31, roughness: 1.0 }),

    // ---- WEAPONS & COMBAT ----
    bullet: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    grenade: new THREE.MeshStandardMaterial({ color: 0x3f663f, roughness: 0.6 }),
    molotov: new THREE.MeshStandardMaterial({ color: 0x331100, roughness: 0.3, emissive: 0x331100, emissiveIntensity: 0.2 }),
    flashbang: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.2 }),
    scrap: new THREE.MeshStandardMaterial({
        color: 0xffaa00,
        emissive: 0xffaa00,
        emissiveIntensity: 0.8,
        metalness: 0.8,
        roughness: 0.2
    }),
    arc_cannon_bolt: new THREE.LineBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    }),
    arc_cannon_core: new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    }),

    // ---- VEHICLES ----
    vehicleWindow: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.7 }),
    vehicleTire: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }),
    vehicleSirenBase: new THREE.MeshStandardMaterial({ color: 0x111111 }),
    vehicleHeadlight: new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffffff, emissiveIntensity: 0 }),
    vehicleSirenBlue: new THREE.MeshStandardMaterial({ color: 0x0044ff, emissive: 0x0022ff, emissiveIntensity: 0 }),
    vehicleSirenRed: new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xaa0000, emissiveIntensity: 0 }),
    vehicleBrakeLight: new THREE.MeshStandardMaterial({ color: 0xaa0000, emissive: 0xff0000, emissiveIntensity: 0 }),
    vehicleAmbulanceYellow: new THREE.MeshStandardMaterial({ color: 0xddff00, roughness: 0.5, metalness: 0.2 }),
    vehicleSign: new THREE.MeshBasicMaterial({ transparent: true }),

    // ---- VEGETATION ----
    sunflowerStem: patchWindMaterial(new THREE.MeshStandardMaterial({ color: 0x228B22 })),
    sunflowerHead: patchWindMaterial(new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.8 })),
    sunflowerCenter: patchWindMaterial(new THREE.MeshStandardMaterial({ color: 0x3E2723, roughness: 1.0 })),

    // ---- SPECIAL ----
    textSprite: new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: true }),
    streetLampBulb: new THREE.MeshBasicMaterial({ color: 0xaaddff }),

    // ---- CAMP ----
    camp_flame: new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        userData: { isSharedAsset: true }
    }),
    camp_spark: new THREE.MeshBasicMaterial({ color: 0xffffff, userData: { isSharedAsset: true } }),
    camp_smoke: (() => {
        const m = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 1.0,
            depthWrite: false,
            side: THREE.DoubleSide,
            userData: { isSharedAsset: true }
        });
        setupSmokeMaterial(m);
        return m;
    })(),
    camp_warmWood: new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.8, userData: { isSharedAsset: true } }),
    camp_darkerWood: new THREE.MeshStandardMaterial({ color: 0x5A3210, roughness: 0.9, userData: { isSharedAsset: true } }),
    camp_metal: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7, userData: { isSharedAsset: true } }),
    camp_ammoGreen: new THREE.MeshStandardMaterial({ color: 0x335533, roughness: 0.6, userData: { isSharedAsset: true } }),
    camp_medkitRed: new THREE.MeshStandardMaterial({ color: 0xcc0000, userData: { isSharedAsset: true } }),
    camp_sky: new THREE.MeshBasicMaterial({ color: 0xffffeb, fog: false, userData: { isSharedAsset: true } }),
    camp_star: new THREE.ShaderMaterial({
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
        userData: { isSharedAsset: true }
    }),
    camp_moonHalo: new THREE.SpriteMaterial({
        color: 0xffffee, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, fog: false, depthWrite: false,
        userData: { isSharedAsset: true }
    }),
    camp_ash: new THREE.MeshStandardMaterial({ color: 0x111111, userData: { isSharedAsset: true } }),
    camp_stone: new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9, userData: { isSharedAsset: true } }),
    camp_log: new THREE.MeshStandardMaterial({ color: 0x5e3723, userData: { isSharedAsset: true } }),
    camp_paper: new THREE.MeshStandardMaterial({ color: 0xffffee, roughness: 0.9, userData: { isSharedAsset: true } }),
    camp_bookCover: new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.8, userData: { isSharedAsset: true } }),
    camp_cross: new THREE.MeshBasicMaterial({ color: 0xffffff, userData: { isSharedAsset: true } }),
    camp_interactable: new THREE.MeshStandardMaterial({ transparent: true, opacity: 0, userData: { isSharedAsset: true } }),

    // Outlines
    camp_outline_gold: new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2, userData: { isSharedAsset: true } }),
    camp_outline_green: new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2, userData: { isSharedAsset: true } }),
    camp_outline_red: new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2, userData: { isSharedAsset: true } }),
    camp_outline_purple: new THREE.LineBasicMaterial({ color: 0xaa00ff, linewidth: 2, userData: { isSharedAsset: true } }),

    // ---- FAMILY ----
    familyRingFill: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
    familyRingBorder: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),

    // ---- ZOMBIES ----
    zombie: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
    zombieRingMaterial: new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false
    }),

    // Chests
    chestStandard: new THREE.MeshStandardMaterial({ color: 0x5c4033 }),
    chestGlow: new THREE.MeshBasicMaterial({
        map: getSharedGlowTexture(),
        color: 0xffcc00,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    }),
    chestBig: new THREE.MeshStandardMaterial({ color: 0xffd700 }),
    chestBigGlow: new THREE.MeshBasicMaterial({
        map: getSharedGlowTexture(),
        color: 0xffaa00,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    }),

    gun: new THREE.MeshStandardMaterial({ color: 0x222222 }),

    aimReticle: new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }),
    landingMarker: new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    fire: new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.8, depthWrite: false }),
    fireZone: new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    smoke: new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.6, depthWrite: false }),
    shockwave: new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
    blastRadius: new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    flashWhite: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0, blending: THREE.AdditiveBlending, depthWrite: false }),
    glassShard: new THREE.MeshBasicMaterial({ color: 0xccffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
    gore: new THREE.MeshStandardMaterial({ color: 0x660000, roughness: 0.2 }),
    splash: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false, vertexColors: true }),
    bloodSplatter: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, vertexColors: true }),
    impactSplat: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, vertexColors: true, side: THREE.DoubleSide }),
    enemy_effect_flame: new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.8, depthWrite: false }),
    enemy_effect_spark: new THREE.MeshBasicMaterial({ color: 0xc7c7c7 }),
    enemy_effect_stun: new THREE.MeshBasicMaterial({ color: 0xc7c7c7 }),
    reflexShield: new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
    }),
    buff_shield_bubble: new THREE.MeshBasicMaterial({
        color: 0x4488ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
    }),

    // ---- DECALS ----
    bloodDecal: new THREE.MeshBasicMaterial({
        color: 0x660000,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -4
    }),
    bloodStainDecal: new THREE.MeshBasicMaterial({
        color: 0x440000,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -2
    }),
    scorchDecal: new THREE.MeshBasicMaterial({
        color: 0x111111,
        transparent: true,
        opacity: 0.7,
        map: DIFFUSE.scorchAlpha,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -3
    }),
    footprintDecal: new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.7,
        map: DIFFUSE.footprint,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -4
    }),

    // ---- DESIGN & BUILDINGS ----
    building: new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        roughness: 0.8,
        bumpMap: TEXTURES.concrete_bump,
        bumpScale: 0.04
    }),
    concrete: new THREE.MeshStandardMaterial({
        color: 0x444444,
        roughness: 0.9,
        bumpMap: TEXTURES.concrete_bump,
        bumpScale: 0.1
    }),
    concreteDoubleSided: new THREE.MeshStandardMaterial({
        color: 0x444444,
        roughness: 0.9,
        bumpMap: TEXTURES.concrete_bump,
        bumpScale: 0.1,
        side: THREE.DoubleSide
    }),
    pipe: new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.6, metalness: 0.4 }),
    mast: new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.4, metalness: 0.8, wireframe: true }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x404040, roughness: 0.7 }),
    barrelExplosive: new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.5 }),
    train: new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.6, metalness: 0.3 }),
    vehicleBody: new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.8,
        metalness: 0.1
    }),

    // ---- GROUND (ROADS, PATHS, SNOW) ----
    snow: new THREE.MeshStandardMaterial({
        color: 0xffffff, // Brighter white snow
        roughness: 1.0, // Fully diffuse
        metalness: 0.0,
        bumpMap: TEXTURES.snow_bump,
        bumpScale: 0.4,
        emissive: 0xffffff, // Subtle glow to maintain whiteness in shadows
        emissiveIntensity: 0.15
    }),
    snowCutout: patchCutoutMaterial(new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 1.0,
        metalness: 0.0,
        bumpMap: TEXTURES.snow_bump,
        bumpScale: 0.4,
        emissive: 0xffffff,
        emissiveIntensity: 0.15
    })),
    asphalt: new THREE.MeshStandardMaterial({
        color: 0x222222,
        map: DIFFUSE.asphalt,
        roughness: 0.85,
        metalness: 0.1,
        bumpMap: TEXTURES.asphalt_bump,
        bumpScale: 0.4,
        polygonOffset: true,
        polygonOffsetFactor: -1 // Pull towards camera to prevent Z-fighting with ground
    }),
    gravel: new THREE.MeshStandardMaterial({
        color: 0x888888,
        map: DIFFUSE.gravel,
        roughness: 1.0,
        bumpMap: TEXTURES.stone_bump,
        bumpScale: 2.8,
        polygonOffset: true,
        polygonOffsetFactor: -1
    }),
    gravelCutout: patchCutoutMaterial(new THREE.MeshStandardMaterial({
        color: 0x888888,
        map: DIFFUSE.gravel,
        roughness: 1.0,
        bumpMap: TEXTURES.stone_bump,
        bumpScale: 2.8,
        polygonOffset: true,
        polygonOffsetFactor: -1
    })),
    dirt: new THREE.MeshStandardMaterial({
        color: 0x4a3b32,
        map: DIFFUSE.gravel,
        roughness: 1.0,
        bumpMap: TEXTURES.stone_bump,
        bumpScale: 2.8,
        polygonOffset: true,
        polygonOffsetFactor: -1
    }),
    dirtCutout: patchCutoutMaterial(new THREE.MeshStandardMaterial({
        color: 0x4a3b32,
        map: DIFFUSE.gravel,
        roughness: 1.0,
        bumpMap: TEXTURES.stone_bump,
        bumpScale: 2.8,
        polygonOffset: true,
        polygonOffsetFactor: -1
    })),
    frost: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1.0,
        alphaMap: DIFFUSE.frostAlpha,
        roughness: 0.2,
        metalness: 0.1,
        bumpMap: TEXTURES.snow_bump,
        bumpScale: 0.1,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1
    }),

    // ---- BUILDING MATERIALS ----
    steel: new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.4, metalness: 0.8 }),
    redWood: new THREE.MeshStandardMaterial({ color: 0x8a2be2, roughness: 0.9 }),
    brick: new THREE.MeshStandardMaterial({
        roughness: 0.95,
        bumpMap: TEXTURES.brick_bump,
        bumpScale: 0.06
    }),
    whiteBrick: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.9,
        bumpMap: TEXTURES.brick_bump,
        bumpScale: 0.05
    }),
    yellowBrick: new THREE.MeshStandardMaterial({
        color: 0xd4c685,
        roughness: 0.95,
        bumpMap: TEXTURES.brick_bump,
        bumpScale: 0.06
    }),
    brownBrick: new THREE.MeshStandardMaterial({
        color: 0x5c4033,
        roughness: 0.95,
        bumpMap: TEXTURES.brick_bump,
        bumpScale: 0.06
    }),
    glass: new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.6 }),
    glassBroken: new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.4, metalness: 0.5 }),
    metalPanel: new THREE.MeshStandardMaterial({ color: 0x778899, roughness: 0.3, metalness: 0.7 }),
    neonSign: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    plaster: new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.9,
        bumpMap: TEXTURES.concrete_bump,
        bumpScale: 0.05
    }),
    wood: new THREE.MeshStandardMaterial({
        color: 0x111111,
        map: DIFFUSE.wood,
        roughness: 0.9,
        bumpMap: DIFFUSE.containerMetal,
        bumpScale: 0.1
    }),
    wooden_fasade: new THREE.MeshStandardMaterial({
        color: 0x111111,
        map: DIFFUSE.wood,
        roughness: 0.9,
        bumpMap: DIFFUSE.containerMetal,
        bumpScale: 0.1
    }),
    sheet_metal: new THREE.MeshStandardMaterial({
        color: 0x666666,
        map: DIFFUSE.containerMetal,
        roughness: 0.4,
        metalness: 0.6
    }),
    blackMetal: new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 0.6, roughness: 0.4 }),
    crossEmissive: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 5.0 }),
    busBlue: new THREE.MeshStandardMaterial({
        color: 0x009ddb,
        roughness: 0.9,
        bumpMap: TEXTURES.concrete_bump,
        bumpScale: 0.1
    }),

    // ---- SPECIAL EVENTS & DISCOVERY ----
    brakeGlow: new THREE.MeshBasicMaterial({
        map: createBrakeGlowTexture(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.8,
        fog: false,
        userData: { isSharedAsset: true }
    }),
    trajectoryLine: new THREE.MeshBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        userData: { isSharedAsset: true }
    }),
    busExplosionRing: new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        userData: { isSharedAsset: true }
    }),
    collectibleRing: new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
        userData: { isSharedAsset: true }
    }),
    collectibleBeam: new THREE.MeshBasicMaterial({
        color: 0x0088ff,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        userData: { isSharedAsset: true }
    }),
    collectibleInnerRing: new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.6,
        userData: { isSharedAsset: true }
    }),

    // ---- DEBUGGING ----
    debugRed: new THREE.LineBasicMaterial({ color: 0xff0000, userData: { isSharedAsset: true } }),
    debugGreen: new THREE.LineBasicMaterial({ color: 0x00ff00, userData: { isSharedAsset: true } }),
    debugBlue: new THREE.LineBasicMaterial({ color: 0x0000ff, userData: { isSharedAsset: true } }),
    debugYellow: new THREE.LineBasicMaterial({ color: 0xffff00, userData: { isSharedAsset: true } }),
    debugBeam: new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        userData: { isSharedAsset: true }
    }),
    debugTriggerRing: new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        userData: { isSharedAsset: true }
    }),

    container: new THREE.MeshStandardMaterial({
        color: 0x888888,
        map: DIFFUSE.containerMetal,
        roughness: 0.6,
        metalness: 0.5
    }),
    guardrail: new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.4,
        metalness: 0.8
    }),
    skidMark: new THREE.MeshBasicMaterial({
        color: 0x050505,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3
    }),
    fenceMesh: new THREE.MeshStandardMaterial({
        map: DIFFUSE.fenceMesh,
        transparent: true,
        alphaTest: 0.4,
        side: THREE.DoubleSide,
        roughness: 0.3,
        metalness: 0.8
    }),
    vehicleBodyRed: new THREE.MeshStandardMaterial({
        color: 0xcc2222,
        roughness: 0.5,
        metalness: 0.3
    }),
    vehicleBodyBlue: new THREE.MeshStandardMaterial({
        color: 0x0055aa,
        roughness: 0.5,
        metalness: 0.3
    }),
    vehicleGlass: new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.1,
        metalness: 0.9,
        transparent: true,
        opacity: 0.8
    }),
    treeLeaves: new THREE.MeshStandardMaterial({
        color: 0x224422,
        map: DIFFUSE.treeLeaves,
        transparent: true,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        roughness: 0.9
    }),
    treeBark: new THREE.MeshStandardMaterial({
        color: 0x443322,
        roughness: 1.0
    })
};

/**
 * VINTERDÖD: Singleton-cache för trädskuggor (Alpha-tested Depth Materials).
 * Förhindrar shader-recompiles vid shadow pass.
 */
export const TREE_DEPTH_MATS: Record<string, THREE.MeshDepthMaterial> = {};

export const getTreeDepthMaterial = (baseMat: THREE.Material): THREE.MeshDepthMaterial => {
    const map = (baseMat as any).map;
    const key = map ? map.uuid : 'no_map';
    if (!TREE_DEPTH_MATS[key]) {
        TREE_DEPTH_MATS[key] = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            map: map,
            alphaTest: (baseMat as any).alphaTest || 0.5
        });
    }
    return TREE_DEPTH_MATS[key];
};

/**
 * VINTERDÖD: Färgpalett för rekvisita i Camp (Böcker, Flaskor etc).
 * Förhindrar "new Material()" anrop vid körning.
 */
export const CAMP_PROP_PALETTE = [
    new THREE.MeshStandardMaterial({ color: 0x442211, roughness: 0.8, userData: { isSharedAsset: true } }), // Mörkbrun
    new THREE.MeshStandardMaterial({ color: 0x553322, roughness: 0.8, userData: { isSharedAsset: true } }), // Mellanbrun
    new THREE.MeshStandardMaterial({ color: 0x221100, roughness: 0.9, userData: { isSharedAsset: true } }), // Svartbrun
    new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.7, userData: { isSharedAsset: true } }), // Grå
    new THREE.MeshStandardMaterial({ color: 0x334433, roughness: 0.6, userData: { isSharedAsset: true } }), // Flaskgrön
    new THREE.MeshStandardMaterial({ color: 0x662222, roughness: 0.8, transparent: true, opacity: 0.8, userData: { isSharedAsset: true } }), // Vinröd/Glas
];