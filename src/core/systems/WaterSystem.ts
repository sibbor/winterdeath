import * as THREE from 'three';
import { SectorContext } from '../../types/sectors';

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
    age: number = 0;

    spawn(x: number, z: number, maxRadius: number = 5, amplitude: number = 0.2): void {
        this.position.set(x, z);
        this.radius = 0;
        this.maxRadius = maxRadius;
        this.amplitude = amplitude;
        this.speed = 3;
        this.age = 0;
        this.active = true;
    }

    update(dt: number): void {
        if (!this.active) return;

        this.radius += this.speed * dt;
        this.age += dt;

        // Fade out as ripple expands
        if (this.radius >= this.maxRadius) {
            this.active = false;
        }
    }

    getDisplacement(x: number, z: number): number {
        if (!this.active) return 0;

        const dx = x - this.position.x;
        const dz = z - this.position.y;
        const dist = Math.sqrt(dx * dx + dz * dz);

        // Only displace vertices near the ripple edge
        const edgeDist = Math.abs(dist - this.radius);
        if (edgeDist > 1.0) return 0;

        // Smooth falloff
        const falloff = 1.0 - (edgeDist / 1.0);
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
    transparency: boolean;
    roughness: number;
    metalness: number;
    emissive?: number;
    emissiveIntensity?: number;
    fresnelStrength?: number;
}

