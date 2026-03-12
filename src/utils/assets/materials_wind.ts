import * as THREE from 'three';

/**
 * Optimized vertex shader injection for instanced vegetation and trees.
 * Calculates wind deformation in World Space and transforms to Local Space.
 */
export const patchWindMaterial = <T extends THREE.Material>(material: T): T => {
    // Pre-allocate references so lazy-compilation retains the binding
    const windUniforms = {
        uTime: { value: Math.random() * 10.0 },
        uWind: { value: new THREE.Vector2(0, 0) }
    };

    material.userData.windUniforms = windUniforms;

    material.onBeforeCompile = (shader) => {
        // Safeguard against Material.clone() breaking the uniform object reference
        // Reconnects the object dynamically if it was lost during JSON deep clone
        if (!material.userData.windUniforms || typeof material.userData.windUniforms.uTime.value === 'undefined') {
            material.userData.windUniforms = {
                uTime: { value: Math.random() * 10.0 },
                uWind: { value: new THREE.Vector2(0, 0) }
            };
        }

        shader.uniforms.uTime = material.userData.windUniforms.uTime;
        shader.uniforms.uWind = material.userData.windUniforms.uWind;

        shader.vertexShader = `
            uniform float uTime;
            uniform vec2 uWind;
            ${shader.vertexShader}
        `.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            
            // Allow bending for hanging geometry (e.g., waterlily stems) too
            float h = abs(position.y);
            float bend = (h * 0.1) + (h * h * 0.02);

            // Fetch correct matrix depending on if the object is instanced
            // or a unique object.
            #ifdef USE_INSTANCING
                mat4 instanceWorldMatrix = modelMatrix * instanceMatrix;
            #else
                mat4 instanceWorldMatrix = modelMatrix;
            #endif

            // Calculate unique world position for organic noise/jitter
            vec4 wPos = instanceWorldMatrix * vec4(position, 1.0);
            float noise = sin(uTime * 1.8 + wPos.x * 0.1 + wPos.z * 0.1) * 0.04;
            vec2 windVec = uWind + (noise * 0.5);

            // Transform the wind vector from World Space to the Instance's Local Space
            mat3 invRot = transpose(mat3(instanceWorldMatrix));
            vec3 localWind = invRot * vec3(windVec.x, 0.0, windVec.y);

            // Apply vertex displacement
            transformed.x += localWind.x * bend;
            transformed.z += localWind.z * bend;
            transformed.y -= length(localWind.xz) * bend * 0.15;
            `
        );
    };

    // Force unique cache key to prevent WebGL program collision with unpatched materials
    // This entirely solves the GL_INVALID_OPERATION sampler mismatch!
    material.customProgramCacheKey = () => 'wind_patched_' + material.uuid;
    material.needsUpdate = true;

    return material;
};