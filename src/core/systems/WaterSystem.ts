import * as THREE from 'three';
import { soundManager } from '../../utils/sound';
import { TEXTURES } from '../../utils/assets/AssetLoader';
import {
    createWaterMaterial,
    createRippleMaterial,
    createRadialSplashMaterial,
    createUpwardSplashMaterial
} from '../../utils/assets/materials';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
export const _buoyancyResult = { inWater: false, waterLevel: 0 };

const _dummyMatrix = new THREE.Matrix4();
const _dummyPosition = new THREE.Vector3();
const _dummyScale = new THREE.Vector3();
const _identityQuat = new THREE.Quaternion();

export type WaterStyle = 'crystal' | 'nordic' | 'ice';

export interface WaterStyleConfig {
    color: number;
    opacity: number;
    roughness: number;
    metalness: number;
    fresnelStrength?: number;
    uvScale?: number;
}

const WATER_STYLES: Record<WaterStyle, WaterStyleConfig> = {
    crystal: { color: 0x003355, opacity: 0.92, roughness: 0.1, metalness: 0.1, fresnelStrength: 0.5, uvScale: 1.2 },
    nordic: { color: 0x0a1a26, opacity: 0.98, roughness: 0.3, metalness: 0.0, fresnelStrength: 0.3, uvScale: 1.5 },
    ice: { color: 0x8ba6b5, opacity: 0.95, roughness: 0.05, metalness: 0.4, fresnelStrength: 0.6, uvScale: 1.0 }
};

export type WaterBodyType = 'lake' | 'pond' | 'pool' | 'stream' | 'waterfall';

export interface WaterBodyDef {
    style: WaterStyle;
    shape: 'rect' | 'circle';
    waveAmplitude: number;
    flowDirection: THREE.Vector2;
    flowStrength: number;
    buoyancyForce: number;
    ambientRippleChance: number;
}

const WATER_BODY_PRESETS: Record<WaterBodyType, WaterBodyDef> = {
    lake: { style: 'crystal', shape: 'circle', waveAmplitude: 0.1, flowDirection: new THREE.Vector2(0, 0), flowStrength: 0, buoyancyForce: 10, ambientRippleChance: 0.02 },
    pond: { style: 'crystal', shape: 'circle', waveAmplitude: 0.05, flowDirection: new THREE.Vector2(0, 0), flowStrength: 0, buoyancyForce: 10, ambientRippleChance: 0.01 },
    pool: { style: 'ice', shape: 'rect', waveAmplitude: 0.02, flowDirection: new THREE.Vector2(0, 0), flowStrength: 0, buoyancyForce: 12, ambientRippleChance: 0.005 },
    stream: { style: 'crystal', shape: 'rect', waveAmplitude: 0.08, flowDirection: new THREE.Vector2(1, 0), flowStrength: 3.0, buoyancyForce: 8, ambientRippleChance: 0.03 },
    waterfall: { style: 'crystal', shape: 'rect', waveAmplitude: 0.15, flowDirection: new THREE.Vector2(0, 1), flowStrength: 5.0, buoyancyForce: 15, ambientRippleChance: 0.05 }
};

export class WaterSurface {
    mesh: THREE.Mesh;
    material: THREE.ShaderMaterial;
    bounds: { x: number, z: number, width: number, depth: number };
    style: WaterStyle;
    time: number = 0;

