import * as THREE from 'three';
import { System, SystemID } from './System';
import { CelestialType, MATERIALS_SKY, SkyConfig, SKY_KEYFRAMES, SkyCloudConfig } from '../utils/assets/materials_sky';
import { GEOMETRY } from '../utils/assets';
import { SKY_SYSTEM } from '../content/constants';

// Zero-GC Module Scratchpads and Mathematical Constants
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
const _v1 = new THREE.Vector3();
const PI2 = Math.PI * 2;
const PI05 = Math.PI * 0.5;

/**
 * SkySystem: Procedural Environmental Controller (V2)
 *
 * INCLUDES:
 * - Stars (THREE.Points)
 * - Celestial body mesh + halo sprite (Moon / Sun)
 * - Dynamic Cloud Sprites (procedurally generated/recycled)
 * - HemisphereLight (ambient fill)
 * - DirectionalLight (sun/moon shadows) — authoritative global shadowing
 *
 * Heavily optimized for Zero-GC hot-paths, implementing spatial and temporal thresholding.
 */
export class SkySystem implements System {
    public readonly systemId = SystemID.SKY;
    public id = 'sky';
    public enabled = true;
    public persistent = true;

    // --- ENGINE STATE ---
    public currentTime: number = 0;
    public timeScale: number = 0;
    private activeConfig: SkyConfig | null = null;
    public currentAtmosphereColor: number = 0x050510;

    // Temporal cache to block redundant keyframe interpolations
    private lastLerpTime: number = -1;

    // Spatial cache to block redundant scene graph matrix updates
    private lastTrackedPos: THREE.Vector3 = new THREE.Vector3(Infinity, Infinity, Infinity);

    // --- SCENE OBJECTS ---
    public root: THREE.Group;
    private currentScene: THREE.Scene | null = null;
    private starSystem!: THREE.Points;
    
    // Dual celestial body support (Sun & Moon)
    private sunGroup!: THREE.Group;
    private sunMesh!: THREE.Mesh;
    private sunHalo!: THREE.Sprite;
    private moonGroup!: THREE.Group;
    private moonMesh!: THREE.Mesh;
    private moonHalo!: THREE.Sprite;

    private sunMaterial!: THREE.MeshBasicMaterial;
    private sunHaloMaterial!: THREE.SpriteMaterial;
    private moonMaterial!: THREE.MeshBasicMaterial;
    private moonHaloMaterial!: THREE.SpriteMaterial;

    private hemiLight!: THREE.HemisphereLight;
    private skyLight!: THREE.DirectionalLight;

    // Procedural Dynamic Clouds Pool
    private clouds: THREE.Sprite[] = [];
    private cloudVelocities: number[] = [];

    // --- STATIC ASSETS CACHE ---
    private static STATIC_SKY_CACHE = {
        starGeo: null as THREE.BufferGeometry | null
    };

    constructor() {
        this.root = new THREE.Group();
        this.root.name = 'SKY_SYSTEM_ROOT';
        this.root.userData = { isSystemic: true, isPersistent: true, isEngineStatic: true };
    }

