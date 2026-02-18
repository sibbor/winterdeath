import * as THREE from 'three';
import { GEOMETRY } from '../geometry';
import { MATERIALS } from '../materials';
import { PLAYER_CHARACTER } from '../../../content/constants';

// --- SHARED RESOURCES (Skapas bara en gång) ---
let cachedLaserAssets: { geometry: THREE.BufferGeometry, material: THREE.Material } | null = null;

const getLaserAssets = () => {
    if (cachedLaserAssets) return cachedLaserAssets;

    // Skapa Texture (Canvas)
    const canvas = document.createElement('canvas');
    canvas.width = 2; // Räcker med 2px bredd för en vertikal gradient
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 256);

    // Vi ritar gradienten så att 0 är basen och 256 är spetsen
    grad.addColorStop(0, 'rgba(0, 170, 255, 1)');   // Bas (vid vapnet)
    grad.addColorStop(0.5, 'rgba(0, 170, 255, 1)'); // Håll full styrka till hälften
    grad.addColorStop(0.8, 'rgba(0, 170, 255, 0.3)'); // Börja tona ut
    grad.addColorStop(1, 'rgba(0, 170, 255, 0)');   // Helt genomskinlig spets

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 256);
    const texture = new THREE.CanvasTexture(canvas);

    // Skapa Geometry med ändrad pivot-punkt
    // Vi translaterar geometrin 15 enheter framåt så att Mesh-origin (0,0,0) 
    // hamnar i början av lasern istället för i mitten.
    const geometry = new THREE.PlaneGeometry(0.15, 20);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, 10);

    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    cachedLaserAssets = { geometry, material };
    return cachedLaserAssets;
};

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
        body.userData = { isBody: true, baseY: 1.0, baseScale: 1.0 };
        group.add(body);

        // Gun (Placerad lite till höger för att matcha hand)
        const gun = new THREE.Mesh(GEOMETRY.box, MATERIALS.gun);
        gun.position.set(0.3, 1.4, 0.5);
        gun.scale.set(0.1, 0.4, 1);
        group.add(gun);

        // Laser sight (Hämtar delade resurser)
        const assets = getLaserAssets();
        const laserSight = new THREE.Mesh(assets.geometry, assets.material);

        // Tack vare geometry.translate(0,0,15) kan vi nu sätta lasern
        // direkt på vapnets mynning. Z: 0.5 gör att den börjar vid mynningen.
        laserSight.position.set(0.3, 1.4, 0.5);

        // Viktigt för långa objekt i Three.js:
        // Förhindra att lasern försvinner om spelaren står precis utanför kameran
        laserSight.frustumCulled = false;
        laserSight.renderOrder = 999;
        (laserSight.material as THREE.Material).depthTest = false;

        laserSight.userData.isLaserSight = true;
        laserSight.name = 'laserSight';
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
        body.userData = { isBody: true, baseY: body.position.y, geometryHeight, baseScale: scale };

        group.scale.setScalar(scale);

        if (isAnimal) {
            const tail = new THREE.Mesh(GEOMETRY.petTail, mat);
            tail.castShadow = true;
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