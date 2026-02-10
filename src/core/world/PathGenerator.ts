
import * as THREE from 'three';
import { SectorContext } from '../../types/sectors';
import { MATERIALS, GEOMETRY } from '../../utils/assets';
import { ObjectGenerator } from './ObjectGenerator';

let pathLayer = 0; // Deterministic Y-stacking to prevent Z-fighting

export const PathGenerator = {
    resetPathLayer() {
        pathLayer = 0;
    },

    /**
     * Calculates points offset from a spline path along the normal.
     */
    getOffsetPoints: (points: THREE.Vector3[], offset: number): THREE.Vector3[] => {
        return points.map((pt, i) => {
            let tangent = new THREE.Vector3();
            if (i < points.length - 1) tangent.subVectors(points[i + 1], pt).normalize();
            else if (i > 0) tangent.subVectors(pt, points[i - 1]).normalize();
            else tangent.set(0, 0, 1);

            const up = new THREE.Vector3(0, 1, 0);
            const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();
            return pt.clone().add(normal.multiplyScalar(offset));
        });
    },

    /**
     * Creates an invisible collision wall along a path.
     */
    createInvisibleWall: (ctx: SectorContext, points: THREE.Vector3[], name: string = 'InvisibleWall') => {
        const height = 50;
        const thickness = 2.0;

        const curve = new THREE.CatmullRomCurve3(points);
        const length = curve.getLength();
        const steps = Math.ceil(length / 2);
        const pointsList = curve.getSpacedPoints(steps);

        for (let i = 0; i < pointsList.length - 1; i++) {
            const curr = pointsList[i];
            const next = pointsList[i + 1];
            const mid = new THREE.Vector3().addVectors(curr, next).multiplyScalar(0.5);

            const segment = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, 2.1));
            mid.y = height / 2;
            segment.position.copy(mid);
            segment.lookAt(next.x, mid.y, next.z);
            segment.visible = false;
            segment.name = `${name}_${i}`;
            segment.updateMatrixWorld();

            ctx.scene.add(segment);

            ctx.obstacles.push({
                mesh: segment,
                collider: { type: 'box', size: new THREE.Vector3(thickness, height, 2.0) }
            });
        }
    },


    /**
     * Creates a curved railway track along a set of points.
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
        const generateRibbon = (width: number, yOffset: number, uTile: number, material: THREE.Material | number | THREE.Texture, matName?: string) => {
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

            let mat: THREE.Material;
            if (material instanceof THREE.Material) {
                mat = material.clone();
                if (mat instanceof THREE.MeshStandardMaterial) {
                    if (mat.map) {
                        mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
                    }
                    if (mat.bumpMap) {
                        mat.bumpMap.wrapS = mat.bumpMap.wrapT = THREE.RepeatWrapping;
                    }
                }
            } else if (material && typeof material === 'object' && 'isTexture' in material) {
                const tex = (material as THREE.Texture);
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1.0 });
            } else {
                mat = new THREE.MeshStandardMaterial({ color: (material as number) || 0x666666, roughness: 0.9 });
            }

            const mesh = new THREE.Mesh(geo, mat);
            mesh.name = matName || 'Ribbon';
            mesh.renderOrder = 1;
            mesh.receiveShadow = true;
            mesh.castShadow = false;
            ctx.scene.add(mesh);
            return mesh;
        };

        // 1. Gravel Bed
        // Width 4.5, Y=0.05 (Standardized)
        generateRibbon(4.5, 0.05, length / 4, MATERIALS.gravel, 'Gravel');

        // 1.1 Frost Shoulders (Railway)
        generateRibbon(5.5, 0.01, length / 4, MATERIALS.frost, 'Railway_Frost');

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

            dummy.position.copy(pt).setY(0.08); // On top of gravel (Standardized)
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

        const leftRailPoints = PathGenerator.getOffsetPoints(pointsList, -1.0);
        const rightRailPoints = PathGenerator.getOffsetPoints(pointsList, 1.0);

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
    createPointPath: (ctx: SectorContext, points: THREE.Vector3[], width: number, material: THREE.Material, type: 'ROAD' | 'PATH' = 'ROAD', showBlood: boolean = false, showFootprints: boolean = false, strict: boolean = false) => {
        const curve = new THREE.CatmullRomCurve3(points);
        curve.curveType = (strict ? 'centripetal' : 'catmullrom');
        const length = curve.getLength();

        // High resolution for smooth curves
        const segments = Math.ceil(length / 2);
        const pointsList = curve.getSpacedPoints(segments);

        const vertices: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];

        // Deterministic Y-stacking
        pathLayer++;
        const yOffset = 0.03 + (pathLayer * 0.001);

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

            vertices.push(pLeft.x, pLeft.y + yOffset, pLeft.z);
            vertices.push(pRight.x, pRight.y + yOffset, pRight.z);

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

            // Footprints or blood trails
            if ((showBlood || showFootprints) && i % 4 === 0 && i < pointsList.length - 1) { // Reduced frequency
                const prints = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.6), showBlood ? MATERIALS.bloodStainDecal : MATERIALS.footprintDecal);
                const next = pointsList[i + 1] || pt.clone().add(tangent);

                prints.rotation.x = -Math.PI / 2;
                prints.position.set(pt.x + (Math.random() - 0.5), yOffset + 0.02, pt.z + (Math.random() - 0.5));

                // Orient along path
                prints.lookAt(next.x, yOffset + 0.02, next.z);
                prints.rotateX(-Math.PI / 2);

                if (showBlood) {
                    prints.material.transparent = true;
                    prints.material.opacity = 0.2;
                }
                // footprints already have the correct opacity from MATERIALS.footprintDecal

                prints.renderOrder = 5;
                ctx.scene.add(prints);
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 2;
        mesh.receiveShadow = true;
        ctx.scene.add(mesh);

        // Significantly wider (2.5x), Y=0.01 (Standardized)
        const frostWidth = width * 1.3;
        const frostVertices: number[] = [];
        const frostUVs: number[] = [];
        const frostIndices: number[] = [];

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
            const normal = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
            const p1 = pt.clone().add(normal.clone().multiplyScalar(-frostWidth / 2));
            const p2 = pt.clone().add(normal.clone().multiplyScalar(frostWidth / 2));

            const yFrost = p1.y + yOffset + 0.01;
            frostVertices.push(p1.x, yFrost, p1.z, p2.x, yFrost, p2.z);
            const v = i / segments * (length / frostWidth);
            frostUVs.push(0, v, 1, v);
            if (i < pointsList.length - 1) {
                const b = i * 2;
                frostIndices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
            }
        }
        const frostGeo = new THREE.BufferGeometry();
        frostGeo.setAttribute('position', new THREE.Float32BufferAttribute(frostVertices, 3));
        frostGeo.setAttribute('uv', new THREE.Float32BufferAttribute(frostUVs, 2));
        frostGeo.setIndex(frostIndices);
        frostGeo.computeVertexNormals();
        const frostMesh = new THREE.Mesh(frostGeo, MATERIALS.frost);
        frostMesh.renderOrder = 1;
        frostMesh.receiveShadow = true;
        ctx.scene.add(frostMesh);

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
    createWaterStream: (ctx: SectorContext, points: THREE.Vector3[], width: number) => {
        const curve = PathGenerator.createPointPath(ctx, points, width, new THREE.MeshStandardMaterial({
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
    createRoad: (ctx: SectorContext, points: THREE.Vector3[], width: number = 10,
        material?: THREE.Material, hasMarkings?: boolean, strict: boolean = false) => {

        let curve: THREE.Curve<THREE.Vector3>;
        if (strict) {
            const c = new THREE.CatmullRomCurve3(points);
            c.curveType = 'centripetal';
            curve = c;
        } else {
            const path = new THREE.CurvePath<THREE.Vector3>();
            for (let i = 0; i < points.length - 1; i++) {
                path.add(new THREE.LineCurve3(points[i], points[i + 1]));
            }
            curve = path;
        }

        return PathGenerator.createPointPath(ctx, points, width, material || MATERIALS.asphalt, 'ROAD', false, false, strict);
    },

    createGravelRoad: (ctx: SectorContext, points: THREE.Vector3[], width: number = 10, strict: boolean = false) => {
        return PathGenerator.createRoad(ctx, points, width, MATERIALS.gravel, false, strict);
    },

    createDirtRoad: (ctx: SectorContext, points: THREE.Vector3[], width: number = 10, strict: boolean = false) => {
        return PathGenerator.createRoad(ctx, points, width, MATERIALS.dirt, false, strict);
    },

    /**
     * Creates a walking path (default asphalt).
     */
    createPath: (ctx: SectorContext, points: THREE.Vector3[], width: number = 4, material?: THREE.Material, showBlood?: boolean, showFootprints?: boolean, strict: boolean = false) => {
        return PathGenerator.createPointPath(ctx, points, width, material || MATERIALS.asphalt, 'PATH', showBlood, showFootprints, strict);
    },

    createGravelPath: (ctx: SectorContext, points: THREE.Vector3[], width: number = 4, showBlood?: boolean, showFootprints?: boolean, strict?: boolean) => {
        return PathGenerator.createPointPath(ctx, points, width, MATERIALS.gravel, 'PATH', showBlood, showFootprints, strict);
    },

    /**
     * Creates a dirt or snow path with optional footprint details.
     */
    createDirtPath: (ctx: SectorContext, points: THREE.Vector3[], width: number = 4, showBlood?: boolean, showFootprints?: boolean, strict?: boolean) => {
        return PathGenerator.createPointPath(ctx, points, width, MATERIALS.dirt, 'PATH', showBlood, showFootprints, strict);
    },

    /**
     * Creates a path made entirely of decals (e.g., footprints).
     */
    createDecalPath: (ctx: SectorContext, points: THREE.Vector3[], options: { spacing: number, size: number, material: THREE.Material, variance?: number, color?: number, randomRotation?: boolean, yOffset?: number }) => {
        const curve = new THREE.CatmullRomCurve3(points);
        // Curve type centripetal to avoid loops
        curve.curveType = 'centripetal';
        const length = curve.getLength();

        const count = Math.ceil(length / options.spacing);
        const pointsList = curve.getSpacedPoints(count);

        const geo = new THREE.PlaneGeometry(options.size, options.size * 1.5); // Aspect ratio for footprints
        const mat = options.material.clone();
        if ('color' in mat && options.color !== undefined) (mat as any).color.setHex(options.color);

        // Using InstancedMesh for performance
        const mesh = new THREE.InstancedMesh(geo, mat, count);
        mesh.renderOrder = 5;
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

            const yOff = options.yOffset !== undefined ? options.yOffset : 0.04;
            dummy.position.set(pt.x + jx, pt.y + yOff, pt.z + jz); // Above path (Default 0.04)

            // Orient
            if (options.randomRotation) {
                dummy.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
            } else {
                // Orient along path + 90 deg rotation because texture is usually upright
                dummy.lookAt(pt.x + tangent.x, pt.y + tangent.y + yOff, pt.z + tangent.z);
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
            yOffset: 0.12 // Higher to clear roads
        });
    },

    createFootprintPath: (ctx: SectorContext, points: THREE.Vector3[], spacing: number = 0.5, size: number = 0.5) => {
        PathGenerator.createDecalPath(ctx, points, {
            spacing,
            size,
            material: MATERIALS.footprintDecal,
            variance: 0.2,
            randomRotation: false
        });
    },

    createFence: (ctx: SectorContext, points: THREE.Vector3[], color: 'white' | 'wood' | 'black' | 'mesh' = 'wood', height: number = 1.2, strict: boolean = false) => {
        let pointsList: THREE.Vector3[];

        if (strict) {
            const curve = new THREE.CurvePath<THREE.Vector3>();
            for (let i = 0; i < points.length - 1; i++) {
                curve.add(new THREE.LineCurve3(points[i], points[i + 1]));
            }
            const length = curve.getLength();
            const steps = Math.ceil(length / 2.0);
            pointsList = curve.getSpacedPoints(steps);
        } else {
            const curve = new THREE.CatmullRomCurve3(points);
            const length = curve.getLength();
            const steps = Math.ceil(length / 2.0);
            pointsList = curve.getSpacedPoints(steps);
        }

        const colorHex = color === 'white' ? 0xffffff : (color === 'black' ? 0x333333 : 0x4a3728);

        for (let i = 0; i < pointsList.length - 1; i++) {
            const curr = pointsList[i];
            const next = pointsList[i + 1];
            const vec = new THREE.Vector3().subVectors(next, curr);
            const dist = vec.length();
            const mid = new THREE.Vector3().addVectors(curr, next).multiplyScalar(0.5);

            // Create fence segment
            const fence = color === 'mesh' ? ObjectGenerator.createMeshFence(dist, height) : ObjectGenerator.createFence(dist);
            fence.position.copy(mid);
            fence.lookAt(next.x, mid.y, next.z);

            // Apply Height Scaling (if not mesh, as mesh uses height param)
            if (color !== 'mesh' && height !== 1.2) {
                const scaleY = height / 1.2;
                fence.scale.y = scaleY;
            }

            // Apply Color
            if (color !== 'wood' && color !== 'mesh') {
                fence.traverse((child: any) => {
                    if (child.isMesh) {
                        child.material = child.material.clone();
                        child.material.color.setHex(colorHex);
                    }
                });
            }

            ctx.scene.add(fence);

            // Collision
            ctx.obstacles.push({
                mesh: fence,
                collider: { type: 'box', size: new THREE.Vector3(0.2, height, dist) }
            });
        }
    },

    /**
     * Creates a hedge along a path.
     */
    createHedge: (ctx: SectorContext, points: THREE.Vector3[], height: number = 4, thickness: number = 1.5) => {
        const curve = new THREE.CatmullRomCurve3(points);
        const length = curve.getLength();
        const steps = Math.ceil(length / 2.0);
        const pointsList = curve.getSpacedPoints(steps);

        for (let i = 0; i < pointsList.length - 1; i++) {
            const curr = pointsList[i];
            const next = pointsList[i + 1];
            const mid = new THREE.Vector3().addVectors(curr, next).multiplyScalar(0.5);

            const hedge = ObjectGenerator.createHedge(2.2, height, thickness);
            hedge.position.copy(mid);
            hedge.lookAt(next.x, mid.y, next.z);
            ctx.scene.add(hedge);

            ctx.obstacles.push({
                mesh: hedge,
                collider: { type: 'box', size: new THREE.Vector3(thickness, height, 2.2) }
            });
        }
    },

    /**
     * Creates a stone wall along a path.
     */
    createStoneWall: (ctx: SectorContext, points: THREE.Vector3[], height: number = 1.5, thickness: number = 0.8) => {
        const curve = new THREE.CatmullRomCurve3(points);
        const length = curve.getLength();
        const steps = Math.ceil(length / 1.5); // Adjusted steps for potentially denser stone wall segments
        const pointsList = curve.getSpacedPoints(steps);

        for (let i = 0; i < pointsList.length - 1; i++) {
            const curr = pointsList[i];
            const next = pointsList[i + 1];
            const mid = new THREE.Vector3().addVectors(curr, next).multiplyScalar(0.5);
            const dist = curr.distanceTo(next);

            const wall = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, dist), MATERIALS.stone);
            wall.position.copy(mid);
            wall.lookAt(next.x, mid.y, next.z);
            ctx.scene.add(wall);
            ctx.obstacles.push({ mesh: wall, collider: { type: 'box', size: new THREE.Vector3(thickness, height, dist) } });
        }
    },

    /**
     * Creates a metal guardrail along a path.
     */
    /**
     * Creates a metal guardrail along a path.
     * @param floating If true, guardrail is elevated and collision only covers the rail itself, not the ground below.
     */
    createGuardrail: (ctx: SectorContext, points: THREE.Vector3[], floating: boolean = false) => {
        const curve = new THREE.CatmullRomCurve3(points);
        const length = curve.getLength();
        // Posts every 2 meters
        const steps = Math.ceil(length / 2.0);
        const pointsList = curve.getSpacedPoints(steps);

        const postGeo = new THREE.CylinderGeometry(0.1, 0.1, 1.0, 6);
        const railGeo = new THREE.BoxGeometry(0.15, 0.3, 1); // scalable Z

        for (let i = 0; i < pointsList.length; i++) {
            // Post
            const pt = pointsList[i];
            const post = new THREE.Mesh(postGeo, MATERIALS.guardrail);
            post.position.copy(pt).add(new THREE.Vector3(0, 0.5, 0));
            post.castShadow = true;
            ctx.scene.add(post);

            // Rail segment to next point
            if (i < pointsList.length - 1) {
                const next = pointsList[i + 1];
                const mid = new THREE.Vector3().addVectors(pt, next).multiplyScalar(0.5);
                const dist = pt.distanceTo(next);

                const rail = new THREE.Mesh(railGeo, MATERIALS.guardrail);
                rail.position.copy(mid).add(new THREE.Vector3(0, 0.8, 0)); // 0.8m height
                rail.scale.z = dist; // Stretch to fit
                rail.lookAt(next.x, mid.y + 0.8, next.z);
                rail.castShadow = true;
                ctx.scene.add(rail);

                // Collision
                // If floating, we only collide with the rail itself (high up).
                // If NOT floating, we extend the collider to the ground.
                const collHeight = floating ? 0.3 : (mid.y + 1.0);
                const collY = floating ? (mid.y + 0.8) : (collHeight / 2);

                const colGeo = new THREE.BoxGeometry(0.2, collHeight, dist);
                const colMesh = new THREE.Mesh(colGeo);
                colMesh.position.set(mid.x, collY, mid.z);
                colMesh.lookAt(next.x, collY, next.z);
                colMesh.visible = false;
                ctx.scene.add(colMesh);

                ctx.obstacles.push({
                    mesh: colMesh,
                    collider: { type: 'box', size: new THREE.Vector3(0.2, collHeight, dist) }
                });
            }
        }
    },

    /**
     * Creates a steep-sided mound (embankment) along a path.
     */
    createEmbankment: (ctx: SectorContext, points: THREE.Vector3[], width: number = 20, height: number = 5, material: THREE.Material = MATERIALS.dirt) => {
        // Create a straight-line path for strict embankment control (overpass usually straight)
        const curve = new THREE.CatmullRomCurve3(points);
        curve.curveType = 'centripetal';
        const length = curve.getLength();
        const segments = Math.ceil(length / 2);
        const pointsList = curve.getSpacedPoints(segments);

        const vertices: number[] = [];
        const indices: number[] = [];
        const uvs: number[] = [];

        for (let i = 0; i < pointsList.length; i++) {
            const pt = pointsList[i];
            let tangent = new THREE.Vector3();
            if (i === 0) {
                if (pointsList.length > 1) tangent.subVectors(pointsList[1], pt).normalize();
            } else if (i === pointsList.length - 1) {
                tangent.subVectors(pt, pointsList[i - 1]).normalize();
            } else {
                tangent.subVectors(pointsList[i + 1], pointsList[i - 1]).normalize();
            }

            const up = new THREE.Vector3(0, 1, 0);
            const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

            // Trapezoidal Layout
            // Top Width (Road Bed)
            const topW = width * 1.0;
            // Bottom Width (Base of slope) -> Significantly wider to create the slope
            const botW = width * 1.2; // Slope ratio ~1:1 or 1:1.5 depending on height

            const bl = pt.clone().add(normal.clone().multiplyScalar(-botW / 2)).setY(0.1);
            const tl = pt.clone().add(normal.clone().multiplyScalar(-topW / 2)).setY(height);
            const tr = pt.clone().add(normal.clone().multiplyScalar(topW / 2)).setY(height);
            const br = pt.clone().add(normal.clone().multiplyScalar(botW / 2)).setY(0.1);

            vertices.push(bl.x, bl.y, bl.z, tl.x, tl.y, tl.z, tr.x, tr.y, tr.z, br.x, br.y, br.z);

            // Correct UV Mapping with proper tiling along length
            const tilingFactor = 2.0; // Increased tiling for gravel density
            const v = (i / segments) * (length / width) * tilingFactor;

            // Map UVs to follow the profile: 0->0.3(slope)->0.7(top)->1.0(slope)
            uvs.push(0, v, 0.3, v, 0.7, v, 1, v);

            if (i > 0) {
                const off = (i - 1) * 4;
                const curr = i * 4;
                // Left Slope
                indices.push(off + 0, curr + 0, off + 1, off + 1, curr + 0, curr + 1);
                // Top Roadbed
                indices.push(off + 1, curr + 1, off + 2, off + 2, curr + 1, curr + 2);
                // Right Slope
                indices.push(off + 2, curr + 2, off + 3, off + 3, curr + 2, curr + 3);
                // Bottom
                indices.push(off + 3, curr + 3, off + 0, off + 0, curr + 3, curr + 0);
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

        // Add End Caps (Start and End of the segment)
        const lastIdx = (pointsList.length - 1) * 4;
        // Start Cap (face backwards)
        indices.push(0, 1, 2, 0, 2, 3);
        // End Cap (face forward)
        indices.push(lastIdx + 0, lastIdx + 2, lastIdx + 1, lastIdx + 0, lastIdx + 3, lastIdx + 2);

        geo.setIndex(indices);
        geo.computeVertexNormals();

        // Use the passed material or fallback to dirt, then clone and apply DoubleSide
        const finalMat = (material || MATERIALS.dirt).clone();
        finalMat.side = THREE.DoubleSide;

        const mesh = new THREE.Mesh(geo, finalMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        ctx.scene.add(mesh);

        const colSteps = Math.ceil(length / 5);
        for (let i = 0; i < colSteps; i++) {
            const t = (i + 0.5) / colSteps;
            const pt = curve.getPoint(t);
            const tan = curve.getTangent(t);
            const colLen = (length / colSteps) * 1.05; // Slight overlap

            // Reduced collider width to prevent blocking underlying paths (e.g. tunnels)
            const colWidth = width * 0.8;

            const col = new THREE.Mesh(new THREE.BoxGeometry(colWidth, height, colLen));
            col.position.copy(pt).setY(height / 2);
            col.lookAt(pt.clone().add(tan).setY(height / 2));

            col.visible = false; // Always invisible, only for physics and internal debug
            col.updateMatrixWorld();
            ctx.scene.add(col);
            ctx.obstacles.push({ mesh: col, collider: { type: 'box', size: new THREE.Vector3(colWidth, height, colLen) } });
        }
    },

    /**
     * Creates a concrete arch train tunnel along a path.
     */
    createTrainTunnel: (ctx: SectorContext, points: THREE.Vector3[]) => {
        const tunnelWidthOuter = 16;
        const tunnelHeightWalls = 7;
        const tunnelArchRise = 5;
        const tunnelThickness = 2;
        const tunnelDepth = 30;

        const start = points[0];
        const end = points[points.length - 1];
        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

        const halfWidthO = tunnelWidthOuter / 2;
        const controlPointY_O = tunnelHeightWalls + (tunnelArchRise * 2);
        const group = new THREE.Group();
        group.position.copy(mid);
        group.lookAt(end);
        group.rotateY(Math.PI / 2); // Orient arch correctly

        const archShape = new THREE.Shape();
        archShape.moveTo(-halfWidthO, 0);
        archShape.lineTo(-halfWidthO, tunnelHeightWalls);
        archShape.quadraticCurveTo(0, controlPointY_O, halfWidthO, tunnelHeightWalls);
        archShape.lineTo(halfWidthO, 0);
        archShape.lineTo(-halfWidthO, 0);

        const halfWidthI = halfWidthO - tunnelThickness;
        const wallHeightI = tunnelHeightWalls;
        const controlPointY_I = controlPointY_O - tunnelThickness;

        const holePath = new THREE.Path();
        holePath.moveTo(halfWidthI, 0);
        holePath.lineTo(halfWidthI, wallHeightI);
        holePath.quadraticCurveTo(0, controlPointY_I, -halfWidthI, wallHeightI);
        holePath.lineTo(-halfWidthI, 0);
        holePath.lineTo(halfWidthI, 0);

        archShape.holes.push(holePath);

        const archGeo = new THREE.ExtrudeGeometry(archShape, { depth: tunnelDepth, steps: 1, bevelEnabled: false });
        archGeo.translate(0, 0, -tunnelDepth / 2); // Center along depth

        const tunnelMat = MATERIALS.concrete.clone();
        tunnelMat.side = THREE.DoubleSide;
        const arch = new THREE.Mesh(archGeo, tunnelMat);
        group.add(arch);

        const floorGeo = new THREE.PlaneGeometry(halfWidthI * 2, tunnelDepth);
        const gravelMat = MATERIALS.gravel.clone();
        if (gravelMat.map) {
            gravelMat.map.wrapS = gravelMat.map.wrapT = THREE.RepeatWrapping;
            gravelMat.map.repeat.set(halfWidthI, tunnelDepth / 2);
        }
        const floor = new THREE.Mesh(floorGeo, gravelMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0.02;
        group.add(floor);

        ctx.scene.add(group);
    }
};
