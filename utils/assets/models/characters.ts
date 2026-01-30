
import * as THREE from 'three';
import { GEOMETRY } from '../geometry';
import { MATERIALS } from '../materials';
import { PLAYER_CHARACTER } from '../../../constants';

export const CharacterModels = {
    createPlayer: (): THREE.Group => {
        const group = new THREE.Group();
        group.userData = { isPlayer: true };

        const body = new THREE.Mesh(
            GEOMETRY.human, 
            new THREE.MeshStandardMaterial({ color: PLAYER_CHARACTER.color })
        );
        body.position.y = 1.0; 
        body.castShadow = true; 
        // Add userData for animation system
        body.userData = { isBody: true, baseY: 1.0, baseScale: 1.0 };
        group.add(body);

        // Gun
        const gun = new THREE.Mesh(GEOMETRY.box, MATERIALS.gun); 
        gun.position.set(0, body.position.y, 1); 
        gun.scale.set(0.1, 0.4, 1); 
        group.add(gun);

        // Flashlight
        const light = new THREE.SpotLight(0xffffff, 400, 60, Math.PI / 6, 0.5, 1); 
        light.position.set(0, 0.2, 0.6); 
        light.target.position.set(0, 0, 10); 
        group.add(light); 
        group.add(light.target);

        return group;
    },

    createFamilyMember: (memberData: any): THREE.Group => {
        const group = new THREE.Group();
        const isAnimal = memberData.race === 'animal';
        const scale = (memberData.scale || 1.0) * (isAnimal ? 2.0 : 1.0); 

        const geo = isAnimal ? GEOMETRY.petBody : GEOMETRY.human;
        const mat = new THREE.MeshStandardMaterial({ color: memberData.color, roughness: 0.5 });
        
        const body = new THREE.Mesh(geo, mat);
        const geometryHeight = isAnimal ? 0.5 : 2.0;
        const baseY = geometryHeight / 2;
        
        body.position.y = baseY * scale;
        body.scale.setScalar(scale);
        body.castShadow = true;
        
        // Store baseScale for animation system restoration
        body.userData = { isBody: true, baseY: body.position.y, geometryHeight, baseScale: scale };

        if (isAnimal) {
            const tail = new THREE.Mesh(GEOMETRY.petTail, mat);
            body.add(tail);
        }

        const uniqueId = memberData.id !== 'player' ? `family_${memberData.id}` : `player_${memberData.name}`;
        group.userData = { 
            id: uniqueId, type: 'family', race: memberData.race, name: memberData.name, title: memberData.title, geometryHeight
        };

        group.add(body);
        return group;
    }
};
