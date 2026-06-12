import * as THREE from 'three';

// ============================================================================
// SHARED UNIFORM TYPES & PRE-ALLOCATED STRUCTS
// ============================================================================

/**
 * Canonical typed interface for all wind shader uniforms.
 * Exported so WindSystem can import the type instead of maintaining a local duplicate.
 */
export interface WindUniforms {
    uTime: { value: number };
    uWind: { value: THREE.Vector2 };
    uInteractors: { value: THREE.Vector4[] };
}

const _buildInteractors = (): THREE.Vector4[] =>
    Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0));

// One pre-allocated struct per wind behavior variant — no allocation ever at patch-time
export const TREE_WIND_UNIFORMS: WindUniforms = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2() },
    uInteractors: { value: _buildInteractors() }
};

export const GRASS_WIND_UNIFORMS: WindUniforms = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2() },
    uInteractors: { value: _buildInteractors() }
};

export const HEDGE_WIND_UNIFORMS: WindUniforms = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2() },
    uInteractors: { value: _buildInteractors() }
};

/**
 * Optimized vertex shader injection for trees.
 * Calculates wind deformation in World Space and transforms to Local Space.
 */
export const patchTreeWindMaterial = <T extends THREE.Material>(material: T): T => {
    // Assign pre-allocated shared struct — zero allocation per patch call
    material.userData.windUniforms = TREE_WIND_UNIFORMS;

    material.onBeforeCompile = (shader) => {
        // Bind directly from the pre-allocated struct — no defensive re-allocation needed
        shader.uniforms.uTime = TREE_WIND_UNIFORMS.uTime;
        shader.uniforms.uWind = TREE_WIND_UNIFORMS.uWind;
        shader.uniforms.uInteractors = TREE_WIND_UNIFORMS.uInteractors;

        shader.vertexShader = `
            uniform float uTime;
            uniform vec2 uWind;
            uniform vec4 uInteractors[8];
            ${shader.vertexShader}
        `.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            
            #ifdef USE_INSTANCING
                mat4 iMat = modelMatrix * instanceMatrix;
            #else
                mat4 iMat = modelMatrix;
            #endif

            vec4 wPos = iMat * vec4(position, 1.0);
            
            // Calculate height-based bend factor (h=0 at base, h=1 for grass, h=4-7 for trees)
            float h = abs(position.y);
            
            // Non-linear curve (Square Root) gives small objects a "head start" 
            // while tapering off for tall objects.
            // Grass (h=1) -> ~0.8 (Very reactive)
            // Trees (h=5) -> ~1.5 (Tapered, stable)
            float bendFactor = (h * -0.05) + (pow(h, 0.5) * 0.85);

            // Calculate repulsion from interactors
            vec2 bendVec = vec2(0.0);
            for (int i = 0; i < 8; i++) {
                vec4 interactor = uInteractors[i];
                if (interactor.w <= 0.01) continue;
                
                vec2 diff = wPos.xz - interactor.xz;
                float d = length(diff);
                if (d < interactor.w) {
                    float push = (1.0 - (d / interactor.w)) * 0.35; // Reduced push for stiff trees
                    bendVec += normalize(diff) * push;
                }
            }

            // Combine Wind + Interaction + High-frequency Sway (Noise)
            // We use uTime to create a natural fluttering effect even when base wind is static.
            float sway = sin(uTime * 1.5 + wPos.x * 0.5 + wPos.z * 0.5) * 0.1;
            float flutter = cos(uTime * 3.2 + wPos.x * 1.2) * 0.05;
            
            float windStrength = length(uWind);
            vec2 windDir = windStrength > 0.001 ? normalize(uWind) : vec2(0.0, 1.0);
            
            // Prioritize sway along wind direction
            vec3 vWind = vec3(uWind.x, 0.0, uWind.y) * 2.0; 
            vWind += vec3(windDir.x * sway, 0.0, windDir.y * sway) * (0.5 + bendFactor * 0.5);
            vWind += vec3(flutter, 0.0, -flutter) * (0.2 + bendFactor * 0.2); // Perpendicular flutter
            
            vec3 vBend = vec3(bendVec.x, 0.0, bendVec.y);
            
            // Transform vectors from World Space to the Instance's Local Space
            mat3 basis = mat3(iMat);
            mat3 normalMatrix = mat3(normalize(basis[0]), normalize(basis[1]), normalize(basis[2]));
            mat3 invRot = transpose(normalMatrix);

            vec3 localWind = invRot * vWind;
            vec3 localBend = invRot * vBend;

            // Apply displacement
            transformed.xyz += (localWind + localBend) * bendFactor;
            
            // Subtle "squash" effect when bending to preserve some perceived volume
            transformed.y -= length(localWind.xz + localBend.xz) * bendFactor * 0.2;
            `
        );
    };

    // Force unique cache key to prevent WebGL program collision with unpatched materials
    // This entirely solves the GL_INVALID_OPERATION sampler mismatch!
    material.customProgramCacheKey = () => 'tree_wind_patched_' + material.uuid;
    material.needsUpdate = true;

    return material;
};

/**
 * Specialized wind patch for highly flexible ground flora (Grass, Flowers, Wheat).
 * Implements an exponential bend curve and dramatic interactor parting.
 */
export const patchGrassWindMaterial = <T extends THREE.Material>(material: T): T => {
    // Assign pre-allocated shared struct — zero allocation per patch call
    material.userData.windUniforms = GRASS_WIND_UNIFORMS;

    material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = GRASS_WIND_UNIFORMS.uTime;
        shader.uniforms.uWind = GRASS_WIND_UNIFORMS.uWind;
        shader.uniforms.uInteractors = GRASS_WIND_UNIFORMS.uInteractors;

        shader.vertexShader = `
            uniform float uTime;
            uniform vec2 uWind;
            uniform vec4 uInteractors[8];
            ${shader.vertexShader}
        `.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            
            #ifdef USE_INSTANCING
                mat4 iMat = modelMatrix * instanceMatrix;
            #else
                mat4 iMat = modelMatrix;
            #endif

            vec4 wPos = iMat * vec4(position, 1.0);
            
            // Exponential Grass Bend.
            // Anchored at base (y=0), highly reactive at tips.
            float h = max(0.0, position.y);
            float bendFactor = pow(h, 1.5) * 1.2;

            // Calculate AGGRESSIVE repulsion from interactors (Players/Vehicles)
            vec2 bendVec = vec2(0.0);
            for (int i = 0; i < 8; i++) {
                vec4 interactor = uInteractors[i];
                if (interactor.w <= 0.01) continue;
                
                vec2 diff = wPos.xz - interactor.xz;
                float d = length(diff);
                if (d < interactor.w) {
                    // Dramatic parting effect
                    float push = (1.0 - (d / interactor.w)) * 1.8; 
                    bendVec += normalize(diff) * push;
                }
            }

            // Combine Wind + High Interaction + Grass Flutter
            float sway = sin(uTime * 2.2 + wPos.x * 0.8) * 0.08;
            float flutter = cos(uTime * 4.5 + wPos.z * 1.5) * 0.04;

            float windStrength = length(uWind);
            vec2 windDir = windStrength > 0.001 ? normalize(uWind) : vec2(0.0, 1.0);

            // Scale wind displacement dynamically. If wind is stormy (large windStrength),
            // allow stronger bending, but keep it very low during calm/moderate weather.
            float windScale = 0.3 + pow(windStrength, 2.0) * 1.5;
            vec3 vWind = vec3(uWind.x, 0.0, uWind.y) * windScale; 
            vWind += vec3(windDir.x * sway, 0.0, windDir.y * sway) * (0.2 + bendFactor * 0.3);
            vWind += vec3(flutter, 0.0, -flutter) * (0.1 + bendFactor * 0.1);
            
            vec3 vBend = vec3(bendVec.x, 0.0, bendVec.y);

            // Transform to Local Space
            mat3 basis = mat3(iMat);
            mat3 normalMatrix = mat3(normalize(basis[0]), normalize(basis[1]), normalize(basis[2]));
            mat3 invRot = transpose(normalMatrix);

            vec3 localWind = invRot * vWind;
            vec3 localBend = invRot * vBend;

            // Apply displacement
            transformed.xyz += (localWind + localBend) * bendFactor;
            
            // Volume preservation
            transformed.y -= length(localWind.xz + localBend.xz) * bendFactor * 0.25;
            `
        );
    };

    material.customProgramCacheKey = () => 'grass_wind_patched_' + material.uuid;
    material.needsUpdate = true;

    return material;
};

