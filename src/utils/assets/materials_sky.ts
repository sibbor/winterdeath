import * as THREE from 'three';

// ============================================================================
// CONFIGURATION TYPES (Data-driven inputs for SkySystem)
// ============================================================================
export enum SkyCycle { DAY, NIGHT };
export enum CelestialType { SUN, MOON };

export interface CelestialConfig {
    type: CelestialType;
    phase?: number;       // Moon phase mapping (0.0 - 1.0)
    distance: number;     // Orbit distance
    radius: number;       // Physical size (radius) of the celestial body
    color: number;        // Hex color representation
    position?: { x: number; y: number; z: number };
}

export interface SkyLightConfig {
    visible: boolean;
    color: number;
    intensity: number;
    castShadow?: boolean;
}

export interface SkyHemiConfig {
    skyColor: number;
    groundColor: number;
    intensity: number;
}

export interface SkyCloudConfig {
    count?: number;      // Number of clouds to spawn (max 12)
    height?: number;     // Vertical ground height/altitude offset (Y)
    speed?: number;      // Horizontal drift velocity multiplier
    opacity?: number;    // Custom base opacity override
    color?: number;      // Custom color tint override (hex)
}

export interface SkyConfig {
    // --- DYNAMIC ENGINE ---
    time?: number;            // 0.0 to 1.0 (Midnight to Midnight)
    timeScale?: number;       // Progression speed per second

    // --- MANUAL OVERRIDES (Masks procedural derivations) ---
    cycle?: SkyCycle;
    stars?: number;
    atmosphereColor?: number;

    hemi?: Partial<SkyHemiConfig>;
    celestial?: Partial<CelestialConfig>;
    light?: Partial<SkyLightConfig>;
    clouds?: Partial<SkyCloudConfig>;
}

/**
 * Procedural Keyframes for the Time-of-Day engine.
 * DNA for environmental transitions.
 */
export interface SkyKeyframe {
    time: number;
    atmosphereColor: number;
    celestialColor: number;
    celestialType: CelestialType;
    lightIntensity: number;
    lightColor: number;
    hemiIntensity: number;
    hemiSkyColor: number;
}

export const SKY_KEYFRAMES: SkyKeyframe[] = [
    { time: 0.0, atmosphereColor: 0x080816, celestialColor: 0xfff9e6, celestialType: CelestialType.MOON, lightIntensity: 0.4, lightColor: 0xaaccff, hemiIntensity: 0.5, hemiSkyColor: 0x1a2233 }, // Midnight
    { time: 0.2, atmosphereColor: 0x8d4b38, celestialColor: 0xffaa44, celestialType: CelestialType.SUN, lightIntensity: 0.6, lightColor: 0xffaa66, hemiIntensity: 0.7, hemiSkyColor: 0x8d4b38 }, // Dawn
    { time: 0.5, atmosphereColor: 0x7ac1eb, celestialColor: 0xffffff, celestialType: CelestialType.SUN, lightIntensity: 1.2, lightColor: 0xffffff, hemiIntensity: 0.9, hemiSkyColor: 0x7ac1eb }, // Noon
    { time: 0.8, atmosphereColor: 0x4a285a, celestialColor: 0xff4422, celestialType: CelestialType.SUN, lightIntensity: 0.5, lightColor: 0xff5522, hemiIntensity: 0.5, hemiSkyColor: 0x4a285a }, // Dusk
    { time: 1.0, atmosphereColor: 0x080816, celestialColor: 0xfff9e6, celestialType: CelestialType.MOON, lightIntensity: 0.4, lightColor: 0xaaccff, hemiIntensity: 0.5, hemiSkyColor: 0x1a2233 }, // Midnight
];

// ============================================================================
// SHARED ASSETS (Zero-GC, protected from clearActiveScene sweeps)
// ============================================================================

