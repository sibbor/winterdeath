import * as THREE from 'three';
import { System, SystemID } from './System';
import { SkySystem } from './SkySystem';
import { FogSystem } from './FogSystem';
import { WeatherSystem } from './WeatherSystem';
import { WaterSystem } from './WaterSystem';
import { LightSystem } from './LightSystem';
import { WindSystem } from './WindSystem';
import { GroundSystem } from './GroundSystem';
import { SectorEnvironment } from '../core/engine/EngineTypes';

// --- ZERO-GC SCRATCHPADS ---
const _c1 = new THREE.Color();
const _sharedBackground = new THREE.Color();

/**
 * EnvironmentManager: The "Conductor" of the Vinterdöd atmosphere.
 * Orchestrates all atmospheric sub-systems and ensures safe scene transitions.
 */
export class EnvironmentManager implements System {
    readonly systemId = SystemID.ENVIRONMENT_MANAGER;
    public id: string = 'env_manager';
    public enabled: boolean = true;
    public persistent: boolean = true;

    // Sub-System References
    private sky: SkySystem;
    private fog: FogSystem;
    private weather: WeatherSystem;
    private water: WaterSystem;
    private light: LightSystem;
    private wind: WindSystem;
    private ground: GroundSystem;

    private lastScene: THREE.Scene | null = null;

    constructor(
        sky: SkySystem,
        fog: FogSystem,
        weather: WeatherSystem,
        water: WaterSystem,
        light: LightSystem,
        wind: WindSystem,
        ground: GroundSystem
    ) {
        this.sky = sky;
        this.fog = fog;
        this.weather = weather;
        this.water = water;
        this.light = light;
        this.wind = wind;
        this.ground = ground;
    }

    /**
     * Unifies the synchronization of all environmental systems.
     * Called during scene mounting (Camp or Sector).
     */
    public sync(env: SectorEnvironment | any, groundType: number = 0, targetScene?: THREE.Scene, isWarmup: boolean = false) {
        const scene = targetScene || this.lastScene;
        if (!scene) return;
        this.lastScene = scene;

        // 1. Scene Graph Attachment
        if (!isWarmup) {
            this.reAttach(scene);
        }

        // 2. Sky System (Sun/Moon/Dynamic)
        if (env.sky) {
            this.sky.sync(env.sky);
        }

        // 3. Fog System (Volumetric/Distance)
        const fogColor = env.fog?.color ?? env.bgColor ?? 0x000000;
        const fogDensity = env.fog?.density ?? 0;
        const fogHeight = env.fog?.height ?? 0;
        _c1.setHex(fogColor);
        this.fog.sync(fogDensity, fogHeight, _c1);

        // 4. Weather System (Snow/Rain)
        if (env.weather) {
            const count = env.weather.particles ?? env.weather.count ?? 0;
            this.weather.sync(env.weather.type, count, env.weather.areaSize || 100);
        }

        // 5. Ground System (Infinite Plane/Materials)
        this.ground.sync(groundType, _c1);

        // 6. Water System (Lakes/Buoyancy/Vegetation)
        // [VINTERDÖD] Water bodies are registered during sector building; 
        // they are persistent and re-attached via the environment.reAttach() call.

        // 7. Wind System (Global force)
        if (env.wind !== undefined) {
            this.wind.sync(
                env.wind.strengthMin || 0.01,
                env.wind.strengthMax || env.wind.speed || 0.05,
                env.wind.baseAngle || env.wind.direction?.x || 0.0,
                env.wind.angleVariance || Math.PI
            );
        } else if (env.windSpeed !== undefined) {
            this.wind.sync(env.windSpeed * 0.5, env.windSpeed);
        }

        // 8. Sky System
        if (env.sky) {
            this.sky.sync(env.sky);
        }

        // 10. Inter-System Wiring
        if (this.water && this.sky) {
            this.water.setLightPosition(this.sky.getCelestialPosition());
        }
    }

    /**
     * Re-attaches all environmental sub-systems to a new scene graph.
     */
    public reAttach(scene: THREE.Scene) {
        this.lastScene = scene;
        this.sky.reAttach(scene);
        this.fog.reAttach(scene);
        this.weather.reAttach(scene);
        this.water.reAttach(scene);
        this.light.reAttach(scene);
        this.ground.reAttach(scene);
    }

    /**
     * Authoritative cleanup of environmental state.
     */
    public clear() {
        this.sky.clear();
        this.fog.clear();
        this.weather.clear();
        this.water.clear();
        this.light.clear();
        this.wind.clear();
        this.ground.clear();
    }

    public update(context: any, delta: number, simTime: number, renderTime: number): void {
        if (!this.enabled) return;

        // Environmental systems are passive (query-only) in the fixed-step loop.
        // We only tick them here during the variable render loop.
        this.sky.update(context, delta, simTime, renderTime);

        // Dynamically drive fog color from live sky atmosphere every frame.
        // NOTE: SkySystem already owns scene.background via pointer assignment in processProcedural;
        // copying it here would be a redundant self-copy. Only fog needs manual sync.
        const scene = this.lastScene;
        if (scene) {
            _c1.copy(this.sky.currentAtmosphereColor);

            // FogExp2 baseline color tracks the atmosphere
            if (scene.fog && (scene.fog as THREE.FogExp2).isFogExp2) {
                (scene.fog as THREE.FogExp2).color.copy(_c1);
            }

            // Volumetric fog shader color — via cached uniform pointer, no property chain overhead
            this.fog.setVolumetricColor(_c1);
        }

        this.fog.update(context, delta, simTime, renderTime);
        this.weather.update(context, delta, simTime, renderTime);
        this.water.update(context, delta, simTime, renderTime);
        this.light.update(context, delta, simTime, renderTime);
        this.wind.update(context, delta, simTime, renderTime);
        this.ground.update(context, delta, simTime, renderTime);
    }
}