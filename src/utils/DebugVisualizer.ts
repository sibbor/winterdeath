import * as THREE from 'three';
import { SectorContext } from '../game/session/SectorTypes';
import { ObjectGenerator } from '../core/world/generators/ObjectGenerator';
import { GEOMETRY, MATERIALS } from './assets';

// --- CACHED DEBUG RESOURCES (Zero-GC approach) ---
// Note: Materials are now located in src/utils/assets/materials.ts
// Geometries are now located in src/utils/assets/geometry.ts

export const DebugVisualizer = {

    /**
     * Master function to automatically draw all debug info for a loaded sector.
     * Extracts data from the context arrays (triggers, mapItems) without needing manual calls.
     */
    visualizeSector: (ctx: SectorContext, sectorDef?: any) => {
        if (!ctx.debugMode) return;

        // VINTERDÖD FIX: Clear old debug objects to prevent geometry leaks and FPS drops
        const existing = ctx.scene.getObjectByName('DEBUG_GROUP');
        if (existing) {
            ctx.scene.remove(existing);
            // Dispose of geometries to free VRAM
            existing.traverse((child: any) => {
                if (child.geometry) child.geometry.dispose();
            });
        }

        const debugGroup = new THREE.Group();
        debugGroup.name = 'DEBUG_GROUP';
        ctx.scene.add(debugGroup);

        // 1. Visualize Sector Bounds
        if (sectorDef?.bounds) {
            const w = sectorDef.bounds.width;
            const d = sectorDef.bounds.depth;
            const pts = [
                new THREE.Vector3(-w / 2, 0.5, -d / 2),
                new THREE.Vector3(w / 2, 0.5, -d / 2),
                new THREE.Vector3(w / 2, 0.5, d / 2),
                new THREE.Vector3(-w / 2, 0.5, d / 2)
            ];
            DebugVisualizer.drawPolygon(ctx, pts, 'red', 1, debugGroup);
        }

        // 2. Visualize Triggers
        DebugVisualizer.visualizeTriggers(ctx, debugGroup);

        // 3. Visualize Areas from MapItems (Forests, Lakes, Mountains, Wheat)
        if (ctx.mapItems) {
            for (let i = 0; i < ctx.mapItems.length; i++) {
                const item = ctx.mapItems[i];
                if (item.points && item.points.length > 0) {
                    const vectors = new Array(item.points.length);
                    for (let j = 0; j < item.points.length; j++) {
                        vectors[j] = new THREE.Vector3(item.points[j].x, 1, item.points[j].z);
                    }

                    let color: 'red' | 'green' | 'blue' | 'yellow' = 'yellow';
                    if (item.type === 'FOREST') color = 'green';
                    else if (item.type === 'LAKE') color = 'blue';
                    else if (item.type === 'MOUNTAIN') color = 'red';

                    DebugVisualizer.drawPolygon(ctx, vectors, color, 1, debugGroup);
                }
            }
        }
    },

    drawPolygon: (ctx: SectorContext, points: THREE.Vector3[], color: 'red' | 'green' | 'blue' | 'yellow' = 'green', yOffset: number = 1, parent?: THREE.Object3D) => {
        if (!ctx.debugMode || !points || points.length === 0) return;

        const closedPoints = [...points, points[0]];
        const geo = new THREE.BufferGeometry().setFromPoints(closedPoints);

        const mat = color === 'red' ? MATERIALS.debugRed :
            color === 'green' ? MATERIALS.debugGreen :
                color === 'blue' ? MATERIALS.debugBlue : MATERIALS.debugYellow;

        const line = new THREE.Line(geo, mat);
        line.position.y = yOffset;

        if (parent) parent.add(line);
        else ctx.scene.add(line);
    },

    drawPath: (ctx: SectorContext, points: THREE.Vector3[], color: 'red' | 'green' | 'blue' | 'yellow' = 'blue', yOffset: number = 0, parent?: THREE.Object3D) => {
        if (!ctx.debugMode || !points || points.length === 0) return;

        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = color === 'red' ? MATERIALS.debugRed :
            color === 'green' ? MATERIALS.debugGreen :
                color === 'blue' ? MATERIALS.debugBlue : MATERIALS.debugYellow;

        const line = new THREE.Line(geo, mat);
        line.position.y = yOffset;

        if (parent) parent.add(line);
        else ctx.scene.add(line);
    },

    spawnMarker: (ctx: SectorContext, x: number, z: number, height: number, label: string, parent?: THREE.Object3D) => {
        if (!ctx.debugMode) return;

        const beam = new THREE.Mesh(GEOMETRY.debugMarker, MATERIALS.debugBeam);
        beam.position.set(x, 0, z);
        
        if (parent) parent.add(beam);
        else ctx.scene.add(beam);

        const sprite = ObjectGenerator.createTextSprite(label);
        sprite.scale.set(12, 3, 1);
        sprite.position.set(x, height + 4, z);
        
        if (parent) parent.add(sprite);
        else ctx.scene.add(sprite);
    },

    visualizeTriggers: (ctx: SectorContext, parent?: THREE.Object3D) => {
        if (!ctx.debugMode || !ctx.triggers) return;

        for (let i = 0; i < ctx.triggers.length; i++) {
            const trig = ctx.triggers[i];

            DebugVisualizer.spawnMarker(ctx, trig.position.x, trig.position.z, 2, trig.id.toUpperCase(), parent);

            let drawRadius = trig.radius;
            if (!drawRadius && trig.size) {
                drawRadius = Math.max(trig.size.width, trig.size.depth);
            }
            if (!drawRadius) drawRadius = 2.0;

            const ringGeo = new THREE.RingGeometry(drawRadius - 0.2, drawRadius, 32);
            const ring = new THREE.Mesh(ringGeo, MATERIALS.debugTriggerRing);

            ring.rotation.x = -Math.PI / 2;
            ring.position.set(trig.position.x, 0.1, trig.position.z);

            if (parent) parent.add(ring);
            else ctx.scene.add(ring);
        }
    }
};