import * as THREE from 'three';

export function createFogMaterial(initialColor: THREE.Color): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: initialColor.clone() },
            uTime: { value: 0.0 },
            uDensity: { value: 1.0 }
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vWorldPos;

            void main() {
                vUv = uv;
                
                // 1. Hämta position och skala från InstancedMesh-matrisen
                vec3 offset = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
                float scale = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));

                // 2. GPU Billboarding: Lås alltid rotationen så den tittar rakt in i kameran
                vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
                vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

                vec3 vertexPos = (camRight * position.x * scale) + (camUp * position.y * scale);
                
                // 3. Applicera världskoordinaterna
                vec4 worldPosition = vec4(vertexPos + offset, 1.0);
                vWorldPos = worldPosition.xyz;

                gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 uColor;
            uniform float uTime;
            uniform float uDensity;

            varying vec2 vUv;
            varying vec3 vWorldPos;

            void main() {
                // Gör partikeln cirkelformad och mjuk i kanterna
                vec2 center = vUv - 0.5;
                float dist = length(center);
                float circleFade = smoothstep(0.5, 0.1, dist);

                // SOFT CLIPPING: Tona ut mjukt om dimman nuddar marken (Y=0) eller går för högt
                float heightFade = smoothstep(-1.0, 1.5, vWorldPos.y) * smoothstep(12.0, 4.0, vWorldPos.y);

                // Organiskt, rullande brus inuti partikeln
                float wave = sin(vUv.x * 4.0 + uTime) * cos(vUv.y * 4.0 - uTime);
                float noise = wave * 0.4 + 0.6; // Normalisera

                // Kombinera allt
                float alpha = circleFade * heightFade * noise * uDensity;

                // Aggressiv discard för att rädda Fill Rate på grafikkortet
                if (alpha < 0.02) discard;

                gl_FragColor = vec4(uColor, alpha);
            }
        `,
        transparent: true,
        depthWrite: false, // Mycket viktigt för partiklar!
        blending: THREE.NormalBlending
    });
}