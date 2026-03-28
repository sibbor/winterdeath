import * as THREE from 'three';

/**
 * Creates the procedural volumetric soft fog shader material.
 * Highly optimized for fill-rate performance while compensating for top-down camera angles.
 */
export function createFogMaterial(initialColor: THREE.Color): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: initialColor.clone() },
            uCameraTilt: { value: 0.0 },
            uTime: { value: 0.0 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 uColor;
            uniform float uCameraTilt;
            uniform float uTime;
            varying vec2 vUv;
            
            void main() {
                vec2 centered = vUv - 0.5;
                
                // Procedural organic warping to make it look like wispy clouds instead of perfect spheres
                float wave = sin(centered.x * 12.0 + uTime) * cos(centered.y * 12.0 + uTime) * 0.15;
                float dist = length(centered) * 2.0 + wave;
                
                // Soft fade out to prevent hard clipping with the ground
                float alpha = smoothstep(1.0, 0.2, dist) * 0.12; 
                
                // Dynamically boost density when viewed from top-down to compensate for lost volumetric depth accumulation
                alpha *= (1.0 + (uCameraTilt * 4.0));

                if (alpha <= 0.01) discard; // Save fill rate
                gl_FragColor = vec4(uColor, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending
    });
}
