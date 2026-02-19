import * as THREE from 'three';
import { TEXTURES } from './AssetLoader';
import { createProceduralDiffuse } from './procedural';
import { WaterStyleConfig } from '../../core/systems/WaterSystem';

const DIFFUSE = createProceduralDiffuse();

/**
 * Creates a highly optimized Water Shader Material.
 * Zero-GC ready: Update 'uTime.value' directly in your render loop.
 */
export function createWaterMaterial(
    config: WaterStyleConfig,
    width: number,
    depth: number,
    flowTexture: THREE.Texture,
    waveTexture: THREE.Texture,
    shape: 'rect' | 'circle' = 'rect'
): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uColor: { value: new THREE.Color(config.color) },
            uOpacity: { value: config.opacity },
            uFresnelStrength: { value: config.fresnelStrength || 0.5 },
            uFlowTexture: { value: flowTexture },
            uWaveTexture: { value: waveTexture },
            uUvScale: { value: config.uvScale || 1.0 },
            uPlaneSize: { value: new THREE.Vector2(width, depth) },
            uIsCircle: { value: shape === 'circle' ? 1.0 : 0.0 }
        },
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            varying vec2 vUv;
            varying vec3 vLocalPos; 
            uniform float uTime;

            void main() {
                vUv = uv;
                vLocalPos = position; 
                
                // 1. Calculate World Position FIRST
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                
                // 2. PERFECT SYNC: Wave math based on WORLD coordinates
                float wave = sin(worldPosition.x * 0.5 + uTime * 1.5) * 0.1 + sin(worldPosition.z * 0.4 + uTime * 1.2) * 0.1;
                worldPosition.y += wave;

                vec4 mvPosition = viewMatrix * worldPosition;
                
                vViewPosition = -mvPosition.xyz;
                vNormal = normalMatrix * normal;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3 uColor;
            uniform float uOpacity;
            uniform float uFresnelStrength;
            uniform sampler2D uFlowTexture;
            uniform sampler2D uWaveTexture;
            uniform float uUvScale;
            uniform vec2 uPlaneSize;
            uniform float uIsCircle;
            
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            varying vec2 vUv;
            varying vec3 vLocalPos;

            void main() {
                vec3 viewDir = normalize(vViewPosition);
                vec3 normal = normalize(vNormal);

                float fresnelFactor = clamp(dot(viewDir, normal), 0.0, 1.0);
                vec3 waterColor = mix(uColor * 0.6, uColor * 1.2, fresnelFactor);

                vec2 scrollUv = vUv + uTime * 0.01;
                vec2 waveDistortion = texture2D(uWaveTexture, scrollUv).rg * 2.0 - 1.0;
                
                vec2 flowUv = (vUv * uUvScale) + (waveDistortion * 0.05) + (uTime * 0.03);
                float noiseVal = texture2D(uFlowTexture, flowUv).r;
                float flowHighlight = smoothstep(0.6, 0.9, noiseVal);

                float shoreFoam = 0.0;
                if (uIsCircle > 0.5) {
                    float radius = length(vLocalPos.xz);
                    float maxRadius = uPlaneSize.x * 0.5;
                    shoreFoam = smoothstep(maxRadius * 0.8, maxRadius * 0.98, radius);
                } else {
                    vec2 edgeDist = abs(vLocalPos.xz) / (uPlaneSize * 0.5);
                    float maxEdge = max(edgeDist.x, edgeDist.y);
                    shoreFoam = smoothstep(0.8, 0.98, maxEdge); 
                }
                
                float finalFoam = max(flowHighlight * 0.3, shoreFoam);

                vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
                vec3 halfVector = normalize(lightDir + viewDir);
                float NdotH = max(0.0, dot(normal, halfVector));
                float specular = pow(NdotH, 64.0) * uFresnelStrength;

                vec3 finalColor = mix(waterColor, vec3(1.0), finalFoam);
                gl_FragColor = vec4(finalColor + vec3(specular), uOpacity);
            }
        `,
        transparent: true,
        side: THREE.FrontSide,
        depthWrite: false
    });
};

/**
 * Creates an instanced shader material for water ripples (the flat expanding ring).
 * Implements smoothstep dissolve based on instanceAlpha.
 */
export function createRippleMaterial(rippleTexture: THREE.Texture): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            tRipple: { value: rippleTexture },
            uColor: { value: new THREE.Color(0xccffff) }
        },
        vertexShader: `
            attribute float instanceAlpha;
            varying float vAlpha;
            varying vec2 vUv;
            void main() {
                vUv = uv;
                vAlpha = instanceAlpha;
                vec4 mvPosition = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform sampler2D tRipple;
            uniform vec3 uColor;
            varying float vAlpha;
            varying vec2 vUv;
            void main() {
                vec4 tex = texture2D(tRipple, vUv);
                // Erode/dissolve effect based on alpha
                float erode = smoothstep(1.0 - vAlpha - 0.1, 1.0 - vAlpha + 0.1, tex.r);
                gl_FragColor = vec4(uColor * tex.rgb, erode * vAlpha * tex.a);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
};

/**
 * Creates an instanced shader material for the radial splash (outward cone).
 * Pans the texture downwards to simulate expanding foam.
 */
export function createRadialSplashMaterial(splashTexture: THREE.Texture): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            tSplash: { value: splashTexture },
            uColor: { value: new THREE.Color(0xddffff) }
        },
        vertexShader: `
            attribute float instanceAlpha;
            varying float vAlpha;
            varying vec2 vUv;
            void main() {
                vUv = uv;
                vAlpha = instanceAlpha;
                vec4 mvPosition = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform sampler2D tSplash;
            uniform vec3 uColor;
            varying float vAlpha;
            varying vec2 vUv;
            void main() {
                // Pan texture down the cone as time (1.0 - alpha) progresses
                vec2 pannedUv = vec2(vUv.x * 2.0, vUv.y - (1.0 - vAlpha) * 1.5);
                vec4 tex = texture2D(tSplash, pannedUv);
                
                float erode = smoothstep(1.0 - vAlpha, 1.0 - vAlpha + 0.2, tex.r);
                float fadeY = smoothstep(1.0, 0.2, vUv.y); // Fade out at the top edge
                
                gl_FragColor = vec4(uColor * tex.rgb, erode * vAlpha * fadeY * tex.a);
            }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
    });
};

/**
 * Creates an instanced shader material for the upward splash (center column).
 * Pans the texture upwards.
 */
export function createUpwardSplashMaterial(splashTexture: THREE.Texture): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            tSplash: { value: splashTexture },
            uColor: { value: new THREE.Color(0xffffff) }
        },
        vertexShader: `
            attribute float instanceAlpha;
            varying float vAlpha;
            varying vec2 vUv;
            void main() {
                vUv = uv;
                vAlpha = instanceAlpha;
                vec4 mvPosition = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform sampler2D tSplash;
            uniform vec3 uColor;
            varying float vAlpha;
            varying vec2 vUv;
            void main() {
                // Pan texture up to simulate rising column
                vec2 pannedUv = vec2(vUv.x * 2.0, vUv.y + (1.0 - vAlpha) * 2.0);
                vec4 tex = texture2D(tSplash, pannedUv);
                
                float erode = smoothstep(1.0 - vAlpha, 1.0 - vAlpha + 0.3, tex.r);
                float fadeY = smoothstep(1.0, 0.0, vUv.y); // Fade out completely at the very top
                
                gl_FragColor = vec4(uColor * tex.rgb, erode * vAlpha * fadeY * tex.a * 0.8);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
};

/**
 * [VINTERDÖD] createWaterMaterial
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
            
            float h = max(0.0, position.y);
            float bend = (h * 0.1) + (h * h * 0.02);

            // [VINTERDÖD] Hämta rätt matris beroende på om objektet är instansierat (skog/gräs) 
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
    return material;
};


export const MATERIALS = {
    // ---- WEATHER PARTICLES (EJ PATCHADE - RÖRS VIA CPU) ----
    particle_snow: new THREE.MeshStandardMaterial({
        color: 0xffee00,
        transparent: false,
        emissive: 0xffffff,
        depthWrite: false,
        side: THREE.DoubleSide
    }),
    particle_rain: new THREE.MeshStandardMaterial({
        color: 0xaaaaff,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        side: THREE.DoubleSide
    }),
    particle_ash: new THREE.MeshStandardMaterial({
        color: 0x222222,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        side: THREE.DoubleSide
    }),
    particle_ember: new THREE.MeshStandardMaterial({
        color: 0xff4400,
        transparent: false,
        side: THREE.DoubleSide
    }),

    // ---- ENVIRONMENTAL (VEGETATION & TRÄD - ALLA PATCHADE) ----
    grass: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0x4a6e4a,
        roughness: 1.0,
        flatShading: true,
        side: THREE.DoubleSide
    })),
    flower: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.8,
        vertexColors: true,
        side: THREE.DoubleSide
    })),
    wheat: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        roughness: 1.0,
        flatShading: true,
        side: THREE.DoubleSide
    })),
    hedge: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0x2d4c1e,
        roughness: 0.9,
        flatShading: true
    })),
    treeSilhouette: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0x1e1e1e,
        roughness: 1.0,
        metalness: 0.0,
        flatShading: true,
        side: THREE.DoubleSide
    })),
    treeFirNeedles: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0x2d4c1e, // Deep green base
        roughness: 0.9,
        flatShading: true,
        side: THREE.DoubleSide
    })),
    treeLeavesOak: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0x4a6b30, // Green for Oak
        roughness: 0.9,
        flatShading: true,
        side: THREE.DoubleSide
    })),
    treeLeavesBirch: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0x8DA331, // Yellowish-Green for Birch
        roughness: 0.9,
        flatShading: true,
        side: THREE.DoubleSide
    })),
    treeLeaves: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0x8DA331, // Yellowish-Green for Birch
        roughness: 0.9,
        flatShading: true,
        side: THREE.DoubleSide
    })),
    treeTrunk: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0x4a3c31, // Flat dark brown
        roughness: 1.0,
        flatShading: true
    })),
    treeTrunkBirch: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.9,
        flatShading: true
    })),
    treeTrunkOak: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0x5a504a,
        roughness: 1.0,
        bumpMap: TEXTURES.bark_rough_bump,
        bumpScale: 0.1,
        flatShading: true
    })),
    deadWood: patchWindMaterial(new THREE.MeshStandardMaterial({
        color: 0x5c5046,
        roughness: 1.0,
        map: DIFFUSE.bark,
        flatShading: true
    })),

    // ---- STATISKA NATUROBJEKT (EJ PATCHADE) ----
    treeStumpTop: new THREE.MeshStandardMaterial({
        color: 0xbc8f8f,
        map: DIFFUSE.treeRings,
        roughness: 0.8
    }),
    stone: new THREE.MeshStandardMaterial({
        color: 0x888888,
        map: DIFFUSE.stone,
        roughness: 0.9,
        bumpMap: TEXTURES.stone_bump,
        bumpScale: 0.2
    }),
    ash: new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.9
    }),
    fog: new THREE.MeshBasicMaterial({
        color: 0x111116,
        transparent: true,
        opacity: 0.1,
        depthWrite: false
    }),
    hay: new THREE.MeshStandardMaterial({ color: 0xedc05d, roughness: 1.0, bumpMap: DIFFUSE.gravel, bumpScale: 0.2 }),
    logEnd: new THREE.MeshStandardMaterial({ color: 0xbc8f8f, roughness: 0.8, bumpMap: DIFFUSE.stone, bumpScale: 0.1 }),

    // ---- WEAPONS & COMBAT ----
    bullet: new THREE.MeshBasicMaterial({ color: 0xc7c7c7 }),
    grenade: new THREE.MeshStandardMaterial({ color: 0x3f663f, roughness: 0.6 }),
    molotov: new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.3, emissive: 0x331100, emissiveIntensity: 0.2 }),
    scrap: new THREE.MeshBasicMaterial({ color: 0xffaa00 }),
    zombie: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xffccaa }),
    family: new THREE.MeshStandardMaterial({ color: 0x00aaff, roughness: 0.5 }),
    familyRing: new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
    familyArrow: new THREE.MeshBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.8, depthWrite: false }),
    trackerArrow: new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
    chestStandard: new THREE.MeshStandardMaterial({ color: 0x5c4033 }),
    chestBig: new THREE.MeshStandardMaterial({ color: 0xffd700 }),
    gun: new THREE.MeshStandardMaterial({ color: 0x222222 }),

    aimCross: new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
    aimReticle: new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }),
    landingMarker: new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    fire: new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.8, depthWrite: false }),
    fireZone: new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    smoke: new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.6, depthWrite: false }),
    shockwave: new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    blastRadius: new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    flashWhite: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }),
    glassShard: new THREE.MeshBasicMaterial({ color: 0xccffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
    blood: new THREE.MeshBasicMaterial({ color: 0xaa0000 }),
    gore: new THREE.MeshStandardMaterial({ color: 0x660000, roughness: 0.2 }),

    // ---- DECALS ----
    bloodDecal: new THREE.MeshBasicMaterial({
        color: 0x660000,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -4
    }),
    bloodStainDecal: new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -2
    }),
    scorchDecal: new THREE.MeshBasicMaterial({
        color: 0x111111,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -3
    }),
    footprintDecal: new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.8,
        map: DIFFUSE.footprint,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -4
    }),

    // ---- DESIGN & BUILDINGS ----
    building: new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        roughness: 0.8,
        bumpMap: TEXTURES.concrete_bump,
        bumpScale: 0.04
    }),
    concrete: new THREE.MeshStandardMaterial({
        color: 0x444444,
        roughness: 0.9,
        bumpMap: TEXTURES.concrete_bump,
        bumpScale: 0.1
    }),
    pipe: new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.6, metalness: 0.4 }),
    mast: new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.4, metalness: 0.8, wireframe: true }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x404040, roughness: 0.7 }),
    barrelExplosive: new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.5 }),
    train: new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.6, metalness: 0.3 }),
    vehicleBody: new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.8,
        metalness: 0.1
    }),

    // ---- GROUND (ROADS, PATHS, SNOW) ----
    snow: new THREE.MeshStandardMaterial({
        color: 0xffffff, // Brighter white snow
        roughness: 1.0, // Fully diffuse
        metalness: 0.0,
        bumpMap: TEXTURES.snow_bump,
        bumpScale: 0.4,
        emissive: 0xffffff, // Subtle glow to maintain whiteness in shadows
        emissiveIntensity: 0.15
    }),
    asphalt: new THREE.MeshStandardMaterial({
        color: 0x222222,
        map: DIFFUSE.asphalt,
        roughness: 0.85,
        metalness: 0.1,
        bumpMap: TEXTURES.asphalt_bump,
        bumpScale: 0.4,
        polygonOffset: true,
        polygonOffsetFactor: -1 // Pull towards camera to prevent Z-fighting with ground
    }),
    gravel: new THREE.MeshStandardMaterial({
        color: 0x888888,
        map: DIFFUSE.gravel,
        roughness: 1.0,
        bumpMap: TEXTURES.stone_bump,
        bumpScale: 2.8,
        polygonOffset: true,
        polygonOffsetFactor: -1
    }),
    dirt: new THREE.MeshStandardMaterial({
        color: 0x4a3b32,
        map: DIFFUSE.gravel,
        roughness: 1.0,
        bumpMap: TEXTURES.stone_bump,
        bumpScale: 2.8,
        polygonOffset: true,
        polygonOffsetFactor: -1
    }),
    frost: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1.0,
        alphaMap: DIFFUSE.frostAlpha,
        roughness: 0.2,
        metalness: 0.1,
        bumpMap: TEXTURES.snow_bump,
        bumpScale: 0.1,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1
    }),

    // ---- BUILDING MATERIALS ----
    steel: new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.4, metalness: 0.8 }),
    redWood: new THREE.MeshStandardMaterial({ color: 0x8a2be2, roughness: 0.9 }),
    brick: new THREE.MeshStandardMaterial({
        roughness: 0.95,
        bumpMap: TEXTURES.brick_bump,
        bumpScale: 0.06
    }),
    whiteBrick: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.9,
        bumpMap: TEXTURES.brick_bump,
        bumpScale: 0.05
    }),
    yellowBrick: new THREE.MeshStandardMaterial({
        color: 0xd4c685,
        roughness: 0.95,
        bumpMap: TEXTURES.brick_bump,
        bumpScale: 0.06
    }),
    brownBrick: new THREE.MeshStandardMaterial({
        color: 0x5c4033,
        roughness: 0.95,
        bumpMap: TEXTURES.brick_bump,
        bumpScale: 0.06
    }),
    glass: new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.6 }),
    glassBroken: new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.4, metalness: 0.5 }),
    metalPanel: new THREE.MeshStandardMaterial({ color: 0x778899, roughness: 0.3, metalness: 0.7 }),
    neonSign: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    plaster: new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.9,
        bumpMap: TEXTURES.concrete_bump,
        bumpScale: 0.05
    }),
    wood: new THREE.MeshStandardMaterial({
        color: 0x111111,
        map: DIFFUSE.wood,
        roughness: 0.9,
        bumpMap: DIFFUSE.containerMetal,
        bumpScale: 0.1
    }),
    wooden_fasade: new THREE.MeshStandardMaterial({
        color: 0x111111,
        map: DIFFUSE.wood,
        roughness: 0.9,
        bumpMap: DIFFUSE.containerMetal,
        bumpScale: 0.1
    }),
    sheet_metal: new THREE.MeshStandardMaterial({
        color: 0x666666,
        map: DIFFUSE.containerMetal,
        roughness: 0.4,
        metalness: 0.6
    }),
    blackMetal: new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 0.6, roughness: 0.4 }),
    crossEmissive: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.0 }),
    container: new THREE.MeshStandardMaterial({
        color: 0x888888,
        map: DIFFUSE.containerMetal,
        roughness: 0.6,
        metalness: 0.5
    }),
    guardrail: new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.4,
        metalness: 0.8
    }),
    skidMark: new THREE.MeshBasicMaterial({
        color: 0x050505,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3
    }),
    fenceMesh: new THREE.MeshStandardMaterial({
        map: DIFFUSE.fenceMesh,
        transparent: true,
        alphaTest: 0.4,
        side: THREE.DoubleSide,
        roughness: 0.3,
        metalness: 0.8
    })
};