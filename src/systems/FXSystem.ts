import * as THREE from 'three';
import { GEOMETRY, MATERIALS } from '../utils/assets';
import { GamePlaySounds } from '../utils/audio/AudioLib';
import { MaterialType } from '../content/environment';
import { FXParticleType, FXDecalType, ParticleState, FXSpawnRequest } from '../types/FXTypes';
import { SystemID } from './SystemID';

type FXMaterial = THREE.Material & {
    opacity?: number;
    transparent?: boolean;
    color?: THREE.Color;
};

// --- DOD JUMP TABLES (Zero-GC Lookups) ---
const NUM_PARTICLE_TYPES = 64; // Increased to accommodate SCRAP, MEAT, and future expansion
const PHYSICS_FLAGS = new Uint8Array(NUM_PARTICLE_TYPES);
const INSTANCED_FLAGS = new Uint8Array(NUM_PARTICLE_TYPES);
const ESSENTIAL_FLAGS = new Uint8Array(NUM_PARTICLE_TYPES);
const PARTICLE_COLORS = new Uint32Array(NUM_PARTICLE_TYPES);
const PARTICLE_TTL = new Float32Array(NUM_PARTICLE_TYPES);

const _tempColor = new THREE.Color();
const _v1 = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);
const _dummyMatrix = new THREE.Matrix4();
const _dummyQuat = new THREE.Quaternion();
const _lastSpawnX = new Float32Array(NUM_PARTICLE_TYPES);
const _lastSpawnZ = new Float32Array(NUM_PARTICLE_TYPES);

const REQUEST_POOL: FXSpawnRequest[] = [];
const DECAL_REQUEST_POOL: FXSpawnRequest[] = [];

/**
 * VINTERDÖD: FX System Initialization
 * Populates TypedArrays strictly indexed by the FXParticleType enum.
 * Ensures O(1) jump lookups without hidden allocation overhead.
 */
