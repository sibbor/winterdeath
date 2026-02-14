import * as THREE from 'three';

// --- Collision System Types ---

export type ColliderType = 'sphere' | 'box';

export interface ColliderData {
    type: ColliderType;
    radius?: number;
    size?: THREE.Vector3; // Full dimensions
}

export interface Obstacle {
    mesh?: THREE.Object3D;
    position: THREE.Vector3;
    scale?: THREE.Vector3;
    quaternion?: THREE.Quaternion;
    radius?: number;
    collider?: ColliderData;
    id?: string;
    type?: string;
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
    // Safety Guard: If somehow an invalid obstacle got in, ignore it
    if (!obstacle || !obstacle.position) return false;

    // 0. High-Speed Broad-phase Check
    const dx_bp = entityPos.x - obstacle.position.x;
    const dz_bp = entityPos.z - obstacle.position.z;
    const distSq_XZ = dx_bp * dx_bp + dz_bp * dz_bp;

    // Fast radius-based discard
    // If obstacle has no radius defined, assume 2.0 as fallback
    const checkRadius = (obstacle.collider?.radius || obstacle.radius || 2.0) + entityRadius + 1.0;
    if (distSq_XZ > checkRadius * checkRadius) return false;

    // Vertical overlap check
    const entityMinY = entityPos.y - centerOffset;
    const entityMaxY = entityMinY + height;
    const obsY = obstacle.position.y;

    // 1. Box Collider (Oriented Bounding Box)
    if (obstacle.collider?.type === 'box' && obstacle.collider.size) {
        const size = obstacle.collider.size;

        // Transform entity to box local space
        if (obstacle.mesh) {
            _m1.copy(obstacle.mesh.matrixWorld).invert();
        } else {
            // Construct matrix from pos/quat/scale
            if (obstacle.position) {
                _m1.compose(
                    obstacle.position,
                    obstacle.quaternion || _q1.set(0, 0, 0, 1),
                    obstacle.scale || _v2.set(1, 1, 1)
                ).invert();
            }
        }
        _v1.copy(entityPos).applyMatrix4(_m1);

        const hX = size.x * 0.5;
        const hY = size.y * 0.5;
        const hZ = size.z * 0.5;

        // Local Y check
        // We treat the box as axis-aligned in local space, so we just check against half-extents
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
            if (obstacle.quaternion) {
                _v2.applyQuaternion(obstacle.quaternion);
            } else if (obstacle.mesh) {
                obstacle.mesh.getWorldQuaternion(_q1);
                _v2.applyQuaternion(_q1);
            }

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
