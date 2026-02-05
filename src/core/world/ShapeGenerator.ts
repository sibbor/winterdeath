
import * as THREE from 'three';

export const ShapeGenerator = {
    createExtrudedPolygon: (points: THREE.Vector2[], height: number, thickness: number, filled: boolean, color: number = 0x888888) => {
        if (points.length < 2) return new THREE.Group();

        if (filled) {
            const shape = new THREE.Shape();
            shape.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                shape.lineTo(points[i].x, points[i].y);
            }
            shape.closePath();

            const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
            const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.y = 0;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            return mesh;
        } else {
            const group = new THREE.Group();
            for (let i = 0; i < points.length; i++) {
                const p1 = points[i];
                const p2 = points[(i + 1) % points.length];
                const dist = p1.distanceTo(p2);

                const wallGeo = new THREE.BoxGeometry(dist, height, thickness);
                const wall = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));

                const center = p1.clone().add(p2).multiplyScalar(0.5);
                wall.position.set(center.x, height / 2, center.y);
                wall.rotation.y = -Math.atan2(p2.y - p1.y, p2.x - p1.x);

                wall.castShadow = true;
                wall.receiveShadow = true;
                group.add(wall);
            }
            return group;
        }
    }
};
