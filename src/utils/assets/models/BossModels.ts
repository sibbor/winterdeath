
import * as THREE from 'three';
import { GEOMETRY } from '../geometry';
import { MATERIALS } from '../materials';

export const BossModels = {
    createBoss: (typeKey: string, bossData: any): THREE.Group => {
        const group = new THREE.Group();

        // Bosses use the same generic zombie material but tinted to their specific color
        const bodyMat = MATERIALS.zombie.clone() as THREE.MeshStandardMaterial;
        bodyMat.color.set(bossData.color);

        const body = new THREE.Mesh(GEOMETRY.zombie, bodyMat);

        const scale = bossData.scale || 3.0; // Bosses are typically larger
        const widthScale = bossData.widthScale || 1.0;

        body.position.y = 1.0; // Pivot is centered in LatheGeometry (-1 to 1)
        body.castShadow = true;

        body.userData = { isBody: true, baseY: body.position.y };

        group.scale.set(widthScale * scale, scale, widthScale * scale);
        group.add(body);

        return group;
    }
};
