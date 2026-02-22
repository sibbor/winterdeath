import * as THREE from 'three';

export interface WaterStyleConfig {
    color: number;
    shallowColor?: number;
    opacity: number;
    roughness: number;
    metalness: number;
    fresnelStrength?: number;
    clarity?: number;
}

export const WATER_STYLES: Record<'nordic' | 'ice', WaterStyleConfig> = {
    nordic: { color: 0x10479a, shallowColor: 0xaaccff, opacity: 0.7, roughness: 0.2, metalness: 0.1, fresnelStrength: 1.8, clarity: 0.85 },
    ice: { color: 0x8ba6b5, shallowColor: 0xcfffff, opacity: 0.85, roughness: 0.1, metalness: 0.1, fresnelStrength: 2.0, clarity: 1.0 }
};

const MAX_RIPPLES = 16;
const MAX_OBJECTS = 8;

export function patchCutoutMaterial<T extends THREE.Material>(mat: T): T {
    // Pre-declare uniform object to permanently anchor it to the material instance
    mat.userData.uWaterBodies = { value: Array(8).fill(null).map(() => new THREE.Vector4(0, 0, 0, -1)) };

    mat.onBeforeCompile = (shader) => {
        // Guarantee we pass the exact referenced pointer to the shader
        shader.uniforms.uWaterBodies = mat.userData.uWaterBodies;

        // 1. Inject Varying and calculation into Vertex Shader
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

        // 2. Inject Uniform & Logic into Fragment Shader
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `uniform vec4 uWaterBodies[8];\nvarying vec3 vWorldPos_Cutout;\n#include <common>`
        ).replace(
            '#include <clipping_planes_fragment>',
            `#include <clipping_planes_fragment>
            for(int i = 0; i < 8; i++) {
                vec4 water = uWaterBodies[i];
                if (water.w < -0.5) continue; // Inactive
                
                float dist = length(vWorldPos_Cutout.xz - water.xy);
                if (water.w > 0.5) { // Circle
                    if (dist < water.z) discard;
                } else { // Rect (z is radius/half-width)
                    if (abs(vWorldPos_Cutout.x - water.x) < water.z && abs(vWorldPos_Cutout.z - water.y) < water.z) discard;
                }
            }
            `
        );
    };

    mat.customProgramCacheKey = () => 'ground_cutout_material';
    mat.needsUpdate = true;
    return mat;
}

