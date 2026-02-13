import * as THREE from 'three';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _tempVec3 = new THREE.Vector3();
const _tempScale = new THREE.Vector3();
const _tempQuat = new THREE.Quaternion();
const _tempMat4 = new THREE.Matrix4();
const _tempColor = new THREE.Color();

// ===================================================================
// WATER RIPPLE (Pooled Object)
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
        this.radius += 3 * dt; // speed fixed at 3
        if (this.radius >= this.maxRadius) this.active = false;
    }

    // Optimized: returns displacement based on distance squared if possible
    getDisplacement(x: number, z: number): number {
        const dx = x - this.position.x;
        const dz = z - this.position.y;
        const distSq = dx * dx + dz * dz;

        // Fast culling using squared distance (radius +/- 1.0 margin)
        const outerLimit = (this.radius + 1.0);
        const innerLimit = Math.max(0, this.radius - 1.0);

        if (distSq > outerLimit * outerLimit || distSq < innerLimit * innerLimit) return 0;

        const dist = Math.sqrt(distSq);
        const edgeDist = Math.abs(dist - this.radius);
        const falloff = 1.0 - edgeDist; // edgeDist is 0 to 1.0 here
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
    emissive?: number;
    emissiveIntensity?: number;
    fresnelStrength?: number;
}

