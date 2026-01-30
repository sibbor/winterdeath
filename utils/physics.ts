import * as THREE from 'three';

export class WindSystem {
  current: THREE.Vector2;
  target: THREE.Vector2;
  nextChange: number;

  constructor() {
    this.current = new THREE.Vector2(0, 0);
    this.target = new THREE.Vector2(0, 0);
    this.nextChange = 0;
  }

  update(now: number): THREE.Vector2 {
    if (now > this.nextChange) {
      if (Math.random() > 0.4) {
        // Wind picks up
        const angle = Math.random() * Math.PI * 2;
        // Subtle breeze magnitude: 0.003 to 0.018
        const strength = 0.003 + Math.random() * 0.015;
        this.target.set(Math.cos(angle) * strength, Math.sin(angle) * strength);
      } else {
        // Calm
        this.target.set(0, 0);
      }
      // Change wind every 3 to 8 seconds
      this.nextChange = now + 3000 + Math.random() * 5000;
    }

    // Smoothly interpolate current wind towards target
    // Low lerp factor for sluggish, airy movement
    this.current.lerp(this.target, 0.01);
    
    return this.current;
  }
}

// --- Collision System ---

export type ColliderType = 'sphere' | 'box';

export interface ColliderData {
    type: ColliderType;
    radius?: number; // For sphere
    size?: THREE.Vector3; // For box (Full Width, Height, Depth)
}

export interface Obstacle {
    mesh: THREE.Object3D;
    radius?: number; // Legacy/Fallback
    collider?: ColliderData;
    id?: string;
}

// Resolves collision between a moving sphere (entity) and a static obstacle
export const resolveCollision = (entityPos: THREE.Vector3, entityRadius: number, obstacle: Obstacle): THREE.Vector3 | null => {
    // 1. Box Collider (OBB)
    if (obstacle.collider && obstacle.collider.type === 'box' && obstacle.collider.size) {
        // Convert Entity Position to Obstacle's Local Space
        const invMatrix = obstacle.mesh.matrixWorld.clone().invert();
        const localPos = entityPos.clone().applyMatrix4(invMatrix);

        // AABB check in local space
        // Half-extents
        const hX = obstacle.collider.size.x / 2;
        const hZ = obstacle.collider.size.z / 2;
        
        // Find closest point on the box to the entity center
        const closestX = Math.max(-hX, Math.min(localPos.x, hX));
        const closestZ = Math.max(-hZ, Math.min(localPos.z, hZ));
        
        // We only care about X/Z plane for top-down collision
        const dx = localPos.x - closestX;
        const dz = localPos.z - closestZ;
        
        const distSq = dx*dx + dz*dz;
        
        // Check collision
        if (distSq < entityRadius * entityRadius && distSq > 0.000001) {
            const dist = Math.sqrt(distSq);
            const overlap = entityRadius - dist;
            
            // Push vector in local space
            const pushLocal = new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(overlap);
            
            // Transform push vector back to World Space (Rotate only, scale is assumed 1 for logic simplicity)
            const pushWorld = pushLocal.applyQuaternion(obstacle.mesh.quaternion);
            
            return pushWorld;
        }
        return null;
    }

    // 2. Cylinder/Sphere Collider (Fallback or Explicit)
    const obsRadius = (obstacle.collider?.radius) || (obstacle.radius) || 1.0;
    const dx = entityPos.x - obstacle.mesh.position.x;
    const dz = entityPos.z - obstacle.mesh.position.z;
    const distSq = dx*dx + dz*dz;
    const minDist = entityRadius + obsRadius;
    
    if (distSq < minDist * minDist && distSq > 0.00001) {
        const dist = Math.sqrt(distSq);
        const overlap = minDist - dist;
        return new THREE.Vector3(dx/dist, 0, dz/dist).multiplyScalar(overlap);
    }

    return null;
};