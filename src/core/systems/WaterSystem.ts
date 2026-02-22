import * as THREE from 'three';
import { WaterStyleConfig, createWaterMaterial, patchWaterVegetationMaterial } from '../../utils/assets/materials_water';
import { TEXTURES } from '../../utils/assets/AssetLoader';
import { MATERIALS } from '../../utils/assets/materials';

interface WaterBind {
    uTime: { value: number };
    uWaterDirection?: { value: THREE.Vector2 };
    uWaveStrength?: { value: number };
    uClarity?: { value: number };
}

export interface LakeFloraInstance {
    type: 'lily' | 'seaweed';
    position: THREE.Vector3;
    rotationY: number;
    scale: { x: number, y: number, z: number };
}

/** PERFORMANCE SCRATCHPADS (Zero-GC) */
export const _buoyancyResult = { inWater: false, waterLevel: 0, depth: 0, maxDepth: 0, groundY: 0, baseWaterLevel: 0 };

// Shared instances to avoid GC thrashing in update loops
const _sharedDummy = new THREE.Object3D();
const _sharedDummyFlower = new THREE.Object3D();
const _sharedWhiteColor = new THREE.Color(0xffffff);

export type WaterStyle = 'nordic' | 'ice';
export type WaterBodyType = 'lake' | 'pond' | 'pool' | 'stream' | 'waterfall';

export interface WaterBodyDef {
    style: WaterStyle;
    shape: 'rect' | 'circle';
    buoyancyForce: number;
    ambientRippleChance: number;
    maxDepth: number; // Vertical distance to the bottom
}

const WATER_BODY_PRESETS: Record<WaterBodyType, WaterBodyDef> = {
    lake: { style: 'nordic', shape: 'circle', buoyancyForce: 10, ambientRippleChance: 0.0, maxDepth: 8.0 },
    pond: { style: 'nordic', shape: 'circle', buoyancyForce: 10, ambientRippleChance: 0.0, maxDepth: 3.5 },
    pool: { style: 'ice', shape: 'rect', buoyancyForce: 12, ambientRippleChance: 0.005, maxDepth: 2.0 },
    stream: { style: 'nordic', shape: 'rect', buoyancyForce: 8, ambientRippleChance: 0.03, maxDepth: 1.5 },
    waterfall: { style: 'nordic', shape: 'rect', buoyancyForce: 15, ambientRippleChance: 0.05, maxDepth: 10.0 }
};

const MAX_RIPPLES = 16;
const MAX_OBJECTS = 8;

export class WaterSurface {
    mesh: THREE.Mesh;
    material: THREE.ShaderMaterial;
    bounds: { x: number, z: number, width: number, depth: number };
    time: number = 0;

    constructor(
        x: number, z: number, width: number, depth: number,
        style: WaterStyle, shape: 'rect' | 'circle',
        rippleData: THREE.Vector4[], objectPositions: THREE.Vector4[]
    ) {
        this.bounds = { x, z, width, depth };

        // We ALWAYS use PlaneGeometry now, even for circles.
        // This ensures the mesh has internal vertices for waves/ripples to displace.
        // High resolution segments for crisp faceted jewelry look.
        const res = Math.min(64, Math.max(16, Math.floor(Math.max(width, depth) / 4)));
        const geometry = new THREE.PlaneGeometry(
            shape === 'circle' ? Math.max(width, depth) : width,
            shape === 'circle' ? Math.max(width, depth) : depth,
            res, res
        );

        geometry.rotateX(-Math.PI / 2);

        this.material = createWaterMaterial(style, width, depth, rippleData, objectPositions, shape);
        this.material.uniforms.uNoiseTexture.value = TEXTURES.water_ripple;
        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.position.set(x, 0.35, z);
        this.mesh.renderOrder = 1;
        this.mesh.frustumCulled = false;
        this.mesh.userData.material = 'WATER';
    }