    constructor(
        x: number, z: number, width: number, depth: number,
        flowTexture: THREE.Texture, style: WaterStyle = 'crystal',
        shape: 'rect' | 'circle' = 'rect', flowDir: THREE.Vector2
    ) {
        this.bounds = { x, z, width, depth };
        this.style = style;
        const config = WATER_STYLES[style];

        let geometry: THREE.BufferGeometry;
        if (shape === 'circle') {
            const radius = Math.max(width, depth) / 2;
            geometry = new THREE.CircleGeometry(radius, 64);
        } else {
            const segments = Math.max(32, Math.floor(Math.min(width, depth) / 4));
            geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
        }
        geometry.rotateX(-Math.PI / 2);

        this.mesh = new THREE.Mesh(geometry, null as any);
        this.mesh.position.set(x, 0.35, z); // High enough to avoid Z-fighting

        const angle = Math.atan2(flowDir.y, flowDir.x);
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        const posAttribute = geometry.attributes.position;
        const uvs = new Float32Array(posAttribute.count * 2);
        const stretch = 60.0 * (config.uvScale || 1.0);

        for (let i = 0; i < posAttribute.count; i++) {
            const px = posAttribute.getX(i) + x;
            const pz = posAttribute.getZ(i) + z;

            const rx = px * cosA - pz * sinA;
            const rz = px * sinA + pz * cosA;

            uvs[i * 2] = (rx + Math.sin(rz * 0.05) * 4.0) / stretch;
            uvs[i * 2 + 1] = (rz + Math.cos(rx * 0.05) * 4.0) / stretch;
        }
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

        this.material = createWaterMaterial(config, width, depth, flowTexture, flowTexture, shape);

        this.mesh.material = this.material;
        this.mesh.receiveShadow = true;
        this.mesh.renderOrder = 1;
        this.mesh.frustumCulled = false;
        this.mesh.userData.material = 'WATER';
    }

    update(dt: number): void {
        this.time += dt;
        this.material.uniforms.uTime.value = this.time;
    }

    dispose(): void {
        this.mesh.geometry.dispose();
        this.material.dispose();
    }
}

export class WaterBody {
    type: WaterBodyType;
    def: WaterBodyDef;
    surface: WaterSurface;
    floatingProps: THREE.Object3D[] = [];
    splashSources: THREE.Object3D[] = [];
    splashTimer: number = 0;

    constructor(type: WaterBodyType, surface: WaterSurface, def: WaterBodyDef) {
        this.type = type;
        this.surface = surface;
        this.def = def;
    }

    registerFloatingProp(obj: THREE.Object3D): void {
        if (!obj.userData.velocity) obj.userData.velocity = new THREE.Vector3();
        if (!obj.userData.angularVelocity) obj.userData.angularVelocity = new THREE.Vector3();
        if (obj.userData.radius === undefined) obj.userData.radius = 1.5;
        if (obj.userData.friction === undefined) obj.userData.friction = 0.96;
        this.floatingProps.push(obj);
    }

    registerSplashSource(obj: THREE.Object3D): void {
        this.splashSources.push(obj);
    }

    dispose(): void {
        this.floatingProps.length = 0;
        this.splashSources.length = 0;
        this.surface.dispose();
    }
}

export class WaterSystem {
    surfaces: WaterSurface[] = [];
    waterBodies: WaterBody[] = [];

    meshRipple: THREE.InstancedMesh | null = null;
    meshRadial: THREE.InstancedMesh | null = null;
    meshUpward: THREE.InstancedMesh | null = null;

    private scene: THREE.Scene;
    private flowTexture: THREE.Texture;
    private rippleTexture: THREE.Texture;
    private splash1Texture: THREE.Texture;
    private splash2Texture: THREE.Texture;

    private playerGroup: THREE.Group | null = null;
    private playerWasInWater: boolean = false;
    private lastPlayerPos: THREE.Vector3 = new THREE.Vector3();
    private hasLastPlayerPos: boolean = false;
    private stepTimer: number = 0;

    private spawnPartCb: ((x: number, y: number, z: number, type: string, count: number, customMesh?: any, customVel?: any, color?: number, scale?: number) => void) | null = null;
    private emitNoiseCb: ((pos: THREE.Vector3, radius: number, type: string) => void) | null = null;

    private maxSplashes = 100;
    private splashAges = new Float32Array(this.maxSplashes);
    private splashMaxAges = new Float32Array(this.maxSplashes);
    private splashAlphas = new Float32Array(this.maxSplashes);

    // Type: 0 = Drop, 1 = Explosion, 2 = Footstep
    private splashTypes = new Uint8Array(this.maxSplashes);
    private splashCount = 0;

    private sharedAlphaAttr!: THREE.InstancedBufferAttribute;

