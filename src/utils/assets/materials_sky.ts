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

    atmosphereColorObj?: THREE.Color;
    celestialColorObj?: THREE.Color;
    lightColorObj?: THREE.Color;
    hemiSkyColorObj?: THREE.Color;
}

export const SKY_KEYFRAMES: SkyKeyframe[] = [
    // Midnight start
    { time: 0.0, atmosphereColor: 0x050510, celestialColor: 0xfff9e6, celestialType: CelestialType.MOON, lightIntensity: 0.4, lightColor: 0xaaccff, hemiIntensity: 0.5, hemiSkyColor: 0x111622 },
    
    // Late Night (stays completely dark until just before the sun breaches the horizon)
    { time: 0.24, atmosphereColor: 0x050510, celestialColor: 0xfff9e6, celestialType: CelestialType.MOON, lightIntensity: 0.4, lightColor: 0xaaccff, hemiIntensity: 0.5, hemiSkyColor: 0x111622 },
    
    // Dawn / Sunrise (warm dawn color peaks just as the sun is clearing the horizon)
    { time: 0.27, atmosphereColor: 0x8d4b38, celestialColor: 0xff5522, celestialType: CelestialType.SUN, lightIntensity: 0.6, lightColor: 0xff8844, hemiIntensity: 0.7, hemiSkyColor: 0x8d4b38 },
    
    // Morning (rapid, vibrant clear blue sky build up)
    { time: 0.35, atmosphereColor: 0x70bce8, celestialColor: 0xffffff, celestialType: CelestialType.SUN, lightIntensity: 1.0, lightColor: 0xffffff, hemiIntensity: 0.8, hemiSkyColor: 0x70bce8 },
    
    // Noon (bright clear day sky)
    { time: 0.50, atmosphereColor: 0x7ac1eb, celestialColor: 0xffffff, celestialType: CelestialType.SUN, lightIntensity: 1.2, lightColor: 0xffffff, hemiIntensity: 0.9, hemiSkyColor: 0x7ac1eb },
    
    // Afternoon (retains clear vibrant day sky much closer to sunset)
    { time: 0.72, atmosphereColor: 0x70bce8, celestialColor: 0xffffff, celestialType: CelestialType.SUN, lightIntensity: 1.0, lightColor: 0xffffff, hemiIntensity: 0.8, hemiSkyColor: 0x70bce8 },
    
    // Dusk / Sunset (rich, warm sunset red peaks right on the horizon)
    { time: 0.75, atmosphereColor: 0x943d3d, celestialColor: 0xff4422, celestialType: CelestialType.SUN, lightIntensity: 0.5, lightColor: 0xff5522, hemiIntensity: 0.5, hemiSkyColor: 0x943d3d },
    
    // Early Night (quickly cools down to dark navy right after the sun drops)
    { time: 0.77, atmosphereColor: 0x050510, celestialColor: 0xfff9e6, celestialType: CelestialType.MOON, lightIntensity: 0.4, lightColor: 0xaaccff, hemiIntensity: 0.5, hemiSkyColor: 0x111622 },
    
    // Midnight end
    { time: 1.0, atmosphereColor: 0x050510, celestialColor: 0xfff9e6, celestialType: CelestialType.MOON, lightIntensity: 0.4, lightColor: 0xaaccff, hemiIntensity: 0.5, hemiSkyColor: 0x111622 },
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

// Procedural Sun Rays Generation
const createRaysTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.clearRect(0, 0, 256, 256);
        ctx.translate(128, 128);
        const rayCount = 12;
        for (let i = 0; i < rayCount; i++) {
            const angle = (i / rayCount) * Math.PI * 2;
            ctx.rotate(angle);
            
            const grad = ctx.createLinearGradient(0, 0, 0, 128);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
            grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(-4, 20);
            ctx.lineTo(4, 20);
            ctx.lineTo(1, 120);
            ctx.lineTo(-1, 120);
            ctx.fill();
            
            ctx.rotate(-angle);
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.userData = { isSharedAsset: true };
    return tex;
};

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
            grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
            grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.8)');
            grad.addColorStop(0.8, 'rgba(255, 255, 255, 0.2)');
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

// Lazy-initialization cache for materials to prevent blocking main-thread parse/load
let _skyMaterial: THREE.MeshBasicMaterial | null = null;
let _starMaterial: THREE.ShaderMaterial | null = null;
let _moonHaloMaterial: THREE.SpriteMaterial | null = null;
let _moonMaterial: THREE.MeshBasicMaterial | null = null;
let _sunMaterial: THREE.MeshBasicMaterial | null = null;
let _cloudMaterial: THREE.MeshBasicMaterial | null = null;
let _sunRaysMaterial: THREE.ShaderMaterial | null = null;

/**
 * SkyTextureManager: Deferred texture manager that encapsulates procedural canvas generators.
 * Prevents synchronous thread blocking during startup, allowing textures to be generated
 * lazily only when materials are initialized/compiled.
 */
