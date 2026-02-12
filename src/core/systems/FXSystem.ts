import * as THREE from 'three';
import { GEOMETRY, MATERIALS } from '../../utils/assets';

// --- TYPES & INTERFACES ---

/** * Safely access transparency and color properties 
 * across different material classes (Basic, Standard, etc.)
 */
type FXMaterial = THREE.Material & {
    opacity: number;
    transparent: boolean;
    color?: THREE.Color
};

/**
 * Particle state structure for Zero-GC updates
 */
interface ParticleState {
    mesh: THREE.Mesh;
    vel: THREE.Vector3;
    rotVel: THREE.Vector3;
    life: number;
    maxLife: number;
    type: string;
    isPooled: boolean;
    isInstanced: boolean;
    landed: boolean;
    inUse: boolean;
    _poolIdx: number;
}

// Scratchpad for math to avoid Garbage Collection (GC) overhead
const _tempVec = new THREE.Vector3();

// Types that MUST have unique material instances for independent fading/opacity
const UNIQUE_MATERIAL_TYPES = [
    'fire', 'campfire_flame', 'large_fire', 'large_smoke',
    'black_smoke', 'debris_trail', 'stun_star', 'shockwave', 'flash'
];

export const FXSystem = {
    // Queues with pointers to avoid O(n) .shift() overhead
    particleQueue: [] as any[],
    _particleQueueIndex: 0,
    decalQueue: [] as any[],
    _decalQueueIndex: 0,

    // Fast Pool Access (O(1)) using stacks
    MESH_POOL: [] as THREE.Mesh[],
    FREE_MESH_INDICES: [] as number[],

    // Per-type Material Pool to avoid GPU recompilation (Solving Global Hide bug)
    MATERIAL_POOL: {} as Record<string, THREE.Material[]>,

    PARTICLE_STATE_POOL: [] as ParticleState[],
    FREE_STATE_INDICES: [] as number[],

    _instancedMeshes: {} as Record<string, THREE.InstancedMesh>,
    _instancedCounts: {} as Record<string, number>,
    _MAX_INSTANCES: 2000,

    // --- POOLING METHODS ---

    getPooledMesh: (scene: THREE.Scene, geo: THREE.BufferGeometry, mat: THREE.Material, type: string, isInstanced: boolean = false): THREE.Mesh => {
        let m: THREE.Mesh;
        let finalMat = mat;

        // Handle unique vs shared material
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
            FXSystem.MESH_POOL.push(m);
        }

        if (!isInstanced && m.parent !== scene) scene.add(m);
        if (isInstanced && m.parent === scene) scene.remove(m);

        return m;
    },

    _getUniqueMaterial: (baseMat: THREE.Material, type: string): THREE.Material => {
        if (!FXSystem.MATERIAL_POOL[type]) FXSystem.MATERIAL_POOL[type] = [];

        if (FXSystem.MATERIAL_POOL[type].length > 0) {
            const mat = FXSystem.MATERIAL_POOL[type].pop()! as FXMaterial;
            if (mat.transparent) mat.opacity = 1.0; // Reset for new particle
            return mat;
        }

        // Only clone when pool is empty (prevents GPU stutter)
        const clone = baseMat.clone();
        clone.transparent = true;
        return clone;
    },

    recycleMesh: (m: THREE.Mesh, type: string) => {
        m.visible = false;
        m.position.set(0, -1000, 0);

        // Return material to pool if it was a unique instance
        if (UNIQUE_MATERIAL_TYPES.includes(type)) {
            if (!FXSystem.MATERIAL_POOL[type]) FXSystem.MATERIAL_POOL[type] = [];
            FXSystem.MATERIAL_POOL[type].push(m.material as THREE.Material);
        }

        const idx = FXSystem.MESH_POOL.indexOf(m);
        if (idx !== -1) FXSystem.FREE_MESH_INDICES.push(idx);
    },

    getPooledState: (): ParticleState => {
        if (FXSystem.FREE_STATE_INDICES.length > 0) {
            const idx = FXSystem.FREE_STATE_INDICES.pop()!;
            const p = FXSystem.PARTICLE_STATE_POOL[idx];
            p.inUse = true;
            return p;
        }

        const p: ParticleState = {
            mesh: null as any,
            vel: new THREE.Vector3(),
            rotVel: new THREE.Vector3(),
            life: 0, maxLife: 0,
            type: '', isPooled: false, isInstanced: false,
            landed: false, inUse: true,
            _poolIdx: FXSystem.PARTICLE_STATE_POOL.length
        };
        FXSystem.PARTICLE_STATE_POOL.push(p);
        return p;
    },

    // --- SPAWNING ---

    _spawnDecalImmediate: (scene: THREE.Scene, decalList: any[], x: number, z: number, scale: number, material?: THREE.Material) => {
        const d = FXSystem.getPooledMesh(scene, GEOMETRY.decal, material || MATERIALS.bloodDecal, 'decal');
        d.position.set(x, 0.2 + Math.random() * 0.05, z);
        d.rotation.x = -Math.PI / 2;
        d.rotation.z = Math.random() * Math.PI * 2;
        d.scale.setScalar(scale);
        d.renderOrder = 10;

        decalList.push(d);

        if (decalList.length > 250) {
            const old = decalList.shift();
            if (old) FXSystem.recycleMesh(old, 'decal');
        }
    },

    _spawnPartImmediate: (scene: THREE.Scene, particlesList: any[], x: number, y: number, z: number, type: string, customMesh?: THREE.Mesh, customVel?: THREE.Vector3, color?: number, scale?: number) => {
        // Anti-flicker: Prevent NaN data entering the GPU
        if (isNaN(x) || isNaN(y) || isNaN(z)) return;

        const isInstanced = ['blood', 'spark', 'campfire_spark', 'debris', 'debris_trail', 'glass', 'stun_star'].includes(type);
        const p = FXSystem.getPooledState();

        p.type = type;
        p.landed = false;
        p.isPooled = !customMesh;
        p.isInstanced = isInstanced;

        let m: THREE.Mesh;

        if (customMesh) {
            m = customMesh;
            if (m.parent !== scene) scene.add(m);
            m.renderOrder = 11;
        } else {
            let geo: THREE.BufferGeometry = GEOMETRY.particle;
            let mat: THREE.Material = MATERIALS.blood;

            // Strict Type Mapping
            if (type === 'gore' || type === 'limb') { geo = GEOMETRY.gore; mat = MATERIALS.gore; }
            else if (type === 'black_smoke') {
                if (!MATERIALS['_blackSmoke']) {
                    MATERIALS['_blackSmoke'] = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false });
                }
                geo = GEOMETRY.particle; mat = MATERIALS['_blackSmoke'];
            }
            else if (['fire', 'campfire_flame', 'large_fire'].includes(type)) { geo = GEOMETRY.flame; mat = MATERIALS.fire; }
            else if (['campfire_spark', 'spark'].includes(type)) { geo = GEOMETRY.particle; mat = MATERIALS.bullet; }
            else if (['debris', 'debris_trail'].includes(type)) { geo = GEOMETRY.particle; mat = MATERIALS.stone; }
            else if (type === 'glass') { geo = GEOMETRY.shard; mat = MATERIALS.glassShard; }
            else if (type === 'shockwave') { geo = GEOMETRY.shockwave; mat = MATERIALS.shockwave; }
            else if (type === 'flash') { geo = GEOMETRY.sphere; mat = MATERIALS.flashWhite; }
            else if (type === 'stun_star') { geo = GEOMETRY.shard; mat = MATERIALS.bullet; }
            else if (type === 'large_smoke') { geo = GEOMETRY.flame; mat = MATERIALS.smoke; }

            m = FXSystem.getPooledMesh(scene, geo, mat, type, isInstanced);
            m.renderOrder = 11;
        }

        m.position.set(x, y, z);

        // Transform logic
        if (type === 'shockwave') { m.rotation.x = -Math.PI / 2; m.position.y = 0.5; }
        else if (['fire', 'campfire_flame', 'large_fire', 'large_smoke', 'stun_star'].includes(type)) {
            m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        }

        const s = scale || 1.0;
        if (type === 'large_fire') m.scale.setScalar(1.6 * Math.random() * s);
        else if (type === 'large_smoke') m.scale.setScalar(2.4 * Math.random() * s);
        else if (['campfire_spark', 'debris_trail', 'spark'].includes(type)) m.scale.setScalar(0.33 * s);
        else m.scale.setScalar((0.3 + Math.random() * 0.3) * s);

        p.mesh = m;

        if (customVel) p.vel.copy(customVel);
        else p.vel.set((Math.random() - 0.5) * 0.4, Math.random() * 0.5, (Math.random() - 0.5) * 0.4);

        p.life = 30 + Math.random() * 20;
        if (type === 'blood') p.life = 60 + Math.random() * 40;
        else if (type === 'debris') p.life = 200;
        else if (['limb', 'gore', 'chunk'].includes(type)) p.life = 300;

        p.maxLife = p.life;
        p.rotVel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);

        particlesList.push(p);
    },

    // --- INTERFACE ---

    spawnDecal: (scene: THREE.Scene, decalList: any[], x: number, z: number, scale: number, material?: THREE.Material) => {
        FXSystem.decalQueue.push({ scene, decalList, x, z, scale, material });
    },

    spawnPart: (scene: THREE.Scene, particlesList: any[], x: number, y: number, z: number, type: string, count: number, customMesh?: THREE.Mesh, customVel?: THREE.Vector3, color?: number, scale?: number) => {
        for (let i = 0; i < count; i++) {
            FXSystem.particleQueue.push({ scene, particlesList, x, y, z, type, customMesh, customVel, color, scale });
        }
    },

    // --- MAIN UPDATE LOOP ---

    update: (scene: THREE.Scene, particlesList: any[], decalList: any[], delta: number, frame: number, now: number, playerPos: THREE.Vector3, callbacks: any) => {

        // Safety: Clamp delta to prevent NaN jumps during frame drops
        const safeDelta = Math.min(delta, 0.1);

        // 1. Process Queue (Budgeted)
        const pLimit = Math.min(FXSystem.particleQueue.length - FXSystem._particleQueueIndex, 30);
        for (let i = 0; i < pLimit; i++) {
            const req = FXSystem.particleQueue[FXSystem._particleQueueIndex++];
            FXSystem._spawnPartImmediate(req.scene, req.particlesList, req.x, req.y, req.z, req.type, req.customMesh, req.customVel, req.color, req.scale);
        }
        if (FXSystem._particleQueueIndex > 100) {
            FXSystem.particleQueue.splice(0, FXSystem._particleQueueIndex);
            FXSystem._particleQueueIndex = 0;
        }

        // --- NEW: Process Decal Queue (Budgeted) ---
        const dLimit = Math.min(FXSystem.decalQueue.length - FXSystem._decalQueueIndex, 10);
        for (let i = 0; i < dLimit; i++) {
            const req = FXSystem.decalQueue[FXSystem._decalQueueIndex++];
            FXSystem._spawnDecalImmediate(req.scene, req.decalList, req.x, req.z, req.scale, req.material);
        }
        if (FXSystem._decalQueueIndex > 50) {
            FXSystem.decalQueue.splice(0, FXSystem._decalQueueIndex);
            FXSystem._decalQueueIndex = 0;
        }

        // 2. Clear Instanced Counts
        for (const type in FXSystem._instancedCounts) FXSystem._instancedCounts[type] = 0;

        // 3. Update Particles
        const decay = safeDelta * 44;
        for (let i = particlesList.length - 1; i >= 0; i--) {
            const p = particlesList[i];
            p.life -= decay;

            if (p.life <= 0 || isNaN(p.life)) {
                FXSystem._killParticle(i, particlesList);
                continue;
            }

            // Movement & Physics
            if (!p.landed) {
                p.mesh.position.addScaledVector(p.vel, safeDelta);

                // Cleanup NaN positions to avoid black screen flicker
                if (isNaN(p.mesh.position.x)) {
                    FXSystem._killParticle(i, particlesList);
                    continue;
                }

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

            // Sync Opacity (Using FXMaterial for safety)
            if (!p.isInstanced) {
                const mat = p.mesh.material as FXMaterial;
                if (mat.transparent) {
                    mat.opacity = Math.max(0, p.life / p.maxLife);
                }
            }

            // Sync with InstancedMesh
            if (p.isInstanced) {
                const imesh = FXSystem._getInstancedMesh(scene, p.type);
                const idx = FXSystem._instancedCounts[p.type];
                if (imesh && idx < FXSystem._MAX_INSTANCES) {
                    p.mesh.updateMatrix();
                    imesh.setMatrixAt(idx, p.mesh.matrix);
                    FXSystem._instancedCounts[p.type]++;
                }
            }
        }

        // 4. Finalize Instancing (Anti-Blink Fix)
        for (const type in FXSystem._instancedMeshes) {
            const imesh = FXSystem._instancedMeshes[type];

            // Set precise instance count to avoid overdraw and flicker
            imesh.count = FXSystem._instancedCounts[type];
            imesh.instanceMatrix.needsUpdate = true;

            // Ensure bounding volume is current so it doesn't vanish at screen edges
            if (imesh.count > 0) {
                imesh.computeBoundingSphere();
            }
        }
    },

    _killParticle: (index: number, list: any[]) => {
        const p = list[index];
        if (p.isPooled) FXSystem.recycleMesh(p.mesh, p.type);
        else if (p.mesh.parent) p.mesh.parent.remove(p.mesh);

        p.inUse = false;
        FXSystem.FREE_STATE_INDICES.push(p._poolIdx);

        // SWAP AND POP (O(1) removal)
        list[index] = list[list.length - 1];
        list.pop();
    },

    _handleLanding: (p: any, index: number, list: any[], callbacks: any) => {
        p.mesh.position.y = 0.05;
        p.landed = true;

        if (p.type === 'blood') {
            if (Math.random() < 0.2) callbacks.spawnDecal(p.mesh.position.x, p.mesh.position.z, 0.5, MATERIALS.bloodDecal);
            FXSystem._killParticle(index, list);
        } else if (['chunk', 'limb', 'gore'].includes(p.type)) {
            callbacks.spawnDecal(p.mesh.position.x, p.mesh.position.z, 1.5, MATERIALS.bloodDecal);
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
            if (type === 'glass') { geo = GEOMETRY.shard; mat = MATERIALS.glassShard; }

            const imesh = new THREE.InstancedMesh(geo, mat, FXSystem._MAX_INSTANCES);
            imesh.frustumCulled = true; // Optimization
            scene.add(imesh);
            FXSystem._instancedMeshes[type] = imesh;
            FXSystem._instancedCounts[type] = 0;
        }
        return FXSystem._instancedMeshes[type];
    }
};