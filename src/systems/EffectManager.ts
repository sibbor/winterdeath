import * as THREE from 'three';

export type EffectType = 'fire' | 'flicker_light' | 'smoke_plume' | 'neon_sign';

// --- PRE-ALLOCATED CONSTANTS ---
const VEC_UP_05 = new THREE.Vector3(0, 0.5, 0);
const VEC_UP_1 = new THREE.Vector3(0, 1, 0);
const VEC_UP_15 = new THREE.Vector3(0, 1.5, 0);
const VEC_UP_2 = new THREE.Vector3(0, 2, 0);
const VEC_NEON = new THREE.Vector3(0, 0, 0.5);
const VEC_ZERO = new THREE.Vector3(0, 0, 0);

// --- PERFORMANCE SCRATCHPADS ---
// [VINTERDÖD] Används endast lokalt för att bypassa kloning, 
// men eftersom vi sparar objekt i userData behöver vi ibland instansiera
// en dedikerad vektor om ett offset var angivet.
function createOffset(baseVec: THREE.Vector3, optOffset?: THREE.Vector3): THREE.Vector3 {
    if (optOffset) {
        return new THREE.Vector3(
            optOffset.x + baseVec.x,
            optOffset.y + baseVec.y,
            optOffset.z + baseVec.z
        );
    }
    return baseVec;
}

export class EffectManager {
    static attachEffect(object: THREE.Object3D, type: EffectType, opts?: any) {
        if (!object.userData.effects) object.userData.effects = [];
        const effects = object.userData.effects;

        switch (type) {
            case 'fire':
                object.userData.isFire = true;

                // [VINTERDÖD] Bypass .clone().add() genom platt matematisk konstruktor 
                // Endast minnesallokering sker för det fasta objektet vi sparar.
                const offset05 = createOffset(VEC_UP_05, opts?.offset);
                const offset1 = createOffset(VEC_UP_1, opts?.offset);

                const isLarge = opts?.onRoof || (opts?.area && opts.area.x * opts.area.z > 20);
                const firePart = isLarge ? 'large_fire' : 'flame';
                const smokePart = isLarge ? 'large_smoke' : 'smoke';

                // Scale spawn rates relative to massive roofs
                const largeCount = isLarge ? (opts?.area ? Math.max(2, Math.floor((opts.area.x * opts.area.z) / 25)) : 3) : 1;
                const fireInterval = isLarge ? 25 : 50;
                const sparkInterval = isLarge ? 60 : 150;
                const smokeInterval = isLarge ? 50 : 200;

                effects.push(
                    { type: 'light', color: 0xff7722, intensity: opts?.intensity || 40, distance: opts?.distance || 50, offset: opts?.offset || VEC_UP_1, flicker: true },
                    { type: 'emitter', particle: firePart, interval: fireInterval, count: largeCount, offset: offset05, spread: 0.3, color: 0xffaa00, area: opts?.area },
                    { type: 'emitter', particle: 'spark', interval: sparkInterval, count: largeCount, offset: offset1, spread: 0.4, color: 0xffdd00, area: opts?.area }
                );
                if (opts?.smoke) {
                    effects.push({ type: 'emitter', particle: smokePart, interval: smokeInterval, count: largeCount, offset: VEC_UP_15, spread: 0.3, area: opts?.area });
                }
                break;

            case 'flicker_light':
                effects.push({ type: 'light', color: opts?.color || 0xffffaa, intensity: opts?.intensity || 20, distance: opts?.distance || 30, flicker: true, offset: opts?.offset || VEC_UP_2 });
                break;

            case 'neon_sign':
                effects.push({ type: 'light', color: opts?.color || 0x00ffff, intensity: opts?.intensity || 15, distance: opts?.distance || 20, flicker: false, offset: opts?.offset || VEC_NEON });
                break;

            case 'smoke_plume':
                effects.push({ type: 'emitter', particle: 'black_smoke', interval: opts?.interval || 100, count: 1, offset: opts?.offset || VEC_ZERO, spread: opts?.spread || 20 });
                break;
        }
    }

}