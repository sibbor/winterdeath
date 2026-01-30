
import * as THREE from 'three';
import { GEOMETRY, MATERIALS } from '../../utils/assets';

export const FXSystem = {
    spawnDecal: (
        scene: THREE.Scene, 
        decalList: any[], 
        x: number, 
        z: number, 
        scale: number, 
        material?: THREE.Material
    ) => {
        const d = new THREE.Mesh(GEOMETRY.decal, material || MATERIALS.bloodDecal);
        d.position.set(x, 0.05, z); 
        d.rotation.x = -Math.PI/2; 
        d.rotation.z = Math.random() * Math.PI * 2; 
        d.scale.setScalar(scale);
        
        scene.add(d); 
        decalList.push(d);
        
        // Limit decals to 250 to keep blood pools around longer
        if (decalList.length > 250) { 
            const old = decalList.shift(); 
            scene.remove(old); 
        }
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
        for(let i=0; i<count; i++) {
            let m;
            if (customMesh) { m = customMesh.clone(); } else {
                let geo: THREE.BufferGeometry = GEOMETRY.particle; 
                let mat: THREE.Material = MATERIALS.smoke; 
                
                if (type === 'gore' || type === 'limb') { geo = GEOMETRY.gore; mat = new THREE.MeshStandardMaterial({ color: color || 0x660000, roughness: 0.2 }); }
                else if (type === 'blood') { geo = GEOMETRY.particle; mat = new THREE.MeshBasicMaterial({ color: 0xcc0000 }); }
                else if (type === 'fire') { geo = new THREE.DodecahedronGeometry(0.4); mat = new THREE.MeshBasicMaterial({ color: color || 0xff5500, transparent: true, opacity: 0.8 }); }
                else if (type === 'campfire_flame') { geo = GEOMETRY.flame; mat = new THREE.MeshBasicMaterial({ color: color || 0xff5500, transparent: true, opacity: 0.8 }); }
                else if (type === 'campfire_spark') { geo = new THREE.BoxGeometry(0.05, 0.05, 0.05); mat = new THREE.MeshBasicMaterial({ color: color || 0xffff00 }); }
                else if (type === 'debris') { geo = GEOMETRY.particle; mat = MATERIALS.stone; }
                else if (type === 'debris_trail') { geo = new THREE.BoxGeometry(0.05, 0.05, 0.05); mat = new THREE.MeshBasicMaterial({ color: 0x888888 }); }
                else if (type === 'glass') { geo = GEOMETRY.shard; mat = MATERIALS.glassShard; }
                else if (type === 'shockwave') { geo = GEOMETRY.shockwave; mat = new THREE.MeshBasicMaterial({ color: color || 0xffaa00, transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }); }
                else if (type === 'flash') { geo = GEOMETRY.sphere; mat = new THREE.MeshBasicMaterial({ color: color || 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }); }
                else if (type === 'spark') { geo = new THREE.BoxGeometry(0.05, 0.05, 0.05); mat = new THREE.MeshBasicMaterial({ color: color || 0xffff00 }); }
                else if (type === 'stun_star') { geo = GEOMETRY.shard; mat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true }); }
                
                m = new THREE.Mesh(geo, mat);
                if (type === 'stun_star') m.scale.setScalar(0.2 + Math.random() * 0.1);
                else if (type !== 'flash' && type !== 'shockwave' && type !== 'fire' && type !== 'limb' && type !== 'campfire_flame') m.scale.setScalar(0.3 + Math.random()*0.3);
            }
            
            m.position.set(x,y,z); 
            if (type === 'shockwave') { m.rotation.x = -Math.PI / 2; m.position.y = 0.5; }
            if (type === 'fire' || type === 'campfire_flame') { m.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI); m.scale.setScalar(Math.random()); }
            if (type === 'limb') m.scale.set(0.3, 0.6, 0.3); 
            if (type === 'stun_star') m.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);

            scene.add(m);
            
            let vel = customVel ? customVel.clone() : new THREE.Vector3((Math.random()-0.5)*0.2, Math.random()*0.5, (Math.random()-0.5)*0.5);
            let life = 30 + Math.random() * 20;
            
            if (type === 'blood') {
                if (customVel) {
                    vel = customVel.clone();
                    vel.x += (Math.random() - 0.5) * 0.5;
                    vel.y += Math.random() * 0.5;
                    vel.z += (Math.random() - 0.5) * 0.5;
                    vel.multiplyScalar(0.5 + Math.random() * 0.5);
                } else {
                    // Wider spread for blood fountain
                    vel = new THREE.Vector3((Math.random()-0.5)*1.2, 0.5 + Math.random()*1.5, (Math.random()-0.5)*1.2);
                }
                life = 60 + Math.random() * 40; 
                // Larger blood particles
                m.scale.setScalar(0.25 + Math.random() * 0.35);
            }
            else if (type === 'glass') { vel.x = (Math.random() - 0.5) * 5; vel.z = (Math.random() - 0.5) * 5; vel.y = Math.random() * 3; life = 60; }
            else if (type === 'debris') { vel.x = (Math.random() - 0.5) * 8; vel.z = (Math.random() - 0.5) * 8; vel.y = 2 + Math.random() * 4; life = 200; }
            else if (type === 'fire') { vel = new THREE.Vector3(0, 0.03 + Math.random() * 0.04, 0); life = 1.0; }
            else if (type === 'campfire_flame') { vel = new THREE.Vector3(0, 0.05 + Math.random() * 0.05, 0); life = 1.0; }
            else if (type === 'spark') { vel = new THREE.Vector3((Math.random()-0.5)*0.02, 0.05 + Math.random()*0.05, (Math.random()-0.5)*0.02); life = 1.0; }
            else if (type === 'campfire_spark') { vel = new THREE.Vector3((Math.random()-0.5)*0.05, 0.1 + Math.random()*0.1, (Math.random()-0.5)*0.05); life = 1.0; }
            else if (type === 'limb') { life = 300; }
            else if (type === 'debris_trail') { vel = new THREE.Vector3(0,0,0); life = 10; }
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
                rotVel: new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5) 
            });
        }
    },

    update: (
        scene: THREE.Scene,
        particlesList: any[],
        weatherParticles: any[],
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
        // --- WEATHER ---
        weatherParticles.forEach(p => {
            if (p.vel) p.mesh.position.add(p.vel);
            if (p.mesh.position.y < 0 && p.resetY) {
                p.mesh.position.y = p.resetY;
                p.mesh.position.x = playerPos.x + (Math.random()-0.5)*300;
                p.mesh.position.z = playerPos.z + (Math.random()-0.5)*300;
            }
            if (p.type === 'ground_fog') {
                p.mesh.rotation.z += 0.001;
                // Move fog with player but loosely
                if (p.mesh.position.distanceTo(playerPos) > 150) {
                    p.mesh.position.set(playerPos.x + (Math.random()-0.5)*100, 2, playerPos.z + (Math.random()-0.5)*100);
                }
            }
        });

        // --- PARTICLES ---
        for(let i = particlesList.length - 1; i >= 0; i--) {
            const p = particlesList[i]; 
            p.life -= 0.02; 
            
            if (p.type === 'chunk' || p.type === 'debris' || p.type === 'glass' || p.type === 'limb' || p.type === 'blood') {
                if (p.vel && p.vel.y !== undefined) {
                    p.vel.y -= 25 * delta; 
                    p.mesh.position.add(p.vel.clone().multiplyScalar(delta));
                }
                
                if (p.type !== 'blood') {
                    p.mesh.rotation.x += p.rotVel.x * 10 * delta; 
                    p.mesh.rotation.z += p.rotVel.z * 10 * delta;
                }
                
                // Trails for debris
                if (p.type === 'debris' && frame % 3 === 0) {
                    callbacks.spawnPart(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 'debris_trail', 1);
                }
                
                // Ground Hit
                if (p.mesh.position.y <= 0.2) {
                    p.mesh.position.y = 0.2; 
                    if (p.type === 'blood') {
                        callbacks.spawnDecal(p.mesh.position.x, p.mesh.position.z, 0.4 + Math.random() * 0.4, MATERIALS.bloodDecal);
                        scene.remove(p.mesh);
                        p.life = 0; 
                    } else {
                        p.life = 0; 
                        if (p.type === 'chunk' || p.type === 'limb') {
                            callbacks.spawnDecal(p.mesh.position.x, p.mesh.position.z, 1.5, MATERIALS.bloodDecal);
                            if (p.type === 'chunk') scene.remove(p.mesh); 
                            else { 
                                // Limbs stay for a bit
                                p.mesh.position.y = 0.15; 
                                p.mesh.rotation.set(Math.random(), 0, Math.random()); 
                            }
                        } else if (p.type === 'debris') { 
                            callbacks.spawnDecal(p.mesh.position.x, p.mesh.position.z, 1.0, MATERIALS.scorchDecal); 
                            scene.remove(p.mesh); 
                        } 
                        else if (p.type === 'glass') { 
                            scene.remove(p.mesh); 
                        }
                    }
                    particlesList.splice(i, 1); 
                    continue; 
                }
            } else if (p.type === 'campfire_flame') {
                p.mesh.position.y += p.vel.y;
                p.mesh.scale.setScalar(Math.max(0, p.life));
                p.mesh.rotation.y += 0.05;
                p.mesh.material.opacity = p.life;
            } else if (p.type === 'campfire_spark') {
                p.mesh.position.add(p.vel);
                p.mesh.position.x += Math.sin(now * 0.01) * 0.01;
            } else if (p.type === 'stun_star') {
                p.mesh.position.add(p.vel);
                p.mesh.rotation.y += 0.2;
                // Blinking effect
                const blink = Math.abs(Math.sin(frame * 0.3));
                (p.mesh.material as THREE.MeshBasicMaterial).opacity = blink;
            }
            
            // Death Check
            let isDead = false;
            if (p.type === 'campfire_flame' || p.type === 'campfire_spark' || p.type === 'fire') {
                 if (p.life <= 0) isDead = true;
            } else {
                 p.life -= (1 - 0.02); // Decay helper
                 
                 // Fade / Grow effects
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
                     // Regular particle movement
                     p.mesh.position.add(p.vel.clone().multiplyScalar(delta)); 
                     p.mesh.scale.multiplyScalar(0.95); 
                 }
                 if (p.life <= 0) isDead = true;
            }

            if (isDead && p.type !== 'limb') { 
                if (p.mesh.parent) p.mesh.parent.remove(p.mesh); 
                else scene.remove(p.mesh);
                particlesList.splice(i, 1); 
            }
        }
    }
};
