
import * as THREE from 'three';
import { SectorContext } from '../../types/sectors';
import { MATERIALS, GEOMETRY } from '../../utils/assets';

export const PathGenerator = {
    /**
     * Creates a curved railway track along a set of points.
     */
    createRailway: (ctx: SectorContext, points: THREE.Vector3[]) => {
        const curve = new THREE.CatmullRomCurve3(points);
        curve.curveType = 'catmullrom';
        const length = curve.getLength();

        const spacing = 4.0;
        const count = Math.ceil(length / spacing);
        const pointsList = curve.getSpacedPoints(count);

        pointsList.forEach((pt, i) => {
            if (i >= pointsList.length - 1) return;
            const next = pointsList[i + 1];
            const tangent = new THREE.Vector3().subVectors(next, pt).normalize();
            const axis = new THREE.Vector3(0, 1, 0);
            const normal = new THREE.Vector3().crossVectors(tangent, axis).normalize();

            // Sleeper
            const sleeper = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 0.6), MATERIALS.brownBrick);
            sleeper.position.copy(pt).add(new THREE.Vector3(0, 0.1, 0));
            sleeper.lookAt(pt.clone().add(tangent));
            ctx.scene.add(sleeper);

            const railLen = pt.distanceTo(next);
            const railGeo = new THREE.BoxGeometry(0.2, 0.2, railLen + 0.1);

            // Rail Left
            const rL = new THREE.Mesh(railGeo, MATERIALS.blackMetal);
            const posL = pt.clone().add(normal.clone().multiplyScalar(-1.5));
            const nextPosL = next.clone().add(normal.clone().multiplyScalar(-1.5));
            const midL = new THREE.Vector3().addVectors(posL, nextPosL).multiplyScalar(0.5);
            midL.y = 0.3;
            rL.position.copy(midL);
            rL.lookAt(nextPosL.x, 0.3, nextPosL.z);
            ctx.scene.add(rL);

            // Rail Right
            const rR = new THREE.Mesh(railGeo, MATERIALS.blackMetal);
            const posR = pt.clone().add(normal.clone().multiplyScalar(1.5));
            const nextPosR = next.clone().add(normal.clone().multiplyScalar(1.5));
            const midR = new THREE.Vector3().addVectors(posR, nextPosR).multiplyScalar(0.5);
            midR.y = 0.3;
            rR.position.copy(midR);
            rR.lookAt(nextPosR.x, 0.3, nextPosR.z);
            ctx.scene.add(rR);
        });

        // Add to minimap
        const mapSamples = 20;
        const mapPoints = curve.getSpacedPoints(mapSamples);
        mapPoints.forEach(p => {
            if (p) ctx.mapItems.push({ id: `rail_${Math.random()}`, x: p.x, z: p.z, type: 'ROAD', radius: 2, color: '#333' });
        });

        return curve;
    },

    /**
     * Creates a road or dirt path along a set of points.
     */
    createPath: (ctx: SectorContext, points: THREE.Vector3[], width: number, material: THREE.Material, type: 'ROAD' | 'PATH' = 'ROAD', showFootprints: boolean = false) => {
        const curve = new THREE.CatmullRomCurve3(points);
        curve.curveType = 'catmullrom';
        const length = curve.getLength();

        const segments = Math.ceil(length / 5);
        const pointsList = curve.getSpacedPoints(segments);

        for (let i = 0; i < pointsList.length - 1; i++) {
            const pt = pointsList[i];
            const next = pointsList[i + 1];
            const dist = pt.distanceTo(next);

            const segment = new THREE.Mesh(new THREE.PlaneGeometry(dist + 0.1, width), material);
            segment.rotation.x = -Math.PI / 2;

            // Position at midpoint
            const mid = new THREE.Vector3().addVectors(pt, next).multiplyScalar(0.5);
            segment.position.set(mid.x, 0.02, mid.z);

            // Look at next point
            segment.lookAt(next.x, 0.02, next.z);
            segment.rotateY(-Math.PI / 2); // Correct plane rotation

            segment.receiveShadow = true;
            ctx.scene.add(segment);

            // Add steps/footprints if requested
            if (showFootprints && i % 2 === 0) {
                const footprint = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.6), MATERIALS.bloodDecal);
                footprint.rotation.x = -Math.PI / 2;
                footprint.position.set(pt.x + (Math.random() - 0.5), 0.03, pt.z + (Math.random() - 0.5));
                footprint.material.transparent = true;
                footprint.material.opacity = 0.2;
                ctx.scene.add(footprint);
            }
        }

        // Add to minimap
        const mapSamples = Math.ceil(length / 20);
        const mapPoints = curve.getSpacedPoints(mapSamples);
        mapPoints.forEach(p => {
            if (p) ctx.mapItems.push({ id: `path_${Math.random()}`, x: p.x, z: p.z, type: 'ROAD', radius: width / 2, color: type === 'ROAD' ? '#222' : '#4a3a2a' });
        });

        return curve;
    },

    /**
     * Creates a stream or water path.
     */
    createStream: (ctx: SectorContext, points: THREE.Vector3[], width: number) => {
        const curve = PathGenerator.createPath(ctx, points, width, new THREE.MeshStandardMaterial({
            color: 0x004488,
            transparent: true,
            opacity: 0.6,
            roughness: 0.1,
            metalness: 0.5
        }));

        // Add blue ambient glow along the stream
        const length = curve.getLength();
        const lightCount = Math.ceil(length / 40);
        const lightPoints = curve.getSpacedPoints(lightCount);

        lightPoints.forEach(p => {
            const light = new THREE.PointLight(0x00aaff, 5, 20);
            light.position.set(p.x, 1, p.z);
            ctx.scene.add(light);
            ctx.flickeringLights.push({ light, baseInt: 5, flickerRate: 0.05 });
        });

        return curve;
    },

    /**
     * Creates a formal road (asphalt) with optional lane markings.
     */
    createRoad: (ctx: SectorContext, points: THREE.Vector3[], width: number = 16, hasMarkings: boolean = true, material?: THREE.Material) => {
        const curve = PathGenerator.createPath(ctx, points, width, material || MATERIALS.asphalt, 'ROAD');

        if (hasMarkings) {
            const length = curve.getLength();
            const segments = Math.ceil(length / 2); // Sample points for markings
            const pointsList = curve.getSpacedPoints(segments);

            for (let i = 0; i < pointsList.length - 1; i++) {
                if (i % 6 !== 0) continue; // Every Nth segment is a dash

                const pt = pointsList[i];
                const next = pointsList[i + 1];
                const dist = pt.distanceTo(next);

                const marking = new THREE.Mesh(new THREE.PlaneGeometry(0.2, dist + 0.5), new THREE.MeshBasicMaterial({ color: 0x999999, transparent: true, opacity: 0.5 }));
                marking.rotation.x = -Math.PI / 2;

                const mid = new THREE.Vector3().addVectors(pt, next).multiplyScalar(0.5);
                marking.position.set(mid.x, 0.04, mid.z);

                marking.lookAt(next.x, 0.04, next.z);
                marking.rotateY(-Math.PI / 2);

                ctx.scene.add(marking);
            }
        }
        return curve;
    },

    /**
     * Creates a dirt or snow path with optional footprint details.
     */
    createDirtPath: (ctx: SectorContext, points: THREE.Vector3[], width: number = 8, material?: THREE.Material, showFootprints: boolean = true) => {
        // Use gravel or road with lower contrast, or just path decals on the snow ground
        return PathGenerator.createPath(ctx, points, width, material || MATERIALS.gravel, 'PATH', showFootprints);
    }
};
