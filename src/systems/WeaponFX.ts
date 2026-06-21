import * as THREE from 'three';
import { FXSystem } from './FXSystem';
import { MATERIALS } from '../utils/assets';
import { LogicalLight } from './LightSystem';
import { FXParticleType, FXDecalType } from '../types/FXTypes';
import { COLORS } from '../utils/ui/ColorUtils';
import { ParticlePool } from '../core/pools/ParticlePool';
import { WeaponID } from '../entities/player/CombatTypes';
import { COMBAT } from '../content/constants';
import { WEAPONS, WeaponStats, DEFAULT_MUZZLE } from '../content/weapons';

export enum WeaponLightType {
    ELECTRIC = 0,
    FIRE = 1
}

// --- ZERO-GC SCRATCHPADS ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _colorScratch = new THREE.Color();

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
    type: WeaponLightType;
}

const _lightningPool: LightningNode[] = [];
const _lightPool: WeaponLightNode[] = [];
let _poolsInitialized = false;
let _lightsInjected = false;

const initPools = (scene: THREE.Scene) => {
    if (_poolsInitialized) return;

    // Arc cannon lightning uses shared materials from the central registry (no per-init allocations)
    const matMain = MATERIALS.arc_cannon_bolt;
    const matCore = MATERIALS.arc_cannon_core;

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
            _worldPos: new THREE.Vector3(0, -1000, 0),
            color: COLORS.WHITE.num,
            intensity: 0,
            distance: 10,
            castShadow: false,
            life: 0,
            maxLife: 1,
            initialIntensity: 0,
            active: false,
            type: WeaponLightType.ELECTRIC
        });
    }

    _poolsInitialized = true;
};

