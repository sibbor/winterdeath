import * as THREE from 'three';
import { GEOMETRY, MATERIALS } from '../utils/assets';
import { GamePlaySounds } from '../utils/audio/AudioLib';
import { MaterialType } from '../content/environment';

// --- TYPES & INTERFACES ---

type FXMaterial = THREE.Material & {
    opacity?: number;
    transparent?: boolean;
    color?: THREE.Color;
};

export interface ParticleState {
    pos: THREE.Vector3;
    rot: THREE.Euler;
    scaleVec: THREE.Vector3;
    vel: THREE.Vector3;
    rotVel: THREE.Vector3;
    life: number;
    maxLife: number;
    type: string;
    isPooled: boolean;
    isInstanced: boolean;
    isPhysics: boolean;
    landed: boolean;
    inUse: boolean;
    color?: number;
    _poolIdx: number;
}

interface SpawnRequest {
    scene: THREE.Scene;
    x: number; y: number; z: number;
    type: string;
    customMesh?: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    customVel: THREE.Vector3;
    hasCustomVel: boolean;
    color?: number;
    scale?: number;
    life?: number;
    material?: THREE.Material;
}

// --- PERFORMANCE SCRATCHPADS & CONSTANTS ---
const _tempColor = new THREE.Color();
const _v1 = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);
const _dummyMatrix = new THREE.Matrix4();
const _dummyQuat = new THREE.Quaternion();
const _dummyScale = new THREE.Vector3();
const _lastSpawnX: Record<string, number> = {};
const _lastSpawnZ: Record<string, number> = {};
const REQUEST_POOL: SpawnRequest[] = [];
const DECAL_REQUEST_POOL: SpawnRequest[] = [];

// VINTERDÖD FIX: Static fallback to prevent mid-combat object allocations if pool runs dry
const _FALLBACK_REQUEST: SpawnRequest = {
    scene: null as any,
    x: 0, y: 0, z: 0, type: '', customVel: new THREE.Vector3(),
    hasCustomVel: false, color: undefined, scale: undefined, life: undefined, material: undefined
};

// Limits
const MAX_INSTANCES_PER_MESH = 10000; // Increased to handle massive horde density
const MAX_AMBIENT_SPAWNS_PER_FRAME = 500;
const AMBIENT_QUEUE_WARNING_LIMIT = 1500;
const AMBIENT_QUEUE_HARD_CAP = 2000;
const MAX_DECALS = 250;
const MAX_PARTICLE_REQUESTS = 5000; // Expanded buffer for essential + ambient

// Pre-allocate pools to prevent mid-combat GC spikes
for (let i = 0; i < MAX_PARTICLE_REQUESTS; i++) {
    REQUEST_POOL.push({
        scene: null as any,
        x: 0, y: 0, z: 0, type: '', customVel: new THREE.Vector3(),
        hasCustomVel: false, color: undefined, scale: undefined, life: undefined, material: undefined
    });
}

for (let i = 0; i < MAX_DECALS; i++) {
    DECAL_REQUEST_POOL.push({
        scene: null as any,
        x: 0, y: 0, z: 0, type: '', customVel: new THREE.Vector3(),
        hasCustomVel: false, color: undefined, scale: undefined, life: undefined, material: undefined
    });
}

// TTL mapped object for faster V8 property access
const PHYSICS_TYPES: Record<string, boolean> = {
    debris: true, glass: true, gore: true, splash: true, blood_splatter: true, black_smoke: true
};

const INSTANCED_TYPES: Record<string, boolean> = {
    fire: true, flame: true, large_fire: true, smoke: true, spark: true, muzzle: true,
    enemy_effect_stun: true, electric_flash: true, enemy_effect_flame: true,
    enemy_effect_spark: true, gore: true, splash: true,
    impact_splat: true, campfire_flame: true, campfire_spark: true,
    campfire_smoke: true, flamethrower_fire: true, ground_impact: true,
    shockwave: true, frost_nova: true, screech_wave: true, electric_beam: true,
    magnetic_sparks: true, impact: true, blastRadius: true,
    black_smoke: true, debris_trail: true, blood_splatter: true
};

