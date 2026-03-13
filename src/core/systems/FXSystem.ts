import * as THREE from 'three';
import { GEOMETRY, MATERIALS } from '../../utils/assets';
import { soundManager } from '../../utils/SoundManager';

// --- TYPES & INTERFACES ---

type FXMaterial = THREE.Material & {
    opacity?: number;
    transparent?: boolean;
    color?: THREE.Color;
};

interface ParticleState {
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
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
    particlesList: ParticleState[];
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

// --- PERFORMANCE SCRATCHPADS ---
const _tempColor = new THREE.Color();
const _v1 = new THREE.Vector3();
const REQUEST_POOL: SpawnRequest[] = [];
const DECAL_REQUEST_POOL: SpawnRequest[] = [];

// Pre-allocate pools to prevent mid-combat GC spikes
for (let i = 0; i < 500; i++) {
    REQUEST_POOL.push({
        scene: null as any, particlesList: [],
        x: 0, y: 0, z: 0, type: '', customVel: new THREE.Vector3(),
        hasCustomVel: false, color: undefined, scale: undefined, life: undefined, material: undefined
    });
}

for (let i = 0; i < 150; i++) {
    DECAL_REQUEST_POOL.push({
        scene: null as any, particlesList: [],
        x: 0, y: 0, z: 0, type: '', customVel: new THREE.Vector3(),
        hasCustomVel: false, color: undefined, scale: undefined, life: undefined, material: undefined
    });
}

const UNIQUE_MATERIAL_TYPES = [
    'black_smoke', 'debris_trail', 'shockwave', 'flash', 'splash', 'electric_beam', 'ground_impact', 'screech_wave'
];

const PHYSICS_TYPES = new Set([
    'debris', 'glass', 'blood', 'gore', 'splash'
]);

// Spawn limits
const MAX_INSTANCES_PER_MESH = 5000;
const MAX_AMBIENT_SPAWNS_PER_FRAME = 250;

// Max decals
const MAX_DECALS = 150;

// TTL for particles
const PARTICLE_TTL: Record<string, number> = {
    blood: 120,
    debris: 200,
    large_fire: 60,
    large_smoke: 60,
    flame: 60,
    fire: 60,
    smoke: 60,
    spark: 60,
    enemy_effect_flame: 60,
    enemy_effect_spark: 60,
    electric_beam: 15,
    ground_impact: 40,
    screech_wave: 30,
    default: 30
};

export const FXSystem = {

    essentialQueue: [] as SpawnRequest[],
    ambientQueue: [] as SpawnRequest[],
    decalQueue: [] as SpawnRequest[],
    _essentialQueueHead: 0,
    _ambientQueueHead: 0,
    _decalQueueHead: 0,

    reset: () => {
        FXSystem.essentialQueue.length = 0;
        FXSystem.ambientQueue.length = 0;
        FXSystem.decalQueue.length = 0;
        FXSystem._essentialQueueHead = 0;
        FXSystem._ambientQueueHead = 0;
        FXSystem._decalQueueHead = 0;
    },

    // Pools
    MESH_POOL: [] as THREE.Mesh<THREE.BufferGeometry, THREE.Material>[],
    FREE_MESH_INDICES: [] as number[],
    MATERIAL_POOL: {} as Record<string, THREE.Material[]>,
    PARTICLE_STATE_POOL: [] as ParticleState[],
    FREE_STATE_INDICES: [] as number[],

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
        let finalMat = mat;

        if (!isInstanced && UNIQUE_MATERIAL_TYPES.includes(type)) {
            finalMat = FXSystem._getUniqueMaterial(mat, type);
        }

        if (FXSystem.FREE_MESH_INDICES.length > 0) {
            const idx = FXSystem.FREE_MESH_INDICES.pop()!;
            m = FXSystem.MESH_POOL[idx];
            m.geometry = geo;
            m.material = finalMat;
            m.visible = true;
            m.scale.set(1, 1, 1);
            m.rotation.set(0, 0, 0);
        } else {
            m = new THREE.Mesh(geo, finalMat);
            m.userData.poolIdx = FXSystem.MESH_POOL.length;
            FXSystem.MESH_POOL.push(m);
        }

        if (!isInstanced && m.parent !== scene) scene.add(m);
        return m;
    },

