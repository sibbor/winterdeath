import * as THREE from 'three';

// --- Collision System Types ---

export type ColliderType = 'sphere' | 'box';

export interface ColliderData {
    type: ColliderType;
    radius?: number;
    size?: THREE.Vector3; // Full dimensions
    height?: number; // Explicit height for cylinders (optional)
    center?: THREE.Vector3; // Local offset from pivot (for non-centered meshes)
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
// Shared globally to ensure Zero-GC during collision resolution
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m1 = new THREE.Matrix4();
const _q1 = new THREE.Quaternion();

/**
 * Resolves collision between a moving entity and a static obstacle.
 * Modifies entityPos IN-PLACE to ensure Zero-GC performance.
 * Highly optimized for V8 execution speed.
 */
export const applyCollisionResolution = (
    entityPos: THREE.Vector3,
    entityRadius: number,
    obstacle: Obstacle,
    height: number = 2.0,
    centerOffset: number = 0
): boolean => {
    if (!obstacle || !obstacle.position) return false;

    const col = obstacle.collider;
    const obsPos = obstacle.position;

    const eX = entityPos.x;
    const eY = entityPos.y;
    const eZ = entityPos.z;

    const oX = obsPos.x;
    const oY = obsPos.y;
    const oZ = obsPos.z;

    // 0. High-Speed Broad-phase Check
    const dx_bp = eX - oX;
    const dz_bp = eZ - oZ;
    const distSq_XZ = dx_bp * dx_bp + dz_bp * dz_bp;

    // Fast radius-based discard
    const colRad = col && col.radius ? col.radius : 0;
    const obsRad = obstacle.radius || 2.0;
    const checkRadius = (colRad || obsRad) + entityRadius + 1.0;

    // Quick exit if too far away
    if (distSq_XZ > checkRadius * checkRadius) return false;

    // Vertical overlap check
    const entityMinY = eY - centerOffset;
    const entityMaxY = entityMinY + height;

    // 1. Box Collider (Oriented Bounding Box)
    if (col && col.type === 'box' && col.size) {
        const size = col.size;

        // Fast World-to-Local space transformation
        if (obstacle.mesh) {
            // If linked to a mesh, use its world matrix directly
            _m1.copy(obstacle.mesh.matrixWorld).invert();
            _v1.set(eX, eY, eZ).applyMatrix4(_m1);
        } else {
            // Manual TRS inversion (10x faster than Matrix4.compose().invert())
            _v1.set(eX - oX, eY - oY, eZ - oZ); // Inverse Translate

            if (obstacle.quaternion) {
                // Inverse Rotate (Conjugate is identical to inverse for normalized quaternions)
                _q1.copy(obstacle.quaternion).conjugate();
                _v1.applyQuaternion(_q1);
            }
            if (obstacle.scale) {
                // Inverse Scale (Multiplication by reciprocal is faster than division)
                if (obstacle.scale.x !== 0) _v1.x *= (1.0 / obstacle.scale.x);
                if (obstacle.scale.y !== 0) _v1.y *= (1.0 / obstacle.scale.y);
                if (obstacle.scale.z !== 0) _v1.z *= (1.0 / obstacle.scale.z);
            }
        }

        // Apply optional local offset (center of the box relative to pivot)
        if (col.center) {
            _v1.x -= col.center.x;
            _v1.y -= col.center.y;
            _v1.z -= col.center.z;
        }

        const hX = size.x * 0.5;
        const hY = size.y * 0.5;
        const hZ = size.z * 0.5;

        // Local Y check
        if (_v1.y + height < -hY || _v1.y > hY) return false;

        // Find closest point on box in local XZ plane using fast branching
        let closestX = _v1.x;
        if (closestX < -hX) closestX = -hX;
        else if (closestX > hX) closestX = hX;

        let closestZ = _v1.z;
        if (closestZ < -hZ) closestZ = -hZ;
        else if (closestZ > hZ) closestZ = hZ;

        const dx = _v1.x - closestX;
        const dz = _v1.z - closestZ;
        const distSq = dx * dx + dz * dz;

        // Check if within entity radius
        if (distSq < entityRadius * entityRadius) {
            const dist = Math.sqrt(distSq);

            if (dist < 0.0001) {
                // Entity center is exactly inside the box: snap to nearest local edge
                const dXP = hX - _v1.x;
                const dXM = _v1.x + hX;
                const dZP = hZ - _v1.z;
                const dZM = _v1.z + hZ;
                const min = Math.min(dXP, dXM, dZP, dZM);

                if (min === dXP) _v2.set(dXP + entityRadius, 0, 0);
                else if (min === dXM) _v2.set(-(dXM + entityRadius), 0, 0);
                else if (min === dZP) _v2.set(0, 0, dZP + entityRadius);
                else _v2.set(0, 0, -(dZM + entityRadius));
            } else {
                // Entity overlaps the edge: push away along the normal
                // ALU optimization: Compute push scalar once (1 division)
                const pushScalar = (entityRadius - dist) / dist;
                _v2.set(dx * pushScalar, 0, dz * pushScalar);
            }

            // Convert push vector back to world space
            if (obstacle.quaternion) {
                _v2.applyQuaternion(obstacle.quaternion);
            } else if (obstacle.mesh) {
                // Safe, fast rotation extraction without triggering scene graph updates
                _m1.extractRotation(obstacle.mesh.matrixWorld);
                _v2.applyMatrix4(_m1);
            }

            // Apply push directly to entity position
            entityPos.x += _v2.x;
            entityPos.z += _v2.z;
            return true;
        }
    }
    // 2. Sphere/Cylinder Collider
    else {
        const oRad = col && col.radius ? col.radius : obsRad;
        const totalRadius = entityRadius + oRad;
        const obsHeight = col && col.height ? col.height : 0;

        let yMin, yMax;
        if (obsHeight > 0) {
            // Treat as a vertical cylinder
            const halfH = obsHeight * 0.5;
            yMin = oY - halfH;
            yMax = oY + halfH;
        } else {
            // Treat as a pure sphere
            yMin = oY - oRad;
            yMax = oY + oRad;
        }

        // Vertical discard
        if (entityMaxY < yMin || entityMinY > yMax) return false;

        // Circular overlap resolution
        if (distSq_XZ < totalRadius * totalRadius) {
            const dist = Math.sqrt(distSq_XZ);

            if (dist < 0.0001) {
                // Exact center overlap fallback
                entityPos.x += totalRadius;
            } else {
                // ALU optimization: Compute push scalar once
                const pushScalar = (totalRadius - dist) / dist;
                entityPos.x += dx_bp * pushScalar;
                entityPos.z += dz_bp * pushScalar;
            }
            return true;
        }
    }

    return false;
};