import * as THREE from 'three';
import { FXSystem } from './FXSystem';
import { WinterEngine } from '../core/engine/WinterEngine';
import { MATERIALS } from '../utils/assets';
import { LogicalLight } from './LightSystem';
import { FXParticleType, FXDecalType } from '../types/FXTypes';

// --- ZERO-GC SCRATCHPADS ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v7 = new THREE.Vector3();
const _v8 = new THREE.Vector3();

// --- POOLS ---
const LIGHTNING_POOL_SIZE = 40;
const LIGHTNING_SEGMENTS = 6;
const LIGHT_POOL_SIZE = 12;

interface LightningNode {
    lineMain: THREE.Line;
    lineCore: THREE.Line;
    life: number;
    active: boolean;
}

interface WeaponLightNode extends LogicalLight {
    life: number;
    maxLife: number;
    initialIntensity: number;
    active: boolean;
    type: 'electric' | 'fire';
}

const _lightningPool: LightningNode[] = [];
const _lightPool: WeaponLightNode[] = [];
let _poolsInitialized = false;
let _lightsInjected = false;

const initPools = (scene: THREE.Scene) => {
    if (_poolsInitialized) return;

    // [VINTERDÖD FIX] Rock-solid dual-material setup that works perfectly for lightning
    const matMain = new THREE.LineBasicMaterial({ color: 0x00ffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 });
    const matCore = new THREE.LineBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 });

    for (let i = 0; i < LIGHTNING_POOL_SIZE; i++) {
        const geoMain = new THREE.BufferGeometry();
        const geoCore = new THREE.BufferGeometry();
        const posMain = new Float32Array((LIGHTNING_SEGMENTS + 1) * 3);
        const posCore = new Float32Array((LIGHTNING_SEGMENTS + 1) * 3);

        geoMain.setAttribute('position', new THREE.BufferAttribute(posMain, 3));
        geoCore.setAttribute('position', new THREE.BufferAttribute(posCore, 3));

        const lineMain = new THREE.Line(geoMain, matMain);
        const lineCore = new THREE.Line(geoCore, matCore);

        lineMain.frustumCulled = false;
        lineCore.frustumCulled = false;
        lineMain.visible = false;
        lineCore.visible = false;

        scene.add(lineMain);
        scene.add(lineCore);
        _lightningPool.push({ lineMain, lineCore, life: 0, active: false });
    }

    for (let i = 0; i < LIGHT_POOL_SIZE; i++) {
        _lightPool.push({
            isLogicalLight: true,
            position: new THREE.Vector3(0, -1000, 0),
            color: 0xffffff,
            intensity: 0,
            distance: 10,
            castShadow: false,
            life: 0,
            maxLife: 1,
            initialIntensity: 0,
            active: false,
            type: 'electric'
        });
    }

    _poolsInitialized = true;
};

