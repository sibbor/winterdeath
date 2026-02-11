
import * as THREE from 'three';

// Define standardized effects
export type EffectType = 'fire' | 'flicker_light' | 'smoke_plume' | 'neon_sign';

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
                object.userData.isFire = true;
                object.userData.effects.push(
                    { type: 'light', color: 0xff7722, intensity: opts?.intensity || 40, distance: opts?.distance || 50, offset: opts?.offset || new THREE.Vector3(0, 1, 0), flicker: true },
                    { type: 'emitter', particle: 'campfire_flame', interval: 50, count: 1, offset: (opts?.offset ? opts.offset.clone().add(new THREE.Vector3(0, 0.5, 0)) : new THREE.Vector3(0, 0.5, 0)), spread: 0.3, color: 0xffaa00, area: opts?.area },
                    { type: 'emitter', particle: 'campfire_spark', interval: 150, count: 1, offset: opts?.offset ? opts.offset.clone().add(new THREE.Vector3(0, 0.5, 0)) : new THREE.Vector3(0, 1.0, 0), spread: 0.4, color: 0xffdd00, area: opts?.area }
                );
                // If it needs smoke too
                if (opts?.smoke) {
                    object.userData.effects.push(
                        { type: 'emitter', particle: 'black_smoke', interval: 200, count: 1, offset: new THREE.Vector3(0, 1.5, 0), spread: 0.3, area: opts?.area }
                    );
                }
                break;

            case 'flicker_light':
                object.userData.effects.push({
                    type: 'light',
                    color: opts?.color || 0xffffaa,
                    intensity: opts?.intensity || 20,
                    distance: opts?.distance || 30,
                    flicker: true,
                    offset: opts?.offset || new THREE.Vector3(0, 2, 0)
                });
                break;

            case 'neon_sign':
                object.userData.effects.push({
                    type: 'light',
                    color: opts?.color || 0x00ffff,
                    intensity: opts?.intensity || 15,
                    distance: opts?.distance || 20,
                    flicker: false,
                    offset: opts?.offset || new THREE.Vector3(0, 0, 0.5)
                });
                break;

            case 'smoke_plume':
                object.userData.effects.push({
                    type: 'emitter',
                    particle: 'black_smoke',
                    interval: opts?.interval || 100,
                    count: 1,
                    offset: opts?.offset || new THREE.Vector3(0, 0, 0),
                    spread: opts?.spread || 20
                });
                break;
        }
    }
}