const initTypedArrays = () => {
    // Default Fallbacks
    PARTICLE_TTL.fill(0.5);
    _lastSpawnX.fill(-999);
    _lastSpawnZ.fill(-999);

    // --- PHYSICS FLAGS (1 = true) ---
    [
        FXParticleType.DEBRIS, FXParticleType.GLASS, FXParticleType.GORE,
        FXParticleType.SPLASH, FXParticleType.BLOOD_SPLATTER, FXParticleType.BLACK_SMOKE,
        FXParticleType.SCRAP, FXParticleType.MEAT
    ].forEach(t => PHYSICS_FLAGS[t] = 1);

    // --- INSTANCED FLAGS ---
    [
        FXParticleType.FIRE, FXParticleType.FLAME, FXParticleType.LARGE_FIRE, FXParticleType.SMOKE,
        FXParticleType.SPARK, FXParticleType.MUZZLE, FXParticleType.ENEMY_EFFECT_STUN,
        FXParticleType.ELECTRIC_FLASH, FXParticleType.ENEMY_EFFECT_FLAME, FXParticleType.ENEMY_EFFECT_SPARK,
        FXParticleType.GORE, FXParticleType.SPLASH, FXParticleType.IMPACT_SPLAT,
        FXParticleType.CAMPFIRE_FLAME, FXParticleType.CAMPFIRE_SPARK, FXParticleType.CAMPFIRE_SMOKE,
        FXParticleType.FLAMETHROWER_FIRE, FXParticleType.GROUND_IMPACT, FXParticleType.SHOCKWAVE,
        FXParticleType.FROST_NOVA, FXParticleType.SCREECH_WAVE, FXParticleType.ELECTRIC_BEAM,
        FXParticleType.MAGNETIC_SPARKS, FXParticleType.IMPACT, FXParticleType.BLAST_RADIUS,
        FXParticleType.BLACK_SMOKE, FXParticleType.DEBRIS_TRAIL, FXParticleType.BLOOD_SPLATTER,
        FXParticleType.SCRAP, FXParticleType.MEAT
    ].forEach(t => INSTANCED_FLAGS[t] = 1);

    // --- ESSENTIAL FLAGS ---
    [
        FXParticleType.FLASH, FXParticleType.ELECTRIC_FLASH, FXParticleType.SPARK,
        FXParticleType.SPLASH, FXParticleType.BLOOD_SPLATTER, FXParticleType.BLOOD_SPLAT,
        FXParticleType.IMPACT, FXParticleType.ENEMY_EFFECT_STUN, FXParticleType.MUZZLE,
        FXParticleType.MUZZLE_FLASH, FXParticleType.MUZZLE_SPARK, FXParticleType.MUZZLE_SMOKE
    ].forEach(t => ESSENTIAL_FLAGS[t] = 1);

    // --- COLORS ---
    PARTICLE_COLORS[FXParticleType.FLAME] = 0xff7700;
    PARTICLE_COLORS[FXParticleType.FIRE] = 0xff7700;
    PARTICLE_COLORS[FXParticleType.LARGE_FIRE] = 0xff7700;
    PARTICLE_COLORS[FXParticleType.CAMPFIRE_FLAME] = 0xff7700;
    PARTICLE_COLORS[FXParticleType.ENEMY_EFFECT_FLAME] = 0xff7700;
    PARTICLE_COLORS[FXParticleType.FLAMETHROWER_FIRE] = 0xff7700;
    PARTICLE_COLORS[FXParticleType.ENEMY_EFFECT_STUN] = 0x00ffff;
    PARTICLE_COLORS[FXParticleType.CAMPFIRE_SPARK] = 0x00ffff;
    PARTICLE_COLORS[FXParticleType.ENEMY_EFFECT_SPARK] = 0x00ffff;
    PARTICLE_COLORS[FXParticleType.MAGNETIC_SPARKS] = 0x00ffff;
    PARTICLE_COLORS[FXParticleType.SPARK] = 0xffcc00;
    PARTICLE_COLORS[FXParticleType.IMPACT] = 0xffcc00;
    PARTICLE_COLORS[FXParticleType.SMOKE] = 0x555555;
    PARTICLE_COLORS[FXParticleType.LARGE_SMOKE] = 0x555555;
    PARTICLE_COLORS[FXParticleType.CAMPFIRE_SMOKE] = 0x555555;
    PARTICLE_COLORS[FXParticleType.BLACK_SMOKE] = 0x000000;
    PARTICLE_COLORS[FXParticleType.BLOOD_SPLATTER] = 0x880000;
    PARTICLE_COLORS[FXParticleType.GORE] = 0x880000;
    PARTICLE_COLORS[FXParticleType.GLASS] = 0xffffff;
    PARTICLE_COLORS[FXParticleType.FLASH] = 0xffffff;
    PARTICLE_COLORS[FXParticleType.ELECTRIC_FLASH] = 0xffffff;
    PARTICLE_COLORS[FXParticleType.SHOCKWAVE] = 0xffffff;
    PARTICLE_COLORS[FXParticleType.FROST_NOVA] = 0xffffff;
    PARTICLE_COLORS[FXParticleType.SCREECH_WAVE] = 0xffffff;
    PARTICLE_COLORS[FXParticleType.SPLASH] = 0x77bbcc;
    PARTICLE_COLORS[FXParticleType.BLAST_RADIUS] = 0xff0000;
    PARTICLE_COLORS[FXParticleType.DEBRIS_TRAIL] = 0x888888;
    PARTICLE_COLORS[FXParticleType.SCRAP] = 0x999999;
    PARTICLE_COLORS[FXParticleType.MEAT] = 0x660000;

    // --- TTL (Seconds) ---
    PARTICLE_TTL[FXParticleType.BLOOD_SPLATTER] = 1.8;
    PARTICLE_TTL[FXParticleType.SPLASH] = 1.0;
    PARTICLE_TTL[FXParticleType.DEBRIS] = 2.0;
    PARTICLE_TTL[FXParticleType.LARGE_FIRE] = 1.6;
    PARTICLE_TTL[FXParticleType.LARGE_SMOKE] = 1.6;
    PARTICLE_TTL[FXParticleType.FLAME] = 1.4;
    PARTICLE_TTL[FXParticleType.FIRE] = 1.4;
    PARTICLE_TTL[FXParticleType.SMOKE] = 1.0;
    PARTICLE_TTL[FXParticleType.SPARK] = 0.3;
    PARTICLE_TTL[FXParticleType.ENEMY_EFFECT_FLAME] = 0.6;
    PARTICLE_TTL[FXParticleType.ENEMY_EFFECT_SPARK] = 0.3;
    PARTICLE_TTL[FXParticleType.ELECTRIC_BEAM] = 0.2;
    PARTICLE_TTL[FXParticleType.GROUND_IMPACT] = 0.5;
    PARTICLE_TTL[FXParticleType.SHOCKWAVE] = 0.5;
    PARTICLE_TTL[FXParticleType.FROST_NOVA] = 0.5;
    PARTICLE_TTL[FXParticleType.SCREECH_WAVE] = 0.4;
    PARTICLE_TTL[FXParticleType.MAGNETIC_SPARKS] = 0.6;
    PARTICLE_TTL[FXParticleType.IMPACT] = 0.2;
    PARTICLE_TTL[0] = 0.5; // Default fallback
};