export const WeaponFX = {

    updateFX: (delta: number, ctx?: any) => {
        if (!_poolsInitialized) return;

        if (!_lightsInjected && ctx) {
            const state = ctx.state || ctx.session?.state || ctx;
            if (state) {
                if (!state.dynamicLights) state.dynamicLights = [];
                state.dynamicLights.push(..._lightPool);
                _lightsInjected = true;
            }
        }

        for (let i = 0; i < LIGHTNING_POOL_SIZE; i++) {
            const node = _lightningPool[i];
            if (node.active) {
                node.life -= delta;
                if (node.life <= 0) {
                    node.lineMain.visible = false;
                    node.lineCore.visible = false;
                    node.active = false;
                }
            }
        }

        for (let i = 0; i < LIGHT_POOL_SIZE; i++) {
            const node = _lightPool[i];
            if (node.active) {
                node.life -= delta;
                if (node.life <= 0) {
                    node.intensity = 0;
                    node.position.set(0, -1000, 0);
                    node.active = false;
                } else {
                    const alpha = node.life / node.maxLife;
                    let intensity = node.initialIntensity * alpha;

                    if (node.type === 'fire') {
                        intensity *= (0.8 + Math.random() * 0.4);
                    }
                    node.intensity = intensity;
                }
            }
        }
    },

    spawnDynamicLight: (scene: THREE.Scene, pos: THREE.Vector3, color: number, intensity: number, distance: number, life: number, type: 'electric' | 'fire' = 'electric') => {
        initPools(scene);

        // Light Recycling: Prevent pool starvation by moving the existing active light
        for (let i = 0; i < LIGHT_POOL_SIZE; i++) {
            const node = _lightPool[i];
            if (node.active && node.type === type) {
                node.position.lerp(pos, 0.5);
                node.life = life;
                node.initialIntensity = intensity;
                node.color = color;
                node.distance = distance;
                return;
            }
        }

        for (let i = 0; i < LIGHT_POOL_SIZE; i++) {
            const node = _lightPool[i];
            if (!node.active || node.life < 0.02) {
                node.color = color;
                node.distance = distance;
                node.position.copy(pos);
                node.intensity = intensity;
                node.type = type;
                node.initialIntensity = intensity;
                node.life = life;
                node.maxLife = life;
                node.active = true;
                break;
            }
        }
    },

    drawArcLightning: (scene: THREE.Scene, start: THREE.Vector3, end: THREE.Vector3, isMain: boolean = true) => {
        initPools(scene);

        const dist = start.distanceTo(end);
        if (dist < 0.001) return;

        const lineCount = isMain ? 3 : 1;
        const jitterBase = isMain ? Math.min(dist * 0.15, 1.5) : Math.min(dist * 0.1, 0.8);

        _v5.subVectors(end, start).normalize();
        _v7.set(-_v5.z, _v5.y, _v5.x);
        _v8.crossVectors(_v5, _v7).normalize();

        for (let l = 0; l < lineCount; l++) {
            let activeNode: LightningNode | null = null;
            for (let i = 0; i < LIGHTNING_POOL_SIZE; i++) {
                if (!_lightningPool[i].active) {
                    activeNode = _lightningPool[i];
                    break;
                }
            }

            if (!activeNode) break;

            activeNode.active = true;
            activeNode.life = 0.08;
            activeNode.lineMain.visible = true;

            if (l === 0 && isMain && Math.random() > 0.2) {
                activeNode.lineCore.visible = true;
            } else {
                activeNode.lineCore.visible = false;
            }

            const attrMain = activeNode.lineMain.geometry.getAttribute('position') as THREE.BufferAttribute;
            const attrCore = activeNode.lineCore.geometry.getAttribute('position') as THREE.BufferAttribute;
            const posMain = attrMain.array as Float32Array;
            const posCore = attrCore.array as Float32Array;

            const lineJitterForce = jitterBase * (1.0 + (l * 0.5));

            for (let i = 0; i <= LIGHTNING_SEGMENTS; i++) {
                const alpha = i / LIGHTNING_SEGMENTS;
                _v1.lerpVectors(start, end, alpha);

                if (i > 0 && i < LIGHTNING_SEGMENTS) {
                    const rx = (Math.random() - 0.5) * lineJitterForce;
                    const ry = (Math.random() - 0.5) * lineJitterForce;
                    _v1.addScaledVector(_v7, rx);
                    _v1.addScaledVector(_v8, ry);

                    if (Math.random() > 0.8) WeaponFX.spawnVisualSpark(_v1);
                }

                const idx = i * 3;
                posMain[idx] = _v1.x; posMain[idx + 1] = _v1.y; posMain[idx + 2] = _v1.z;

                if (activeNode.lineCore.visible) {
                    posCore[idx] = _v1.x; posCore[idx + 1] = _v1.y; posCore[idx + 2] = _v1.z;
                }
            }

            attrMain.needsUpdate = true;
            attrCore.needsUpdate = true;
        }
    },

    spawnVisualSpark: (pos: THREE.Vector3) => {
        const req = FXSystem._getSpawnRequest();
        req.scene = null as any;
        req.x = pos.x; req.y = pos.y; req.z = pos.z;
        req.type = FXParticleType.ENEMY_EFFECT_STUN;
        req.customVel.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
        req.hasCustomVel = true;
        req.scale = 0.1 + Math.random() * 0.2;
        FXSystem.essentialQueue.push(req);
    },

    createStunSparks: (pos: THREE.Vector3) => {
        for (let i = 0; i < 5; i++) {
            const req = FXSystem._getSpawnRequest();
            req.scene = null as any;
            req.x = pos.x + (Math.random() - 0.5);
            req.y = pos.y + 1.0 + (Math.random() - 0.5);
            req.z = pos.z + (Math.random() - 0.5);
            req.type = FXParticleType.ENEMY_EFFECT_STUN;
            req.customVel.set((Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6);
            req.hasCustomVel = true;
            req.scale = 0.2 + Math.random() * 0.2;
            FXSystem.essentialQueue.push(req);
        }
    },

    createGrenadeImpact: (pos: THREE.Vector3, radius: number, hitWater: boolean, ctx: any) => {
        if (hitWater) {
            ctx.spawnParticle(pos.x, pos.y, pos.z, FXParticleType.SPLASH, 85);
            return;
        }
        // VINTERDÖD FIX: Standardized to seconds-based life (0.1s flash, 0.4s shockwave, 1.2s blast)
        ctx.spawnParticle(pos.x, pos.y + 0.5, pos.z, FXParticleType.FLASH, 1, undefined, _v2.set(0, 0, 0), undefined, 1.5, 0.1);
        ctx.spawnParticle(pos.x, pos.y + 0.1, pos.z, FXParticleType.SHOCKWAVE, 2, undefined, _v2, undefined, radius * 0.2, 0.4);
        ctx.spawnParticle(pos.x, pos.y + 0.05, pos.z, FXParticleType.BLAST_RADIUS, 1, undefined, _v2, undefined, radius, 1.2);

        // Massive Intensity Buff (5.0 -> 25.0)
        WeaponFX.spawnDynamicLight(ctx.scene, pos, 0xffaa00, 25.0, radius * 6, 0.5, 'fire');
    },

    createMolotovImpact: (pos: THREE.Vector3, radius: number, hitWater: boolean, ctx: any) => {
        if (hitWater) {
            ctx.spawnParticle(pos.x, pos.y, pos.z, FXParticleType.SPLASH, 12);
            return;
        }
        ctx.spawnParticle(pos.x, pos.y + 0.5, pos.z, FXParticleType.GLASS, 15);
        ctx.spawnParticle(pos.x, pos.y + 0.5, pos.z, FXParticleType.FLASH, 1, undefined, _v2.set(0, 0, 0), 0xff8800, 1.0, 0.15);
        ctx.spawnParticle(pos.x, pos.y + 0.5, pos.z, FXParticleType.LARGE_FIRE, 8, undefined, undefined, undefined, 1.8);

        // Intensity Buff (3.0 -> 15.0)
        WeaponFX.spawnDynamicLight(ctx.scene, pos, 0xff6600, 15.0, radius * 5, 0.4, 'fire');
        ctx.spawnDecal(pos.x, pos.z, radius * 2.0, MATERIALS.scorchDecal, FXDecalType.SCORCH);
    },

    updateFireZoneVisuals: (pos: THREE.Vector3, radius: number, delta: number, ctx: any) => {
        const fireDensity = 6.0;
        const targetFlameCount = Math.min(25, (radius * radius * fireDensity) * (delta * 1000));
        let flameCount = Math.floor(targetFlameCount);
        if (Math.random() < (targetFlameCount - flameCount)) flameCount++;

        for (let j = 0; j < flameCount; j++) {
            // VINTERDÖD: Sqrt Purge! 
            // Using Math.max(rand, rand) as a fast approximation for uniform circular distribution.
            const r = Math.max(Math.random(), Math.random()) * radius;
            const theta = Math.random() * Math.PI * 2;
            const fx = pos.x + r * Math.cos(theta);
            const fzZ = pos.z + r * Math.sin(theta);
            const norm = r / radius;
            const core = (1.0 - norm) * (1.0 - norm);
            const scale = 0.8 + (core * 3.7);
            const y = 0.3 + (core * 2.2);
            const color = Math.random() > 0.6 ? 0xffcc00 : (Math.random() > 0.3 ? 0xff8800 : 0xff4400);

            ctx.spawnParticle(fx, y, fzZ, FXParticleType.FIRE, 1, undefined, undefined, color, scale);
        }

        if (Math.random() < 0.1) {
            _v1.copy(pos); // Changed _v4 to _v1 to prevent ReferenceError
            _v1.y += 1.0;
            WeaponFX.spawnDynamicLight(ctx.scene, _v1, 0xff8800, 2.5 + Math.random() * 2.0, radius * 3.5, 0.15, 'fire');
        }
    },

    createFlashbangImpact: (pos: THREE.Vector3, hitWater: boolean, ctx: any) => {
        if (hitWater) {
            ctx.spawnParticle(pos.x, pos.y, pos.z, FXParticleType.SPLASH, 8);
            return;
        }
        ctx.spawnParticle(pos.x, pos.y + 2, pos.z, FXParticleType.FLASH, 1, undefined, _v2.set(0, 0, 0), undefined, 8.0, 0.5);
        // Blinding Intensity (10.0 -> 45.0)
        WeaponFX.spawnDynamicLight(ctx.scene, pos, 0xffffff, 45.0, 60.0, 1.5);
        ctx.spawnDecal(pos.x, pos.z, 2.0, MATERIALS.scorchDecal, FXDecalType.SCORCH);
    },

    createFlame: (start: THREE.Vector3, direction: THREE.Vector3, range: number = 10) => {
        const spread = 0.30;
        _v1.copy(direction).add(_v2.set((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread)).normalize();

        const speed = 35 + Math.random() * 15;
        // VINTERDÖD FIX: Dynamic Life based on Speed vs Range to ensure full reach
        const life = (range / speed) * (1.1 + Math.random() * 0.2);

        const req = FXSystem._getSpawnRequest();
        req.scene = null as any;
        req.x = start.x; req.y = start.y; req.z = start.z;
        req.type = FXParticleType.FLAMETHROWER_FIRE;
        req.customVel.copy(_v1).multiplyScalar(speed);
        req.hasCustomVel = true;
        req.scale = 0.15 + Math.random() * 0.25;
        req.color = Math.random() > 0.8 ? 0xffcc00 : (Math.random() > 0.4 ? 0xff4400 : 0xaa1100);
        req.life = life;
        FXSystem.essentialQueue.push(req);
    },

    createMuzzleFire: (start: THREE.Vector3, direction: THREE.Vector3, scale: number = 1.0) => {
        // High-density, short-lived muzzle fire
        for (let i = 0; i < 3; i++) {
            const req = FXSystem._getSpawnRequest();
            req.scene = null as any;
            req.x = start.x; req.y = start.y; req.z = start.z;
            req.type = FXParticleType.FIRE;
            _v1.copy(direction).add(_v2.set((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4)).normalize();
            req.customVel.copy(_v1).multiplyScalar(4 + Math.random() * 3);
            req.hasCustomVel = true;
            req.scale = (0.2 + Math.random() * 0.3) * scale;
            req.life = 0.08 + Math.random() * 0.08;
            FXSystem.essentialQueue.push(req);
        }
    },

    createMuzzleSmoke: (start: THREE.Vector3) => {
        // Shutdown/Overheat smoke puff
        for (let i = 0; i < 8; i++) {
            const req = FXSystem._getSpawnRequest();
            req.scene = null as any;
            req.x = start.x; req.y = start.y; req.z = start.z;
            req.type = FXParticleType.SMOKE;
            req.customVel.set((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2);
            req.hasCustomVel = true;
            req.scale = 0.5 + Math.random() * 0.8;
            req.life = 0.8 + Math.random() * 1.2;
            FXSystem.essentialQueue.push(req);
        }
    },

    createMuzzleFlash: (start: THREE.Vector3, direction: THREE.Vector3, isCyan: boolean = false) => {
        const req = FXSystem._getSpawnRequest();
        req.scene = null as any;
        req.x = start.x; req.y = start.y; req.z = start.z;
        req.type = FXParticleType.FIRE;
        req.customVel.copy(direction).multiplyScalar(3 + Math.random() * 2);
        req.hasCustomVel = true;
        req.scale = 0.8 + Math.random() * 0.5;
        req.color = isCyan ? 0x00ffff : 0xffcc00;
        req.life = 0.05 + Math.random() * 0.05;
        FXSystem.essentialQueue.push(req);
    }
};