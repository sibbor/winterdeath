import * as THREE from 'three';
import { SectorContext } from '../game/session/SectorTypes';
import { ObjectGenerator } from '../core/world/generators/ObjectGenerator';

// --- CACHED DEBUG RESOURCES (Zero-GC approach) ---
const DEBUG_MATS = {
    red: new THREE.LineBasicMaterial({ color: 0xff0000 }),
    green: new THREE.LineBasicMaterial({ color: 0x00ff00 }),
    blue: new THREE.LineBasicMaterial({ color: 0x0000ff }),
    yellow: new THREE.LineBasicMaterial({ color: 0xffff00 }),
    beam: new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
    }),
    triggerRing: new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
    })
};

const _markerGeometry = new THREE.CylinderGeometry(0.1, 0.1, 400, 8);
_markerGeometry.translate(0, 200, 0);

export const DebugVisualizer = {

    /**
     * Master function to automatically draw all debug info for a loaded sector.
     * Extracts data from the context arrays (triggers, mapItems) without needing manual calls.
     */
    visualizeSector: (ctx: SectorContext, sectorDef?: any) => {
        if (!ctx.debugMode) return;

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
            DebugVisualizer.drawPolygon(ctx, pts, 'red');
        }

        // 2. Visualize Triggers
        DebugVisualizer.visualizeTriggers(ctx);

        // 3. Visualize Areas from MapItems (Forests, Lakes, Mountains, Wheat)
        if (ctx.mapItems) {
            for (let i = 0; i < ctx.mapItems.length; i++) {
                const item = ctx.mapItems[i];
                if (item.points && item.points.length > 0) {
                    // Convert basic x/z points back to Vector3 for drawing
                    const vectors = new Array(item.points.length);
                    for (let j = 0; j < item.points.length; j++) {
                        vectors[j] = new THREE.Vector3(item.points[j].x, 1, item.points[j].z);
                    }

                    // Auto-assign colors based on type
                    let color: 'red' | 'green' | 'blue' | 'yellow' = 'yellow';
                    if (item.type === 'FOREST') color = 'green';
                    else if (item.type === 'LAKE') color = 'blue';
                    else if (item.type === 'MOUNTAIN') color = 'red';

                    DebugVisualizer.drawPolygon(ctx, vectors, color);
                }
            }
        }
    },

    drawPolygon: (ctx: SectorContext, points: THREE.Vector3[], color: 'red' | 'green' | 'blue' | 'yellow' = 'green', yOffset: number = 1) => {
        if (!ctx.debugMode || !points || points.length === 0) return;

        const closedPoints = [...points, points[0]];
        const geo = new THREE.BufferGeometry().setFromPoints(closedPoints);

        const line = new THREE.Line(geo, DEBUG_MATS[color]);
        line.position.y = yOffset;

        ctx.scene.add(line);
    },

    drawPath: (ctx: SectorContext, points: THREE.Vector3[], color: 'red' | 'green' | 'blue' | 'yellow' = 'blue', yOffset: number = 0) => {
        if (!ctx.debugMode || !points || points.length === 0) return;

        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geo, DEBUG_MATS[color]);
        line.position.y = yOffset;

        ctx.scene.add(line);
    },

    spawnMarker: (ctx: SectorContext, x: number, z: number, height: number, label: string) => {
        if (!ctx.debugMode) return;

        const beam = new THREE.Mesh(_markerGeometry, DEBUG_MATS.beam);
        beam.position.set(x, 0, z);
        ctx.scene.add(beam);

        const sprite = ObjectGenerator.createTextSprite(label);
        sprite.scale.set(12, 3, 1);
        sprite.position.set(x, height + 4, z);
        ctx.scene.add(sprite);
    },

    visualizeTriggers: (ctx: SectorContext) => {
        if (!ctx.debugMode || !ctx.triggers) return;

        for (let i = 0; i < ctx.triggers.length; i++) {
            const trig = ctx.triggers[i];

            DebugVisualizer.spawnMarker(ctx, trig.position.x, trig.position.z, 2, trig.id.toUpperCase());

            let drawRadius = trig.radius;
            if (!drawRadius && trig.size) {
                drawRadius = Math.max(trig.size.width, trig.size.depth);
            }
            if (!drawRadius) drawRadius = 2.0;

            const ringGeo = new THREE.RingGeometry(drawRadius - 0.2, drawRadius, 32);
            const ring = new THREE.Mesh(ringGeo, DEBUG_MATS.triggerRing);

            ring.rotation.x = -Math.PI / 2;
            ring.position.set(trig.position.x, 0.1, trig.position.z);

            ctx.scene.add(ring);
        }
    }
};