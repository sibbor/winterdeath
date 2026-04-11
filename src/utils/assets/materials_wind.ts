import * as THREE from 'three';

/**
 * Optimized vertex shader injection for instanced vegetation and trees.
 * Calculates wind deformation in World Space and transforms to Local Space.
 */
export const patchWindMaterial = <T extends THREE.Material>(material: T): T => {
    // Pre-allocate references so lazy-compilation retains the binding
    const windUniforms = {
        uTime: { value: Math.random() * 10.0 },
        uWind: { value: new THREE.Vector2(0, 0) },
        uInteractors: { value: new Array(8).fill(null).map(() => new THREE.Vector4(0, 0, 0, 0)) }
    };

    material.userData.windUniforms = windUniforms;

    material.onBeforeCompile = (shader) => {
        if (!material.userData.windUniforms || typeof material.userData.windUniforms.uTime.value === 'undefined') {
            material.userData.windUniforms = {
                uTime: { value: Math.random() * 10.0 },
                uWind: { value: new THREE.Vector2(0, 0) },
                uInteractors: { value: new Array(8).fill(null).map(() => new THREE.Vector4(0, 0, 0, 0)) }
            };
        }

        shader.uniforms.uTime = material.userData.windUniforms.uTime;
        shader.uniforms.uWind = material.userData.windUniforms.uWind;
        shader.uniforms.uInteractors = material.userData.windUniforms.uInteractors;

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
            
            // VINTERDÖD: Non-linear curve (Square Root) gives small objects a "head start" 
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
                    float push = (1.0 - (d / interactor.w)) * 0.9; // Increased push intensity
                    bendVec += normalize(diff) * push;
                }
            }

            // Combine Wind + Interaction
            // VINTERDÖD: Global wind boost for better visibility on small tufts
            vec3 vWind = vec3(uWind.x, 0.0, uWind.y) * 2.2; 
            vec3 vBend = vec3(bendVec.x, 0.0, bendVec.y);

            // Transform vectors from World Space to the Instance's Local Space
            // VINTERDÖD: Normalize basis vectors to ignore instance scale (prevents squashed bending)
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
    material.customProgramCacheKey = () => 'wind_patched_' + material.uuid;
    material.needsUpdate = true;

    return material;
};