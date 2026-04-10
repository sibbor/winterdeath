import * as THREE from 'three';
import { FXSystem } from './FXSystem';
import { WinterEngine } from '../core/engine/WinterEngine';
import { MATERIALS } from '../utils/assets';
import { LogicalLight } from './LightSystem'; // Import your existing interface

// --- ZERO-GC SCRATCHPADS ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v7 = new THREE.Vector3();
const _v8 = new THREE.Vector3();

// --- POOLS ---
const LIGHTNING_POOL_SIZE = 40;
const LIGHTNING_SEGMENTS = 6;
const LIGHT_POOL_SIZE = 4;

interface LightningNode {
    line: THREE.Line;
    life: number;
    active: boolean;
}

// Extending your LogicalLight with FX metadata
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

    // Material with vertexColors for lightning variation
    const matLightning = new THREE.LineBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.9,
        depthWrite: false
    });

    for (let i = 0; i < LIGHTNING_POOL_SIZE; i++) {
        const geo = new THREE.BufferGeometry();
        const posArray = new Float32Array((LIGHTNING_SEGMENTS + 1) * 3);
        const colorArray = new Float32Array((LIGHTNING_SEGMENTS + 1) * 3);

        geo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));

        const line = new THREE.Line(geo, matLightning);
        line.frustumCulled = false;
        line.visible = false;

        scene.add(line);
        _lightningPool.push({ line, life: 0, active: false });
    }

    // Initialize Logical Lights using your structure
    for (let i = 0; i < LIGHT_POOL_SIZE; i++) {
        _lightPool.push({
            isLogicalLight: true,
            position: new THREE.Vector3(0, -1000, 0),
            color: 0xffffff,
            intensity: 0,
            distance: 10,
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

    /**
     * Updates FX and ensures lights are registered in your LightSystem.
     * Call this from ProjectileSystem.ts update loop.
     */
    updateFX: (delta: number, ctx?: any) => {
        if (!_poolsInitialized) return;

        // One-time injection into your LightSystem's dynamic list
        if (!_lightsInjected && ctx) {
            const state = ctx.state || ctx.session?.state || ctx;
            if (state) {
                if (!state.dynamicLights) state.dynamicLights = [];
                state.dynamicLights.push(..._lightPool);
                _lightsInjected = true;
            }
        }

        // Update Lightning bolts
        for (let i = 0; i < LIGHTNING_POOL_SIZE; i++) {
            const node = _lightningPool[i];
            if (node.active) {
                node.life -= delta;
                if (node.life <= 0) {
                    node.line.visible = false;
                    node.active = false;
                }
            }
        }

        // Update Logical Lights with flicker logic
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

                    // Add flickering for fire type
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
        for (let i = 0; i < LIGHT_POOL_SIZE; i++) {
            const node = _lightPool[i];
            if (!node.active) {
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
            activeNode.line.visible = true;

            const attrPos = activeNode.line.geometry.getAttribute('position') as THREE.BufferAttribute;
            const attrCol = activeNode.line.geometry.getAttribute('color') as THREE.BufferAttribute;
            const posArray = attrPos.array as Float32Array;
            const colArray = attrCol.array as Float32Array;

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
                posArray[idx] = _v1.x; posArray[idx + 1] = _v1.y; posArray[idx + 2] = _v1.z;

                const redChannel = Math.random() * 0.7; // Lower red = More Cyan
                colArray[idx] = redChannel;
                colArray[idx + 1] = 1.0;
                colArray[idx + 2] = 1.0;
            }

            attrPos.needsUpdate = true;
            attrCol.needsUpdate = true;
        }
    },

    spawnVisualSpark: (pos: THREE.Vector3) => {
        const req = FXSystem._getSpawnRequest();
        req.scene = null as any;
        req.x = pos.x; req.y = pos.y; req.z = pos.z;
        req.type = 'enemy_effect_stun';
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
            req.type = 'enemy_effect_stun';
            req.customVel.set((Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6);
            req.hasCustomVel = true;
            req.scale = 0.2 + Math.random() * 0.2;
            FXSystem.essentialQueue.push(req);
        }
    },

    // Standard impact functions
    createGrenadeImpact: (pos: THREE.Vector3, radius: number, hitWater: boolean, ctx: any) => {
        if (hitWater) {
            ctx.spawnPart(pos.x, pos.y, pos.z, 'splash', 85);
            return;
        }
        ctx.spawnPart(pos.x, pos.y + 0.5, pos.z, 'flash', 1, undefined, _v2.set(0, 0, 0), undefined, 1.5, 1.0);
        ctx.spawnPart(pos.x, pos.y + 0.1, pos.z, 'shockwave', 1, undefined, _v2, undefined, radius * 0.2, 2.0);
        ctx.spawnPart(pos.x, pos.y + 0.05, pos.z, 'blastRadius', 1, undefined, _v2, undefined, radius, 25.0);
        WeaponFX.spawnDynamicLight(ctx.scene, pos, 0xffaa00, 5.0, radius * 3, 0.5, 'fire');
    },

    createMolotovImpact: (pos: THREE.Vector3, radius: number, hitWater: boolean, ctx: any) => {
        if (hitWater) return;
        ctx.spawnPart(pos.x, pos.y + 0.5, pos.z, 'glass', 15);
        ctx.spawnPart(pos.x, pos.y + 0.5, pos.z, 'flash', 1, undefined, _v2.set(0, 0, 0), 0xff8800, 1.0, 1.0);
        ctx.spawnPart(pos.x, pos.y + 0.5, pos.z, 'large_fire', 5, undefined, undefined, undefined, 1.5);
        WeaponFX.spawnDynamicLight(ctx.scene, pos, 0xff6600, 3.0, radius * 2.5, 0.4, 'fire');
        ctx.spawnDecal(pos.x, pos.z, radius * 2.0, MATERIALS.scorchDecal);
    },

    updateFireZoneVisuals: (pos: THREE.Vector3, radius: number, delta: number, ctx: any) => {
        const fireDensity = 6.0;
        const targetFlameCount = Math.min(25, (radius * radius * fireDensity) * delta);
        let flameCount = Math.floor(targetFlameCount);
        if (Math.random() < (targetFlameCount - flameCount)) flameCount++;

        for (let j = 0; j < flameCount; j++) {
            const r = Math.sqrt(Math.random()) * radius;
            const theta = Math.random() * Math.PI * 2;
            const fx = pos.x + r * Math.cos(theta);
            const fzZ = pos.z + r * Math.sin(theta);
            const norm = r / radius;
            const core = (1.0 - norm) * (1.0 - norm);
            const scale = 0.8 + (core * 3.7);
            const y = 0.3 + (core * 2.2);
            const color = Math.random() > 0.6 ? 0xffcc00 : (Math.random() > 0.3 ? 0xff8800 : 0xff4400);

            ctx.spawnPart(fx, y, fzZ, 'fire', 1, undefined, undefined, color, scale);
        }

        if (Math.random() < 0.1) {
            WeaponFX.spawnDynamicLight(ctx.scene, pos, 0xff8800, 1.0 + Math.random(), radius * 2.0, 0.15, 'fire');
        }
    },

    createFlashbangImpact: (pos: THREE.Vector3, hitWater: boolean, ctx: any) => {
        if (hitWater) return;
        ctx.spawnPart(pos.x, pos.y + 2, pos.z, 'flash', 1, undefined, _v2.set(0, 0, 0), undefined, 8.0);
        WeaponFX.spawnDynamicLight(ctx.scene, pos, 0xffffff, 10.0, 30.0, 0.6);
        ctx.spawnDecal(pos.x, pos.z, 2.0, MATERIALS.scorchDecal);
    },

    createFlame: (start: THREE.Vector3, direction: THREE.Vector3) => {
        const spread = 0.30;
        _v1.copy(direction).add(_v2.set((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread)).normalize();
        const req = FXSystem._getSpawnRequest();
        req.scene = null as any;
        req.x = start.x; req.y = start.y; req.z = start.z;
        req.type = 'flamethrower_fire';
        req.customVel.copy(_v1).multiplyScalar(35 + Math.random() * 20);
        req.hasCustomVel = true;
        req.scale = 0.1 + Math.random() * 0.2;
        req.color = Math.random() > 0.8 ? 0xffcc00 : (Math.random() > 0.4 ? 0xff4400 : 0xaa1100);
        req.life = 25 + Math.random() * 15;
        FXSystem.essentialQueue.push(req);
    },

    createMuzzleFlash: (start: THREE.Vector3, direction: THREE.Vector3, isCyan: boolean = false) => {
        const req = FXSystem._getSpawnRequest();
        req.scene = null as any;
        req.x = start.x; req.y = start.y; req.z = start.z;
        req.type = 'fire';
        req.customVel.copy(direction).multiplyScalar(3 + Math.random() * 2);
        req.hasCustomVel = true;
        req.scale = 0.3 + Math.random() * 0.3;
        req.color = isCyan ? 0x00bfff : 0xffcc00;
        req.life = 6 + Math.random() * 4;
        FXSystem.essentialQueue.push(req);
    }
};