    constructor(scene: THREE.Scene) {
        this.scene = scene;

        this.flowTexture = TEXTURES.water_flow;
        this.flowTexture.wrapS = this.flowTexture.wrapT = THREE.RepeatWrapping;
        this.rippleTexture = TEXTURES.water_ripple;
        this.splash1Texture = TEXTURES.water_splash_1;
        this.splash1Texture.wrapS = this.splash1Texture.wrapT = THREE.RepeatWrapping;
        this.splash2Texture = TEXTURES.water_splash_2;
        this.splash2Texture.wrapS = this.splash2Texture.wrapT = THREE.RepeatWrapping;

        this.setupTrifoxSplashSystem();
    }

    private setupTrifoxSplashSystem(): void {
        this.sharedAlphaAttr = new THREE.InstancedBufferAttribute(this.splashAlphas, 1);
        this.sharedAlphaAttr.setUsage(THREE.DynamicDrawUsage);

        const geoRipple = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
        geoRipple.setAttribute('instanceAlpha', this.sharedAlphaAttr);
        const matRipple = createRippleMaterial(this.rippleTexture);
        this.meshRipple = new THREE.InstancedMesh(geoRipple, matRipple, this.maxSplashes);
        this.meshRipple.frustumCulled = false;
        this.meshRipple.renderOrder = 10;
        this.scene.add(this.meshRipple);

        const geoRadial = new THREE.CylinderGeometry(0.8, 1.2, 1, 16, 1, true).translate(0, 0.5, 0);
        geoRadial.setAttribute('instanceAlpha', this.sharedAlphaAttr);
        const matRadial = createRadialSplashMaterial(this.splash1Texture);
        this.meshRadial = new THREE.InstancedMesh(geoRadial, matRadial, this.maxSplashes);
        this.meshRadial.frustumCulled = false;
        this.meshRadial.renderOrder = 11;
        this.scene.add(this.meshRadial);

        const geoUpward = new THREE.CylinderGeometry(0.01, 1.0, 1, 16).translate(0, 0.5, 0);
        geoUpward.setAttribute('instanceAlpha', this.sharedAlphaAttr);
        const matUpward = createUpwardSplashMaterial(this.splash2Texture);
        this.meshUpward = new THREE.InstancedMesh(geoUpward, matUpward, this.maxSplashes);
        this.meshUpward.frustumCulled = false;
        this.meshUpward.renderOrder = 12;
        this.scene.add(this.meshUpward);
    }

    addWaterBody(type: WaterBodyType, x: number, z: number, width: number, depth: number, options?: any): WaterBody {
        const preset = WATER_BODY_PRESETS[type];
        const style = options?.style ?? preset.style;
        const shape = options?.shape ?? preset.shape;
        const flowDir = options?.flowDirection ? options.flowDirection.clone() : preset.flowDirection.clone();

        const def: WaterBodyDef = {
            style, shape,
            waveAmplitude: preset.waveAmplitude,
            flowDirection: flowDir,
            flowStrength: options?.flowStrength ?? preset.flowStrength,
            buoyancyForce: preset.buoyancyForce,
            ambientRippleChance: preset.ambientRippleChance
        };

        const surface = new WaterSurface(x, z, width, depth, this.flowTexture, style, shape, flowDir);
        this.surfaces.push(surface);
        this.scene.add(surface.mesh);

        const body = new WaterBody(type, surface, def);
        this.waterBodies.push(body);
        return body;
    }

