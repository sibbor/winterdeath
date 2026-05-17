import * as THREE from 'three';
import { System, SystemID } from './System';
import { MATERIALS, GEOMETRY } from '../utils/assets';
import { GroundType } from '../core/engine/EngineTypes';
import { MaterialType } from '../content/environment';

/**
 * GroundSystem: Manages visual terrain and infinite ground plane.
 * Acts as the high-level API proxy for world height and materials.
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

    constructor() {
        // Initialize Infinite Ground Plane
        // FIXED: Using 'plane' instead of 'infinitePlane' to match GEOMETRY definitions
        this.groundPlane = new THREE.Mesh(GEOMETRY.plane, MATERIALS.snow);
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
    }

    /**
     * High-level API Proxy for Ground Height.
     * Gameplay systems call this instead of WorldStreamer directly.
     */
    public getGroundHeight(x: number, z: number, session: any): number {
        // 1. Check for WaterSystem bed-height override
        if (session.engine.water) {
            session.engine.water.checkBuoyancy(x, 0, z, session.state.renderTime);
            if (session.engine.water.getBuoyancyResult().inWater) {
                return session.engine.water.getBuoyancyResult().groundY;
            }
        }

        // 2. Fallback to WorldStreamer (Authority for non-liquid terrain)
        return session.state.worldStreamer ? session.state.worldStreamer.getGroundHeight(x, z) : 0;
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
     * Syncs ground material and color blending.
     */
    public sync(type: GroundType, fogColor: THREE.Color): void {
        // FIXED: Using correct material names from MATERIALS registry
        if (type === GroundType.SNOW) {
            this.groundPlane.material = MATERIALS.snow;
            this.defaultMaterial = MaterialType.SNOW;
        } else if (type === GroundType.DIRT) {
            this.groundPlane.material = MATERIALS.dirt;
            this.defaultMaterial = MaterialType.DIRT;
        } else if (type === GroundType.GRAVEL) {
            this.groundPlane.material = MATERIALS.gravel;
            this.defaultMaterial = MaterialType.GRAVEL;
        } else if (type === GroundType.ASPHALT) {
            this.groundPlane.material = MATERIALS.asphalt;
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

        const playerPos = context.playerPos || (context.state?.playerPos);
        if (!playerPos) return;

        // Move the infinite ground plane to stay centered on the player (Visual Illusion)
        this.groundPlane.position.x = playerPos.x;
        this.groundPlane.position.z = playerPos.z;
    }
}
