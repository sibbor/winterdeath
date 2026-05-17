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
    private celestialGroup!: THREE.Group;
    private celestialMesh!: THREE.Mesh;
    private haloSprite!: THREE.Sprite;
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

        // 2. CELESTIAL BODY
        this.celestialGroup = new THREE.Group();

        this.celestialMesh = new THREE.Mesh(GEOMETRY.celestialBody, MATERIALS_SKY.moon);
        this.celestialMesh.frustumCulled = false;
        this.celestialMesh.userData.isEngineStatic = true;
        this.celestialGroup.add(this.celestialMesh);

        this.haloSprite = new THREE.Sprite(MATERIALS_SKY.moonHalo);
        this.haloSprite.position.set(0, 0, 10);
        this.haloSprite.userData.isEngineStatic = true;
        this.celestialGroup.add(this.haloSprite);

        this.root.add(this.celestialGroup);

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

        // 5. HEMISPHERE LIGHT (Authoritative ambient source)
        const hemi = new THREE.HemisphereLight(0xeeeeff, 0x111122, 0.5);
        hemi.name = SKY_SYSTEM.HEMI_LIGHT;
        this.root.add(hemi);

        // 6. PROCEDURAL CLOUDS POOL (Zero-GC, canvas-based sprites)
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

    /** * Returns allocation-free world-space vector of the celestial body.
     */
    public getCelestialPosition(): THREE.Vector3 {
        this.celestialGroup.getWorldPosition(_v1);
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
        // 0.25 = Dawn, 0.5 = Noon, 0.75 = Dusk, 0.0/1.0 = Midnight
        const isDay = normalizedTime > 0.25 && normalizedTime < 0.75;
        const celType = config.celestial?.type ?? (isDay ? CelestialType.SUN : CelestialType.MOON);
        const celColor = config.celestial?.color ?? this.lerpColor(k1.celestialColor, k2.celestialColor, alpha);
        const celRadius = config.celestial?.radius ?? (celType === CelestialType.SUN ? 25 : 18);

        _c1.setHex(celColor);

        // O(1) direct material pointer swap mapping
        if (celType === CelestialType.SUN) {
            this.celestialMesh.material = MATERIALS_SKY.sun;
            this.haloSprite.material.opacity = 0.5;
            const hScale = celRadius * 12;
            this.haloSprite.scale.set(hScale, hScale, 1);
        } else {
            this.celestialMesh.material = MATERIALS_SKY.moon;
            this.haloSprite.material.opacity = 0.8;
            const hScale = celRadius * 6;
            this.haloSprite.scale.set(hScale, hScale, 1);
        }

        (this.celestialMesh.material as THREE.MeshBasicMaterial).color.copy(_c1);
        this.celestialMesh.scale.setScalar(celRadius);
        this.haloSprite.material.color.copy(_c1);

        // Apply masking coordinates or compute dynamic orbit trajectory passing through reference position
        let refX = 0;
        let refY = 150;
        let refZ = -300;
        const hasStaticPos = !!(config.celestial?.position);

        if (hasStaticPos) {
            refX = config.celestial.position.x;
            refY = config.celestial.position.y;
            refZ = config.celestial.position.z;
        }

        // Standard orbit: Peak at 0.5 (Noon), Horizon at 0.25/0.75
        let angle = (normalizedTime * PI2) - PI05;

        // For the Moon (Midnight), we invert the angle logic so it peaks at 0.0
        if (!isDay) {
            angle += Math.PI; // Flip 180 degrees
        }

        if (config.celestial?.position && this.timeScale === 0) {
            this.celestialGroup.position.set(refX, refY, refZ);
        } else {
            const orbitDist = config.celestial?.distance || (hasStaticPos ? 180 : 200);

            const swingX = Math.cos(angle) * orbitDist;
            const swingY = Math.abs(Math.sin(angle)) * refY;

            this.celestialGroup.position.set(
                refX + swingX,
                swingY,
                refZ
            );
        }

        // 5. DIRECTIONAL LIGHTING (Physical Shadow Caster)
        const lightCfg = config.light;
        if (lightCfg?.visible === false) {
            this.skyLight.visible = false;
            this.skyLight.intensity = 0;
        } else {
            this.skyLight.visible = true;
            const litColor = lightCfg?.color ?? this.lerpColor(k1.lightColor, k2.lightColor, alpha);
            const litIntensity = lightCfg?.intensity ?? this.lerpScalar(k1.lightIntensity, k2.lightIntensity, alpha);

            // Horizon fade to prevent sharp shadow popping/glitches as light dips to horizon
            const horizonFade = Math.pow(Math.max(0, Math.min(1, Math.sin(angle))), 2.0);

            this.skyLight.castShadow = lightCfg?.castShadow ?? true;
            _c1.setHex(litColor);
            this.skyLight.color.copy(_c1);
            this.skyLight.intensity = litIntensity * horizonFade;

            // Align physical rays securely to the Single Source of Truth
            this.skyLight.position.copy(this.celestialGroup.position);
        }

        // 6. STAR FIELD TELEMETRY
        const targetStars = config.stars ?? (celType === CelestialType.MOON ? 1500 : 0);
        this.starSystem.visible = targetStars > 0;
        if (this.starSystem.visible) {
            this.starSystem.geometry.setDrawRange(0, targetStars);

            // Smooth starfield fading based on timeline
            let starOpacity = 0.0;
            if (normalizedTime > 0.8) {
                starOpacity = (normalizedTime - 0.8) / 0.2;
            } else if (normalizedTime < 0.2) {
                starOpacity = 1.0 - (normalizedTime / 0.2);
            }
            (this.starSystem.material as THREE.ShaderMaterial).uniforms.uOpacity.value = starOpacity;

            // Remove redundant/snapping static Y-axis assignment to let the continuous,
            // smooth 3D axial drift (rotateOnAxis inside update()) drive the stars without snaps.
        }

        // 7. DYNAMIC CLOUD TINTING & OPACITY
        const cloudCfg = config.clouds;
        const cloudColorHex = cloudCfg?.color ?? this.lerpColor(k1.atmosphereColor, k2.lightColor, 0.4);
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

    public clear(): void { }
}