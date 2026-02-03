
import * as THREE from 'three';
import { SectorContext } from '../../types/sectors';
import { MATERIALS, GEOMETRY } from '../../utils/assets';

export const PathGenerator = {

    /**
     * Creates a curved railway track along a set of points.
     */
    /**
     * Creates a curved railway track with continuous geometry.
     */
    createRailTrack: (ctx: SectorContext, points: THREE.Vector3[]) => {
        const curve = new THREE.CatmullRomCurve3(points);
        curve.curveType = 'centripetal'; // Smooth curves
        const length = curve.getLength();

        // 1. Generate Gravel Bed (Continuous Ribbon)
        // Re-use internal logic or extract? I'll inline a simplified ribbon generator for now or allow `createPath` to return just geometry?
        // `createPath` adds to scene.
        // Let's manually generate the bed here for control.

        const segments = Math.ceil(length / 0.5); // High fidelity
        const pointsList = curve.getSpacedPoints(segments);

        // -- Helpers --
        const generateRibbon = (width: number, yOffset: number, uTile: number, color: number | THREE.Texture, matName?: string) => {
            const vertices: number[] = [];
            const uvs: number[] = [];
            const indices: number[] = [];

            for (let i = 0; i < pointsList.length; i++) {
                const pt = pointsList[i];
                let tangent = new THREE.Vector3();
                if (i === 0) {
                    if (pointsList.length > 1) tangent.subVectors(pointsList[i + 1], pt).normalize();
                    else tangent.set(0, 0, 1);
                } else if (i === pointsList.length - 1) {
                    tangent.subVectors(pt, pointsList[i - 1]).normalize();
                } else {
                    tangent.subVectors(pointsList[i + 1], pointsList[i - 1]).normalize();
                }

                const up = new THREE.Vector3(0, 1, 0);
                const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

                const pLeft = pt.clone().add(normal.clone().multiplyScalar(-width / 2));
                const pRight = pt.clone().add(normal.clone().multiplyScalar(width / 2));

                vertices.push(pLeft.x, pLeft.y + yOffset, pLeft.z);
                vertices.push(pRight.x, pRight.y + yOffset, pRight.z);

                const v = i / segments * uTile;
                uvs.push(0, v, 1, v);

                if (i < pointsList.length - 1) {
                    const base = i * 2;
                    indices.push(base, base + 1, base + 2);
                    indices.push(base + 1, base + 3, base + 2);
                }
            }

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geo.setIndex(indices);
            geo.computeVertexNormals();

            const mat = (color && typeof color === 'object' && 'isTexture' in color)
                ? new THREE.MeshStandardMaterial({ map: color as THREE.Texture, roughness: 1.0 })
                : new THREE.MeshStandardMaterial({ color: (color as number) || 0x666666, roughness: 0.9 });

            const mesh = new THREE.Mesh(geo, mat);
            mesh.name = matName || 'Ribbon';
            mesh.receiveShadow = false;
            mesh.castShadow = false;
            ctx.scene.add(mesh);
            return mesh;
        };

        // 1. Gravel Bed
        // Width 4.5, Y=0.04
        generateRibbon(4.5, 0.04, length / 4, MATERIALS.gravel.map || 0x666666, 'Gravel');

        // 2. Sleepers
        // Place continuously along curve
        const sleeperSpacing = 0.8;
        const sleeperCount = Math.floor(length / sleeperSpacing);
        const sleeperPoints = curve.getSpacedPoints(sleeperCount);

        // Optimization: Use InstancedMesh for sleepers?
        // SectorContext doesn't easily expose an instanced mesh manager, but we can create one local Group or InstancedMesh.
        // Let's use InstancedMesh for performance.
        const sleeperGeo = new THREE.BoxGeometry(3.0, 0.15, 0.4);
        const sleeperMat = MATERIALS.brownBrick || new THREE.MeshStandardMaterial({ color: 0x5D4037 });
        const sleeperMesh = new THREE.InstancedMesh(sleeperGeo, sleeperMat, sleeperCount + 1);
        sleeperMesh.name = 'Sleeper';
        sleeperMesh.receiveShadow = false;
        sleeperMesh.castShadow = false;

        const dummy = new THREE.Object3D();
        for (let i = 0; i < sleeperPoints.length; i++) {
            const pt = sleeperPoints[i];
            // Calculate rotation
            let tangent;
            if (i < sleeperPoints.length - 1) tangent = new THREE.Vector3().subVectors(sleeperPoints[i + 1], pt).normalize();
            else tangent = new THREE.Vector3().subVectors(pt, sleeperPoints[i - 1]).normalize();

            dummy.position.copy(pt).setY(0.07); // Slightly above gravel (was 0.12)
            dummy.lookAt(pt.clone().add(tangent));
            dummy.updateMatrix();
            sleeperMesh.setMatrixAt(i, dummy.matrix);
        }
        sleeperMesh.instanceMatrix.needsUpdate = true;
        ctx.scene.add(sleeperMesh);
        // Note: InstancedMesh might not be in 'obstacles' unless we add a comprehensive collider.
        // Sleepers are low, no collision needed usually.

        // 3. Rails (Left and Right)
        // Make simple ribbons for now. 0.15 width.
        // We need to offset the "center" of the generation.
        // My `generateRibbon` takes a center line.
        // I need to offset the POINTS first.

        const createOffsetPoints = (offset: number) => {
            return pointsList.map((pt, i) => {
                let tangent = new THREE.Vector3();
                if (i < pointsList.length - 1) tangent.subVectors(pointsList[i + 1], pt).normalize();
                else if (i > 0) tangent.subVectors(pt, pointsList[i - 1]).normalize();
                else tangent.set(0, 0, 1);

                const up = new THREE.Vector3(0, 1, 0);
                const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();
                return pt.clone().add(normal.multiplyScalar(offset));
            });
        };

        const leftRailPoints = createOffsetPoints(-1.0); // 1.435m gauge approx -> +/- 0.7? Game scale: +/- 1.0 looks robust.
        const rightRailPoints = createOffsetPoints(1.0);

        // Rail Top Surface (Shiny)
        const railMat = MATERIALS.blackMetal || new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.2 });

        // I need to generate mesh from these new point lists. 
        // Can't call generateRibbon directly as it expects `pointsList` closure or I refactor `generateRibbon` to take points.
        // Refactoring `generateRibbon` to take points.

        const buildRibbon = (pts: THREE.Vector3[], w: number, y: number, mat: THREE.Material, name: string) => {
            const v: number[] = [];
            const idx: number[] = [];
            for (let i = 0; i < pts.length; i++) {
                const pt = pts[i];
                let tan = new THREE.Vector3(0, 0, 1);
                if (i < pts.length - 1) tan.subVectors(pts[i + 1], pt).normalize();
                else if (i > 0) tan.subVectors(pt, pts[i - 1]).normalize();

                const norm = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
                const p1 = pt.clone().add(norm.clone().multiplyScalar(-w / 2));
                const p2 = pt.clone().add(norm.clone().multiplyScalar(w / 2));
                v.push(p1.x, p1.y + y, p1.z);
                v.push(p2.x, p2.y + y, p2.z);

                if (i < pts.length - 1) {
                    const b = i * 2;
                    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
                }
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
            g.setIndex(idx);
            g.computeVertexNormals();
            const m = new THREE.Mesh(g, mat);
            m.name = name;
            m.castShadow = false; m.receiveShadow = false;
            ctx.scene.add(m);
        };

        buildRibbon(leftRailPoints, 0.2, 0.08, railMat, 'Rail_Left');
        buildRibbon(rightRailPoints, 0.2, 0.08, railMat, 'Rail_Right');

        // Minimap
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
    createPath: (ctx: SectorContext, points: THREE.Vector3[], width: number, material: THREE.Material, type: 'ROAD' | 'PATH' = 'ROAD', showBlood: boolean = false, showFootprints: boolean = false) => {
        const curve = new THREE.CatmullRomCurve3(points);
        curve.curveType = 'centripetal';
        const length = curve.getLength();

        // High resolution for smooth curves
        const segments = Math.ceil(length / 2);
        const pointsList = curve.getSpacedPoints(segments);

        const vertices: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];

        // Generate Ribbons
        for (let i = 0; i < pointsList.length; i++) {
            const pt = pointsList[i];

            // Calculate direction (tangent) using Central Difference for smoother transitions
            let tangent = new THREE.Vector3();
            if (i === 0) {
                if (pointsList.length > 1) tangent.subVectors(pointsList[i + 1], pt).normalize();
                else tangent.set(0, 0, 1);
            } else if (i === pointsList.length - 1) {
                tangent.subVectors(pt, pointsList[i - 1]).normalize();
            } else {
                // Average of incoming and outgoing vectors (equivalent to direction between prev and next)
                tangent.subVectors(pointsList[i + 1], pointsList[i - 1]).normalize();
            }

            // Calculate Normal (Right Vector)
            const up = new THREE.Vector3(0, 1, 0);
            const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

            // Vertices (Left and Right)
            const pLeft = pt.clone().add(normal.clone().multiplyScalar(-width / 2));
            const pRight = pt.clone().add(normal.clone().multiplyScalar(width / 2));

            // Push Vertices
            vertices.push(pLeft.x, pLeft.y + 0.02, pLeft.z);
            vertices.push(pRight.x, pRight.y + 0.02, pRight.z);

            // UVs
            const v = i / segments * (length / width); // Tile based on aspect ratio
            uvs.push(0, v);
            uvs.push(1, v);

            // Indices (Two triangles per segment)
            if (i < pointsList.length - 1) {
                const base = i * 2;
                // Triangle 1: L1, R1, L2
                indices.push(base, base + 1, base + 2);
                // Triangle 2: R1, R2, L2
                indices.push(base + 1, base + 3, base + 2);
            }

            // Blood Decals (Optional Decals)
            if (showBlood && i % 4 === 0 && i < pointsList.length - 1) { // Reduced frequency
                const footprint = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.6), MATERIALS.bloodDecal);
                const next = pointsList[i + 1] || pt.clone().add(tangent);

                footprint.rotation.x = -Math.PI / 2;
                footprint.position.set(pt.x + (Math.random() - 0.5), 0.03, pt.z + (Math.random() - 0.5));

                // Orient along path
                footprint.lookAt(next.x, 0.03, next.z);
                footprint.rotateX(-Math.PI / 2);

                footprint.material.transparent = true;
                footprint.material.opacity = 0.2;
                ctx.scene.add(footprint);
            }

            // Footprints (Optional Decals)
            if (showFootprints && i % 4 === 0 && i < pointsList.length - 1) { // Reduced frequency
                const footprint = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.6), MATERIALS.footprintDecal);
                const next = pointsList[i + 1] || pt.clone().add(tangent);

                footprint.rotation.x = -Math.PI / 2;
                footprint.position.set(pt.x + (Math.random() - 0.5), 0.03, pt.z + (Math.random() - 0.5));

                // Orient along path
                footprint.lookAt(next.x, 0.03, next.z);
                footprint.rotateX(-Math.PI / 2);

                footprint.material.transparent = true;
                footprint.material.opacity = 0.2;
                ctx.scene.add(footprint);
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        ctx.scene.add(mesh);

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
    createRoad: (ctx: SectorContext, points: THREE.Vector3[], width: number = 16, hasMarkings: boolean = false, material?: THREE.Material) => {
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

                const mid = new THREE.Vector3().addVectors(pt, next).multiplyScalar(0.5);
                marking.position.set(mid.x, 0.04, mid.z);

                marking.lookAt(next.x, 0.04, next.z);
                marking.rotateX(-Math.PI / 2);

                ctx.scene.add(marking);
            }
        }
        return curve;
    },

    /**
     * Creates a dirt or snow path with optional footprint details.
     */
    createDirtPath: (ctx: SectorContext, points: THREE.Vector3[], width: number = 4, showBlood: boolean = false, showFootprints: boolean = false, material?: THREE.Material) => {
        // Use gravel or road with lower contrast, or just path decals on the snow ground
        return PathGenerator.createPath(ctx, points, width, material || MATERIALS.gravel, 'PATH', showBlood, showFootprints);
    },

    /**
     * Creates a path made entirely of decals (e.g., footprints).
     */
    createDecalPath: (ctx: SectorContext, points: THREE.Vector3[], options: { spacing: number, size: number, material: THREE.Material, variance?: number, color?: number, randomRotation?: boolean }) => {
        const curve = new THREE.CatmullRomCurve3(points);
        // Curve type centripetal to avoid loops
        curve.curveType = 'centripetal';
        const length = curve.getLength();

        const count = Math.ceil(length / options.spacing);
        const pointsList = curve.getSpacedPoints(count);

        const geo = new THREE.PlaneGeometry(options.size, options.size * 1.5); // Aspect ratio for footprints
        const mat = options.material.clone();
        if (options.color !== undefined) mat.color.setHex(options.color);

        // Using InstancedMesh for performance
        const mesh = new THREE.InstancedMesh(geo, mat, count);
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        mesh.name = 'DecalPath';

        const dummy = new THREE.Object3D();

        for (let i = 0; i < pointsList.length; i++) {
            const pt = pointsList[i];

            // Tangent for direction
            let tangent = new THREE.Vector3();
            if (i < pointsList.length - 1) tangent.subVectors(pointsList[i + 1], pt).normalize();
            else if (i > 0) tangent.subVectors(pt, pointsList[i - 1]).normalize();
            else tangent.set(0, 0, 1);

            // Position with variance
            const variance = options.variance || 0;
            const jx = (Math.random() - 0.5) * variance;
            const jz = (Math.random() - 0.5) * variance;

            dummy.position.set(pt.x + jx, 0.05, pt.z + jz); // Slightly above ground

            // Orient
            if (options.randomRotation) {
                dummy.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
            } else {
                // Orient along path + 90 deg rotation because texture is usually upright
                dummy.lookAt(pt.x + tangent.x, 0.05, pt.z + tangent.z);
                dummy.rotateX(-Math.PI / 2); // Lay flat
                dummy.rotateZ(Math.PI); // Adjust texture orientation if needed (heel to toe)

                // Left/Right stagger for footprints?
                // If it's footprints, we might want to stagger them left/right of the center line
                // Simple stagger:
                const side = i % 2 === 0 ? 1 : -1;
                const stagger = 0.2; // 20cm stagger
                dummy.translateX(side * stagger);
            }

            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }

        mesh.instanceMatrix.needsUpdate = true;
        ctx.scene.add(mesh);
    },

    /**
     * Wrapper for blood trails
     */
    createBloodPath: (ctx: SectorContext, points: THREE.Vector3[], spacing: number = 0.5, size: number = 0.8) => {
        PathGenerator.createDecalPath(ctx, points, {
            spacing,
            size,
            material: MATERIALS.bloodDecal,
            variance: 0.4,
            randomRotation: true
        });
    }

};