    public init(): void {
        const cache = SkySystem.STATIC_SKY_CACHE;

        // 1. STAR SYSTEM (Seeded static buffers allocated exactly once globally)
        if (!cache.starGeo) {
            const starCount = SKY_SYSTEM.STAR_COUNT_MAX;
            const geo = new THREE.BufferGeometry();
            const positions = new Float32Array(starCount * 3);
            const sizes = new Float32Array(starCount);
            const phases = new Float32Array(starCount);
            const twinkleSpeeds = new Float32Array(starCount);

            for (let i = 0; i < starCount; i++) {
                const r = 1200 + Math.random() * 800;
                const theta = Math.random() * Math.PI * 2;
                const phi = (Math.PI / 2) - Math.random() * 1.5;

                const i3 = i * 3;
                positions[i3] = r * Math.sin(phi) * Math.cos(theta);
                positions[i3 + 1] = r * Math.cos(phi);
                positions[i3 + 2] = r * Math.sin(phi) * Math.sin(theta);

                const roll = Math.random();
                sizes[i] = roll > 0.98 ? 4.5 : (roll > 0.90 ? 3.5 : (roll > 0.70 ? 2.5 : 1.5));
                phases[i] = Math.random() * Math.PI * 2;
                twinkleSpeeds[i] = Math.random() > 0.8 ? 0.2 + Math.random() * 0.5 : 0.0;
            }
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
            geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
            geo.setAttribute('twinkleSpeed', new THREE.BufferAttribute(twinkleSpeeds, 1));
            cache.starGeo = geo;
        }

        this.starSystem = new THREE.Points(cache.starGeo, MATERIALS_SKY.star);
        this.starSystem.frustumCulled = false;
        this.starSystem.userData.isEngineStatic = true;
        this.root.add(this.starSystem);

        // 2. CELESTIAL BODIES (Sun & Moon)
        // Clone materials to allow independent, seamless opacity/halo size adjustment without affecting shared materials
        this.sunMaterial = MATERIALS_SKY.sun.clone();
        this.sunMaterial.transparent = true;
        this.sunMaterial.userData = { isSharedAsset: true };

        this.sunHaloMaterial = MATERIALS_SKY.moonHalo.clone();
        this.sunHaloMaterial.transparent = true;
        this.sunHaloMaterial.userData = { isSharedAsset: true };

        this.moonMaterial = MATERIALS_SKY.moon.clone();
        this.moonMaterial.transparent = true;
        this.moonMaterial.userData = { isSharedAsset: true };

        this.moonHaloMaterial = MATERIALS_SKY.moonHalo.clone();
        this.moonHaloMaterial.transparent = true;
        this.moonHaloMaterial.userData = { isSharedAsset: true };

        // Sun Group Setup
        this.sunGroup = new THREE.Group();
        this.sunGroup.name = 'SUN_GROUP';

        this.sunMesh = new THREE.Mesh(GEOMETRY.celestialBody, this.sunMaterial);
        this.sunMesh.frustumCulled = false;
        this.sunMesh.userData.isEngineStatic = true;
        this.sunGroup.add(this.sunMesh);

        this.sunHalo = new THREE.Sprite(this.sunHaloMaterial);
        this.sunHalo.position.set(0, 0, 10);
        this.sunHalo.userData.isEngineStatic = true;
        this.sunGroup.add(this.sunHalo);

        this.root.add(this.sunGroup);

        // Moon Group Setup
        this.moonGroup = new THREE.Group();
        this.moonGroup.name = 'MOON_GROUP';

        this.moonMesh = new THREE.Mesh(GEOMETRY.celestialBody, this.moonMaterial);
        this.moonMesh.frustumCulled = false;
        this.moonMesh.userData.isEngineStatic = true;
        this.moonGroup.add(this.moonMesh);

        this.moonHalo = new THREE.Sprite(this.moonHaloMaterial);
        this.moonHalo.position.set(0, 0, 10);
        this.moonHalo.userData.isEngineStatic = true;
        this.moonGroup.add(this.moonHalo);

        this.root.add(this.moonGroup);

        // 3. HEMISPHERE LIGHT (Authoritative ambient fill owned by SkySystem)
        this.hemiLight = new THREE.HemisphereLight(0x9ab0cc, 0x333322, 0.6);
        this.hemiLight.name = SKY_SYSTEM.HEMI_LIGHT;
        this.hemiLight.userData.isEngineStatic = true;
        this.root.add(this.hemiLight);

        // 4. DIRECTIONAL LIGHT (Authoritative shadow caster mirroring proven setup)
        this.skyLight = new THREE.DirectionalLight(0xaaccff, 0.4);
        this.skyLight.name = SKY_SYSTEM.SKY_LIGHT;
        this.skyLight.userData.isEngineStatic = true;
        this.skyLight.castShadow = true;
        this.skyLight.shadow.mapSize.set(1024, 1024);
        this.skyLight.shadow.camera.near = 0.5;
        this.skyLight.shadow.camera.far = 1000;
        this.skyLight.shadow.camera.left = -100;
        this.skyLight.shadow.camera.right = 100;
        this.skyLight.shadow.camera.top = 100;
        this.skyLight.shadow.camera.bottom = -100;
        this.skyLight.shadow.bias = -0.0004;

        this.skyLight.position.set(-80, 150, -100);
        this.root.add(this.skyLight);
        this.root.add(this.skyLight.target);

        // 5. PROCEDURAL CLOUDS POOL (Zero-GC, canvas-based sprites)
        this.clouds = [];
        this.cloudVelocities = [];
        const cloudCount = 12; // High-performance buffer
        for (let i = 0; i < cloudCount; i++) {
            const sprite = new THREE.Sprite(MATERIALS_SKY.cloud.clone());
            sprite.name = `SkySystem_Cloud_${i}`;
            sprite.userData.isEngineStatic = true;

            // Random initial placement in the background layer
            const cx = (Math.random() - 0.5) * 600;
            const cy = 120 + Math.random() * 50; // Distributed Y base
            const cz = -250 - Math.random() * 80;
            sprite.position.set(cx, cy, cz);

            // Fluffy, elongated scales
            const w = 120 + Math.random() * 80;
            const h = w * 0.5;
            sprite.scale.set(w, h, 1);

            this.root.add(sprite);
            this.clouds.push(sprite);

            // Drift speed (1 to 2.5 units per second)
            this.cloudVelocities.push(1.0 + Math.random() * 1.5);
        }
    }

