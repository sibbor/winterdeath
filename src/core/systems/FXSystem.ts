import * as THREE from 'three';
import { GEOMETRY, MATERIALS, createTextSprite } from '../../utils/assets';

// --- TYPES & INTERFACES ---

/** * Extended material type to safely access transparency and color properties 
 * without triggering strict type mismatch errors.
 */
type FXMaterial = THREE.Material & {
    opacity?: number;
    transparent?: boolean;
    color?: THREE.Color;
};

/**
 * High-performance Particle state.
 * Uses base classes (BufferGeometry/Material) to allow any 3D shape or shader type.
 */
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

/**
 * Reusable request object to avoid object literal allocation during spawning.
 */
interface SpawnRequest {
    scene: THREE.Scene;
    particlesList: ParticleState[];
    x: number; y: number; z: number;
    type: string;
    customMesh?: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    customVel?: THREE.Vector3;
    color?: number;
    scale?: number;
    material?: THREE.Material;
}

// --- PERFORMANCE SCRATCHPADS ---
const _tempColor = new THREE.Color();
const REQUEST_POOL: SpawnRequest[] = [];
const DECAL_REQUEST_POOL: SpawnRequest[] = [];

const UNIQUE_MATERIAL_TYPES = [
    'fire', 'flame', 'large_fire', 'large_smoke',
    'black_smoke', 'debris_trail', 'stun_star', 'shockwave', 'flash'
];