// Procedural Halo Generation (Canvas-based to avoid external texture dependencies)
const createHaloTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.clearRect(0, 0, 128, 128); // Clean slate
        const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.6)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;

        // Fill strictly within a circular path to guarantee corner alpha transparency is 100% empty
        ctx.beginPath();
        ctx.arc(64, 64, 64, 0, Math.PI * 2);
        ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.userData = { isSharedAsset: true };
    return tex;
};

const HALO_TEXTURE = createHaloTexture();

// Procedural Fluffy Cloud Generation (Canvas-based to avoid external texture dependencies)
const createCloudTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.clearRect(0, 0, 256, 256); // Clean slate

        const drawPuff = (x: number, y: number, r: number) => {
            const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
            grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.08)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        };

        // Draw multiple overlapping puffs to create a natural, organic cloud shape
        drawPuff(128, 128, 85);
        drawPuff(85, 120, 55);
        drawPuff(170, 130, 65);
        drawPuff(110, 150, 50);
        drawPuff(145, 100, 45);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.userData = { isSharedAsset: true };
    return tex;
};

const CLOUD_TEXTURE = createCloudTexture();

export const MATERIALS_SKY = {
    // Primary Sky dome background
    sky: new THREE.MeshBasicMaterial({
        color: 0xffffeb,
        fog: false,
        side: THREE.BackSide,
        userData: { isSharedAsset: true }
    }),

    // High-performance branchless Star Shader with smooth fading support
    star: new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uOpacity: { value: 0.0 }
        },
        vertexShader: `
            attribute float size; 
            attribute float phase; 
            attribute float twinkleSpeed; 
            varying float vAlpha; 
            uniform float uTime;
            uniform float uOpacity;
            
            void main() {
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); 
                gl_Position = projectionMatrix * mvPosition;
                
                // Optimized branchless logic to prevent GPU execution divergence
                float isTwinkle = step(0.001, twinkleSpeed);
                float baseAlpha = mix(0.8, 0.9, isTwinkle);
                float amplitude = mix(0.2, 0.1, isTwinkle);
                
                vAlpha = (baseAlpha + amplitude * sin(uTime * twinkleSpeed + phase)) * uOpacity;
                
                gl_Position.z -= 0.0001; // Depth optimization against dome clipping
                gl_PointSize = size * (2500.0 / -mvPosition.z);
            }
        `,
        fragmentShader: `
            varying float vAlpha; 
            void main() { 
                vec2 coord = gl_PointCoord - vec2(0.5); 
                if (length(coord) > 0.5) discard; 
                gl_FragColor = vec4(1.0, 1.0, 1.0, vAlpha); 
            }
        `,
        transparent: true,
        depthWrite: false,
        userData: { isSharedAsset: true }
    }),

    // Additive glow overlay for celestial bodies
    moonHalo: new THREE.SpriteMaterial({
        map: HALO_TEXTURE,
        color: 0xffffee,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        fog: false,
        depthWrite: false,
        userData: { isSharedAsset: true }
    }),

    // Moon disc — solid, cool-white, normal blending. fog:false punches through atmosphere.
    moon: new THREE.MeshBasicMaterial({
        color: 0xdde8ff,
        fog: false,
        userData: { isSharedAsset: true }
    }),

    // Sun disc — additive blending gives a glowing-orb appearance instead of a flat ball.
    // Color is set dynamically each frame by SkySystem.processProcedural.
    sun: new THREE.MeshBasicMaterial({
        color: 0xffffff,
        fog: false,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        userData: { isSharedAsset: true }
    }),

    // Dynamic, softly lit background cloud layer
    cloud: new THREE.SpriteMaterial({
        map: CLOUD_TEXTURE,
        color: 0xffffff,
        transparent: true,
        opacity: 0.5,
        blending: THREE.NormalBlending,
        fog: false,
        depthWrite: false,
        userData: { isSharedAsset: true }
    }),
};

// Guarantee recursive protection flag across all materials mapped
for (const key in MATERIALS_SKY) {
    (MATERIALS_SKY as any)[key].userData = { isSharedAsset: true };
}