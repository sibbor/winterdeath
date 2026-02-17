import * as THREE from 'three';
import { GEOMETRY, MATERIALS, createTextSprite } from '../../utils/assets';

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
    color?: number;
    scale?: number;
    material?: THREE.Material;
}

// --- PERFORMANCE SCRATCHPADS ---
const _tempColor = new THREE.Color();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const REQUEST_POOL: SpawnRequest[] = [];
const DECAL_REQUEST_POOL: SpawnRequest[] = [];

const UNIQUE_MATERIAL_TYPES = [
    'fire', 'flame', 'large_fire', 'large_smoke',
    'black_smoke', 'debris_trail', 'stun_star', 'shockwave', 'flash'
];

export const FXSystem = {
    particleQueue: [] as SpawnRequest[],
    decalQueue: [] as SpawnRequest[],

    // Pools
    MESH_POOL: [] as THREE.Mesh<THREE.BufferGeometry, THREE.Material>[],
    FREE_MESH_INDICES: [] as number[],
    MATERIAL_POOL: {} as Record<string, THREE.Material[]>,
    PARTICLE_STATE_POOL: [] as ParticleState[],
    FREE_STATE_INDICES: [] as number[],

    _instancedMeshes: {} as Record<string, THREE.InstancedMesh>,
    _instancedCounts: {} as Record<string, number>,
    _MAX_INSTANCES: 2000,

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
            m.scale.setScalar(1);
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
        if (!FXSystem.MATERIAL_POOL[type]) FXSystem.MATERIAL_POOL[type] = [];
        if (FXSystem.MATERIAL_POOL[type].length > 0) {
            const mat = FXSystem.MATERIAL_POOL[type].pop()! as FXMaterial;
            if (mat.transparent) mat.opacity = 1.0;
            return mat;
        }
        const clone = baseMat.clone();
        clone.transparent = true;
        return clone;
    },

    recycleMesh: (m: THREE.Mesh<THREE.BufferGeometry, THREE.Material>, type: string) => {
        m.visible = false;
        m.position.set(0, -1000, 0);
        if (UNIQUE_MATERIAL_TYPES.includes(type)) {
            if (!FXSystem.MATERIAL_POOL[type]) FXSystem.MATERIAL_POOL[type] = [];
            FXSystem.MATERIAL_POOL[type].push(m.material);
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
            landed: false, inUse: true, _poolIdx: FXSystem.PARTICLE_STATE_POOL.length
        };
        FXSystem.PARTICLE_STATE_POOL.push(p);
        return p;
    },

    _getSpawnRequest: (): SpawnRequest => {
        const req = REQUEST_POOL.pop();
        if (req) return req;
        return {
            scene: null as any, particlesList: [],
            x: 0, y: 0, z: 0, type: '', customVel: new THREE.Vector3()
        };
    },

    // --- SPAWNING ---

    _spawnDecalImmediate: (req: SpawnRequest) => {
        const d = FXSystem.getPooledMesh(req.scene, GEOMETRY.decal, req.material || MATERIALS.bloodDecal, 'decal');
        d.position.set(req.x, 0.2 + Math.random() * 0.05, req.z);
        d.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);

        // [VINTERDÖD] Sätt upp animationen!
        // Lagra det tänkta målet, men börja på skala noll.
        d.userData.targetScale = req.scale || 1.0;
        d.scale.setScalar(0.01);

        d.renderOrder = 50;

        (req.particlesList as unknown as THREE.Mesh[]).push(d);
    },

    _spawnPartImmediate: (req: SpawnRequest) => {
        if (isNaN(req.x)) return;

        const t = req.type;
        const isInstanced = t === 'blood' || t === 'fire' || t === 'large_fire' || t === 'flash' ||
            t === 'flame' || t === 'spark' || t === 'smoke' || t === 'debris' ||
            t === 'debris_trail' || t === 'glass' || t === 'stun_star' ||
            t === 'chunk' || t === 'gore' || t === 'limb';

        const p = FXSystem.getPooledState();

        p.type = req.type;
        p.landed = false;
        p.isPooled = !req.customMesh;
        p.isInstanced = isInstanced;
        p.color = req.color;

        if (req.customMesh) {
            p.mesh = req.customMesh;
            if (p.mesh.parent !== req.scene) req.scene.add(p.mesh);
        } else {
            let geo: THREE.BufferGeometry = GEOMETRY.particle;
            let mat: THREE.Material = MATERIALS.blood;

            if (t === 'gore' || t === 'limb' || t === 'chunk') geo = GEOMETRY.gore;
            else if (t === 'black_smoke') mat = MATERIALS['_blackSmoke'] || (MATERIALS['_blackSmoke'] = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false }));
            else if (t === 'fire' || t === 'flame' || t === 'large_fire') { geo = GEOMETRY.flame; mat = MATERIALS.fire; }
            else if (t === 'spark' || t === 'smoke') mat = MATERIALS.bullet;
            else if (t === 'debris' || t === 'debris_trail') mat = MATERIALS.stone;
            else if (t === 'glass') { geo = GEOMETRY.shard; mat = MATERIALS.glassShard; }
            else if (t === 'shockwave') { geo = GEOMETRY.shockwave; mat = MATERIALS.shockwave; }
            else if (t === 'flash') { geo = GEOMETRY.sphere; mat = MATERIALS.flashWhite; }
            else if (t === 'stun_star') { geo = GEOMETRY.shard; mat = MATERIALS.bullet; }
            else if (t === 'large_smoke') { geo = GEOMETRY.flame; mat = MATERIALS.smoke; }

            p.mesh = FXSystem.getPooledMesh(req.scene, geo, mat, t, isInstanced);
        }

        p.mesh.position.set(req.x, req.y, req.z);
        p.mesh.renderOrder = 11;

        if (t === 'shockwave') p.mesh.rotation.x = -Math.PI / 2;
        else if (UNIQUE_MATERIAL_TYPES.includes(t)) p.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);

        const s = req.scale || 1.0;
        if (t === 'large_fire') p.mesh.scale.setScalar(1.6 * Math.random() * s);
        else if (t === 'large_smoke') p.mesh.scale.setScalar(2.4 * Math.random() * s);

        // [VINTERDÖD] Mycket större bloddroppar (från ~1.2 till ~2.0 bas)
        else if (t === 'blood') p.mesh.scale.setScalar((2.0 + Math.random() * 1.5) * s);

        else p.mesh.scale.setScalar((0.3 + Math.random() * 0.3) * s);

        if (req.customVel.lengthSq() > 0) p.vel.copy(req.customVel);
        else {
            const speedScale = (t === 'chunk' || t === 'gore' || t === 'limb') ? 8.0 : 1.0;
            p.vel.set(
                (Math.random() - 0.5) * speedScale,
                Math.random() * speedScale * 0.8,
                (Math.random() - 0.5) * speedScale
            );
        }

        p.life = (t === 'blood' ? 120 : (t === 'debris' ? 200 : 30)) + Math.random() * 20;
        p.maxLife = p.life;
        p.rotVel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);

        req.particlesList.push(p);
    },

    // --- INTERFACE ---

    spawnDecal: (scene: THREE.Scene, decalList: any[], x: number, z: number, scale: number, material?: THREE.Material) => {
        let req = DECAL_REQUEST_POOL.pop();
        if (!req) req = { scene, particlesList: decalList, x, y: 0, z, type: 'decal', customVel: new THREE.Vector3() };
        else { req.scene = scene; req.particlesList = decalList as any; req.x = x; req.z = z; }

        req.scale = scale;
        req.material = material;
        FXSystem.decalQueue.push(req);
    },

    spawnPart: (scene: THREE.Scene, particlesList: ParticleState[], x: number, y: number, z: number, type: string, count: number, customMesh?: any, customVel?: THREE.Vector3, color?: number, scale?: number) => {
        for (let i = 0; i < count; i++) {
            let req = FXSystem._getSpawnRequest();
            req.scene = scene; req.particlesList = particlesList; req.x = x; req.y = y; req.z = z;
            req.type = type; req.customMesh = customMesh; req.color = color; req.scale = scale;

            if (customVel) req.customVel.copy(customVel);
            else req.customVel.set(0, 0, 0);

            FXSystem.particleQueue.push(req);
        }
    },

    textQueue: [] as { mesh: THREE.Sprite, life: number }[],
    spawnFloatingText: (scene: THREE.Scene, x: number, y: number, z: number, text: string, color: string = '#ffffff') => {
        const sprite = createTextSprite(text);
        sprite.position.set(x, y + 1.5, z);
        sprite.scale.set(1.5, 1.5, 1.5);
        sprite.material.color.set(color);
        sprite.renderOrder = 100;

        scene.add(sprite);
        FXSystem.textQueue.push({ mesh: sprite, life: 1.5 });
    },

    // --- MAIN UPDATE LOOP ---

    update: (scene: THREE.Scene, particlesList: ParticleState[], decalList: THREE.Mesh[], delta: number, frame: number, now: number, playerPos: THREE.Vector3, callbacks: any) => {
        const safeDelta = Math.min(delta, 0.1);

        // 1. Process Queues (Budgeted)
        const pLimit = Math.min(FXSystem.particleQueue.length, 30);
        for (let i = 0; i < pLimit; i++) {
            const req = FXSystem.particleQueue.shift()!;
            if (!req.scene) req.scene = scene;
            if (!req.particlesList) req.particlesList = particlesList;
            FXSystem._spawnPartImmediate(req);
            REQUEST_POOL.push(req);
        }

        const dLimit = Math.min(FXSystem.decalQueue.length, 10);
        for (let i = 0; i < dLimit; i++) {
            const req = FXSystem.decalQueue.shift()!;
            FXSystem._spawnDecalImmediate(req);
            DECAL_REQUEST_POOL.push(req);
        }

        // --- [VINTERDÖD] Animerade dekaler ---
        // Får blodet att "hälla ut" över marken istället för att poppa in direkt.
        for (let i = 0; i < decalList.length; i++) {
            const d = decalList[i] as any;
            if (d.userData.targetScale && d.scale.x < d.userData.targetScale) {
                // Skalan växer fram över ca en tredjedels sekund
                const growthStep = d.userData.targetScale * 3.0 * safeDelta;
                const newScale = Math.min(d.userData.targetScale, d.scale.x + growthStep);
                d.scale.setScalar(newScale);
            }
        }

        // 2. Update Particles
        const decay = safeDelta * 44;
        for (let i = particlesList.length - 1; i >= 0; i--) {
            const p = particlesList[i];
            p.life -= decay;

            if (p.life <= 0) {
                FXSystem._killParticle(i, particlesList);
                continue;
            }

            if (!p.landed) {
                p.mesh.position.addScaledVector(p.vel, safeDelta);
                if (['chunk', 'debris', 'glass', 'limb', 'blood', 'gore'].includes(p.type)) {
                    p.vel.y -= 25 * safeDelta;
                    if (p.type !== 'blood') {
                        p.mesh.rotation.x += p.rotVel.x * 10 * safeDelta;
                        p.mesh.rotation.z += p.rotVel.z * 10 * safeDelta;
                    }
                    if (p.mesh.position.y <= 0.05) {
                        FXSystem._handleLanding(p, i, particlesList, callbacks);
                        if (!p.inUse) continue;
                    }
                } else {
                    if (!p.isInstanced) p.mesh.scale.multiplyScalar(0.95);
                }
            }

            // Sync Visuals
            if (!p.isInstanced) {
                const mat = p.mesh.material as FXMaterial;
                if (mat.transparent) mat.opacity = Math.max(0, p.life / p.maxLife);
            } else {
                const imesh = FXSystem._getInstancedMesh(scene, p.type);
                const idx = FXSystem._instancedCounts[p.type];
                if (imesh && idx < FXSystem._MAX_INSTANCES) {
                    p.mesh.updateMatrix();
                    imesh.setMatrixAt(idx, p.mesh.matrix);
                    if (p.color !== undefined) {
                        imesh.setColorAt(idx, _tempColor.setHex(p.color));
                    }
                    FXSystem._instancedCounts[p.type]++;
                }
            }
        }

        // 3. Update Text Floaters
        for (let i = FXSystem.textQueue.length - 1; i >= 0; i--) {
            const t = FXSystem.textQueue[i];
            t.life -= safeDelta;
            if (t.life <= 0) {
                t.mesh.parent?.remove(t.mesh);
                FXSystem.textQueue.splice(i, 1);
                continue;
            }
            t.mesh.position.y += 0.5 * safeDelta;
            t.mesh.material.opacity = Math.min(1.0, t.life * 2.0);
        }

        // 4. Finalize Instanced Batches
        for (const type in FXSystem._instancedMeshes) {
            const imesh = FXSystem._instancedMeshes[type];
            imesh.count = FXSystem._instancedCounts[type];
            imesh.instanceMatrix.needsUpdate = true;
            if (imesh.instanceColor) imesh.instanceColor.needsUpdate = true;
            if (imesh.count > 0) imesh.computeBoundingSphere();
            FXSystem._instancedCounts[type] = 0;
        }

        const MAX_DECALS = 150;
        if (decalList.length > MAX_DECALS) {
            const toRemove = decalList.length - MAX_DECALS;
            for (let i = 0; i < toRemove; i++) {
                const oldDecal = decalList.shift();
                if (oldDecal) {
                    FXSystem.recycleMesh(oldDecal as any, 'decal');
                }
            }
        }
    },

    _killParticle: (index: number, list: ParticleState[]) => {
        const p = list[index];
        if (p.isPooled) FXSystem.recycleMesh(p.mesh, p.type);
        else if (p.mesh.parent) p.mesh.parent.remove(p.mesh);

        p.inUse = false;
        FXSystem.FREE_STATE_INDICES.push(p._poolIdx);

        // SWAP AND POP
        list[index] = list[list.length - 1];
        list.pop();
    },

    _handleLanding: (p: ParticleState, index: number, list: ParticleState[], callbacks: any) => {
        p.mesh.position.y = 0.05;
        p.landed = true;

        if (p.type === 'blood') {
            // [VINTERDÖD] 20% chans för små bloddroppar
            if (Math.random() < 0.20) callbacks.spawnDecal(p.mesh.position.x, p.mesh.position.z, 0.5 + Math.random() * 0.3, MATERIALS.bloodDecal);
            FXSystem._killParticle(index, list);
        } else if (p.type === 'chunk' || p.type === 'limb' || p.type === 'gore') {
            // [VINTERDÖD] 40% chans för chunks
            if (Math.random() < 0.40) callbacks.spawnDecal(p.mesh.position.x, p.mesh.position.z, 0.8 + Math.random() * 0.5, MATERIALS.bloodDecal);
            p.vel.set(0, 0, 0);
        } else {
            FXSystem._killParticle(index, list);
        }
    },

    _getInstancedMesh: (scene: THREE.Scene, type: string): THREE.InstancedMesh => {
        if (!FXSystem._instancedMeshes[type]) {
            let geo: THREE.BufferGeometry = GEOMETRY.particle;
            let mat: THREE.Material = MATERIALS.blood;
            if (type === 'spark') mat = MATERIALS.bullet;
            if (type === 'debris') mat = MATERIALS.stone;
            if (type === 'gore' || type === 'limb' || type === 'chunk') {
                geo = GEOMETRY.gore;
                mat = MATERIALS.gore.clone();
                (mat as any).color.setHex(0xffffff);
            }
            if (type === 'glass') { geo = GEOMETRY.shard; mat = MATERIALS.glassShard; }

            const imesh = new THREE.InstancedMesh(geo, mat, FXSystem._MAX_INSTANCES);
            imesh.frustumCulled = true;
            scene.add(imesh);
            FXSystem._instancedMeshes[type] = imesh;
            FXSystem._instancedCounts[type] = 0;
        }
        return FXSystem._instancedMeshes[type];
    },

    // --- SPECIAL WEAPON EFFECTS ---

    spawnFlame: (start: THREE.Vector3, direction: THREE.Vector3) => {
        const spread = 0.15;
        _v1.copy(direction).add(_v2.set(
            (Math.random() - 0.5) * spread,
            (Math.random() - 0.5) * spread,
            (Math.random() - 0.5) * spread
        )).normalize();

        const speed = 10 + Math.random() * 5;
        const scale = 0.5 + Math.random() * 0.5;

        const req = FXSystem._getSpawnRequest();
        req.scene = null as any;
        req.particlesList = null as any;
        req.x = start.x; req.y = start.y; req.z = start.z;
        req.type = 'fire';

        req.customVel.copy(_v1).multiplyScalar(speed);
        req.scale = scale;
        req.color = 0xff5500;
        FXSystem.particleQueue.push(req);
    },

    spawnLightning: (start: THREE.Vector3, end: THREE.Vector3) => {
        const segments = 6;
        const lerpStep = 1 / segments;

        for (let i = 1; i <= segments; i++) {
            if (i === segments) {
                _v1.copy(end);
            } else {
                _v1.lerpVectors(start, end, i * lerpStep);
                _v1.x += (Math.random() - 0.5) * 1.5;
                _v1.y += (Math.random() - 0.5) * 1.5;
                _v1.z += (Math.random() - 0.5) * 1.5;
            }

            const req = FXSystem._getSpawnRequest();
            req.scene = null as any;
            req.particlesList = null as any;
            req.x = _v1.x; req.y = _v1.y; req.z = _v1.z;
            req.type = 'flash';

            req.customVel.set(0, 0, 0);
            req.scale = 0.3 + Math.random() * 0.2;
            req.color = 0x00ffff;
            FXSystem.particleQueue.push(req);
        }
    },

    spawnStunSparks: (pos: THREE.Vector3) => {
        for (let i = 0; i < 3; i++) {
            const req = FXSystem._getSpawnRequest();
            req.scene = null as any;
            req.particlesList = null as any;
            req.x = pos.x + (Math.random() - 0.5);
            req.y = pos.y + 1.5 + (Math.random() - 0.5);
            req.z = pos.z + (Math.random() - 0.5);
            req.type = 'stun_star';

            req.customVel.set(
                (Math.random() - 0.5) * 2,
                Math.random() * 2,
                (Math.random() - 0.5) * 2
            );

            req.scale = 0.2;
            req.color = 0xffff00;
            FXSystem.particleQueue.push(req);
        }
    }
};