export const WeaponFX = {

    updateFX: (ctx: any, delta: number) => {
        if (!_poolsInitialized) return;

        if (!_lightsInjected && ctx) {
            const state = ctx.state || ctx.session?.state || ctx;
            if (state) {
                const world = state.world || state;
                if (!world.lights) world.lights = [];
                world.lights.push(..._lightPool);
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

                    if (node.type === WeaponLightType.FIRE) {
                        intensity *= (0.8 + Math.random() * 0.4);
                    }
                    node.intensity = intensity;
                }
            }
        }
    },

    spawnDynamicLight: (scene: THREE.Scene, pos: THREE.Vector3, color: number, intensity: number, distance: number, life: number, type: WeaponLightType = WeaponLightType.ELECTRIC) => {
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

    /**
         * Spawns flamethrower particles strictly bounded by the mathematical
         * limitations of the gameplay collision cone (FLAMETHROWER_CONE_COS).
         */
    drawFlames: (scene: THREE.Scene, start: THREE.Vector3, direction: THREE.Vector3, range: number) => {
        // Enforce absolute mathematical boundary convergence with ProjectileSystem damage cone
        const halfAngle = Math.acos(COMBAT.FLAMETHROWER_CONE_COS);
        const baseAngle = Math.atan2(direction.x, direction.z);
        const baseSpeed = 22.0;

        for (let i = 0; i < 2; i++) {
            const speed = baseSpeed + Math.random() * 6.0;
            const life = (range / speed) * (0.85 + Math.random() * 0.3);

            // Zero-GC: Pick a uniform angular vector inside the exact radian arc bounds
            const randomAngle = baseAngle + (Math.random() - 0.5) * 2.0 * halfAngle;

            const vx = Math.sin(randomAngle) * speed;
            const vz = Math.cos(randomAngle) * speed;

            // Retain vertical volumetric expansion to simulate climbing thermal gas pressure
            const vy = direction.y * speed + (Math.random() * 2.0 - 0.7) * 2.5;
            const scale = 0.35 + Math.random() * 0.3;

            // Initial ignition color profile (Bright Yellow-Orange)
            const r = 1.0;
            const g = 0.95;
            const b = 0.1;

            ParticlePool.spawnParticle(start.x, start.y, start.z, vx, vy, vz, scale, life, r, g, b);
        }

        // Project localized structural fire ignition glow fields
        if (Math.random() < 0.20) {
            _v1.copy(start).addScaledVector(direction, range * 0.5);
            _v1.y += 0.5;
            WeaponFX.spawnDynamicLight(scene, _v1, COLORS.FIRE_ORANGE.num, 6.0 + Math.random() * 4.0, range * 1.5, 0.15, WeaponLightType.FIRE);
        }
    },

    // Arc-Cannon lightning beam (continuous)
    drawArcLightning: (scene: THREE.Scene, start: THREE.Vector3, end: THREE.Vector3, isMain: boolean = true) => {
        initPools(scene);

        const dist = start.distanceTo(end);
        if (dist < 0.001) return;

        const lineCount = isMain ? 3 : 1;
        const jitterBase = isMain ? Math.min(dist * 0.15, 1.5) : Math.min(dist * 0.1, 0.8);

        _v3.subVectors(end, start).normalize();
        _v4.set(-_v3.z, _v3.y, _v3.x);
        _v5.crossVectors(_v3, _v4).normalize();

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
                    _v1.addScaledVector(_v4, rx);
                    _v1.addScaledVector(_v5, ry);

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

            // FIXED: Re-compute bounding volumes inline to prevent WebGL frustum culling from dropping the line draw calls
            activeNode.lineMain.geometry.computeBoundingSphere();
            activeNode.lineMain.geometry.computeBoundingBox();
            activeNode.lineCore.geometry.computeBoundingSphere();
            activeNode.lineCore.geometry.computeBoundingBox();
        }

        if (Math.random() < 0.25) {
            _v2.copy(start).add(end).multiplyScalar(0.5);
            _v2.y += 0.5;
            WeaponFX.spawnDynamicLight(scene, _v2, COLORS.ELECTRIC_FLASH.num, 8.0 + Math.random() * 5.0, dist * 1.6, 0.1, WeaponLightType.ELECTRIC);
        }
    },

    spawnVisualSpark: (pos: THREE.Vector3) => {
        // Ported to Zero-GC ParticlePool
        const vx = (Math.random() - 0.5) * 8;
        const vy = (Math.random() - 0.5) * 8;
        const vz = (Math.random() - 0.5) * 8;
        const scale = 0.1 + Math.random() * 0.2;
        const life = 0.2 + Math.random() * 0.3;

        // Bright Yellow/White Spark
        ParticlePool.spawnParticle(pos.x, pos.y, pos.z, vx, vy, vz, scale, life, 1.0, 1.0, 0.5);
    },

    createStunSparks: (pos: THREE.Vector3) => {
        // Ported to Zero-GC ParticlePool
        for (let i = 0; i < 5; i++) {
            const vx = (Math.random() - 0.5) * 6;
            const vy = Math.random() * 5;
            const vz = (Math.random() - 0.5) * 6;
            const scale = 0.2 + Math.random() * 0.2;
            const life = 0.3 + Math.random() * 0.4;

            // Electric Yellow/White
            ParticlePool.spawnParticle(
                pos.x + (Math.random() - 0.5),
                pos.y + 1.0 + (Math.random() - 0.5),
                pos.z + (Math.random() - 0.5),
                vx, vy, vz, scale, life, 1.0, 1.0, 0.8
            );
        }
    },

    createGrenadeImpact: (pos: THREE.Vector3, radius: number, hitWater: boolean, ctx: any) => {
        if (hitWater) {
            // Spawn a massive water column/geyser using SPLASH particles with high upward velocity
            for (let i = 0; i < 85; i++) {
                _v1.set(
                    (Math.random() - 0.5) * 4.0, // horizontal spread
                    15.0 + Math.random() * 20.0, // high upward velocity (water column)
                    (Math.random() - 0.5) * 4.0
                );
                ctx.spawnParticle(pos.x, pos.y, pos.z, FXParticleType.SPLASH, 1, undefined, _v1, undefined, 4.0 + Math.random() * 4.0);
            }
            return;
        }
        // Standardized to seconds-based life (0.1s flash, 0.4s shockwave, 1.2s blast)
        ctx.spawnParticle(pos.x, pos.y + 0.5, pos.z, FXParticleType.FLASH, 1, undefined, _v2.set(0, 0, 0), undefined, 1.5, 0.1);
        ctx.spawnParticle(pos.x, pos.y + 0.1, pos.z, FXParticleType.SHOCKWAVE, 2, undefined, _v2, undefined, radius * 0.2, 0.4);
        ctx.spawnParticle(pos.x, pos.y + 0.05, pos.z, FXParticleType.BLAST_RADIUS, 1, undefined, _v2, undefined, radius, 1.2);

        // --- RESTORED VISUALS (Audit Fix) ---
        ctx.spawnParticle(pos.x, pos.y + 1.0, pos.z, FXParticleType.SMOKE, 12, undefined, undefined, undefined, 2.5);
        ctx.spawnParticle(pos.x, pos.y + 0.5, pos.z, FXParticleType.DEBRIS, 15);
        ctx.spawnDecal(pos.x, pos.z, radius * 1.5, MATERIALS.scorchDecal, FXDecalType.SCORCH);

        // Massive Intensity Buff (5.0 -> 25.0)
        WeaponFX.spawnDynamicLight(ctx.scene, pos, COLORS.FIRE_ORANGE.num, 25.0, radius * 6, 0.5, WeaponLightType.FIRE);
    },

    createMolotovImpact: (pos: THREE.Vector3, radius: number, hitWater: boolean, ctx: any) => {
        if (hitWater) {
            ctx.spawnParticle(pos.x, pos.y, pos.z, FXParticleType.SPLASH, 12);
            return;
        }
        ctx.spawnParticle(pos.x, pos.y + 0.5, pos.z, FXParticleType.GLASS, 15);
        ctx.spawnParticle(pos.x, pos.y + 0.5, pos.z, FXParticleType.FLASH, 1, undefined, _v2.set(0, 0, 0), COLORS.FIRE_ORANGE.num, 1.0, 0.15);
        ctx.spawnParticle(pos.x, pos.y + 0.5, pos.z, FXParticleType.LARGE_FIRE, 8, undefined, undefined, undefined, 1.8);
        ctx.spawnParticle(pos.x, pos.y + 1.0, pos.z, FXParticleType.BLACK_SMOKE, 6, undefined, undefined, undefined, 2.0);

        // Intensity Buff (3.0 -> 15.0)
        WeaponFX.spawnDynamicLight(ctx.scene, pos, COLORS.FIRE_RED.num, 15.0, radius * 5, 0.4, WeaponLightType.FIRE);
        ctx.spawnDecal(pos.x, pos.z, radius * 2.0, MATERIALS.scorchDecal, FXDecalType.SCORCH);
    },

    updateFireZoneVisuals: (pos: THREE.Vector3, radius: number, delta: number, ctx: any) => {
        const fireDensity = 6.0;
        const targetFlameCount = Math.min(25, (radius * radius * fireDensity) * (delta * 1000));
        let flameCount = Math.floor(targetFlameCount);
        if (Math.random() < (targetFlameCount - flameCount)) flameCount++;

        for (let j = 0; j < flameCount; j++) {
            // Sqrt Purge! 
            // Using Math.max(rand, rand) as a fast approximation for uniform circular distribution.
            const r = Math.max(Math.random(), Math.random()) * radius;
            const theta = Math.random() * Math.PI * 2;
            const fx = pos.x + r * Math.cos(theta);
            const fzZ = pos.z + r * Math.sin(theta);
            const norm = r / radius;
            const core = (1.0 - norm) * (1.0 - norm);
            const scale = 0.8 + (core * 3.7);
            const y = 0.3 + (core * 2.2);
            const color = Math.random() > 0.6 ? COLORS.YELLOW.num : (Math.random() > 0.3 ? COLORS.FIRE_ORANGE.num : COLORS.FIRE_RED.num);
            ctx.spawnParticle(fx, y, fzZ, FXParticleType.FIRE, 1, undefined, undefined, color, scale);

        }

        if (Math.random() < 0.1) {
            _v1.copy(pos);
            _v1.y += 1.0;
            WeaponFX.spawnDynamicLight(ctx.scene, _v1, COLORS.FIRE_ORANGE.num, 2.5 + Math.random() * 2.0, radius * 3.5, 0.15, WeaponLightType.FIRE);
        }
    },

    createFlashbangImpact: (pos: THREE.Vector3, hitWater: boolean, ctx: any) => {
        if (hitWater) {
            // Spawn a small water column (1/10th size of grenade)
            for (let i = 0; i < 10; i++) {
                _v1.set(
                    (Math.random() - 0.5) * 0.4, // 1/10th horizontal spread
                    3.0 + Math.random() * 4.0,   // 1/10th upward velocity
                    (Math.random() - 0.5) * 0.4
                );
                ctx.spawnParticle(pos.x, pos.y, pos.z, FXParticleType.SPLASH, 1, undefined, _v1, undefined, 0.4 + Math.random() * 0.4);
            }
            return;
        }

        // --- REPEATED QUICK FLASH (Audit Fix) ---
        for (let i = 0; i < 3; i++) {
            const delay = i * 0.08;
            ctx.spawnParticle(pos.x, pos.y + 2, pos.z, FXParticleType.FLASH, 1, undefined, _v2.set(0, 0, 0), undefined, 6.0 + i * 2, 0.1, delay);
        }

        // Blinding Intensity (10.0 -> 45.0)
        WeaponFX.spawnDynamicLight(ctx.scene, pos, COLORS.WHITE.num, 45.0, 60.0, 1.5);
        ctx.spawnDecal(pos.x, pos.z, 2.5, MATERIALS.scorchDecal, FXDecalType.SCORCH);
    },

    createMuzzleEffect: (scene: THREE.Scene, weapon: WeaponID, start: THREE.Vector3, direction: THREE.Vector3) => {
        if (!scene || weapon === WeaponID.NONE) return;

        // O(1) Data Lookup från vår Single Source of Truth
        const wepStats = WEAPONS[weapon] as WeaponStats;
        const profile = wepStats?.muzzle || DEFAULT_MUZZLE;

        // ZERO-GC Color Conversion
        _colorScratch.setHex(profile.colorHex);

        for (let i = 0; i < profile.count; i++) {
            const speed = profile.speedBase + Math.random() * profile.speedVar;

            // Apply spread if > 0
            const spreadMult = profile.spread > 0 ? 10.0 : 0.0;
            const vx = direction.x * speed + (Math.random() - 0.5) * profile.spread * spreadMult;
            const vy = direction.y * speed + (Math.random() - 0.5) * profile.spread * spreadMult;
            const vz = direction.z * speed + (Math.random() - 0.5) * profile.spread * spreadMult;

            const scale = profile.scaleBase + Math.random() * profile.scaleVar;
            const life = profile.lifeBase + Math.random() * profile.lifeVar;

            ParticlePool.spawnParticle(
                start.x, start.y, start.z,
                vx, vy, vz,
                scale, life,
                _colorScratch.r, _colorScratch.g, _colorScratch.b
            );
        }

        // Spawn dynamic light
        WeaponFX.spawnDynamicLight(
            scene,
            start,
            profile.colorHex,
            profile.lightIntensity,
            profile.lightDistance,
            profile.lifeBase,
            profile.lightType
        );
    },

    // Muzzle: Smoke
    createMuzzleSmoke: (start: THREE.Vector3) => {
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

};
