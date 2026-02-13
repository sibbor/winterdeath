import * as THREE from 'three';
import { CAMERA_HEIGHT } from '../../content/constants';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
// Pre-allocated vector used to avoid memory allocation every frame
const _v1 = new THREE.Vector3();

export const CameraSystem = {
    /**
     * Updates the camera position and orientation.
     * Uses linear interpolation (lerp) for smoothness and applies shake effects.
     */
    update: (
        camera: THREE.Camera,
        targetPos: THREE.Vector3,
        offsetZ: number,
        state: { cameraShake: number, hurtShake: number },
        isCinematic: boolean,
        delta: number,
        angle: number = 0,
        heightModifier: number = 0
    ) => {
        if (isCinematic) return;

        // 1. Calculate rotated offsets
        // sin/cos determine the X/Z position relative to the target based on the rotation angle
        const offsetX = offsetZ * Math.sin(angle);
        const offsetZRotated = offsetZ * Math.cos(angle);

        // 2. Set the ideal target position into our scratchpad vector (Zero-GC)
        _v1.set(
            targetPos.x + offsetX,
            CAMERA_HEIGHT + heightModifier,
            targetPos.z + offsetZRotated
        );

        // 3. Smoothly move camera toward the target
        // lerp(target, alpha) where alpha 0.1 provides a soft follow effect
        camera.position.lerp(_v1, 0.1);

        // 4. Face the camera toward the player/target object
        camera.lookAt(targetPos);

        // 5. Apply Camera Shake Effects (Hurt & Environmental)

        // Handle Damage Shake (High intensity, fast decay)
        if (state.hurtShake > 0) {
            state.hurtShake = Math.max(0, state.hurtShake - 2.0 * delta);
            const amt = state.hurtShake * 0.5;
            // Direct position modification for immediate visual feedback
            camera.position.x += (Math.random() - 0.5) * amt;
            camera.position.z += (Math.random() - 0.5) * amt;
        }

        // Handle General Camera Shake (Explosions, etc.)
        if (state.cameraShake > 0) {
            state.cameraShake = Math.max(0, state.cameraShake - 5.0 * delta);
            const amt = state.cameraShake * 0.5;
            camera.position.x += (Math.random() - 0.5) * amt;
            camera.position.z += (Math.random() - 0.5) * amt;
        }
    }
};