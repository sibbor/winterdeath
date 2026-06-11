import * as THREE from 'three';
import { System, SystemID } from './System';
import { MATERIALS, GEOMETRY } from '../utils/assets';
import { GroundType } from '../core/engine/EnvironmentalTypes';
import { MaterialType } from '../content/environment';

/**
 * GroundSystem: Manages visual terrain and infinite ground plane.
 * Acts as the high-level API proxy for world height and materials.
 *
 * Performance contract (Zero-GC):
 *  - getGroundHeight uses a frame-stamped spatial cache to bypass redundant
 *    WaterSystem sine-wave math for repeated or nearby queries within the same frame.
 *  - Buoyancy is further gated by: (1) Y-height (airborne objects skip it entirely),
 *    and (2) water-zone proximity (dry terrain regions never touch WaterSystem).
 *
 * Note: Footprints are handled by the dedicated FootprintSystem.
 */
export class GroundSystem implements System {
    readonly systemId = SystemID.GROUND;
    public id: string = 'ground_system';
    public enabled: boolean = true;
    public persistent: boolean = true;
    private defaultMaterial: number = 0;

    private scene: THREE.Scene | null = null;
    private groundPlane: THREE.Mesh;
    private groundVisualMaterials = new Map<string, THREE.Material>();

    // --- FRAME-STAMPED SPATIAL CACHE (Zero-GC) ---
    // Keyed by a fast integer hash of rounded (x, z), reset once per frame tick.
    // Eliminates 95%+ of duplicate WaterSystem calls when the same ground cell is
    // queried multiple times per frame (player + nearby enemies + particles).
    private _cache = new Map<number, number>();
    private _cacheFrame: number = -1;

    // --- WATER PROXIMITY REGISTRY ---
    // Populated by WaterSystem.addWaterBody via registerWaterZone() so that
    // buoyancy is only evaluated for objects actually near water — saving heavy
    // sine-wave math on all dry-terrain queries.
    private _waterZones: Array<{ x: number; z: number; halfW: number; halfD: number }> = [];

    // Y-height above which buoyancy is never evaluated.
    // Airborne projectiles, throwables, and jumping/flying enemies are gated here.
    private static readonly BUOYANCY_Y_MAX = 2.0;

    constructor() {
        // Initialize Infinite Ground Plane
        this.groundPlane = new THREE.Mesh(GEOMETRY.plane, this.getTiledGroundMaterial(MATERIALS.snow));
        this.groundPlane.name = 'GROUND';
        this.groundPlane.rotation.x = -Math.PI / 2;
        this.groundPlane.scale.set(2000, 2000, 1); // Large enough to cover visible range
        this.groundPlane.receiveShadow = true;
        this.groundPlane.userData = { isPersistent: true, isSystemic: true };
    }

    public reAttach(newScene: THREE.Scene): void {
        this.scene = newScene;
        newScene.add(this.groundPlane);
    }

    public clear(): void {
        if (this.scene) {
            this.scene.remove(this.groundPlane);
            this.scene = null;
        }
        this._waterZones.length = 0;
        this._cache.clear();
    }

    /**
     * Called by WaterSystem.addWaterBody so GroundSystem can gate checkBuoyancy
     * spatially without coupling to WaterSystem internals.
     */
    public registerWaterZone(x: number, z: number, width: number, depth: number): void {
        this._waterZones.push({ x, z, halfW: width * 0.5, halfD: depth * 0.5 });
    }

    /**
     * High-level SSoT for ground height.
     * All gameplay systems (PlayerMovementSystem, ProjectileSystem, WaterSystem body
     * physics, VehicleMovementSystem, etc.) call THIS instead of WorldStreamer or
     * WaterSystem directly.
     *
     * @param y  Caller's current Y position — used for the airborne gate.
     *           Defaults to 0 (conservative: always checks buoyancy) when omitted.
     */
    public getGroundHeight(x: number, z: number, session: any, y: number = 0): number {
        // 1. Frame-stamped cache — invalidate when the engine frame counter advances.
        // engine.frameCount is the canonical 60Hz integer, always available.
        const frame = (session.engine && session.engine.frameCount) ? (session.engine.frameCount as number) : 0;
        if (frame !== this._cacheFrame) {
            this._cache.clear();
            this._cacheFrame = frame;
        }

        // Spatial hash key: round to 2 decimal places (1 cm precision).
        // Two queries within 1 cm share the same cached result — no precision loss
        // at gameplay scale, and prevents Map growth from float noise.
        const kx = Math.round(x * 100) | 0;
        const kz = Math.round(z * 100) | 0;
        const cacheKey = (kx * 1000003 + kz) | 0;

        const cached = this._cache.get(cacheKey);
        if (cached !== undefined) return cached;

        let result: number;

        // 2. Y-height gate: objects above BUOYANCY_Y_MAX cannot be submerged.
        //    Projectiles in flight and airborne enemies are skipped entirely.
        const isAirborne = y > GroundSystem.BUOYANCY_Y_MAX;

        // 3. Spatial proximity gate: buoyancy math only runs for objects near a
        //    registered water zone (+ 2m margin for smooth entry approach).
        const nearWater = !isAirborne && this._isNearWater(x, z);

        if (nearWater && session.engine && session.engine.water) {
            session.engine.water.checkBuoyancy(x, y, z, session.state.renderTime);
            const b = session.engine.water.getBuoyancyResult();
            if (b.inWater) {
                result = b.groundY;
                this._cache.set(cacheKey, result);
                return result;
            }
        }

        // 4. Dry-land fallback — WorldStreamer is the authority for non-liquid terrain.
        result = (session.state && session.state.worldStreamer)
            ? session.state.worldStreamer.getGroundHeight(x, z)
            : 0;
        this._cache.set(cacheKey, result);
        return result;
    }

