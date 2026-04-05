import * as THREE from 'three';
import { SectorContext } from '../../../game/session/SectorTypes';
import { MATERIALS } from '../../../utils/assets';
import { ObjectGenerator } from './ObjectGenerator';
import { SectorBuilder } from '../SectorBuilder';
import { VegetationGenerator } from './VegetationGenerator';
import { MaterialType, MATERIAL_TYPE } from '../../../content/environment';
import { GeneratorUtils } from './GeneratorUtils';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _pos = new THREE.Vector3(); // Added missing scratchpad for positions
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _matrix = new THREE.Matrix4();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();

let pathLayer = 0; // Incremental Y-offset to prevent Z-fighting

// --- CACHED ASSETS (ZERO-GC VRAM) ---
const SHARED_GEO = {
    box: new THREE.BoxGeometry(1, 1, 1),
    plane: new THREE.PlaneGeometry(1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 8).rotateX(Math.PI / 2) // Orient for rails
};

/**
 * PathGenerator
 * Handles procedural generation of linear world elements.
 */
export const PathGenerator = {
    /**
     * Resets stacking layers. Call at sector start.
     */
    resetPathLayer() {
        pathLayer = 0;
    },

    /**
     * Calculates points offset from a spline path along its normal.
     */
    getOffsetPoints: (points: THREE.Vector3[], offset: number): THREE.Vector3[] => {
        const result: THREE.Vector3[] = [];
        for (let i = 0; i < points.length; i++) {
            const pt = points[i];
            if (i < points.length - 1) _v1.subVectors(points[i + 1], pt).normalize();
            else if (i > 0) _v1.subVectors(pt, points[i - 1]).normalize();
            else _v1.set(0, 0, 1);

            _v2.crossVectors(_v1, _up).normalize();
            // Expected clone() here to generate actual unique points for the path
            result.push(pt.clone().addScaledVector(_v2, offset));
        }
        return result;
    },

    /**
     * Creates invisible collision walls.
     */
    createBoundry: (ctx: SectorContext, points: THREE.Vector3[], name: string = 'BoundryWall') => {
        const height = 50;
        const thickness = 4.0; // Increased from 2.0 to prevent clipping

        const consolidated = points;

        for (let i = 0; i < consolidated.length - 1; i++) {
            const curr = consolidated[i];
            const next = consolidated[i + 1];
            _v1.subVectors(next, curr);
            const len = _v1.length();
            const angle = Math.atan2(next.x - curr.x, next.z - curr.z);
            _v2.addVectors(curr, next).multiplyScalar(0.5);

            _quat.setFromAxisAngle(_up, angle);

            SectorBuilder.addObstacle(ctx, {
                position: _v2.clone().setY(height / 2),
                quaternion: _quat.clone(),
                collider: { type: 'box', size: new THREE.Vector3(thickness, height, len) },
                type: 'Boundary',
                id: `${name}_${i}`,
                materialId: MaterialType.CONCRETE
            });
        }
    },

    /**
     * Generates a complete railway track.
     */
    createRailTrack: (ctx: SectorContext, points: THREE.Vector3[]) => {
        const curve = new THREE.CatmullRomCurve3(points);
        curve.curveType = 'centripetal';
        const length = curve.getLength();
        const segments = Math.ceil(length / 0.5);
        const pointsList = curve.getSpacedPoints(segments);

        const buildRibbon = (pts: THREE.Vector3[], w: number, y: number, mat: THREE.Material, name: string, materialId: MATERIAL_TYPE) => {
            const v: number[] = [], uv: number[] = [], idx: number[] = [];
            for (let i = 0; i < pts.length; i++) {
                const pt = pts[i];
                if (i < pts.length - 1) _v1.subVectors(pts[i + 1], pt).normalize();
                else _v1.subVectors(pt, pts[i - 1]).normalize();
                _v2.crossVectors(_v1, _up).normalize();

                _v3.copy(pt).addScaledVector(_v2, -w / 2);
                v.push(_v3.x, _v3.y + y, _v3.z);
                _v3.copy(pt).addScaledVector(_v2, w / 2);
                v.push(_v3.x, _v3.y + y, _v3.z);

                const u = i / segments * (length / w);
                uv.push(0, u, 1, u);

                if (i < pts.length - 1) {
                    const b = i * 2;
                    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
                }
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
            geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
            geo.setIndex(idx);
            geo.computeVertexNormals();

            const mesh = new THREE.Mesh(geo, mat);
            mesh.name = `Ground_${name}`; // VINTERDÖD: Mandatory naming
            mesh.receiveShadow = true;
            mesh.userData.materialId = materialId; // VINTERDÖD: Unified tagging

            // VINTERDÖD: Freeze ribbon matrix
            GeneratorUtils.freezeStatic(mesh);

            ctx.scene.add(mesh);
        };

        buildRibbon(pointsList, 4.5, 0.05, MATERIALS.gravel, 'RailGravel', MaterialType.GRAVEL);
        buildRibbon(pointsList, 5.5, 0.01, MATERIALS.frost, 'RailFrost', MaterialType.SNOW);

        // Sleepers
        const sleeperSpacing = 0.8;
        const sleeperCount = Math.floor(length / sleeperSpacing);
        const sleeperPoints = curve.getSpacedPoints(sleeperCount);

        const sleeperIM = new THREE.InstancedMesh(SHARED_GEO.box, MATERIALS.brownBrick, sleeperCount + 1);
        GeneratorUtils.freezeStatic(sleeperIM);

        for (let i = 0; i < sleeperPoints.length; i++) {
            const pt = sleeperPoints[i];
            if (i < sleeperPoints.length - 1) _v1.subVectors(sleeperPoints[i + 1], pt).normalize();
            else _v1.subVectors(pt, sleeperPoints[i - 1]).normalize();

            _matrix.lookAt(pt, _v3.copy(pt).add(_v1), _up);
            _quat.setFromRotationMatrix(_matrix);

            // VINTERDÖD: Fixed GC leak (pt.clone().setY() -> _pos.copy(pt).setY())
            _matrix.compose(_pos.copy(pt).setY(0.08), _quat, _v2.set(3.0, 0.15, 0.4));
            sleeperIM.setMatrixAt(i, _matrix);
        }
        sleeperIM.instanceMatrix.needsUpdate = true;
        ctx.scene.add(sleeperIM);

        // Rails
        const railMat = MATERIALS.blackMetal.clone();
        (railMat as any).metalness = 0.9;
        buildRibbon(PathGenerator.getOffsetPoints(pointsList, -1.0), 0.2, 0.08, railMat, 'Rail_L', MaterialType.METAL);
        buildRibbon(PathGenerator.getOffsetPoints(pointsList, 1.0), 0.2, 0.08, railMat, 'Rail_R', MaterialType.METAL);

        const railPts = curve.getSpacedPoints(20);
        for (let i = 0; i < railPts.length; i++) {
            const p = railPts[i];
            ctx.mapItems.push({ id: `rail_${Math.random()}`, x: p.x, z: p.z, type: 'ROAD', label: null, icon: null, radius: 2, color: '#333' });
        }
        return curve;
    },

    /**
     * Core path generation.
     */
    createPointPath: (ctx: SectorContext, points: THREE.Vector3[], width: number, material: THREE.Material, materialId: MATERIAL_TYPE, type: string = 'ROAD', showBlood: boolean = false, showFootprints: boolean = false, strict: boolean = false) => {
        const curve = new THREE.CatmullRomCurve3(points);
        curve.curveType = strict ? 'centripetal' : 'catmullrom';
        const length = curve.getLength();
        const segments = Math.ceil(length / 2);
        const pts = curve.getSpacedPoints(segments);

        pathLayer++;
        const yOff = 0.03 + (pathLayer * 0.001);
        const v: number[] = [], uv: number[] = [], idx: number[] = [];

        for (let i = 0; i < pts.length; i++) {
            const pt = pts[i];
            if (i === 0) _v1.subVectors(pts[1], pt).normalize();
            else if (i === pts.length - 1) _v1.subVectors(pt, pts[i - 1]).normalize();
            else _v1.subVectors(pts[i + 1], pts[i - 1]).normalize();

            _v2.crossVectors(_v1, _up).normalize();
            _v3.copy(pt).addScaledVector(_v2, -width / 2);
            v.push(_v3.x, _v3.y + yOff, _v3.z);
            _v3.copy(pt).addScaledVector(_v2, width / 2);
            v.push(_v3.x, _v3.y + yOff, _v3.z);

            const uCoord = i / segments * (length / width);
            uv.push(0, uCoord, 1, uCoord);

            if (i < pts.length - 1) {
                const b = i * 2;
                idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
            }

            if ((showBlood || showFootprints) && i % 6 === 0) {
                const decal = new THREE.Mesh(SHARED_GEO.plane, showBlood ? MATERIALS.bloodStainDecal : MATERIALS.footprintDecal);
                decal.position.set(pt.x + (Math.random() - 0.5), yOff + 0.01, pt.z + (Math.random() - 0.5));
                decal.rotation.x = -Math.PI / 2;
                decal.rotation.z = Math.random() * Math.PI * 2;
                decal.scale.setScalar(0.5 + Math.random() * 0.5);

                // VINTERDÖD: Freeze decal matrices
                GeneratorUtils.freezeStatic(decal);

                ctx.scene.add(decal);
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.setIndex(idx);
        geo.computeVertexNormals();

        const mesh = new THREE.Mesh(geo, material);
        mesh.name = `Ground_${type}_${Math.random().toString(36).substr(2, 4)}`; // VINTERDÖD
        mesh.userData.materialId = materialId;
        mesh.renderOrder = 2;
        mesh.receiveShadow = true;

        // VINTERDÖD: Freeze path matrix
        GeneratorUtils.freezeStatic(mesh);

        ctx.scene.add(mesh);

        for (let i = 0; i < pts.length; i += 10) {
            const p = pts[i];
            ctx.mapItems.push({ id: `path_${Math.random()}`, x: p.x, z: p.z, type: 'ROAD', label: null, icon: null, radius: width / 2, color: type === 'ROAD' ? '#444' : '#6b5a4a' });
        }
        return curve;
    },

    createRoad: (ctx: SectorContext, points: THREE.Vector3[], width: number = 10, material?: THREE.Material, materialId: MATERIAL_TYPE = MaterialType.ASPHALT, strict: boolean = false) => {
        return PathGenerator.createPointPath(ctx, points, width, material || MATERIALS.asphalt, materialId, 'ROAD', false, false, strict);
    },

    createGravelRoad: (ctx: SectorContext, points: THREE.Vector3[], width: number = 10, strict: boolean = false) => {
        return PathGenerator.createRoad(ctx, points, width, MATERIALS.gravel, MaterialType.GRAVEL, strict);
    },

    createDirtRoad: (ctx: SectorContext, points: THREE.Vector3[], width: number = 10, strict: boolean = false) => {
        return PathGenerator.createRoad(ctx, points, width, MATERIALS.dirt, MaterialType.DIRT, strict);
    },

    createPath: (ctx: SectorContext, points: THREE.Vector3[], width: number = 4, material?: THREE.Material, materialId: MATERIAL_TYPE = MaterialType.DIRT, showBlood?: boolean, showFootprints?: boolean, strict: boolean = false) => {
        return PathGenerator.createPointPath(ctx, points, width, material || MATERIALS.dirt, materialId, 'PATH', showBlood, showFootprints, strict);
    },

    createGravelPath: (ctx: SectorContext, points: THREE.Vector3[], width: number = 4, blood?: boolean, steps?: boolean, strict?: boolean) => {
        return PathGenerator.createPath(ctx, points, width, MATERIALS.gravel, MaterialType.GRAVEL, blood, steps, strict);
    },

    createDirtPath: (ctx: SectorContext, points: THREE.Vector3[], width: number = 4, blood?: boolean, steps?: boolean, strict?: boolean) => {
        return PathGenerator.createPath(ctx, points, width, MATERIALS.dirt, MaterialType.DIRT, blood, steps, strict);
    },

    createDecalPath: (ctx: SectorContext, points: THREE.Vector3[], options: { spacing: number, size: number, material: THREE.Material, variance?: number, color?: number, randomRotation?: boolean, yOffset?: number }) => {
        const curve = new THREE.CatmullRomCurve3(points);
        curve.curveType = 'centripetal';
        const length = curve.getLength();
        const count = Math.ceil(length / options.spacing);
        const pts = curve.getSpacedPoints(count);

        const mat = options.material.clone();
        if (options.color !== undefined) (mat as any).color.setHex(options.color);

        const im = new THREE.InstancedMesh(SHARED_GEO.plane, mat, count);
        im.renderOrder = 5;

        // VINTERDÖD: Freeze InstancedMesh
        GeneratorUtils.freezeStatic(im);

        for (let i = 0; i < pts.length; i++) {
            const pt = pts[i];
            if (i < pts.length - 1) _v1.subVectors(pts[i + 1], pt).normalize();
            else if (i > 0) _v1.subVectors(pt, pts[i - 1]).normalize();

            const varVal = options.variance || 0;
            const y = options.yOffset !== undefined ? options.yOffset : 0.04;

            _v2.set(pt.x + (Math.random() - 0.5) * varVal, pt.y + y, pt.z + (Math.random() - 0.5) * varVal);

            if (options.randomRotation) {
                _quat.setFromEuler(_euler.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2));
            } else {
                _matrix.lookAt(_v2, _v3.copy(pt).add(_v1), _up);
                _quat.setFromRotationMatrix(_matrix);
                _quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));

                if (i % 2 === 0) _v2.addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(_quat), 0.2);
                else _v2.addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(_quat), -0.2);
            }

            _matrix.compose(_v2, _quat, _v3.set(options.size, options.size * 1.5, 1));
            im.setMatrixAt(i, _matrix);
        }
        im.instanceMatrix.needsUpdate = true;
        ctx.scene.add(im);
    },

    createBloodPath: (ctx: SectorContext, points: THREE.Vector3[], spacing = 0.5, size = 0.8) => {
        PathGenerator.createDecalPath(ctx, points, { spacing, size, material: MATERIALS.bloodDecal, variance: 0.4, yOffset: 0.12 });
    },

    createFootprintPath: (ctx: SectorContext, points: THREE.Vector3[], spacing = 0.5, size = 0.5) => {
        PathGenerator.createDecalPath(ctx, points, { spacing, size, material: MATERIALS.footprintDecal, variance: 0.2, randomRotation: false });
    },

    createFence: (ctx: SectorContext, points: THREE.Vector3[], color: 'white' | 'wood' | 'black' | 'mesh' = 'wood', height: number = 1.2, strict: boolean = false) => {
        const curve = new THREE.CatmullRomCurve3(points);
        if (strict) curve.curveType = 'centripetal';
        const length = curve.getLength();
        const steps = Math.ceil(length / 2.0);

        const proto = color === 'mesh' ? ObjectGenerator.createMeshFence(length / steps, height) : ObjectGenerator.createFence(length / steps);
        const parts: { mesh: any, mat: THREE.Matrix4 }[] = [];
        proto.traverse((c: any) => { if (c.isMesh) { c.updateMatrix(); parts.push({ mesh: c, mat: c.matrix.clone() }); } });

        const instanceData: { im: THREE.InstancedMesh, part: { mesh: any, mat: THREE.Matrix4 } }[] = [];
        for (let k = 0; k < parts.length; k++) {
            const p = parts[k];
            const im = new THREE.InstancedMesh(p.mesh.geometry, p.mesh.material, steps);
            GeneratorUtils.freezeStatic(im);

            if (color !== 'wood' && color !== 'mesh') {
                const m = p.mesh.material.clone();
                m.color.setHex(color === 'white' ? 0xffffff : 0x222222);
                im.material = m;
            }
            instanceData.push({ im, part: p });
            ctx.scene.add(im);
        }

        let i = 0;
        GeneratorUtils.distributeAlongPath(points, 2.0, strict, (mid, angle, dist) => {
            for (let k = 0; k < instanceData.length; k++) {
                const { im, part } = instanceData[k];
                _quat.setFromAxisAngle(_up, angle);
                _matrix.compose(mid, _quat, _v3.set(1, height / 1.2, 1));
                _matrix.multiply(part.mat);
                im.setMatrixAt(i, _matrix);
                im.instanceMatrix.needsUpdate = true;
            }

            SectorBuilder.addObstacle(ctx, {
                position: mid.clone(),
                quaternion: _quat.clone(),
                collider: { type: 'box', size: new THREE.Vector3(0.2, height, dist) },
                materialId: color === 'mesh' ? MaterialType.METAL : MaterialType.WOOD
            });
            i++;
        });
    },

    createHedge: (ctx: SectorContext, points: THREE.Vector3[], height: number = 4, thickness: number = 1.5) => {
        const curve = new THREE.CatmullRomCurve3(points);
        const steps = Math.ceil(curve.getLength() / 2.0);
        const proto = VegetationGenerator.createHedge(2.2, height, thickness);
        const parts: { mesh: any, mat: THREE.Matrix4 }[] = [];
        proto.traverse((c: any) => { if (c.isMesh) { c.updateMatrix(); parts.push({ mesh: c, mat: c.matrix.clone() }); } });

        const instanceData: { im: THREE.InstancedMesh, part: { mesh: any, mat: THREE.Matrix4 } }[] = [];
        for (let k = 0; k < parts.length; k++) {
            const p = parts[k];
            const im = new THREE.InstancedMesh(p.mesh.geometry, p.mesh.material, steps);
            GeneratorUtils.freezeStatic(im);
            instanceData.push({ im, part: p });
            ctx.scene.add(im);
        }

        let i = 0;
        GeneratorUtils.distributeAlongPath(points, 2.0, false, (mid, angle, dist) => {
            for (let k = 0; k < instanceData.length; k++) {
                const { im, part } = instanceData[k];
                _quat.setFromAxisAngle(_up, angle);
                _matrix.compose(mid, _quat, _v3.set(1, 1, 1));
                _matrix.multiply(part.mat);
                im.setMatrixAt(i, _matrix);
                im.instanceMatrix.needsUpdate = true;
            }

            SectorBuilder.addObstacle(ctx, {
                position: mid.clone(),
                quaternion: _quat.clone(), // already set above
                collider: { type: 'box', size: new THREE.Vector3(thickness, height, 2.2) },
                materialId: MaterialType.WOOD
            });
            i++;
        });
    },

    createStoneWall: (ctx: SectorContext, points: THREE.Vector3[], height: number = 1.5, thickness: number = 0.8) => {
        const curve = new THREE.CatmullRomCurve3(points);
        const dist = 1.5;
        const steps = Math.ceil(curve.getLength() / dist);

        const im = new THREE.InstancedMesh(SHARED_GEO.box, MATERIALS.stone, steps);
        GeneratorUtils.freezeStatic(im);

        let i = 0;
        GeneratorUtils.distributeAlongPath(points, dist, false, (mid, angle, segDist) => {
            _quat.setFromAxisAngle(_up, angle);
            mid.y += height / 2;
            _matrix.compose(mid, _quat, _v3.set(thickness, height, dist));
            im.setMatrixAt(i, _matrix);

            SectorBuilder.addObstacle(ctx, {
                position: mid.clone(),
                quaternion: _quat.clone(),
                collider: { type: 'box', size: new THREE.Vector3(thickness, height, dist) },
                materialId: MaterialType.STONE
            });
            i++;
        });

        im.instanceMatrix.needsUpdate = true;
        ctx.scene.add(im);
    },

    createGuardrail: (ctx: SectorContext, points: THREE.Vector3[], floating: boolean = false) => {
        const curve = new THREE.CatmullRomCurve3(points);
        const pts = curve.getSpacedPoints(Math.ceil(curve.getLength() / 2.0));

        const group = new THREE.Group();

        const postIM = new THREE.InstancedMesh(SHARED_GEO.cylinder, MATERIALS.blackMetal, pts.length);
        const railIM = new THREE.InstancedMesh(SHARED_GEO.box, MATERIALS.blackMetal, pts.length - 1);

        for (let i = 0; i < pts.length; i++) {
            _matrix.makeTranslation(pts[i].x, pts[i].y + 0.5, pts[i].z);
            _scale.set(0.2, 1.0, 0.2);
            _matrix.scale(_scale);
            postIM.setMatrixAt(i, _matrix);
        }

        for (let i = 0; i < pts.length - 1; i++) {
            const mid = _v1.addVectors(pts[i], pts[i + 1]).multiplyScalar(0.5).setY(pts[i].y + 0.8);
            const dist = pts[i].distanceTo(pts[i + 1]);
            _matrix.lookAt(mid, _v2.copy(pts[i + 1]).setY(mid.y), _up);
            _quat.setFromRotationMatrix(_matrix);
            _matrix.compose(mid, _quat, _v3.set(0.15, 0.3, dist));
            railIM.setMatrixAt(i, _matrix);

            _quat.setFromAxisAngle(_up, Math.atan2(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z));

            SectorBuilder.addObstacle(ctx, {
                position: mid.clone().setY(floating ? mid.y : mid.y / 2),
                quaternion: _quat.clone(),
                collider: { type: 'box', size: new THREE.Vector3(0.2, floating ? 0.3 : mid.y + 0.2, dist) },
                materialId: MaterialType.METAL
            });
        }
        postIM.instanceMatrix.needsUpdate = true;
        railIM.instanceMatrix.needsUpdate = true;
        
        group.add(postIM);
        group.add(railIM);

        // Optimized single-shot freeze on root group
        GeneratorUtils.freezeStatic(group);

        ctx.scene.add(group);
    },

    createEmbankment: (ctx: SectorContext, points: THREE.Vector3[], width: number = 20, height: number = 5, material: THREE.Material = MATERIALS.dirt) => {
        const curve = new THREE.CatmullRomCurve3(points);
        const segments = Math.ceil(curve.getLength() / 2);
        const pts = curve.getSpacedPoints(segments);
        const v: number[] = [], idx: number[] = [], uv: number[] = [];

        const _v1_local = new THREE.Vector3();
        const _v2_local = new THREE.Vector3();
        const _up_local = new THREE.Vector3(0, 1, 0);
        const _quat_local = new THREE.Quaternion();

        for (let i = 0; i < pts.length; i++) {
            const pt = pts[i];
            if (i < pts.length - 1) _v1_local.subVectors(pts[i + 1], pt).normalize();
            else _v1_local.subVectors(pt, pts[i - 1]).normalize();
            _v2_local.crossVectors(_v1_local, _up_local).normalize();

            const p1 = pt.clone().addScaledVector(_v2_local, (-width * 0.5) - 2.0).setY(0.1);
            const p2 = pt.clone().addScaledVector(_v2_local, -width * 0.2).setY(height);
            const p3 = pt.clone().addScaledVector(_v2_local, width * 0.2).setY(height);
            const p4 = pt.clone().addScaledVector(_v2_local, (width * 0.5) + 2.0).setY(0.1);

            v.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z, p4.x, p4.y, p4.z);

            const u = i / segments * (curve.getLength() / width);
            uv.push(0, u, 0.3, u, 0.7, u, 1, u);

            if (i > 0) {
                const o = (i - 1) * 4, c = i * 4;

                idx.push(
                    o, o + 1, c,
                    o + 1, c + 1, c,
                    o + 1, o + 2, c + 1,
                    o + 2, c + 2, c + 1,
                    o + 2, o + 3, c + 2,
                    o + 3, c + 3, c + 2
                );

                const pPrev = pts[i - 1];
                const pCurr = pts[i];
                const mid = _v1_local.addVectors(pPrev, pCurr).multiplyScalar(0.5);
                const angle = Math.atan2(pCurr.x - pPrev.x, pCurr.z - pPrev.z);
                const dist = pPrev.distanceTo(pCurr);

                _quat_local.setFromAxisAngle(_up_local, angle);

                SectorBuilder.addObstacle(ctx, {
                    position: mid.clone().setY(height / 2),
                    quaternion: _quat_local.clone(),
                    collider: { type: 'box', size: new THREE.Vector3(width + 4.0, height, dist) },
                    materialId: MaterialType.STONE
                });
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.setIndex(idx);

        geo.computeVertexNormals();
        geo.computeBoundingSphere();
        geo.computeBoundingBox();

        const mesh = new THREE.Mesh(geo, material);
        mesh.receiveShadow = true;

        // VINTERDÖD: Freeze matrix
        GeneratorUtils.freezeStatic(mesh);

        ctx.scene.add(mesh);
    },
};