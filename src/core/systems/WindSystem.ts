import * as THREE from 'three';

/**
 * WindSystem manages global environment forces.
 * Optimized to update shader uniforms without expensive scene traversal.
 */
export class WindSystem {
  public current = new THREE.Vector2(0, 0);
  public direction = new THREE.Vector3(0, 0, 0);
  public strength: number = 0;

  private target = new THREE.Vector2(0, 0);
  private nextChange: number = 0;
  // Cache materials directly to avoid frame-by-frame traversal
  private activeMaterials = new Set<THREE.ShaderMaterial>();

  constructor() { }

  /**
   * Registers an object's materials for wind animation.
   * Scans the object once and stores shader references.
   */
  register(obj: THREE.Object3D) {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
        this.activeMaterials.add(child.material);
      }
    });
  }

  /**
   * Unregisters an object to free up memory.
   */
  unregister(obj: THREE.Object3D) {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
        this.activeMaterials.delete(child.material);
      }
    });
  }

  /**
   * Updates wind state and pushes data to GPU uniforms.
   */
  update(now: number, deltaTime: number = 0.016): THREE.Vector2 {
    if (now > this.nextChange) {
      if (Math.random() > 0.4) {
        const angle = Math.random() * Math.PI * 2;
        const strength = 0.003 + Math.random() * 0.015;
        this.target.set(Math.cos(angle) * strength, Math.sin(angle) * strength);
      } else {
        this.target.set(0, 0);
      }
      this.nextChange = now + 3000 + Math.random() * 5000;
    }

    // Smooth interpolation
    this.current.lerp(this.target, 0.01);
    this.direction.set(this.current.x, 0, this.current.y);
    this.strength = this.current.length();

    // Batch update all registered materials
    const timeSec = now / 1000.0;
    const windStrScaled = this.strength * 10;

    this.activeMaterials.forEach(mat => {
      if (mat.uniforms.time) mat.uniforms.time.value = timeSec;
      if (mat.uniforms.windStrength) mat.uniforms.windStrength.value = windStrScaled;
      if (mat.uniforms.windDirection) {
        mat.uniforms.windDirection.value.set(this.direction.x, this.direction.z);
      }
    });

    return this.current;
  }
}

// --- Collision System Types ---

export type ColliderType = 'sphere' | 'box';

export interface ColliderData {
  type: ColliderType;
  radius?: number;
  size?: THREE.Vector3; // Full dimensions
}

export interface Obstacle {
  mesh: THREE.Object3D;
  radius?: number;
  collider?: ColliderData;
  id?: string;
}

// --- PERFORMANCE SCRATCHPADS ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m1 = new THREE.Matrix4();
const _q1 = new THREE.Quaternion();

/**
 * Resolves collision between a moving entity and a static obstacle.
 * Modifies entityPos IN-PLACE to ensure Zero-GC performance.
 */
export const applyCollisionResolution = (
  entityPos: THREE.Vector3,
  entityRadius: number,
  obstacle: Obstacle,
  height: number = 2.0,
  centerOffset: number = 0
): boolean => {
  if (!obstacle.mesh) return false;

  // 0. High-Speed Broad-phase Check
  const dx_bp = entityPos.x - obstacle.mesh.position.x;
  const dz_bp = entityPos.z - obstacle.mesh.position.z;
  const distSq_XZ = dx_bp * dx_bp + dz_bp * dz_bp;

  // Fast radius-based discard
  const checkRadius = (obstacle.collider?.radius || obstacle.radius || 2.0) + entityRadius + 1.0;
  if (distSq_XZ > checkRadius * checkRadius) return false;

  // Vertical overlap check
  const entityMinY = entityPos.y - centerOffset;
  const entityMaxY = entityMinY + height;
  const obsY = obstacle.mesh.position.y;

  // 1. Box Collider (Oriented Bounding Box)
  if (obstacle.collider?.type === 'box' && obstacle.collider.size) {
    const size = obstacle.collider.size;

    // Transform entity to box local space
    _m1.copy(obstacle.mesh.matrixWorld).invert();
    _v1.copy(entityPos).applyMatrix4(_m1);

    const hX = size.x * 0.5;
    const hY = size.y * 0.5;
    const hZ = size.z * 0.5;

    // Local Y check
    if (_v1.y + height < -hY || _v1.y > hY) return false;

    // Find closest point on box in local XZ
    const closestX = Math.max(-hX, Math.min(_v1.x, hX));
    const closestZ = Math.max(-hZ, Math.min(_v1.z, hZ));

    const dx = _v1.x - closestX;
    const dz = _v1.z - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < entityRadius * entityRadius) {
      const dist = Math.sqrt(distSq);

      if (dist < 0.0001) {
        // Entity is inside: push to nearest edge
        const dXP = hX - _v1.x; const dXM = _v1.x + hX;
        const dZP = hZ - _v1.z; const dZM = _v1.z + hZ;
        const min = Math.min(dXP, dXM, dZP, dZM);

        if (min === dXP) _v2.set(dXP + entityRadius, 0, 0);
        else if (min === dXM) _v2.set(-(dXM + entityRadius), 0, 0);
        else if (min === dZP) _v2.set(0, 0, dZP + entityRadius);
        else _v2.set(0, 0, -(dZM + entityRadius));
      } else {
        // Outside: push away from closest point
        const overlap = entityRadius - dist;
        _v2.set(dx / dist * overlap, 0, dz / dist * overlap);
      }

      // Convert push vector back to world space and apply
      obstacle.mesh.getWorldQuaternion(_q1);
      _v2.applyQuaternion(_q1);
      entityPos.add(_v2);
      return true;
    }
  }
  // 2. Sphere/Cylinder Collider
  else {
    const obsRadius = obstacle.collider?.radius || obstacle.radius || 1.0;
    const totalRadius = entityRadius + obsRadius;

    if (entityMaxY < obsY - obsRadius || entityMinY > obsY + obsRadius) return false;

    if (distSq_XZ < totalRadius * totalRadius) {
      const dist = Math.sqrt(distSq_XZ);
      const overlap = totalRadius - dist;

      if (dist < 0.0001) {
        entityPos.x += totalRadius; // Simple eject
      } else {
        entityPos.x += (dx_bp / dist) * overlap;
        entityPos.z += (dz_bp / dist) * overlap;
      }
      return true;
    }
  }

  return false;
};