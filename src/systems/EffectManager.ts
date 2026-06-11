import * as THREE from 'three';
import { FXParticleType } from '../types/FXTypes';

export enum EffectType {
    NONE = 0,
    FIRE = 1,
    FLICKER_LIGHT = 2,
    NEON_SIGN = 3,
    SMOKE_PLUME = 4,
    WAVE_AURA = 5
}

export enum SubEffectType {
    NONE = 0,
    LIGHT = 1,
    EMITTER = 2
}

// --- ZERO-GC SOA POOL ---
const MAX_SUB_EFFECTS = 8192;

export const EffectPool = {
    activeCount: 0,
    // Store references to targets. MUST be cleared on sector change to avoid memory leaks
    target: new Array<THREE.Object3D | null>(MAX_SUB_EFFECTS),

    // Flat primitive buffers
    type: new Uint8Array(MAX_SUB_EFFECTS),
    color: new Uint32Array(MAX_SUB_EFFECTS),
    intensity: new Float32Array(MAX_SUB_EFFECTS),
    distance: new Float32Array(MAX_SUB_EFFECTS),

    // Vector3 decomposed into floats
    offsetX: new Float32Array(MAX_SUB_EFFECTS),
    offsetY: new Float32Array(MAX_SUB_EFFECTS),
    offsetZ: new Float32Array(MAX_SUB_EFFECTS),

    particleType: new Uint8Array(MAX_SUB_EFFECTS),
    interval: new Float32Array(MAX_SUB_EFFECTS),
    count: new Uint8Array(MAX_SUB_EFFECTS),
    spread: new Float32Array(MAX_SUB_EFFECTS),

    // Vector2 area decomposed into floats
    areaX: new Float32Array(MAX_SUB_EFFECTS),
    areaZ: new Float32Array(MAX_SUB_EFFECTS),

    flicker: new Uint8Array(MAX_SUB_EFFECTS) // 0 or 1
};

/**
 * O(1) Pool Sanitization
 * Clears the effect pool instantly. Nullifies object references to allow GC.
 */
export function clearEffects(): void {
    const count = EffectPool.activeCount;
    EffectPool.activeCount = 0;
    for (let i = 0; i < count; i++) {
        EffectPool.target[i] = null;
    }
}

/**
 * Zero-GC Allocation
 * Writes primitive data directly to contiguous memory. No object instantiation.
 */
function allocateSubEffect(
    target: THREE.Object3D,
    type: SubEffectType,
    color: number = 0,
    intensity: number = 0,
    distance: number = 0,
    offsetX: number = 0,
    offsetY: number = 0,
    offsetZ: number = 0,
    flicker: number = 0,
    particleType: number = 0,
    interval: number = 0,
    count: number = 0,
    spread: number = 0,
    areaX: number = 0,
    areaZ: number = 0
): void {
    if (EffectPool.activeCount >= MAX_SUB_EFFECTS) {
        console.warn("[VFX] EffectPool capacity reached. Skipping effect allocation.");
        return;
    }

    const i = EffectPool.activeCount;

    EffectPool.target[i] = target;
    EffectPool.type[i] = type;
    EffectPool.color[i] = color;
    EffectPool.intensity[i] = intensity;
    EffectPool.distance[i] = distance;
    EffectPool.offsetX[i] = offsetX;
    EffectPool.offsetY[i] = offsetY;
    EffectPool.offsetZ[i] = offsetZ;
    EffectPool.flicker[i] = flicker;
    EffectPool.particleType[i] = particleType;
    EffectPool.interval[i] = interval;
    EffectPool.count[i] = count;
    EffectPool.spread[i] = spread;
    EffectPool.areaX[i] = areaX;
    EffectPool.areaZ[i] = areaZ;

    EffectPool.activeCount++;
}

export class EffectManager {
    /**
     * Parses high-level effect requests and allocates DoD SubEffects.
     * Guaranteed Zero-GC path. No array pushes or Vector allocations.
     */
    static attachEffect(object: THREE.Object3D, type: EffectType, opts?: any): void {
        if (!object) return;

        // Legacy compat: flag object if needed by other systems
        if (type === EffectType.FIRE) object.userData.isFire = true;

        // Extract primitives to avoid property lookups in switch
        const optOffX = opts?.offset?.x || 0;
        const optOffY = opts?.offset?.y || 0;
        const optOffZ = opts?.offset?.z || 0;
        const areaX = opts?.area?.x || 0;
        const areaZ = opts?.area?.z || 0;

        switch (type) {
            case EffectType.FIRE: {
                const isLarge = opts?.onRoof || (areaX * areaZ > 20);
                const firePart = isLarge ? FXParticleType.LARGE_FIRE : FXParticleType.FLAME;
                const smokePart = isLarge ? FXParticleType.LARGE_SMOKE : FXParticleType.SMOKE;

                // Scale spawn rates relative to massive roofs using primitives
                const largeCount = isLarge ? (opts?.area ? Math.max(2, Math.floor((areaX * areaZ) / 25)) : 3) : 1;
                const fireInterval = isLarge ? 25 : 50;
                const sparkInterval = isLarge ? 60 : 150;
                const smokeInterval = isLarge ? 50 : 200;

                // Light: Base offset Y + 1.0
                allocateSubEffect(object, SubEffectType.LIGHT, 0xff7722, opts?.intensity || 40, opts?.distance || 50, optOffX, optOffY + 1.0, optOffZ, 1);

                // Fire Emitter: Base offset Y + 0.5
                allocateSubEffect(object, SubEffectType.EMITTER, 0xffaa00, 0, 0, optOffX, optOffY + 0.5, optOffZ, 0, firePart, fireInterval, largeCount, 0.3, areaX, areaZ);

                // Spark Emitter: Base offset Y + 1.0
                allocateSubEffect(object, SubEffectType.EMITTER, 0xffdd00, 0, 0, optOffX, optOffY + 1.0, optOffZ, 0, FXParticleType.SPARK, sparkInterval, largeCount, 0.4, areaX, areaZ);

                // Optional Smoke Emitter: Base offset Y + 1.5
                if (opts?.smoke) {
                    allocateSubEffect(object, SubEffectType.EMITTER, 0, 0, 0, optOffX, optOffY + 1.5, optOffZ, 0, smokePart, smokeInterval, largeCount, 0.3, areaX, areaZ);
                }
                break;
            }
            case EffectType.WAVE_AURA: {
                // Persistent blue glow for wave enemies
                allocateSubEffect(object, SubEffectType.LIGHT, 0x0088ff, 25, 6, optOffX, optOffY + 1.0, optOffZ, 1);
                break;
            }

            case EffectType.FLICKER_LIGHT:
                allocateSubEffect(object, SubEffectType.LIGHT, opts?.color || 0xffffaa, opts?.intensity || 20, opts?.distance || 30, optOffX, optOffY + 2.0, optOffZ, 1);
                break;

            case EffectType.NEON_SIGN:
                allocateSubEffect(object, SubEffectType.LIGHT, opts?.color || 0x00ffff, opts?.intensity || 15, opts?.distance || 20, optOffX, optOffY, optOffZ + 0.5, 0);
                break;

            case EffectType.SMOKE_PLUME:
                allocateSubEffect(object, SubEffectType.EMITTER, 0, 0, 0, optOffX, optOffY, optOffZ, 0, FXParticleType.BLACK_SMOKE, opts?.interval || 100, 1, opts?.spread || 20, areaX, areaZ);
                break;
        }
    }
}