    /**
     * Returns allocation-free world-space vector of the celestial body.
     */
    public getCelestialPosition(): THREE.Vector3 {
        // Return position of the dominant visible celestial body
        if (this.sunGroup && this.sunGroup.visible && 
            (!this.moonGroup.visible || this.sunMaterial.opacity >= this.moonMaterial.opacity)) {
            this.sunGroup.getWorldPosition(_v1);
        } else if (this.moonGroup && this.moonGroup.visible) {
            this.moonGroup.getWorldPosition(_v1);
        } else {
            if (this.sunGroup) {
                this.sunGroup.getWorldPosition(_v1);
            } else {
                _v1.set(0, 0, 0);
            }
        }
        return _v1;
    }

    /**
     * Authoritative lifecycle sync hook.
     */
    public sync(config: SkyConfig): void {
        this.activeConfig = config;

        if (config.time !== undefined) {
            this.currentTime = config.time;
        }
        this.timeScale = config.timeScale || 0;

        // Apply dynamic cloud configurations (visibility, base Y height, and drift speed scaling)
        this.applyCloudConfig(config.clouds);

        // Force an immediate layout update by invalidating the temporal cache
        this.lastLerpTime = -1;
        this.processProcedural(this.currentTime);
    }

    private applyCloudConfig(cfg?: Partial<SkyCloudConfig>): void {
        const count = cfg?.count !== undefined ? Math.min(cfg.count, this.clouds.length) : 6;
        const height = cfg?.height !== undefined ? cfg.height : 120; // Default altitude from ground

        for (let i = 0; i < this.clouds.length; i++) {
            const cloud = this.clouds[i];
            if (i < count) {
                cloud.visible = true;
                // Layer heights elegantly around the base height to prevent flat lining
                cloud.position.y = height + (i % 3) * 15;
            } else {
                cloud.visible = false;
            }
        }
    }

