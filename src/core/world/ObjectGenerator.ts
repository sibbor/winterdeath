
import * as THREE from 'three';
import { createProceduralTextures } from '../../utils/assets';

// Lazy load textures
let sharedTextures: any = null;
const getSharedTextures = () => {
    if (!sharedTextures) sharedTextures = createProceduralTextures();
    return sharedTextures;
};

const TREE_VARIANTS = 5;
const treePrototypes: THREE.Group[] = [];

export const initTreePrototypes = () => {
    if (treePrototypes.length > 0) return treePrototypes;

    const tex = getSharedTextures();

    // Common Materials
    const trunkMat = new THREE.MeshStandardMaterial({
        map: tex.barkTex,
        color: 0xffffff,
        roughness: 1.0,
        name: 'TrunkMat'
    });

    const needleMat = new THREE.MeshStandardMaterial({
        map: tex.pineBranchTex,
        alphaMap: tex.pineBranchTex,
        color: 0xffffff,
        transparent: true,
        alphaTest: 0.4,
        side: THREE.DoubleSide,
        roughness: 0.8,
        name: 'NeedleMat'
    });

    for (let v = 0; v < TREE_VARIANTS; v++) {
        const group = new THREE.Group();
        const height = 12 + (Math.random() * 4); // Varying height (12-16)
        const spreadBase = 3.5 + (Math.random() * 1.0);

        // 1. Trunk (Single Mesh)
        // Cylinder: TopRadius, BottomRadius, Height, Segments
        const trunkGeo = new THREE.CylinderGeometry(0.2, 0.5, height, 5);
        // Pivot is center, move up so base is at 0
        trunkGeo.translate(0, height / 2, 0);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        group.add(trunk);

        // 2. Foliage (Merged Geometry)
        // Optimization: 4 Layers, 3 Planes per layer (Star shape) = 12 Quads total
        const layers = 4;
        const planesPerLayer = 3;
        const startY = 2.0;

        const vertices: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        let vIdx = 0;

        for (let i = 0; i < layers; i++) {
            const t = i / (layers - 1);
            const layerY = startY + (i / layers) * (height - startY - 1); // -1 to keep top tip

            // Cone shape math
            // Base is widest, top is narrow
            const layerSpread = spreadBase * (1.0 - Math.pow(t, 0.8)) + 0.5;
            const layerHeight = (height / layers) * 2.5; // Overlap

            for (let p = 0; p < planesPerLayer; p++) {
                // Angle: 0, 60, 120 (since double sided covers the rest)
                const angle = (Math.PI / planesPerLayer) * p + (Math.random() * 0.2); // slight random twist
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);

                // Plane width vector (X-axis rotated)
                // Half Width
                const hw = layerSpread;

                // Tilt (Pitch) - lower branches droop more
                const pitch = (Math.random() - 0.5) * 0.2;

                // Quad Vertices (Local to plane)
                // BL, BR, TL, TR

                const yBot = -layerHeight / 2;
                const yTop = layerHeight / 2;

                // Apply Rotation (Y axis) and Translation (layerY)
                const transform = (x: number, y: number, z: number) => {
                    // 1. Pitch (Rotate around X local) - skip for optimization/simplicity or add simple y var
                    // 2. Yaw (Rotate around Y global)
                    const rx = x * cos - z * sin;
                    const rz = x * sin + z * cos;
                    return [rx, y + layerY, rz];
                };

                const p1 = transform(-hw, yBot, 0); // BL
                const p2 = transform(hw, yBot, 0);  // BR
                const p3 = transform(-hw, yTop, 0); // TL
                const p4 = transform(hw, yTop, 0);  // TR

                vertices.push(...p1, ...p2, ...p3, ...p4);

                // UVs (Standard 0-1)
                uvs.push(0, 0, 1, 0, 0, 1, 1, 1);

                // Indices (Two triangles: 0, 1, 2 and 2, 1, 3)
                // Winding order counter-clockwise
                indices.push(vIdx, vIdx + 1, vIdx + 2, vIdx + 2, vIdx + 1, vIdx + 3);

                vIdx += 4;
            }
        }

        const foliageGeo = new THREE.BufferGeometry();
        foliageGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        foliageGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        foliageGeo.setIndex(indices);
        foliageGeo.computeVertexNormals();

        const foliage = new THREE.Mesh(foliageGeo, needleMat);
        foliage.castShadow = true;
        // receiveShadow false on foliage often saves self-shadowing artifacts/perf on transparent textures
        foliage.receiveShadow = true;

        group.add(foliage);

        // Tag it for cloning efficiency if needed later
        group.userData.isTree = true;

        treePrototypes.push(group);
    }
    return treePrototypes;
};

export const ObjectGenerator = {
    createTree: (scaleMultiplier: number = 1.0) => {
        if (treePrototypes.length === 0) {
            initTreePrototypes();
        }

        // Pick variant
        const variantIdx = Math.floor(Math.random() * treePrototypes.length);
        const prototype = treePrototypes[variantIdx];

        // Clone
        const tree = prototype.clone();

        // Randomized Rotation (Y)
        tree.rotation.y = Math.random() * Math.PI * 2;

        // Scale
        tree.scale.setScalar(scaleMultiplier);

        return tree;
    }
};