    _getUniqueMaterial: (baseMat: THREE.Material, type: string): THREE.Material => {
        const poolKey = type + '_' + baseMat.uuid;
        if (!FXSystem.MATERIAL_POOL[poolKey]) FXSystem.MATERIAL_POOL[poolKey] = [];
        if (FXSystem.MATERIAL_POOL[poolKey].length > 0) {
            const mat = FXSystem.MATERIAL_POOL[poolKey].pop()! as FXMaterial;
            if (mat.transparent) mat.opacity = 1.0;
            return mat;
        }
        const clone = baseMat.clone();
        clone.transparent = true;
        (clone as any)._baseType = poolKey;
        return clone;
    },

    recycleMesh: (m: THREE.Mesh<THREE.BufferGeometry, THREE.Material>, type: string) => {
        m.visible = false;
        m.position.set(0, -1000, 0);
        if (UNIQUE_MATERIAL_TYPES.includes(type)) {
            const poolKey = (m.material as any)._baseType || type;
            if (!FXSystem.MATERIAL_POOL[poolKey]) FXSystem.MATERIAL_POOL[poolKey] = [];
            FXSystem.MATERIAL_POOL[poolKey].push(m.material);
        }
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
            mesh: null as any, vel: new THREE.Vector3(), rotVel: new THREE.Vector3(),
            life: 0, maxLife: 0, type: '', isPooled: false, isInstanced: false,
            isPhysics: false, landed: false, inUse: true, _poolIdx: FXSystem.PARTICLE_STATE_POOL.length
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
        return {
            scene: null as any, particlesList: [],
            x: 0, y: 0, z: 0, type: '', customVel: new THREE.Vector3(),
            hasCustomVel: false, color: undefined, scale: undefined, life: undefined, material: undefined
        };
    },

    // --- SPAWNING ---

    _spawnDecalImmediate: (req: SpawnRequest) => {
        const geo = req.type === 'splatter' ? GEOMETRY.splatterDecal : GEOMETRY.decal;
        const d = FXSystem.getPooledMesh(req.scene, geo, req.material || MATERIALS.bloodDecal, 'decal');
        d.position.set(req.x, 0.2 + Math.random() * 0.05, req.z);
        d.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);

        d.userData.targetScale = req.scale || 1.0;

        if (req.type === 'splatter') {
            d.scale.set(d.userData.targetScale, d.userData.targetScale, d.userData.targetScale);
        } else {
            d.scale.set(0.01, 0.01, 0.01);
        }

        if (req.material === MATERIALS.scorchDecal) {
            d.renderOrder = -1;
        } else {
            d.renderOrder = 50;
        }