    removeWaterBody(body: WaterBody): void {
        const idx = this.waterBodies.indexOf(body);
        if (idx >= 0) {
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

    clearBodies(): void {
        for (let i = this.waterBodies.length - 1; i >= 0; i--) {
            this.removeWaterBody(this.waterBodies[i]);
        }
        this.playerWasInWater = false;
        this.hasLastPlayerPos = false;
    }

    setPlayerRef(playerGroup: THREE.Group): void {
        this.playerGroup = playerGroup;
    }

    setCallbacks(callbacks: { spawnPart?: any, emitNoise?: any }): void {
        if (callbacks.spawnPart) this.spawnPartCb = callbacks.spawnPart;
        if (callbacks.emitNoise) this.emitNoiseCb = callbacks.emitNoise;
    }

    // PERFECT SYNC: Shared wave height calculation for World Space
    getWaveHeight(x: number, z: number, time: number): number {
        return Math.sin(x * 0.5 + time * 1.5) * 0.1 + Math.sin(z * 0.4 + time * 1.2) * 0.1;
    }

    spawnRipple(x: number, z: number, maxRadius: number = 3, type: 'drop' | 'explosion' | 'step' = 'drop'): void {
        if (this.splashCount < this.maxSplashes && this.meshRipple) {
            const idx = this.splashCount;
            this.splashAges[idx] = 0;

            if (type === 'explosion') this.splashMaxAges[idx] = maxRadius * 0.6;
            else if (type === 'step') this.splashMaxAges[idx] = maxRadius * 0.5;
            else this.splashMaxAges[idx] = maxRadius * 0.4;

            if (type === 'explosion') this.splashTypes[idx] = 1;
            else if (type === 'step') this.splashTypes[idx] = 2;
            else this.splashTypes[idx] = 0;

            _dummyPosition.set(x, 0.35, z); // Base height, dynamic Y applied in update loop
            _dummyScale.set(0.01, 0.01, 0.01);
            _dummyMatrix.compose(_dummyPosition, _identityQuat, _dummyScale);

            this.meshRipple.setMatrixAt(idx, _dummyMatrix);
            this.meshRadial!.setMatrixAt(idx, _dummyMatrix);
            this.meshUpward!.setMatrixAt(idx, _dummyMatrix);

            this.splashAlphas[idx] = 1.0;
            this.splashCount++;
        }
    }

    update(dt: number, now: number): void {
        const surfLen = this.surfaces.length;
        for (let i = 0; i < surfLen; i++) {
            this.surfaces[i].update(dt);
        }

        if (this.splashCount > 0) {
            this.updateTrifoxSplashes(dt);
        }

        const bodyLen = this.waterBodies.length;
        if (bodyLen > 0) {
            this.updatePlayerWater(dt, now);
            this.updateFloatingProps(dt, now);
            this.updateSplashSources(dt);
        }
    }

    private updatePlayerWater(dt: number, now: number): void {
        if (!this.playerGroup) return;

        const pos = this.playerGroup.position;
        this.checkBuoyancy(pos.x, pos.y, pos.z);

        if (_buoyancyResult.inWater && !this.playerWasInWater) {
            this.spawnRipple(pos.x, pos.z, 5, 'drop');
            if (this.emitNoiseCb) this.emitNoiseCb(pos, 20, 'splash');
            if (this.spawnPartCb) this.spawnPartCb(pos.x, _buoyancyResult.waterLevel, pos.z, 'debris', 6, undefined, undefined, 0xffffff, 0.4);
        }

        if (_buoyancyResult.inWater && this.hasLastPlayerPos) {
            const dx = pos.x - this.lastPlayerPos.x;
            const dz = pos.z - this.lastPlayerPos.z;
            const distSq = dx * dx + dz * dz;

            if (distSq > 0.005) {
                this.stepTimer += dt;

                // Triggers a footstep ripple/splash every ~0.35 seconds
                if (this.stepTimer > 0.35) {
                    this.spawnRipple(pos.x, pos.z, 2.0, 'step');

                    if (this.spawnPartCb) {
                        this.spawnPartCb(pos.x, _buoyancyResult.waterLevel + 0.1, pos.z, 'debris', 2, undefined, undefined, 0xffffff, 0.25);
                    }
                    if (this.emitNoiseCb) this.emitNoiseCb(pos, 5, 'splash');
                    this.stepTimer = 0;
                }
            } else {
                this.stepTimer = 0;
            }
        }

        this.playerWasInWater = _buoyancyResult.inWater;
        this.lastPlayerPos.copy(pos);
        this.hasLastPlayerPos = true;
    }

    private updateFloatingProps(dt: number, now: number): void {
        const bodyLen = this.waterBodies.length;
        let pX = 0, pZ = 0;
        if (this.playerGroup) {
            pX = this.playerGroup.position.x;
            pZ = this.playerGroup.position.z;
        }

        for (let b = 0; b < bodyLen; b++) {
            const body = this.waterBodies[b];
            const props = body.floatingProps;
            const propLen = props.length;

            for (let i = 0; i < propLen; i++) {
                const prop = props[i];
                const ud = prop.userData;
                const vel = ud.velocity as THREE.Vector3;

                this.checkBuoyancy(prop.position.x, prop.position.y, prop.position.z);

                vel.y -= 19.8 * dt;

                if (_buoyancyResult.inWater) {
                    const floatOffset = ud.floatOffset !== undefined ? ud.floatOffset : (ud.isBall ? 0 : -0.3);
                    const targetY = _buoyancyResult.waterLevel + floatOffset;
                    const depth = targetY - prop.position.y;

                    if (depth > -0.5) {
                        const buoyancyForce = 19.8 + (depth * body.def.buoyancyForce * 4.0);
                        vel.y += Math.max(0, buoyancyForce) * dt;
                        vel.y *= 0.85;
                        vel.x *= ud.friction || 0.96;
                        vel.z *= ud.friction || 0.96;
                    }

                    if (body.def.flowStrength > 0) {
                        vel.x += body.def.flowDirection.x * body.def.flowStrength * dt;
                        vel.z += body.def.flowDirection.y * body.def.flowStrength * dt;
                    }

                    if (this.playerGroup) {
                        const dx = prop.position.x - pX;
                        const dz = prop.position.z - pZ;
                        const distSq = dx * dx + dz * dz;
                        const pushRadius = (ud.radius || 1.5) + 1.2;

                        if (distSq < pushRadius * pushRadius && distSq > 0.01) {
                            const dist = Math.sqrt(distSq);
                            const pushForce = (pushRadius - dist) * 1.5 * dt;
                            vel.x += (dx / dist) * pushForce;
                            vel.z += (dz / dist) * pushForce;
                        }
                    }

                    if (vel.lengthSq() > 0.3 && Math.random() < 0.1) {
                        this.spawnRipple(prop.position.x, prop.position.z, 1.5, 'step');
                    }
                }

                prop.position.addScaledVector(vel, dt);
                prop.updateMatrixWorld();
            }
        }
    }

    private updateSplashSources(dt: number): void {
        const bodyLen = this.waterBodies.length;
        for (let b = 0; b < bodyLen; b++) {
            const body = this.waterBodies[b];
            body.splashTimer += dt;

            // Trigger rock splashes on a controlled timer, not Math.random per frame!
            if (body.splashTimer > 1.5) {
                const sources = body.splashSources;
                const srcLen = sources.length;

                for (let i = 0; i < srcLen; i++) {
                    const src = sources[i];
                    if (Math.random() < 0.3) { // 30% chance every 1.5s
                        this.spawnRipple(
                            src.position.x + (Math.random() - 0.5) * 6,
                            src.position.z + (Math.random() - 0.5) * 6,
                            3.5, 'drop'
                        );
                        if (this.spawnPartCb) {
                            this.spawnPartCb(src.position.x, 0.4, src.position.z, 'debris', 3, undefined, undefined, 0xffffff, 0.3);
                        }
                    }
                }
                body.splashTimer = 0;
            }

            // Ambient background ripples
            if (Math.random() < body.def.ambientRippleChance) {
                const bounds = body.surface.bounds;
                const rx = bounds.x + (Math.random() - 0.5) * bounds.width * 0.8;
                const rz = bounds.z + (Math.random() - 0.5) * bounds.depth * 0.8;
                this.spawnRipple(rx, rz, 1.8, 'step');
            }
        }
    }

    private updateTrifoxSplashes(dt: number): void {
        if (!this.meshRipple || this.surfaces.length === 0) return;

        let writeIndex = 0;
        const count = this.splashCount;
        const lakeTime = this.surfaces[0].time;

        for (let i = 0; i < count; i++) {
            this.splashAges[i] += dt;
            const life = this.splashAges[i];
            const maxLife = this.splashMaxAges[i];

            if (life < maxLife) {
                const progress = life / maxLife;
                const type = this.splashTypes[i];
                const isExplosion = type === 1;
                const isStep = type === 2;

                this.meshRipple!.getMatrixAt(i, _dummyMatrix);
                _dummyPosition.setFromMatrixPosition(_dummyMatrix);

                // PERFECT SYNC: Gets exact height from same math as shader
                const waveY = this.getWaveHeight(_dummyPosition.x, _dummyPosition.z, lakeTime);

                // Add 0.03 so the flat ring sits strictly above the water surface
                _dummyPosition.y = 0.35 + waveY + 0.03;

                const maxRadius = maxLife * 2.5;

                // 1. RIPPLE
                const ripBaseScale = isExplosion ? 3.5 : (isStep ? 1.5 : 2.0);
                const ripScale = progress * maxRadius * ripBaseScale;
                _dummyScale.set(ripScale, 1.0, ripScale);
                _dummyMatrix.compose(_dummyPosition, _identityQuat, _dummyScale);
                this.meshRipple!.setMatrixAt(writeIndex, _dummyMatrix);

                // 2. RADIAL BODY
                const radBaseXZ = isExplosion ? 2.5 : (isStep ? 0.8 : 1.5);
                const radBaseY = isExplosion ? 1.0 : (isStep ? 0.2 : 0.8);
                const radXZ = progress * maxRadius * radBaseXZ;
                const radY = progress * maxRadius * radBaseY;
                _dummyScale.set(radXZ, radY, radXZ);
                _dummyMatrix.compose(_dummyPosition, _identityQuat, _dummyScale);
                this.meshRadial!.setMatrixAt(writeIndex, _dummyMatrix);

                // 3. UPWARD BODY
                if (isExplosion || isStep) {
                    _dummyScale.set(0, 0, 0);
                } else {
                    const upXZ = maxRadius * 0.2 + (progress * 0.5);
                    const upY = Math.sin(progress * Math.PI) * maxRadius * 1.2;
                    _dummyScale.set(upXZ, upY, upXZ);
                }
                _dummyMatrix.compose(_dummyPosition, _identityQuat, _dummyScale);
                this.meshUpward!.setMatrixAt(writeIndex, _dummyMatrix);

                this.splashAlphas[writeIndex] = 1.0 - progress;
                this.splashAges[writeIndex] = life;
                this.splashMaxAges[writeIndex] = maxLife;
                this.splashTypes[writeIndex] = type;
                writeIndex++;
            }
        }

        this.splashCount = writeIndex;

        // Performance: Only mark as needsUpdate if we actually have splashes
        this.meshRipple.count = writeIndex;
        this.meshRadial!.count = writeIndex;
        this.meshUpward!.count = writeIndex;

        this.meshRipple.instanceMatrix.needsUpdate = true;
        this.meshRadial!.instanceMatrix.needsUpdate = true;
        this.meshUpward!.instanceMatrix.needsUpdate = true;
        this.sharedAlphaAttr.needsUpdate = true;
    }

    checkBuoyancy(x: number, y: number, z: number): void {
        _buoyancyResult.inWater = false;
        _buoyancyResult.waterLevel = 0;
        const bodyLen = this.waterBodies.length;

        for (let i = 0; i < bodyLen; i++) {
            const body = this.waterBodies[i];
            const b = body.surface.bounds;
            const halfW = b.width * 0.5;
            const halfD = b.depth * 0.5;

            if (x >= b.x - halfW && x <= b.x + halfW && z >= b.z - halfD && z <= b.z + halfD) {
                _buoyancyResult.inWater = true;
                // PERFECT SYNC: Exact world space wave height
                const waveY = this.getWaveHeight(x, z, body.surface.time);
                _buoyancyResult.waterLevel = 0.35 + waveY;
                return;
            }
        }
    }

    dispose(): void {
        this.clearBodies();
        if (this.meshRipple) {
            this.meshRipple.geometry.dispose();
            (this.meshRipple.material as THREE.Material).dispose();
            this.meshRadial!.geometry.dispose();
            (this.meshRadial!.material as THREE.Material).dispose();
            this.meshUpward!.geometry.dispose();
            (this.meshUpward!.material as THREE.Material).dispose();
        }
    }

    public reAttach(newScene: THREE.Scene) {
        if (this.meshRipple) {
            newScene.add(this.meshRipple);
            newScene.add(this.meshRadial!);
            newScene.add(this.meshUpward!);
        }
        for (let i = 0; i < this.surfaces.length; i++) newScene.add(this.surfaces[i].mesh);
        this.scene = newScene;
    }
}