const WATER_STYLES: Record<WaterStyle, WaterStyleConfig> = {
    crystal: {
        color: 0x0077be,
        opacity: 0.6,
        transparency: true,
        roughness: 0.1,
        metalness: 0.0,
        fresnelStrength: 0.8
    },
    nordic: {
        color: 0x1a3a52,
        opacity: 0.85,
        transparency: true,
        roughness: 0.3,
        metalness: 0.0,
        fresnelStrength: 0.4
    },
    ice: {
        color: 0xd0e8f0,
        opacity: 0.7,
        transparency: true,
        roughness: 0.05,
        metalness: 0.3,
        emissive: 0x88ccff,
        emissiveIntensity: 0.1,
        fresnelStrength: 1.0
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

    // Reusable vectors
    private _tempPos = new THREE.Vector3();

    constructor(
        x: number,
        z: number,
        width: number,
        depth: number,
        style: WaterStyle = 'crystal'
    ) {
        this.bounds = { x, z, width, depth };
        this.style = style;

        const config = WATER_STYLES[style];

        // Create water plane geometry with subdivisions for ripples
        const segments = Math.max(32, Math.floor(Math.min(width, depth) / 2));
        const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
        geometry.rotateX(-Math.PI / 2);
        geometry.translate(x, 0, z);

        // Water shader
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
                varying vec2 vUv;
                uniform float uTime;
                
                void main() {
                    vUv = uv;
                    
                    // Wave animation
                    vec3 pos = position;
                    float wave1 = sin(pos.x * 0.5 + uTime * 2.0) * 0.05;
                    float wave2 = sin(pos.z * 0.3 + uTime * 1.5) * 0.03;
                    pos.y += wave1 + wave2;
                    
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
                varying vec2 vUv;
                
                void main() {
                    // Fresnel effect
                    vec3 viewDir = normalize(vViewPosition);
                    float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), 2.5) * uFresnelStrength;
                    
                    vec3 color = uColor + vec3(fresnel);
                    color += uEmissive * uEmissiveIntensity;
                    
                    gl_FragColor = vec4(color, uOpacity);
                }
            `,
            transparent: config.transparency,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.position.y = 0.05; // Slightly above ground
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

        // Reset to base positions (waves only)
        for (let i = 0; i < position.count; i++) {
            const x = posArray[i * 3];
            const z = posArray[i * 3 + 2];

            // Base wave
            const wave1 = Math.sin(x * 0.5 + this.time * 2.0) * 0.05;
            const wave2 = Math.sin(z * 0.3 + this.time * 1.5) * 0.03;
            let y = wave1 + wave2;

            // Add ripple displacement
            for (const ripple of ripples) {
                y += ripple.getDisplacement(x, z);
            }

            posArray[i * 3 + 1] = y;
        }

        position.needsUpdate = true;
        geometry.computeVertexNormals();
    }

    contains(x: number, z: number): boolean {
        const halfW = this.bounds.width / 2;
        const halfD = this.bounds.depth / 2;
        return (
            x >= this.bounds.x - halfW &&
            x <= this.bounds.x + halfW &&
            z >= this.bounds.z - halfD &&
            z <= this.bounds.z + halfD
        );
    }

    setStyle(style: WaterStyle): void {
        this.style = style;
        const config = WATER_STYLES[style];

        this.material.uniforms.uColor.value.setHex(config.color);
        this.material.uniforms.uOpacity.value = config.opacity;
        this.material.uniforms.uFresnelStrength.value = config.fresnelStrength || 0.5;
        this.material.uniforms.uEmissive.value.setHex(config.emissive || 0x000000);
        this.material.uniforms.uEmissiveIntensity.value = config.emissiveIntensity || 0.0;
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

    // Foam particle data
    private foamPositions: Float32Array;
    private foamAges: Float32Array;
    private foamCount: number = 0;
    private maxFoam: number = 100;

    constructor(scene: THREE.Scene, poolSize: number = 50) {
        this.scene = scene;

        // Initialize ripple pool (Zero-GC)
        for (let i = 0; i < poolSize; i++) {
            this.ripplePool.push(new WaterRipple());
        }

        // Initialize foam particles
        this.foamPositions = new Float32Array(this.maxFoam * 3);
        this.foamAges = new Float32Array(this.maxFoam);
        this.initFoamParticles();
    }

    private initFoamParticles(): void {
        const geometry = new THREE.SphereGeometry(0.1, 8, 8);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.8
        });

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
        // Get ripple from pool (circular buffer)
        const ripple = this.ripplePool[this.poolIndex];
        ripple.spawn(x, z, maxRadius, amplitude);

        this.poolIndex = (this.poolIndex + 1) % this.ripplePool.length;

        // Spawn foam particle at impact
        this.spawnFoam(x, 0.1, z);
    }

    private spawnFoam(x: number, y: number, z: number): void {
        if (this.foamCount >= this.maxFoam) return;

        const index = this.foamCount;
        this.foamPositions[index * 3] = x;
        this.foamPositions[index * 3 + 1] = y;
        this.foamPositions[index * 3 + 2] = z;
        this.foamAges[index] = 0;
        this.foamCount++;

        if (this.foamParticles) {
            this.foamParticles.count = this.foamCount;
        }
    }

    update(dt: number): void {
        // Update ripples
        for (const ripple of this.ripplePool) {
            ripple.update(dt);
        }

        // Update water surfaces
        for (const surface of this.surfaces) {
            surface.update(dt);
            surface.applyRippleDisplacement(this.ripplePool);
        }

        // Update foam particles
        this.updateFoam(dt);
    }

    private updateFoam(dt: number): void {
        if (!this.foamParticles) return;

        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const scale = new THREE.Vector3();

        let writeIndex = 0;

        for (let i = 0; i < this.foamCount; i++) {
            this.foamAges[i] += dt;

            // Foam lifetime: 2 seconds
            if (this.foamAges[i] < 2.0) {
                const x = this.foamPositions[i * 3];
                const y = this.foamPositions[i * 3 + 1];
                const z = this.foamPositions[i * 3 + 2];

                // Fade out
                const life = 1.0 - (this.foamAges[i] / 2.0);
                const s = 0.1 + life * 0.05;

                position.set(x, y, z);
                scale.set(s, s, s);
                matrix.compose(position, new THREE.Quaternion(), scale);

                this.foamParticles.setMatrixAt(writeIndex, matrix);

                // Copy to new position if compacting
                if (writeIndex !== i) {
                    this.foamPositions[writeIndex * 3] = x;
                    this.foamPositions[writeIndex * 3 + 1] = y;
                    this.foamPositions[writeIndex * 3 + 2] = z;
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
        for (const surface of this.surfaces) {
            if (surface.contains(x, z)) {
                const waterLevel = surface.mesh.position.y;
                return { inWater: y < waterLevel + 0.5, waterLevel };
            }
        }
        return { inWater: false, waterLevel: 0 };
    }

    dispose(): void {
        for (const surface of this.surfaces) {
            this.scene.remove(surface.mesh);
            surface.dispose();
        }

        if (this.foamParticles) {
            this.scene.remove(this.foamParticles);
            this.foamParticles.geometry.dispose();
            (this.foamParticles.material as THREE.Material).dispose();
        }

        this.surfaces = [];
    }
}
