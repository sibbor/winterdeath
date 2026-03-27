import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MATERIALS } from '../../../utils/assets/materials';
import { SectorContext } from '../../../game/session/SectorTypes';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _matrix = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();
const _normal = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

const COLORS = {
    SNOW: new THREE.Color(0xffffff),
    ROCK_LIGHT: new THREE.Color(0xddddee),
    ROCK_DARK: new THREE.Color(0x888899),
};

export const TerrainGenerator = {
    /**
     * Creates the ground plane geometry and materials.
     */
    createGroundLayer: (type: 'SNOW' | 'GRAVEL' | 'DIRT', width: number, depth: number) => {
        let mat: THREE.Material;
        if (type === 'GRAVEL') mat = MATERIALS.gravelCutout;
        else if (type === 'DIRT') mat = MATERIALS.dirtCutout;
        else mat = MATERIALS.snowCutout;

        const geo = new THREE.PlaneGeometry(width, depth);
        const repeatX = width / 10;
        const repeatY = depth / 10;
        const uvAttr = geo.attributes.uv;

        for (let i = 0; i < uvAttr.count; i++) {
            uvAttr.setXY(i, uvAttr.getX(i) * repeatX, uvAttr.getY(i) * repeatY);
        }

        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = `GROUND`;
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = -0.05;
        mesh.receiveShadow = true;

        // Zero-GC: Static plane
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();

        return mesh;
    },

    /**
     * Creates a sloped lake bed geometry.
     */
    createLakeBed: (width: number, depth: number, floorDepth: number = 4.0, shape: 'rect' | 'circle' = 'rect') => {
        const segmentsX = Math.max(16, Math.floor(width / 2));
        const segmentsY = Math.max(16, Math.floor(depth / 2));

        const geo = shape === 'circle'
            ? new THREE.CircleGeometry(width / 2, segmentsX * 2)
            : new THREE.PlaneGeometry(width, depth, segmentsX, segmentsY);

        // Pre-configure gravel material
        const mat = (MATERIALS.gravel as THREE.MeshStandardMaterial).clone();
        mat.color.setHex(0x1a212e);
        mat.bumpScale = 0.8;

        const posAttr = geo.getAttribute('position');
        const rX = width / 2;
        const rZ = depth / 2;

        for (let i = 0; i < posAttr.count; i++) {
            const vx = posAttr.getX(i);
            const vz = posAttr.getY(i);

            let rawDist = 0;
            if (shape === 'circle') {
                rawDist = Math.sqrt((vx * vx) / (rX * rX) + (vz * vz) / (rZ * rZ));
            } else {
                rawDist = Math.max(Math.abs(vx) / rX, Math.abs(vz) / rZ);
            }

            const edgeDistMeters = (1.0 - rawDist) * Math.min(rX, rZ);
            let slopeDepth = floorDepth;
            const slopeWidth = 2.0;

            if (edgeDistMeters < slopeWidth) {
                const f = edgeDistMeters / slopeWidth;
                slopeDepth = floorDepth * (f * f * (3 - 2 * f));
            }

            posAttr.setZ(i, -slopeDepth + (Math.random() - 0.5) * 0.1);
        }

        posAttr.needsUpdate = true;
        geo.computeVertexNormals();

        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.receiveShadow = true;

        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();

        const repeatX = width / 8;
        const repeatY = depth / 8;
        const uvAttr = geo.attributes.uv;
        for (let i = 0; i < uvAttr.count; i++) {
            uvAttr.setXY(i, uvAttr.getX(i) * repeatX, uvAttr.getY(i) * repeatY);
        }

        return mesh;
    },

    createMountain: (ctx: SectorContext, points: THREE.Vector3[], depth: number = 20, height: number = 15, caveConfig?: { position: THREE.Vector3, rotation?: number }) => {
        if (!points || points.length < 2) return;

        const geometries: THREE.BufferGeometry[] = [];
        const curve = new THREE.CatmullRomCurve3(points);
        const length = curve.getLength();

        const steps = Math.floor(length / 2.0);
        const numLayers = Math.max(1, Math.ceil(depth / 6));
        const layerThickness = depth / numLayers;

        const openingPos = new THREE.Vector3();
        const openingDir = new THREE.Vector3(0, 0, 1);

        if (caveConfig) {
            const opening = TerrainGenerator.createMountainOpening(depth + 5);
            opening.position.copy(caveConfig.position);
            openingPos.copy(caveConfig.position);

            if (caveConfig.rotation !== undefined) {
                opening.rotation.y = caveConfig.rotation;
                openingDir.set(Math.sin(caveConfig.rotation), 0, Math.cos(caveConfig.rotation)).normalize();
            }
            ctx.scene.add(opening);
        }

        const hash = (x: number) => {
            let n = Math.sin(x * 12.9898) * 43758.5453;
            return n - Math.floor(n);
        };

        // Reuse shared geometries to avoid massive allocations in the loop
        const dodecaBase = new THREE.DodecahedronGeometry(1, 0);
        const icosaBase = new THREE.IcosahedronGeometry(1, 0);

        const addRockBlock = (pos: THREE.Vector3, scale: THREE.Vector3, rot: THREE.Euler, type: 'dodeca' | 'icosa' = 'dodeca', isPortal: boolean = false) => {
            if (caveConfig && !isPortal) {
                _v1.copy(openingPos);
                _v2.copy(openingDir).multiplyScalar(depth * 0.4);
                _v1.add(_v2); // tunnelCenter
                
                const distSq = pos.distanceToSquared(_v1);
                const maxRadius = Math.max(scale.x, scale.z);
                const safeDist = (depth * 0.4) + maxRadius + 5;

                if (distSq < safeDist * safeDist) {
                    return;
                }
            }

            const geo = (type === 'icosa' ? icosaBase : dodecaBase).clone();
            _quat.setFromEuler(rot);
            _matrix.compose(pos, _quat, scale);
            geo.applyMatrix4(_matrix);
            geometries.push(geo);
        };

        const inwardDir = new THREE.Vector3();
        const pt = new THREE.Vector3();
        const tangent = new THREE.Vector3();

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            curve.getPointAt(t, pt);
            curve.getTangentAt(t, tangent).normalize();
            inwardDir.set(tangent.z, 0, -tangent.x).normalize();

            for (let layer = 0; layer < numLayers; layer++) {
                if (layer > 0 && i % (layer + 1) !== 0) continue;

                const layerHeightFactor = numLayers === 1 ? 1 : layer / (numLayers - 1);
                const currentHeight = height * (0.4 + 0.6 * layerHeightFactor);

                const sX = 4 + hash(i + layer) * 4;
                const sZ = 4 + hash(i + layer + 1) * 4;
                const sY = currentHeight * (0.7 + 0.3 * hash(i + layer + 2));
                _scale.set(sX, sY, sZ);

                const maxRadius = Math.max(_scale.x, _scale.z);
                const safeOffset = (layer * layerThickness) + maxRadius * 0.5;

                _pos.copy(pt);
                _v1.copy(inwardDir).multiplyScalar(safeOffset);
                _pos.add(_v1);
                _pos.y = _scale.y * 0.3;

                _euler.set(hash(i) * 0.4, hash(i + 1) * Math.PI, hash(i + 2) * 0.4);

                addRockBlock(_pos, _scale, _euler, layer === 0 ? 'icosa' : 'dodeca');
            }
        }
        
        // Final cleanup of base geometries after loop
        dodecaBase.dispose();
        icosaBase.dispose();

        if (caveConfig) {
            const placePortalRock = (localPos: THREE.Vector3, scale: THREE.Vector3, localRot: THREE.Euler) => {
                _pos.copy(localPos);
                if (caveConfig.rotation) _pos.applyAxisAngle(_up, caveConfig.rotation);
                _pos.add(openingPos);
                _euler.set(localRot.x, localRot.y + (caveConfig.rotation || 0), localRot.z);
                addRockBlock(_pos.clone(), scale, _euler.clone(), 'dodeca', true);
            };

            placePortalRock(new THREE.Vector3(-10, 5, -2), new THREE.Vector3(6, 10, 8), new THREE.Euler(0.1, 0.4, -0.1));
            placePortalRock(new THREE.Vector3(10, 5, -2), new THREE.Vector3(6, 10, 8), new THREE.Euler(-0.1, -0.4, 0.1));
            placePortalRock(new THREE.Vector3(-6, 10, -3), new THREE.Vector3(6, 6, 8), new THREE.Euler(0.2, 0.2, -0.4));
            placePortalRock(new THREE.Vector3(6, 10, -3), new THREE.Vector3(6, 6, 8), new THREE.Euler(0.2, -0.2, 0.4));
            placePortalRock(new THREE.Vector3(0, 12, -3), new THREE.Vector3(8, 6, 9), new THREE.Euler(0.1, 0, 0));
            placePortalRock(new THREE.Vector3(-6, 14, -4), new THREE.Vector3(10, 6, 8), new THREE.Euler(-0.2, 0.3, -0.1));
            placePortalRock(new THREE.Vector3(6, 14, -4), new THREE.Vector3(10, 6, 8), new THREE.Euler(-0.1, -0.4, 0.2));
            placePortalRock(new THREE.Vector3(0, 16, -4), new THREE.Vector3(12, 6, 8), new THREE.Euler(0, 0.1, 0));
        }

        if (geometries.length === 0) return;

        let mountainGeo = BufferGeometryUtils.mergeGeometries(geometries);
        if (!mountainGeo) return;
        mountainGeo = mountainGeo.index ? mountainGeo.toNonIndexed() : mountainGeo;
        mountainGeo.computeVertexNormals();

        const count = mountainGeo.getAttribute('position').count;
        const colors = new Float32Array(count * 3);
        const finalPosAttr = mountainGeo.getAttribute('position');
        const normalAttr = mountainGeo.getAttribute('normal');

        for (let i = 0; i < count; i += 3) {
            const hAvg = (finalPosAttr.getY(i) + finalPosAttr.getY(i + 1) + finalPosAttr.getY(i + 2)) / 3;
            _normal.fromBufferAttribute(normalAttr, i);
            const upwardness = _normal.dot(_up);

            let r, g, b;
            const snowThreshold = height * 0.6;

            if ((upwardness > 0.65 && hAvg > snowThreshold / 2) || hAvg > snowThreshold) {
                r = COLORS.SNOW.r; g = COLORS.SNOW.g; b = COLORS.SNOW.b;
            } else {
                const isLight = (_normal.x * 0.5 + _normal.z * 0.8) > 0;
                r = isLight ? COLORS.ROCK_LIGHT.r : COLORS.ROCK_DARK.r;
                g = isLight ? COLORS.ROCK_LIGHT.g : COLORS.ROCK_DARK.g;
                b = isLight ? COLORS.ROCK_LIGHT.b : COLORS.ROCK_DARK.b;
            }

            for (let j = 0; j < 3; j++) {
                const idx = (i + j) * 3;
                colors[idx] = r; colors[idx + 1] = g; colors[idx + 2] = b;
            }
        }

        mountainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const mountain = new THREE.Mesh(mountainGeo, MATERIALS.mountain);
        mountain.castShadow = true;
        mountain.receiveShadow = true;
        ctx.scene.add(mountain);
    },

    createMountainOpening: (tunnelDepth: number = 10) => {
        const caveOpeningGroup = new THREE.Group();

        const outW = 10, inW = 6.5, wallH = 6.5, peakH = 12, peakInH = 9, topW = 4, topInW = 2.5;

        const portalShape = new THREE.Shape();
        portalShape.moveTo(-outW, 0);
        portalShape.lineTo(-outW - 0.5, wallH);
        portalShape.lineTo(-topW, peakH + 0.5);
        portalShape.lineTo(topW, peakH);
        portalShape.lineTo(outW + 0.8, wallH);
        portalShape.lineTo(outW, 0);
        portalShape.lineTo(-outW, 0);

        const holePath = new THREE.Path();
        holePath.moveTo(inW, 0);
        holePath.lineTo(inW - 0.5, wallH - 0.5);
        holePath.lineTo(topInW, peakInH);
        holePath.lineTo(-topInW, peakInH - 0.5);
        holePath.lineTo(-inW + 0.5, wallH - 0.5);
        holePath.lineTo(-inW, 0);
        holePath.lineTo(inW, 0);
        portalShape.holes.push(holePath);

        const extrudeSettings = { depth: tunnelDepth, steps: 2, bevelEnabled: false };
        let portalGeoExtruded = new THREE.ExtrudeGeometry(portalShape, extrudeSettings);
        portalGeoExtruded.translate(0, 0, -tunnelDepth / 2);

        const portalGeo = portalGeoExtruded.index ? portalGeoExtruded.toNonIndexed() : portalGeoExtruded;

        const posAttr = portalGeo.getAttribute('position');
        for (let i = 0; i < posAttr.count; i++) {
            const x = posAttr.getX(i);
            const y = posAttr.getY(i);
            if (Math.abs(x) < outW - 1.0 && y < peakH - 1.0) {
                posAttr.setX(i, x + (Math.random() - 0.5) * 0.7);
                posAttr.setY(i, y + (Math.random() - 0.5) * 0.7);
            }
        }
        portalGeo.computeVertexNormals();

        const count = portalGeo.getAttribute('position').count;
        const colors = new Float32Array(count * 3);
        const normalAttr = portalGeo.getAttribute('normal');

        for (let i = 0; i < count; i += 3) {
            _normal.fromBufferAttribute(normalAttr, i);
            const isLight = (_normal.x * 0.5 + _normal.z * 0.8) > 0;
            const r = isLight ? COLORS.ROCK_LIGHT.r : COLORS.ROCK_DARK.r;
            const g = isLight ? COLORS.ROCK_LIGHT.g : COLORS.ROCK_DARK.g;
            const b = isLight ? COLORS.ROCK_LIGHT.b : COLORS.ROCK_DARK.b;

            for (let j = 0; j < 3; j++) {
                const idx = (i + j) * 3;
                colors[idx] = r; colors[idx + 1] = g; colors[idx + 2] = b;
            }
        }
        portalGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const portal = new THREE.Mesh(portalGeo, MATERIALS.mountain);
        portal.castShadow = true;
        portal.receiveShadow = true;
        caveOpeningGroup.add(portal);

        const logRadius = 0.5, postHeight = wallH - 0.5;
        const woodMat = MATERIALS.treeTrunk || MATERIALS.deadWood;

        for (let z = -tunnelDepth / 2 + 1.5; z <= tunnelDepth / 2 - 1.5; z += 3.5) {
            const fz = z;
            const postL = new THREE.Mesh(new THREE.CylinderGeometry(logRadius, logRadius, postHeight, 6), woodMat);
            postL.position.set(-inW + 1.0, postHeight / 2, fz);
            postL.rotation.y = Math.random() * Math.PI;
            postL.rotation.z = (Math.random() - 0.5) * 0.05;
            postL.castShadow = true;
            caveOpeningGroup.add(postL);

            const postR = new THREE.Mesh(new THREE.CylinderGeometry(logRadius, logRadius, postHeight, 6), woodMat);
            postR.position.set(inW - 1.0, postHeight / 2, fz);
            postR.rotation.y = Math.random() * Math.PI;
            postR.rotation.z = (Math.random() - 0.5) * 0.05;
            postR.castShadow = true;
            caveOpeningGroup.add(postR);

            const beamLen = (inW - 1.0) * 2 + 1.5;
            const topBeam = new THREE.Mesh(new THREE.CylinderGeometry(logRadius, logRadius, beamLen, 6), woodMat);
            topBeam.position.set(0, postHeight + logRadius - 0.2, fz);
            topBeam.rotation.z = Math.PI / 2;
            topBeam.rotation.x = Math.random() * Math.PI;
            topBeam.castShadow = true;
            caveOpeningGroup.add(topBeam);

            const diagL = new THREE.Mesh(new THREE.CylinderGeometry(logRadius * 0.7, logRadius * 0.7, 2.5, 5), woodMat);
            diagL.position.set(-inW + 2.2, postHeight - 0.8, fz);
            diagL.rotation.z = -Math.PI / 4;
            diagL.castShadow = true;
            caveOpeningGroup.add(diagL);

            const diagR = new THREE.Mesh(new THREE.CylinderGeometry(logRadius * 0.7, logRadius * 0.7, 2.5, 5), woodMat);
            diagR.position.set(inW - 2.2, postHeight - 0.8, fz);
            diagR.rotation.z = Math.PI / 4;
            diagR.castShadow = true;
            caveOpeningGroup.add(diagR);
        }

        const plankLength = (inW - 1.2) * 2;
        for (let z = -tunnelDepth / 2 + 0.5; z <= tunnelDepth / 2 - 0.5; z += 1.2) {
            const plank = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, plankLength, 5), woodMat);
            plank.position.set(0, postHeight + logRadius * 2 - 0.2, z);
            plank.rotation.z = Math.PI / 2;
            plank.rotation.x = (Math.random() - 0.5) * 0.2;
            plank.castShadow = true;
            caveOpeningGroup.add(plank);
        }

        return caveOpeningGroup;
    },

    createMountainOpeningInConrete: () => {
        const caveOpeningGroup = new THREE.Group();

        const portalShape = new THREE.Shape();
        const outW = 8.5, inW = 6, wallH = 6, peakH = 10, peakInH = 8, topW = 4, topInW = 2.5;

        portalShape.moveTo(-outW, 0);
        portalShape.lineTo(-outW, wallH);
        portalShape.lineTo(-topW, peakH);
        portalShape.lineTo(topW, peakH);
        portalShape.lineTo(outW, wallH);
        portalShape.lineTo(outW, 0);
        portalShape.lineTo(-outW, 0);

        const holePath = new THREE.Path();
        holePath.moveTo(inW, 0);
        holePath.lineTo(inW, wallH - 0.5);
        holePath.lineTo(topInW, peakInH);
        holePath.lineTo(-topInW, peakInH);
        holePath.lineTo(-inW, wallH - 0.5);
        holePath.lineTo(-inW, 0);
        holePath.lineTo(inW, 0);
        portalShape.holes.push(holePath);

        const tunnelDepth = 8;
        const extrudeSettings = { depth: tunnelDepth, steps: 2, bevelEnabled: false };
        const portalGeoExtruded = new THREE.ExtrudeGeometry(portalShape, extrudeSettings);
        portalGeoExtruded.translate(0, 0, -tunnelDepth / 2);
        const portalGeo = portalGeoExtruded.index ? portalGeoExtruded.toNonIndexed() : portalGeoExtruded;

        if (!MATERIALS.concreteDoubleSided) {
            (MATERIALS as any).concreteDoubleSided = (MATERIALS.concrete as THREE.MeshStandardMaterial).clone();
            (MATERIALS as any).concreteDoubleSided.side = THREE.DoubleSide;
            (MATERIALS as any).concreteDoubleSided.flatShading = true;
        }

        const portal = new THREE.Mesh(portalGeo, (MATERIALS as any).concreteDoubleSided);
        portal.castShadow = true;
        portal.receiveShadow = true;
        caveOpeningGroup.add(portal);

        const ribMat = (MATERIALS as any).steel || (MATERIALS as any).concreteDoubleSided;

        const ribL = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, tunnelDepth + 1), ribMat);
        ribL.position.set(-topInW - 1.0, peakInH - 0.5, 0);
        ribL.rotation.z = 0.75;
        ribL.castShadow = true;
        caveOpeningGroup.add(ribL);

        const ribR = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, tunnelDepth + 1), ribMat);
        ribR.position.set(topInW + 1.0, peakInH - 0.5, 0);
        ribR.rotation.z = -0.75;
        ribR.castShadow = true;
        caveOpeningGroup.add(ribR);

        const ribTop = new THREE.Mesh(new THREE.BoxGeometry(topInW * 2 + 2, 1.2, tunnelDepth + 1), ribMat);
        ribTop.position.set(0, peakInH - 0.2, 0);
        ribTop.castShadow = true;
        caveOpeningGroup.add(ribTop);

        const threshold = new THREE.Mesh(new THREE.BoxGeometry(outW * 2 + 2, 0.5, tunnelDepth + 2), (MATERIALS as any).concreteDoubleSided);
        threshold.position.set(0, 0.25, 0);
        threshold.receiveShadow = true;
        caveOpeningGroup.add(threshold);

        return caveOpeningGroup;
    },
};
