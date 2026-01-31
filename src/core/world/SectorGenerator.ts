
import * as THREE from 'three';
import { GEOMETRY, MATERIALS, createTextSprite } from '../../utils/assets';
import { SectorContext } from '../../types/sectors';
import { ObjectGenerator } from './ObjectGenerator';

// Shared Utilities for Sector Building
export const SectorBuilder = {
    // --- BASIC SPAWNERS ---
    spawnChest: (ctx: SectorContext, x: number, z: number, type: 'standard' | 'big', rot: number = 0) => {
        const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = rot;
        const isBig = type === 'big';
        const body = new THREE.Mesh(GEOMETRY.chestBody, isBig ? MATERIALS.chestBig : MATERIALS.chestStandard); body.position.y = 0.5; body.castShadow = true;
        group.add(body);
        const lid = new THREE.Mesh(GEOMETRY.chestLid, isBig ? MATERIALS.chestBig : MATERIALS.chestStandard);
        lid.position.y = 1.2; lid.castShadow = true;
        group.add(lid);

        // Yellow Glow for unlooted chests
        const glow = new THREE.PointLight(0xffcc00, 2, 6);
        glow.position.set(0, 1.5, 0);
        glow.name = 'chestLight';
        group.add(glow);

        ctx.scene.add(group);
        ctx.chests.push({ mesh: group, type, scrap: isBig ? 100 : 25, radius: 2, opened: false });

        ctx.mapItems.push({
            id: `chest_${Math.random()}`,
            x, z,
            type: 'CHEST',
            label: isBig ? 'ui.large_chest' : 'ui.chest',
            icon: '📦',
            color: isBig ? '#ffd700' : '#8b4513'
        });
    },

    spawnClueMarker: (ctx: SectorContext, x: number, z: number, id: string, type: 'phone' | 'pacifier') => {
        const group = new THREE.Group();
        group.position.set(x, 0.5, z);
        group.userData = { id, type: 'clue_visual' };
        group.name = `clue_visual_${id}`;

        if (type === 'phone') {
            // Enhanced Phone Visuals (Larger, Glowing)
            const phone = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.8), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 }));
            const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.65), new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
            screen.rotation.x = -Math.PI / 2;
            screen.position.y = 0.05;
            phone.add(screen);

            // Pulsing Holographic Glow (simulated via point light for now, specific shader later if needed)
            const glowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
            glowPlane.rotation.x = -Math.PI / 2;
            glowPlane.position.y = 0.02;
            phone.add(glowPlane);

            group.add(phone);
            const light = new THREE.PointLight(0x00ffff, 3, 8);
            light.position.y = 1.0;
            group.add(light);
            ctx.flickeringLights.push({ light, baseInt: 3, flickerRate: 0.1 }); // Fast flicker for "tech" feel
        } else {
            // Enhanced Pacifier/Item Visuals
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.08, 16, 32), new THREE.MeshStandardMaterial({ color: 0xffaaaa, emissive: 0xff0000, emissiveIntensity: 2.0 }));
            ring.rotation.x = Math.PI / 2;
            group.add(ring);

            // Ground Glow
            const glowPlane = new THREE.Mesh(new THREE.CircleGeometry(0.8, 32), new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }));
            glowPlane.rotation.x = -Math.PI / 2;
            glowPlane.position.y = 0.02;
            group.add(glowPlane);

            const light = new THREE.PointLight(0xffaaaa, 4, 6);
            light.position.y = 0.5;
            group.add(light);
        }
        group.rotation.y = Math.random() * Math.PI;
        ctx.scene.add(group);

        ctx.mapItems.push({
            id: `clue_${id}`,
            x, z,
            type: 'TRIGGER',
            label: 'ui.clue',
            icon: '🔍',
            color: '#00ffff'
        });
    },

    spawnDebugMarker: (ctx: SectorContext, x: number, z: number, height: number, label: string) => {
        if (!ctx.debugMode) return;

        const beamGeo = new THREE.CylinderGeometry(0.1, 0.1, 400, 8);
        beamGeo.translate(0, 200, 0);
        const beamMat = new THREE.MeshBasicMaterial({
            color: 0x00ffff, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
        });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.set(x, 0, z);
        ctx.scene.add(beam);

        const sprite = createTextSprite(label);
        sprite.scale.set(12, 3, 1);
        sprite.position.set(x, height + 4, z);
        ctx.scene.add(sprite);

        ctx.mapItems.push({
            id: `poi_${label}`,
            x, z,
            type: 'POI',
            label: label,
            icon: '📍',
            color: '#ffffff'
        });
    },

    spawnStreetLamp: (ctx: SectorContext, x: number, z: number, rot: number = 0) => {
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        group.rotation.y = rot;

        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 8), MATERIALS.blackMetal);
        pole.position.y = 4;
        group.add(pole);

        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 2), MATERIALS.blackMetal);
        arm.position.set(0, 7.5, 0.5);
        group.add(arm);

        const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.8), MATERIALS.blackMetal);
        head.position.set(0, 7.5, 1.5);
        group.add(head);

        const light = new THREE.SpotLight(0xaaddff, 4, 30, 0.8, 0.5, 1);
        light.position.set(0, 7.4, 1.5);
        light.target.position.set(0, 0, 1.5);
        light.castShadow = false;

        group.add(light);
        group.add(light.target);

        ctx.scene.add(group);
        ctx.obstacles.push({ mesh: group, collider: { type: 'sphere', radius: 0.5 } });

        if (Math.random() > 0.7) {
            ctx.flickeringLights.push({ light: light, baseInt: 4, flickerRate: 0.05 + Math.random() * 0.1 });
        }
    },

    spawnCar: (ctx: SectorContext, x: number, z: number, yRot: number) => {
        const car = new THREE.Mesh(GEOMETRY.prop_car, new THREE.MeshStandardMaterial({
            color: Math.random() > 0.5 ? 0x222222 : 0x444455,
            roughness: 0.6
        }));
        car.position.set(x, 0.9, z);
        car.rotation.y = yRot;
        car.castShadow = true;
        ctx.scene.add(car);
        ctx.obstacles.push({
            mesh: car,
            collider: { type: 'box', size: new THREE.Vector3(6, 5, 11) }
        });

        // Add Snow on top
        const snow = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.2, 11.2), MATERIALS.snow);
        snow.position.set(0, 1.0, 0);
        car.add(snow);

        ctx.mapItems.push({
            id: `car_${Math.random()}`,
            x, z,
            type: 'OBSTACLE',
            label: 'Wreck',
            color: '#555555',
            radius: 4
        });
    },

    spawnVolvo: (ctx: SectorContext, x: number, z: number, rotY: number, stackIndex: number = 0) => {
        const group = new THREE.Group();
        const yOffset = stackIndex * 1.5;
        group.position.set(x, yOffset, z);
        group.rotation.y = rotY;

        if (stackIndex > 0) {
            group.rotation.x = (Math.random() - 0.5) * 0.15;
            group.rotation.z = (Math.random() - 0.5) * 0.15;
        }

        const colors = [0x7c2e2e, 0x3e4c5e, 0x8c8c7a, 0x4a5c4a, 0x8b5a2b, 0x5d4037];
        const color = colors[Math.floor(Math.random() * colors.length)];

        const matBody = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1 });
        const matWindow = new THREE.MeshStandardMaterial({ color: 0x1a2b3c, roughness: 0.3, metalness: 0.5 });
        const matBumper = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
        const matSnow = MATERIALS.snow;

        const chassis = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.7, 1.8), matBody);
        chassis.position.y = 0.6;
        chassis.castShadow = true;
        group.add(chassis);

        const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.65, 1.6), matBody);
        cabin.position.set(-0.3, 1.25, 0);
        cabin.castShadow = true;
        group.add(cabin);

        const bumperF = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 1.9), matBumper);
        bumperF.position.set(2.35, 0.6, 0);
        group.add(bumperF);
        const bumperR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 1.9), matBumper);
        bumperR.position.set(-2.35, 0.6, 0);
        group.add(bumperR);

        const snowRoof = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.1, 1.65), matSnow);
        snowRoof.position.set(-0.3, 1.58, 0);
        group.add(snowRoof);
        const snowHood = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 1.7), matSnow);
        snowHood.position.set(1.5, 0.96, 0);
        group.add(snowHood);
        const snowTrunk = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 1.7), matSnow);
        snowTrunk.position.set(-2.1, 0.96, 0);
        group.add(snowTrunk);

        if (stackIndex === 0 || Math.random() > 0.6) {
            const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.25, 12);
            wheelGeo.rotateX(Math.PI / 2);
            const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
            const positions = [{ x: 1.4, z: 0.75 }, { x: 1.4, z: -0.75 }, { x: -1.4, z: 0.75 }, { x: -1.4, z: -0.75 }];
            positions.forEach(p => {
                const w = new THREE.Mesh(wheelGeo, wheelMat);
                w.position.set(p.x, 0.35, p.z);
                w.castShadow = true;
                group.add(w);
            });
        }

        ctx.scene.add(group);

        if (stackIndex === 0) {
            ctx.obstacles.push({
                mesh: group,
                collider: { type: 'box', size: new THREE.Vector3(4.8, 2.5, 2.0) }
            });
            ctx.mapItems.push({
                id: `volvo_${Math.random()}`,
                x, z, type: 'OBSTACLE', label: 'Wreck', color: '#666', radius: 3
            });
        }
    },

    spawnTree: (ctx: SectorContext, x: number, z: number, scaleMultiplier: number = 1.0) => {
        const tree = ObjectGenerator.createTree(scaleMultiplier);
        tree.position.set(x, 0, z);
        ctx.scene.add(tree);

        // Collision (Trunk)
        const colRadius = 0.5 * scaleMultiplier;
        ctx.obstacles.push({
            mesh: tree,
            collider: { type: 'sphere', radius: colRadius }
        });
    },

    createRailTrack: (ctx: SectorContext, start: THREE.Vector3, end: THREE.Vector3) => {
        const vec = new THREE.Vector3().subVectors(end, start);
        const len = vec.length();
        const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        const angle = Math.atan2(vec.x, vec.z);

        const group = new THREE.Group();
        group.position.copy(center);
        group.rotation.y = angle;

        const railGeo = new THREE.BoxGeometry(0.2, 0.2, len);
        const railL = new THREE.Mesh(railGeo, MATERIALS.blackMetal);
        railL.position.set(-1.5, 0.2, 0);
        group.add(railL);

        const railR = new THREE.Mesh(railGeo, MATERIALS.blackMetal);
        railR.position.set(1.5, 0.2, 0);
        group.add(railR);

        const sleeperCount = Math.floor(len / 3);
        const sleeperGeo = new THREE.BoxGeometry(5, 0.2, 0.6);
        for (let i = 0; i <= sleeperCount; i++) {
            const z = -len / 2 + i * (len / sleeperCount);
            const sleeper = new THREE.Mesh(sleeperGeo, MATERIALS.brownBrick);
            sleeper.position.set(0, 0.1, z);
            group.add(sleeper);
        }

        ctx.scene.add(group);
    },

    createCurvedRailTrack: (ctx: SectorContext, points: THREE.Vector3[]) => {
        const curve = new THREE.CatmullRomCurve3(points);
        curve.curveType = 'catmullrom';
        const length = curve.getLength();

        const spacing = 4.0;
        const count = Math.ceil(length / spacing);
        const pointsList = curve.getSpacedPoints(count);

        pointsList.forEach((pt, i) => {
            if (i >= pointsList.length - 1) return;
            const next = pointsList[i + 1];
            const tangent = new THREE.Vector3().subVectors(next, pt).normalize();
            const axis = new THREE.Vector3(0, 1, 0);
            const normal = new THREE.Vector3().crossVectors(tangent, axis).normalize();

            const sleeper = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 0.6), MATERIALS.brownBrick);
            sleeper.position.copy(pt).add(new THREE.Vector3(0, 0.1, 0));
            sleeper.lookAt(pt.clone().add(tangent));
            ctx.scene.add(sleeper);

            const railLen = pt.distanceTo(next);
            const railGeo = new THREE.BoxGeometry(0.2, 0.2, railLen + 0.1);

            const rL = new THREE.Mesh(railGeo, MATERIALS.blackMetal);
            const posL = pt.clone().add(normal.clone().multiplyScalar(-1.5));
            const nextPosL = next.clone().add(normal.clone().multiplyScalar(-1.5));
            const midL = new THREE.Vector3().addVectors(posL, nextPosL).multiplyScalar(0.5);
            midL.y = 0.3;
            rL.position.copy(midL);
            rL.lookAt(nextPosL.x, 0.3, nextPosL.z);
            ctx.scene.add(rL);

            const rR = new THREE.Mesh(railGeo, MATERIALS.blackMetal);
            const posR = pt.clone().add(normal.clone().multiplyScalar(1.5));
            const nextPosR = next.clone().add(normal.clone().multiplyScalar(1.5));
            const midR = new THREE.Vector3().addVectors(posR, nextPosR).multiplyScalar(0.5);
            midR.y = 0.3;
            rR.position.copy(midR);
            rR.lookAt(nextPosR.x, 0.3, nextPosR.z);
            ctx.scene.add(rR);
        });

        const mapPoints = curve.getSpacedPoints(20);
        mapPoints.forEach(p => {
            if (p) ctx.mapItems.push({ id: `rail_${Math.random()}`, x: p.x, z: p.z, type: 'ROAD', radius: 2, color: '#333' });
        });

        return curve;
    },

    fillArea: (
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

        for (let i = 0; i < count; i++) {
            let x, z;
            let safety = 0;
            let valid = false;
            do {
                if (isRect) {
                    x = center.x + (Math.random() - 0.5) * rectW;
                    z = center.z + (Math.random() - 0.5) * rectH;
                } else {
                    const r = Math.sqrt(Math.random()) * radius;
                    const theta = Math.random() * Math.PI * 2;
                    x = center.x + r * Math.cos(theta);
                    z = center.z + r * Math.sin(theta);
                }

                const distToCenter = Math.sqrt((x - center.x) ** 2 + (z - center.z) ** 2);
                let excluded = false;
                for (const zone of exclusionZones) {
                    const dx = x - zone.pos.x;
                    const dz = z - zone.pos.z;
                    if (dx * dx + dz * dz < zone.radius * zone.radius) {
                        excluded = true;
                        break;
                    }
                }

                if (distToCenter >= avoidCenterRadius && !excluded) {
                    valid = true;
                }

                safety++;
            } while (!valid && safety < 10);

            if (!valid) continue;

            if (type === 'tree') {
                const scale = 0.8 + Math.random() * 0.8;
                SectorBuilder.spawnTree(ctx, x, z, scale);
            } else if (type === 'rock') {
                const rock = new THREE.Mesh(GEOMETRY.stone, MATERIALS.stone);
                const s = 0.5 + Math.random();
                rock.scale.setScalar(s);
                rock.position.set(x, s / 2, z);
                rock.rotation.set(Math.random(), Math.random(), Math.random());
                rock.castShadow = true;
                ctx.scene.add(rock);
                ctx.obstacles.push({ mesh: rock, collider: { type: 'sphere', radius: s } });
            }
        }
    },

    visualizeTriggers: (ctx: SectorContext) => {
        if (!ctx.debugMode) return;

        ctx.triggers.forEach(trig => {
            SectorBuilder.spawnDebugMarker(ctx, trig.position.x, trig.position.z, 2, trig.id.toUpperCase());
            if (trig.type !== 'COLLECTIBLE') {
                const ringGeo = new THREE.RingGeometry(trig.radius - 0.2, trig.radius, 32);
                const ringMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
                const ring = new THREE.Mesh(ringGeo, ringMat);
                ring.rotation.x = -Math.PI / 2;
                ring.position.set(trig.position.x, 0.1, trig.position.z);
                ctx.scene.add(ring);
            }
        });
    },

    generatePlaceholder: (ctx: SectorContext) => {
        for (let i = 0; i < 50; i++) {
            const x = (Math.random() - 0.5) * 200;
            const z = (Math.random() - 0.5) * 200;
            SectorBuilder.spawnTree(ctx, x, z, 0.8 + Math.random());
        }
    }
};
