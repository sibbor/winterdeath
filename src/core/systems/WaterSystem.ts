import * as THREE from 'three';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
// Kept outside the class to avoid memory allocation during runtime.
const _tempColor = new THREE.Color();
const _buoyancyResult = { inWater: false, waterLevel: 0 };
const _activeRipples: WaterRipple[] = [];
const _dummyMatrix = new THREE.Matrix4();
const _dummyPosition = new THREE.Vector3();
const _dummyScale = new THREE.Vector3();
const _dummyRotation = new THREE.Quaternion();

// ===================================================================
// WATER RIPPLE (Pooled Physical Data)
// ===================================================================
class WaterRipple {
    position: THREE.Vector2 = new THREE.Vector2();
    radius: number = 0;
    maxRadius: number = 5;
    speed: number = 3;
    amplitude: number = 0.2;
    active: boolean = false;

    spawn(x: number, z: number, maxRadius: number = 5, amplitude: number = 0.2): void {
        this.position.set(x, z);
        this.radius = 0;
        this.maxRadius = maxRadius;
        this.amplitude = amplitude;
        this.active = true;
    }

    update(dt: number): void {
        if (!this.active) return;
        this.radius += 3 * dt;
        if (this.radius >= this.maxRadius) this.active = false;
    }

    getDisplacement(x: number, z: number): number {
        const dx = x - this.position.x;
        const dz = z - this.position.y;
        const distSq = dx * dx + dz * dz;

        const outerLimit = (this.radius + 1.0);
        const innerLimit = Math.max(0, this.radius - 1.0);

        if (distSq > outerLimit * outerLimit || distSq < innerLimit * innerLimit) return 0;

        const dist = Math.sqrt(distSq);
        const edgeDist = Math.abs(dist - this.radius);
        const falloff = 1.0 - edgeDist;
        const fade = 1.0 - (this.radius / this.maxRadius);

        return this.amplitude * falloff * fade * Math.sin(this.radius * 2);
    }
}

// ===================================================================
// WATER STYLES
// ===================================================================
export type WaterStyle = 'crystal' | 'nordic' | 'ice';

interface WaterStyleConfig {
    color: number;
    opacity: number;
    roughness: number;
    metalness: number;
    fresnelStrength?: number;
    uvScale?: number;
}

const WATER_STYLES: Record<WaterStyle, WaterStyleConfig> = {
    crystal: { color: 0x0077be, opacity: 0.85, roughness: 0.1, metalness: 0.0, fresnelStrength: 0.3, uvScale: 4.0 },
    nordic: { color: 0x1a3a52, opacity: 0.95, roughness: 0.3, metalness: 0.0, fresnelStrength: 0.2, uvScale: 6.0 },
    ice: { color: 0xd0e8f0, opacity: 0.9, roughness: 0.05, metalness: 0.3, fresnelStrength: 0.5, uvScale: 3.0 }
};

// ===================================================================
// WATER SURFACE
// ===================================================================
export class WaterSurface {
    mesh: THREE.Mesh;
    material: THREE.ShaderMaterial;
    bounds: { x: number, z: number, width: number, depth: number };
    style: WaterStyle;
    time: number = 0;

    constructor(
        x: number,
        z: number,
        width: number,
        depth: number,
        waveTexture: THREE.Texture,
        foamTexture: THREE.Texture,
        style: WaterStyle = 'crystal',
        shape: 'rect' | 'circle' = 'rect'
    ) {
        this.bounds = { x, z, width, depth };
        this.style = style;
        const config = WATER_STYLES[style];

        let geometry: THREE.BufferGeometry;

        if (shape === 'circle') {
            const radius = Math.max(width, depth) / 2;
            geometry = new THREE.CircleGeometry(radius, 64);
            geometry.rotateX(-Math.PI / 2);
        } else {
            const segments = Math.max(32, Math.floor(Math.min(width, depth) / 2));
            geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
            geometry.rotateX(-Math.PI / 2);
        }

        this.mesh = new THREE.Mesh(geometry, null as any);
        this.mesh.position.set(x, 0.05, z);

        const posAttribute = geometry.attributes.position;
        const uvs = new Float32Array(posAttribute.count * 2);
        for (let i = 0; i < posAttribute.count; i++) {
            uvs[i * 2] = (posAttribute.getX(i) + x) / 10.0;
            uvs[i * 2 + 1] = (posAttribute.getZ(i) + z) / 10.0;
        }
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(config.color) },
                uOpacity: { value: config.opacity },
                uFresnelStrength: { value: config.fresnelStrength || 0.5 },
                uFoamTexture: { value: foamTexture },
                uWaveTexture: { value: waveTexture },
                uUvScale: { value: config.uvScale || 5.0 },
                uPlaneSize: { value: new THREE.Vector2(width, depth) }
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vViewPosition;
                varying vec2 vUv;
                varying vec3 vWorldPosition;
                varying vec3 vLocalPos; 
                uniform float uTime;