        (req.particlesList as unknown as THREE.Mesh[]).push(d);
    },

    _spawnPartImmediate: (req: SpawnRequest) => {
        if (isNaN(req.x)) return;

        const t = req.type;
        const isInstanced = t === 'blood' || t === 'fire' || t === 'large_fire' || t === 'flash' ||
            t === 'flame' || t === 'spark' || t === 'smoke' || t === 'debris' || t === 'large_smoke' ||
            t === 'glass' || t === 'enemy_effect_stun' || t === 'electric_flash' ||
            t === 'enemy_effect_flame' || t === 'enemy_effect_spark' ||
            t === 'gore' || t === 'splash' ||
            t === 'campfire_flame' || t === 'campfire_spark' || t === 'campfire_smoke' || t === 'flamethrower_fire';

        const p = FXSystem.getPooledState();

        p.type = req.type;
        p.landed = false;
        p.isPooled = !req.customMesh;
        p.isInstanced = isInstanced;
        p.isPhysics = PHYSICS_TYPES.has(t);
        p.color = req.color;

        if (p.color === undefined && isInstanced) {
            const st = t as string;
            if (st === 'flame' || st === 'fire' || st === 'large_fire' || st === 'campfire_flame' || st === 'enemy_effect_flame' || st === 'flamethrower_fire') p.color = 0xff7700;
            else if (st === 'enemy_effect_stun' || st === 'campfire_spark' || st === 'enemy_effect_spark') p.color = 0x00ffff;
            else if (st === 'spark') p.color = 0xffcc00;
            else if (st === 'smoke' || st === 'large_smoke' || st === 'campfire_smoke') p.color = 0x555555;
            else if (st === 'blood' || st === 'gore') p.color = 0x880000;
            else if (st === 'glass' || st === 'flash' || st === 'electric_flash') p.color = 0xffffff;
            else if (st === 'splash') p.color = 0x77bbcc;
            else p.color = 0x888888;
        }

        if (req.customMesh) {
            p.mesh = req.customMesh;
            if (p.mesh.parent !== req.scene) req.scene.add(p.mesh);
        } else {
            let geo: THREE.BufferGeometry = GEOMETRY.particle;
            let mat: THREE.Material = MATERIALS.blood;

            if (t === 'gore') geo = GEOMETRY.gore;
            else if (t === 'black_smoke') mat = MATERIALS['_blackSmoke'];
            else if (t === 'fire' || t === 'flame' || t === 'large_fire' || t === 'campfire_flame' || t === 'enemy_effect_flame' || t === 'flamethrower_fire') {
                geo = GEOMETRY.flame;
                mat = (t === 'enemy_effect_flame') ? MATERIALS.enemy_effect_flame : MATERIALS.fire;
            }
            else if (t === 'spark' || t === 'smoke' || t === 'campfire_spark' || t === 'campfire_smoke' || t === 'enemy_effect_spark') {
                mat = (t === 'enemy_effect_spark') ? MATERIALS.enemy_effect_spark : MATERIALS.bullet;
            }
            else if (t === 'debris') mat = MATERIALS.stone;
            else if (t === 'glass') { geo = GEOMETRY.shard; mat = MATERIALS.glassShard; }
            else if (t === 'shockwave') { geo = GEOMETRY.shockwave; mat = MATERIALS.shockwave; }
            else if (t === 'flash' || t === 'electric_flash') {
                geo = (t === 'flash') ? GEOMETRY.sphere : GEOMETRY.shard;
                mat = MATERIALS.flashWhite;
            }
            else if (t === 'enemy_effect_stun') { geo = GEOMETRY.shard; mat = MATERIALS.enemy_effect_stun; }
            else if (t === 'large_smoke') { geo = GEOMETRY.flame; mat = MATERIALS.smoke; }
            else if (t === 'splash') { geo = GEOMETRY.splash; mat = MATERIALS.splash; }
            else if (t === 'electric_beam') { geo = GEOMETRY.shard; mat = MATERIALS.flashWhite; }
            else if (t === 'ground_impact') { geo = GEOMETRY.stone; mat = MATERIALS.stone; }
            else if (t === 'screech_wave') { geo = GEOMETRY.shockwave; mat = MATERIALS.shockwave; }

            p.mesh = FXSystem.getPooledMesh(req.scene, geo, mat, t, isInstanced);
        }

        p.mesh.position.set(req.x, req.y, req.z);
        p.mesh.renderOrder = 60;

        // --- ROTATION & ORIENTATION ---
        if (t === 'electric_flash' && req.hasCustomVel) {
            _v1.set(req.x + req.customVel.x, req.y + req.customVel.y, req.z + req.customVel.z);
            p.mesh.lookAt(_v1);
        } else if (t === 'shockwave') {
            p.mesh.rotation.set(-Math.PI / 2, 0, 0);
        } else {
            p.mesh.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
        }

        // --- SCALING ---
        const s = req.scale || 1.0;
        if (t === 'flash') {
            const fs = (1.5 + Math.random() * 1.0) * s;
            p.mesh.scale.set(fs, fs, fs);
        }
        else if (t === 'electric_flash' && req.hasCustomVel) {
            const dist = req.customVel.length();
            const thickness = (0.15 + Math.random() * 0.1) * s;
            p.mesh.scale.set(thickness, thickness, dist);
        }
        else if (t === 'large_fire') {
            const fs = 3.0 * Math.random() * s;
            p.mesh.scale.set(fs, fs, fs);
        }
        else if (t === 'large_smoke') {
            const fs = 4.0 * Math.random() * s;
            p.mesh.scale.set(fs, fs, fs);
        }
        else if (t === 'flame' || t === 'fire' || t === 'smoke' || t === 'enemy_effect_flame' || t === 'enemy_effect_spark' || t === 'flamethrower_fire') {
            const fs = (1.0 + Math.random() * 0.8) * s;
            p.mesh.scale.set(fs, fs, fs);
        }
        else if (t === 'spark') {
            const fs = (0.5 + Math.random() * 0.5) * s;
            p.mesh.scale.set(fs, fs, fs);
        }
        else if (t === 'splash') {
            const fs = (0.5 + Math.random() * 0.7) * s;
            p.mesh.scale.set(fs, fs, fs);
        }
        else if (t === 'electric_beam') {
            p.mesh.scale.set(0.2, 0.2, 5.0); // Procedural laser-like shard
        }
        else if (t === 'screech_wave') {
            p.mesh.scale.set(1, 1, 1); // Shockwave starts small and grows
        }
        else {
            const fs = (0.3 + Math.random() * 0.3) * s;
            p.mesh.scale.set(fs, fs, fs);
        }

        // --- VELOCITY ---
        if (t === 'electric_flash') {
            p.vel.set(0, 0, 0);
        } else if (req.hasCustomVel) {
            p.vel.copy(req.customVel);
        } else {
            const speedScale = (t === 'gore') ? 8.0 : (t === 'splash' || t === 'blood_splat' ? 12.0 : 1.0);
            const isFireFX = (t === 'flame' || t === 'fire' || t === 'spark' || t === 'smoke' || t === 'enemy_effect_flame' || t === 'enemy_effect_spark');
            const isLargeFX = (t === 'large_fire' || t === 'large_smoke');
            const vyScale = isLargeFX ? 3.0 : (isFireFX ? 1.8 : 0.8);
            const hzScale = isLargeFX ? 2.0 : (isFireFX ? 1.2 : 1.0);

            p.vel.set(
                (Math.random() - 0.5) * speedScale * hzScale,
                Math.random() * speedScale * (t === 'splash' || t === 'blood_splat' ? 1.5 : vyScale),
                (Math.random() - 0.5) * speedScale * hzScale
            );
        }

        // --- LIFETIME ---
        if (t === 'electric_flash') {
            p.life = req.life !== undefined ? req.life : (2 + Math.random() * 2);
        } else {
            const baseLife = PARTICLE_TTL[t] || PARTICLE_TTL.default;
            p.life = req.life !== undefined ? req.life : (baseLife + Math.random() * 20);
        }
        p.maxLife = p.life;
        p.rotVel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);

        req.particlesList.push(p);
    },

    // --- INTERFACE ---

    preload: (scene: THREE.Scene) => {
        if (!MATERIALS['_blackSmoke']) {
            MATERIALS['_blackSmoke'] = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false });
        }
        if (!MATERIALS['flame']) {
            MATERIALS['flame'] = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.9, depthWrite: false });
        }
        if (!MATERIALS['large_fire']) {
            MATERIALS['large_fire'] = new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.9, depthWrite: false });
        }

        const types = ['blood', 'fire', 'large_fire', 'flash', 'electric_flash', 'flame', 'spark', 'smoke', 'debris', 'glass', 'enemy_effect_stun', 'enemy_effect_flame', 'enemy_effect_spark', 'gore', 'splash', 'campfire_flame', 'campfire_spark', 'campfire_smoke', 'flamethrower_fire'];
        for (let i = 0; i < types.length; i++) {
            const imesh = FXSystem._getInstancedMesh(scene, types[i]);
            if (imesh.parent !== scene) scene.add(imesh);
        }
    },

    spawnDecal: (scene: THREE.Scene, decalList: any[], x: number, z: number, scale: number, material?: THREE.Material, type: string = 'decal') => {
        let req = DECAL_REQUEST_POOL.pop();
        if (!req) req = { scene, particlesList: decalList, x, y: 0, z, type, customVel: new THREE.Vector3(), hasCustomVel: false };
        else { req.scene = scene; req.particlesList = decalList as any; req.x = x; req.z = z; req.type = type; }

        req.scale = scale;
        req.material = material;
        FXSystem.decalQueue.push(req);
    },

    spawnPart: (scene: THREE.Scene, particlesList: ParticleState[], x: number, y: number, z: number, type: string, count: number, customMesh?: any, customVel?: THREE.Vector3, color?: number, scale?: number, life?: number) => {
        const isEssential = type === 'flash' || type === 'electric_flash' || type === 'spark' || type === 'splash' ||
            type === 'impact' || type === 'enemy_effect_stun' || type.includes('muzzle');

        for (let i = 0; i < count; i++) {
            let req = FXSystem._getSpawnRequest();
            req.scene = scene; req.particlesList = particlesList; req.x = x; req.y = y; req.z = z;
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
                if (FXSystem.ambientQueue.length === 1000) {
                    console.warn(`[FXSystem] Ambient queue is heavily backlogged. Performance may degrade.`);
                }
                FXSystem.ambientQueue.push(req);
            }
        }
    },

    // --- ZERO-GC TEXT POOL ---
    _textPool: [] as { mesh: THREE.Sprite, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, texture: THREE.CanvasTexture, active: boolean, life: number }[],
    spawnFloatingText: (scene: THREE.Scene, x: number, y: number, z: number, text: string, color: string = '#ffffff') => {
        let pooled = FXSystem._textPool.find(t => !t.active);

        if (!pooled) {
            const canvas = document.createElement('canvas');
            canvas.width = 256; canvas.height = 64;
            const ctx = canvas.getContext('2d')!;
            const texture = new THREE.CanvasTexture(canvas);
            const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: true });
            const mesh = new THREE.Sprite(mat);

            mesh.scale.set(3.0, 0.75, 2.0);
            scene.add(mesh);

            pooled = { mesh, canvas, ctx, texture, active: true, life: 0 };
            FXSystem._textPool.push(pooled);
        }

        pooled.ctx.clearRect(0, 0, 256, 64);
        pooled.ctx.font = 'bold 64px Arial';
        pooled.ctx.fillStyle = 'white';
        pooled.ctx.textAlign = 'center';
        pooled.ctx.textBaseline = 'middle';

        pooled.ctx.strokeStyle = 'black';
        pooled.ctx.lineWidth = 5;
        pooled.ctx.strokeText(text, 128, 32);
        pooled.ctx.fillText(text, 128, 32);

        pooled.texture.needsUpdate = true;

        pooled.mesh.position.set(x, y + 1.5, z);
        pooled.mesh.material.color.set(color);
        pooled.mesh.material.opacity = 1.0;
        pooled.mesh.visible = true;
        pooled.life = 1.5;
        pooled.active = true;
    },

    // --- MAIN UPDATE LOOP ---

    update: (scene: THREE.Scene, particlesList: ParticleState[], decalList: THREE.Mesh[], delta: number, frame: number, now: number, playerPos: THREE.Vector3, callbacks: any) => {
        const safeDelta = Math.min(delta, 0.1);

        // 1. Process Queues (Budgeted)
        for (let i = FXSystem._essentialQueueHead; i < FXSystem.essentialQueue.length; i++) {
            const req = FXSystem.essentialQueue[i];
            if (!req.scene) req.scene = scene;
            if (!req.particlesList) req.particlesList = particlesList;
            FXSystem._spawnPartImmediate(req);
            REQUEST_POOL.push(req);
        }
        FXSystem.essentialQueue.length = 0;
        FXSystem._essentialQueueHead = 0;

        const pEnd = Math.min(FXSystem._ambientQueueHead + MAX_AMBIENT_SPAWNS_PER_FRAME, FXSystem.ambientQueue.length);
        for (let i = FXSystem._ambientQueueHead; i < pEnd; i++) {
            const req = FXSystem.ambientQueue[i];
            if (!req.scene) req.scene = scene;
            if (!req.particlesList) req.particlesList = particlesList;
            FXSystem._spawnPartImmediate(req);
            REQUEST_POOL.push(req);
        }
        FXSystem._ambientQueueHead = pEnd;
        if (FXSystem._ambientQueueHead >= FXSystem.ambientQueue.length) {
            FXSystem.ambientQueue.length = 0;
            FXSystem._ambientQueueHead = 0;
        }

        const dEnd = Math.min(FXSystem._decalQueueHead + 10, FXSystem.decalQueue.length);
        for (let i = FXSystem._decalQueueHead; i < dEnd; i++) {
            const req = FXSystem.decalQueue[i];
            FXSystem._spawnDecalImmediate(req);
            DECAL_REQUEST_POOL.push(req);
        }
        FXSystem._decalQueueHead = dEnd;
        if (FXSystem._decalQueueHead >= FXSystem.decalQueue.length) {
            FXSystem.decalQueue.length = 0;
            FXSystem._decalQueueHead = 0;
        }

        for (let i = 0; i < decalList.length; i++) {
            const m = decalList[i];
            if (m.userData.targetScale && m.scale.x < m.userData.targetScale) {
                const growthStep = m.userData.targetScale * 3.0 * safeDelta;
                const newScale = Math.min(m.userData.targetScale, m.scale.x + growthStep);
                m.scale.set(newScale, newScale, newScale);
            }
        }

        // 2. Update Particles
        const decay = safeDelta * 44;

        const airFriction = Math.max(0.0, 1.0 - (5.0 * safeDelta));
        const shrinkRate = Math.max(0.0, 1.0 - (10.0 * safeDelta));

        for (let i = particlesList.length - 1; i >= 0; i--) {
            const p = particlesList[i];
            p.life -= decay;

            if (p.life <= 0) {
                FXSystem._killParticle(i, particlesList);
                continue;
            }

            if (!p.landed) {
                p.mesh.position.addScaledVector(p.vel, safeDelta);
                if (p.isPhysics) {
                    p.vel.y -= 25 * safeDelta;
                    if (p.type !== 'blood' && p.type !== 'splash') {
                        p.mesh.rotation.x += p.rotVel.x * 10 * safeDelta;
                        p.mesh.rotation.z += p.rotVel.z * 10 * safeDelta;
                    }
                    if (p.mesh.position.y <= (p.type === 'splash' ? -5.0 : 0.05)) {
                        FXSystem._handleLanding(p, i, particlesList, callbacks);
                        if (!p.inUse) continue;
                    }
                } else {
                    p.vel.multiplyScalar(airFriction);

                    if (p.type === 'shockwave') {
                        const grow = 30 * safeDelta;
                        p.mesh.scale.addScalar(grow);
                    } else if (p.type === 'flash') {
                        const grow = 15 * safeDelta;
                        p.mesh.scale.addScalar(grow);
                    } else if (p.type === 'electric_flash') {
                        p.mesh.scale.x *= 0.6;
                        p.mesh.scale.y *= 0.6;
                    } else if (p.type === 'flamethrower_fire') {
                        p.mesh.scale.addScalar(5.0 * safeDelta);
                        p.vel.multiplyScalar(Math.max(0.0, 1.0 - (5.0 * safeDelta)));
                    } else if (p.type === 'fire' || p.type === 'enemy_effect_flame' || p.type === 'large_fire') {
                        p.mesh.scale.multiplyScalar(Math.max(0.0, 1.0 - (1.5 * safeDelta)));
                    } else if (p.type === 'screech_wave') {
                        const grow = 60 * safeDelta;
                        p.mesh.scale.addScalar(grow);
                    } else if (p.type === 'electric_beam') {
                        p.mesh.scale.z += 20 * safeDelta; // Stretch out
                        p.mesh.scale.x *= 0.9;
                        p.mesh.scale.y *= 0.9;
                    } else {
                        p.mesh.scale.multiplyScalar(shrinkRate);
                    }
                }
            }

            if (!p.isInstanced) {
                const mat = p.mesh.material as FXMaterial;
                if (mat.transparent) mat.opacity = Math.max(0, p.life / p.maxLife);
            } else {
                const imesh = FXSystem._getInstancedMesh(scene, p.type);
                const idx = FXSystem._instancedCounts[p.type];
                if (imesh && idx < MAX_INSTANCES_PER_MESH) {
                    p.mesh.updateMatrix();
                    imesh.setMatrixAt(idx, p.mesh.matrix);
                    if (p.color !== undefined) {
                        imesh.setColorAt(idx, _tempColor.setHex(p.color));
                    }
                    FXSystem._instancedCounts[p.type]++;
                } else if (imesh && idx === MAX_INSTANCES_PER_MESH) {
                    FXSystem._instancedCounts[p.type]++;
                } else if (imesh) {
                    FXSystem._instancedCounts[p.type]++;
                }
            }
        }

        // 3. Update Text Floaters
        for (let i = 0; i < FXSystem._textPool.length; i++) {
            const t = FXSystem._textPool[i];
            if (!t.active) continue;

            t.life -= safeDelta;
            if (t.life <= 0) {
                t.active = false;
                t.mesh.visible = false;
                continue;
            }

            t.mesh.position.y += 1.2 * safeDelta;
            t.mesh.material.opacity = Math.min(1.0, t.life * 2.0);
        }

        // 4. Finalize Instanced Batches
        for (let k = 0; k < FXSystem._instancedMeshKeys.length; k++) {
            const type = FXSystem._instancedMeshKeys[k];
            const imesh = FXSystem._instancedMeshes[type];
            imesh.count = FXSystem._instancedCounts[type];
            imesh.instanceMatrix.needsUpdate = true;
            if (imesh.instanceColor) imesh.instanceColor.needsUpdate = true;
            if (imesh.count > 0) imesh.computeBoundingSphere();
            FXSystem._instancedCounts[type] = 0;
        }

        if (decalList.length > MAX_DECALS) {
            console.warn(`[FXSystem] MAX_DECALS (${MAX_DECALS}) exceeded. Earliest decals will be force-recycled.`);
        }
        while (decalList.length > MAX_DECALS) {
            const oldDecal = decalList[0];
            if (oldDecal) FXSystem.recycleMesh(oldDecal as any, 'decal');

            decalList[0] = decalList[decalList.length - 1];
            decalList.pop();
        }
    },

    _killParticle: (index: number, list: ParticleState[]) => {
        const p = list[index];
        if (p.isPooled) FXSystem.recycleMesh(p.mesh, p.type);
        else if (p.mesh.parent) p.mesh.parent.remove(p.mesh);

        p.inUse = false;
        FXSystem.FREE_STATE_INDICES.push(p._poolIdx);

        list[index] = list[list.length - 1];
        list.pop();
    },

    _handleLanding: (p: ParticleState, index: number, list: ParticleState[], callbacks: any) => {
        p.mesh.position.y = 0.05;

        if (p.type === 'blood') {
            p.landed = true;
            if (Math.random() < 0.20) callbacks.spawnDecal(p.mesh.position.x, p.mesh.position.z, 0.5 + Math.random() * 0.3, MATERIALS.bloodDecal);
            FXSystem._killParticle(index, list);
        } else if (p.type === 'gore') {
            p.landed = true;
            if (Math.random() < 0.40) callbacks.spawnDecal(p.mesh.position.x, p.mesh.position.z, 0.8 + Math.random() * 0.5, MATERIALS.bloodDecal);
            soundManager.playImpact('flesh');
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
            let mat: THREE.Material = MATERIALS.blood;

            if (type === 'fire' || type === 'flame' || type === 'large_fire' || type === 'campfire_flame' || type === 'enemy_effect_flame' || type === 'flamethrower_fire') {
                geo = GEOMETRY.flame;
                mat = (type === 'enemy_effect_flame') ? MATERIALS.enemy_effect_flame : MATERIALS.fire;
            }
            else if (type === 'spark' || type === 'smoke' || type === 'campfire_spark' || type === 'campfire_smoke' || type === 'enemy_effect_spark') {
                mat = (type === 'enemy_effect_spark') ? MATERIALS.enemy_effect_spark : MATERIALS.bullet;
            }
            else if (type === 'debris') mat = MATERIALS.stone;
            else if (type === 'glass') { geo = GEOMETRY.shard; mat = MATERIALS.glassShard; }
            else if (type === 'flash' || type === 'electric_flash') {
                geo = (type === 'flash') ? GEOMETRY.sphere : GEOMETRY.shard;
                mat = MATERIALS.flashWhite;
            }
            else if (type === 'enemy_effect_stun') { geo = GEOMETRY.shard; mat = MATERIALS.enemy_effect_stun; }
            else if (type === 'large_smoke') { geo = GEOMETRY.flame; mat = MATERIALS.smoke; }
            else if (type === 'splash') { geo = GEOMETRY.splash; mat = MATERIALS.splash; }
            else if (type === 'blood_splat') { geo = GEOMETRY.bloodSplat; mat = MATERIALS.bloodSplat; }
            else if (type === 'gore') {
                geo = GEOMETRY.gore;
                mat = MATERIALS.gore.clone();
                (mat as any).color.setHex(0xffffff);
            }

            const imesh = new THREE.InstancedMesh(geo, mat, MAX_INSTANCES_PER_MESH);
            imesh.frustumCulled = false;

            if (type === 'debris' || type === 'scrap' || type === 'glass' || type === 'gore') {
                imesh.castShadow = true;
                // [VINTERDÖD FIX] Only allow receiveShadow if the material is not MeshBasicMaterial 
                // to prevent "Mismatch between texture format and sampler type" errors with shadow samplers.
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