export class SkyTextureManager {
    private static _haloTexture: THREE.CanvasTexture | null = null;
    private static _raysTexture: THREE.CanvasTexture | null = null;
    private static _cloudTexture: THREE.CanvasTexture | null = null;

    public static getHaloTexture(): THREE.CanvasTexture {
        if (!this._haloTexture) {
            this._haloTexture = createHaloTexture();
        }
        return this._haloTexture;
    }

    public static getRaysTexture(): THREE.CanvasTexture {
        if (!this._raysTexture) {
            this._raysTexture = createRaysTexture();
        }
        return this._raysTexture;
    }

    public static getCloudTexture(): THREE.CanvasTexture {
        if (!this._cloudTexture) {
            this._cloudTexture = createCloudTexture();
        }
        return this._cloudTexture;
    }

    public static dispose(): void {
        if (this._haloTexture) {
            this._haloTexture.dispose();
            this._haloTexture = null;
        }
        if (this._raysTexture) {
            this._raysTexture.dispose();
            this._raysTexture = null;
        }
        if (this._cloudTexture) {
            this._cloudTexture.dispose();
            this._cloudTexture = null;
        }
    }
}

// Pre-allocated static uniforms with explicit type signatures to minimize V8 object-recursion
export interface StarUniforms {
    uTime: { value: number };
    uOpacity: { value: number };
    [key: string]: THREE.IUniform;
}

export interface SunRaysUniforms {
    uTime: { value: number };
    uColor: { value: THREE.Color };
    uOpacity: { value: number };
    [key: string]: THREE.IUniform;
}

export const STAR_UNIFORMS: StarUniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0.0 }
};

// Module-level static color uniform avoiding instantiation in the material declaration itself
const _sunRaysColor = new THREE.Color(0xffffff);

export const SUN_RAYS_UNIFORMS: SunRaysUniforms = {
    uTime: { value: 0 },
    uColor: { value: _sunRaysColor },
    uOpacity: { value: 0.5 }
};