/**
 * Specialized wind patch for Hedges.
 * Implements high stiffness and a hard clamp on displacement to prevent "spaghetti" swaying 
 * on tall, single-geometry boxes.
 */
export const patchHedgeWindMaterial = <T extends THREE.Material>(material: T): T => {
    // Assign pre-allocated shared struct — zero allocation per patch call
    material.userData.windUniforms = HEDGE_WIND_UNIFORMS;

    material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = HEDGE_WIND_UNIFORMS.uTime;
        shader.uniforms.uWind = HEDGE_WIND_UNIFORMS.uWind;
        shader.uniforms.uInteractors = HEDGE_WIND_UNIFORMS.uInteractors;

        shader.vertexShader = `
            uniform float uTime;
            uniform vec2 uWind;
            uniform vec4 uInteractors[8];
            ${shader.vertexShader}
        `.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            
            #ifdef USE_INSTANCING
                mat4 iMat = modelMatrix * instanceMatrix;
            #else
                mat4 iMat = modelMatrix;
            #endif

            vec4 wPos = iMat * vec4(position, 1.0);
            
            // Hedge Stiffness logic.
            // Hedges are dense; they should only sway subtly.
            // position.y is 0..1 (from SHARED_GEO.hedgeBox)
            float stiffness = 0.05;
            float swayFactor = max(0.0, position.y) * stiffness;

            // Global wind vector (scaled for visibility)
            vec3 vWind = vec3(uWind.x, 0.0, uWind.y) * 2.5; 

            // Transform wind to local space
            mat3 basis = mat3(iMat);
            mat3 normalMatrix = mat3(normalize(basis[0]), normalize(basis[1]), normalize(basis[2]));
            mat3 invRot = transpose(normalMatrix);
            vec3 localWind = invRot * vWind;

            // Calculate final displacement and CLAMP it to prevent unrealistic bending.
            // Max displacement in local X/Z plane is 0.2 meters.
            vec3 disp = localWind * swayFactor;
            float maxDisp = 0.2;
            
            // Smoothly clamp the displacement
            float dispLen = length(disp.xz);
            if (dispLen > maxDisp) {
                disp.xz = normalize(disp.xz) * maxDisp;
            }

            transformed.xyz += disp;
            
            // Volume preservation (squash)
            transformed.y -= length(disp.xz) * 0.1;
            `
        );
    };

    material.customProgramCacheKey = () => 'hedge_wind_patched_' + material.uuid;
    material.needsUpdate = true;

    return material;
};