    update(globalTime: number): void {
        this.time = globalTime;
        this.material.uniforms.uTime.value = this.time;
    }

    dispose(): void {
        this.mesh.geometry.dispose();
        this.material.dispose();
    }
}

export class WaterBody {
    floatingProps: THREE.Object3D[] = [];
    splashSources: THREE.Object3D[] = [];
    splashTimer: number = 0;

    constructor(public type: WaterBodyType, public surface: WaterSurface, public def: WaterBodyDef) { }

    public registerFloatingProp(obj: THREE.Object3D): void {
        if (!obj.userData.velocity) obj.userData.velocity = new THREE.Vector3();
        this.floatingProps.push(obj);
    }

    public registerSplashSource(obj: THREE.Object3D): void {
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
    private rippleData: THREE.Vector4[] = [];
    private objectPositions: THREE.Vector4[] = [];
    private rippleIndex: number = 0;
    private globalTime: number = 0;
    private playerGroup: THREE.Group | null = null;
    private lastPlayerPos = new THREE.Vector3();
    private lightPosition = new THREE.Vector3(100, 500, 100);
    private playerWasInWater: boolean = false;
    private stepTimer: number = 0;
    private grounds: THREE.Mesh[] = [];
    private boundUniforms: WaterBind[] = [];

    // Instanced Vegetation
    private lilyPads: THREE.InstancedMesh | null = null;
    private lilyStems: THREE.InstancedMesh | null = null;
    private lilyFlowers: THREE.InstancedMesh | null = null;
    private seaweedMesh: THREE.InstancedMesh | null = null;
    private lilyData: { position: THREE.Vector3, velocity: number, scale: THREE.Vector3, rotationY: number, hasFlower: boolean, flowerRot: THREE.Euler }[] = [];

    // Internal dynamics disconnected from the Engine Wind
    private waterStrength: number = 2.0;
    private waterDirection: THREE.Vector2 = new THREE.Vector2(1, 0);
    private targetWaterStrength: number = 2.0;
    private targetWaterDirection: THREE.Vector2 = new THREE.Vector2(1, 0);
    private clarity: number = 1.0; // 0.0 = muddy, 1.0 = clear glass

    // Callbacks for GameSession
    private emitNoiseCb: ((pos: THREE.Vector3, radius: number, type: string) => void) | null = null;
    private spawnPartCb: ((x: number, y: number, z: number, type: string, count: number, customMesh?: any, customVel?: any, color?: number, scale?: number) => void) | null = null;

    constructor(private scene: THREE.Scene) {
        for (let i = 0; i < MAX_RIPPLES; i++) this.rippleData.push(new THREE.Vector4(0, 0, -1000, 0));
        for (let i = 0; i < MAX_OBJECTS; i++) this.objectPositions.push(new THREE.Vector4(0, 0, 0, 0));
    }

    public populateFlora(flora: LakeFloraInstance[]): void {
        const lilies: LakeFloraInstance[] = [];
        const seaweed: LakeFloraInstance[] = [];

        // Zero-GC loop instead of .filter()
        const floraLen = flora.length;
        for (let i = 0; i < floraLen; i++) {
            const f = flora[i];
            if (f.type === 'lily') lilies.push(f);
            else if (f.type === 'seaweed') seaweed.push(f);
        }

        if (seaweed.length > 0) {
            const geo = new THREE.PlaneGeometry(0.3, 1.5, 2, 4);
            geo.translate(0, 0.75, 0);

            let totalStrands = 0;
            const seaweedLen = seaweed.length;
            for (let i = 0; i < seaweedLen; i++) totalStrands += 3 + Math.floor(Math.random() * 3);

            this.seaweedMesh = new THREE.InstancedMesh(geo, MATERIALS.seaweed, totalStrands);
            this.seaweedMesh.userData.material = 'LEAVES';
            this.seaweedMesh.frustumCulled = false;
            this.seaweedMesh.renderOrder = 2; // Above water

            let idx = 0;
            for (let i = 0; i < seaweedLen; i++) {
                const s = seaweed[i];
                const strands = 3 + Math.floor(Math.random() * 3);
                for (let j = 0; j < strands; j++) {
                    _sharedDummy.position.copy(s.position);
                    _sharedDummy.position.x += (Math.random() - 0.5) * 0.4;
                    _sharedDummy.position.z += (Math.random() - 0.5) * 0.4;
                    _sharedDummy.scale.set(s.scale.x, s.scale.y, s.scale.x);
                    _sharedDummy.rotation.y = s.rotationY + Math.random() * Math.PI;
                    _sharedDummy.updateMatrix();
                    this.seaweedMesh!.setMatrixAt(idx++, _sharedDummy.matrix);
                }
            }
            this.seaweedMesh.instanceMatrix.needsUpdate = true;
            this.scene.add(this.seaweedMesh);
        }

        if (lilies.length > 0) {
            const padGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 8);
            const stemLength = 1.5;
            const stemGeo = new THREE.CylinderGeometry(0.03, 0.03, stemLength, 4);
            stemGeo.translate(0, -stemLength / 2, 0);
            const flowerGeo = new THREE.ConeGeometry(0.15, 0.2, 5);

            this.lilyPads = new THREE.InstancedMesh(padGeo, MATERIALS.waterLily, lilies.length);
            this.lilyPads.userData.material = 'PLANT';
            this.lilyPads.frustumCulled = false;

            this.lilyStems = new THREE.InstancedMesh(stemGeo, MATERIALS.seaweed, lilies.length);
            this.lilyStems.frustumCulled = false;

            this.lilyFlowers = new THREE.InstancedMesh(flowerGeo, MATERIALS.waterLilyFlower, lilies.length);
            this.lilyFlowers.frustumCulled = false;

            this.lilyData = [];

            const liliesLen = lilies.length;
            for (let i = 0; i < liliesLen; i++) {
                const l = lilies[i];

                _sharedDummy.position.copy(l.position);
                _sharedDummy.rotation.y = l.rotationY;
                _sharedDummy.scale.set(l.scale.x, 1, l.scale.z * 0.8);
                _sharedDummy.updateMatrix();

                this.lilyPads!.setMatrixAt(i, _sharedDummy.matrix);
                this.lilyPads!.setColorAt(i, _sharedWhiteColor);

                _sharedDummy.scale.set(l.scale.x, l.scale.y, l.scale.z);
                _sharedDummy.updateMatrix();
                this.lilyStems!.setMatrixAt(i, _sharedDummy.matrix);

                const hasFlower = Math.random() > 0.6;
                const flowerRot = new THREE.Euler((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4);

                if (hasFlower) {
                    _sharedDummyFlower.copy(_sharedDummy);
                    _sharedDummyFlower.position.x += 0.1 * l.scale.x;
                    _sharedDummyFlower.position.y += 0.1;
                    _sharedDummyFlower.position.z += 0.1 * l.scale.z;
                    _sharedDummyFlower.rotation.copy(flowerRot);
                    _sharedDummyFlower.updateMatrix();
                    this.lilyFlowers!.setMatrixAt(i, _sharedDummyFlower.matrix);
                    this.lilyFlowers!.setColorAt(i, _sharedWhiteColor);
                } else {
                    _sharedDummyFlower.scale.set(0, 0, 0);
                    _sharedDummyFlower.updateMatrix();
                    this.lilyFlowers!.setMatrixAt(i, _sharedDummyFlower.matrix);
                }

                this.lilyData.push({
                    position: l.position.clone(),
                    velocity: 0,
                    scale: new THREE.Vector3(l.scale.x, l.scale.y, l.scale.z),
                    rotationY: l.rotationY,
                    hasFlower,
                    flowerRot
                });
            }

            this.lilyPads.instanceMatrix.needsUpdate = true;
            this.lilyStems.instanceMatrix.needsUpdate = true;
            this.lilyFlowers.instanceMatrix.needsUpdate = true;

            if (this.lilyPads.instanceColor) this.lilyPads.instanceColor.needsUpdate = true;
            if (this.lilyFlowers.instanceColor) this.lilyFlowers.instanceColor.needsUpdate = true;

            this.scene.add(this.lilyPads);
            this.scene.add(this.lilyStems);
            this.scene.add(this.lilyFlowers);
        }
    }

    public addWaterBody(type: WaterBodyType, x: number, z: number, width: number, depth: number, options?: any): WaterBody {
        const preset = WATER_BODY_PRESETS[type];
        const style = options?.style ?? preset.style;
        const shape = options?.shape ?? preset.shape;

        const surface = new WaterSurface(x, z, width, depth, style, shape, this.rippleData, this.objectPositions);
        this.surfaces.push(surface);
        this.scene.add(surface.mesh);

        const body = new WaterBody(type, surface, { ...preset, style, shape });
        this.waterBodies.push(body);
        this.updateGroundUniforms();
        return body;
    }

    private bindMaterial(mat: THREE.Material | undefined) {
        if (!mat || !mat.userData.waterUniforms) return;

        const uniforms = mat.userData.waterUniforms as WaterBind;

        for (let i = 0; i < this.boundUniforms.length; i++) {
            if (this.boundUniforms[i].uTime === uniforms.uTime) return;
        }

        this.boundUniforms.push(uniforms);
    }

    public setWaterDynamics(strength: number, direction: THREE.Vector2): void {
        this.targetWaterStrength = strength * 10.0;
        if (direction.lengthSq() > 0.0001) {
            this.targetWaterDirection.copy(direction).normalize();
        }
    }

    public setClarity(clarity: number): void {
        this.clarity = Math.max(0.0, Math.min(1.0, clarity));
        for (let i = 0; i < this.surfaces.length; i++) {
            if (this.surfaces[i].material.uniforms.uClarity) {
                this.surfaces[i].material.uniforms.uClarity.value = this.clarity;
            }
        }
    }

    public registerGround(mesh: THREE.Mesh): void {
        this.grounds.push(mesh);
        this.updateGroundUniforms();
    }

    private updateGroundUniforms(): void {
        const data: THREE.Vector4[] = [];
        // Fill with current water bodies
        for (let i = 0; i < 8; i++) {
            if (i < this.waterBodies.length) {
                const b = this.waterBodies[i];
                data.push(new THREE.Vector4(
                    b.surface.bounds.x,
                    b.surface.bounds.z,
                    b.surface.bounds.width * 0.5, // radius
                    b.def.shape === 'circle' ? 1.0 : 0.0
                ));
            } else {
                data.push(new THREE.Vector4(0, 0, 0, -1)); // Inactive
            }
        }

        for (const g of this.grounds) {
            const mat = g.material as THREE.MeshStandardMaterial;
            if (mat.userData.uWaterBodies) {
                // VERY IMPORTANT: Mutate the existing array to not break Three.js uniform binding!
                const targetArray = mat.userData.uWaterBodies.value as THREE.Vector4[];
                for (let i = 0; i < 8; i++) {
                    targetArray[i].copy(data[i]);
                }
            }
        }
    }

    public setLightPosition(pos: THREE.Vector3): void {
        this.lightPosition.copy(pos);
        for (let i = 0; i < this.surfaces.length; i++) {
            this.surfaces[i].material.uniforms.uLightPosition.value.copy(this.lightPosition);
        }
    }

    public reAttach(newScene: THREE.Scene): void {
        this.scene = newScene;
        for (let i = 0; i < this.surfaces.length; i++) {
            this.scene.add(this.surfaces[i].mesh);
        }
    }

    public clear(): void {
        for (let i = this.waterBodies.length - 1; i >= 0; i--) {
            const body = this.waterBodies[i];
            this.scene.remove(body.surface.mesh);
            body.dispose();
        }
        this.waterBodies.length = 0;
        this.surfaces.length = 0;

        if (this.seaweedMesh) { this.scene.remove(this.seaweedMesh); this.seaweedMesh.dispose(); this.seaweedMesh = null; }
        if (this.lilyPads) { this.scene.remove(this.lilyPads); this.lilyPads.dispose(); this.lilyPads = null; }
        if (this.lilyStems) { this.scene.remove(this.lilyStems); this.lilyStems.dispose(); this.lilyStems = null; }
        if (this.lilyFlowers) { this.scene.remove(this.lilyFlowers); this.lilyFlowers.dispose(); this.lilyFlowers = null; }
        this.lilyData.length = 0;

        this.playerWasInWater = false;
    }

    public update(dt: number, now: number): void {
        this.globalTime += dt;

        // Bind strictly aquatic vegetation shaders
        if (this.boundUniforms.length === 0) {
            if (!MATERIALS.waterLily.userData.waterUniforms) patchWaterVegetationMaterial(MATERIALS.waterLily);
            if (!MATERIALS.seaweed.userData.waterUniforms) patchWaterVegetationMaterial(MATERIALS.seaweed);

            this.bindMaterial(MATERIALS.waterLily);
            this.bindMaterial(MATERIALS.seaweed);
        }

        // Apply water inertia (mass) - water reacts much slower than leaves
        this.waterStrength += (this.targetWaterStrength - this.waterStrength) * (dt * 0.2);
        this.waterDirection.lerp(this.targetWaterDirection, dt * 0.1);

        // Animate aquatic shaders
        for (let i = 0; i < this.boundUniforms.length; i++) {
            const b = this.boundUniforms[i];
            b.uTime.value = this.globalTime;
            if (b.uWaterDirection) b.uWaterDirection.value.copy(this.waterDirection);
            if (b.uWaveStrength) b.uWaveStrength.value = 0.4 + (this.waterStrength * 0.1);
        }

        let objIdx = 0;
        const bLen = this.waterBodies.length;

        // --- 1. Fill Object Positions for Stationary Foam ---
        if (this.playerGroup) {
            const pPos = this.playerGroup.position;
            const isMoving = pPos.distanceToSquared(this.lastPlayerPos) > 0.001;
            if (!isMoving) {
                this.objectPositions[objIdx++].set(pPos.x, pPos.z, 1.6, 1.0);
            }
        }

        for (let i = 0; i < bLen; i++) {
            const props = this.waterBodies[i].floatingProps;
            for (let j = 0; j < props.length; j++) {
                if (objIdx < MAX_OBJECTS) {
                    const p = props[j];
                    const vel = p.userData.velocity as THREE.Vector3;
                    const isMoving = vel && vel.lengthSq() > 0.01;
                    if (!isMoving) {
                        const radius = p.userData.radius || (p.userData.isBoat ? 3.8 : 1.8);
                        this.objectPositions[objIdx++].set(p.position.x, p.position.z, radius, 1.0);
                    }
                }
            }

            const sources = this.waterBodies[i].splashSources;
            for (let j = 0; j < sources.length; j++) {
                if (objIdx < MAX_OBJECTS) {
                    const p = sources[j];
                    if (props.includes(p)) continue;
                    const radius = p.userData.radius || 3.0;
                    this.objectPositions[objIdx++].set(p.position.x, p.position.z, radius, 1.0);
                }
            }
        }
        for (let i = objIdx; i < MAX_OBJECTS; i++) this.objectPositions[i].set(0, 0, 0, 0);

        // --- 2. Update Surfaces ---
        for (let i = 0; i < this.surfaces.length; i++) {
            this.surfaces[i].update(this.globalTime);
            this.surfaces[i].material.uniforms.uObjectPositions.value = this.objectPositions;
            if (this.surfaces[i].material.uniforms.uClarity) {
                this.surfaces[i].material.uniforms.uClarity.value = this.clarity;
            }

            // Sync with internal strength and direction
            this.surfaces[i].material.uniforms.uWaveStrength.value = 0.4 + (this.waterStrength * 0.1);
            if (this.surfaces[i].material.uniforms.uWaterDirection) {
                this.surfaces[i].material.uniforms.uWaterDirection.value.copy(this.waterDirection);
            }
        }

        // --- 3. Body Physics & Splashes ---
        for (let i = 0; i < bLen; i++) {
            const body = this.waterBodies[i];
            this.updateBodyPhysics(body, dt);
            this.updateSplashSources(body, dt);
        }

        this.updateInstancedLilies(dt);

        if (this.playerGroup) this.updatePlayerLogic(dt);

        // Ripples and splashes for moving objects
        for (let i = 0; i < bLen; i++) {
            const props = this.waterBodies[i].floatingProps;
            for (let j = 0; j < props.length; j++) {
                const p = props[j];
                const vel = p.userData.velocity as THREE.Vector3;
                const speedSq = vel ? vel.lengthSq() : 0;
                const isPassive = p.userData.isBall; // Water lilies

                if (speedSq > 0.1 && !isPassive) {
                    // Throttling: Kör bara plask/ljud om tiden passerat vår cooldown
                    if (!p.userData.nextSplash || this.globalTime > p.userData.nextSplash) {

                        this.spawnRipple(p.position.x, p.position.z, 0.7);

                        // Generate splash particles if moving very fast (e.g. boat driving)
                        if (speedSq > 10.0 && this.spawnPartCb && Math.random() < 0.6) {
                            this.spawnPartCb(p.position.x, p.position.y + 0.2, p.position.z, 'splash', 3);
                        }

                        // Sätt nästa tillåtna plask till om 150-250 millisekunder
                        p.userData.nextSplash = this.globalTime + 0.15 + (Math.random() * 0.1);
                    }
                }
            }
        }
    }

    private updateBodyPhysics(body: WaterBody, dt: number): void {
        const props = body.floatingProps;
        const len = props.length;
        for (let i = 0; i < len; i++) {
            const prop = props[i];
            const vel = prop.userData.velocity as THREE.Vector3;
            this.checkBuoyancy(prop.position.x, prop.position.y, prop.position.z);
            vel.y -= 19.8 * dt;

            if (_buoyancyResult.inWater) {
                // Make floating objects bounce with the waves using a strong spring force
                const isHeavy = prop.userData.vehicleDef || (prop.userData.mass && prop.userData.mass > 10);

                // Specific floatOffset logic
                let floatOffset = -0.1;
                if (prop.userData.floatOffset !== undefined) floatOffset = prop.userData.floatOffset;
                else if (prop.userData.isBoat) floatOffset = 0.5; // Lift boat out of the water
                else if (isHeavy) floatOffset = 0.0;

                const targetY = _buoyancyResult.waterLevel + floatOffset;

                // Waterlilies smoothly lerp to the surface to prevent "hysterical bouncing"
                if (prop.userData.isBall) {
                    prop.position.y += (targetY - prop.position.y) * 8.0 * dt;
                    vel.y = 0;
                    vel.x *= 0.85;
                    vel.z *= 0.85;
                } else {
                    // Standard elastic physics
                    const diffY = targetY - prop.position.y;
                    const springForce = isHeavy ? 15.0 : 40.0;
                    vel.y += diffY * springForce * dt;
                    vel.y *= 0.85;

                    // Let vehicles keep their momentum (driven by VehicleMovementSystem), 
                    // but apply 85% friction to regular floating props.
                    if (!isHeavy) {
                        vel.x *= 0.85;
                        vel.z *= 0.85;
                    }
                }

                // Shallow ground scraping (Stranding in the water)
                if (prop.position.y < _buoyancyResult.groundY) {
                    prop.position.y = _buoyancyResult.groundY;
                    vel.y = 0;
                    vel.x *= 0.8; // High friction scraping on the bed
                    vel.z *= 0.8;
                }
            } else {
                // Out of water bounds (stranding on land)
                if (prop.position.y < 0) { // Assuming land bounds are mostly Y=0
                    prop.position.y = 0;
                    vel.y = 0;
                    vel.x *= 0.7; // Dry land friction
                    vel.z *= 0.7;
                }
            }
            prop.position.addScaledVector(vel, dt);
            prop.updateMatrixWorld();
        }
    }

    private updateSplashSources(body: WaterBody, dt: number): void {
        // Ambient ripples completely silenced for calm lake surface
    }

    private updatePlayerLogic(dt: number): void {
        const pos = this.playerGroup!.position;
        this.checkBuoyancy(pos.x, pos.y, pos.z);
        if (_buoyancyResult.inWater) {
            this.stepTimer += dt;
            const isMoving = pos.distanceToSquared(this.lastPlayerPos) > 0.001;

            // Ripples for both moving and IDLE players
            if (isMoving) {
                if (this.stepTimer > 0.12) {
                    this.spawnRipple(pos.x, pos.z, 0.7);
                    this.stepTimer = 0;
                }
            } else {
                // Gentle rhythmic idle pulses
                if (this.stepTimer > 0.4) {
                    this.spawnRipple(pos.x, pos.z, 0.5);
                    this.stepTimer = 0;
                }
            }
        }
        this.lastPlayerPos.copy(pos);
    }

    public spawnRipple(x: number, z: number, strength: number = 1.0): void {
        this.rippleData[this.rippleIndex].set(x, z, this.globalTime, strength);
        this.rippleIndex = (this.rippleIndex + 1) % MAX_RIPPLES;
    }

    private updateInstancedLilies(dt: number): void {
        if (!this.lilyPads || this.lilyData.length === 0) return;

        let needsUpdate = false;
        const len = this.lilyData.length;

        for (let i = 0; i < len; i++) {
            const data = this.lilyData[i];

            this.checkBuoyancy(data.position.x, data.position.y, data.position.z);
            data.velocity -= 19.8 * dt;

            if (_buoyancyResult.inWater) {
                // Waterlilies smoothly lerp to the surface
                const targetY = _buoyancyResult.waterLevel - 0.05; // Stay flush
                if (Math.abs(targetY - data.position.y) > 0.005) {
                    data.position.y += (targetY - data.position.y) * 8.0 * dt;
                    needsUpdate = true;
                }
                data.velocity = 0;
            } else {
                if (data.position.y < 0) {
                    data.position.y = 0;
                    data.velocity = 0;
                    needsUpdate = true;
                }
            }
            data.position.y += data.velocity * dt;

            if (needsUpdate) {
                // Rebuild Matrix Pad
                _sharedDummy.position.copy(data.position);
                _sharedDummy.rotation.set(0, data.rotationY, 0);
                _sharedDummy.scale.set(data.scale.x, 1, data.scale.z * 0.8);
                _sharedDummy.updateMatrix();
                this.lilyPads.setMatrixAt(i, _sharedDummy.matrix);

                // Rebuild Matrix Stem
                _sharedDummy.scale.copy(data.scale);
                _sharedDummy.updateMatrix();
                this.lilyStems!.setMatrixAt(i, _sharedDummy.matrix);

                // Rebuild Matrix Flower
                if (data.hasFlower) {
                    _sharedDummyFlower.copy(_sharedDummy);
                    _sharedDummyFlower.position.x += 0.1 * data.scale.x;
                    _sharedDummyFlower.position.y += 0.1;
                    _sharedDummyFlower.position.z += 0.1 * data.scale.z;
                    _sharedDummyFlower.rotation.copy(data.flowerRot);
                    _sharedDummyFlower.updateMatrix();
                    this.lilyFlowers!.setMatrixAt(i, _sharedDummyFlower.matrix);
                }
            }
        }

        if (needsUpdate) {
            this.lilyPads.instanceMatrix.needsUpdate = true;
            this.lilyStems!.instanceMatrix.needsUpdate = true;
            this.lilyFlowers!.instanceMatrix.needsUpdate = true;
        }
    }

    public spawnExplosionRipple(x: number, z: number, strength: number = 1.0): void {
        this.spawnRipple(x, z, strength);
        this.rippleData[this.rippleIndex].set(x, z, this.globalTime * 2.0, strength / 2.0);
        this.rippleIndex = (this.rippleIndex + 1) % MAX_RIPPLES;
    }

    public checkBuoyancy(x: number, y: number, z: number): void {
        _buoyancyResult.inWater = false;
        _buoyancyResult.depth = 0;
        _buoyancyResult.maxDepth = 0;

        const len = this.waterBodies.length;
        for (let i = 0; i < len; i++) {
            const body = this.waterBodies[i];
            const b = body.surface.bounds;
            const shape = body.def.shape;

            let inBounds = false;
            let edgeDist = 0;

            if (shape === 'circle') {
                const dx = x - b.x;
                const dz = z - b.z;
                const distSq = dx * dx + dz * dz;
                const radius = b.width * 0.5;

                if (distSq < radius * radius) {
                    inBounds = true;
                    // Lazy evaluate Math.sqrt ONLY when we know we are inside bounds
                    edgeDist = radius - Math.sqrt(distSq);
                }
            } else {
                const halfW = b.width * 0.5;
                const halfD = b.depth * 0.5;
                const dx = Math.abs(x - b.x);
                const dz = Math.abs(z - b.z);

                if (dx <= halfW && dz <= halfD) {
                    inBounds = true;
                    edgeDist = Math.min(halfW - dx, halfD - dz);
                }
            }

            if (inBounds) {
                _buoyancyResult.inWater = true;
                _buoyancyResult.maxDepth = body.def.maxDepth;

                // Sync perfectly with HYPER-SHARP "V-shaped" waves
                const waveScale = 0.45;
                const phaseXZ = x * this.waterDirection.x + z * this.waterDirection.y;

                const sin1 = Math.sin(phaseXZ * waveScale - this.globalTime * 1.5) * 0.5 + 0.5;
                const sin2 = Math.sin(phaseXZ * (waveScale * 1.6) + z * 0.2 - this.globalTime * 2.0) * 0.5 + 0.5;

                const w1 = (sin1 * sin1 * sin1) * 0.45;
                const w2 = (sin2 * sin2) * 0.22;

                const waveStrength = 0.4 + (this.waterStrength);

                let edgeDampen = 1.0;
                if (edgeDist <= 0) edgeDampen = 0;
                else if (edgeDist < 2.0) {
                    const t = edgeDist / 2.0;
                    edgeDampen = t * t * (3.0 - 2.0 * t); // smoothstep
                }

                _buoyancyResult.baseWaterLevel = 0.35;
                _buoyancyResult.waterLevel = 0.35 + ((w1 + w2) * waveStrength * edgeDampen);
                _buoyancyResult.depth = _buoyancyResult.waterLevel - y;

                // Calculate physical ground height for this position (sloped lake bed)
                const dropZone = 10.0; // Slopes over 10 meters to provide a long, realistic wading beach
                if (edgeDist <= 0) {
                    _buoyancyResult.groundY = 0;
                } else if (edgeDist < dropZone) {
                    const t = edgeDist / dropZone;
                    _buoyancyResult.groundY = -body.def.maxDepth * (t * t); // Smooth slope
                } else {
                    _buoyancyResult.groundY = -body.def.maxDepth;
                }
                return; // Break early if found
            }
        }
    }

    public setPlayerRef(g: THREE.Group) { this.playerGroup = g; }

    public setCallbacks(c: { emitNoise?: any, spawnPart?: any }) {
        if (c.emitNoise) this.emitNoiseCb = c.emitNoise;
        if (c.spawnPart) this.spawnPartCb = c.spawnPart;
    }
}