    public update(ctx: any, delta: number, _simTime: number, renderTime: number): void {
        if (!this.activeConfig) return;

        // Continuous smooth axial drift (runs even when invisible to prevent snapping on transitions)
        if (this.starSystem) {
            (this.starSystem.material as THREE.ShaderMaterial).uniforms.uTime.value = renderTime * 0.001;
            _v1.set(0.2, 1, 0.1).normalize();
            this.starSystem.rotateOnAxis(_v1, SKY_SYSTEM.DRIFT_SPEED * delta);
        }

        // Infinite-world parallax tracking
        const pPos = ctx.playerPos || ctx.state?.playerPos;

        // Spatial Gating: Block redundant root transformations if movement drift is below threshold (10.0 units)
        if (pPos && this.lastTrackedPos.distanceToSquared(pPos) > 100.0) {
            this.lastTrackedPos.copy(pPos);
            this.root.position.copy(pPos);

            // Securely align shadow target matrix without object instantiation
            this.skyLight.target.position.set(0, 0, 0);
            this.skyLight.target.updateMatrixWorld();
        }

        // Procedural timeline streaming
        if (this.timeScale !== 0) {
            this.currentTime = (this.currentTime + this.timeScale * delta) % 1.0;

            // Temporal Gating: Only recalculate heavy visual lerps if time drift exceeds threshold
            if (Math.abs(this.currentTime - this.lastLerpTime) > 0.0001) {
                this.processProcedural(this.currentTime);
            }
        }

        // 3. Dynamic cloud drift (wrapping around screen bounds)
        const cloudCfg = this.activeConfig.clouds;
        const cloudSpeedScale = cloudCfg?.speed !== undefined ? cloudCfg.speed : 1.0;
        const cloudBaseHeight = cloudCfg?.height !== undefined ? cloudCfg.height : 120;

        const cloudCount = this.clouds.length;
        for (let i = 0; i < cloudCount; i++) {
            const cloud = this.clouds[i];
            if (!cloud.visible) continue;

            cloud.position.x += this.cloudVelocities[i] * cloudSpeedScale * delta;
            if (cloud.position.x > 350) {
                cloud.position.x = -350;
                // Distribute vertical offset around base height on wrapping
                cloud.position.y = cloudBaseHeight + Math.random() * 50;
            }
        }
    }

