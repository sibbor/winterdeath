import * as THREE from 'three';
import { FXSystem } from '../systems/FXSystem';

// --- ZERO-GC SCRATCHPADS ---
// Dedikerade minnesutrymmen enbart för vapenberäkningar
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v7 = new THREE.Vector3();
const _v8 = new THREE.Vector3();

export const WeaponFX = {

    spawnFlame: (start: THREE.Vector3, direction: THREE.Vector3) => {
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
        req.particlesList = null as any;
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

    spawnMuzzleFlash: (start: THREE.Vector3, direction: THREE.Vector3, isCyan: boolean = false) => {
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
        req.particlesList = null as any;
        req.x = start.x; req.y = start.y; req.z = start.z;
        req.type = 'fire';

        req.customVel.copy(_v1).multiplyScalar(speed);
        req.hasCustomVel = true;
        req.scale = scale;
        req.color = isCyan ? 0x00bfff : 0xffcc00;
        req.life = 6 + Math.random() * 4;
        FXSystem.essentialQueue.push(req);
    },

    spawnLightning: (start: THREE.Vector3, end: THREE.Vector3, isMain: boolean = true) => {
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
                reqS.particlesList = null as any;
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

    spawnStunSparks: (pos: THREE.Vector3) => {
        for (let i = 0; i < 3; i++) {
            const req = FXSystem._getSpawnRequest();
            req.scene = null as any;
            req.particlesList = null as any;
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