import * as THREE from 'three';
import { SectorContext } from '../game/session/SectorTypes';
import { ObjectGenerator } from '../core/world/generators/ObjectGenerator';
import { GEOMETRY, MATERIALS } from './assets';
import { MapItemType } from '../components/ui/hud/HudTypes';

// --- ZERO-GC SCRATCHPADS ---
const _v1 = new THREE.Vector3();
const _pointsScratch: THREE.Vector3[] = [];
const _materialCache = new Map<number, THREE.LineBasicMaterial>();

// Hex Constants
const DEBUG_COLORS = {
    RED: 0xff0000,
    GREEN: 0x00ff00,
    BLUE: 0x0000ff,
    YELLOW: 0xffff00,
    ORANGE: 0xffa500
};

/**
 * DebugVisualizer
 * High-performance debug drawing utility. 
 * Designed to minimize GC pressure during sector building.
 */
export const DebugVisualizer = {

    /**
     * Master function to automatically draw all debug info for a loaded sector.
     * Extracts data from the context arrays (triggers, mapItems) without needing manual calls.
     */
    visualizeSector: (ctx: SectorContext, sectorDef?: any) => {
        if (!ctx.debugMode) return;

        // Clear old debug objects to prevent geometry leaks and FPS drops
        const existing = ctx.scene.getObjectByName('DEBUG_GROUP');
        if (existing) {
            ctx.scene.remove(existing);

            // Traverse and dispose to free VRAM (Geometries, Materials, and Textures)
            existing.traverse((child: any) => {
                if (child.userData.isSharedAsset) return; // Skip shared engine assets

                if (child.geometry) {
                    child.geometry.dispose();
                }

                if (child.material) {
                    if (Array.isArray(child.material)) {
                        for (let i = 0; i < child.material.length; i++) {
                            const mat = child.material[i];
                            if (mat.map) mat.map.dispose();
                            mat.dispose();
                        }
                    } else {
                        if (child.material.map) child.material.map.dispose();
                        child.material.dispose();
                    }
                }
            });
        }

        const debugGroup = new THREE.Group();
        debugGroup.name = 'DEBUG_GROUP';
        ctx.scene.add(debugGroup);

        // 1. Visualize Sector Bounds
        if (sectorDef?.bounds) {
            const w = sectorDef.bounds.width;
            const d = sectorDef.bounds.depth;

            _pointsScratch.length = 0;
            _pointsScratch.push(new THREE.Vector3(-w / 2, 0.5, -d / 2));
            _pointsScratch.push(new THREE.Vector3(w / 2, 0.5, -d / 2));
            _pointsScratch.push(new THREE.Vector3(w / 2, 0.5, d / 2));
            _pointsScratch.push(new THREE.Vector3(-w / 2, 0.5, d / 2));

            DebugVisualizer.drawPolygon(ctx, _pointsScratch, DEBUG_COLORS.RED, 1, debugGroup);
        }

        // 2. Visualize Triggers
        DebugVisualizer.visualizeTriggers(ctx, debugGroup);

        // 3. Visualize Atmosphere Zones
        DebugVisualizer.visualizeenvironmentalZones(ctx, debugGroup);

        // 4. Visualize Areas from MapItems (Forests, Lakes, Mountains, Wheat)
        if (ctx.mapItems) {
            for (let i = 0; i < ctx.mapItems.length; i++) {
                const item = ctx.mapItems[i];
                if (item.points && item.points.length > 0) {
                    const pLen = item.points.length;
                    _pointsScratch.length = 0;

                    for (let j = 0; j < pLen; j++) {
                        const pt = item.points[j];
                        // Using individual components to avoid per-point object creation where possible
                        // although setFromPoints will eventually copy them.
                        _pointsScratch.push(new THREE.Vector3(pt.x, 1, pt.z));
                    }

                    let color = DEBUG_COLORS.YELLOW;
                    if (item.type === MapItemType.FOREST) color = DEBUG_COLORS.GREEN;
                    else if (item.type === MapItemType.LAKE) color = DEBUG_COLORS.BLUE;
                    else if (item.type === MapItemType.MOUNTAIN) color = DEBUG_COLORS.RED;

                    DebugVisualizer.drawPolygon(ctx, _pointsScratch, color, 1, debugGroup);
                }
            }
        }
    },

    drawPolygon: (ctx: SectorContext, points: THREE.Vector3[], color: number = 0x00ff00, yOffset: number = 1, parent?: THREE.Object3D) => {
        if (!ctx.debugMode || !points || points.length === 0) return;

        // Optimization: Use a temporary array for the closed loop to avoid spreading
        const closedPoints = points.slice();
        closedPoints.push(points[0]);

        const geo = new THREE.BufferGeometry().setFromPoints(closedPoints);

        let mat = _materialCache.get(color);
        if (!mat) {
            mat = new THREE.LineBasicMaterial({ color, userData: { isSharedAsset: true } });
            _materialCache.set(color, mat);
        }

        const line = new THREE.Line(geo, mat);
        line.position.y = yOffset;

        if (parent) parent.add(line);
        else ctx.scene.add(line);
    },

    drawPath: (ctx: SectorContext, points: THREE.Vector3[], color: number = 0x0000ff, yOffset: number = 0, parent?: THREE.Object3D) => {
        if (!ctx.debugMode || !points || points.length === 0) return;

        const geo = new THREE.BufferGeometry().setFromPoints(points);

        let mat = _materialCache.get(color);
        if (!mat) {
            mat = new THREE.LineBasicMaterial({ color, userData: { isSharedAsset: true } });
            _materialCache.set(color, mat);
        }

        const line = new THREE.Line(geo, mat);
        line.position.y = yOffset;

        if (parent) parent.add(line);
        else ctx.scene.add(line);
    },

    spawnMarker: (ctx: SectorContext, x: number, z: number, height: number, label: string, parent?: THREE.Object3D) => {
        if (!ctx.debugMode) return;

        const beam = new THREE.Mesh(GEOMETRY.debugMarker, MATERIALS.debugBeam);
        beam.position.set(x, 0, z);
        beam.userData.isSharedAsset = true; // Protect from disposal

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

        const triggers = ctx.triggers;
        const len = triggers.length;

        for (let i = 0; i < len; i++) {
            const trigger = triggers[i];
            const tx = trigger.position.x;
            const tz = trigger.position.z;
            const id = trigger.id;

            DebugVisualizer.spawnMarker(ctx, tx, tz, 2, String(id).toUpperCase(), parent);

            let drawRadius = trigger.radius || 2;
            if (trigger.size) {
                drawRadius = Math.max(trigger.size.width, trigger.size.depth);
            }

            // PERFORMANCE FIX: Reuse shared ring geometry and scale it
            const ring = new THREE.Mesh(GEOMETRY.debugRing, MATERIALS.debugTriggerRing);
            ring.userData.isSharedAsset = true;
            ring.scale.set(drawRadius, drawRadius, 1);

            ring.rotation.x = -Math.PI / 2;
            ring.position.set(tx, 0.1, tz);

            if (parent) parent.add(ring);
            else ctx.scene.add(ring);
        }
    },

    visualizeenvironmentalZones: (ctx: SectorContext, parent?: THREE.Object3D) => {
        if (!ctx.debugMode) return;

        const processZone = (z: any) => {
            if (z.polygon) {
                const len = z.polygon.length;
                _pointsScratch.length = 0;
                for (let i = 0; i < len; i++) {
                    _pointsScratch.push(new THREE.Vector3(z.polygon[i].x, 1.5, z.polygon[i].z));
                }
                DebugVisualizer.drawPolygon(ctx, _pointsScratch, DEBUG_COLORS.ORANGE, 1.5, parent);
            } else {
                const x = z.x || 0;
                const zPos = z.z || 0;
                const r = z.outerRadius || 100;

                // Draw circle using path scratch
                _pointsScratch.length = 0;
                const segments = 32;
                for (let i = 0; i <= segments; i++) {
                    const theta = (i / segments) * Math.PI * 2;
                    _pointsScratch.push(new THREE.Vector3(x + Math.cos(theta) * r, 1.5, zPos + Math.sin(theta) * r));
                }
                DebugVisualizer.drawPath(ctx, _pointsScratch, DEBUG_COLORS.ORANGE, 1.5, parent);
            }
        };

        // Static zones from sector definition
        const sectorDef = (ctx.engine as any).currentSectorData || (window as any).VINTERDOD_SECTOR_DEF;
        if (sectorDef?.environmentalZones) {
            for (let i = 0; i < sectorDef.environmentalZones.length; i++) {
                processZone(sectorDef.environmentalZones[i]);
            }
        }

        // Dynamic zones from context
        if (ctx.environmentalZones) {
            for (let i = 0; i < ctx.environmentalZones.length; i++) {
                processZone(ctx.environmentalZones[i]);
            }
        }
    }
};

