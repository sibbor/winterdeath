
import * as THREE from 'three';

export const CameraSystem = {
    update: (
        camera: THREE.Camera,
        targetPos: THREE.Vector3,
        offsetZ: number,
        state: { cameraShake: number, hurtShake: number },
        isCinematic: boolean,
        delta: number
    ) => {
        if (isCinematic) return;

        // Base Follow
        const target = new THREE.Vector3(targetPos.x, 50, targetPos.z + offsetZ);
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
            if(state.cameraShake < 0) state.cameraShake = 0;
            
            const shake = state.cameraShake * 0.5;
            camera.position.x += (Math.random() - 0.5) * shake;
            camera.position.z += (Math.random() - 0.5) * shake;
        }
    }
};
