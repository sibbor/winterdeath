import * as THREE from 'three';
import { soundManager } from '../../utils/sound';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
// Kept outside the class to avoid memory allocation during runtime.
const _tempColor = new THREE.Color();
const _buoyancyResult = { inWater: false, waterLevel: 0 };
const _activeRipples: WaterRipple[] = [];
const _dummyMatrix = new THREE.Matrix4();
const _dummyPosition = new THREE.Vector3();
const _dummyScale = new THREE.Vector3();
const _dummyRotation = new THREE.Quaternion();

// Physics scratchpads for buoyancy/drag
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _pushDir = new THREE.Vector3();
const _playerFlat = new THREE.Vector3();

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
// WATER BODY TYPES & PRESETS
// ===================================================================
export type WaterBodyType = 'lake' | 'pond' | 'pool' | 'stream' | 'waterfall';

export interface WaterBodyDef {
    style: WaterStyle;
    shape: 'rect' | 'circle';
    waveAmplitude: number;        // Vertex wave strength (0 = still)
    flowDirection: THREE.Vector2; // Normalized direction for streams (0,0 = no flow)
    flowStrength: number;         // Units/sec current push
    buoyancyForce: number;        // Upward force multiplier
    ambientRippleChance: number;  // Per-frame random ripple probability
}

