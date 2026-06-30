import * as THREE from 'three';
import { TEXTURES } from './AssetLoader';
import { WATER_SYSTEM } from '../../content/constants';
import { WaterShape } from '../../types/WaterTypes';

// Safe fallback texture to satisfy WebGL samplers before the image loads
const dummyNoise = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, THREE.RGBAFormat);
dummyNoise.colorSpace = THREE.SRGBColorSpace;
dummyNoise.needsUpdate = true;

// ============================================================================
// WATER GEOMETRY POOL (Eliminates main-thread blocking during sector load)
// ============================================================================
const _geometryCache = new Map<string, THREE.PlaneGeometry>();

export const WaterGeometryPool = {
    getGeometry(width: number, depth: number, shape: WaterShape): THREE.PlaneGeometry {
        const key = `${shape}_${width}_${depth}`;
        let geo = _geometryCache.get(key);
        if (!geo) {
            const res = Math.min(128, Math.max(32, Math.floor(Math.max(width, depth) * 0.8)));
            const w = shape === WaterShape.CIRCLE ? Math.max(width, depth) : width;
            const d = shape === WaterShape.CIRCLE ? Math.max(width, depth) : depth;
            geo = new THREE.PlaneGeometry(w, d, res, res);
            geo.rotateX(-Math.PI / 2);
            _geometryCache.set(key, geo);
        }
        return geo;
    },

    clear(): void {
        for (const geo of _geometryCache.values()) {
            geo.dispose();
        }
        _geometryCache.clear();
    }
};

// ============================================================================
// SHARED VEGETATION UNIFORMS (Bypasses per-material allocations)
// ============================================================================
export const SHARED_WATER_VEG_UNIFORMS = {
    uTime: { value: 0.0 },
    uWaterDirection: { value: new THREE.Vector2(1.0, 0.0) },
    uWaveStrength: { value: 1.0 }
};

// Pre-allocated static colors to prevent GC thrashing inside shader uniforms
const WATER_BASE_COLOR = new THREE.Color(0x10479a);
const WATER_SHALLOW_COLOR = new THREE.Color(0xaaccff);
const WATER_FOAM_COLOR = new THREE.Color(0xffffff);

// ============================================================================
// WATER UNIFORMS INTERFACE (Typed for V8 hidden-class monomorphization)
// ============================================================================
export interface WaterUniforms {
    uTime: { value: number };
    uWaveStrength: { value: number };
    uBaseColor: { value: THREE.Color };
    uShallowColor: { value: THREE.Color };
    uFoamColor: { value: THREE.Color };
    uPlaneSize: { value: THREE.Vector2 };
    uIsCircle: { value: number };
    uWaterDepth: { value: number };
    uRipples: { value: THREE.Vector4[] };
    uObjectPositions: { value: THREE.Vector4[] };
    uLightPosition: { value: THREE.Vector3 };
    uSkyLightColor: { value: THREE.Color };
    uSkyLightIntensity: { value: number };
    uWaterDirection: { value: THREE.Vector2 };
    uNoiseTexture: { value: THREE.Texture };
    [key: string]: THREE.IUniform;
}

// Pre-allocated Vector templates for per-surface uniforms — written once per WaterSurface init
// Each surface still gets its own Vector2/Vector3 (values differ per body), but we use a
// clean constructor pattern instead of anonymous inline object literals.
const _mkV2 = (x: number, y: number) => new THREE.Vector2(x, y);
const _mkV3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// Module-level template: 8 inactive cutout markers (w < 0 = disabled in GLSL)
const _cutoutBodiesTemplate: THREE.Vector4[] = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, -1));

const _mkCutoutBodies = (): THREE.Vector4[] =>
    Array.from({ length: 8 }, (_, i) => _cutoutBodiesTemplate[i].clone());

/**
 * Modifies a standard material to physically cut out holes (discard pixels)
 * where water bodies exist, preventing Z-fighting and allowing water depth.
 */
