import * as THREE from 'three';
import { MATERIALS } from '../../../utils/assets/materials';
import { SectorContext } from '../../../game/session/SectorTypes';
import { SectorBuilder } from '../SectorBuilder';
import { GeneratorUtils } from './GeneratorUtils';
import { PhysicsGroup } from '../CollisionResolution';
import { MaterialType } from '../../../content/environment';
import { InteractionShape } from '../../../systems/ui/UIEventBridge';
import { MapItemType } from '../../../components/ui/hud/HudTypes';
import { ChunkManager } from '../ChunkManager';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();
const _matrix = new THREE.Matrix4();
const _axisY = new THREE.Vector3(0, 1, 0);
const _axisX = new THREE.Vector3(1, 0, 0);

// --- SHARED CACHED GEOMETRIES (Zero-GC / Snap-to-Base) ---
// Translation is performed ONCE at initialization to ensure abs(pos.y) in wind shader is 0 at ground.
const _PLANE_GEO = new THREE.PlaneGeometry(1, 1);

// Static reset for path layers to prevent Z-fighting
let _pathLayerIndex = 0;

/**
 * Highly optimized, Zero-GC Ribbon Geometry Builder.
 * Avoids Array.push() by calculating exact buffer sizes upfront.
 */
const buildRibbonGeometry = (points: THREE.Vector3[], width: number, yOffset: number): THREE.BufferGeometry => {
    const segments = points.length;
    const vertices = new Float32Array(segments * 2 * 3); // 2 vertices per segment, 3 coords (x,y,z)
    const uvs = new Float32Array(segments * 2 * 2);      // 2 vertices per segment, 2 coords (u,v)
    const indices = new Uint16Array((segments - 1) * 6); // 2 triangles (6 indices) per segment gap

    let pathLength = 0;

    for (let i = 0; i < segments; i++) {
        const pt = points[i];

        // Calculate Forward Vector
        if (i < segments - 1) _v1.subVectors(points[i + 1], pt).normalize();
        else if (i > 0) _v1.subVectors(pt, points[i - 1]).normalize();
        else _v1.set(0, 0, 1);

        // Calculate Right Vector
        _v2.set(-_v1.z, 0, _v1.x).normalize();

        // Left Vertex
        _pos.copy(pt).addScaledVector(_v2, -width / 2);
        vertices[i * 6 + 0] = _pos.x;
        vertices[i * 6 + 1] = pt.y + yOffset;
        vertices[i * 6 + 2] = _pos.z;

        // Right Vertex
        _pos.copy(pt).addScaledVector(_v2, width / 2);
        vertices[i * 6 + 3] = _pos.x;
        vertices[i * 6 + 4] = pt.y + yOffset;
        vertices[i * 6 + 5] = _pos.z;

        // Calculate UVs based on world distance
        if (i > 0) pathLength += pt.distanceTo(points[i - 1]);
        const uCoord = pathLength / width;

        uvs[i * 4 + 0] = 0;
        uvs[i * 4 + 1] = uCoord;
        uvs[i * 4 + 2] = 1;
        uvs[i * 4 + 3] = uCoord;

        // Calculate Indices
        if (i < segments - 1) {
            const b = i * 2;
            const idxOffset = i * 6;
            indices[idxOffset + 0] = b;
            indices[idxOffset + 1] = b + 1;
            indices[idxOffset + 2] = b + 2;
            indices[idxOffset + 3] = b + 1;
            indices[idxOffset + 4] = b + 3;
            indices[idxOffset + 5] = b + 2;
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));

    geo.computeVertexNormals();
    geo.computeBoundingSphere(); // CRITICAL: Fixes the frustum culling bug!
    geo.computeBoundingBox();

    return geo;
};


