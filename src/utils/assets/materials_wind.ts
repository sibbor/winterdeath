import * as THREE from 'three';

/**
 * Optimazed vertex shader injection for instanced vegetation and trees.
 * Calculates wind deformation in World Space and transforms to Local Space.
 */
export const patchWindMaterial = <T extends THREE.Material>(material: T): T => {    // Pre-allokera referenserna så lazy-compilation inte sabbar bindningen
    const windUniforms = {
        uTime: { value: 0 },
        uWind: { value: new THREE.Vector2(0, 0) }
    };

    material.userData.windUniforms = windUniforms;

    material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = windUniforms.uTime;
        shader.uniforms.uWind = windUniforms.uWind;

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

            // Hämta rätt matris beroende på om objektet är instansierat (skog/gräs) 
            // eller ett unikt objekt (t.ex. en dynamisk boss eller spelaren).
            #ifdef USE_INSTANCING
                mat4 instanceWorldMatrix = modelMatrix * instanceMatrix;
            #else
                mat4 instanceWorldMatrix = modelMatrix;
            #endif

            // Beräkna unik position i världen för organiskt brus/darr
            vec4 wPos = instanceWorldMatrix * vec4(position, 1.0);
            float noise = sin(uTime * 1.8 + wPos.x * 0.1 + wPos.z * 0.1) * 0.04;
            vec2 windVec = uWind + (noise * 0.5);

            // [VINTERDÖD] Omvandla vindvektorn från World Space till Instansens Local Space
            mat3 invRot = transpose(mat3(instanceWorldMatrix));
            vec3 localWind = invRot * vec3(windVec.x, 0.0, windVec.y);

            // Applicera vertex-förskjutning
            transformed.x += localWind.x * bend;
            transformed.z += localWind.z * bend;
            transformed.y -= length(localWind.xz) * bend * 0.15;
            `
        );
    };
    // Start at random time phase so instances are out of sync based on their creation
    windUniforms.uTime.value = Math.random() * 10.0;
    return material;
};