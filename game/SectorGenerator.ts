
import * as THREE from 'three';
import { SectorContext } from './sectors/types';
import { MATERIALS, GEOMETRY, createTextSprite } from '../utils/assets';
import { MapItemType } from '../types';

export const SectorBuilder = {
    spawnTree: (ctx: SectorContext, x: number, z: number, scaleMultiplier: number = 1.0) => {
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        // --- Forest House Style Pine ---
        // "Cross-Plane" Method: Intersecting vertical planes with a painterly texture
        
        const baseHeight = 12; // Approx 6x player height (2m)
        const height = baseHeight * scaleMultiplier;
        const maxSpread = 3.5 * scaleMultiplier;

        // 1. Trunk (Tall, Thin Cylinder)
        const trunkGeo = new THREE.CylinderGeometry(0.2 * scaleMultiplier, 0.4 * scaleMultiplier, height, 5);
        const trunkMat = new THREE.MeshStandardMaterial({ 
            map: ctx.textures?.barkTex, // Apply procedural bark texture
            color: 0xffffff, // White to allow texture colors to show through
            roughness: 1.0 
        });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = height / 2;
        trunk.castShadow = true;
        group.add(trunk);

        // 2. Foliage Material (Painterly with Alpha Test)
        const needleMat = new THREE.MeshStandardMaterial({ 
            map: ctx.textures?.pineBranchTex, 
            alphaMap: ctx.textures?.pineBranchTex, // Self-alpha
            color: 0xffffff,
            transparent: true,
            alphaTest: 0.5,
            side: THREE.DoubleSide,
            roughness: 0.8
        });

        // 3. Foliage Layers (Stacked Clusters)
        const layers = 7;
        const startY = 1.5 * scaleMultiplier;
        
        for(let i = 0; i < layers; i++) {
            const t = i / (layers - 1); // 0 (bottom) to 1 (top)
            
            // Height of this layer
            const y = startY + (i / layers) * (height - startY);
            
            // Taper Logic: (1-t)^0.7 creates a nice convex pine curve
            const spread = (maxSpread * Math.pow(1 - t, 0.7)) + 0.5;
            const layerHeight = (height / layers) * 2.0; // Overlap for density

            // Create Cluster of 4 Vertical Planes (The "X" Pattern: 0, 45, 90, 135)
            const cluster = new THREE.Group();
            cluster.position.y = y;

            const planeGeo = new THREE.PlaneGeometry(spread * 2, layerHeight); // Width = Diameter
            const angles = [0, Math.PI/4, Math.PI/2, 3*Math.PI/4]; // 0, 45, 90, 135

            angles.forEach(rot => {
                const plane = new THREE.Mesh(planeGeo, needleMat);
                plane.rotation.y = rot;
                // Slight random pitch for variation
                plane.rotation.x = (Math.random() - 0.5) * 0.1;
                cluster.add(plane);
            });

            // Randomize cluster rotation to avoid uniform look
            cluster.rotation.y = Math.random() * Math.PI;
            
            group.add(cluster);
        }

        // 4. Overall Tree Variation
        const leanX = (Math.random() - 0.5) * 0.1;
        const leanZ = (Math.random() - 0.5) * 0.1;
        group.rotation.set(leanX, Math.random() * Math.PI, leanZ);

        ctx.scene.add(group);
        
        // Collision (Trunk only)
        const colRadius = 0.5 * scaleMultiplier;
        ctx.obstacles.push({
            mesh: group, 
            collider: { type: 'sphere', radius: colRadius } 
        });
    },

    spawnStreetLamp: (ctx: SectorContext, x: number, z: number) => {
        const lamp = new THREE.Group();
        lamp.position.set(x, 0, z);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 8), MATERIALS.blackMetal);
        post.position.y = 4;
        lamp.add(post);
        const head = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 2), MATERIALS.blackMetal);
        head.position.set(0, 8, 1);
        lamp.add(head);
        const light = new THREE.SpotLight(0xffffaa, 50, 40, 0.8, 0.5, 1);
        light.position.set(0, 7.5, 1);
        light.target.position.set(0, 0, 1);
        lamp.add(light);
        lamp.add(light.target);
        ctx.scene.add(lamp);
        ctx.obstacles.push({mesh: lamp, radius: 0.5});
        if (Math.random() > 0.8) ctx.flickeringLights.push({light, baseInt: 50, flickerRate: 0.2});
    },

    spawnDebugMarker: (ctx: SectorContext, x: number, z: number, radius: number, label: string) => {
        if (!ctx.debugMode) return;
        const marker = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.1, 32), new THREE.MeshBasicMaterial({color: 0xff0000, wireframe: true}));
        marker.position.set(x, 0.1, z);
        ctx.scene.add(marker);
        const sprite = createTextSprite(label);
        sprite.position.set(x, 5, z);
        ctx.scene.add(sprite);
    },

    spawnCar: (ctx: SectorContext, x: number, z: number, rotation: number) => {
        const car = new THREE.Mesh(GEOMETRY.prop_car, new THREE.MeshStandardMaterial({color: Math.random() * 0xffffff}));
        car.position.set(x, 0.9, z);
        car.rotation.y = rotation;
        car.castShadow = true;
        ctx.scene.add(car);
        ctx.obstacles.push({mesh: car, collider: {type: 'box', size: new THREE.Vector3(6, 4, 11)}});
    },

    spawnVolvo: (ctx: SectorContext, x: number, z: number, rotation: number, stackHeight: number = 0) => {
        const car = new THREE.Mesh(GEOMETRY.prop_car, new THREE.MeshStandardMaterial({color: 0x556677}));
        car.position.set(x, 0.9 + stackHeight * 1.8, z);
        car.rotation.y = rotation;
        car.castShadow = true;
        ctx.scene.add(car);
        if (stackHeight === 0) ctx.obstacles.push({mesh: car, collider: {type: 'box', size: new THREE.Vector3(6, 4, 11)}});
    },

    createRailTrack: (ctx: SectorContext, start: THREE.Vector3, end: THREE.Vector3) => {
        const dist = start.distanceTo(end);
        const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        const angle = Math.atan2(dir.x, dir.z);
        
        const group = new THREE.Group();
        group.position.copy(mid);
        group.rotation.y = angle;
        
        const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, dist), MATERIALS.blackMetal); r1.position.set(-0.7, 0.1, 0);
        const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, dist), MATERIALS.blackMetal); r2.position.set(0.7, 0.1, 0);
        group.add(r1); group.add(r2);
        
        const sleepers = Math.floor(dist / 1.5);
        const sleeperMat = new THREE.MeshStandardMaterial({color: 0x3e2723});
        for(let i=0; i<sleepers; i++) {
            const s = new THREE.Mesh(GEOMETRY.sleeper, sleeperMat);
            s.position.set(0, 0.05, -dist/2 + i * 1.5);
            group.add(s);
        }
        ctx.scene.add(group);
    },

    createCurvedRailTrack: (ctx: SectorContext, points: THREE.Vector3[]) => {
        const curve = new THREE.CatmullRomCurve3(points);
        const pointsCount = Math.floor(curve.getLength() * 2);
        const shape = new THREE.Shape();
        shape.moveTo(-0.7, 0); shape.lineTo(-0.9, 0); shape.lineTo(-0.9, 0.2); shape.lineTo(-0.7, 0.2);
        shape.moveTo(0.7, 0); shape.lineTo(0.9, 0); shape.lineTo(0.9, 0.2); shape.lineTo(0.7, 0.2);
        
        const extrudeSettings = { steps: pointsCount, bevelEnabled: false, extrudePath: curve };
        const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        const mesh = new THREE.Mesh(geo, MATERIALS.blackMetal);
        ctx.scene.add(mesh);
        
        const spacedPoints = curve.getSpacedPoints(Math.floor(curve.getLength() / 1.5));
        const sleeperGeo = new THREE.BoxGeometry(2.5, 0.1, 0.4);
        const sleeperMat = new THREE.MeshStandardMaterial({color: 0x3e2723});
        
        for(let i=0; i<spacedPoints.length-1; i++) {
            const pt = spacedPoints[i];
            const next = spacedPoints[i+1];
            const m = new THREE.Mesh(sleeperGeo, sleeperMat);
            m.position.copy(pt);
            m.lookAt(next);
            ctx.scene.add(m);
        }
        return curve;
    },

    spawnClueMarker: (ctx: SectorContext, x: number, z: number, id: string, icon: string) => {
        const group = new THREE.Group();
        group.position.set(x, 1, z);
        const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), new THREE.MeshBasicMaterial({color: 0xffff00, wireframe: true}));
        group.add(marker);
        const light = new THREE.PointLight(0xffff00, 2, 5);
        group.add(light);
        group.userData = { id, type: 'clue_visual' };
        ctx.scene.add(group);
    },

    visualizeTriggers: (ctx: SectorContext) => {
        if (!ctx.debugMode) return;
        ctx.triggers.forEach(t => {
            const geo = new THREE.CylinderGeometry(t.radius, t.radius, 0.1, 32);
            const mat = new THREE.MeshBasicMaterial({color: 0x00ff00, transparent: true, opacity: 0.2});
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(t.position.x, 0.05, t.position.z);
            ctx.scene.add(mesh);
        });
    },

    spawnChest: (ctx: SectorContext, x: number, z: number, type: 'standard' | 'big', rotation: number) => {
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        group.rotation.y = rotation;
        
        const body = new THREE.Mesh(GEOMETRY.chestBody, MATERIALS.chestStandard);
        body.position.y = 0.5;
        body.castShadow = true;
        group.add(body);
        
        const lid = new THREE.Mesh(GEOMETRY.chestLid, MATERIALS.chestStandard);
        lid.position.y = 1.2;
        lid.castShadow = true;
        group.add(lid);
        
        ctx.scene.add(group);
        
        const mapItemType: MapItemType = 'CHEST';
        ctx.mapItems.push({
            id: `chest_${Math.floor(x)}_${Math.floor(z)}`,
            x, z,
            type: mapItemType,
            label: 'ui.chest',
            color: '#d97706',
            icon: 'chest'
        });
        
        ctx.chests.push({
            mesh: group,
            type,
            opened: false,
            scrap: type === 'big' ? 100 : 50
        });
    },

    fillArea: (ctx: SectorContext, pos: {x: number, z: number}, w: number | {width:number, height:number}, d: number, type: string, density: number, zones: any[]) => {
        const width = typeof w === 'object' ? w.width : w;
        const depth = typeof w === 'object' ? w.height : d;
        
        for(let i=0; i<density; i++) {
            const tx = pos.x + (Math.random()-0.5) * width;
            const tz = pos.z + (Math.random()-0.5) * depth;
            let ok = true;
            for(const z of zones) {
                const dist = Math.sqrt((tx - z.pos.x)**2 + (tz - z.pos.z)**2);
                if (dist < z.radius) { ok = false; break; }
            }
            if (ok) {
                if (type === 'tree') SectorBuilder.spawnTree(ctx, tx, tz, 1.0 + Math.random()*0.5);
            }
        }
    },

    generatePlaceholder: (ctx: SectorContext) => {
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({color: 0x555555}));
        floor.rotation.x = -Math.PI/2;
        ctx.scene.add(floor);
    }
};
