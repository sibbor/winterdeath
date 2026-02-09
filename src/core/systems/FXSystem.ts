
import * as THREE from 'three';
import { GEOMETRY, MATERIALS } from '../../utils/assets';

export const FXSystem = {
    particleQueue: [] as any[],
    decalQueue: [] as any[],
    MESH_POOL: [] as THREE.Mesh[],

    // Internal immediate methods
    _spawnDecalImmediate: (
        scene: THREE.Scene,
        decalList: any[],
        x: number,
        z: number,
        scale: number,
        material?: THREE.Material
    ) => {
        // Decals are permanent until limit reached, so we don't pool them in the same way 
        // OR we could pool them but they stay in scene longer.
        // For now, let's keep decal logic as-is but use pool for the mesh creation if possible, 
        // or just keep existing logic since decals are low frequency.
        // Actually, optimization report says ALL particles/decals. 
        // Let's use the pool for decals too.

        let d = FXSystem.getPooledMesh(scene, GEOMETRY.decal, material || MATERIALS.bloodDecal);
        d.position.set(x, 0.12 + Math.random() * 0.05, z);
        d.rotation.x = -Math.PI / 2;
        d.rotation.z = Math.random() * Math.PI * 2;
        d.scale.setScalar(scale);

        decalList.push(d);

        // Limit decals to 250
        if (decalList.length > 250) {
            const old = decalList.shift();
            FXSystem.recycleMesh(old);
        }
    },

    getPooledMesh: (scene: THREE.Scene, geo: THREE.BufferGeometry, mat: THREE.Material) => {
        let m = FXSystem.MESH_POOL.find(mesh => !mesh.visible);
        if (!m) {
            // Expand pool
            m = new THREE.Mesh(geo, mat);
            scene.add(m);
            FXSystem.MESH_POOL.push(m);
        } else {
            m.geometry = geo;
            m.material = mat;
            m.visible = true;
            m.scale.set(1, 1, 1);
            m.rotation.set(0, 0, 0);
            // Ensure it's in the scene (might have been removed in old logic, but here we just hide)
            if (m.parent !== scene) scene.add(m);
        }
        return m;
    },

    recycleMesh: (m: THREE.Mesh) => {
        m.visible = false;
        m.position.set(0, -1000, 0); // Move out of view just in case
    },

    _spawnPartImmediate: (
        scene: THREE.Scene,
        particlesList: any[],
        x: number,
        y: number,
        z: number,
        type: string,
        customMesh?: THREE.Mesh,
        customVel?: THREE.Vector3,
        color?: number
    ) => {
        let m: THREE.Mesh;

        if (customMesh) {
            // If custom mesh is provided, we clone it (legacy behavior for special meshes)
            // Ideally we'd pool this too but custom meshes are rare (chunks mainly)
            m = customMesh.clone();
            scene.add(m);
        } else {
            let geo: THREE.BufferGeometry = GEOMETRY.particle;
            let mat: THREE.Material = MATERIALS.smoke;

            if (type === 'gore' || type === 'limb') { geo = GEOMETRY.gore; mat = MATERIALS.gore; }
            else if (type === 'blood') { geo = GEOMETRY.particle; mat = MATERIALS.blood; }
            else if (type === 'black_smoke') {
                geo = GEOMETRY.particle;
                if (!MATERIALS['_blackSmoke']) {
                    MATERIALS['_blackSmoke'] = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false });
                }
                mat = MATERIALS['_blackSmoke'];
            }
            else if (type === 'fire') { geo = new THREE.DodecahedronGeometry(0.4); mat = MATERIALS.fire; }
            else if (type === 'campfire_flame') { geo = GEOMETRY.flame; mat = MATERIALS.fire; }
            else if (type === 'campfire_spark') { geo = new THREE.BoxGeometry(0.05, 0.05, 0.05); mat = MATERIALS.bullet; }
            else if (type === 'debris') { geo = GEOMETRY.particle; mat = MATERIALS.stone; }
            else if (type === 'debris_trail') { geo = new THREE.BoxGeometry(0.05, 0.05, 0.05); mat = MATERIALS.stone; }
            else if (type === 'glass') { geo = GEOMETRY.shard; mat = MATERIALS.glassShard; }
            else if (type === 'shockwave') { geo = GEOMETRY.shockwave; mat = MATERIALS.shockwave; }
            else if (type === 'flash') { geo = GEOMETRY.sphere; mat = MATERIALS.flashWhite; }
            else if (type === 'spark') { geo = new THREE.BoxGeometry(0.05, 0.05, 0.05); mat = MATERIALS.bullet; }
            else if (type === 'stun_star') { geo = GEOMETRY.shard; mat = MATERIALS.bullet; }

            m = FXSystem.getPooledMesh(scene, geo, mat);

            if (type === 'stun_star') m.scale.setScalar(0.2 + Math.random() * 0.1);
            else if (type !== 'flash' && type !== 'shockwave' && type !== 'fire' && type !== 'limb' && type !== 'campfire_flame') m.scale.setScalar(0.3 + Math.random() * 0.3);
        }

        m.position.set(x, y, z);
        if (type === 'shockwave') { m.rotation.x = -Math.PI / 2; m.position.y = 0.5; }
        if (type === 'fire' || type === 'campfire_flame') { m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI); m.scale.setScalar(Math.random()); }
        if (type === 'limb') m.scale.set(0.3, 0.6, 0.3);
        if (type === 'stun_star') m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

        // Velocity & Life Logic (Same as before)
        let vel = customVel ? customVel.clone() : new THREE.Vector3((Math.random() - 0.5) * 0.2, Math.random() * 0.5, (Math.random() - 0.5) * 0.5);
        let life = 30 + Math.random() * 20;

        if (type === 'blood') {
            if (customVel) {
                vel = customVel.clone();
                vel.x += (Math.random() - 0.5) * 0.5;
                vel.y += Math.random() * 0.5;
                vel.z += (Math.random() - 0.5) * 0.5;
                vel.multiplyScalar(0.5 + Math.random() * 0.5);
            } else {
                vel = new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.5 + Math.random() * 1.5, (Math.random() - 0.5) * 1.2);
            }
            life = 60 + Math.random() * 40;
            m.scale.setScalar(0.25 + Math.random() * 0.35);
        }
        else if (type === 'glass') { vel.x = (Math.random() - 0.5) * 5; vel.z = (Math.random() - 0.5) * 5; vel.y = Math.random() * 3; life = 60; }
        else if (type === 'debris') { vel.x = (Math.random() - 0.5) * 8; vel.z = (Math.random() - 0.5) * 8; vel.y = 2 + Math.random() * 4; life = 200; }
        else if (type === 'fire') { vel = new THREE.Vector3(0, 0.03 + Math.random() * 0.04, 0); life = 1.0; }
        else if (type === 'campfire_flame') { vel = new THREE.Vector3(0, 0.05 + Math.random() * 0.05, 0); life = 1.0; }
        else if (type === 'spark') {
            if (!customVel) vel = new THREE.Vector3((Math.random() - 0.5) * 0.02, 0.05 + Math.random() * 0.05, (Math.random() - 0.5) * 0.02);
            life = 1.0;
        }
        else if (type === 'campfire_spark') { vel = new THREE.Vector3((Math.random() - 0.5) * 0.05, 0.1 + Math.random() * 0.1, (Math.random() - 0.5) * 0.05); life = 1.0; }
        else if (type === 'limb') { life = 300; }
        else if (type === 'debris_trail') { vel = new THREE.Vector3(0, 0, 0); life = 10; }
        else if (type === 'stun_star') { vel = new THREE.Vector3(0, 0.05, 0); life = 40; }

        if (type === 'chunk' || type === 'limb') life = 200;
        if (type === 'shockwave') life = 10;
        if (type === 'flash') life = 5;

        particlesList.push({
            mesh: m,
            vel,
            life,
            maxLife: life,
            type,
            rotVel: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5),
            isPooled: !customMesh // Track if we should recycle or remove
        });
    },

    // Public methods (Enqueue)
    spawnDecal: (
        scene: THREE.Scene,
        decalList: any[],
        x: number,
        z: number,
        scale: number,
        material?: THREE.Material
    ) => {
        FXSystem.decalQueue.push({ scene, decalList, x, z, scale, material });
    },

    spawnPart: (
        scene: THREE.Scene,
        particlesList: any[],
        x: number,
        y: number,
        z: number,
        type: string,
        count: number,
        customMesh?: THREE.Mesh,
        customVel?: THREE.Vector3,
        color?: number
    ) => {
        // High count effects are flattened into the queue
        for (let i = 0; i < count; i++) {
            FXSystem.particleQueue.push({ scene, particlesList, x, y, z, type, customMesh, customVel, color });
        }
    },

    update: (
        scene: THREE.Scene,
        particlesList: any[],
        decalList: any[],
        delta: number,
        frame: number,
        now: number,
        playerPos: THREE.Vector3,
        callbacks: {
            spawnPart: (x: number, y: number, z: number, type: string, count: number) => void;
            spawnDecal: (x: number, z: number, scale: number, mat?: THREE.Material) => void;
        }
    ) => {
        // --- QUEUE PROCESSING ---
        // Staggered spawning to prevent CPU spikes (Budget: max 30 parts, 2 decals per frame)
        const partBudget = Math.min(FXSystem.particleQueue.length, 30);
        for (let i = 0; i < partBudget; i++) {
            const req = FXSystem.particleQueue.shift();
            if (req) FXSystem._spawnPartImmediate(req.scene, req.particlesList, req.x, req.y, req.z, req.type, req.customMesh, req.customVel, req.color);
        }

        const decalBudget = Math.min(FXSystem.decalQueue.length, 2);
        for (let i = 0; i < decalBudget; i++) {
            const req = FXSystem.decalQueue.shift();
            if (req) FXSystem._spawnDecalImmediate(req.scene, req.decalList, req.x, req.z, req.scale, req.material);
        }

        // --- PARTICLES ---
        for (let i = particlesList.length - 1; i >= 0; i--) {
            const p = particlesList[i];
            const decay = delta * 44;
            p.life -= decay;

            if (p.type === 'chunk' || p.type === 'debris' || p.type === 'glass' || p.type === 'limb' || p.type === 'blood') {
                if (p.vel && p.vel.y !== undefined) {
                    p.vel.y -= 25 * delta;
                    p.mesh.position.add(p.vel.clone().multiplyScalar(delta));
                }

                if (p.type !== 'blood') {
                    p.mesh.rotation.x += p.rotVel.x * 10 * delta;
                    p.mesh.rotation.z += p.rotVel.z * 10 * delta;
                }

                if (p.type === 'debris' && frame % 3 === 0) {
                    callbacks.spawnPart(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 'debris_trail', 1);
                }

                if (p.mesh.position.y <= 0.05) {
                    p.mesh.position.y = 0.05;
                    if (p.type === 'blood') {
                        if (Math.random() < 0.2) {
                            callbacks.spawnDecal(p.mesh.position.x, p.mesh.position.z, 0.4 + Math.random() * 0.4, MATERIALS.bloodDecal);
                        }
                        if (p.isPooled) FXSystem.recycleMesh(p.mesh);
                        else scene.remove(p.mesh);
                        p.life = 0;
                    } else {
                        p.life = 0;
                        if (p.type === 'chunk' || p.type === 'limb') {
                            callbacks.spawnDecal(p.mesh.position.x, p.mesh.position.z, 1.5, MATERIALS.bloodDecal);
                            if (p.type === 'chunk') {
                                if (p.isPooled) FXSystem.recycleMesh(p.mesh);
                                else scene.remove(p.mesh);
                            }
                            else {
                                p.mesh.position.y = 0.15;
                                p.mesh.rotation.set(Math.random(), 0, Math.random());
                            }
                        } else if (p.type === 'debris') {
                            callbacks.spawnDecal(p.mesh.position.x, p.mesh.position.z, 1.0, MATERIALS.scorchDecal);
                            if (p.isPooled) FXSystem.recycleMesh(p.mesh);
                            else scene.remove(p.mesh);
                        }
                        else if (p.type === 'glass') {
                            if (p.isPooled) FXSystem.recycleMesh(p.mesh);
                            else scene.remove(p.mesh);
                        }
                    }
                    particlesList.splice(i, 1);
                    continue;
                }
            } else if (p.type === 'campfire_flame') {
                p.mesh.position.y += p.vel.y;
                p.mesh.scale.setScalar(Math.max(0, p.life * (1.0 + Math.random() * 0.5)));
                p.mesh.rotation.y += 0.1;
                p.mesh.material.opacity = p.life;
            } else if (p.type === 'black_smoke') {
                p.mesh.position.y += delta * 2.0;
                p.mesh.position.x += (Math.random() - 0.5) * delta * 1.0;
                p.mesh.position.z += (Math.random() - 0.5) * delta * 1.0;
                const progress = 1 - (p.life / p.maxLife);
                const scale = 1.0 + progress * 3.0;
                p.mesh.scale.set(scale, scale, scale);
                p.mesh.rotation.z += delta * 0.2;
                (p.mesh.material as THREE.MeshBasicMaterial).opacity = (p.life / p.maxLife) * 0.6;
            } else if (p.type === 'campfire_spark') {
                p.mesh.position.add(p.vel);
                p.mesh.position.x += Math.sin(now * 0.01) * 0.01;
            } else if (p.type === 'stun_star') {
                p.mesh.position.add(p.vel);
                p.mesh.rotation.y += 0.2;
                const blink = Math.abs(Math.sin(frame * 0.3));
                (p.mesh.material as THREE.MeshBasicMaterial).opacity = blink;
            }

            let isDead = false;
            if (p.type === 'campfire_flame' || p.type === 'campfire_spark' || p.type === 'fire') {
                if (p.life <= 0) isDead = true;
            } else {
                if (p.type === 'shockwave') {
                    const progress = 1 - (p.life / p.maxLife);
                    const scale = 1 + progress * 20;
                    p.mesh.scale.set(scale, scale, scale);
                    (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - progress);
                } else if (p.type === 'flash') {
                    const progress = 1 - (p.life / p.maxLife);
                    p.mesh.scale.setScalar(20 + progress * 10);
                    (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - progress);
                } else if (p.type === 'debris_trail') {
                    (p.mesh.material as THREE.MeshBasicMaterial).opacity = (p.life / p.maxLife);
                } else if (p.type !== 'chunk' && p.type !== 'debris' && p.type !== 'glass' && p.type !== 'limb' && p.type !== 'blood' && p.type !== 'stun_star') {
                    p.mesh.position.add(p.vel.clone().multiplyScalar(delta));
                    p.mesh.scale.multiplyScalar(0.95);
                }
                if (p.life <= 0) isDead = true;
            }

            if (isDead && p.type !== 'limb') {
                if (p.isPooled) FXSystem.recycleMesh(p.mesh);
                else {
                    if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
                    else scene.remove(p.mesh);
                }
                particlesList.splice(i, 1);
            }
        }
    }
};
