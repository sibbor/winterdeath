import * as THREE from 'three';
import { CAMERA_HEIGHT } from '../../content/constants';

export const CameraSystem = {
    update: (
        camera: THREE.Camera,
        targetPos: THREE.Vector3,
        offsetZ: number,
        state: { cameraShake: number, hurtShake: number },
        isCinematic: boolean,
        delta: number,
        angle: number = 0, // New parameter for rotation
        heightModifier: number = 0 // New parameter for pitch
    ) => {
        if (isCinematic) return;

        // Base Follow with Rotation
        const offsetX = offsetZ * Math.sin(angle);
        const offsetZRotated = offsetZ * Math.cos(angle);

        const target = new THREE.Vector3(targetPos.x + offsetX, CAMERA_HEIGHT + heightModifier, targetPos.z + offsetZRotated);
        camera.position.lerp(target, 0.1);
        camera.lookAt(targetPos);

        // Shake Effects
        if (state.hurtShake > 0) {
            state.hurtShake -= 2.0 * delta; // Decay
            if (state.hurtShake < 0) state.hurtShake = 0;

            const shakeAmount = state.hurtShake * 0.5;
            camera.position.x += (Math.random() - 0.5) * shakeAmount;
            camera.position.z += (Math.random() - 0.5) * shakeAmount;
        }

        if (state.cameraShake > 0) {
            state.cameraShake -= 5.0 * delta;
            if (state.cameraShake < 0) state.cameraShake = 0;

            const shake = state.cameraShake * 0.5;
            camera.position.x += (Math.random() - 0.5) * shake;
            camera.position.z += (Math.random() - 0.5) * shake;
        }
    }
};
