import * as THREE from 'three';
import { GEOMETRY } from '../geometry';
import { MATERIALS } from '../materials';
import { TEXTURES } from '../../assets';
import { PLAYER_CHARACTER } from '../../../content/constants';

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

        // Laser sight (attached like flashlight - relative position, inherits rotation)
        // Blue laser with fade at the tip (last ~10% = 3m of 30m)
        const laserCanvas = document.createElement('canvas');
        laserCanvas.width = 32; laserCanvas.height = 256;
        const lCtx = laserCanvas.getContext('2d')!;
        const lg = lCtx.createLinearGradient(0, 0, 0, 256);
        lg.addColorStop(0, 'rgba(0, 170, 255, 0)'); // Tip (transparent)
        lg.addColorStop(0.1, 'rgba(0, 170, 255, 0.3)'); // 3m fade zone
        lg.addColorStop(0.15, 'rgba(0, 170, 255, 1)'); // Full brightness
        lg.addColorStop(1, 'rgba(0, 170, 255, 1)'); // Base (full blue)
        lCtx.fillStyle = lg;
        lCtx.fillRect(0, 0, 32, 256);
        const laserTex = new THREE.CanvasTexture(laserCanvas);

        const laserGeo = new THREE.PlaneGeometry(0.15, 30);
        const laserMat = new THREE.MeshBasicMaterial({
            map: laserTex,
            color: 0xffffff, // Use map colors
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        });

        const laserSight = new THREE.Mesh(laserGeo, laserMat);
        // Position relative to player - 30m long, so center at 15m forward
        laserSight.position.set(0, 1.0, 16); // Gun height, centered at 16m forward
        laserSight.rotation.x = -Math.PI / 2; // Horizontal plane
        laserSight.visible = true; // Always visible when player is active
        laserSight.userData.isLaserSight = true;
        group.add(laserSight);

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

        body.position.y = baseY;
        body.castShadow = true;

        // Store baseScale for animation system restoration
        body.userData = { isBody: true, baseY: body.position.y, geometryHeight, baseScale: scale };

        group.scale.setScalar(scale);

        if (isAnimal) {
            const tail = new THREE.Mesh(GEOMETRY.petTail, mat);
            body.add(tail);
        }

        const uniqueId = memberData.id !== 'player' ? `family_${memberData.id}` : `player_${memberData.name}`;
        group.userData = {
            id: uniqueId,
            type: 'family',
            race: memberData.race,
            name: memberData.name,
            title: memberData.title,
            geometryHeight,
            isFamilyMember: true
        };

        group.add(body);
        return group;
    }
};
