import * as THREE from 'three';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export const GeneratorUtils = {
    freezeStatic: <T extends THREE.Object3D>(obj: T, excludeNames: string[] = []): T => {
        obj.traverse((child) => {
            if (excludeNames.length > 0 && excludeNames.indexOf(child.name) !== -1) return;
            child.matrixAutoUpdate = false;
            child.updateMatrix();
        });
        return obj;
    },
    isPointInPolygon: (px: number, pz: number, polygon: THREE.Vector3[]) => {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, zi = polygon[i].z;
            const xj = polygon[j].x, zj = polygon[j].z;
            if (((zi > pz) !== (zj > pz)) && (px < (xj - xi) * (pz - zi) / (zj - zi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    },
    fillPolygon: (polygon: THREE.Vector3[], density: number, onPlace: (x: number, z: number) => void) => {
        if (!polygon || polygon.length < 3) return;
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < polygon.length; i++) {
            if (polygon[i].x < minX) minX = polygon[i].x; if (polygon[i].x > maxX) maxX = polygon[i].x;
            if (polygon[i].z < minZ) minZ = polygon[i].z; if (polygon[i].z > maxZ) maxZ = polygon[i].z;
        }
        const width = maxX - minX, depth = maxZ - minZ;
        const count = Math.floor((width * depth) * density);
        for (let i = 0; i < count; i++) {
            const x = minX + Math.random() * width;
            const z = minZ + Math.random() * depth;
            if (GeneratorUtils.isPointInPolygon(x, z, polygon)) onPlace(x, z);
        }
    },
    distributeAlongPath: (points: THREE.Vector3[], segmentLength: number, strict: boolean, onPlace: (mid: THREE.Vector3, angle: number, dist: number) => void) => {
        const curve = new THREE.CatmullRomCurve3(points);
        if (strict) curve.curveType = 'centripetal';
        const steps = Math.ceil(curve.getLength() / segmentLength);
        const pts = curve.getSpacedPoints(steps);
        for (let i = 0; i < pts.length - 1; i++) {
            const mid = _v1.addVectors(pts[i], pts[i + 1]).multiplyScalar(0.5);
            const dist = pts[i].distanceTo(pts[i + 1]);
            const angle = Math.atan2(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
            onPlace(mid, angle, dist);
        }
    },
    // Insert createTextSprite logic here
    createTextSprite: (text: string, spriteTextureCache: Record<string, THREE.CanvasTexture>, spriteMaterialTemplate: THREE.SpriteMaterial) => {
        if (spriteTextureCache[text]) {
            const mat = spriteMaterialTemplate.clone();
            mat.map = spriteTextureCache[text];
            const sprite = new THREE.Sprite(mat);
            sprite.scale.set(4, 1, 1);
            return sprite;
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        canvas.width = 256;
        canvas.height = 64;
        ctx.font = 'bold 20px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const tex = new THREE.CanvasTexture(canvas);
        spriteTextureCache[text] = tex;

        const mat = spriteMaterialTemplate.clone();
        mat.map = tex;
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(4, 1, 1);
        return sprite;
    }
};