initTypedArrays();

const _FALLBACK_REQUEST: FXSpawnRequest = {
    scene: null as any,
    x: 0, y: 0, z: 0, type: FXParticleType.NONE, customVel: new THREE.Vector3(),
    hasCustomVel: false, color: undefined, scale: undefined, life: undefined, material: undefined
};

// Limits
const MAX_INSTANCES_PER_MESH = 10000;
const MAX_AMBIENT_SPAWNS_PER_FRAME = 500;
const AMBIENT_QUEUE_HARD_CAP = 2000;
const MAX_DECALS = 250;
const MAX_PARTICLE_REQUESTS = 5000;

for (let i = 0; i < MAX_PARTICLE_REQUESTS; i++) {
    REQUEST_POOL.push({
        scene: null as any, x: 0, y: 0, z: 0, type: FXParticleType.NONE,
        customVel: new THREE.Vector3(), hasCustomVel: false, color: undefined,
        scale: undefined, life: undefined, material: undefined
    });
}

for (let i = 0; i < MAX_DECALS; i++) {
    DECAL_REQUEST_POOL.push({
        scene: null as any, x: 0, y: 0, z: 0, type: FXDecalType.NONE,
        customVel: new THREE.Vector3(), hasCustomVel: false, color: undefined,
        scale: undefined, life: undefined, material: undefined
    });
}

let _whiteGoreMaterial: THREE.Material | null = null;

const _INITIAL_STATE_POOL: ParticleState[] = [];
const _INITIAL_STATE_FREE: number[] = [];
for (let i = 0; i < 10000; i++) {
    _INITIAL_STATE_POOL.push({
        pos: new THREE.Vector3(), rot: new THREE.Euler(),
        scaleVec: new THREE.Vector3(1, 1, 1), vel: new THREE.Vector3(),
        rotVel: new THREE.Vector3(), life: 0, maxLife: 0, type: FXParticleType.NONE,
        isPooled: false, isInstanced: false, isPhysics: false, landed: false,
        inUse: false, color: undefined, _poolIdx: i
    });
    _INITIAL_STATE_FREE.push(i);
}

