
import * as THREE from 'three';
import { MATERIALS } from '../../utils/assets';
import { SectorContext } from '../../types/sectors';
import { SectorGenerator } from './SectorGenerator';

// Lazy load textures (reuse from ObjectGenerator pattern)
const NATURE_VARIANTS = 8;
const uniqueMeshes: Record<string, THREE.Group[]> = {
    'spruce': [],
    'pine': [],
    'birch': [],
    'oak': [],
    'dead': [], // NEW: Dead trees
    'rock': []
};

/**
 * Initialize all nature prototypes (trees, rocks, dead trees)
 * This is called once during asset preloading
 */
export const initNaturePrototypes = async (yieldToMain?: () => Promise<void>) => {
    // Check if already initialized
    if (uniqueMeshes['spruce'].length > 0 && uniqueMeshes['rock'].length > 0) return;

    // Use centralized materials
    const trunkMat = MATERIALS.treeTrunk;
    const birchTrunkMat = MATERIALS.treeTrunkBirch;

    // Foliage materials
    const spruceMat = MATERIALS.treeLeaves.clone();
    spruceMat.color.set(0xffffff);

    const pineMat = MATERIALS.treeLeaves.clone();
    pineMat.color.set(0xcccccc);

    const birchMat = MATERIALS.treeLeaves.clone();
    birchMat.color.set(0x99cc99);

    // 1. SPRUCE (Abstract Crossed Planes)
    for (let i = 0; i < NATURE_VARIANTS; i++) {
        const group = new THREE.Group();
        const height = 12 + (Math.random() * 4);
        const spreadBase = 3.5 + (Math.random() * 1.0);

        // Trunk
        const trunkGeo = new THREE.CylinderGeometry(0.2, 0.5, height, 5);
        trunkGeo.translate(0, height / 2, 0);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.castShadow = true; trunk.receiveShadow = true;
        group.add(trunk);

        // Foliage (Crossed Planes)
        const layers = 7;
        const planesPerLayer = 6;
        const startY = 2.0;

        const vertices: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        let vIdx = 0;

        for (let l = 0; l < layers; l++) {
            const t = l / (layers - 1);
            const layerY = startY + (l / layers) * (height - startY - 0.5);

            const layerSpread = spreadBase * (1.0 - t * 0.8) + 0.5;
            const layerHeight = (height / layers) * 2.0;

            for (let p = 0; p < planesPerLayer; p++) {
                const angle = (Math.PI / planesPerLayer) * p + (Math.random() * 0.5);
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const hw = layerSpread;
                const hh = layerHeight;

                const yBot = -hh * 0.4;
                const yTop = hh * 0.6;

                const transform = (x: number, y: number, z: number) => {
                    return [x * cos - z * sin, y + layerY, x * sin + z * cos];
                };

                const p1 = transform(-hw, yBot, 0); const p2 = transform(hw, yBot, 0);
                const p3 = transform(-hw, yTop, 0); const p4 = transform(hw, yTop, 0);

                vertices.push(...p1, ...p2, ...p3, ...p4);
                uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
                indices.push(vIdx, vIdx + 1, vIdx + 2, vIdx + 2, vIdx + 1, vIdx + 3);
                vIdx += 4;
            }
        }

        const foliageGeo = new THREE.BufferGeometry();
        foliageGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        foliageGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        foliageGeo.setIndex(indices);
        foliageGeo.computeVertexNormals();

        const foliage = new THREE.Mesh(foliageGeo, spruceMat);
        foliage.castShadow = true; group.add(foliage);
        group.userData.material = 'WOOD';
        uniqueMeshes['spruce'].push(group);
        if (yieldToMain) await yieldToMain();
    }

    // 2. PINE (Tall, Narrow - Similar to spruce but taller)
    for (let i = 0; i < NATURE_VARIANTS; i++) {
        const group = new THREE.Group();
        const height = 15 + Math.random() * 5;
        const spreadBase = 3.0 + (Math.random() * 0.8);

        const trunkGeo = new THREE.CylinderGeometry(0.25, 0.6, height, 6);
        trunkGeo.translate(0, height / 2, 0);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.castShadow = true; group.add(trunk);

        const layers = 9;
        const planesPerLayer = 6;
        const startY = height * 0.25;

        const vertices: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        let vIdx = 0;

        for (let l = 0; l < layers; l++) {
            const t = l / (layers - 1);
            const layerY = startY + (l / layers) * (height - startY);

            const layerSpread = spreadBase * (1.0 - t * 0.85);
            const layerHeight = (height / layers) * 1.8;

            for (let p = 0; p < planesPerLayer; p++) {
                const angle = (Math.PI / planesPerLayer) * p + (Math.random() * 0.3);
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const hw = layerSpread;
                const hh = layerHeight;

                const yBot = -hh * 0.4;
                const yTop = hh * 0.6;

                const transform = (x: number, y: number, z: number) => {
                    return [x * cos - z * sin, y + layerY, x * sin + z * cos];
                };

                const p1 = transform(-hw, yBot, 0); const p2 = transform(hw, yBot, 0);
                const p3 = transform(-hw, yTop, 0); const p4 = transform(hw, yTop, 0);

                vertices.push(...p1, ...p2, ...p3, ...p4);
                uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
                indices.push(vIdx, vIdx + 1, vIdx + 2, vIdx + 2, vIdx + 1, vIdx + 3);
                vIdx += 4;
            }
        }

        const foliageGeo = new THREE.BufferGeometry();
        foliageGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        foliageGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        foliageGeo.setIndex(indices);
        foliageGeo.computeVertexNormals();

        const foliage = new THREE.Mesh(foliageGeo, pineMat);
        foliage.castShadow = true; group.add(foliage);
        group.userData.material = 'WOOD';
        uniqueMeshes['pine'].push(group);
        if (yieldToMain) await yieldToMain();
    }

    // 3. BIRCH (Distinctive White Trunk, Oval Canopy)
    for (let i = 0; i < NATURE_VARIANTS; i++) {
        const group = new THREE.Group();
        const height = 10 + Math.random() * 3;
        const spreadBase = 3.0 + (Math.random() * 1.5);

        const trunkGeo = new THREE.CylinderGeometry(0.2, 0.25, height, 6);
        trunkGeo.translate(0, height / 2, 0);
        const trunk = new THREE.Mesh(trunkGeo, birchTrunkMat);
        trunk.castShadow = true; group.add(trunk);

        const layers = 7;
        const planesPerLayer = 6;
        const startY = height * 0.3;

        const vertices: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        let vIdx = 0;

        for (let l = 0; l < layers; l++) {
            const t = l / (layers - 1);
            const layerY = startY + (l / layers) * (height - startY - 0.5);

            // Oval Shape
            const shapeFactor = Math.sin(t * Math.PI);
            const layerSpread = spreadBase * (0.3 + shapeFactor * 0.8);
            const layerHeight = ((height - startY) / layers) * 2.0;

            for (let p = 0; p < planesPerLayer; p++) {
                const angle = (Math.PI / planesPerLayer) * p + (Math.random() * 1.0);
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const hw = layerSpread;
                const hh = layerHeight;

                const yBot = -hh * 0.4;
                const yTop = hh * 0.6;

                const transform = (x: number, y: number, z: number) => {
                    return [x * cos - z * sin, y + layerY, x * sin + z * cos];
                };

                const p1 = transform(-hw, yBot, 0); const p2 = transform(hw, yBot, 0);
                const p3 = transform(-hw, yTop, 0); const p4 = transform(hw, yTop, 0);

                vertices.push(...p1, ...p2, ...p3, ...p4);
                uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
                indices.push(vIdx, vIdx + 1, vIdx + 2, vIdx + 2, vIdx + 1, vIdx + 3);
                vIdx += 4;
            }
        }

        const foliageGeo = new THREE.BufferGeometry();
        foliageGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        foliageGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        foliageGeo.setIndex(indices);
        foliageGeo.computeVertexNormals();

        const foliage = new THREE.Mesh(foliageGeo, birchMat);
        foliage.castShadow = true; group.add(foliage);
        group.userData.material = 'WOOD';
        uniqueMeshes['birch'].push(group);
        if (yieldToMain) await yieldToMain();
    }

    // 4. OAK (Sturdy, Broad Crown)
    for (let i = 0; i < NATURE_VARIANTS; i++) {
        const group = new THREE.Group();
        const height = 8 + Math.random() * 4;
        const spreadBase = 4.0 + (Math.random() * 2.0);

        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, height, 6).translate(0, height / 2, 0), MATERIALS.treeTrunkOak);
        trunk.castShadow = true; group.add(trunk);

        const layers = 6;
        const clustersPerLayer = 4;
        const startY = height * 0.4;

        const vertices: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        let vIdx = 0;

        for (let l = 0; l < layers; l++) {
            const t = l / (layers - 1);
            const layerY = startY + (l / layers) * (height - startY);
            const shapeFactor = Math.sin(t * Math.PI * 0.8 + 0.2);
            const layerSpread = spreadBase * (0.5 + shapeFactor * 0.7);
            const layerHeight = ((height - startY) / layers) * 3.0;

            for (let p = 0; p < clustersPerLayer; p++) {
                const angle = (Math.PI * 2 / clustersPerLayer) * p + Math.random();
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const hw = layerSpread * (0.6 + Math.random() * 0.4);
                const hh = layerHeight * (0.6 + Math.random() * 0.4);

                const yBot = -hh * 0.5;
                const yTop = hh * 0.5;

                const transform = (x: number, y: number, z: number) => {
                    return [x * cos - z * sin + (Math.random() - 0.5) * 1.0, y + layerY, x * sin + z * cos + (Math.random() - 0.5) * 1.0];
                };

                const p1 = transform(-hw, yBot, 0); const p2 = transform(hw, yBot, 0);
                const p3 = transform(-hw, yTop, 0); const p4 = transform(hw, yTop, 0);

                vertices.push(...p1, ...p2, ...p3, ...p4);
                uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
                indices.push(vIdx, vIdx + 1, vIdx + 2, vIdx + 2, vIdx + 1, vIdx + 3);
                vIdx += 4;
            }
        }

        const foliageGeo = new THREE.BufferGeometry();
        foliageGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        foliageGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        foliageGeo.setIndex(indices);
        foliageGeo.computeVertexNormals();

        const foliage = new THREE.Mesh(foliageGeo, MATERIALS.treeLeavesOak);
        foliage.castShadow = true; group.add(foliage);
        group.userData.material = 'WOOD';
        uniqueMeshes['oak'].push(group);
        if (yieldToMain) await yieldToMain();
    }

    // 5. DEAD TREES (NEW!)
    for (let i = 0; i < NATURE_VARIANTS; i++) {
        const group = new THREE.Group();
        const height = 10 + Math.random() * 4;
        const spreadBase = 2.0 + (Math.random() * 1.0);

        // Darker, desaturated trunk
        const deadTrunkMat = MATERIALS.treeTrunk.clone();
        deadTrunkMat.color.set(0x3a3020); // Dark brown-gray

        const trunkGeo = new THREE.CylinderGeometry(0.2, 0.4, height, 5);
        trunkGeo.translate(0, height / 2, 0);
        const trunk = new THREE.Mesh(trunkGeo, deadTrunkMat);
        trunk.castShadow = true; trunk.receiveShadow = true;
        group.add(trunk);

        // Sparse, broken foliage (30-50% of normal)
        const layers = 4; // Fewer layers
        const planesPerLayer = 3; // Fewer planes per layer
        const startY = height * 0.3;

        const deadFoliageMat = MATERIALS.treeLeaves.clone();
        deadFoliageMat.color.set(0x4a4a3a); // Desaturated brownish
        deadFoliageMat.opacity = 0.6;
        deadFoliageMat.transparent = true;

        const vertices: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        let vIdx = 0;

        for (let l = 0; l < layers; l++) {
            // Skip some layers randomly for broken appearance
            if (Math.random() < 0.3) continue;

            const t = l / (layers - 1);
            const layerY = startY + (l / layers) * (height - startY);
            const layerSpread = spreadBase * (1.0 - t * 0.6);
            const layerHeight = (height / layers) * 1.5;

            for (let p = 0; p < planesPerLayer; p++) {
                // Skip some planes for broken branches
                if (Math.random() < 0.4) continue;

                const angle = (Math.PI / planesPerLayer) * p + (Math.random() * 0.8);
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const hw = layerSpread * (0.5 + Math.random() * 0.5); // Variable width
                const hh = layerHeight;

                const yBot = -hh * 0.4;
                const yTop = hh * 0.6;

                const transform = (x: number, y: number, z: number) => {
                    return [x * cos - z * sin, y + layerY, x * sin + z * cos];
                };

                const p1 = transform(-hw, yBot, 0); const p2 = transform(hw, yBot, 0);
                const p3 = transform(-hw, yTop, 0); const p4 = transform(hw, yTop, 0);

                vertices.push(...p1, ...p2, ...p3, ...p4);
                uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
                indices.push(vIdx, vIdx + 1, vIdx + 2, vIdx + 2, vIdx + 1, vIdx + 3);
                vIdx += 4;
            }
        }

        if (vertices.length > 0) {
            const foliageGeo = new THREE.BufferGeometry();
            foliageGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            foliageGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            foliageGeo.setIndex(indices);
            foliageGeo.computeVertexNormals();

            const foliage = new THREE.Mesh(foliageGeo, deadFoliageMat);
            foliage.castShadow = true;
            group.add(foliage);
        }

        group.userData.material = 'WOOD';
        uniqueMeshes['dead'].push(group);
        if (yieldToMain) await yieldToMain();
    }

    // 6. ROCKS
    for (let i = 0; i < NATURE_VARIANTS; i++) {
        const group = new THREE.Group();
        const geo = new THREE.DodecahedronGeometry(1, 0);
        const pos = geo.attributes.position;
        for (let v = 0; v < pos.count; v++) {
            pos.setXYZ(v, pos.getX(v) * (0.8 + Math.random() * 0.4), pos.getY(v) * (0.8 + Math.random() * 0.4), pos.getZ(v) * (0.8 + Math.random() * 0.4));
        }
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, MATERIALS.stone);
        mesh.castShadow = true; mesh.receiveShadow = true;
        group.add(mesh);
        group.userData.material = 'STONE';
        uniqueMeshes['rock'].push(group);
        if (yieldToMain && i % 2 === 0) await yieldToMain();
    }
};