    private processProcedural(time: number): void {
        const config = this.activeConfig;
        if (!config) return;

        // Temporal safety: Clamp time to standard [0.0, 1.0] interval to prevent keyframe index out of bounds
        const normalizedTime = Math.max(0.0, Math.min(1.0, ((time % 1.0) + 1.0) % 1.0));

        // Update temporal validation cache
        this.lastLerpTime = time;

        // 1. RESOLVE DNA INTERVAL
        let k1 = SKY_KEYFRAMES[0];
        let k2 = SKY_KEYFRAMES[1];
        for (let i = 0; i < SKY_KEYFRAMES.length - 1; i++) {
            if (normalizedTime >= SKY_KEYFRAMES[i].time && normalizedTime <= SKY_KEYFRAMES[i + 1].time) {
                k1 = SKY_KEYFRAMES[i];
                k2 = SKY_KEYFRAMES[i + 1];
                break;
            }
        }

        const range = k2.time - k1.time;
        const alpha = range > 0 ? (normalizedTime - k1.time) / range : 0;

        // 2. ATMOSPHERE TINTING
        this.currentAtmosphereColor = config.atmosphereColor ?? this.lerpColor(k1.atmosphereColor, k2.atmosphereColor, alpha);

        // 3. HEMISPHERE FILL
        const hemiSky = config.hemi?.skyColor ?? this.lerpColor(k1.hemiSkyColor, k2.hemiSkyColor, alpha);
        const hemiGround = config.hemi?.groundColor ?? 0x333322;
        const hemiIntensity = config.hemi?.intensity ?? this.lerpScalar(k1.hemiIntensity, k2.hemiIntensity, alpha);

        this.hemiLight.color.setHex(hemiSky);
        this.hemiLight.groundColor.setHex(hemiGround);
        this.hemiLight.intensity = hemiIntensity;

        // 4. CELESTIAL VISUALS
        // Determine day cycle state (0.25 = Dawn, 0.5 = Noon, 0.75 = Dusk, 0.0/1.0 = Midnight)
        const isDay = normalizedTime > 0.25 && normalizedTime < 0.75;
        const celColor = config.celestial?.color ?? this.lerpColor(k1.celestialColor, k2.celestialColor, alpha);
        
        const celRadiusSun = (config.celestial?.type === CelestialType.SUN && config.celestial?.radius !== undefined)
            ? config.celestial.radius
            : 25;
        const celRadiusMoon = (config.celestial?.type === CelestialType.MOON && config.celestial?.radius !== undefined)
            ? config.celestial.radius
            : 18;

        _c1.setHex(celColor);

        // Calculate continuous orbital angles (opposite trajectories with 180 phase drift)
        const angleSun = (normalizedTime * PI2) - PI05;
        const angleMoon = angleSun + Math.PI;

        const sinSun = Math.sin(angleSun);
        const sinMoon = Math.sin(angleMoon);

        // Fade range near horizon: 0.15 is about 8.6 degrees above horizon
        let sunOpacity = Math.max(0, Math.min(1, sinSun / 0.15));
        let moonOpacity = Math.max(0, Math.min(1, sinMoon / 0.15));

        // Respect explicit celestial type override from config if defined
        if (config.celestial?.type !== undefined) {
            if (config.celestial.type === CelestialType.SUN) {
                moonOpacity = 0.0;
            } else {
                sunOpacity = 0.0;
            }
        }

        // Apply orbital coordinates or check for static overrides
        let refX = 0;
        let refY = 150;
        let refZ = -300;
        const hasStaticPos = !!(config.celestial?.position);

        if (hasStaticPos) {
            refX = config.celestial.position!.x;
            refY = config.celestial.position!.y;
            refZ = config.celestial.position!.z;
        }

        const orbitDist = config.celestial?.distance || (hasStaticPos ? 180 : 200);

        if (hasStaticPos && this.timeScale === 0) {
            const celType = config.celestial?.type ?? (isDay ? CelestialType.SUN : CelestialType.MOON);
            if (celType === CelestialType.SUN) {
                this.sunGroup.position.set(refX, refY, refZ);
                sunOpacity = 1.0;
                moonOpacity = 0.0;
            } else {
                this.moonGroup.position.set(refX, refY, refZ);
                moonOpacity = 1.0;
                sunOpacity = 0.0;
            }
        } else {
            // Standard continuous, dual orbits
            const swingSunX = Math.cos(angleSun) * orbitDist;
            const swingSunY = Math.sin(angleSun) * refY;
            this.sunGroup.position.set(refX + swingSunX, swingSunY, refZ);

            const swingMoonX = Math.cos(angleMoon) * orbitDist;
            const swingMoonY = Math.sin(angleMoon) * refY;
            this.moonGroup.position.set(refX + swingMoonX, swingMoonY, refZ);
        }

        // Apply visual properties (colors, opacities, and halo sizes dynamically)
        if (sunOpacity > 0) {
            this.sunGroup.visible = true;
            this.sunMaterial.color.copy(_c1);
            this.sunMaterial.opacity = sunOpacity;
            this.sunMesh.scale.setScalar(celRadiusSun * (0.8 + 0.2 * sunOpacity));

            this.sunHaloMaterial.color.copy(_c1);
            this.sunHaloMaterial.opacity = 0.5 * sunOpacity;
            const sunHScale = celRadiusSun * 12 * (0.5 + 0.5 * sunOpacity);
            this.sunHalo.scale.set(sunHScale, sunHScale, 1);
        } else {
            this.sunGroup.visible = false;
        }

        if (moonOpacity > 0) {
            this.moonGroup.visible = true;
            this.moonMaterial.color.copy(_c1);
            this.moonMaterial.opacity = moonOpacity;
            this.moonMesh.scale.setScalar(celRadiusMoon * (0.8 + 0.2 * moonOpacity));

            this.moonHaloMaterial.color.copy(_c1);
            this.moonHaloMaterial.opacity = 0.8 * moonOpacity;
            const moonHScale = celRadiusMoon * 6 * (0.5 + 0.5 * moonOpacity);
            this.moonHalo.scale.set(moonHScale, moonHScale, 1);
        } else {
            this.moonGroup.visible = false;
        }

        // 5. DIRECTIONAL LIGHTING (Physical Shadow Caster tracking dominant body)
        const lightCfg = config.light;
        const litColor = lightCfg?.color ?? this.lerpColor(k1.lightColor, k2.lightColor, alpha);

        if (lightCfg?.visible === false) {
            this.skyLight.visible = false;
            this.skyLight.intensity = 0;
        } else {
            this.skyLight.visible = true;
            const litIntensity = lightCfg?.intensity ?? this.lerpScalar(k1.lightIntensity, k2.lightIntensity, alpha);

            // Determine dominant celestial body above the horizon
            const isSunDominant = (sunOpacity >= moonOpacity);
            const dominantGroup = isSunDominant ? this.sunGroup : this.moonGroup;
            const dominantAngle = isSunDominant ? angleSun : angleMoon;

            // Smooth horizon fade to prevent shadow popping/glitches as dominant body sets
            const horizonFade = Math.pow(Math.max(0, Math.min(1, Math.sin(dominantAngle))), 2.0);

            this.skyLight.castShadow = lightCfg?.castShadow ?? true;
            _c1.setHex(litColor);
            this.skyLight.color.copy(_c1);
            this.skyLight.intensity = litIntensity * horizonFade;

            // Align physical rays securely to the dominant body position
            this.skyLight.position.copy(dominantGroup.position);
        }

        // 6. STAR FIELD TELEMETRY
        const celType = config.celestial?.type ?? (isDay ? CelestialType.SUN : CelestialType.MOON);
        const targetStars = config.stars ?? (celType === CelestialType.MOON ? 1500 : 0);
        this.starSystem.visible = targetStars > 0;
        if (this.starSystem.visible) {
            this.starSystem.geometry.setDrawRange(0, targetStars);

            // Smooth starfield fading aligned with mathematical dawn/dusk transitions
            let starOpacity = 0.0;
            if (normalizedTime >= 0.75) {
                // Fade in early over a 0.10 timeline window starting at dusk (0.75 to 0.85)
                starOpacity = Math.max(0.0, Math.min(1.0, (normalizedTime - 0.75) / 0.10));
            } else if (normalizedTime <= 0.25) {
                // Fade out late over a 0.10 timeline window leading to dawn (0.15 to 0.25)
                starOpacity = Math.max(0.0, Math.min(1.0, (0.25 - normalizedTime) / 0.10));
            }
            (this.starSystem.material as THREE.ShaderMaterial).uniforms.uOpacity.value = starOpacity;
        }

        // 7. DYNAMIC CLOUD TINTING & OPACITY
        const cloudCfg = config.clouds;
        const cloudColorHex = cloudCfg?.color ?? this.lerpColor(this.currentAtmosphereColor, litColor, 0.4);
        _c1.setHex(cloudColorHex);
        const cloudBaseOpacity = cloudCfg?.opacity ?? (isDay ? 0.45 : 0.22);

        for (let i = 0; i < this.clouds.length; i++) {
            const cloud = this.clouds[i];
            if (!cloud.visible) continue;

            const mat = cloud.material;
            mat.color.copy(_c1);
            mat.opacity = cloudBaseOpacity;
        }
    }

    private lerpColor(c1: number, c2: number, alpha: number): number {
        _c1.setHex(c1);
        _c2.setHex(c2);
        _c1.lerp(_c2, alpha);
        return _c1.getHex();
    }

    private lerpScalar(s1: number, s2: number, alpha: number): number {
        return s1 + (s2 - s1) * alpha;
    }

    public reAttach(newScene: THREE.Scene): void {
        this.currentScene = newScene;
        newScene.add(this.root);
    }

    public clear(): void {
        if (this.sunMaterial) this.sunMaterial.dispose();
        if (this.sunHaloMaterial) this.sunHaloMaterial.dispose();
        if (this.moonMaterial) this.moonMaterial.dispose();
        if (this.moonHaloMaterial) this.moonHaloMaterial.dispose();
    }

}