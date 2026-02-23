import * as THREE from 'three';
import { CAMERA_HEIGHT } from '../../content/constants';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _idealPos = new THREE.Vector3(); // Håller kamerans "sanna" mjuka position
let _initialized = false;

export const CameraSystem = {
    /**
     * Updates the camera position and orientation.
     * Uses frame-independent lerp for silken smoothness and safe shake isolation.
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

        // Första gången funktionen körs, synkronisera den ideala positionen med kameran
        if (!_initialized) {
            _idealPos.copy(camera.position);
            _initialized = true;
        }

        // 1. Calculate rotated offsets
        const offsetX = offsetZ * Math.sin(angle);
        const offsetZRotated = offsetZ * Math.cos(angle);

        // 2. Set the ideal target position into our scratchpad vector
        _v1.set(
            targetPos.x + offsetX,
            CAMERA_HEIGHT + heightModifier,
            targetPos.z + offsetZRotated
        );

        // 3. Framerate-Independent Lerp
        // 15.0 är kamerans "följsamhet". Öka siffran för en stelare kamera, minska för slappare/släpigare.
        const lerpFactor = 1.0 - Math.exp(-15.0 * delta);

        // Vi lerpar _idealPos, INTE kameran direkt. Detta isolerar vår mjuka rörelse från skak-effekter!
        _idealPos.lerp(_v1, lerpFactor);

        // 4. Applicera den perfekta positionen till kameran och titta på spelaren
        camera.position.copy(_idealPos);
        camera.lookAt(targetPos);

        // 5. Apply Camera Shake Effects
        // Genom att manipulera camera.position EFTER att vi sparar dess rena position,
        // får vi skaket visuellt utan att förstöra beräkningarna för nästa frame.
        if (state.hurtShake > 0) {
            state.hurtShake = Math.max(0, state.hurtShake - 2.0 * delta);
            const amt = state.hurtShake * 0.5;
            camera.position.x += (Math.random() - 0.5) * amt;
            camera.position.z += (Math.random() - 0.5) * amt;
        }

        if (state.cameraShake > 0) {
            state.cameraShake = Math.max(0, state.cameraShake - 5.0 * delta);
            const amt = state.cameraShake * 0.5;
            camera.position.x += (Math.random() - 0.5) * amt;
            camera.position.z += (Math.random() - 0.5) * amt;
        }
    },

    /**
     * Call this if you instantly teleport the player across the map, 
     * so the camera doesn't visually fly across the entire world to catch up.
     */
    snapToPlayer: (camera: THREE.Camera) => {
        _idealPos.copy(camera.position);
    }
};