export const EnvironmentGenerator = {
    initPrototypes: initNaturePrototypes,

    getPrototypes: () => {
        return [
            ...uniqueMeshes['spruce'],
            ...uniqueMeshes['pine'],
            ...uniqueMeshes['birch'],
            ...uniqueMeshes['oak'],
            ...uniqueMeshes['dead'],
            ...uniqueMeshes['rock']
        ];
    },

    createTree: (type: 'spruce' | 'pine' | 'birch' | 'oak' | 'dead' = 'spruce', scale: number = 1.0) => {
        const list = uniqueMeshes[type] || uniqueMeshes['spruce'];
        if (list.length === 0) {
            console.warn(`EnvironmentGenerator: No prototypes for ${type}, falling back to rock.`);
            return EnvironmentGenerator.createRock(scale);
        }
        const p = list[Math.floor(Math.random() * list.length)];
        const t = p.clone();
        t.scale.multiplyScalar(scale);
        t.rotation.y = Math.random() * Math.PI * 2;
        t.userData.material = 'WOOD';
        return t;
    },

    /**
     * Create a dead tree - either standing or fallen
     */
    createDeadTree: (variant: 'standing' | 'fallen' = 'standing', scale: number = 1.0) => {
        if (variant === 'fallen') {
            // Fallen log variant
            const group = new THREE.Group();
            const length = 8 + Math.random() * 6;
            const radius = 0.3 + Math.random() * 0.2;

            const deadTrunkMat = MATERIALS.treeTrunk.clone();
            deadTrunkMat.color.set(0x3a3020);

            const logGeo = new THREE.CylinderGeometry(radius, radius * 0.8, length, 8);
            logGeo.rotateZ(Math.PI / 2); // Make horizontal
            const log = new THREE.Mesh(logGeo, deadTrunkMat);
            log.castShadow = true;
            log.receiveShadow = true;
            group.add(log);

            // Broken end (jagged)
            const endGeo = new THREE.ConeGeometry(radius * 0.6, 0.5, 6);
            endGeo.rotateZ(-Math.PI / 2);
            endGeo.translate(length / 2, 0, 0);
            const end = new THREE.Mesh(endGeo, deadTrunkMat);
            end.rotation.y = Math.random() * Math.PI * 2;
            group.add(end);

            group.scale.setScalar(scale);
            group.userData.material = 'WOOD';
            return group;
        } else {
            // Standing variant (use existing dead tree)
            return EnvironmentGenerator.createTree('dead', scale);
        }
    },

    createTreeStump: (scale: number = 1.0) => {
        const group = new THREE.Group();
        const height = 0.6 + Math.random() * 0.4;
        const radius = 0.4 + Math.random() * 0.2;

        const sideGeo = new THREE.CylinderGeometry(radius, radius * 1.1, height, 8);
        const sideMesh = new THREE.Mesh(sideGeo, MATERIALS.treeTrunk);
        sideMesh.position.y = height / 2;
        sideMesh.castShadow = true;
        group.add(sideMesh);

        const topGeo = new THREE.CircleGeometry(radius, 8);
        const topMesh = new THREE.Mesh(topGeo, MATERIALS.treeStumpTop);
        topMesh.rotation.x = -Math.PI / 2;
        topMesh.position.y = height + 0.01;
        topMesh.receiveShadow = true;
        group.add(topMesh);

        group.scale.setScalar(scale);
        group.rotation.y = Math.random() * Math.PI * 2;
        group.userData.material = 'WOOD';
        return group;
    },

    createDeforestation: (ctx: SectorContext, x: number, z: number, width: number, depth: number, count: number = 10) => {
        for (let i = 0; i < count; i++) {
            const rx = x + (Math.random() - 0.5) * width;
            const rz = z + (Math.random() - 0.5) * depth;
            const stump = EnvironmentGenerator.createTreeStump(0.8 + Math.random() * 0.5);
            stump.position.set(rx, 0, rz);
            ctx.scene.add(stump);
            ctx.obstacles.push({
                mesh: stump,
                collider: { type: 'cylinder', radius: 0.5, height: 1.0 }
            });
        }
    },

    createRock: (scale: number = 1.0, radius: number = 1.0) => {
        const list = uniqueMeshes['rock'];
        if (list.length === 0) {
            console.warn("EnvironmentGenerator: No rock prototypes, falling back to stone box.");
            return EnvironmentGenerator.createStone(scale);
        }
        const p = list[Math.floor(Math.random() * list.length)];
        const r = p.clone();
        r.scale.setScalar(scale * radius);
        r.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        r.userData.material = 'STONE';
        return r;
    },

    createStone: (scale: number = 1.0) => {
        const group = new THREE.Group();
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            pos.setXYZ(i,
                pos.getX(i) + (Math.random() - 0.5) * 0.2,
                pos.getY(i) + (Math.random() - 0.5) * 0.2,
                pos.getZ(i) + (Math.random() - 0.5) * 0.2
            );
        }
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, MATERIALS.stone);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        group.scale.setScalar(scale);
        group.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        group.userData.material = 'STONE';
        return group;
    },

    /**
     * Spawns trees within a polygonal area using instanced meshes
     */
    createForest: async (ctx: SectorContext, polygon: THREE.Vector3[], spacing: number = 8, type: string | string[] = 'random') => {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        polygon.forEach(p => {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
        });

        const validPointsByType: Record<string, { x: number, z: number, r: number, s: number }[]> = {};
        const types = Array.isArray(type) ? type : (type === 'random' ? ['spruce', 'pine', 'birch'] : [type]);

        for (let x = minX; x <= maxX; x += spacing) {
            for (let z = minZ; z <= maxZ; z += spacing) {
                const jx = x + (Math.random() - 0.5) * spacing;
                const jz = z + (Math.random() - 0.5) * spacing;

                let inside = false;
                for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                    const xi = polygon[i].x, zi = polygon[i].z;
                    const xj = polygon[j].x, zj = polygon[j].z;
                    const intersect = ((zi > jz) !== (zj > jz)) && (jx < (xj - xi) * (jz - zi) / (zj - zi) + xi);
                    if (intersect) inside = !inside;
                }

                if (inside) {
                    const selectedType = types[Math.floor(Math.random() * types.length)];
                    if (!validPointsByType[selectedType]) validPointsByType[selectedType] = [];
                    validPointsByType[selectedType].push({
                        x: jx,
                        z: jz,
                        r: Math.random() * Math.PI * 2,
                        s: 0.8 + Math.random() * 0.5
                    });
                }
            }
            if (ctx.yield) await ctx.yield();
        }

        for (const treeType of Object.keys(validPointsByType)) {
            EnvironmentGenerator.addInstancedTrees(ctx, treeType, validPointsByType[treeType]);
            if (ctx.yield) await ctx.yield();
        }
    },

    /**
     * Add instanced trees to scene (Zero-GC optimized)
     */
    addInstancedTrees: (ctx: SectorContext, treeType: string, points: { x: number, z: number, r: number, s: number }[]) => {
        initNaturePrototypes();
        const protoList = (uniqueMeshes as any)[treeType];
        if (!protoList || protoList.length === 0) return;

        const pointsByVariant: { x: number, z: number, r: number, s: number }[][] = Array.from({ length: protoList.length }, () => []);
        points.forEach(p => {
            const vIdx = Math.floor(Math.random() * protoList.length);
            pointsByVariant[vIdx].push(p);
        });

        for (let vIdx = 0; vIdx < pointsByVariant.length; vIdx++) {
            const variantPoints = pointsByVariant[vIdx];
            if (variantPoints.length === 0) continue;
            const protoGroup = protoList[vIdx];

            const parts: { geo: THREE.BufferGeometry, mat: THREE.Material }[] = [];
            protoGroup.traverse((child: any) => {
                if (child instanceof THREE.Mesh) {
                    parts.push({ geo: child.geometry, mat: child.material });
                }
            });

            for (const part of parts) {
                const instancedMesh = new THREE.InstancedMesh(part.geo, part.mat, variantPoints.length);
                instancedMesh.castShadow = true;
                instancedMesh.receiveShadow = true;

                const rotAxis = new THREE.Vector3(0, 1, 0);
                const matrix = new THREE.Matrix4();
                const quat = new THREE.Quaternion();

                for (let i = 0; i < variantPoints.length; i++) {
                    const p = variantPoints[i];
                    quat.setFromAxisAngle(rotAxis, p.r);
                    matrix.compose(new THREE.Vector3(p.x, 0, p.z), quat, new THREE.Vector3(p.s, p.s, p.s));
                    instancedMesh.setMatrixAt(i, matrix);
                }
                instancedMesh.instanceMatrix.needsUpdate = true;
                ctx.scene.add(instancedMesh);
            }

            variantPoints.forEach(p => {
                const c = new THREE.Object3D();
                c.visible = false;
                c.name = 'TreeCollision';
                c.position.set(p.x, 2, p.z);
                c.updateMatrixWorld();
                ctx.scene.add(c);
                const obstacle = { mesh: c, collider: { type: 'sphere' as const, radius: 0.4 * p.s, height: 4 } };

                SectorGenerator.addObstacle(ctx, obstacle);
            });
        }
    },

    /**
     * Fill an area with trees or rocks using Poisson disc sampling
     */
    fillArea: async (
        ctx: SectorContext,
        center: { x: number, z: number },
        size: { width: number, height: number } | number,
        count: number,
        type: 'tree' | 'rock' | 'debris',
        avoidCenterRadius: number = 0,
        exclusionZones: { pos: THREE.Vector3, radius: number }[] = []
    ) => {
        const isRect = typeof size !== 'number';
        const rectW = isRect ? (size as any).width : 0;
        const rectH = isRect ? (size as any).height : 0;
        const radius = !isRect ? (size as number) : 0;

        const treePoints: { x: number, z: number, r: number, s: number }[] = [];

        for (let i = 0; i < count; i++) {
            let px, pz;
            let attempts = 0;
            const maxAttempts = 50;

            do {
                if (isRect) {
                    px = center.x + (Math.random() - 0.5) * rectW;
                    pz = center.z + (Math.random() - 0.5) * rectH;
                } else {
                    const angle = Math.random() * Math.PI * 2;
                    const r = Math.sqrt(Math.random()) * radius;
                    px = center.x + Math.cos(angle) * r;
                    pz = center.z + Math.sin(angle) * r;
                }

                const dx = px - center.x;
                const dz = pz - center.z;
                const dist = Math.sqrt(dx * dx + dz * dz);

                if (dist < avoidCenterRadius) {
                    attempts++;
                    continue;
                }

                let inExclusionZone = false;
                for (const zone of exclusionZones) {
                    const zx = px - zone.pos.x;
                    const zz = pz - zone.pos.z;
                    const zDist = Math.sqrt(zx * zx + zz * zz);
                    if (zDist < zone.radius) {
                        inExclusionZone = true;
                        break;
                    }
                }

                if (!inExclusionZone) break;
                attempts++;
            } while (attempts < maxAttempts);

            if (attempts >= maxAttempts) continue;

            if (type === 'tree') {
                const scale = 0.8 + Math.random() * 0.5;
                treePoints.push({ x: px, z: pz, r: Math.random() * Math.PI * 2, s: scale });
            } else if (type === 'rock') {
                const rock = EnvironmentGenerator.createRock(0.8 + Math.random() * 0.6, 0.8 + Math.random() * 0.5);
                rock.position.set(px, 0, pz);
                ctx.scene.add(rock);

                SectorGenerator.addObstacle(ctx, { mesh: rock, collider: { type: 'sphere', radius: 0.8 } });
            } else if (type === 'debris') {
                const debris = EnvironmentGenerator.createStone(0.3 + Math.random() * 0.4);
                debris.position.set(px, 0, pz);
                ctx.scene.add(debris);
            }

            if (ctx.yield && i % 20 === 0) await ctx.yield();
        }

        if (type === 'tree' && treePoints.length > 0) {
            const treeType = ['spruce', 'pine', 'birch'][Math.floor(Math.random() * 3)];
            EnvironmentGenerator.addInstancedTrees(ctx, treeType, treePoints);
        }
    },

    /**
     * Create grass tuft with wind animation shader
     */
    createGrassTuft: (windSystem?: any) => {
        const group = new THREE.Group();
        const bladeCount = 5 + Math.floor(Math.random() * 3);
        const height = 0.3 + Math.random() * 0.2;
        const spread = 0.1 + Math.random() * 0.05;

        // Wind-animated grass material
        const grassMat = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                windStrength: { value: windSystem ? windSystem.strength : 0.5 },
                windDirection: { value: windSystem ? new THREE.Vector2(windSystem.direction.x, windSystem.direction.z) : new THREE.Vector2(1, 0) },
                grassColor: { value: new THREE.Color(0x4a7c4a) }
            },
            vertexShader: `
                uniform float time;
                uniform float windStrength;
                uniform vec2 windDirection;
                varying vec2 vUv;
                varying float vDisplacement;

                void main() {
                    vUv = uv;
                    vec3 pos = position;

                    // Wind displacement (affects top more than bottom)
                    float heightFactor = uv.y; // 0 at base, 1 at tip
                    float windSpeed = time * 2.0;
                    float windWave = sin(windSpeed + pos.x * 3.0 + pos.z * 3.0) * windStrength;
                    
                    pos.x += windDirection.x * windWave * heightFactor * 0.2;
                    pos.z += windDirection.y * windWave * heightFactor * 0.2;
                    
                    vDisplacement = windWave * heightFactor;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 grassColor;
                varying vec2 vUv;
                varying float vDisplacement;

                void main() {
                    // Gradient from dark at base to lighter at tip
                    vec3 baseColor = grassColor * 0.6;
                    vec3 tipColor = grassColor * 1.2;
                    vec3 color = mix(baseColor, tipColor, vUv.y);
                    
                    // Add subtle highlight from wind
                    color += vec3(0.1) * abs(vDisplacement);
                    
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            side: THREE.DoubleSide
        });

        // Create grass blades as thin planes
        for (let i = 0; i < bladeCount; i++) {
            const angle = (Math.PI * 2 / bladeCount) * i + Math.random() * 0.5;
            const bladeHeight = height * (0.8 + Math.random() * 0.4);
            const bladeWidth = 0.02 + Math.random() * 0.01;

            const bladeGeo = new THREE.PlaneGeometry(bladeWidth, bladeHeight, 1, 3);
            // Bend the blade slightly
            const pos = bladeGeo.attributes.position;
            for (let v = 0; v < pos.count; v++) {
                const y = pos.getY(v);
                const bendFactor = (y / bladeHeight + 0.5) * 0.1;
                pos.setX(v, pos.getX(v) + bendFactor * Math.cos(angle));
            }
            bladeGeo.translate(0, bladeHeight / 2, 0);

            const blade = new THREE.Mesh(bladeGeo, grassMat);
            blade.rotation.y = angle;
            blade.position.x = Math.cos(angle) * spread * Math.random();
            blade.position.z = Math.sin(angle) * spread * Math.random();
            group.add(blade);
        }

        group.userData.material = 'GRASS';
        group.userData.windAnimated = true;
        return group;
    },

    /**
     * Create flower with color variant and emissive glow
     */
    createFlower: (colorVariant: number = 0) => {
        const group = new THREE.Group();
        const stemHeight = 0.2 + Math.random() * 0.15;

        // Flower colors (5 variants)
        const flowerColors = [
            new THREE.Color(0xff69b4), // Pink
            new THREE.Color(0xffff00), // Yellow
            new THREE.Color(0xff6600), // Orange
            new THREE.Color(0x9966ff), // Purple
            new THREE.Color(0xffffff)  // White
        ];
        const color = flowerColors[colorVariant % 5];

        // Stem
        const stemGeo = new THREE.CylinderGeometry(0.005, 0.008, stemHeight, 3);
        stemGeo.translate(0, stemHeight / 2, 0);
        const stemMat = new THREE.MeshStandardMaterial({ color: 0x2d5016, roughness: 0.8 });
        const stem = new THREE.Mesh(stemGeo, stemMat);
        group.add(stem);

        // Flower petals (simple crossed planes with emissive)
        const petalMat = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.3,
            roughness: 0.6,
            side: THREE.DoubleSide
        });

        const petalSize = 0.08 + Math.random() * 0.03;
        const petalGeo = new THREE.CircleGeometry(petalSize, 5);

        // Create 2 crossed petal planes
        for (let i = 0; i < 2; i++) {
            const petal = new THREE.Mesh(petalGeo, petalMat);
            petal.position.y = stemHeight;
            petal.rotation.y = (Math.PI / 2) * i;
            petal.rotation.x = Math.PI / 2;
            group.add(petal);
        }

        // Center dot (darker)
        const centerGeo = new THREE.CircleGeometry(petalSize * 0.3, 6);
        const centerMat = new THREE.MeshStandardMaterial({
            color: 0x4a3000,
            roughness: 0.9,
            side: THREE.DoubleSide
        });
        const center = new THREE.Mesh(centerGeo, centerMat);
        center.position.y = stemHeight + 0.01;
        center.rotation.x = -Math.PI / 2;
        group.add(center);

        group.userData.material = 'PLANT';
        return group;
    },

    /**
     * Fill area with grass tufts using instanced meshes
     */
    fillAreaWithGrass: async (ctx: SectorContext, polygon: THREE.Vector3[], density: number = 2.0, windSystem?: any) => {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        polygon.forEach(p => {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
        });

        const spacing = 1.0 / density;
        const positions: { x: number, z: number, r: number, s: number }[] = [];

        for (let x = minX; x <= maxX; x += spacing) {
            for (let z = minZ; z <= maxZ; z += spacing) {
                const jx = x + (Math.random() - 0.5) * spacing;
                const jz = z + (Math.random() - 0.5) * spacing;

                // Point-in-polygon test
                let inside = false;
                for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                    const xi = polygon[i].x, zi = polygon[i].z;
                    const xj = polygon[j].x, zj = polygon[j].z;
                    const intersect = ((zi > jz) !== (zj > jz)) && (jx < (xj - xi) * (jz - zi) / (zj - zi) + xi);
                    if (intersect) inside = !inside;
                }

                if (inside) {
                    positions.push({
                        x: jx,
                        z: jz,
                        r: Math.random() * Math.PI * 2,
                        s: 0.8 + Math.random() * 0.4
                    });
                }
            }
            if (ctx.yield) await ctx.yield();
        }

        // Create single prototype and instance it
        const protoGrass = EnvironmentGenerator.createGrassTuft(windSystem);
        const parts: { geo: THREE.BufferGeometry, mat: THREE.Material }[] = [];
        protoGrass.traverse((child: any) => {
            if (child instanceof THREE.Mesh) {
                parts.push({ geo: child.geometry, mat: child.material });
            }
        });

        for (const part of parts) {
            const instancedMesh = new THREE.InstancedMesh(part.geo, part.mat, positions.length);
            const matrix = new THREE.Matrix4();
            const quat = new THREE.Quaternion();
            const rotAxis = new THREE.Vector3(0, 1, 0);

            for (let i = 0; i < positions.length; i++) {
                const p = positions[i];
                quat.setFromAxisAngle(rotAxis, p.r);
                matrix.compose(new THREE.Vector3(p.x, 0, p.z), quat, new THREE.Vector3(p.s, p.s, p.s));
                instancedMesh.setMatrixAt(i, matrix);
            }
            instancedMesh.instanceMatrix.needsUpdate = true;
            instancedMesh.castShadow = true;
            instancedMesh.receiveShadow = true;
            instancedMesh.userData.windAnimated = true;
            ctx.scene.add(instancedMesh);
        }

        if (ctx.yield) await ctx.yield();
    },

    /**
     * Fill area with flowers using instanced meshes
     */
    fillAreaWithFlowers: async (ctx: SectorContext, polygon: THREE.Vector3[], density: number = 0.5) => {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        polygon.forEach(p => {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
        });

        const spacing = 1.0 / density;
        const positionsByColor: { x: number, z: number, r: number, s: number }[][] = [[], [], [], [], []];

        for (let x = minX; x <= maxX; x += spacing) {
            for (let z = minZ; z <= maxZ; z += spacing) {
                const jx = x + (Math.random() - 0.5) * spacing;
                const jz = z + (Math.random() - 0.5) * spacing;

                // Point-in-polygon test
                let inside = false;
                for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                    const xi = polygon[i].x, zi = polygon[i].z;
                    const xj = polygon[j].x, zj = polygon[j].z;
                    const intersect = ((zi > jz) !== (zj > jz)) && (jx < (xj - xi) * (jz - zi) / (zj - zi) + xi);
                    if (intersect) inside = !inside;
                }

                if (inside) {
                    const colorVariant = Math.floor(Math.random() * 5);
                    positionsByColor[colorVariant].push({
                        x: jx,
                        z: jz,
                        r: Math.random() * Math.PI * 2,
                        s: 0.8 + Math.random() * 0.4
                    });
                }
            }
            if (ctx.yield) await ctx.yield();
        }

        // Create instanced meshes for each color variant
        for (let colorIdx = 0; colorIdx < 5; colorIdx++) {
            const positions = positionsByColor[colorIdx];
            if (positions.length === 0) continue;

            const protoFlower = EnvironmentGenerator.createFlower(colorIdx);
            const parts: { geo: THREE.BufferGeometry, mat: THREE.Material }[] = [];
            protoFlower.traverse((child: any) => {
                if (child instanceof THREE.Mesh) {
                    parts.push({ geo: child.geometry, mat: child.material });
                }
            });

            for (const part of parts) {
                const instancedMesh = new THREE.InstancedMesh(part.geo, part.mat, positions.length);
                const matrix = new THREE.Matrix4();
                const quat = new THREE.Quaternion();
                const rotAxis = new THREE.Vector3(0, 1, 0);

                for (let i = 0; i < positions.length; i++) {
                    const p = positions[i];
                    quat.setFromAxisAngle(rotAxis, p.r);
                    matrix.compose(new THREE.Vector3(p.x, 0, p.z), quat, new THREE.Vector3(p.s, p.s, p.s));
                    instancedMesh.setMatrixAt(i, matrix);
                }
                instancedMesh.instanceMatrix.needsUpdate = true;
                instancedMesh.castShadow = true;
                instancedMesh.receiveShadow = true;
                ctx.scene.add(instancedMesh);
            }

            if (ctx.yield) await ctx.yield();
        }
    },

    /**
     * Fill wheat field with instanced wheat stalks
     */
    fillWheatField: async (ctx: SectorContext, polygon: THREE.Vector3[], density: number = 0.5) => {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        polygon.forEach(p => {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
        });

        const spacing = 1.0 / density;
        const positions: THREE.Vector3[] = [];

        for (let x = minX; x <= maxX; x += spacing) {
            for (let z = minZ; z <= maxZ; z += spacing) {
                const jx = x + (Math.random() - 0.5) * (spacing * 0.5);
                const jz = z + (Math.random() - 0.5) * (spacing * 0.5);

                let inside = false;
                for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                    const xi = polygon[i].x, zi = polygon[i].z;
                    const xj = polygon[j].x, zj = polygon[j].z;
                    const intersect = ((zi > jz) !== (zj > jz)) && (jx < (xj - xi) * (jz - zi) / (zj - zi) + xi);
                    if (intersect) inside = !inside;
                }

                if (inside) {
                    positions.push(new THREE.Vector3(jx, 0, jz));
                }
            }
            if (ctx.yield) await ctx.yield();
        }

        // Create wheat stalk geometry (simplified)
        const stalkGeo = new THREE.CylinderGeometry(0.02, 0.03, 0.8, 4);
        stalkGeo.translate(0, 0.4, 0);
        const headGeo = new THREE.SphereGeometry(0.08, 4, 3);
        headGeo.translate(0, 0.9, 0);

        const mergedGeo = new THREE.BufferGeometry();
        // Note: For simplicity, using just stalk. In production, merge geometries.
        mergedGeo.copy(stalkGeo);

        const wheatMat = MATERIALS.grass || new THREE.MeshStandardMaterial({ color: 0xd4a574 });
        const instanced = new THREE.InstancedMesh(mergedGeo, wheatMat, positions.length);
        const dummy = new THREE.Object3D();

        positions.forEach((p, i) => {
            dummy.position.copy(p);
            dummy.rotation.y = Math.random() * Math.PI;
            dummy.scale.setScalar(0.8 + Math.random() * 0.4);
            dummy.updateMatrix();
            instanced.setMatrixAt(i, dummy.matrix);
        });
        instanced.instanceMatrix.needsUpdate = true;
        instanced.castShadow = true;
        instanced.receiveShadow = true;
        ctx.scene.add(instanced);
        if (ctx.yield) await ctx.yield();
    },
};