export function patchCutoutMaterial<T extends THREE.Material>(mat: T): T {
    // Allocate 8 Vector4s from the module-level template — cleaner than Array.fill().map()
    mat.userData.uWaterBodies = { value: _mkCutoutBodies() };

    mat.onBeforeCompile = (shader) => {
        // No defensive re-allocation — userData is always set above before compilation
        shader.uniforms.uWaterBodies = mat.userData.uWaterBodies;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `varying vec3 vWorldPos_Cutout;\n#include <common>`
        ).replace(
            '#include <worldpos_vertex>',
            `#include <worldpos_vertex>
            vec4 cutoutWorldPosition = vec4( transformed, 1.0 );
            #ifdef USE_INSTANCING
                cutoutWorldPosition = instanceMatrix * cutoutWorldPosition;
            #endif
            vWorldPos_Cutout = (modelMatrix * cutoutWorldPosition).xyz;`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `uniform vec4 uWaterBodies[8];\nvarying vec3 vWorldPos_Cutout;\n#include <common>`
        ).replace(
            '#include <clipping_planes_fragment>',
            `#include <clipping_planes_fragment>
            for(int i = 0; i < 8; i++) {
                vec4 water = uWaterBodies[i];
                if (water.w < -0.5) continue; // Inactive water body
                
                float dist = length(vWorldPos_Cutout.xz - water.xy);
                if (water.w > 0.5) { // Circular cutout
                    if (dist < water.z) discard;
                } else { // Rectangular cutout (z is half-width/depth)
                    if (abs(vWorldPos_Cutout.x - water.x) < water.z && abs(vWorldPos_Cutout.z - water.y) < water.z) discard;
                }
            }`
        );
    };

    mat.customProgramCacheKey = () => 'ground_cutout_material_' + mat.uuid;
    mat.needsUpdate = true;
    return mat;
}

