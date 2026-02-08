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
        // Subtle breeze magnitude: 0.003 to 0.015
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

// --- Temp Objects for Performance (Reduce GC pressure) ---
const _tempVec1 = new THREE.Vector3();
const _tempVec2 = new THREE.Vector3();
const _tempMat = new THREE.Matrix4();
const _tempQuat = new THREE.Quaternion();

// Resolves collision between a moving entity (cylinder) and a static obstacle
export const resolveCollision = (
  entityPos: THREE.Vector3,
  entityRadius: number,
  obstacle: Obstacle,
  height: number = 2.0,
  centerOffset: number = 0 // 0 = entityPos is at feet, height/2 = entityPos is at center
): THREE.Vector3 | null => {
  if (!obstacle.mesh) return null;

  const entityMinY = entityPos.y - centerOffset;
  const entityMaxY = entityMinY + height;

  // 0. Broad-phase Check (Simple distance check)
  const dx_bp = entityPos.x - obstacle.mesh.position.x;
  const dy_bp = entityPos.y - obstacle.mesh.position.y;
  const dz_bp = entityPos.z - obstacle.mesh.position.z;

  // Safe buffer threshold
  let thresholdSq = 100;
  if (obstacle.collider?.type === 'box' && obstacle.collider.size) {
    const maxDim = Math.max(obstacle.collider.size.x, obstacle.collider.size.y, obstacle.collider.size.z);
    const safeDist = (maxDim * 0.75) + entityRadius + 2.0;
    thresholdSq = safeDist * safeDist;
  } else {
    const r = (obstacle.collider?.radius || obstacle.radius || 2.0) + entityRadius + 2.0;
    thresholdSq = r * r;
  }

  // Broad check in 3D
  const distSq_bp_3d = dx_bp * dx_bp + dy_bp * dy_bp + dz_bp * dz_bp;
  if (distSq_bp_3d > thresholdSq) return null;

  // 1. Box Collider (OBB)
  if (obstacle.collider && obstacle.collider.type === 'box' && obstacle.collider.size) {
    // Convert Entity Position to Obstacle's Local Space
    _tempMat.copy(obstacle.mesh.matrixWorld).invert();
    _tempVec1.copy(entityPos).applyMatrix4(_tempMat);

    // hX, hY, hZ are half-dimensions
    const hX = obstacle.collider.size.x / 2;
    const hY = obstacle.collider.size.y / 2;
    const hZ = obstacle.collider.size.z / 2;

    // Check if there is vertical overlap in world space (simpler for ground level)
    // For OBB we should technically do this in local space, but majority of boxes are axis-aligned in Y.
    // In local space, the box is from -hY to hY. 
    // We need the entity range in local space too.
    const entityMinY_local = _tempVec1.y - centerOffset;
    const entityMaxY_local = entityMinY_local + height;

    if (entityMaxY_local < -hY || entityMinY_local > hY) {
      return null; // No vertical overlap
    }

    const closestX = Math.max(-hX, Math.min(_tempVec1.x, hX));
    const closestZ = Math.max(-hZ, Math.min(_tempVec1.z, hZ));

    const dx = _tempVec1.x - closestX;
    const dz = _tempVec1.z - closestZ;
    const distSq = dx * dx + dz * dz;

    // INSIDE CHECK (X-Z only, since we confirmed Y overlap above)
    if (distSq < 0.0001) {
      const distToXP = hX - _tempVec1.x;
      const distToXM = _tempVec1.x + hX;
      const distToZP = hZ - _tempVec1.z;
      const distToZM = _tempVec1.z + hZ;

      const minDist = Math.min(distToXP, distToXM, distToZP, distToZM);

      if (minDist === distToXP) _tempVec2.set(distToXP + entityRadius, 0, 0);
      else if (minDist === distToXM) _tempVec2.set(-(distToXM + entityRadius), 0, 0);
      else if (minDist === distToZP) _tempVec2.set(0, 0, distToZP + entityRadius);
      else _tempVec2.set(0, 0, -(distToZM + entityRadius));

      return _tempVec2.applyQuaternion(obstacle.mesh.getWorldQuaternion(_tempQuat)).clone();
    }

    // Standard Outside Collision (X-Z only)
    if (distSq < entityRadius * entityRadius) {
      const dist = Math.sqrt(distSq);
      const overlap = entityRadius - dist;

      _tempVec2.set(dx, 0, dz).normalize().multiplyScalar(overlap);
      return _tempVec2.applyQuaternion(obstacle.mesh.getWorldQuaternion(_tempQuat)).clone();
    }
    return null;
  }

  // 2. Cylinder/Sphere Collider (Fallback or Explicit)
  const obsRadius = (obstacle.collider?.radius) || (obstacle.radius) || 1.0;
  const minDist = entityRadius + obsRadius;

  // Check vertical overlap for sphere
  const obsMinY = obstacle.mesh.position.y - obsRadius;
  const obsMaxY = obstacle.mesh.position.y + obsRadius;
  if (entityMaxY < obsMinY || entityMinY > obsMaxY) {
    return null; // No vertical overlap
  }

  // Check XZ distance only if we have vertical overlap
  const distSq_XZ = dx_bp * dx_bp + dz_bp * dz_bp;
  if (distSq_XZ < minDist * minDist) {
    const dist = Math.sqrt(distSq_XZ);
    const overlap = minDist - dist;

    if (dist < 0.0001) {
      // Exactly at center? Push out along world X
      return new THREE.Vector3(minDist, 0, 0);
    }

    return new THREE.Vector3(dx_bp / dist, 0, dz_bp / dist).multiplyScalar(overlap);
  }

  return null;
};