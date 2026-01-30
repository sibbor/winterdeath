
import * as THREE from 'three';

export interface Enemy {
    mesh: THREE.Group;
    type: string;
    hp: number;
    maxHp?: number; 
    speed: number;
    damage: number;
    score: number;
    attackCooldown: number;
    fleeing: boolean;
    lastKnockback: number;
    isBoss?: boolean;
    dead?: boolean;
    hitTime: number; 
    color: number; 
    originalScale: number;
    
    // Status Effects
    isBurning: boolean;
    burnTimer: number; 
    afterburnTimer: number; 
    isBlinded: boolean;
    blindUntil: number; 
    slowTimer: number;

    // Death Animation State
    deathState: 'alive' | 'dying_ash' | 'dead' | 'falling';
    deathTimer: number;
    deathVel?: THREE.Vector3; // Velocity during death fall
    velocity: THREE.Vector3; // Current movement velocity
    lastTrailPos?: THREE.Vector3; // For spacing blood trail
    
    // Physics
    fallForward?: boolean; // Direction of fall
    bloodSpawned?: boolean; // If death blood pool has been spawned
}