export function createWaterMaterial(
    styleName: 'nordic' | 'ice',
    width: number,
    depth: number,
    ripples: THREE.Vector4[],
    objectPositions: THREE.Vector4[],
    shape: 'rect' | 'circle' = 'rect'
): THREE.ShaderMaterial {
    const config = WATER_STYLES[styleName];
    const colors = { base: config.color, shallow: config.shallowColor || config.color };

    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uWaveStrength: { value: 1.0 },
            uBaseColor: { value: new THREE.Color(colors.base) },
            uShallowColor: { value: new THREE.Color(colors.shallow) },
            uFoamColor: { value: new THREE.Color(0xffffff) },
            uOpacity: { value: config.opacity },
            uRoughness: { value: config.roughness },
            uMetalness: { value: config.metalness },
            uFresnelStrength: { value: config.fresnelStrength || 1.8 },
            uPlaneSize: { value: new THREE.Vector2(width, depth) },
            uIsCircle: { value: shape === 'circle' ? 1.0 : 0.0 },
            uWaterDepth: { value: 2.0 }, // Visibility depth in meters
            uClarity: { value: config.clarity !== undefined ? config.clarity : 1.0 }, // 0.0 = muddy opaque, 1.0 = clear glass
            uRipples: { value: ripples },
            uObjectPositions: { value: objectPositions },
            uLightPosition: { value: new THREE.Vector3() },
            uWaterDirection: { value: new THREE.Vector2(1, 0) },
            uNoiseTexture: { value: null }
        },
        vertexShader: `
            uniform float uTime;
            uniform float uWaveStrength;
            uniform vec2 uWaterDirection;
            uniform vec4 uRipples[${MAX_RIPPLES}];
            uniform sampler2D uNoiseTexture; // Added for vertex displacement micro-detail
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
                
                // Hyper-Sharp Stylized Waves (Ridges)
                // Moving in uWaterDirection
                float waveScale = 0.45;
                
                // Project local coordinate onto wave direction
                float phaseXZ = dot(worldPosition.xz, uWaterDirection);
                
                // Higher pow (3.2) for sharp "V-shaped" peaks
                float w1 = pow(sin(phaseXZ * waveScale - uTime * 1.5) * 0.5 + 0.5, 3.2) * 0.45;
                // Add minor cross-turbulence
                float w2 = pow(sin(phaseXZ * (waveScale * 1.6) + worldPosition.z * 0.2 - uTime * 2.0) * 0.5 + 0.5, 2.5) * 0.22;
                
                // --- EDGE DAMPENING ---
                // Flatten waves near the shore to prevent looking under the mesh
                float edgeDist = 0.0;
                if (uIsCircle > 0.5) {
                    edgeDist = (uPlaneSize.x * 0.5) - length(position.xz);
                } else {
                    edgeDist = min((uPlaneSize.x * 0.5) - abs(position.x), (uPlaneSize.y * 0.5) - abs(position.z));
                }
                float edgeDampen = smoothstep(0.0, 2.0, max(0.0, edgeDist));
                
                float baseWave = (w1 + w2) * uWaveStrength * edgeDampen;
                
                // Interactive Ripples (UPWARD ONLY)
                // Add noise-based micro-waves to the peaks for faceted detail
                float noiseDetail = texture2D(uNoiseTexture, worldPosition.xz * 0.1).r;
                
                float rippleSum = 0.0;
                for(int i = 0; i < ${MAX_RIPPLES}; i++) {
                    vec4 rip = uRipples[i];
                    if (rip.z < -100.0) continue; // Uninitialized
                    
                    float d = distance(worldPosition.xz, rip.xy);
                    float t = uTime - rip.z;
                    if (t > 0.0 && t < 3.0) {
                        float radius = t * 4.0; // Fast expanding ring
                        if (abs(d - radius) < 1.0) {
                            float decay = max(0.0, 1.0 - (t / 3.0));
                            // Distort the ripple ring with the noise texture
                            float ringNoise = texture2D(uNoiseTexture, worldPosition.xz * 0.05 + uTime * 0.1).r;
                            rippleSum += max(0.0, sin((d - radius) * 6.0 + ringNoise * 2.0)) * rip.w * decay;
                        }
                    }
                }

                vWaveHeight = baseWave + ((rippleSum * 0.25) + (noiseDetail * 0.05)) * edgeDampen;
                worldPosition.y += vWaveHeight;

                vWorldPos = worldPosition.xyz;
                vUV = uv;

                vec4 mvPosition = viewMatrix * worldPosition;
                vViewPosition = -mvPosition.xyz;
                vNormal = normalMatrix * normal;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3 uBaseColor;
            uniform vec3 uShallowColor;
            uniform vec3 uFoamColor;
            uniform float uOpacity;
            uniform float uRoughness;
            uniform float uMetalness;
            uniform float uFresnelStrength;
            uniform vec3 uLightPosition;
            uniform vec4 uObjectPositions[${MAX_OBJECTS}];
            uniform vec2 uPlaneSize;
            uniform float uIsCircle;
            uniform float uWaterDepth;
            uniform float uClarity;
            uniform sampler2D uNoiseTexture;
            
            varying vec2 vUV;
            varying vec3 vViewPosition;
            varying vec3 vWorldPos;
            varying vec3 vLocalPos;
            varying float vWaveHeight;

            void main() {
                // High-Quality Clipping & Shore SDF
                float distToEdge;
                if (uIsCircle > 0.5) {
                    float radialDist = length(vLocalPos.xz);
                    if (radialDist > uPlaneSize.x * 0.5) discard;
                    distToEdge = uPlaneSize.x * 0.5 - radialDist;
                } else {
                    distToEdge = min(uPlaneSize.x * 0.5 - abs(vLocalPos.x), uPlaneSize.y * 0.5 - abs(vLocalPos.z));
                }

                // --- 1. DEPTH & OPACITY ---
                // Fade depth visibility based on the uniform parameter. Areas deeper than uWaterDepth will become opaque.
                float depthFactor = smoothstep(0.0, uWaterDepth, distToEdge);
                
                // Muddy Lake Bed Fog (Clarity)
                // We want to control the murkiness mathematically using uClarity.
                // A clarity of 1.0 means no fog/mud unless depth is theoretically infinite.
                // A clarity of 0.0 means immediate mud.
                float fogStartDepth = mix(0.0, uWaterDepth * 2.0, uClarity); 
                float fogFactor = smoothstep(fogStartDepth, uWaterDepth * 2.5, distToEdge) * (1.0 - uClarity);
                
                // Opacity increases as fog gets thicker, obscuring the bottom
                float defaultOpacity = mix(0.15, uOpacity, depthFactor);
                float finalOpacity = mix(defaultOpacity, 1.0, fogFactor);

                // --- 2. FLAT SHADED NORMALS (Jewelry Look) ---
                vec3 fdx = dFdx(vWorldPos);
                vec3 fdy = dFdy(vWorldPos);
                vec3 normal = normalize(cross(fdx, fdy));
                vec3 viewDir = normalize(cameraPosition - vWorldPos);
                
                // --- 3. HYPER-SENSITIVE LIGHT SENSITIVITY ---
                vec3 lightDir = normalize(uLightPosition);
                vec3 halfDir = normalize(lightDir + viewDir);
                
                // Stationary noise for surface detail
                float noise = texture2D(uNoiseTexture, vWorldPos.xz * 0.1).r;
                
                // HYPER-SENSITIVE LIGHT SENSITIVITY
                // This is the "Jewelry" effect: entire triangles pop as solid light
                float lightDot = dot(normal, lightDir);
                float faceGlow = step(0.4, lightDot) * 0.85; // Lower threshold to catch more wave facets
                
                // Specular glints only on the very sharpest edges
                float spec = pow(max(dot(normal, halfDir), 0.0), 24.0) * (0.6 + 0.5 * noise);
                
                float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0) * uFresnelStrength;
                
                vec3 specularCol = vec3(1.0, 1.0, 1.0) * (faceGlow + spec * 2.0 + rim * 0.6);

                // --- 4. COLOR MIXING ---
                // Scatter color highlights the slopes
                float scatter = clamp(vWaveHeight * 2.5, 0.0, 0.4) * max(0.0, dot(normal, lightDir));
                
                // Muddy Lake Bed Color (Clarity)
                // Blend from shallow clear color, to base clear color, and finally into murky fog color
                vec3 clearWater = mix(uShallowColor, uBaseColor, depthFactor);
                vec3 muddyWater = vec3(0.12, 0.18, 0.10); // Dark murky green/brown
                vec3 waterColor = mix(clearWater, muddyWater, fogFactor);

                // Add sub-surface scattering highlights to peaks
                waterColor = mix(waterColor, waterColor + scatter, 0.6);
                // Sky-light catch for the "wavy form"
                float skyCatch = max(0.0, normal.y * 0.1); 
                waterColor += skyCatch * uShallowColor * (1.0 - depthFactor);
                
                waterColor = mix(waterColor, waterColor + specularCol, 0.9);

                // --- 5. SINGLE FAST RADIAL FOAM PULSE (Growing Texture logic) ---
                float breathe = sin(uTime * 1.2) * 0.2;
                float shoreStroke = step(0.96, 1.0 - (distToEdge / (1.8 + breathe)));
                
                float objFoam = 0.0;
                float pulseTime = uTime * 0.24; 
                
                for(int i = 0; i < ${MAX_OBJECTS}; i++) {
                    vec4 op = uObjectPositions[i];
                    if (op.w > 0.0) {
                        vec2 localPos = vWorldPos.xz - op.xy;
                        float dist = length(localPos);
                        
                        // Larger spread (12m to 24m)
                        float peakPos = mod(pulseTime * 12.0, 24.0);
                        
                        // EXPANDING UVs: More dramatic scale
                        // Texture pattern looks bigger and spreads more
                        float uvScale = 1.0 / (peakPos * 0.5 + 1.0);
                        vec2 objUV = localPos * uvScale + 0.5;
                        
                        // KILL TILING: Keep edge safe
                        float edgeMask = smoothstep(0.5, 0.45, length(objUV - 0.5));
                        float foamTex = texture2D(uNoiseTexture, objUV).r * edgeMask;
                        
                        // THINNER but stronger pulse
                        float organicDist = dist + foamTex * 1.5;
                        // peak radius is wider
                        float ringMask = smoothstep(2.5, 0.0, abs(organicDist - peakPos) * 1.0);
                        
                        // Wider Proximity: Spread much more (10m instead of 5.0m)
                        float proximity = 1.0 - smoothstep(op.z, op.z + 10.0 + breathe, dist);
                        float pulseFade = 1.0 - smoothstep(18.0, 24.0, peakPos);
                        
                        // Noticeably lower threshold to show more of the ring
                        float stylizedRings = step(0.15, ringMask * proximity * pulseFade * foamTex);
                        
                        objFoam = max(objFoam, stylizedRings * op.w);
                    }
                }
                float finalFoam = clamp(shoreStroke + objFoam, 0.0, 1.0);
                vec3 finalColor = mix(waterColor, uFoamColor, finalFoam * 0.95);
                gl_FragColor = vec4(finalColor, finalOpacity);
            }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });
}

/**
 * Optimized vertex shader injection for underwater vegetation and waterlilies.
 * Animates slowly based on current/wave timings instead of gusty wind.
 */
/**
 * Optimized vertex shader injection for underwater vegetation and waterlilies.
 * Animates in perfect sync with the WaterSystem wave mechanics.
 */
export const patchWaterVegetationMaterial = <T extends THREE.Material>(material: T): T => {
    const waterUniforms = {
        uTime: { value: 0 },
        uWaterDirection: { value: new THREE.Vector2(1, 0) },
        uWaveStrength: { value: 1.0 }
    };

    material.userData.waterUniforms = waterUniforms;

    material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = waterUniforms.uTime;
        shader.uniforms.uWaterDirection = waterUniforms.uWaterDirection;
        shader.uniforms.uWaveStrength = waterUniforms.uWaveStrength;

        shader.vertexShader = `
            uniform float uTime;
            uniform vec2 uWaterDirection;
            uniform float uWaveStrength;
            ${shader.vertexShader}
        `.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            
            // Bend factor based on height (bottom of mesh is anchored, top sways)
            float h = abs(position.y);
            float bend = (h * 0.15) + (h * h * 0.03); // Slightly increased bend for visual impact

            #ifdef USE_INSTANCING
                mat4 instanceWorldMatrix = modelMatrix * instanceMatrix;
            #else
                mat4 instanceWorldMatrix = modelMatrix;
            #endif

            vec4 wPos = instanceWorldMatrix * vec4(position, 1.0);
            
            // --- SYNC WITH WATER SYSTEM WAVES ---
            float waveScale = 0.45;
            float phaseXZ = dot(wPos.xz, uWaterDirection);
            
            // Use 'cos' (derivative of the water's 'sin' wave) to simulate the 
            // push-and-pull (orbital current) of the water mass beneath the surface.
            float flowVelocity = cos(phaseXZ * waveScale - uTime * 1.5);
            float crossVelocity = cos(phaseXZ * (waveScale * 1.6) + wPos.z * 0.2 - uTime * 2.0);

            float waveSway = flowVelocity * (0.6 * uWaveStrength);
            float crossSway = crossVelocity * (0.25 * uWaveStrength);

            vec3 worldOffset = vec3(
                uWaterDirection.x * waveSway - uWaterDirection.y * crossSway, 
                0.0, 
                uWaterDirection.y * waveSway + uWaterDirection.x * crossSway
            ) * bend;
            
            // ROBUST INVERS: Korrekt hantering av InstancedMesh-skalning (Zero-GC)
            mat3 m = mat3(instanceWorldMatrix);
            vec3 scaleSq = vec3(dot(m[0], m[0]), dot(m[1], m[1]), dot(m[2], m[2]));
            mat3 invMat = transpose(mat3(m[0] / scaleSq.x, m[1] / scaleSq.y, m[2] / scaleSq.z));

            transformed += invMat * worldOffset;
            `
        );
    };

    material.customProgramCacheKey = () => 'water_veg_mat';
    material.needsUpdate = true;
    return material;
}