                void main() {
                    vUv = uv;
                    vLocalPos = position; 
                    vec3 pos = position;
                    
                    float wave = sin(pos.x * 0.5 + uTime * 1.5) * 0.1 + sin(pos.z * 0.4 + uTime * 1.2) * 0.1;
                    pos.y += wave;

                    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
                    vec4 mvPosition = viewMatrix * worldPosition;
                    
                    vWorldPosition = worldPosition.xyz;
                    vViewPosition = -mvPosition.xyz;
                    vNormal = normalMatrix * normal;
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                uniform float uOpacity;
                uniform float uFresnelStrength;
                uniform sampler2D uFoamTexture;
                uniform sampler2D uWaveTexture;
                uniform float uUvScale;
                uniform vec2 uPlaneSize;
                
                varying vec3 vNormal;
                varying vec3 vViewPosition;
                varying vec2 vUv;
                varying vec3 vLocalPos;

                void main() {
                    vec3 viewDir = normalize(vViewPosition);
                    vec3 normal = normalize(vNormal);

                    float fresnelFactor = clamp(dot(viewDir, normal), 0.0, 1.0);
                    vec3 waterColor = mix(uColor * 0.6, uColor * 1.2, fresnelFactor);

                    vec2 scrollUv = vUv + uTime * 0.02;
                    vec2 waveDistortion = texture2D(uWaveTexture, scrollUv).rg * 2.0 - 1.0;
                    
                    vec2 foamUv = (vUv * uUvScale) + (waveDistortion * 0.1) + (uTime * 0.05);

                    float noiseVal = texture2D(uFoamTexture, foamUv).r;
                    float foam = smoothstep(0.45, 0.55, noiseVal);

                    vec2 edgeDist = abs(vLocalPos.xz) / (uPlaneSize * 0.5);
                    float maxEdge = max(edgeDist.x, edgeDist.y);
                    float shoreFoam = smoothstep(0.8, 0.98, maxEdge); 
                    
                    float finalFoam = max(foam, shoreFoam);

                    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
                    vec3 halfVector = normalize(lightDir + viewDir);
                    float NdotH = max(0.0, dot(normal, halfVector));
                    float specular = pow(NdotH, 64.0) * uFresnelStrength;

                    vec3 finalColor = mix(waterColor, vec3(1.0), finalFoam * 0.8);
                    gl_FragColor = vec4(finalColor + vec3(specular), uOpacity);
                }
            `,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        this.mesh.material = this.material;
        this.mesh.receiveShadow = true;
        this.mesh.userData.material = 'WATER';
    }

    update(dt: number): void {
        this.time += dt;
        this.material.uniforms.uTime.value = this.time;
    }

    applyRippleDisplacement(ripples: WaterRipple[]): void {
        let activeCount = 0;
        const rippleLen = ripples.length;
        for (let i = 0; i < rippleLen; i++) {
            if (ripples[i].active) {
                _activeRipples[activeCount++] = ripples[i];
            }
        }

        if (activeCount === 0) return;

        const geometry = this.mesh.geometry as THREE.BufferGeometry;
        const position = geometry.attributes.position;
        const posArray = position.array as Float32Array;
        const count = position.count;

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            const worldX = posArray[i3] + this.mesh.position.x;
            const worldZ = posArray[i3 + 2] + this.mesh.position.z;

            let y = Math.sin(worldX * 0.5 + this.time * 1.5) * 0.1 + Math.sin(worldZ * 0.4 + this.time * 1.2) * 0.1;

            for (let j = 0; j < activeCount; j++) {
                y += _activeRipples[j].getDisplacement(worldX, worldZ);
            }

            posArray[i3 + 1] = y;
        }

        position.needsUpdate = true;
    }

    contains(x: number, z: number): boolean {
        const halfW = this.bounds.width * 0.5;
        const halfD = this.bounds.depth * 0.5;
        return x >= this.bounds.x - halfW && x <= this.bounds.x + halfW &&
            z >= this.bounds.z - halfD && z <= this.bounds.z + halfD;
    }

    dispose(): void {
        this.mesh.geometry.dispose();
        this.material.dispose();
    }
}

// ===================================================================
// WATER SYSTEM
// ===================================================================
export class WaterSystem {
    surfaces: WaterSurface[] = [];
    ripplePool: WaterRipple[] = [];
    poolIndex: number = 0;

    // Visual Instanced Meshes
    visualRipples: THREE.InstancedMesh | null = null;

    private scene: THREE.Scene;
    private waveTexture: THREE.Texture;
    private foamTexture: THREE.Texture;
    private rippleTexture: THREE.Texture;

    // Graphic Ripple State
    private maxGraphicRipples = 40;
    private graphicRippleAges = new Float32Array(this.maxGraphicRipples);
    private graphicRippleMaxAges = new Float32Array(this.maxGraphicRipples);
    private graphicRippleAlphas = new Float32Array(this.maxGraphicRipples);
    private graphicRippleCount = 0;

    // [VINTERDÖD] Direct cached reference to the attribute to avoid slow map-lookups 
    // inside the hot update loop and to bypass TypeScript union errors entirely.
    private graphicRippleAlphaAttr!: THREE.InstancedBufferAttribute;

    constructor(scene: THREE.Scene, poolSize: number = 30) {
        this.scene = scene;

        // 1. ASSET LOADING
        const textureLoader = new THREE.TextureLoader();

        this.waveTexture = textureLoader.load('/assets/textures/water_wave.png');
        this.waveTexture.wrapS = THREE.RepeatWrapping;
        this.waveTexture.wrapT = THREE.RepeatWrapping;

        this.foamTexture = textureLoader.load('/assets/textures/water_foam.png');
        this.foamTexture.wrapS = THREE.RepeatWrapping;
        this.foamTexture.wrapT = THREE.RepeatWrapping;

        this.rippleTexture = textureLoader.load('/assets/textures/water_ripple.png');

        // 2. PHYSICAL RIPPLE POOL
        for (let i = 0; i < poolSize; i++) this.ripplePool.push(new WaterRipple());

        // 3. VISUAL RIPPLE INSTANCED MESH
        this.setupVisualRipples();
    }

    private setupVisualRipples(): void {
        const geometry = new THREE.PlaneGeometry(1, 1);
        geometry.rotateX(-Math.PI / 2); // Lay flat on water

        const material = new THREE.ShaderMaterial({
            uniforms: { uTex: { value: this.rippleTexture } },
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
                uniform sampler2D uTex;
                varying float vAlpha;
                varying vec2 vUv;
                void main() {
                    vec4 tex = texture2D(uTex, vUv);
                    gl_FragColor = vec4(tex.rgb, tex.a * vAlpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.visualRipples = new THREE.InstancedMesh(geometry, material, this.maxGraphicRipples);
        this.visualRipples.count = 0;
        this.visualRipples.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        // [VINTERDÖD] Instantiate the attribute, set usage directly, and cache the reference.
        // This solves the TypeScript error and speeds up our update loop.
        this.graphicRippleAlphaAttr = new THREE.InstancedBufferAttribute(this.graphicRippleAlphas, 1);
        this.graphicRippleAlphaAttr.setUsage(THREE.DynamicDrawUsage);

        // Attach the completely configured attribute to the geometry.
        this.visualRipples.geometry.setAttribute('instanceAlpha', this.graphicRippleAlphaAttr);

        this.visualRipples.position.y = 0.06; // Just slightly above the water mesh
        this.scene.add(this.visualRipples);
    }

    addSurface(x: number, z: number, width: number, depth: number, style: WaterStyle = 'crystal', shape: 'rect' | 'circle' = 'circle'): WaterSurface {
        const surface = new WaterSurface(x, z, width, depth, this.waveTexture, this.foamTexture, style, shape);
        this.surfaces.push(surface);
        this.scene.add(surface.mesh);
        return surface;
    }

    spawnRipple(x: number, z: number, maxRadius: number = 3, amplitude: number = 0.15): void {
        const ripple = this.ripplePool[this.poolIndex];
        ripple.spawn(x, z, maxRadius, amplitude);
        this.poolIndex = (this.poolIndex + 1) % this.ripplePool.length;

        if (this.graphicRippleCount < this.maxGraphicRipples && this.visualRipples) {
            const idx = this.graphicRippleCount;
            this.graphicRippleAges[idx] = 0;
            this.graphicRippleMaxAges[idx] = maxRadius * 0.5;

            _dummyPosition.set(x, 0, z);
            _dummyRotation.identity();
            _dummyScale.set(0.1, 0.1, 0.1);
            _dummyMatrix.compose(_dummyPosition, _dummyRotation, _dummyScale);

            this.visualRipples.setMatrixAt(idx, _dummyMatrix);
            this.graphicRippleAlphas[idx] = 1.0;

            this.graphicRippleCount++;
        }
    }

    update(dt: number): void {
        const poolLen = this.ripplePool.length;
        for (let i = 0; i < poolLen; i++) this.ripplePool[i].update(dt);

        const surfLen = this.surfaces.length;
        for (let i = 0; i < surfLen; i++) {
            const s = this.surfaces[i];
            s.update(dt);
            s.applyRippleDisplacement(this.ripplePool);
        }

        this.updateGraphicRipples(dt);
    }

    private updateGraphicRipples(dt: number): void {
        if (!this.visualRipples || this.graphicRippleCount === 0) return;

        let writeIndex = 0;

        for (let i = 0; i < this.graphicRippleCount; i++) {
            this.graphicRippleAges[i] += dt;
            const lifeTime = this.graphicRippleMaxAges[i];

            if (this.graphicRippleAges[i] < lifeTime) {
                const progress = this.graphicRippleAges[i] / lifeTime;

                this.visualRipples.getMatrixAt(i, _dummyMatrix);
                _dummyPosition.setFromMatrixPosition(_dummyMatrix);

                const currentScale = 0.5 + (progress * 5.0);
                _dummyScale.set(currentScale, currentScale, currentScale);
                _dummyMatrix.compose(_dummyPosition, _dummyRotation, _dummyScale);

                this.visualRipples.setMatrixAt(writeIndex, _dummyMatrix);

                this.graphicRippleAlphas[writeIndex] = 1.0 - Math.pow(progress, 2.0);
                this.graphicRippleAges[writeIndex] = this.graphicRippleAges[i];
                this.graphicRippleMaxAges[writeIndex] = this.graphicRippleMaxAges[i];

                writeIndex++;
            }
        }

        this.graphicRippleCount = writeIndex;
        this.visualRipples.count = this.graphicRippleCount;

        this.visualRipples.instanceMatrix.needsUpdate = true;

        // [VINTERDÖD] Fast, direct reference update. No string lookup required.
        this.graphicRippleAlphaAttr.needsUpdate = true;
    }

    checkBuoyancy(x: number, y: number, z: number): { inWater: boolean, waterLevel: number } {
        const len = this.surfaces.length;
        for (let i = 0; i < len; i++) {
            const s = this.surfaces[i];
            if (s.contains(x, z)) {
                _buoyancyResult.inWater = y < s.mesh.position.y + 0.5;
                _buoyancyResult.waterLevel = s.mesh.position.y;
                return _buoyancyResult;
            }
        }

        _buoyancyResult.inWater = false;
        _buoyancyResult.waterLevel = 0;
        return _buoyancyResult;
    }

    dispose(): void {
        const len = this.surfaces.length;
        for (let i = 0; i < len; i++) {
            this.surfaces[i].dispose();
        }

        if (this.visualRipples) {
            this.scene.remove(this.visualRipples);
            this.visualRipples.geometry.dispose();
            (this.visualRipples.material as THREE.Material).dispose();
        }

        if (this.waveTexture) this.waveTexture.dispose();
        if (this.foamTexture) this.foamTexture.dispose();
        if (this.rippleTexture) this.rippleTexture.dispose();
    }

    /**
     * [VINTERDÖD] Moves all water surfaces and ripples to a new scene.
     */
    public reAttach(newScene: THREE.Scene) {
        if (this.visualRipples) {
            newScene.add(this.visualRipples);
        }

        for (let i = 0; i < this.surfaces.length; i++) {
            newScene.add(this.surfaces[i].mesh);
        }

        this.scene = newScene;
    }
}