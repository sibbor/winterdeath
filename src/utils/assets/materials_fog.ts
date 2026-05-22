import * as THREE from 'three';

/**
 * Volumetric Fog Uniforms interface
 */
export interface FogUniforms {
    uColor: { value: THREE.Color };
    uTime: { value: number };
    uDensity: { value: number };
    uWind: { value: THREE.Vector2 };
    uDepthTexture: { value: THREE.Texture | null };
    uResolution: { value: THREE.Vector2 };
    uCameraNear: { value: number };
    uCameraFar: { value: number };
    [key: string]: THREE.IUniform;
}

// Pre-allocated static uniforms (Bypasses THREE.UniformsUtils.clone() overhead)
export const FOG_UNIFORMS: FogUniforms = {
    uColor: { value: new THREE.Color(0.7, 0.75, 0.8) },
    uTime: { value: 0.0 },
    uDensity: { value: 1.0 },
    uWind: { value: new THREE.Vector2(0, 0) },
    uDepthTexture: { value: null },
    uResolution: { value: new THREE.Vector2(1024, 1024) },
    uCameraNear: { value: 0.1 },
    uCameraFar: { value: 1000.0 }
};

const vertexShader = `
    varying vec2 vUv;
    varying vec3 vWorldPos;
    varying float vViewZ;

    void main() {
        vUv = uv;
        
        // 1. Transform plane to horizontal (XZ) and apply instance scaling
        // PlaneGeometry is XY, we map X->X and Y->Z
        vec3 localPos = vec3(position.x, 0.0, position.y);
        
        // Extract instance data
        vec3 offset = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float scale = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));

        vWorldPos = offset + (localPos * scale);
        
        // 2. Project to screen
        vec4 mvPosition = viewMatrix * vec4(vWorldPos, 1.0);
        vViewZ = mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const fragmentShader = `
    #include <packing>

    uniform vec3 uColor;
    uniform float uTime;
    uniform float uDensity;
    uniform vec2 uWind;
    uniform sampler2D uDepthTexture;
    uniform vec2 uResolution;
    uniform float uCameraNear;
    uniform float uCameraFar;

    varying vec2 vUv;
    varying vec3 vWorldPos;
    varying float vViewZ;

    float getLinearDepth(vec2 coord) {
        float fragCoordZ = texture2D(uDepthTexture, coord).x;
        return perspectiveDepthToViewZ(fragCoordZ, uCameraNear, uCameraFar);
    }

    void main() {
        // 1. Circular mask for the plane
        float dist = length(vUv - 0.5);
        float edgeFade = smoothstep(0.5, 0.1, dist);

        // 2. Depth Clipping (Soft intersection with world geometry)
        // VINTERDÖD FIX: Inject epsilon to prevent X4008 division-by-zero warnings
        vec2 screenUV = gl_FragCoord.xy / (uResolution + 0.0001);
        float sceneViewZ = getLinearDepth(screenUV);
        
        // sceneViewZ and vViewZ are negative (Three.js view-space)
        float depthDiff = vViewZ - sceneViewZ;
        
        // Fades from 0 to 1 over 1.5 units of distance.
        float softFade = smoothstep(0.0, 1.5, depthDiff);

        // 3. Smoke Noise & Wind Drift
        vec2 drift = uWind * uTime * 0.15;
        vec2 uv1 = vWorldPos.xz * 0.08 + drift;
        vec2 uv2 = vWorldPos.xz * 0.04 - drift * 0.5;
        
        float n1 = sin(uv1.x) * cos(uv1.y);
        float n2 = sin(uv2.x + uTime * 0.5) * cos(uv2.y);
        float smokeNoise = (n1 * 0.5 + 0.5) * (n2 * 0.5 + 0.5);

        // 4. Ground/Height Fade
        float heightFade = smoothstep(6.0, 0.0, vWorldPos.y);

        float alpha = edgeFade * softFade * smokeNoise * heightFade * uDensity;

        if (alpha < 0.01) discard;

        gl_FragColor = vec4(uColor, alpha);
    }
`;

let _fogMaterial: THREE.ShaderMaterial | null = null;

export const MATERIALS_FOG = {
    getMaterial(): THREE.ShaderMaterial {
        if (!_fogMaterial) {
            _fogMaterial = new THREE.ShaderMaterial({
                vertexShader,
                fragmentShader,
                transparent: true,
                depthWrite: false,
                depthTest: false, // Occlusion is handled manually via uDepthTexture in fragment shader
                blending: THREE.NormalBlending
            });
            _fogMaterial.uniforms = FOG_UNIFORMS;
            _fogMaterial.userData = { isSharedAsset: true };
        }
        return _fogMaterial;
    },

    dispose(): void {
        if (_fogMaterial) {
            _fogMaterial.dispose();
            _fogMaterial = null;
        }
    }
};