const PARTICLE_COLORS: Record<string, number> = {
    flame: 0xff7700, fire: 0xff7700, large_fire: 0xff7700, campfire_flame: 0xff7700,
    enemy_effect_flame: 0xff7700, flamethrower_fire: 0xff7700,
    enemy_effect_stun: 0x00ffff, campfire_spark: 0x00ffff, enemy_effect_spark: 0x00ffff, magnetic_sparks: 0x00ffff,
    spark: 0xffcc00, impact: 0xffcc00,
    smoke: 0x555555, large_smoke: 0x555555, campfire_smoke: 0x555555, black_smoke: 0x000000,
    blood_splatter: 0x880000, gore: 0x880000,
    glass: 0xffffff, flash: 0xffffff, electric_flash: 0xffffff, shockwave: 0xffffff,
    frost_nova: 0xffffff, screech_wave: 0xffffff,
    splash: 0x77bbcc,
    blastRadius: 0xff0000,
    debris_trail: 0x888888
};

const ESSENTIAL_TYPES: Record<string, boolean> = {
    flash: true, electric_flash: true, spark: true, splash: true, blood_splatter: true, blood_splat: true, impact: true, enemy_effect_stun: true,
    muzzle: true, muzzle_flash: true, muzzle_spark: true, muzzle_smoke: true
};

let _whiteGoreMaterial: THREE.Material | null = null;

const PARTICLE_TTL: Record<string, number> = {
    blood_splatter: 1.8, splash: 1.0,
    debris: 2.0, large_fire: 1.6, large_smoke: 1.6, flame: 1.4, fire: 1.4,
    smoke: 1.0, spark: 0.3, enemy_effect_flame: 0.6, enemy_effect_spark: 0.3,
    electric_beam: 0.2, ground_impact: 0.5, shockwave: 0.5, frost_nova: 0.5,
    screech_wave: 0.4, magnetic_sparks: 0.6, impact: 0.2, default: 0.5
};

// VINTERDÖD FIX: Pre-allocate state pool to prevent massive GC spike on first grenade
const _INITIAL_STATE_POOL: ParticleState[] = [];
const _INITIAL_STATE_FREE: number[] = [];
for (let i = 0; i < 10000; i++) {
    _INITIAL_STATE_POOL.push({
        pos: new THREE.Vector3(),
        rot: new THREE.Euler(),
        scaleVec: new THREE.Vector3(1, 1, 1),
        vel: new THREE.Vector3(),
        rotVel: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
        type: '',
        isPooled: false,
        isInstanced: false,
        isPhysics: false,
        landed: false,
        inUse: false,
        color: undefined,
        _poolIdx: i
    });
    _INITIAL_STATE_FREE.push(i);
}

