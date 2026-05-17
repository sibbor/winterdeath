/**
 * Geometry & Spatial Math Utilities
 * Optimized for Zero-GC and high-frequency execution.
 */

/**
 * Standard ray-casting algorithm for Point-in-Polygon check.
 * Zero-GC: Operates on raw numbers, avoiding object allocations.
 * 
 * @param px Point X coordinate
 * @param pz Point Z coordinate
 * @param polygon Array of {x, z} coordinates
 */
export function isPointInPolygon(px: number, pz: number, polygon: { x: number, z: number }[]) {
    let inside = false;
    const len = polygon.length;
    for (let i = 0, j = len - 1; i < len; j = i++) {
        const xi = polygon[i].x, zi = polygon[i].z;
        const xj = polygon[j].x, zj = polygon[j].z;
        const intersect = ((zi > pz) !== (zj > pz)) && (px < (xj - xi) * (pz - zi) / (zj - zi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}
