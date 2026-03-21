import * as THREE from 'three';
import { GEOMETRY } from '../geometry';
import { MATERIALS } from '../materials';
import { PLAYER_CHARACTER, FLASHLIGHT } from '../../../content/constants';

// --- SHARED RESOURCES (Skapas bara en gång) ---
let cachedLaserAssets: { geometry: THREE.BufferGeometry, material: THREE.Material } | null = null;

const getLaserAssets = () => {
    if (cachedLaserAssets) return cachedLaserAssets;

    // Create Texture (Canvas)
    const canvas = document.createElement('canvas');
    canvas.width = 2; // Sufficient with 2px width for a vertical gradient
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 256);

    // We draw the gradient so that 0 is the base and 256 is the tip
    grad.addColorStop(0, 'rgba(0, 170, 255, 1)');   // Base (at the weapon)
    grad.addColorStop(0.5, 'rgba(0, 170, 255, 1)'); // Keep full strength to halfway
    grad.addColorStop(0.8, 'rgba(0, 170, 255, 0.3)'); // Start to fade out
    grad.addColorStop(1, 'rgba(0, 170, 255, 0)');   // Completely transparent tip

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 256);
    const texture = new THREE.CanvasTexture(canvas);

    // Create geometry with changed pivot point
    // Translate the geometry 15 units forward so that the Mesh-origin (0,0,0) 
    // ends up at the beginning of the laser instead of in the middle.
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
    // Protect this singleton from being purged on respawn
    material.userData = { isSharedAsset: true };

    cachedLaserAssets = { geometry, material };
    return cachedLaserAssets;
};

export const CharacterModels = {

    createFlashlight: (): THREE.SpotLight => {
        const flashlight = new THREE.SpotLight(
            FLASHLIGHT.color,
            FLASHLIGHT.intensity,
            FLASHLIGHT.distance,
            FLASHLIGHT.angle,
            FLASHLIGHT.penumbra,
            FLASHLIGHT.decay
        );
        flashlight.name = FLASHLIGHT.name;
        flashlight.position.set(FLASHLIGHT.position.x, FLASHLIGHT.position.y, FLASHLIGHT.position.z);
        flashlight.target.position.set(FLASHLIGHT.targetPosition.x, FLASHLIGHT.targetPosition.y, FLASHLIGHT.targetPosition.z);
        flashlight.target.name = FLASHLIGHT.name + '_target';
        flashlight.castShadow = FLASHLIGHT.castShadows;
        flashlight.shadow.camera.near = FLASHLIGHT.cameraNear;
        flashlight.shadow.camera.far = FLASHLIGHT.cameraFar;
        flashlight.shadow.bias = FLASHLIGHT.shadowBias;

        // Tag for discovery and shadow budgeting
        // isPlayer: true prevents GameSession from setting matrixAutoUpdate = false
        flashlight.userData.isFlashlight = true;
        flashlight.userData.isPlayer = true;
        flashlight.target.userData.isPlayer = true;

        return flashlight;
    },

    createPlayer: (): THREE.Group => {
        const group = new THREE.Group();
        group.userData = {
            isPlayer: true,
            id: `player_${PLAYER_CHARACTER.name}`,
            baseScale: 1.0,
            baseY: 0
        };

        const body = new THREE.Mesh(
            GEOMETRY.human,
            new THREE.MeshStandardMaterial({ color: PLAYER_CHARACTER.color })
        );
        body.position.y = 1.0;
        body.castShadow = true;
        body.userData = { isBody: true, isPlayer: true, baseY: 1.0, baseScale: 1.0 };
        group.add(body);

        // Gun (placed a bit to the right to match the hand)
        const gun = new THREE.Mesh(GEOMETRY.box, MATERIALS.gun);
        gun.name = 'gun';
        gun.position.set(0.3, 0.4, 0.5); // Adjust Y relative to body origin (0 is center of 2.0h capsule)
        gun.scale.set(0.1, 0.4, 1);
        body.add(gun);

        // Laser sight (gets shared resources)
        const assets = getLaserAssets();
        const laserSight = new THREE.Mesh(assets.geometry, assets.material);
        laserSight.position.set(0.3, 0.4, 0.5);

        laserSight.frustumCulled = false;
        laserSight.renderOrder = 999;
        (laserSight.material as THREE.Material).depthTest = false;

        laserSight.userData.isLaserSight = true;
        laserSight.name = 'laserSight';
        body.add(laserSight);

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
        // Added metadata so PlayerAnimator.update can properly offset and pulse the body
        body.userData = {
            isBody: true,
            geometryHeight,
            baseY: baseY,
            baseScale: 1.0
        };

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
            isFamilyMember: true,
            baseScale: scale, // Metadata for PlayerAnimator
            baseY: 0          // Group sits at floor level
        };

        group.add(body);
        return group;
    }
};