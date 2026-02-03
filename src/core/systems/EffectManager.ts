
import * as THREE from 'three';

// Define standardized effects
export type EffectType = 'fire' | 'flicker_light' | 'smoke_plume';

export class EffectManager {
    /**
     * Attaches a standardized effect to any 3D Object.
     * The GameSession loop will automatically pick this up and animate it.
     */
    static attachEffect(object: THREE.Object3D, type: EffectType, opts?: any) {
        if (!object.userData.effects) object.userData.effects = [];

        switch (type) {
            case 'fire':
                // Standard Fire Effect (Light + Particles)
                object.userData.isFire = true; // Tag for potential logic interactions
                object.userData.effects.push(
                    { type: 'light', color: 0xff7722, intensity: 10, distance: 15, offset: new THREE.Vector3(0, 1, 0), flicker: true },
                    { type: 'emitter', particle: 'campfire_flame', interval: 50, count: 1, offset: new THREE.Vector3(0, 0.5, 0), spread: 0.3, color: 0xffaa00 },
                    { type: 'emitter', particle: 'campfire_spark', interval: 150, count: 1, offset: new THREE.Vector3(0, 1.0, 0), spread: 0.4, color: 0xffdd00 }
                );
                // If it needs smoke too
                if (opts?.smoke) {
                    object.userData.effects.push(
                        { type: 'emitter', particle: 'black_smoke', interval: 200, count: 1, offset: new THREE.Vector3(0, 1.5, 0), spread: 0.3 }
                    );
                }
                break;

            case 'flicker_light':
                object.userData.effects.push({
                    type: 'light',
                    color: opts?.color || 0xffffaa,
                    intensity: opts?.intensity || 5,
                    distance: opts?.distance || 10,
                    flicker: true,
                    offset: opts?.offset || new THREE.Vector3(0, 2, 0)
                });
                break;

            case 'smoke_plume':
                object.userData.effects.push({
                    type: 'emitter',
                    particle: 'black_smoke',
                    interval: opts?.interval || 150,
                    count: 1,
                    offset: opts?.offset || new THREE.Vector3(0, 0, 0),
                    spread: opts?.spread || 0.5
                });
                break;
        }
    }
}