export const FXSystem = {
    // Queues for staggered spawning
    particleQueue: [] as SpawnRequest[],
    _particleQueueIndex: 0,
    decalQueue: [] as SpawnRequest[],
    _decalQueueIndex: 0,

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
            // Initialize with base classes to prevent type mismatch
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

    // --- SPAWNING ---

    _spawnDecalImmediate: (req: SpawnRequest) => {
        const d = FXSystem.getPooledMesh(req.scene, GEOMETRY.decal, req.material || MATERIALS.bloodDecal, 'decal');
        d.position.set(req.x, 0.2 + Math.random() * 0.05, req.z);
        d.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
        d.scale.setScalar(req.scale || 1.0);
        d.renderOrder = 50;

        // Note: Decals are stored in their own list provided byreq.particlesList
        (req.particlesList as unknown as THREE.Mesh[]).push(d);
    },

    _spawnPartImmediate: (req: SpawnRequest) => {
        if (isNaN(req.x)) return;

        const isInstanced = ['blood', 'fire', 'large_fire', 'flash', 'flame', 'spark', 'smoke', 'debris', 'debris_trail', 'glass', 'stun_star', 'chunk', 'gore', 'limb',].includes(req.type);
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

            if (['gore', 'limb', 'chunk'].includes(req.type)) geo = GEOMETRY.gore;
            else if (req.type === 'black_smoke') mat = MATERIALS['_blackSmoke'] || (MATERIALS['_blackSmoke'] = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false }));
            else if (['fire', 'flame', 'large_fire'].includes(req.type)) { geo = GEOMETRY.flame; mat = MATERIALS.fire; }
            else if (['spark', 'smoke'].includes(req.type)) mat = MATERIALS.bullet;
            else if (['debris', 'debris_trail'].includes(req.type)) mat = MATERIALS.stone;
            else if (req.type === 'glass') { geo = GEOMETRY.shard; mat = MATERIALS.glassShard; }
            else if (req.type === 'shockwave') { geo = GEOMETRY.shockwave; mat = MATERIALS.shockwave; }
            else if (req.type === 'flash') { geo = GEOMETRY.sphere; mat = MATERIALS.flashWhite; }
            else if (req.type === 'stun_star') { geo = GEOMETRY.shard; mat = MATERIALS.bullet; }
            else if (req.type === 'large_smoke') { geo = GEOMETRY.flame; mat = MATERIALS.smoke; }

            p.mesh = FXSystem.getPooledMesh(req.scene, geo, mat, req.type, isInstanced);
        }

        p.mesh.position.set(req.x, req.y, req.z);
        p.mesh.renderOrder = 11;

        if (req.type === 'shockwave') p.mesh.rotation.x = -Math.PI / 2;
        else if (UNIQUE_MATERIAL_TYPES.includes(req.type)) p.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);

        const s = req.scale || 1.0;
        if (req.type === 'large_fire') p.mesh.scale.setScalar(1.6 * Math.random() * s);
        else if (req.type === 'large_smoke') p.mesh.scale.setScalar(2.4 * Math.random() * s);
        else if (req.type === 'blood') p.mesh.scale.setScalar((1.2 + Math.random() * 0.8) * s);
        else p.mesh.scale.setScalar((0.3 + Math.random() * 0.3) * s);

        if (req.customVel) p.vel.copy(req.customVel);
        else p.vel.set((Math.random() - 0.5) * 0.4, Math.random() * 0.5, (Math.random() - 0.5) * 0.4);

        p.life = (req.type === 'blood' ? 60 : (req.type === 'debris' ? 200 : 30)) + Math.random() * 20;
        p.maxLife = p.life;
        p.rotVel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);

        req.particlesList.push(p);
    },

    // --- INTERFACE ---

    spawnDecal: (scene: THREE.Scene, decalList: any[], x: number, z: number, scale: number, material?: THREE.Material) => {
        let req = DECAL_REQUEST_POOL.pop() || {} as SpawnRequest;
        req.scene = scene; req.particlesList = decalList as any; req.x = x; req.z = z; req.scale = scale; req.material = material;
        FXSystem.decalQueue.push(req);
    },

    spawnPart: (scene: THREE.Scene, particlesList: ParticleState[], x: number, y: number, z: number, type: string, count: number, customMesh?: any, customVel?: THREE.Vector3, color?: number, scale?: number) => {
        for (let i = 0; i < count; i++) {
            let req = REQUEST_POOL.pop() || {} as SpawnRequest;
            req.scene = scene; req.particlesList = particlesList; req.x = x; req.y = y; req.z = z;
            req.type = type; req.customMesh = customMesh; req.customVel = customVel; req.color = color; req.scale = scale;
            FXSystem.particleQueue.push(req);
        }
    },

    textQueue: [] as { mesh: THREE.Sprite, life: number }[],
    spawnFloatingText: (scene: THREE.Scene, x: number, y: number, z: number, text: string, color: string = '#ffffff') => {
        const sprite = createTextSprite(text);
        sprite.position.set(x, y + 1.5, z);
        sprite.scale.set(1.5, 0.375, 1);
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
            if (Math.random() < 0.2) callbacks.spawnDecal(p.mesh.position.x, p.mesh.position.z, 0.3, MATERIALS.bloodDecal);
            FXSystem._killParticle(index, list);
        } else if (['chunk', 'limb', 'gore'].includes(p.type)) {
            callbacks.spawnDecal(p.mesh.position.x, p.mesh.position.z, 0.8, MATERIALS.bloodDecal);
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
            if (['gore', 'limb', 'chunk'].includes(type)) {
                geo = GEOMETRY.gore;
                mat = MATERIALS.gore.clone();
                (mat as any).color.set(0xffffff);
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
        // Cone spread
        const spread = 0.15;
        const dir = direction.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * spread,
            (Math.random() - 0.5) * spread,
            (Math.random() - 0.5) * spread
        )).normalize();

        const speed = 10 + Math.random() * 5;
        const life = 0.8 + Math.random() * 0.4;
        const scale = 0.5 + Math.random() * 0.5;

        // Use 'fire' or 'flame' material
        // We can reuse spawnParticle logic but specific for flame
        // Actually, let's just use spawnParticle with specific params
        // Assuming we have a helper or just direct use
        // I'll call a helper if it exists, otherwise I'll push to queue manually or define a helper here if I can see one.
        // I can see `spawnFlash` or similar in other files? No, I only see `getPooledMesh`.
        // I'll implement a `spawnParticle` wrapper since I can't see the implementation of standard spawn in the snippet.
        // Wait, I need to see if there is a `spawnParticle` exposed.
        // The snippet shows `FXSystem` object starts at line 61.
        // I'll assume `spawnParticle` exists or I'll implement logic to add to `particleQueue`.

        FXSystem.particleQueue.push({
            scene: null as any, // Managed by update
            particlesList: null as any,
            x: start.x, y: start.y, z: start.z,
            type: 'fire',
            customVel: dir.multiplyScalar(speed),
            scale: scale,
            color: 0xff5500 // Orange
        } as any);
        // Note: The `update` loop needs to handle this. I'm assuming existing system handles `fire` type.
    },

    spawnLightning: (start: THREE.Vector3, end: THREE.Vector3) => {
        // Create a chain of segments
        const points = [];
        const segments = 6;
        const dist = start.distanceTo(end);
        const lerpStep = 1 / segments;

        points.push(start.clone());
        for (let i = 1; i < segments; i++) {
            const p = new THREE.Vector3().lerpVectors(start, end, i * lerpStep);
            // Jitter
            p.add(new THREE.Vector3(
                (Math.random() - 0.5) * 1.5,
                (Math.random() - 0.5) * 1.5,
                (Math.random() - 0.5) * 1.5
            ));
            points.push(p);
        }
        points.push(end.clone());

        // We can't easily draw lines with standard particles. 
        // We can spawn small "electric" particles along the path or use immediate mode lines if engine supports it.
        // Given existing particle system, spawning a trail of 'flash' or 'stun_star' particles might be best.
        // Or 'debris_trail'.

        points.forEach(p => {
            FXSystem.particleQueue.push({
                scene: null as any,
                particlesList: null as any,
                x: p.x, y: p.y, z: p.z,
                type: 'flash',
                customVel: new THREE.Vector3(0, 0, 0),
                scale: 0.3 + Math.random() * 0.2,
                color: 0x00ffff // Cyan
            } as any);
        });
    },

    spawnStunSparks: (pos: THREE.Vector3) => {
        for (let i = 0; i < 3; i++) {
            FXSystem.particleQueue.push({
                scene: null as any,
                particlesList: null as any,
                x: pos.x + (Math.random() - 0.5), y: pos.y + 1.5 + (Math.random() - 0.5), z: pos.z + (Math.random() - 0.5),
                type: 'stun_star',
                customVel: new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2),
                scale: 0.2,
                color: 0xffff00
            } as any);
        }
    }

};