export const PathGenerator = {

    resetPathLayer: () => {
        _pathLayerIndex = 0;
    },

    getOffsetPoints: (points: THREE.Vector3[], offset: number): THREE.Vector3[] => {
        if (points.length < 2) return [];
        const result: THREE.Vector3[] = [];

        for (let i = 0; i < points.length; i++) {
            const pt = points[i];
            const next = points[i + 1] || points[i];
            const prev = points[i - 1] || points[i];

            _v1.subVectors(next, prev).normalize();
            _v2.set(-_v1.z, 0, _v1.x).normalize();

            const newPt = new THREE.Vector3().copy(pt).addScaledVector(_v2, offset);
            result.push(newPt);
        }
        return result;
    },

    createBoundry: (ctx: SectorContext, polygon: THREE.Vector3[], name: string) => {
        if (!polygon || polygon.length < 2) return;
        const height = 50;
        const thickness = 4.0;

        for (let i = 0; i < polygon.length; i++) {
            const p1 = polygon[i];
            const p2 = polygon[(i + 1) % polygon.length];

            const dist = p1.distanceTo(p2);
            _v1.lerpVectors(p1, p2, 0.5);
            _v2.subVectors(p2, p1).normalize();
            const angle = Math.atan2(_v2.x, _v2.z);

            _quat.setFromAxisAngle(_axisY, angle);

            _pos.copy(_v1).setY(height / 2);
            _scale.set(thickness, height, dist);

            SectorBuilder.addObstacle(ctx, {
                position: _pos.clone(),
                quaternion: _quat.clone(),
                collider: { type: InteractionShape.BOX, size: _scale.clone() },
                physicsGroup: PhysicsGroup.WALL,
                materialId: MaterialType.CONCRETE,
                id: `${name}_bound_${i}`
            });
        }
    },

    createRoad: async (ctx: SectorContext, points: THREE.Vector3[], width: number = 8, texture: THREE.Texture = null, matType: number = 8, spawnLoot: boolean = false): Promise<THREE.CatmullRomCurve3> => {
        if (points.length < 2) return null;

        const curve = new THREE.CatmullRomCurve3(points);
        const len = curve.getLength();
        const segments = Math.floor(len / 2);
        const pts = curve.getSpacedPoints(segments);

        // Calculate Y-offset to prevent Z-fighting with other paths
        const yOff = 0.15 + (_pathLayerIndex * 0.001);
        const geo = buildRibbonGeometry(pts, width, yOff);

        const mat = matType === 7 ? MATERIALS.gravel : MATERIALS.asphalt;
        const road = new THREE.Mesh(geo, mat);
        road.receiveShadow = true;
        road.userData.isEngineStatic = true;
        road.userData.materialId = matType;

        GeneratorUtils.freezeStatic(road);
        ctx.scene.add(road);

        // Register material for footstep audio
        for (let i = 0; i < pts.length; i++) {
            ctx.collisionGrid.registerGroundMaterial(pts[i].x, pts[i].z, width / 2, matType);
            if (i % 10 === 0) {
                ctx.mapItems.push({ id: `road_${Math.random()}`, x: pts[i].x, z: pts[i].z, type: MapItemType.ROAD, label: null, icon: null, radius: width / 2, color: '#333' });
            }
        }

        _pathLayerIndex++;
        return curve;
    },

    createGravelRoad: async (ctx: SectorContext, points: THREE.Vector3[], width: number = 6): Promise<THREE.CatmullRomCurve3> => {
        return PathGenerator.createRoad(ctx, points, width, null, 1); // 1 = GRAVEL from GroundType
    },

    createDirtPath: async (ctx: SectorContext, points: THREE.Vector3[], width: number = 4, texture: THREE.Texture = null, showBorder: boolean = false, spawnLoot: boolean = false): Promise<THREE.CatmullRomCurve3> => {
        if (points.length < 2) return null;

        const curve = new THREE.CatmullRomCurve3(points);
        const len = curve.getLength();
        const segments = Math.floor(len / 1.5);
        const pts = curve.getSpacedPoints(segments);

        const yOff = 0.14 + (_pathLayerIndex * 0.001);
        const geo = buildRibbonGeometry(pts, width, yOff);

        const path = new THREE.Mesh(geo, MATERIALS.dirt);
        path.receiveShadow = true;
        path.userData.isEngineStatic = true;
        path.userData.materialId = MaterialType.DIRT;

        GeneratorUtils.freezeStatic(path);
        ctx.scene.add(path);

        for (let i = 0; i < pts.length; i++) {
            ctx.collisionGrid.registerGroundMaterial(pts[i].x, pts[i].z, width / 2, MaterialType.DIRT);
        }

        _pathLayerIndex++;
        return curve;
    },

    createRailTrack: async (ctx: SectorContext, points: THREE.Vector3[]): Promise<THREE.CatmullRomCurve3> => {
        if (points.length < 2) return null;
        const curve = new THREE.CatmullRomCurve3(points);
        const len = curve.getLength();
        const sleepers = Math.floor(len / 0.8);
        const railSegments = Math.floor(len / 0.5);

        let startTime = performance.now();

        // 1. Gravel Bed & Snow
        const pts = curve.getSpacedPoints(railSegments);
        const gravelGeo = buildRibbonGeometry(pts, 4.5, 0.05);
        const snowGeo = buildRibbonGeometry(pts, 5.5, 0.01);

        const gravelMesh = new THREE.Mesh(gravelGeo, MATERIALS.gravel);
        gravelMesh.receiveShadow = true;
        const snowMesh = new THREE.Mesh(snowGeo, MATERIALS.frost);
        snowMesh.receiveShadow = true;

        GeneratorUtils.freezeStatic(gravelMesh);
        GeneratorUtils.freezeStatic(snowMesh);
        ctx.scene.add(gravelMesh, snowMesh);

        // 2. Sleepers (Chunked InstancedMesh)
        const sleeperGeo = new THREE.BoxGeometry(2.5, 0.15, 0.4);
        const chunkBuckets = new Map<number, THREE.Matrix4[]>();

        for (let i = 0; i < sleepers; i++) {
            if (performance.now() - startTime > 12) {
                if (ctx.yield) await ctx.yield();
                startTime = performance.now();
            }

            const t = i / sleepers;
            curve.getPoint(t, _pos);
            curve.getTangent(t, _v1);

            _v1.setY(0).normalize();
            _quat.setFromUnitVectors(_axisX, _v1);

            _pos.setY(0.08); // Elevate sleeper slightly
            _scale.set(1, 1, 1);
            _matrix.compose(_pos, _quat, _scale);

            const key = ChunkManager.getSmiKey(ChunkManager.getCoordIndex(_pos.x), ChunkManager.getCoordIndex(_pos.z));
            let bucket = chunkBuckets.get(key);
            if (!bucket) {
                bucket = [];
                chunkBuckets.set(key, bucket);
            }
            bucket.push(_matrix.clone());
        }

        chunkBuckets.forEach((matrices, key) => {
            const ix = key >> 8;
            const iz = key & 0xFF;
            const mesh = new THREE.InstancedMesh(sleeperGeo, MATERIALS.brownBrick, matrices.length);
            mesh.frustumCulled = true;
            mesh.receiveShadow = true;
            mesh.userData.isEngineStatic = true;
            for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i]);
            mesh.instanceMatrix.needsUpdate = true;
            GeneratorUtils.freezeStatic(mesh);
            ChunkManager.registerMesh(ix, iz, mesh);
        });

        // 3. Rails (Ribbon instead of InstancedMesh for smooth curves)
        const railMat = MATERIALS.blackMetal.clone();
        (railMat as any).metalness = 0.9;

        const leftRailGeo = buildRibbonGeometry(PathGenerator.getOffsetPoints(pts, -1.0), 0.2, 0.18);
        const rightRailGeo = buildRibbonGeometry(PathGenerator.getOffsetPoints(pts, 1.0), 0.2, 0.18);

        const leftRail = new THREE.Mesh(leftRailGeo, railMat);
        const rightRail = new THREE.Mesh(rightRailGeo, railMat);
        leftRail.receiveShadow = true;
        rightRail.receiveShadow = true;

        GeneratorUtils.freezeStatic(leftRail);
        GeneratorUtils.freezeStatic(rightRail);

        ctx.scene.add(leftRail, rightRail);

        for (let i = 0; i < pts.length; i++) {
            ctx.collisionGrid.registerGroundMaterial(pts[i].x, pts[i].z, 2.0, MaterialType.METAL);
        }

        return curve;
    },

    createDecalPath: async (ctx: SectorContext, points: THREE.Vector3[], options: { spacing: number, size: number, material: THREE.Material, variance?: number, color?: number, randomRotation?: boolean, yOffset?: number }) => {
        if (points.length < 2) return;
        const curve = new THREE.CatmullRomCurve3(points);
        const count = Math.ceil(curve.getLength() / options.spacing);
        const pts = curve.getSpacedPoints(count);
        const mat = options.material.clone();
        if (options.color !== undefined) (mat as any).color.setHex(options.color);

        const chunkBuckets = new Map<number, THREE.Matrix4[]>();
        let startTime = performance.now();

        for (let i = 0; i < pts.length; i++) {
            if (performance.now() - startTime > 12) {
                if (ctx.yield) await ctx.yield();
                startTime = performance.now();
            }

            const pt = pts[i];
            if (i < pts.length - 1) _v1.subVectors(pts[i + 1], pt).normalize();
            else if (i > 0) _v1.subVectors(pt, pts[i - 1]).normalize();

            const varVal = options.variance || 0;
            const y = options.yOffset !== undefined ? options.yOffset : 0.04;

            _pos.set(pt.x + (Math.random() - 0.5) * varVal, pt.y + y + _pathLayerIndex * 0.001, pt.z + (Math.random() - 0.5) * varVal);

            if (options.randomRotation) {
                _quat.setFromEuler(_euler.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2));
            } else {
                _v2.subVectors(pt.clone().add(_v1), pt).normalize();
                _quat.setFromUnitVectors(_axisX, _v1);
                _quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));

                if (i % 2 === 0) _pos.addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(_quat), 0.2);
                else _pos.addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(_quat), -0.2);
            }

            _matrix.compose(_pos, _quat, _scale.set(options.size, options.size * 1.5, 1));

            const key = ChunkManager.getSmiKey(ChunkManager.getCoordIndex(_pos.x), ChunkManager.getCoordIndex(_pos.z));
            let bucket = chunkBuckets.get(key);
            if (!bucket) {
                bucket = [];
                chunkBuckets.set(key, bucket);
            }
            bucket.push(_matrix.clone());
        }

        chunkBuckets.forEach((matrices, key) => {
            const ix = key >> 8;
            const iz = key & 0xFF;
            const im = new THREE.InstancedMesh(_PLANE_GEO, mat, matrices.length);
            im.frustumCulled = true;
            im.renderOrder = 5;
            for (let i = 0; i < matrices.length; i++) im.setMatrixAt(i, matrices[i]);
            im.instanceMatrix.needsUpdate = true;
            GeneratorUtils.freezeStatic(im);
            ChunkManager.registerMesh(ix, iz, im);
        });

        _pathLayerIndex++;
    },

    createBloodPath: (ctx: SectorContext, points: THREE.Vector3[], spacing = 0.5, size = 0.8) => {
        PathGenerator.createDecalPath(ctx, points, { spacing, size, material: MATERIALS.bloodStainDecal, variance: 0.4, yOffset: 0.12 });
    },

    createFootprintPath: (ctx: SectorContext, points: THREE.Vector3[], spacing = 0.5, size = 0.5) => {
        PathGenerator.createDecalPath(ctx, points, { spacing, size, material: MATERIALS.footprintDecal, variance: 0.2, randomRotation: false });
    },
    createFence: async (ctx: SectorContext, points: THREE.Vector3[], color: 'white' | 'wood' | 'black' | 'mesh' = 'wood', height: number = 1.2, strict: boolean = false) => {
        if (points.length < 2) return;

        let mat = MATERIALS.wood;
        if (color === 'white') mat = MATERIALS.concrete;
        else if (color === 'black') mat = MATERIALS.blackMetal;
        else if (color === 'mesh') mat = MATERIALS.fenceMesh;

        const postGeo = new THREE.BoxGeometry(0.15, height, 0.15);
        const railGeo = new THREE.BoxGeometry(0.1, 0.15, 1.0);

        const chunkBuckets = new Map<number, { posts: THREE.Matrix4[], rails: THREE.Matrix4[] }>();
        const count = points.length;
        let startTime = performance.now();

        for (let i = 0; i < count; i++) {
            if (performance.now() - startTime > 12) {
                if (ctx.yield) await ctx.yield();
                startTime = performance.now();
            }

            const p1 = points[i];
            const key = ChunkManager.getSmiKey(ChunkManager.getCoordIndex(p1.x), ChunkManager.getCoordIndex(p1.z));
            let bucket = chunkBuckets.get(key);
            if (!bucket) {
                bucket = { posts: [], rails: [] };
                chunkBuckets.set(key, bucket);
            }

            // Post
            _pos.copy(p1).setY(height / 2);
            _quat.set(0, 0, 0, 1);
            _scale.set(1, 1, 1);
            _matrix.compose(_pos, _quat, _scale);
            bucket.posts.push(_matrix.clone());

            if (i < count - 1) {
                const p2 = points[i + 1];
                const dist = p1.distanceTo(p2);

                _v1.lerpVectors(p1, p2, 0.5); // Center
                _v2.subVectors(p2, p1).normalize();
                _quat.setFromUnitVectors(_axisX, _v2);

                // Rails
                for (let r = 0; r < 2; r++) {
                    _pos.copy(_v1).setY(r === 0 ? height * 0.3 : height * 0.7);
                    _scale.set(1, 1, dist);
                    _matrix.compose(_pos, _quat, _scale);
                    bucket.rails.push(_matrix.clone());
                }

                // Collision Obstacle
                _pos.copy(_v1).setY(height / 2);
                _v2.set(0.4, height, dist);

                SectorBuilder.addObstacle(ctx, {
                    position: new THREE.Vector3().copy(_pos),
                    quaternion: new THREE.Quaternion().copy(_quat),
                    collider: { type: InteractionShape.BOX, size: new THREE.Vector3().copy(_v2) },
                    physicsGroup: PhysicsGroup.WALL,
                    materialId: color === 'mesh' ? MaterialType.METAL : MaterialType.WOOD
                });
            }
        }

        chunkBuckets.forEach((data, key) => {
            const ix = key >> 8;
            const iz = key & 0xFF;

            if (data.posts.length > 0) {
                const posts = new THREE.InstancedMesh(postGeo, mat, data.posts.length);
                posts.frustumCulled = true;
                posts.castShadow = true;
                for (let i = 0; i < data.posts.length; i++) posts.setMatrixAt(i, data.posts[i]);
                posts.instanceMatrix.needsUpdate = true;
                GeneratorUtils.freezeStatic(posts);
                ChunkManager.registerMesh(ix, iz, posts);
            }

            if (data.rails.length > 0) {
                const rails = new THREE.InstancedMesh(railGeo, mat, data.rails.length);
                rails.frustumCulled = true;
                rails.castShadow = true;
                for (let i = 0; i < data.rails.length; i++) rails.setMatrixAt(i, data.rails[i]);
                rails.instanceMatrix.needsUpdate = true;
                GeneratorUtils.freezeStatic(rails);
                ChunkManager.registerMesh(ix, iz, rails);
            }
        });
    },

    createGuardrail: async (ctx: SectorContext, points: THREE.Vector3[], floating: boolean = false) => {
        if (points.length < 2) return;
        const height = 0.8;
        const thickness = 0.3;

        let startTime = performance.now();

        for (let i = 0; i < points.length - 1; i++) {
            if (performance.now() - startTime > 12) {
                if (ctx.yield) await ctx.yield();
                startTime = performance.now();
            }

            const p1 = points[i];
            const p2 = points[i + 1];
            const dist = p1.distanceTo(p2);

            _v1.lerpVectors(p1, p2, 0.5);
            _v2.subVectors(p2, p1).normalize();
            _quat.setFromUnitVectors(_axisX, _v2);

            const rail = new THREE.Mesh(new THREE.BoxGeometry(1, 0.4, 0.1), MATERIALS.steel);
            rail.position.copy(_v1);
            rail.position.y += height;
            rail.quaternion.copy(_quat);
            rail.scale.x = dist;
            rail.castShadow = true;
            GeneratorUtils.freezeStatic(rail);
            ctx.scene.add(rail);

            if (!floating) {
                const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, height, 0.15), MATERIALS.steel);
                post.position.copy(p1);
                post.position.y += height / 2;
                GeneratorUtils.freezeStatic(post);
                ctx.scene.add(post);
            }

            _pos.copy(_v1).setY(height / 2);
            _scale.set(dist, height, thickness);

            SectorBuilder.addObstacle(ctx, {
                position: _pos.clone(),
                quaternion: _quat.clone(),
                collider: { type: InteractionShape.BOX, size: _scale.clone() },
                physicsGroup: PhysicsGroup.WALL,
                materialId: MaterialType.METAL
            });
        }
    },

    createEmbankment: async (ctx: SectorContext, points: THREE.Vector3[], width: number = 20, height: number = 5, material: THREE.Material = MATERIALS.dirt) => {
        if (points.length < 2) return;

        let startTime = performance.now();

        for (let i = 0; i < points.length - 1; i++) {
            if (performance.now() - startTime > 12) {
                if (ctx.yield) await ctx.yield();
                startTime = performance.now();
            }

            const p1 = points[i];
            const p2 = points[i + 1];
            const dist = p1.distanceTo(p2);

            _v1.lerpVectors(p1, p2, 0.5);
            _v2.subVectors(p2, p1).normalize();

            _v3.set(-_v2.z, 0, _v2.x).normalize().multiplyScalar(width / 2);

            const geo = new THREE.CylinderGeometry(width * 0.1, width, height, 4, 1, false);
            geo.rotateY(Math.atan2(_v2.x, _v2.z) + Math.PI / 4);

            const mesh = new THREE.Mesh(geo, material);
            mesh.position.copy(_v1);
            mesh.position.y += height / 2 - 0.5;
            mesh.scale.set(1, 1, dist / (width * 0.7));
            mesh.receiveShadow = true;
            GeneratorUtils.freezeStatic(mesh);
            ctx.scene.add(mesh);

            _pos.copy(_v1).setY(height / 2);
            _quat.setFromUnitVectors(_axisX, _v2);
            _scale.set(dist, height, width * 0.6);

            SectorBuilder.addObstacle(ctx, {
                position: _pos.clone(),
                quaternion: _quat.clone(),
                collider: { type: InteractionShape.BOX, size: _scale.clone() },
                physicsGroup: PhysicsGroup.WALL,
                materialId: MaterialType.STONE
            });
        }
    }
};
