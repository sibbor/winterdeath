
import * as THREE from 'three';
import { GEOMETRY } from '../geometry';
import { MATERIALS } from '../materials';

export const UndeadModels = {
    createZombie: (typeKey: string, typeData: any, isBoss: boolean = false): THREE.Group => {
        const group = new THREE.Group();
        
        const isTank = typeKey === 'TANK';
        const mat = isTank ? MATERIALS.tank : (typeKey === 'RUNNER' ? MATERIALS.runner : (typeKey === 'BOMBER' ? MATERIALS.bomber : MATERIALS.walker));
        
        const bodyMat = isBoss ? new THREE.MeshStandardMaterial({ color: typeData.color }) : mat;
        
        const body = new THREE.Mesh(GEOMETRY.human, bodyMat);
        
        let scale = isTank ? 1.5 : 1.0;
        if (isBoss && typeData.scale) scale = typeData.scale;

        body.position.y = 1.0 * scale; 
        body.scale.setScalar(scale); 
        body.castShadow = true;
        
        body.userData = { isBody: true, baseY: body.position.y }; 
        
        group.add(body);
        return group;
    },

    createCorpse: (sourceMesh: THREE.Group): THREE.Group => {
        const corpse = sourceMesh.clone();
        corpse.userData = { isCorpse: true };
        
        // Check if the source mesh has already "fallen" (rotation.x is roughly -90 deg / -1.57 rad)
        // If it was a physics death, it's already lying down. Preserve that exact pose.
        // If it was an instant death (standing), force it to lie down.
        const isLyingDown = Math.abs(sourceMesh.rotation.x + Math.PI / 2) < 0.5;

        if (!isLyingDown) {
            corpse.rotation.x = -Math.PI / 2;
            corpse.rotation.z = Math.random() * Math.PI * 2; // Randomize only if we forced the fall
        }
        
        // Ensure strictly flat on ground level to prevent floating or clipping
        corpse.position.y = 0.2; 

        corpse.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.material = child.material.clone();
                child.material.color.multiplyScalar(0.5);
            }
        });
        return corpse;
    }
};