export const MATERIALS_SKY = {
    // Primary Sky dome background
    get sky(): THREE.MeshBasicMaterial {
        if (!_skyMaterial) {
            _skyMaterial = new THREE.MeshBasicMaterial({
                color: 0xffffeb,
                fog: false,
                side: THREE.BackSide
            });
            _skyMaterial.userData = { isSharedAsset: true };
        }
        return _skyMaterial;
    },

    // High-performance branchless Star Shader with smooth fading support
    get star(): THREE.ShaderMaterial {
        if (!_starMaterial) {
            _starMaterial = new THREE.ShaderMaterial({
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
                precision: 'highp'
            });
            // Assign pre-allocated flat uniform reference directly to avoid UniformsUtils.clone() allocation
            _starMaterial.uniforms = STAR_UNIFORMS;
            _starMaterial.userData = { isSharedAsset: true };
        }
        return _starMaterial;
    },

    // Additive glow overlay for celestial bodies
    get moonHalo(): THREE.SpriteMaterial {
        if (!_moonHaloMaterial) {
            _moonHaloMaterial = new THREE.SpriteMaterial({
                map: SkyTextureManager.getHaloTexture(),
                color: 0xffffee,
                transparent: true,
                opacity: 0.8,
                blending: THREE.AdditiveBlending,
                fog: false,
                depthWrite: false
            });
            _moonHaloMaterial.userData = { isSharedAsset: true };
        }
        return _moonHaloMaterial;
    },

    // Moon disc — solid, cool-white, normal blending. fog:false punches through atmosphere.
    get moon(): THREE.MeshBasicMaterial {
        if (!_moonMaterial) {
            _moonMaterial = new THREE.MeshBasicMaterial({
                color: 0xdde8ff,
                fog: false
            });
            _moonMaterial.userData = { isSharedAsset: true };
        }
        return _moonMaterial;
    },

    // Sun disc — additive blending gives a glowing-orb appearance instead of a flat ball.
    // Color is set dynamically each frame by SkySystem.processProcedural.
    get sun(): THREE.MeshBasicMaterial {
        if (!_sunMaterial) {
            _sunMaterial = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                fog: false,
                blending: THREE.AdditiveBlending,
                transparent: true,
                depthWrite: false
            });
            _sunMaterial.userData = { isSharedAsset: true };
        }
        return _sunMaterial;
    },

    // Dynamic, softly lit background cloud layer
    get cloud(): THREE.MeshBasicMaterial {
        if (!_cloudMaterial) {
            _cloudMaterial = new THREE.MeshBasicMaterial({
                map: SkyTextureManager.getCloudTexture(),
                color: 0xffffff,
                transparent: true,
                opacity: 0.5,
                blending: THREE.NormalBlending,
                fog: false,
                depthWrite: false
            });
            _cloudMaterial.userData = { isSharedAsset: true };
        }
        return _cloudMaterial;
    },

    // Sun Rays
    get sunRays(): THREE.ShaderMaterial {
        if (!_sunRaysMaterial) {
            _sunRaysMaterial = new THREE.ShaderMaterial({
                vertexShader: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        vec4 mvPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
                        vec2 scale;
                        scale.x = length(vec3(modelMatrix[0].x, modelMatrix[0].y, modelMatrix[0].z));
                        scale.y = length(vec3(modelMatrix[1].x, modelMatrix[1].y, modelMatrix[1].z));
                        
                        vec2 alignedPosition = position.xy * scale;
                        mvPosition.xy += alignedPosition;
                        gl_Position = projectionMatrix * mvPosition;
                    }
                `,
                fragmentShader: `
                    uniform float uTime;
                    uniform vec3 uColor;
                    uniform float uOpacity;
                    varying vec2 vUv;

                    float hash(float n) {
                        return fract(sin(n) * 43758.5453123);
                    }

                    float hash2(float x, float y) {
                        return fract(sin(dot(vec2(x, y), vec2(12.9898, 78.233))) * 43758.5453123);
                    }

                    void main() {
                        vec2 uv = vUv - vec2(0.5);
                        float dist = length(uv);
                        
                        // Early discard/cutoff to save fill rate
                        if (dist > 0.5) discard;

                        float angle = atan(uv.y, uv.x) + 3.14159265;

                        // 1. Tapered 12-Ray System with continuous pulsing
                        float combinedRays = 0.0;
                        for (int i = 0; i < 12; i++) {
                            float rayIdx = float(i);
                            
                            // Unique out-of-phase offsets and dynamic speeds so rays pulse independently
                            float randVal = hash(rayIdx * 17.43 + 3.14);
                            float period = mix(3.5, 5.5, randVal); // Each ray cycle lasts 3.5 to 5.5 seconds
                            float timeVal = uTime + randVal * 100.0;
                            
                            // Continuous smooth pulsing instead of discrete dormant phases (0.0 to 1.0)
                            float pulse = sin(timeVal * 6.28318530718 / period) * 0.5 + 0.5;
                            
                            // Evenly spaced target angles for this ray to ensure no empty spots, plus a slow global rotation
                            float baseAngle = (rayIdx / 12.0) * 6.28318530718 + (uTime * 0.03);
                            
                            // Ray difference
                            float diff = angle - baseAngle;
                            diff = atan(sin(diff), cos(diff)); // Wrap difference to [-PI, PI] to handle boundaries
                            
                            // Dynamic length: shoots out from sun body (base 0.08) up to a randomized max length
                            float bodySize = 0.08;
                            float minLength = bodySize + 0.08; // Never shrinks to zero
                            float maxLength = bodySize + mix(0.18, 0.42, randVal);
                            float currentLength = mix(minLength, maxLength, pulse);
                            
                            // Make bases wider so they touch and leave no empty gaps
                            float baseWidth = mix(0.22, 0.35, randVal);
                            float normalizedDist = clamp(dist / currentLength, 0.0, 1.0);
                            float rayWidth = mix(baseWidth, 0.015, normalizedDist);
                            
                            float rayVal = smoothstep(rayWidth, 0.0, abs(diff));
                            
                            // Soft fade-out towards the tip
                            float fade = smoothstep(currentLength, currentLength * 0.4, dist);
                            
                            // Ray intensity based on pulse (always partially visible to avoid gaps)
                            float rayOpacityMod = mix(0.5, 1.0, pulse);
                            float rayCont = rayVal * fade * rayOpacityMod;
                            
                            combinedRays = max(combinedRays, rayCont);
                        }

                        // 2. Fast-moving outward shimmering waves (Purely radial/temporal, no twisting/rotation)
                        float shimmer = 0.82 + 0.18 * sin(uTime * 14.0 - dist * 35.0 + sin(angle * 10.0) * 3.0);
                        
                        // 3. Edges/Center vignettes
                        float centerFade = smoothstep(0.01, 0.08, dist);
                        float finalIntensity = combinedRays * shimmer * centerFade;

                        // 4. Thermal color gradient (white/yellow core to mid color to warm orange/reddish tips)
                        vec3 coreColor = vec3(1.0, 1.0, 0.95);
                        vec3 midColor = uColor;
                        vec3 tipColor = vec3(1.0, 0.32, 0.03);

                        vec3 finalColor = mix(coreColor, midColor, smoothstep(0.06, 0.22, dist));
                        finalColor = mix(finalColor, tipColor, smoothstep(0.22, 0.48, dist));

                        gl_FragColor = vec4(finalColor, finalIntensity * uOpacity);
                    }
                `,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                fog: false,
                precision: 'highp'
            });
            // Assign pre-allocated flat uniform reference directly to avoid UniformsUtils.clone() allocation and THREE.Color instantiation
            _sunRaysMaterial.uniforms = SUN_RAYS_UNIFORMS;
            _sunRaysMaterial.userData = { isSharedAsset: true };
        }
        return _sunRaysMaterial;
    }
};