// ============================================================================
// WATER SHADER DEFINITIONS
// ============================================================================
const vertexShader = `
    uniform float uTime;
    uniform float uWaveStrength;
    uniform vec2 uWaterDirection;
    uniform vec4 uRipples[${WATER_SYSTEM.MAX_RIPPLES}];
    uniform sampler2D uNoiseTexture; 
    uniform vec2 uPlaneSize;
    uniform float uIsCircle;
    
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vWorldPos;
    varying vec3 vLocalPos;
    varying float vWaveHeight;
    varying vec2 vUV;

    void main() {
        vLocalPos = position;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        
        float waveScale = 0.45;
        // Incorporate wind direction/force into wave movement
        float windDot = dot(worldPosition.xz, normalize(uWaterDirection));
        float phaseWind = windDot * waveScale;
        float speedFactor = 0.5 + uWaveStrength * 0.5;
        
        float w1 = pow(max(0.0, sin(phaseWind - uTime * 1.2 * speedFactor) * 0.5 + 0.5), 3.2) * 0.45;
        float w2 = pow(max(0.0, sin(phaseWind * 0.7 - uTime * 0.9 * speedFactor) * 0.5 + 0.5), 2.5) * 0.35;
        
        // Edge dampening to keep shores calm
        float edgeDist = 0.0;
        if (uIsCircle > 0.5) {
            edgeDist = (uPlaneSize.x * 0.5) - length(position.xz);
        } else {
            edgeDist = min((uPlaneSize.x * 0.5) - abs(position.x), (uPlaneSize.y * 0.5) - abs(position.z));
        }
        float edgeDampen = smoothstep(0.0, 2.0, max(0.0, edgeDist));
        
        float baseWave = (w1 + w2) * uWaveStrength * edgeDampen;
        float noiseDetail = texture2D(uNoiseTexture, worldPosition.xz * 0.1).r;
        
        // Process dynamic ripples and columns
        float rippleSum = 0.0;
        float columnSum = 0.0;
        for(int i = 0; i < ${WATER_SYSTEM.MAX_RIPPLES}; i++) {
            vec4 rip = uRipples[i];
            if (rip.z < -100.0) continue; 
            
            float d = distance(worldPosition.xz, rip.xy);
            float age = (uTime * 1000.0) - rip.z;
            
            // 1. Water Column / Splash Geyser (for strong impacts/explosions)
            if (rip.w > 1.5 && age > 0.0 && age < 1200.0) {
                float progress = age / 1200.0;
                float colHeight = sin(progress * 3.14159) * (rip.w * 3.0); 
                float colRadius = 0.5 + (1.0 - progress) * (rip.w * 0.6); 
                
                if (d < colRadius) {
                    float radialFactor = 1.0 - (d / colRadius);
                    float colNoise = texture2D(uNoiseTexture, worldPosition.xz * 0.15 + vec2(0.0, uTime * 2.0)).r;
                    columnSum += colHeight * radialFactor * (0.6 + colNoise * 0.8);
                }
            }
            
            // 2. Normal expanding Ripple
            if (age > 0.0 && age < 3000.0) {
                float radius = (age / 1000.0) * 4.0;
                if (abs(d - radius) < 1.0) {
                    float decay = max(0.0, 1.0 - (age / 3000.0));
                    float ringNoise = texture2D(uNoiseTexture, worldPosition.xz * 0.05 + uTime * 0.1).r;
                    float safeStrength = clamp(rip.w, 0.0, 1.5); 
                    rippleSum += max(0.0, sin((d - radius) * 6.0 + ringNoise * 2.0)) * safeStrength * decay;
                }
            }
        }

        // Hard clamp to protect physics from wild math spikes, but allow water column to rise
        vWaveHeight = baseWave + clamp(rippleSum * 0.25, -0.6, 0.6) + columnSum + (noiseDetail * 0.05) * edgeDampen;
        worldPosition.y += vWaveHeight;

        vWorldPos = worldPosition.xyz;
        vUV = uv;

        vec4 mvPosition = viewMatrix * worldPosition;
        vViewPosition = -mvPosition.xyz;
        vNormal = normalMatrix * normal;
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const fragmentShader = `
    uniform float uTime;
    uniform vec3 uBaseColor;
    uniform vec3 uShallowColor;
    uniform vec3 uFoamColor;
    uniform vec3 uLightPosition;
    uniform vec3 uSkyLightColor;
    uniform float uSkyLightIntensity;
    uniform vec4 uObjectPositions[${WATER_SYSTEM.MAX_FLOATING_OBJECTS}];
    uniform vec2 uPlaneSize;
    uniform float uIsCircle;
    uniform float uWaterDepth;
    uniform sampler2D uNoiseTexture;
    
    varying vec2 vUV;
    varying vec3 vViewPosition;
    varying vec3 vWorldPos;
    varying vec3 vLocalPos;
    varying float vWaveHeight;

    void main() {
        float distToEdge;
        if (uIsCircle > 0.5) {
            float radialDist = length(vLocalPos.xz);
            if (radialDist > uPlaneSize.x * 0.5) discard;
            distToEdge = uPlaneSize.x * 0.5 - radialDist;
        } else {
            distToEdge = min(uPlaneSize.x * 0.5 - abs(vLocalPos.x), uPlaneSize.y * 0.5 - abs(vLocalPos.z));
        }

        float depthFactor = smoothstep(0.0, uWaterDepth, distToEdge);
        
        // Calculate procedural normals based on world position derivatives (Low Poly look)
        vec3 fdx = dFdx(vWorldPos);
        vec3 fdy = dFdy(vWorldPos);
        vec3 normal = normalize(cross(fdx, fdy));
        
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 lightDir = normalize(uLightPosition);
        vec3 halfDir = normalize(lightDir + viewDir);
        
        // LIGHTING & WAVE SHIMMERING
        float lightDot = max(dot(normal, lightDir), 0.0);
        float faceGlow = pow(lightDot, 5.0) * 0.3; 
        
        // Dynamic spec based on sky intensity and noise for a shimmering/sparkling wave effect
        float shimmerNoise = texture2D(uNoiseTexture, vWorldPos.xz * 0.5 + vec2(uTime * 0.1, uTime * 0.08)).r;
        float specSize = mix(32.0, 128.0, shimmerNoise);
        float spec = pow(max(dot(normal, halfDir), 0.0), specSize) * (0.8 + shimmerNoise * 0.4);
        float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 4.0) * 1.5; // Fresnel
        
        // Absorb light from SkySystem (intensity & color)
        vec3 reflectedSkyColor = uSkyLightColor * uSkyLightIntensity;
        vec3 specularCol = (reflectedSkyColor + vec3(1.0)) * (faceGlow + spec + rim * 0.5);
        
        // Base Color interpolation
        vec3 waterColor = mix(uShallowColor, uBaseColor, depthFactor);

        // Add specular additively
        waterColor += specularCol;

        // --- Wave Crest Lines (Vågtoppar) ---
        float normalizedHeight = vWaveHeight;
        float crestLine = smoothstep(0.35, 0.48, normalizedHeight);
        float crestNoise = texture2D(uNoiseTexture, vWorldPos.xz * 0.15 - uTime * 0.05).r;
        crestLine *= smoothstep(0.2, 0.8, crestNoise);
        
        // Mix in a bright color strictly at the peaks, modulated by sky light
        vec3 crestColor = mix(uShallowColor, mix(vec3(1.0), uSkyLightColor, 0.5), 0.8);
        waterColor += crestColor * crestLine * max(0.2, lightDot);
        
        // --- OPTIMIZED FOAM CALCULATION ---
        float objProximity = 0.0;
        for(int i = 0; i < ${WATER_SYSTEM.MAX_FLOATING_OBJECTS}; i++) {
            vec4 op = uObjectPositions[i];
            if (op.w > 0.0) {
                float dist = distance(vWorldPos.xz, op.xy);
                float prox = 1.0 - smoothstep(op.z * 0.2, op.z * 1.5, dist);
                objProximity += prox * op.w;
            }
        }

        // ONE single texture lookup for all foam (Objects + Shore)
        float foamNoise = texture2D(uNoiseTexture, vWorldPos.xz * 0.15 - uTime * 0.05).r;
        
        // Calculate Object Foam
        float objFoam = smoothstep(0.3, 0.7, objProximity * foamNoise);

        // Calculate Shoreline Foam
        float breathe = sin(uTime * 0.8) * 0.2;
        float shoreStroke = step(0.96, 1.0 - (distToEdge / (1.8 + breathe)));
        float shoreFoam = shoreStroke * smoothstep(0.2, 0.8, foamNoise);
        
        // Combine and apply Foam
        float finalFoam = clamp(shoreFoam + objFoam, 0.0, 1.0);
        vec3 finalColor = mix(waterColor, uFoamColor, finalFoam);
        
        // Fixed Opacity mapping
        float defaultOpacity = mix(0.3, 0.8, depthFactor);
        
        gl_FragColor = vec4(finalColor, defaultOpacity);
    }