const WATER_BODY_PRESETS: Record<WaterBodyType, WaterBodyDef> = {
    lake: {
        style: 'crystal', shape: 'circle', waveAmplitude: 0.1,
        flowDirection: new THREE.Vector2(0, 0), flowStrength: 0,
        buoyancyForce: 10, ambientRippleChance: 0.005
    },
    pond: {
        style: 'crystal', shape: 'circle', waveAmplitude: 0.05,
        flowDirection: new THREE.Vector2(0, 0), flowStrength: 0,
        buoyancyForce: 10, ambientRippleChance: 0.002
    },
    pool: {
        style: 'ice', shape: 'rect', waveAmplitude: 0.02,
        flowDirection: new THREE.Vector2(0, 0), flowStrength: 0,
        buoyancyForce: 12, ambientRippleChance: 0.001
    },
    stream: {
        style: 'crystal', shape: 'rect', waveAmplitude: 0.08,
        flowDirection: new THREE.Vector2(1, 0), flowStrength: 3.0,
        buoyancyForce: 8, ambientRippleChance: 0.01
    },
    waterfall: {
        style: 'crystal', shape: 'rect', waveAmplitude: 0.15,
        flowDirection: new THREE.Vector2(0, 1), flowStrength: 5.0,
        buoyancyForce: 15, ambientRippleChance: 0.03
    }
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
        this.mesh.renderOrder = 1; // Render after ground (depthWrite: false needs explicit ordering)
        this.mesh.frustumCulled = false; // Vertex positions are modified every frame — bounding sphere is always stale
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
// WATER BODY (Groups surface + registered props + splash sources)
// ===================================================================
export class WaterBody {
    type: WaterBodyType;
    def: WaterBodyDef;
    surface: WaterSurface;
    floatingProps: THREE.Object3D[] = [];
    splashSources: THREE.Object3D[] = [];

    constructor(type: WaterBodyType, surface: WaterSurface, def: WaterBodyDef) {
        this.type = type;
        this.surface = surface;
        this.def = def;
    }

    registerFloatingProp(obj: THREE.Object3D): void {
        // Ensure physics userData exists
        if (!obj.userData.velocity) obj.userData.velocity = new THREE.Vector3();
        if (!obj.userData.angularVelocity) obj.userData.angularVelocity = new THREE.Vector3();
        if (obj.userData.radius === undefined) obj.userData.radius = 1.5;
        if (obj.userData.friction === undefined) obj.userData.friction = 0.98;
        this.floatingProps.push(obj);
    }

    unregisterFloatingProp(obj: THREE.Object3D): void {
        const idx = this.floatingProps.indexOf(obj);
        if (idx >= 0) {
            this.floatingProps[idx] = this.floatingProps[this.floatingProps.length - 1];
            this.floatingProps.pop();
        }
    }

    registerSplashSource(obj: THREE.Object3D): void {
        this.splashSources.push(obj);
    }

    contains(x: number, z: number): boolean {
        return this.surface.contains(x, z);
    }

    dispose(): void {
        this.floatingProps.length = 0;
        this.splashSources.length = 0;
        this.surface.dispose();
    }
}

// ===================================================================
// WATER SYSTEM
// ===================================================================
export class WaterSystem {
    surfaces: WaterSurface[] = [];
    waterBodies: WaterBody[] = [];
    ripplePool: WaterRipple[] = [];
    poolIndex: number = 0;

    // Visual Instanced Meshes
    visualRipples: THREE.InstancedMesh | null = null;

    private scene: THREE.Scene;
    private waveTexture: THREE.Texture;
    private foamTexture: THREE.Texture;
    private rippleTexture: THREE.Texture;

    // Player reference for automatic water interactions
    private playerGroup: THREE.Group | null = null;
    private playerWasInWater: boolean = false;
    private lastPlayerPos: THREE.Vector3 = new THREE.Vector3();
    private hasLastPlayerPos: boolean = false;

    // Callbacks for FX integration
    private spawnPartCb: ((x: number, y: number, z: number, type: string, count: number) => void) | null = null;
    private emitNoiseCb: ((pos: THREE.Vector3, radius: number, type: string) => void) | null = null;

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

    /**
     * Create a typed water body with automatic physics.
     * Returns a WaterBody that can have floating props and splash sources registered.
     */
    addWaterBody(type: WaterBodyType, x: number, z: number, width: number, depth: number, options?: {
        style?: WaterStyle; shape?: 'rect' | 'circle'; flowDirection?: THREE.Vector2; flowStrength?: number;
    }): WaterBody {
        const preset = WATER_BODY_PRESETS[type];
        const style = options?.style ?? preset.style;
        const shape = options?.shape ?? preset.shape;

        // Clone preset so overrides don't mutate the shared default
        const def: WaterBodyDef = {
            style,
            shape,
            waveAmplitude: preset.waveAmplitude,
            flowDirection: options?.flowDirection ? options.flowDirection.clone() : preset.flowDirection.clone(),
            flowStrength: options?.flowStrength ?? preset.flowStrength,
            buoyancyForce: preset.buoyancyForce,
            ambientRippleChance: preset.ambientRippleChance
        };

        const surface = this.addSurface(x, z, width, depth, style, shape);
        const body = new WaterBody(type, surface, def);
        this.waterBodies.push(body);
        return body;
    }

    removeWaterBody(body: WaterBody): void {
        const idx = this.waterBodies.indexOf(body);
        if (idx >= 0) {
            // Remove the surface from the surfaces array too
            const sIdx = this.surfaces.indexOf(body.surface);
            if (sIdx >= 0) {
                this.scene.remove(body.surface.mesh);
                this.surfaces[sIdx] = this.surfaces[this.surfaces.length - 1];
                this.surfaces.pop();
            }
            body.dispose();
            this.waterBodies[idx] = this.waterBodies[this.waterBodies.length - 1];
            this.waterBodies.pop();
        }
    }

    /** Set player reference for automatic water interactions (splash, ripples, footstep audio). */
    setPlayerRef(playerGroup: THREE.Group): void {
        this.playerGroup = playerGroup;
    }

    /** Set FX callbacks for particle/sound integration. */
    setCallbacks(callbacks: {
        spawnPart: (x: number, y: number, z: number, type: string, count: number) => void;
        emitNoise: (pos: THREE.Vector3, radius: number, type: string) => void;
    }): void {
        this.spawnPartCb = callbacks.spawnPart;
        this.emitNoiseCb = callbacks.emitNoise;
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

    /** Clear all water bodies and surfaces (for sector transitions). */
    clearBodies(): void {
        for (let i = this.waterBodies.length - 1; i >= 0; i--) {
            this.removeWaterBody(this.waterBodies[i]);
        }
        this.playerWasInWater = false;
        this.hasLastPlayerPos = false;
    }

    update(dt: number, now: number = 0): void {
        const poolLen = this.ripplePool.length;
        for (let i = 0; i < poolLen; i++) this.ripplePool[i].update(dt);

        const surfLen = this.surfaces.length;
        for (let i = 0; i < surfLen; i++) {
            const s = this.surfaces[i];
            s.update(dt);
            s.applyRippleDisplacement(this.ripplePool);
        }

        this.updateGraphicRipples(dt);

        // --- SELF-CONTAINED WATER PHYSICS ---
        if (this.waterBodies.length > 0) {
            this.updatePlayerWater(dt, now);
            this.updateFloatingProps(dt, now);
            this.updateSplashSources();
        }
    }

    // ===================================================================
    // PLAYER WATER INTERACTIONS
    // ===================================================================
    private updatePlayerWater(dt: number, now: number): void {
        if (!this.playerGroup) return;

        const px = this.playerGroup.position.x;
        const py = this.playerGroup.position.y;
        const pz = this.playerGroup.position.z;
        const buoyancy = this.checkBuoyancy(px, py, pz);

        // Entry splash
        if (buoyancy.inWater && !this.playerWasInWater) {
            this.spawnRipple(px, pz, 3, 0.3);
            if (this.emitNoiseCb) {
                _playerFlat.set(px, py, pz);
                this.emitNoiseCb(_playerFlat, 20, 'splash');
            }
        }

        // Movement ripples
        if (buoyancy.inWater && this.hasLastPlayerPos) {
            const dx = px - this.lastPlayerPos.x;
            const dz = pz - this.lastPlayerPos.z;
            const distSq = dx * dx + dz * dz;
            if (distSq > 0.01 && Math.random() < 0.5) {
                this.spawnRipple(px, pz, 1.5, 0.1);
            }
        }

        this.playerWasInWater = buoyancy.inWater;
        this.lastPlayerPos.set(px, py, pz);
        this.hasLastPlayerPos = true;
    }

    // ===================================================================
    // FLOATING PROP PHYSICS
    // ===================================================================
    private updateFloatingProps(dt: number, now: number): void {
        const bodyLen = this.waterBodies.length;
        for (let b = 0; b < bodyLen; b++) {
            const body = this.waterBodies[b];
            const propLen = body.floatingProps.length;
            if (propLen === 0) continue;

            for (let i = 0; i < propLen; i++) {
                const prop = body.floatingProps[i];
                const ud = prop.userData;
                const pos = prop.position;
                const vel = ud.velocity as THREE.Vector3;

                if (ud.isStatic) continue;

                // --- BUOYANCY / GRAVITY ---
                const buoyancy = this.checkBuoyancy(pos.x, pos.y, pos.z);

                if (buoyancy.inWater) {
                    const depth = buoyancy.waterLevel - pos.y;
                    if (depth > 0) {
                        // Upward buoyancy force — stronger if deeper
                        vel.y += depth * body.def.buoyancyForce * dt;
                        // Water damping
                        vel.multiplyScalar(0.9);
                    }

                    // Bobbing current
                    vel.y += Math.sin(now * 0.003 + pos.x) * 0.05 * dt;

                    // Stream flow force
                    if (body.def.flowStrength > 0) {
                        vel.x += body.def.flowDirection.x * body.def.flowStrength * dt;
                        vel.z += body.def.flowDirection.y * body.def.flowStrength * dt;
                    }

                    // Movement ripples
                    const speedSq = vel.x * vel.x + vel.z * vel.z;
                    if (speedSq > 0.25 && Math.random() < 0.3) {
                        this.spawnRipple(pos.x, pos.z, 2, 0.1);
                    }

                    // Splash particles (if fast)
                    if (speedSq > 4.0 && Math.random() < 0.15 && this.spawnPartCb) {
                        this.spawnPartCb(pos.x, 0.1, pos.z, 'splash', 3);
                    }
                } else {
                    // Gravity (not in water)
                    vel.y -= 20 * dt;
                }

                // --- PLAYER COLLISION (radial push) ---
                if (this.playerGroup) {
                    _playerFlat.copy(this.playerGroup.position).setY(pos.y);
                    const distSq = pos.distanceToSquared(_playerFlat);
                    const combinedRadius = (ud.radius || 1.5) + 1.0;

                    if (distSq < combinedRadius * combinedRadius) {
                        _pushDir.subVectors(pos, _playerFlat).normalize();
                        vel.addScaledVector(_pushDir, 10.0 * dt);
                    }
                }

                // --- INTEGRATE ---
                pos.addScaledVector(vel, dt * 10);

                // Ground floor clamp
                if (pos.y < -5) { pos.y = -5; vel.y = 0; }

                // --- DRAG ---
                if (ud.vehicleDef?.category === 'BOAT') {
                    // Directional drag for boats: less resistance forward, more lateral
                    const savedY = vel.y;
                    _forward.set(0, 0, 1).applyQuaternion(prop.quaternion);
                    _right.set(1, 0, 0).applyQuaternion(prop.quaternion);

                    const fSpeed = vel.dot(_forward);
                    const rSpeed = vel.dot(_right);

                    vel.copy(_forward).multiplyScalar(fSpeed * 0.98).add(_right.multiplyScalar(rSpeed * 0.90));
                    vel.y = savedY;

                    if (ud.angularVelocity) {
                        prop.rotation.y += ud.angularVelocity.y * dt;
                        ud.angularVelocity.multiplyScalar(0.95);
                    }
                } else {
                    // Standard friction
                    vel.multiplyScalar(ud.friction || 0.98);
                }

                prop.updateMatrixWorld();
            }
        }
    }

    // ===================================================================
    // SPLASH SOURCES (ambient effects)
    // ===================================================================
    private updateSplashSources(): void {
        const bodyLen = this.waterBodies.length;
        for (let b = 0; b < bodyLen; b++) {
            const body = this.waterBodies[b];
            const srcLen = body.splashSources.length;

            for (let i = 0; i < srcLen; i++) {
                const src = body.splashSources[i];
                const pos = src.position;

                // Ambient ripples
                if (Math.random() < 0.3) {
                    this.spawnRipple(
                        pos.x + (Math.random() - 0.5) * 6,
                        pos.z + (Math.random() - 0.5) * 6,
                        5, 0.2
                    );
                }

                // Foam particles
                if (this.spawnPartCb) {
                    this.spawnPartCb(pos.x, 0, pos.z, 'foam', 1);
                }
            }

            // Ambient random ripples for the water body itself
            if (Math.random() < body.def.ambientRippleChance) {
                const bounds = body.surface.bounds;
                const rx = bounds.x + (Math.random() - 0.5) * bounds.width * 0.8;
                const rz = bounds.z + (Math.random() - 0.5) * bounds.depth * 0.8;
                this.spawnRipple(rx, rz, 1.5, 0.05);
            }
        }
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
        // Dispose water bodies (which disposes their surfaces)
        for (let i = this.waterBodies.length - 1; i >= 0; i--) {
            this.waterBodies[i].dispose();
        }
        this.waterBodies.length = 0;

        // Dispose any remaining standalone surfaces
        const len = this.surfaces.length;
        for (let i = 0; i < len; i++) {
            this.surfaces[i].dispose();
        }
        this.surfaces.length = 0;

        if (this.visualRipples) {
            this.scene.remove(this.visualRipples);
            this.visualRipples.geometry.dispose();
            (this.visualRipples.material as THREE.Material).dispose();
        }

        if (this.waveTexture) this.waveTexture.dispose();
        if (this.foamTexture) this.foamTexture.dispose();
        if (this.rippleTexture) this.rippleTexture.dispose();

        this.playerGroup = null;
        this.spawnPartCb = null;
        this.emitNoiseCb = null;
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

    /** Check if player is currently in water (for external audio/FX queries). */
    isPlayerInWater(): boolean {
        return this.playerWasInWater;
    }
}