export const FXSystem = {
    systemId: SystemID.FX,
    id: 'fx_system',

    essentialQueue: [] as FXSpawnRequest[],
    ambientQueue: [] as FXSpawnRequest[],
    decalQueue: [] as FXSpawnRequest[],
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

    _instancedMeshes: [] as (THREE.InstancedMesh | undefined)[],
    _instancedCounts: new Int32Array(NUM_PARTICLE_TYPES),
    _activeInstancedKeys: [] as FXParticleType[],

    // --- POOLING METHODS ---

    getPooledMesh: (
        scene: THREE.Scene,
        geo: THREE.BufferGeometry,
        mat: THREE.Material,
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

    recycleMesh: (m: THREE.Mesh<THREE.BufferGeometry, THREE.Material>) => {
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
        // Fallback for extreme cases
        const p: ParticleState = {
            pos: new THREE.Vector3(), rot: new THREE.Euler(),
            scaleVec: new THREE.Vector3(1, 1, 1), vel: new THREE.Vector3(),
            rotVel: new THREE.Vector3(), life: 0, maxLife: 0, type: FXParticleType.NONE,
            isPooled: false, isInstanced: false, isPhysics: false, landed: false,
            inUse: true, _poolIdx: FXSystem.PARTICLE_STATE_POOL.length
        };
        FXSystem.PARTICLE_STATE_POOL.push(p);
        return p;
    },

    _getSpawnRequest: (): FXSpawnRequest => {
        const req = REQUEST_POOL.pop();
        if (req) {
            req.life = undefined; req.scale = undefined; req.color = undefined;
            req.material = undefined; req.hasCustomVel = false;
            return req;
        }
        return _FALLBACK_REQUEST;
    },

    // --- SPAWNING ---

    _spawnDecalImmediate: (req: FXSpawnRequest, decalList: THREE.Mesh[]) => {
        const type = req.type as FXDecalType;
        const geo = type === FXDecalType.SPLATTER ? GEOMETRY.splatterDecal : GEOMETRY.decal;

        let d: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;

        if (decalList.length < MAX_DECALS) {
            d = FXSystem.getPooledMesh(req.scene, geo, req.material || MATERIALS.bloodDecal);
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

        if (type === FXDecalType.SPLATTER) {
            d.scale.set(d.userData.targetScale, d.userData.targetScale, d.userData.targetScale);
        } else {
            d.scale.set(0.01, 0.01, 0.01);
        }

        d.renderOrder = (req.material === MATERIALS.scorchDecal) ? -1 : 50;
    },

    _spawnParticleImmediate: (req: FXSpawnRequest, particlesList: ParticleState[]) => {
        if (isNaN(req.x)) return;

        if (particlesList.length >= 6000) {
            FXSystem._killParticle(0, particlesList);
        }

        const t = req.type as FXParticleType;
        const isInstanced = INSTANCED_FLAGS[t] === 1;
        const p = FXSystem.getPooledState();

        p.type = t;
        p.landed = false;
        p.isPooled = !req.customMesh;
        p.isInstanced = isInstanced;
        p.isPhysics = PHYSICS_FLAGS[t] === 1;

        p.color = req.color ?? (isInstanced ? (PARTICLE_COLORS[t] || 0x888888) : undefined);
        p.pos.set(req.x, req.y, req.z);

        if (t === FXParticleType.ELECTRIC_FLASH && req.hasCustomVel) {
            _v1.set(req.x + req.customVel.x, req.y + req.customVel.y, req.z + req.customVel.z);
            _dummyMatrix.lookAt(p.pos, _v1, _UP);
            _dummyQuat.setFromRotationMatrix(_dummyMatrix);
            p.rot.setFromQuaternion(_dummyQuat);
        } else if (t === FXParticleType.SHOCKWAVE) {
            p.rot.set(-Math.PI / 2, 0, 0);
        } else {
            p.rot.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
        }

        const s = req.scale || 1.0;
        let fs = 1.0;
        if (t === FXParticleType.FLASH) {
            fs = (1.5 + Math.random() * 1.0) * s;
            p.scaleVec.set(fs, fs, fs);
        }
        else if (t === FXParticleType.ELECTRIC_FLASH && req.hasCustomVel) {
            const dist = req.customVel.length();
            const thickness = (0.15 + Math.random() * 0.1) * s;
            p.scaleVec.set(thickness, thickness, dist);
        }
        else if (t === FXParticleType.LARGE_FIRE) {
            fs = 3.0 * Math.random() * s;
            p.scaleVec.set(fs, fs, fs);
        }
        else if (t === FXParticleType.LARGE_SMOKE) {
            fs = 4.0 * Math.random() * s;
            p.scaleVec.set(fs, fs, fs);
        }
        else if (t === FXParticleType.BLACK_SMOKE) {
            fs = (2.0 + Math.random() * 2.0) * s;
            p.scaleVec.set(fs, fs, fs);
        }
        else if (t === FXParticleType.FLAME || t === FXParticleType.FIRE || t === FXParticleType.SMOKE || t === FXParticleType.ENEMY_EFFECT_FLAME || t === FXParticleType.ENEMY_EFFECT_SPARK || t === FXParticleType.FLAMETHROWER_FIRE) {
            fs = (1.0 + Math.random() * 0.8) * s;
            p.scaleVec.set(fs, fs, fs);
        }
        else if (t === FXParticleType.SPARK) {
            fs = (0.5 + Math.random() * 0.5) * s;
            p.scaleVec.set(fs, fs, fs);
        }
        else if (t === FXParticleType.SPLASH || t === FXParticleType.BLOOD_SPLATTER) {
            fs = (0.5 + Math.random() * 0.7) * s;
            p.scaleVec.set(fs, fs, fs);
        }
        else if (t === FXParticleType.ELECTRIC_BEAM) {
            p.scaleVec.set(0.2, 0.2, 5.0);
        }
        else if (t === FXParticleType.SCREECH_WAVE || t === FXParticleType.SHOCKWAVE || t === FXParticleType.FROST_NOVA) {
            p.scaleVec.set(1, 1, 1);
        }
        else {
            fs = (0.3 + Math.random() * 0.3) * s;
            p.scaleVec.set(fs, fs, fs);
        }

        if (t === FXParticleType.ELECTRIC_FLASH) {
            p.vel.set(0, 0, 0);
        } else if (req.hasCustomVel) {
            p.vel.copy(req.customVel);
        } else {
            const isBlood = (t === FXParticleType.BLOOD_SPLATTER);
            const speedScale = (t === FXParticleType.GORE) ? 8.0 : (t === FXParticleType.SPLASH || isBlood ? 9.0 : 1.0);
            const isFireFX = (t === FXParticleType.FLAME || t === FXParticleType.FIRE || t === FXParticleType.SPARK || t === FXParticleType.SMOKE || t === FXParticleType.ENEMY_EFFECT_FLAME || t === FXParticleType.ENEMY_EFFECT_SPARK);
            const isLargeFX = (t === FXParticleType.LARGE_FIRE || t === FXParticleType.LARGE_SMOKE);
            const vyScale = isLargeFX ? 3.0 : (isFireFX ? 1.8 : 0.8);
            const hzScale = isLargeFX ? 2.0 : (isFireFX ? 1.2 : 1.0);

            const vertVel = isBlood ? (14.0 + Math.random() * 4.0) : Math.random() * speedScale * (t === FXParticleType.SPLASH ? 1.5 : vyScale);

            p.vel.set(
                (Math.random() - 0.5) * speedScale * (isBlood ? 1.5 : hzScale),
                vertVel,
                (Math.random() - 0.5) * speedScale * (isBlood ? 1.5 : hzScale)
            );
        }

        if (t === FXParticleType.ELECTRIC_FLASH) {
            p.life = req.life !== undefined ? req.life : (0.05 + Math.random() * 0.05);
        } else {
            const baseLife = PARTICLE_TTL[t] || PARTICLE_TTL[0];
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

        const dummyMatrix = new THREE.Matrix4();
        dummyMatrix.makeTranslation(0, -1000, 0);

        for (let t = 1; t < NUM_PARTICLE_TYPES; t++) {
            if (INSTANCED_FLAGS[t] === 1) {
                const imesh = FXSystem._getInstancedMesh(scene, t);
                imesh.setMatrixAt(0, dummyMatrix);
                imesh.instanceMatrix.needsUpdate = true;
                imesh.count = 1;
                if (imesh.parent !== scene) scene.add(imesh);
                if (t === FXParticleType.SHOCKWAVE || t === FXParticleType.DEBRIS) {
                    imesh.frustumCulled = false;
                }
            }
        }
    },

    spawnDecal: (scene: THREE.Scene, decalList: THREE.Mesh[], x: number, z: number, scale: number, material?: THREE.Material, type: FXDecalType = FXDecalType.DECAL) => {
        const mergeRadiusSq = (scale * 0.4) * (scale * 0.4);

        for (let i = 0; i < decalList.length; i++) {
            const existingDecal = decalList[i];
            if (existingDecal.material === material || (!material && existingDecal.material === MATERIALS.bloodDecal)) {
                const dx = existingDecal.position.x - x;
                const dz = existingDecal.position.z - z;
                if (dx * dx + dz * dz < mergeRadiusSq) {
                    const maxScale = scale * 2.5;
                    existingDecal.userData.targetScale = Math.min(maxScale, existingDecal.userData.targetScale + (scale * 0.3));
                    return;
                }
            }
        }

        let req = DECAL_REQUEST_POOL.pop();
        if (!req) req = { scene, x, y: 0, z, type, customVel: new THREE.Vector3(), hasCustomVel: false };
        else { req.scene = scene; req.x = x; req.z = z; req.type = type; }
        req.scale = scale; req.material = material;
        FXSystem.decalQueue.push(req);
    },

    spawnParticle: (scene: THREE.Scene, particlesList: ParticleState[], x: number, y: number, z: number, type: FXParticleType, count: number, customMesh?: any, customVel?: THREE.Vector3, color?: number, scale?: number, life?: number) => {
        const isEssential = ESSENTIAL_FLAGS[type] === 1;

        if (!isEssential) {
            const lastX = _lastSpawnX[type];
            const lastZ = _lastSpawnZ[type];
            if ((x - lastX) * (x - lastX) + (z - lastZ) * (z - lastZ) < 0.04) {
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
                req.customVel.copy(customVel); req.hasCustomVel = true;
            } else {
                req.customVel.set(0, 0, 0); req.hasCustomVel = false;
            }

            if (isEssential) FXSystem.essentialQueue.push(req);
            else if (FXSystem.ambientQueue.length < AMBIENT_QUEUE_HARD_CAP) FXSystem.ambientQueue.push(req);
        }
    },

    updateFX: (scene: THREE.Scene, particlesList: ParticleState[], decalList: THREE.Mesh[], callbacks: any, delta: number, simTime: number, renderTime: number, state: any) => {
        const globalTimeScale = state?.globalTimeScale || 1.0;
        const scaledDelta = delta * globalTimeScale;
        const safeDelta = scaledDelta > 0.1 ? 0.1 : scaledDelta;

        const iKeys = FXSystem._activeInstancedKeys;
        for (let k = 0; k < iKeys.length; k++) {
            const imesh = FXSystem._instancedMeshes[iKeys[k]];
            if (imesh && imesh.parent !== scene) scene.add(imesh);
        }

        const decay = safeDelta;
        const safeAirFriction = Math.max(0, 1.0 - (30.0 * safeDelta));
        const safeShrinkRate = Math.max(0, 1.0 - (60.0 * safeDelta));
        const safeFireShrinkRate = Math.max(0, 1.0 - (9.0 * safeDelta));

        for (let i = particlesList.length - 1; i >= 0; i--) {
            const p = particlesList[i];
            p.life -= decay;
            if (p.life <= 0) { FXSystem._killParticle(i, particlesList); continue; }

            if (!p.landed) {
                p.pos.x += p.vel.x * safeDelta;
                p.pos.y += p.vel.y * safeDelta;
                p.pos.z += p.vel.z * safeDelta;

                const t = p.type;
                if (p.isPhysics) {
                    p.vel.y -= 150 * safeDelta;
                    if (t !== FXParticleType.SPLASH && t !== FXParticleType.BLOOD_SPLATTER) {
                        p.rot.x += p.rotVel.x * 60 * safeDelta;
                        p.rot.z += p.rotVel.z * 60 * safeDelta;
                    }
                    if (p.pos.y <= (t === FXParticleType.SPLASH || t === FXParticleType.BLOOD_SPLATTER ? -5.0 : 0.05)) {
                        FXSystem._handleLanding(p, i, particlesList, callbacks);
                        if (!p.inUse) continue;
                    }
                } else {
                    p.vel.x *= safeAirFriction; p.vel.y *= safeAirFriction; p.vel.z *= safeAirFriction;
                    const pScale = p.scaleVec;
                    if (t === FXParticleType.SHOCKWAVE || t === FXParticleType.FLASH || t === FXParticleType.SCREECH_WAVE) {
                        const grow = (t === FXParticleType.SHOCKWAVE ? 180 : (t === FXParticleType.FLASH ? 90 : 60)) * safeDelta;
                        pScale.x += grow; pScale.y += grow; pScale.z += grow;
                    } else if (t === FXParticleType.ELECTRIC_FLASH) {
                        pScale.x *= 1.0 - (2.5 * safeDelta); pScale.y *= 1.0 - (2.5 * safeDelta);
                    } else if (t === FXParticleType.FLAMETHROWER_FIRE) {
                        const grow = 30.0 * safeDelta;
                        pScale.x += grow; pScale.y += grow; pScale.z += grow;
                    } else if (t === FXParticleType.FIRE || t === FXParticleType.FLAME || t === FXParticleType.LARGE_FIRE) {
                        pScale.x *= safeFireShrinkRate; pScale.y *= safeFireShrinkRate; pScale.z *= safeFireShrinkRate;
                    } else if (t === FXParticleType.BLACK_SMOKE) {
                        const grow = 6.0 * safeDelta;
                        pScale.x += grow; pScale.y += grow; pScale.z += grow;
                    } else if (t === FXParticleType.ELECTRIC_BEAM) {
                        pScale.z += 20 * safeDelta; pScale.x *= 0.9; pScale.y *= 0.9;
                    } else {
                        pScale.x *= safeShrinkRate; pScale.y *= safeShrinkRate; pScale.z *= safeShrinkRate;
                    }
                }
            }

            if (p.isInstanced) {
                const imesh = FXSystem._instancedMeshes[p.type];
                const idx = FXSystem._instancedCounts[p.type];
                if (imesh && idx < MAX_INSTANCES_PER_MESH) {
                    _dummyQuat.setFromEuler(p.rot);
                    _dummyMatrix.compose(p.pos, _dummyQuat, p.scaleVec);
                    imesh.setMatrixAt(idx, _dummyMatrix);
                    if (p.color !== undefined) imesh.setColorAt(idx, _tempColor.setHex(p.color));
                    FXSystem._instancedCounts[p.type]++;
                } else if (imesh) {
                    FXSystem._instancedCounts[p.type]++;
                }
            }
        }

        const eQueue = FXSystem.essentialQueue;
        for (let i = 0; i < eQueue.length; i++) {
            const req = eQueue[i]; req.scene = scene;
            FXSystem._spawnParticleImmediate(req, particlesList);
            REQUEST_POOL.push(req);
        }
        eQueue.length = 0;

        const aQueue = FXSystem.ambientQueue;
        const pEnd = Math.min(aQueue.length, FXSystem._ambientQueueHead + MAX_AMBIENT_SPAWNS_PER_FRAME);
        for (let i = FXSystem._ambientQueueHead; i < pEnd; i++) {
            const req = aQueue[i]; req.scene = scene;
            FXSystem._spawnParticleImmediate(req, particlesList);
            REQUEST_POOL.push(req);
        }
        FXSystem._ambientQueueHead = pEnd;
        if (FXSystem._ambientQueueHead >= aQueue.length) { aQueue.length = 0; FXSystem._ambientQueueHead = 0; }

        const dQueue = FXSystem.decalQueue;
        for (let i = 0; i < dQueue.length; i++) {
            const req = dQueue[i];
            FXSystem._spawnDecalImmediate(req, decalList);
            DECAL_REQUEST_POOL.push(req);
        }
        dQueue.length = 0;

        for (let i = 0; i < decalList.length; i++) {
            const m = decalList[i];
            const ts = m.userData.targetScale;
            if (ts && m.scale.x < ts) {
                const ns = Math.min(ts, m.scale.x + ts * 3.0 * safeDelta);
                m.scale.set(ns, ns, ns);
            }
        }

        for (let k = 0; k < iKeys.length; k++) {
            const t = iKeys[k]; const imesh = FXSystem._instancedMeshes[t]!;
            imesh.count = FXSystem._instancedCounts[t]; imesh.instanceMatrix.needsUpdate = true;
            if (imesh.instanceColor) imesh.instanceColor.needsUpdate = true;
            if (imesh.count > 0) imesh.computeBoundingSphere();
            FXSystem._instancedCounts[t] = 0;
        }
    },

    _killParticle: (index: number, list: ParticleState[]) => {
        const p = list[index];
        p.inUse = false; FXSystem.FREE_STATE_INDICES.push(p._poolIdx);
        list[index] = list[list.length - 1]; list.pop();
    },

    _handleLanding: (p: ParticleState, index: number, list: ParticleState[], callbacks: any) => {
        p.pos.y = 0.05;
        const t = p.type;
        if (t === FXParticleType.BLOOD_SPLATTER) {
            p.landed = true;
            if (Math.random() < 0.40) callbacks.spawnDecal(p.pos.x, p.pos.z, 0.4 + Math.random() * 0.4, MATERIALS.bloodDecal);
            FXSystem._killParticle(index, list);
        } else if (t === FXParticleType.GORE) {
            p.landed = true;
            if (Math.random() < 0.40) callbacks.spawnDecal(p.pos.x, p.pos.z, 0.8 + Math.random() * 0.5, MATERIALS.bloodDecal);
            GamePlaySounds.playImpact(MaterialType.FLESH);
            p.vel.set(0, 0, 0);
        } else if (t === FXParticleType.DEBRIS) {
            if (p.vel.y < -8) { p.vel.y *= -0.3; p.vel.x *= 0.5; p.vel.z *= 0.5; p.landed = false; }
            else { p.vel.set(0, 0, 0); p.landed = true; }
        } else {
            p.landed = true; FXSystem._killParticle(index, list);
        }
    },

    _getInstancedMesh: (scene: THREE.Scene, type: FXParticleType): THREE.InstancedMesh => {
        if (!FXSystem._instancedMeshes[type]) {
            let geo: THREE.BufferGeometry = GEOMETRY.particle;
            let mat: THREE.Material = MATERIALS.bullet;

            if (type === FXParticleType.FIRE || type === FXParticleType.FLAME || type === FXParticleType.LARGE_FIRE || type === FXParticleType.CAMPFIRE_FLAME || type === FXParticleType.ENEMY_EFFECT_FLAME || type === FXParticleType.FLAMETHROWER_FIRE) {
                geo = GEOMETRY.flame;
                mat = (type === FXParticleType.ENEMY_EFFECT_FLAME) ? MATERIALS.enemy_effect_flame : MATERIALS.fire;
            } else if (type === FXParticleType.SPARK || type === FXParticleType.SMOKE || type === FXParticleType.CAMPFIRE_SPARK || type === FXParticleType.CAMPFIRE_SMOKE || type === FXParticleType.ENEMY_EFFECT_SPARK) {
                mat = (type === FXParticleType.ENEMY_EFFECT_SPARK) ? MATERIALS.enemy_effect_spark : MATERIALS.bullet;
            } else if (type === FXParticleType.DEBRIS) mat = MATERIALS.stone;
            else if (type === FXParticleType.GLASS) { geo = GEOMETRY.shard; mat = MATERIALS.glassShard; }
            else if (type === FXParticleType.FLASH || type === FXParticleType.ELECTRIC_FLASH) {
                geo = (type === FXParticleType.FLASH) ? GEOMETRY.sphere : GEOMETRY.shard; mat = MATERIALS.flashWhite;
            } else if (type === FXParticleType.ENEMY_EFFECT_STUN) { geo = GEOMETRY.shard; mat = MATERIALS.enemy_effect_stun; }
            else if (type === FXParticleType.LARGE_SMOKE) { geo = GEOMETRY.flame; mat = MATERIALS.smoke; }
            else if (type === FXParticleType.SPLASH) { geo = GEOMETRY.splash; mat = MATERIALS.splash; }
            else if (type === FXParticleType.BLOOD_SPLATTER) { geo = GEOMETRY.bloodSplatter; mat = MATERIALS.bloodSplatter; }
            else if (type === FXParticleType.IMPACT_SPLAT) { geo = GEOMETRY.impactSplat; mat = MATERIALS.impactSplat; }
            else if (type === FXParticleType.BLAST_RADIUS) { geo = GEOMETRY.blastRadius; mat = MATERIALS.blastRadius; }
            else if (type === FXParticleType.GROUND_IMPACT || type === FXParticleType.IMPACT) { geo = GEOMETRY.stone; mat = MATERIALS.stone; }
            else if (type === FXParticleType.SCREECH_WAVE || type === FXParticleType.SHOCKWAVE || type === FXParticleType.FROST_NOVA) { geo = GEOMETRY.shockwave; mat = MATERIALS.shockwave; }
            else if (type === FXParticleType.ELECTRIC_BEAM) { geo = GEOMETRY.shard; mat = MATERIALS.flashWhite; }
            else if (type === FXParticleType.MAGNETIC_SPARKS) { geo = GEOMETRY.particle; mat = MATERIALS.bullet; }
            else if (type === FXParticleType.GORE) { geo = GEOMETRY.gore; mat = _whiteGoreMaterial as THREE.Material; }

            if (!mat) mat = MATERIALS.bullet;
            const imesh = new THREE.InstancedMesh(geo, mat, MAX_INSTANCES_PER_MESH);
            imesh.frustumCulled = false;
            if (type === FXParticleType.DEBRIS || type === FXParticleType.GLASS || type === FXParticleType.GORE) {
                imesh.castShadow = true; imesh.receiveShadow = !(imesh.material as any).isMeshBasicMaterial;
            } else { imesh.castShadow = false; imesh.receiveShadow = false; }
            imesh.renderOrder = 60;
            if (!imesh.instanceColor) imesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES_PER_MESH * 3), 3);
            FXSystem._instancedMeshes[type] = imesh;
            FXSystem._activeInstancedKeys.push(type);
        }
        const mesh = FXSystem._instancedMeshes[type]!;
        if (scene && mesh.parent !== scene) scene.add(mesh);
        return mesh;
    }
};