`;

/**
 * Creates an advanced, interactive water shader material.
 * Highly optimized: Removed unused styles, clamped physics, and reduced texture lookups.
 */
export function createWaterMaterial(
    width: number,
    depth: number,
    ripples: THREE.Vector4[],
    objectPositions: THREE.Vector4[],
    shape: WaterShape = WaterShape.RECT
): THREE.ShaderMaterial {
    const mat = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Assign typed uniform layout directly to bypass UniformsUtils.clone() overhead
    const uniforms: WaterUniforms = {
        uTime: { value: 0.0 },
        uWaveStrength: { value: 1.0 },
        uBaseColor: { value: WATER_BASE_COLOR },
        uShallowColor: { value: WATER_SHALLOW_COLOR },
        uFoamColor: { value: WATER_FOAM_COLOR },
        uPlaneSize: { value: _mkV2(width, depth) },
        uIsCircle: { value: shape === WaterShape.CIRCLE ? 1.0 : 0.0 },
        uWaterDepth: { value: 2.0 },
        uRipples: { value: ripples },
        uObjectPositions: { value: objectPositions },
        uLightPosition: { value: _mkV3(10, 20, 10) },
        uSkyLightColor: { value: new THREE.Color(0xffffff) },
        uSkyLightIntensity: { value: 1.0 },
        uWaterDirection: { value: _mkV2(1, 0) },
        uNoiseTexture: { value: TEXTURES.water_ripple || dummyNoise }
    };
    mat.uniforms = uniforms;

    return mat;
}

/**
 * Patches vegetation materials (like reeds or water lilies) to sway correctly 
 * with the water flow based on global water direction and time.
 */
export const patchWaterVegetationMaterial = <T extends THREE.Material>(material: T): T => {
    material.userData.waterUniforms = SHARED_WATER_VEG_UNIFORMS;

    material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = SHARED_WATER_VEG_UNIFORMS.uTime;
        shader.uniforms.uWaterDirection = SHARED_WATER_VEG_UNIFORMS.uWaterDirection;
        shader.uniforms.uWaveStrength = SHARED_WATER_VEG_UNIFORMS.uWaveStrength;

        shader.vertexShader = `
            uniform float uTime;
            uniform vec2 uWaterDirection;
            uniform float uWaveStrength;
            ${shader.vertexShader}
        `.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            
            float h = abs(position.y);
            float bend = (h * 0.15) + (h * h * 0.03); 

            #ifdef USE_INSTANCING
                mat4 instanceWorldMatrix = modelMatrix * instanceMatrix;
            #else
                mat4 instanceWorldMatrix = modelMatrix;
            #endif

            vec4 wPos = instanceWorldMatrix * vec4(position, 1.0);
            
            float waveScale = 0.45;
            float phaseXZ = wPos.x + wPos.z;
            
            float flowVelocity = cos(phaseXZ * waveScale - uTime * 1.0);
            float crossVelocity = cos(phaseXZ * 0.7 - uTime * 0.8);

            float waveSway = flowVelocity * (0.6 * uWaveStrength);
            float crossSway = crossVelocity * (0.25 * uWaveStrength);

            // Calculate directional offset
            vec3 worldOffset = vec3(
                uWaterDirection.x * waveSway - uWaterDirection.y * crossSway, 
                0.0, 
                uWaterDirection.y * waveSway + uWaterDirection.x * crossSway
            ) * bend;
            
            // Inverse transform back to local space
            mat3 m = mat3(instanceWorldMatrix);
            vec3 scaleSq = vec3(dot(m[0], m[0]), dot(m[1], m[1]), dot(m[2], m[2]));
            mat3 invMat = transpose(mat3(m[0] / scaleSq.x, m[1] / scaleSq.y, m[2] / scaleSq.z));

            transformed += invMat * worldOffset;
            `
        );
    };

    material.customProgramCacheKey = () => 'water_veg_mat_' + material.uuid;
    material.needsUpdate = true;
    return material;
};
