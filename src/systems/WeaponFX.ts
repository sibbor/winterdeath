import * as THREE from 'three';
import { FXSystem } from './FXSystem';
import { WinterEngine } from '../core/engine/WinterEngine';
import { MATERIALS } from '../utils/assets';

// --- ZERO-GC SCRATCHPADS & GLOBALS ---
// Dedicated memory spaces solely for weapon calculations
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v7 = new THREE.Vector3();
const _v8 = new THREE.Vector3();

export const WeaponFX = {

    createGrenadeImpact: (pos: THREE.Vector3, radius: number, hitWater: boolean, ctx: any) => {
        if (hitWater) {
            ctx.spawnPart(pos.x, pos.y, pos.z, 'splash', 85);
            const engine = WinterEngine.getInstance();
            if (engine && engine.water) {
                engine.water.spawnRipple(pos.x, pos.z, ctx.simTime, 200.0);
            }
            return;
        }

        // Flash, shockwave, blast radius
        ctx.spawnPart(pos.x, pos.y + 0.5, pos.z, 'flash', 1, undefined, _v2.set(0, 0, 0), undefined, 1.5, 1.0);
        ctx.spawnPart(pos.x, pos.y + 0.1, pos.z, 'shockwave', 1, undefined, _v2, undefined, radius * 0.2, 2.0);
        ctx.spawnPart(pos.x, pos.y + 0.05, pos.z, 'blastRadius', 1, undefined, _v2, undefined, radius, 25.0);

        // Fire
        const fireScale = radius * 0.15;
        for (let i = 0; i < 8; i++) {
            _v2.set(Math.random() - 0.5, Math.random() * 0.5 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(radius * 0.25);
            const type = i < 3 ? 'large_fire' : 'fire';
            ctx.spawnPart(pos.x, pos.y + 0.5, pos.z, type, 1, undefined, _v2, undefined, fireScale + Math.random() * 0.5, 8 + Math.random() * 5);
        }

        // Smoke
        const smokeScale = radius * 0.2;
        for (let i = 0; i < 15; i++) {
            _v2.set(Math.random() - 0.5, Math.random() * 0.8 + 0.4, Math.random() - 0.5).normalize().multiplyScalar(radius * 0.5 * Math.random());
            ctx.spawnPart(pos.x, pos.y + 0.8, pos.z, 'large_smoke', 1, undefined, _v2, undefined, smokeScale + Math.random(), 30 + Math.random() * 20);
        }

        // Debris
        for (let i = 0; i < 15; i++) {
            _v2.set(Math.random() - 0.5, Math.random() * 1.2 + 0.5, Math.random() - 0.5).normalize().multiplyScalar(radius * 0.8);
            ctx.spawnPart(pos.x, pos.y + 0.5, pos.z, 'debris', 1, undefined, _v2, undefined, 0.3 + Math.random() * 0.3, 40 + Math.random() * 20);
        }

        // Scorch mark
        ctx.spawnDecal(pos.x, pos.z, 4.0, MATERIALS.scorchDecal);
    },

    createMolotovImpact: (pos: THREE.Vector3, radius: number, hitWater: boolean, ctx: any) => {
        if (hitWater) {
            ctx.spawnPart(pos.x, pos.y, pos.z, 'splash', 30);
            const engine = WinterEngine.getInstance();
            if (engine && engine.water) {
                engine.water.spawnRipple(pos.x, pos.z, ctx.simTime, 50.0);
            }
            return;
        }

        // Initial burst (Glas som krossas + en snabb puff av eld)
        ctx.spawnPart(pos.x, pos.y + 0.5, pos.z, 'glass', 15);
        ctx.spawnPart(pos.x, pos.y + 0.5, pos.z, 'flash', 1, undefined, _v2.set(0, 0, 0), 0xff8800, 1.0, 1.0);
        ctx.spawnPart(pos.x, pos.y + 0.5, pos.z, 'large_fire', 5, undefined, undefined, undefined, 1.5);

        // Brännmärket på marken
        ctx.spawnDecal(pos.x, pos.z, radius * 2.0, MATERIALS.scorchDecal);
    },

    updateFireZoneVisuals: (pos: THREE.Vector3, radius: number, delta: number, ctx: any) => {
        // [PERFORMANCE] Reduced density and added performance cap for overlapping zones
        const fireDensity = 6.0;
        const targetFlameCount = Math.min(25, (radius * radius * fireDensity) * delta);

        let flameCount = Math.floor(targetFlameCount);
        if (Math.random() < (targetFlameCount - flameCount)) flameCount++;

        for (let j = 0; j < flameCount; j++) {
            const r = Math.sqrt(Math.random()) * radius;
            const theta = Math.random() * Math.PI * 2;
            const fx = pos.x + r * Math.cos(theta);
            const fzZ = pos.z + r * Math.sin(theta);

            // normalizedDist är 0 exakt i mitten, 1 exakt på kanten.
            const normalizedDist = r / radius;

            // centerFocus är tvärtom: 1 i mitten, 0 på kanten.
            const centerFocus = 1.0 - normalizedDist;

            // Genom att multiplicera centerFocus med sig själv får vi en brant kurva.
            const coreIntensity = centerFocus * centerFocus;

            // Skala: 0.8 på kanten, upp till 4.5 i exakta mitten (0.8 + 3.7).
            const flameScale = 0.8 + (coreIntensity * 3.7);

            // Höjd (Y): 0.3 på kanten, skjuter upp till 2.5 i mitten.
            const flameY = 0.3 + (coreIntensity * 2.2);

            const colorHex = Math.random() > 0.6 ? 0xffcc00 : (Math.random() > 0.3 ? 0xff8800 : 0xff4400);

            ctx.spawnPart(fx, flameY, fzZ, 'fire', 1, undefined, undefined, colorHex, flameScale);
        }
    },

    createFlashbangImpact: (pos: THREE.Vector3, hitWater: boolean, ctx: any) => {
        if (hitWater) {
            ctx.spawnPart(pos.x, pos.y, pos.z, 'splash', 30);
            const engine = WinterEngine.getInstance();
            if (engine && engine.water) {
                engine.water.spawnRipple(pos.x, pos.z, 50.0);
            }
            return;
        }

        // The blinding flash
        ctx.spawnPart(pos.x, pos.y + 2, pos.z, 'flash', 1, undefined, _v2.set(0, 0, 0), undefined, 8.0);

        // Minor scorch mark from the casing popping
        ctx.spawnDecal(pos.x, pos.z, 2.0, MATERIALS.scorchDecal);
    },

    createFlame: (start: THREE.Vector3, direction: THREE.Vector3) => {
        // Tajtare spridning så att trycket riktas mer framåt
        const spread = 0.30;
        _v1.copy(direction).add(_v2.set(
            (Math.random() - 0.5) * spread,
            (Math.random() - 0.5) * spread,
            (Math.random() - 0.5) * spread
        )).normalize();

        // Mycket högre starthastighet så molnet skjuts långt fram
        let speed = 35 + Math.random() * 20;

        let scale = 0.1 + Math.random() * 0.2;

        const req = FXSystem._getSpawnRequest();
        req.scene = null as any;
        req.x = start.x; req.y = start.y; req.z = start.z;
        req.type = 'flamethrower_fire';

        let colorHex = Math.random() > 0.8 ? 0xffcc00 : (Math.random() > 0.4 ? 0xff4400 : 0xaa1100);

        req.customVel.copy(_v1).multiplyScalar(speed);
        req.hasCustomVel = true;
        req.scale = scale;
        req.color = colorHex;

        req.life = 25 + Math.random() * 15;
        FXSystem.essentialQueue.push(req);
    },

    createMuzzleFlash: (start: THREE.Vector3, direction: THREE.Vector3, isCyan: boolean = false) => {
        const spread = 0.2;
        _v1.copy(direction).add(_v2.set(
            (Math.random() - 0.5) * spread,
            (Math.random() - 0.5) * spread,
            (Math.random() - 0.5) * spread
        )).normalize();

        let speed = 3 + Math.random() * 2;
        let scale = 0.3 + Math.random() * 0.3;

        const req = FXSystem._getSpawnRequest();
        req.scene = null as any;
        req.x = start.x; req.y = start.y; req.z = start.z;
        req.type = 'fire';

        req.customVel.copy(_v1).multiplyScalar(speed);
        req.hasCustomVel = true;
        req.scale = scale;
        req.color = isCyan ? 0x00bfff : 0xffcc00;
        req.life = 6 + Math.random() * 4;
        FXSystem.essentialQueue.push(req);
    },

    createLightning: (start: THREE.Vector3, end: THREE.Vector3, isMain: boolean = true) => {
        const dist = start.distanceTo(end);
        const segments = Math.max(3, Math.floor(dist * 1.5));
        const jitterScale = isMain ? 1.5 : 0.8;

        const v_node = isMain ? _v1 : _v5;
        const v_prev = isMain ? _v8 : _v7;

        v_prev.copy(start);
        for (let i = 1; i <= segments; i++) {
            const alpha = i / segments;
            v_node.lerpVectors(start, end, alpha);

            if (i < segments) {
                v_node.x += (Math.random() - 0.5) * jitterScale;
                v_node.y += (Math.random() - 0.5) * jitterScale;
                v_node.z += (Math.random() - 0.5) * jitterScale;
            } else {
                v_node.copy(end);
            }

            // Huvudblixt
            const req = FXSystem._getSpawnRequest();
            req.x = v_prev.x; req.y = v_prev.y; req.z = v_prev.z;
            req.type = 'electric_flash';
            req.scale = (isMain ? 1.5 : 0.8) + Math.random() * 0.5;
            req.color = 0x00ffff;
            req.life = 3 + Math.random() * 3;
            req.customVel.subVectors(v_node, v_prev);
            req.hasCustomVel = true;
            FXSystem.essentialQueue.push(req);

            // Kärna (Vitt ljus i mitten)
            if (Math.random() > 0.2) {
                const reqC = FXSystem._getSpawnRequest();
                reqC.x = v_prev.x; reqC.y = v_prev.y; reqC.z = v_prev.z;
                reqC.type = 'electric_flash';
                reqC.scale = req.scale * 0.3;
                reqC.color = 0xffffff;
                reqC.life = req.life;
                reqC.customVel.copy(req.customVel);
                reqC.hasCustomVel = true;
                FXSystem.essentialQueue.push(reqC);
            }

            // Gnistor som flyger ut
            if (isMain && Math.random() > 0.5) {
                const reqS = FXSystem._getSpawnRequest();
                reqS.scene = null as any;
                reqS.x = v_node.x; reqS.y = v_node.y; reqS.z = v_node.z;
                reqS.type = 'enemy_effect_stun';
                reqS.scale = 0.3;
                reqS.color = 0x00ffff;
                reqS.customVel.set((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15);
                reqS.hasCustomVel = true;
                FXSystem.essentialQueue.push(reqS);
            }

            v_prev.copy(v_node);
        }
    },

    createStunSparks: (pos: THREE.Vector3) => {
        for (let i = 0; i < 3; i++) {
            const req = FXSystem._getSpawnRequest();
            req.scene = null as any;
            req.x = pos.x + (Math.random() - 0.5);
            req.y = pos.y + 1.5 + (Math.random() - 0.5);
            req.z = pos.z + (Math.random() - 0.5);
            req.type = 'enemy_effect_stun';

            req.customVel.set(
                (Math.random() - 0.5) * 2,
                Math.random() * 2,
                (Math.random() - 0.5) * 2
            );
            req.hasCustomVel = true;
            req.scale = 0.2;
            FXSystem.essentialQueue.push(req);
        }
    }
};