import * as THREE from 'three';

/**
 * VINTERDÖD: FX System Types
 * 
 * Strict numeric enums (SMI) for performance-critical FX hot-paths.
 * These replace string literals to eliminate GC pressure and hash lookups.
 */

export enum FXParticleType {
    NONE = 0,
    FIRE,
    FLAME,
    LARGE_FIRE,
    SMOKE,
    LARGE_SMOKE,
    BLACK_SMOKE,
    SPARK,
    MUZZLE,
    FLASH,
    ELECTRIC_FLASH,
    ELECTRIC_BEAM,
    IMPACT,
    GROUND_IMPACT,
    DEBRIS,
    DEBRIS_TRAIL,
    GLASS,
    GORE,
    SPLASH,
    BLOOD_SPLATTER,
    BLOOD_SPLAT,
    IMPACT_SPLAT,
    CAMPFIRE_FLAME,
    CAMPFIRE_SPARK,
    CAMPFIRE_SMOKE,
    FLAMETHROWER_FIRE,
    SHOCKWAVE,
    FROST_NOVA,
    SCREECH_WAVE,
    MAGNETIC_SPARKS,
    BLAST_RADIUS,
    MUZZLE_FLASH,
    MUZZLE_SPARK,
    MUZZLE_SMOKE,
    ENEMY_EFFECT_STUN,
    ENEMY_EFFECT_FLAME,
    ENEMY_EFFECT_SPARK,
    SCRAP,
    MEAT
}

export enum FXDecalType {
    NONE = 0,
    SCORCH,
    SPLATTER,
    DECAL,
    BLOOD
}

/**
 * High-performance particle state container.
 * Pre-allocated in pools to ensure Zero-GC operation in hot-loops.
 */
export interface ParticleState {
    pos: THREE.Vector3;
    rot: THREE.Euler;
    scaleVec: THREE.Vector3;
    vel: THREE.Vector3;
    rotVel: THREE.Vector3;
    life: number;
    maxLife: number;
    type: FXParticleType; // Unified numeric type
    isPooled: boolean;
    isInstanced: boolean;
    isPhysics: boolean;
    landed: boolean;
    inUse: boolean;
    color?: number;
    _poolIdx: number;
}

/**
 * Generic request structure for FX spawning.
 * Used for both essential and ambient particle queues.
 */
export interface FXSpawnRequest {
    scene: THREE.Scene;
    x: number;
    y: number;
    z: number;
    type: FXParticleType | FXDecalType; // Can represent both systems in the queue
    customMesh?: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    customVel: THREE.Vector3;
    hasCustomVel: boolean;
    color?: number;
    scale?: number;
    life?: number;
    material?: THREE.Material;
}