export const FXSystem = {

    essentialQueue: [] as SpawnRequest[],
    ambientQueue: [] as SpawnRequest[],
    decalQueue: [] as SpawnRequest[],
    _essentialQueueHead: 0,
    _ambientQueueHead: 0,
    _decalQueueHead: 0,
    _decalPoolIdx: 0,

    reset: () => {
        FXSystem.essentialQueue.length = 0;
        FXSystem.ambientQueue.length = 0;
        FXSystem.decalQueue.length = 0;
        FXSystem._essentialQueueHead = 0;
        FXSystem._ambientQueueHead = 0;
        FXSystem._decalQueueHead = 0;
    },

    MESH_POOL: [] as THREE.Mesh<THREE.BufferGeometry, THREE.Material>[],
    FREE_MESH_INDICES: [] as number[],
    PARTICLE_STATE_POOL: _INITIAL_STATE_POOL,
    FREE_STATE_INDICES: _INITIAL_STATE_FREE,

    _instancedMeshes: {} as Record<string, THREE.InstancedMesh>,
    _instancedCounts: {} as Record<string, number>,
    _instancedMeshKeys: [] as string[],

    // --- POOLING METHODS ---

    getPooledMesh: (
        scene: THREE.Scene,
        geo: THREE.BufferGeometry,
        mat: THREE.Material,
        type: string,
        isInstanced: boolean = false
    ): THREE.Mesh<THREE.BufferGeometry, THREE.Material> => {
        let m: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;

        if (FXSystem.FREE_MESH_INDICES.length > 0) {
            const idx = FXSystem.FREE_MESH_INDICES.pop()!;
            m = FXSystem.MESH_POOL[idx];
            m.geometry = geo;
            m.material = mat;
            m.visible = true;
            m.scale.set(1, 1, 1);
            m.rotation.set(0, 0, 0);
        } else {
            m = new THREE.Mesh(geo, mat);
            m.userData.poolIdx = FXSystem.MESH_POOL.length;
            FXSystem.MESH_POOL.push(m);
        }

        if (!isInstanced && m.parent !== scene) scene.add(m);
        return m;
    },

    recycleMesh: (m: THREE.Mesh<THREE.BufferGeometry, THREE.Material>, type: string) => {
        m.visible = false;
        m.position.set(0, -1000, 0);
        FXSystem.FREE_MESH_INDICES.push(m.userData.poolIdx);
    },

    getPooledState: (): ParticleState => {
        if (FXSystem.FREE_STATE_INDICES.length > 0) {
            const idx = FXSystem.FREE_STATE_INDICES.pop()!;
            const p = FXSystem.PARTICLE_STATE_POOL[idx];
            p.inUse = true;
            return p;
        }
        const p: ParticleState = {
            pos: new THREE.Vector3(),
            rot: new THREE.Euler(),
            scaleVec: new THREE.Vector3(1, 1, 1),
            vel: new THREE.Vector3(),
            rotVel: new THREE.Vector3(),
            life: 0,
            maxLife: 0,
            type: '',
            isPooled: false,
            isInstanced: false,
            isPhysics: false,
            landed: false,
            inUse: true,
            _poolIdx: FXSystem.PARTICLE_STATE_POOL.length
        };
        FXSystem.PARTICLE_STATE_POOL.push(p);
        return p;
    },

    _getSpawnRequest: (): SpawnRequest => {
        const req = REQUEST_POOL.pop();
        if (req) {
            req.life = undefined;
            req.scale = undefined;
            req.color = undefined;
            req.material = undefined;
            req.hasCustomVel = false;
            return req;
        }
        // VINTERDÖD FIX: Return static fallback instead of creating garbage
        return _FALLBACK_REQUEST;
    },

    // --- SPAWNING ---

    _spawnDecalImmediate: (req: SpawnRequest, decalList: THREE.Mesh[]) => {
        const geo = req.type === 'splatter' ? GEOMETRY.splatterDecal : GEOMETRY.decal;

        // --- CIRKULÄR BUFFER (DOD) ---
        // Vi skriver över det äldsta decal-objektet istället för att allokera nytt eller köra shift().
        let d: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;

        if (decalList.length < MAX_DECALS) {
            d = FXSystem.getPooledMesh(req.scene, geo, req.material || MATERIALS.bloodDecal, 'decal');
            decalList.push(d);
        } else {
            d = decalList[FXSystem._decalPoolIdx] as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
            d.geometry = geo;
            d.material = req.material || MATERIALS.bloodDecal;
            d.visible = true;
            if (d.parent !== req.scene) {
                if (d.parent) d.parent.remove(d);
                req.scene.add(d);
            }
        }

        FXSystem._decalPoolIdx = (FXSystem._decalPoolIdx + 1) % MAX_DECALS;

        d.position.set(req.x, 0.2 + Math.random() * 0.05, req.z);
        d.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
        d.userData.targetScale = req.scale || 1.0;

        if (req.type === 'splatter') {
            d.scale.set(d.userData.targetScale, d.userData.targetScale, d.userData.targetScale);
        } else {
            d.scale.set(0.01, 0.01, 0.01);
        }

        d.renderOrder = (req.material === MATERIALS.scorchDecal) ? -1 : 50;
    },

    _spawnPartImmediate: (req: SpawnRequest, particlesList: ParticleState[]) => {
        if (isNaN(req.x)) return;

        // VINTERDÖD SAFETY: Aggressive Recycling (The "Max Payne" fix)
        // If we hit the limit during slow-mo world saturation, overwrite the oldest particle.
        if (particlesList.length >= 6000) {
            FXSystem._killParticle(0, particlesList);
        }

        const t = req.type;
        const isInstanced = !!INSTANCED_TYPES[t];
        const p = FXSystem.getPooledState();

        p.type = t;
        p.landed = false;
        p.isPooled = !req.customMesh;
        p.isInstanced = isInstanced;
        p.isPhysics = !!PHYSICS_TYPES[t];

        p.color = req.color ?? (isInstanced ? (PARTICLE_COLORS[t] ?? 0x888888) : undefined);
        p.pos.set(req.x, req.y, req.z);

        if (t === 'electric_flash' && req.hasCustomVel) {
            _v1.set(req.x + req.customVel.x, req.y + req.customVel.y, req.z + req.customVel.z);
            _dummyMatrix.lookAt(p.pos, _v1, _UP);
            _dummyQuat.setFromRotationMatrix(_dummyMatrix);
            p.rot.setFromQuaternion(_dummyQuat);
        } else if (t === 'shockwave') {
            p.rot.set(-Math.PI / 2, 0, 0);
        } else {
            p.rot.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
        }

        const s = req.scale || 1.0;
        let fs = 1.0;
        if (t === 'flash') {
            fs = (1.5 + Math.random() * 1.0) * s;
            p.scaleVec.set(fs, fs, fs);
        }
        else if (t === 'electric_flash' && req.hasCustomVel) {
            const dist = req.customVel.length();
            const thickness = (0.15 + Math.random() * 0.1) * s;
            p.scaleVec.set(thickness, thickness, dist);
        }
        else if (t === 'large_fire') {
            fs = 3.0 * Math.random() * s;
            p.scaleVec.set(fs, fs, fs);
        }
        else if (t === 'large_smoke') {
            fs = 4.0 * Math.random() * s;
            p.scaleVec.set(fs, fs, fs);
        }
        else if (t === 'black_smoke') {
            fs = (2.0 + Math.random() * 2.0) * s;
            p.scaleVec.set(fs, fs, fs);
        }
        else if (t === 'flame' || t === 'fire' || t === 'smoke' || t === 'enemy_effect_flame' || t === 'enemy_effect_spark' || t === 'flamethrower_fire') {
            fs = (1.0 + Math.random() * 0.8) * s;
            p.scaleVec.set(fs, fs, fs);
        }
        else if (t === 'spark') {
            fs = (0.5 + Math.random() * 0.5) * s;
            p.scaleVec.set(fs, fs, fs);
        }
        else if (t === 'splash' || t === 'blood_splatter') {
            fs = (0.5 + Math.random() * 0.7) * s;
            p.scaleVec.set(fs, fs, fs);
        }
        else if (t === 'electric_beam') {
            p.scaleVec.set(0.2, 0.2, 5.0);
        }
        else if (t === 'screech_wave' || t === 'shockwave' || t === 'frost_nova') {
            p.scaleVec.set(1, 1, 1);
        }
        else {
            fs = (0.3 + Math.random() * 0.3) * s;
            p.scaleVec.set(fs, fs, fs);
        }

        if (t === 'electric_flash') {
            p.vel.set(0, 0, 0);
        } else if (req.hasCustomVel) {
            p.vel.copy(req.customVel);
        } else {
            const isBlood = (t === 'blood_splatter');
            const speedScale = (t === 'gore') ? 8.0 : (t === 'splash' || isBlood ? 9.0 : 1.0);
            const isFireFX = (t === 'flame' || t === 'fire' || t === 'spark' || t === 'smoke' || t === 'enemy_effect_flame' || t === 'enemy_effect_spark');
            const isLargeFX = (t === 'large_fire' || t === 'large_smoke');
            const vyScale = isLargeFX ? 3.0 : (isFireFX ? 1.8 : 0.8);
            const hzScale = isLargeFX ? 2.0 : (isFireFX ? 1.2 : 1.0);

            // VINTERDÖD TRAJECTORY: Blood eruptions launch up 12–18m/s to clear heads, then splash out.
            const vertVel = isBlood ? (14.0 + Math.random() * 4.0) : Math.random() * speedScale * (t === 'splash' ? 1.5 : vyScale);

            p.vel.set(
                (Math.random() - 0.5) * speedScale * (isBlood ? 1.5 : hzScale),
                vertVel,
                (Math.random() - 0.5) * speedScale * (isBlood ? 1.5 : hzScale)
            );
        }

        if (t === 'electric_flash') {
            p.life = req.life !== undefined ? req.life : (0.05 + Math.random() * 0.05);
        } else {
            const baseLife = PARTICLE_TTL[t] ?? PARTICLE_TTL.default;
            p.life = req.life !== undefined ? req.life : (baseLife + Math.random() * 0.2);
        }
        p.maxLife = p.life;
        p.rotVel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);

        particlesList.push(p);
    },

    // --- INTERFACE ---

    preload: (scene: THREE.Scene) => {
        if (!MATERIALS['_blackSmoke']) MATERIALS['_blackSmoke'] = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false });
        if (!MATERIALS['flame']) MATERIALS['flame'] = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.9, depthWrite: false });
        if (!MATERIALS['large_fire']) MATERIALS['large_fire'] = new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.9, depthWrite: false });

        if (!_whiteGoreMaterial) {
            _whiteGoreMaterial = (MATERIALS.gore as THREE.MeshStandardMaterial).clone();
            (_whiteGoreMaterial as any).color.setHex(0xffffff);
            _whiteGoreMaterial.userData = { isSharedAsset: true };
        }

        const types = Object.keys(INSTANCED_TYPES);
        const dummyMatrix = new THREE.Matrix4();

        dummyMatrix.makeTranslation(0, -1000, 0);

        for (let i = 0; i < types.length; i++) {
            const type = types[i];
            const imesh = FXSystem._getInstancedMesh(scene, type);

            imesh.setMatrixAt(0, dummyMatrix);
            imesh.instanceMatrix.needsUpdate = true;
            imesh.count = 1;

            if (imesh.parent !== scene) scene.add(imesh);

            if (type === 'shockwave' || type === 'explosion' || type === 'debris') {
                imesh.frustumCulled = false;
            }
        }
    },

    spawnDecal: (scene: THREE.Scene, decalList: THREE.Mesh[], x: number, z: number, scale: number, material?: THREE.Material, type: string = 'decal') => {
        const mergeRadiusSq = (scale * 0.4) * (scale * 0.4);

        for (let i = 0; i < decalList.length; i++) {
            const existingDecal = decalList[i];

            if (existingDecal.material === material || (!material && existingDecal.material === MATERIALS.bloodDecal)) {
                const dx = existingDecal.position.x - x;
                const dz = existingDecal.position.z - z;
                const distSq = dx * dx + dz * dz;

                if (distSq < mergeRadiusSq) {
                    const maxScale = scale * 2.5;
                    if (existingDecal.userData.targetScale < maxScale) {
                        existingDecal.userData.targetScale = Math.min(maxScale, existingDecal.userData.targetScale + (scale * 0.3));
                    }
                    return;
                }
            }
        }

        let req = DECAL_REQUEST_POOL.pop();
        if (!req) req = { scene, x, y: 0, z, type, customVel: new THREE.Vector3(), hasCustomVel: false };
        else { req.scene = scene; req.x = x; req.z = z; req.type = type; }

        req.scale = scale;
        req.material = material;
        FXSystem.decalQueue.push(req);
    },

    spawnPart: (scene: THREE.Scene, particlesList: ParticleState[], x: number, y: number, z: number, type: string, count: number, customMesh?: any, customVel?: THREE.Vector3, color?: number, scale?: number, life?: number) => {
        const isEssential = !!ESSENTIAL_TYPES[type];

        if (!isEssential) {
            if (_lastSpawnX[type] === undefined) {
                _lastSpawnX[type] = -999;
                _lastSpawnZ[type] = -999;
            }

            const lastX = _lastSpawnX[type];
            const lastZ = _lastSpawnZ[type];
            const distSq = (x - lastX) * (x - lastX) + (z - lastZ) * (z - lastZ);

            if (distSq < 0.04) {
                if (count > 2) count = Math.ceil(count * 0.5);
                else if (Math.random() < 0.7) return;
            }

            _lastSpawnX[type] = x;
            _lastSpawnZ[type] = z;
        }

        for (let i = 0; i < count; i++) {
            let req = FXSystem._getSpawnRequest();
            req.scene = scene; req.x = x; req.y = y; req.z = z;
            req.type = type; req.customMesh = customMesh; req.color = color; req.scale = scale; req.life = life;

            if (customVel) {
                req.customVel.copy(customVel);
                req.hasCustomVel = true;
            } else {
                req.customVel.set(0, 0, 0);
                req.hasCustomVel = false;
            }

            if (isEssential) {
                FXSystem.essentialQueue.push(req);
            } else {
                if (FXSystem.ambientQueue.length >= AMBIENT_QUEUE_HARD_CAP) {
                    REQUEST_POOL.push(req);
                    continue;
                }
                if (FXSystem.ambientQueue.length === AMBIENT_QUEUE_WARNING_LIMIT) {
                    console.warn(`[FXSystem] Ambient queue is heavily backlogged (${FXSystem.ambientQueue.length}). Performance may degrade.`);
                }
                FXSystem.ambientQueue.push(req);
            }
        }
    },

    update: (scene: THREE.Scene, particlesList: ParticleState[], decalList: THREE.Mesh[], callbacks: any, delta: number, simTime: number, renderTime: number, state: any) => {
        // --- WORLD TIME SCALE (QUICK_FINGER) ---
        const globalTimeScale = state?.globalTimeScale || 1.0;
        const scaledDelta = delta * globalTimeScale;

        // VINTERDÖD FIX: Forced Scene Re-linking (Ensures FX persist across sector transitions)
        const types = Object.keys(INSTANCED_TYPES);
        for (let j = 0; j < types.length; j++) {
            const imesh = FXSystem._instancedMeshes[types[j]];
            if (imesh && imesh.parent !== scene) {
                scene.add(imesh);
            }
        }

        const safeDelta = scaledDelta > 0.1 ? 0.1 : scaledDelta;

        const decay = safeDelta;
        const airFriction = 1.0 - (30.0 * safeDelta);
        const shrinkRate = 1.0 - (60.0 * safeDelta);
        const fireShrinkRate = 1.0 - (9.0 * safeDelta);
        const flameThrowerDrag = 1.0 - (30.0 * safeDelta);

        const safeAirFriction = airFriction < 0 ? 0 : airFriction;
        const safeShrinkRate = shrinkRate < 0 ? 0 : shrinkRate;
        const safeFireShrinkRate = fireShrinkRate < 0 ? 0 : fireShrinkRate;
        const safeFlameDrag = flameThrowerDrag < 0 ? 0 : flameThrowerDrag;

        for (let i = particlesList.length - 1; i >= 0; i--) {
            const p = particlesList[i];
            p.life -= decay;

            if (p.life <= 0) {
                FXSystem._killParticle(i, particlesList);
                continue;
            }

            if (!p.landed) {
                const pPos = p.pos;
                pPos.x += p.vel.x * safeDelta;
                pPos.y += p.vel.y * safeDelta;
                pPos.z += p.vel.z * safeDelta;

                if (p.isPhysics) {
                    p.vel.y -= 150 * safeDelta;
                    // VINTERDÖD FIX: Splashes and Blood droplets stay upright (no tumbling)
                    if (p.type !== 'splash' && p.type !== 'blood_splatter') {
                        p.rot.x += p.rotVel.x * 60 * safeDelta;
                        p.rot.z += p.rotVel.z * 60 * safeDelta;
                    }
                    // Y-Threshold: Matching splash depth for blood to allow falling into water/pits
                    if (pPos.y <= (p.type === 'splash' || p.type === 'blood_splatter' ? -5.0 : 0.05)) {
                        FXSystem._handleLanding(p, i, particlesList, callbacks);
                        if (!p.inUse) continue;
                    }
                } else {
                    p.vel.x *= safeAirFriction;
                    p.vel.y *= safeAirFriction;
                    p.vel.z *= safeAirFriction;

                    const pScale = p.scaleVec;
                    const pType = p.type;

                    if (pType === 'shockwave') {
                        const grow = 180 * safeDelta;
                        pScale.x += grow;
                        pScale.y += grow;
                        pScale.z += grow;
                    } else if (pType === 'flash') {
                        const grow = 90 * safeDelta;
                        pScale.x += grow;
                        pScale.y += grow;
                        pScale.z += grow;
                    } else if (pType === 'electric_flash') {
                        pScale.x *= 1.0 - (2.5 * safeDelta);
                        pScale.y *= 1.0 - (2.5 * safeDelta);
                    } else if (pType === 'flamethrower_fire') {
                        const grow = 30.0 * safeDelta;
                        pScale.x += grow;
                        pScale.y += grow;
                        pScale.z += grow;
                    } else if (pType === 'fire' || pType === 'flame' || pType === 'large_fire') {
                        pScale.x *= safeFireShrinkRate;
                        pScale.y *= safeFireShrinkRate;
                        pScale.z *= safeFireShrinkRate;
                    } else if (pType === 'black_smoke') {
                        const grow = 6.0 * safeDelta;
                        pScale.x += grow;
                        pScale.y += grow;
                        pScale.z += grow;
                    } else if (pType === 'screech_wave') {
                        const grow = 60 * safeDelta;
                        pScale.x += grow;
                        pScale.y += grow;
                        pScale.z += grow;
                    } else if (pType === 'electric_beam') {
                        pScale.z += 20 * safeDelta;
                        pScale.x *= 0.9;
                        pScale.y *= 0.9;
                    } else {
                        pScale.x *= safeShrinkRate;
                        pScale.y *= safeShrinkRate;
                        pScale.z *= safeShrinkRate;
                    }
                }
            }

            if (p.isInstanced) {
                const pType = p.type;
                const imesh = FXSystem._instancedMeshes[pType];
                const idx = FXSystem._instancedCounts[pType];
                if (imesh && idx < MAX_INSTANCES_PER_MESH) {
                    _dummyQuat.setFromEuler(p.rot);
                    _dummyMatrix.compose(p.pos, _dummyQuat, p.scaleVec);
                    imesh.setMatrixAt(idx, _dummyMatrix);
                    const pColor = p.color;
                    if (pColor !== undefined) {
                        imesh.setColorAt(idx, _tempColor.setHex(pColor));
                    }
                    FXSystem._instancedCounts[pType]++;
                } else if (imesh) {
                    FXSystem._instancedCounts[pType]++;
                }
            }
        }

        const eQueue = FXSystem.essentialQueue;
        const eLen = eQueue.length;
        for (let i = FXSystem._essentialQueueHead; i < eLen; i++) {
            const req = eQueue[i];
            req.scene = scene;
            FXSystem._spawnPartImmediate(req, particlesList);
            REQUEST_POOL.push(req);
        }
        eQueue.length = 0;
        FXSystem._essentialQueueHead = 0;

        const aQueue = FXSystem.ambientQueue;
        const aLen = aQueue.length;
        const pEnd = FXSystem._ambientQueueHead + MAX_AMBIENT_SPAWNS_PER_FRAME < aLen ? FXSystem._ambientQueueHead + MAX_AMBIENT_SPAWNS_PER_FRAME : aLen;
        for (let i = FXSystem._ambientQueueHead; i < pEnd; i++) {
            const req = aQueue[i];
            req.scene = scene;
            FXSystem._spawnPartImmediate(req, particlesList);
            REQUEST_POOL.push(req);
        }
        FXSystem._ambientQueueHead = pEnd;
        if (FXSystem._ambientQueueHead >= aLen) {
            aQueue.length = 0;
            FXSystem._ambientQueueHead = 0;
        }

        const dQueue = FXSystem.decalQueue;
        const dLen = dQueue.length;
        const dEnd = FXSystem._decalQueueHead + 10 < dLen ? FXSystem._decalQueueHead + 10 : dLen;
        for (let i = FXSystem._decalQueueHead; i < dEnd; i++) {
            const req = dQueue[i];
            FXSystem._spawnDecalImmediate(req, decalList);
            DECAL_REQUEST_POOL.push(req);
        }
        FXSystem._decalQueueHead = dEnd;
        if (FXSystem._decalQueueHead >= dLen) {
            dQueue.length = 0;
            FXSystem._decalQueueHead = 0;
        }

        for (let i = 0; i < decalList.length; i++) {
            const m = decalList[i];
            const targetScale = m.userData.targetScale;
            if (targetScale && m.scale.x < targetScale) {
                const growthStep = targetScale * 3.0 * safeDelta;
                const newScale = m.scale.x + growthStep;
                const finalScale = newScale > targetScale ? targetScale : newScale;
                m.scale.x = finalScale;
                m.scale.y = finalScale;
                m.scale.z = finalScale;
            }
        }

        const iKeys = FXSystem._instancedMeshKeys;
        const iLen = iKeys.length;
        for (let k = 0; k < iLen; k++) {
            const type = iKeys[k];
            const imesh = FXSystem._instancedMeshes[type];
            imesh.count = FXSystem._instancedCounts[type];
            imesh.instanceMatrix.needsUpdate = true;
            const iAttributes = imesh.instanceColor;
            if (iAttributes) iAttributes.needsUpdate = true;
            if (imesh.count > 0) imesh.computeBoundingSphere();
            FXSystem._instancedCounts[type] = 0;
        }

        if (decalList.length > MAX_DECALS) {
            console.warn(`[FXSystem] MAX_DECALS (${MAX_DECALS}) exceeded. This should not happen with circular buffer.`);
        }
    },

    _killParticle: (index: number, list: ParticleState[]) => {
        const p = list[index];

        p.inUse = false;
        FXSystem.FREE_STATE_INDICES.push(p._poolIdx);

        list[index] = list[list.length - 1];
        list.pop();
    },

    _handleLanding: (p: ParticleState, index: number, list: ParticleState[], callbacks: any) => {
        p.pos.y = 0.05;

        if (p.type === 'blood_splatter') {
            p.landed = true;
            // Higher decal probability for high-fidelity splatters
            if (Math.random() < 0.40) callbacks.spawnDecal(p.pos.x, p.pos.z, 0.4 + Math.random() * 0.4, MATERIALS.bloodDecal);
            FXSystem._killParticle(index, list);
        } else if (p.type === 'gore') {
            p.landed = true;
            if (Math.random() < 0.40) callbacks.spawnDecal(p.pos.x, p.pos.z, 0.8 + Math.random() * 0.5, MATERIALS.bloodDecal);
            GamePlaySounds.playImpact(MaterialType.FLESH);
            p.vel.set(0, 0, 0);
        } else if (p.type === 'debris') {
            if (p.vel.y < -8) {
                p.vel.y *= -0.3;
                p.vel.x *= 0.5;
                p.vel.z *= 0.5;
                p.landed = false;
            } else {
                p.vel.set(0, 0, 0);
                p.landed = true;
            }
        } else {
            p.landed = true;
            FXSystem._killParticle(index, list);
        }
    },

    _getInstancedMesh: (scene: THREE.Scene, type: string): THREE.InstancedMesh => {
        if (!FXSystem._instancedMeshes[type]) {
            let geo: THREE.BufferGeometry = GEOMETRY.particle;
            let mat: THREE.Material = MATERIALS.bullet;

            if (type === 'fire' || type === 'flame' || type === 'large_fire' || type === 'campfire_flame' || type === 'enemy_effect_flame' || type === 'flamethrower_fire') {
                geo = GEOMETRY.flame;
                mat = (type === 'enemy_effect_flame') ? MATERIALS.enemy_effect_flame : MATERIALS.fire;
            }
            else if (type === 'spark' || type === 'smoke' || type === 'campfire_spark' || type === 'campfire_smoke' || type === 'enemy_effect_spark') {
                mat = (type === 'enemy_effect_spark') ? MATERIALS.enemy_effect_spark : MATERIALS.bullet;
            }
            else if (type === 'debris' || type === 'scrap') mat = MATERIALS.stone;
            else if (type === 'glass') { geo = GEOMETRY.shard; mat = MATERIALS.glassShard; }
            else if (type === 'flash' || type === 'electric_flash') {
                geo = (type === 'flash') ? GEOMETRY.sphere : GEOMETRY.shard;
                mat = MATERIALS.flashWhite;
            }
            else if (type === 'enemy_effect_stun') { geo = GEOMETRY.shard; mat = MATERIALS.enemy_effect_stun; }
            else if (type === 'large_smoke') { geo = GEOMETRY.flame; mat = MATERIALS.smoke; }
            else if (type === 'splash') { geo = GEOMETRY.splash; mat = MATERIALS.splash; }
            else if (type === 'blood_splatter') { geo = GEOMETRY.bloodSplatter; mat = MATERIALS.bloodSplatter; }
            else if (type === 'impact_splat') { geo = GEOMETRY.impactSplat; mat = MATERIALS.impactSplat; }
            else if (type === 'blastRadius') { geo = GEOMETRY.blastRadius; mat = MATERIALS.blastRadius; }
            else if (type === 'bullet_shell') { geo = GEOMETRY.bullet; mat = MATERIALS.bullet; }
            else if (type === 'ground_impact' || type === 'impact') { geo = GEOMETRY.stone; mat = MATERIALS.stone; }
            else if (type === 'screech_wave' || type === 'shockwave' || type === 'frost_nova') { geo = GEOMETRY.shockwave; mat = MATERIALS.shockwave; }
            else if (type === 'electric_beam') { geo = GEOMETRY.shard; mat = MATERIALS.flashWhite; }
            else if (type === 'magnetic_sparks') { geo = GEOMETRY.particle; mat = MATERIALS.bullet; }
            else if (type === 'gore') {
                geo = GEOMETRY.gore;
                // VINTERDÖD FIX: Lazy clone removed. Relies entirely on AssetPreloader to pre-cache the material.
                mat = _whiteGoreMaterial as THREE.Material;
            }

            // VINTERDÖD DOD FIX: Material fallback to prevent crash if AssetPreloader hasn't warmed up gore yet
            if (!mat) mat = MATERIALS.bullet;

            const imesh = new THREE.InstancedMesh(geo, mat, MAX_INSTANCES_PER_MESH);
            imesh.frustumCulled = false;

            if (type === 'debris' || type === 'scrap' || type === 'glass' || type === 'gore') {
                imesh.castShadow = true;
                const isBasic = (imesh.material as any).isMeshBasicMaterial;
                imesh.receiveShadow = !isBasic;
            } else {
                imesh.castShadow = false;
                imesh.receiveShadow = false;
            }

            imesh.renderOrder = 60;

            if (!imesh.instanceColor) {
                imesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES_PER_MESH * 3), 3);
            }

            FXSystem._instancedMeshes[type] = imesh;
            FXSystem._instancedCounts[type] = 0;
            FXSystem._instancedMeshKeys.push(type);
        }

        const mesh = FXSystem._instancedMeshes[type];
        if (scene && mesh.parent !== scene) {
            scene.add(mesh);
        }

        FXSystem._instancedMeshes[type].visible = true;

        return FXSystem._instancedMeshes[type];
    }
};