const WATER_STYLES: Record<WaterStyle, WaterStyleConfig> = {
    crystal: { color: 0x0077be, opacity: 0.6, roughness: 0.1, metalness: 0.0, fresnelStrength: 0.8 },
    nordic: { color: 0x1a3a52, opacity: 0.85, roughness: 0.3, metalness: 0.0, fresnelStrength: 0.4 },
    ice: { color: 0xd0e8f0, opacity: 0.7, roughness: 0.05, metalness: 0.3, emissive: 0x88ccff, emissiveIntensity: 0.1, fresnelStrength: 1.0 }
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

    constructor(x: number, z: number, width: number, depth: number, style: WaterStyle = 'crystal') {
        this.bounds = { x, z, width, depth };
        this.style = style;
        const config = WATER_STYLES[style];

        const segments = Math.max(32, Math.floor(Math.min(width, depth) / 2));
        const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
        geometry.rotateX(-Math.PI / 2);
        geometry.translate(x, 0, z);

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(config.color) },
                uOpacity: { value: config.opacity },
                uFresnelStrength: { value: config.fresnelStrength || 0.5 },
                uEmissive: { value: new THREE.Color(config.emissive || 0x000000) },
                uEmissiveIntensity: { value: config.emissiveIntensity || 0.0 }
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vViewPosition;
                uniform float uTime;
                void main() {
                    vec3 pos = position;
                    float wave = sin(pos.x * 0.5 + uTime * 2.0) * 0.05 + sin(pos.z * 0.3 + uTime * 1.5) * 0.03;
                    pos.y += wave;
                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    vViewPosition = -mvPosition.xyz;
                    vNormal = normalMatrix * normal;
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                uniform float uOpacity;
                uniform float uFresnelStrength;
                uniform vec3 uEmissive;
                uniform float uEmissiveIntensity;
                varying vec3 vNormal;
                varying vec3 vViewPosition;
                void main() {
                    vec3 viewDir = normalize(vViewPosition);
                    float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), 2.5) * uFresnelStrength;
                    vec3 color = uColor + vec3(fresnel) + (uEmissive * uEmissiveIntensity);
                    gl_FragColor = vec4(color, uOpacity);
                }
            `,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.position.y = 0.05;
        this.mesh.receiveShadow = true;
        this.mesh.userData.material = 'WATER';
    }

    update(dt: number): void {
        this.time += dt;
        this.material.uniforms.uTime.value = this.time;
    }

    applyRippleDisplacement(ripples: WaterRipple[]): void {
        const geometry = this.mesh.geometry as THREE.BufferGeometry;
        const position = geometry.attributes.position;
        const posArray = position.array as Float32Array;
        const count = position.count;

        // Extract only active ripples to avoid inner loop overhead
        const activeRipples = ripples.filter(r => r.active);
        if (activeRipples.length === 0) return;

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            const x = posArray[i3];
            const z = posArray[i3 + 2];

            // Base waves (Sync with shader logic)
            let y = Math.sin(x * 0.5 + this.time * 2.0) * 0.05 + Math.sin(z * 0.3 + this.time * 1.5) * 0.03;

            // Ripple cumulative displacement
            for (let j = 0, rl = activeRipples.length; j < rl; j++) {
                y += activeRipples[j].getDisplacement(x, z);
            }

            posArray[i3 + 1] = y;
        }

        position.needsUpdate = true;
        // Optimization: Vertex normals are expensive to compute every frame. 
        // Only do this if ripples are highly visible.
        geometry.computeVertexNormals();
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
    foamParticles: THREE.InstancedMesh | null = null;
    private scene: THREE.Scene;

    private foamPositions: Float32Array;
    private foamAges: Float32Array;
    private foamCount: number = 0;
    private maxFoam: number = 100;

    constructor(scene: THREE.Scene, poolSize: number = 50) {
        this.scene = scene;
        for (let i = 0; i < poolSize; i++) this.ripplePool.push(new WaterRipple());
        this.foamPositions = new Float32Array(this.maxFoam * 3);
        this.foamAges = new Float32Array(this.maxFoam);

        const geometry = new THREE.SphereGeometry(0.1, 8, 8);
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
        this.foamParticles = new THREE.InstancedMesh(geometry, material, this.maxFoam);
        this.foamParticles.count = 0;
        this.scene.add(this.foamParticles);
    }

    addSurface(x: number, z: number, width: number, depth: number, style: WaterStyle = 'crystal'): WaterSurface {
        const surface = new WaterSurface(x, z, width, depth, style);
        this.surfaces.push(surface);
        this.scene.add(surface.mesh);
        return surface;
    }

    spawnRipple(x: number, z: number, maxRadius: number = 5, amplitude: number = 0.2): void {
        const ripple = this.ripplePool[this.poolIndex];
        ripple.spawn(x, z, maxRadius, amplitude);
        this.poolIndex = (this.poolIndex + 1) % this.ripplePool.length;
        this.spawnFoam(x, 0.1, z);
    }

    private spawnFoam(x: number, y: number, z: number): void {
        if (this.foamCount >= this.maxFoam) return;
        const i3 = this.foamCount * 3;
        this.foamPositions[i3] = x;
        this.foamPositions[i3 + 1] = y;
        this.foamPositions[i3 + 2] = z;
        this.foamAges[this.foamCount] = 0;
        this.foamCount++;
    }

    update(dt: number): void {
        for (let i = 0; i < this.ripplePool.length; i++) this.ripplePool[i].update(dt);

        for (let i = 0; i < this.surfaces.length; i++) {
            const s = this.surfaces[i];
            s.update(dt);
            // Only displacement if ripples are actually active
            s.applyRippleDisplacement(this.ripplePool);
        }
        this.updateFoam(dt);
    }

    private updateFoam(dt: number): void {
        if (!this.foamParticles) return;

        let writeIndex = 0;
        for (let i = 0; i < this.foamCount; i++) {
            this.foamAges[i] += dt;

            if (this.foamAges[i] < 2.0) {
                const i3 = i * 3;
                const life = 1.0 - (this.foamAges[i] * 0.5);
                const s = 0.1 + life * 0.05;

                _tempVec3.set(this.foamPositions[i3], this.foamPositions[i3 + 1], this.foamPositions[i3 + 2]);
                _tempScale.set(s, s, s);
                _tempMat4.compose(_tempVec3, _tempQuat, _tempScale);
                this.foamParticles.setMatrixAt(writeIndex, _tempMat4);

                if (writeIndex !== i) {
                    const w3 = writeIndex * 3;
                    this.foamPositions[w3] = this.foamPositions[i3];
                    this.foamPositions[w3 + 1] = this.foamPositions[i3 + 1];
                    this.foamPositions[w3 + 2] = this.foamPositions[i3 + 2];
                    this.foamAges[writeIndex] = this.foamAges[i];
                }
                writeIndex++;
            }
        }
        this.foamCount = writeIndex;
        this.foamParticles.count = this.foamCount;
        this.foamParticles.instanceMatrix.needsUpdate = true;
    }

    checkBuoyancy(x: number, y: number, z: number): { inWater: boolean, waterLevel: number } {
        for (let i = 0; i < this.surfaces.length; i++) {
            const s = this.surfaces[i];
            if (s.contains(x, z)) return { inWater: y < s.mesh.position.y + 0.5, waterLevel: s.mesh.position.y };
        }
        return { inWater: false, waterLevel: 0 };
    }

    dispose(): void {
        this.surfaces.forEach(s => s.dispose());
        if (this.foamParticles) {
            this.scene.remove(this.foamParticles);
            this.foamParticles.geometry.dispose();
            (this.foamParticles.material as THREE.Material).dispose();
        }
    }
}