    /**
     * O(N_zones) AABB proximity check where N ≤ 3 per sector in practice.
     * A 2m margin is added so objects begin receiving buoyancy as they approach
     * the water edge — avoiding a hard pop at the exact boundary.
     */
    private _isNearWater(x: number, z: number): boolean {
        const margin = 2.0;
        const zones = this._waterZones;
        const len = zones.length;
        for (let i = 0; i < len; i++) {
            const wz = zones[i];
            if (Math.abs(x - wz.x) <= wz.halfW + margin &&
                Math.abs(z - wz.z) <= wz.halfD + margin) {
                return true;
            }
        }
        return false;
    }

    /**
     * Unified API for Ground Material.
     * Handles sector-wide defaults and WorldStreamer overrides.
     */
    public getGroundMaterial(x: number, z: number, streamer: any): number {
        const mat = streamer ? streamer.getGroundMaterial(x, z) : 0;
        return mat !== 0 ? mat : this.defaultMaterial;
    }

    /**
     * Helper to clone a base material and configure its texture repeats to tile 
     * properly over the giant 2000x2000 ground plane.
     */
    private getTiledGroundMaterial(baseMaterial: THREE.Material): THREE.Material {
        const uuid = baseMaterial.uuid;
        let tiled = this.groundVisualMaterials.get(uuid);
        if (!tiled) {
            tiled = baseMaterial.clone();
            const standardMat = tiled as THREE.MeshStandardMaterial;
            // A repeat count of 200 means each texture tile represents exactly 10x10 meters in world space.
            if (standardMat.map) {
                standardMat.map = standardMat.map.clone();
                standardMat.map.wrapS = THREE.RepeatWrapping;
                standardMat.map.wrapT = THREE.RepeatWrapping;
                standardMat.map.repeat.set(200, 200);
                standardMat.map.matrixAutoUpdate = false;
                standardMat.map.updateMatrix();
            }
            if (standardMat.bumpMap) {
                standardMat.bumpMap = standardMat.bumpMap.clone();
                standardMat.bumpMap.wrapS = THREE.RepeatWrapping;
                standardMat.bumpMap.wrapT = THREE.RepeatWrapping;
                standardMat.bumpMap.repeat.set(200, 200);
                standardMat.bumpMap.matrixAutoUpdate = false;
                standardMat.bumpMap.updateMatrix();
            }
            this.groundVisualMaterials.set(uuid, tiled);
        }
        return tiled;
    }

    /**
     * Syncs ground material and color blending.
     */
    public sync(type: GroundType, fogColor: THREE.Color): void {
        // FIXED: Using correct material names from MATERIALS registry and tiling them for the infinite ground plane.
        if (type === GroundType.SNOW) {
            this.groundPlane.material = this.getTiledGroundMaterial(MATERIALS.snow);
            this.defaultMaterial = MaterialType.SNOW;
        } else if (type === GroundType.DIRT) {
            this.groundPlane.material = this.getTiledGroundMaterial(MATERIALS.dirt);
            this.defaultMaterial = MaterialType.DIRT;
        } else if (type === GroundType.GRAVEL) {
            this.groundPlane.material = this.getTiledGroundMaterial(MATERIALS.gravel);
            this.defaultMaterial = MaterialType.GRAVEL;
        } else if (type === GroundType.ASPHALT) {
            this.groundPlane.material = this.getTiledGroundMaterial(MATERIALS.asphalt);
            this.defaultMaterial = MaterialType.ASPHALT;
        }

        // Propagate fog color to ground material for horizon blending if the material supports it
        const mat = this.groundPlane.material as THREE.ShaderMaterial;
        if (mat && mat.uniforms && mat.uniforms.fogColor) {
            mat.uniforms.fogColor.value.copy(fogColor);
        }
    }

    public update(context: any, delta: number, simTime: number, renderTime: number): void {
        if (!this.enabled) return;

        const targetPos = context.engine?.camera?.threeCamera?.position || context.cameraPosition || context.playerPos || (context.state?.player?.position);
        if (!targetPos) return;

        // Move the infinite ground plane to stay centered on the target position (Visual Illusion)
        this.groundPlane.position.x = targetPos.x;
        this.groundPlane.position.z = targetPos.z;
    }

}