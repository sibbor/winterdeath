import * as THREE from 'three';
import { System, SystemID } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { SectorDef, SectorID } from '../game/session/SectorTypes';
import { EnemyManager } from '../entities/enemies/EnemyManager';
import { EnemyType, NoiseType } from '../entities/enemies/EnemyTypes';
import { SKY_SYSTEM } from '../content/constants';
import { InteractionType } from './ui/UIEventBridge';
import { FXParticleType } from '../types/FXTypes';
import { ToneType, SoundID } from '../utils/audio/AudioTypes';
import { TargetEnvironment, WeatherType } from '../core/engine/EngineTypes';
import { isPointInPolygon } from '../utils/math/GeometryUtils';
import { DamageType, DamageID, EnemyAttackType } from '../entities/player/CombatTypes';
import { StatusEffectID } from '../types/StatusEffects';

/**
 * Dynamic Sector Registry
 * Prevents all sectors from being initialized at startup.
 */
const SECTOR_LOADERS: Record<SectorID, () => Promise<any>> = {
    [SectorID.VILLAGE]: () => import('../content/sectors/Sector0'),
    [SectorID.MOUNTAIN_VAULT]: () => import('../content/sectors/Sector1'),
    [SectorID.MAST]: () => import('../content/sectors/Sector2'),
    [SectorID.SCRAPYARD]: () => import('../content/sectors/Sector3'),
    [SectorID.PLAYGROUND]: () => import('../content/sectors/Sector4'),
};

const OSC_MAP: Record<ToneType, OscillatorType> = {
    [ToneType.SINE]: 'sine',
    [ToneType.SQUARE]: 'square',
    [ToneType.SAWTOOTH]: 'sawtooth',
    [ToneType.TRIANGLE]: 'triangle'
};

const SECTOR_CACHE: Record<number, SectorDef> = {};

// Fallback for components that still expect a synchronous SECTORS object.
// These will return undefined if not pre-loaded via SectorSystem.loadSector().
export const SECTORS: Record<number, SectorDef> = new Proxy({}, {
    get: (_, property) => SECTOR_CACHE[Number(property)]
}) as any;

// --- ATMOSPHERE SCRATCHPADS (Zero-GC) ---
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
const _targetEnv: TargetEnvironment = {
    fogColor: 0, fogDensity: 0, groundColor: 0,
    weatherType: WeatherType.NONE, weatherDensity: 0, windStrength: 0,
    ambient: 1.0, maxWeight: 0
};
const _sharedBackground = new THREE.Color();

export class SectorSystem implements System {
    readonly systemId = SystemID.SECTOR;
    id = 'sector_system';
    enabled = true;
    persistent = false;

    // --- INTERPOLATED STATE (Persistent for Smoothing) ---
    private _targetEnv: TargetEnvironment = { ..._targetEnv };
    private _currFogColor = new THREE.Color();
    private _currFogDensity = 0;
    private _currGroundColor = new THREE.Color();
    private _currWeatherType = WeatherType.NONE;
    private _currWeatherCount = 0;
    private _currWindMax = 0.5;
    private _currAmbient = 1.0;
    private _initialized = false;
    private _lastSectorId = -1;
    private currentSector: SectorDef;
    private lastChimeTime = 0;
    private waterInitialized = false;

    // Cache the event object and context to strictly prevent garbage collection overhead during the 60fps loop
    private cachedEvents: any = null;

    // --- SCENE CACHE (Avoids traversal in 60fps loop) ---
    private _cachedGround: THREE.Mesh | null = null;

    // --- ENVIRONMENT QUERY THROTTLE ---
    // Skip WorldStreamer query if player hasn't moved >1m since last check.
    private _lastEnvQueryX = Infinity;
    private _lastEnvQueryZ = Infinity;
    private _lastEnvPoolIdx = 0;
    private _lastEnvCount = 0;
    private _lastEnvIndices = new Int32Array(64);

    constructor(
        private playerGroup: THREE.Group,
        sectorId: number,
        private callbacks: {
            setBubble: (text: string, duration?: number) => void;
            t: (key: string) => string;
            spawnParticle: (x: number, y: number, z: number, type: FXParticleType, count: number, mesh?: any, vel?: any, color?: number, scale?: number, life?: number) => void;
            startCinematic: (target?: THREE.Object3D | null, sectorId?: number, dialogueId?: number, params?: any) => void;
            setInteraction: (interaction: any | null) => void;
            playSound: (id: SoundID) => void;
            playTone: (freq: number, type: ToneType, duration: number, vol?: number) => void;
            cameraShake: (amount: number) => void;
            scene: THREE.Scene;
            setCameraOverride: (params: any | null) => void;
            makeNoise: (pos: THREE.Vector3, type: NoiseType, radius: number) => void;
            spawnZombie: (type: EnemyType, pos?: THREE.Vector3) => void;
            spawnHorde: (count: number, type?: EnemyType, pos?: THREE.Vector3) => void;
            setOverlay: (type: number | null) => void;
            onAction: (action: any) => void;
            gainXp: (amount: number) => void;
            gainSp: (amount: number) => void;
            gainScrap: (amount: number) => void;
            onDiscovery?: (type: any, id: string, titleKey: string, detailsKey: string, payload?: any) => boolean;
            onPlayerHit: (damage: number, attacker: any, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => void;
            applyDamage: (enemy: any, amount: number, damageType: DamageType, damageSource: DamageID, isHighImpact?: boolean) => boolean;
        }
    ) {
        this.currentSector = SectorSystem.getSector(sectorId);
    }

    /**
     * Asynchronously loads a sector definition into the cache.
     * Must be called before creating the SectorSystem or accessing SECTORS[id].
     */
    static async loadSector(sectorId: number): Promise<SectorDef> {
        if (SECTOR_CACHE[sectorId]) return SECTOR_CACHE[sectorId];

        const loader = SECTOR_LOADERS[sectorId];
        if (!loader) throw new Error(`[SectorSystem] Unknown sector ID: ${sectorId}`);

        const module = await loader();
        // Sectors are exported as 'Sector0', 'Sector1', etc.
        const sector = module[`Sector${sectorId}`] || module.default || module.Sector;

        if (!sector) throw new Error(`[SectorSystem] Failed to find SectorDef in module for sector ${sectorId}`);

        SECTOR_CACHE[sectorId] = sector;
        return sector;
    }

    static getSector(sectorId: number) {
        return SECTOR_CACHE[sectorId];
    }

    update(session: GameSessionLogic, dt: number, simTime: number, renderTime: number) {
        const state = session.state;
        const scene = session.engine.scene;
        const pPos = this.playerGroup.position;

        if (!this.waterInitialized && session.engine.water) {
            session.engine.water.setPlayerRef(this.playerGroup);
            session.engine.water.setCallbacks({
                spawnParticle: this.callbacks.spawnParticle,
                makeNoise: this.callbacks.makeNoise
            });
            this.waterInitialized = true;
        }

        // 1. Optimized Proximity Check (Zero-GC)
        if (simTime - this.lastChimeTime > 2500) {
            const items = state.mapItems;
            const itemsLen = items.length;
            for (let i = 0; i < itemsLen; i++) {
                const item = items[i];
                if (item.type === 'TRIGGER' && item.id.startsWith('collectible_')) {
                    // FIX: Substring(12) safely slices off "collectible_". 
                    // V8 handles this internally as a "Sliced String" (a pointer), averting large allocations.
                    const realId = item.id.substring(12);
                    if (state.collectiblesDiscovered.includes(realId)) continue;

                    const dx = item.x - pPos.x;
                    const dz = item.z - pPos.z;
                    if (dx * dx + dz * dz < 64) {
                        this.lastChimeTime = simTime;
                        break;
                    }
                }
            }
        }

        // 2. Define Events Object (Hoisted / Zero-GC)
        if (!this.cachedEvents) {
            // Created exactly once per sector load to prevent per-frame Object instantiation
            this.cachedEvents = {
                spawnZombie: (forcedType?: EnemyType, forcedPos?: THREE.Vector3) => {
                    const newEnemy = EnemyManager.spawn(
                        scene, pPos, forcedType, forcedPos,
                        state.bossSpawned, state.enemies.length
                    );
                    if (newEnemy) state.enemies.push(newEnemy);
                },
                setBubble: this.callbacks.setBubble,
                setInteraction: this.callbacks.setInteraction,
                playSound: this.callbacks.playSound,
                playTone: this.callbacks.playTone,
                cameraShake: this.callbacks.cameraShake,
                t: this.callbacks.t,
                scene: scene,
                spawnParticle: (x: number, y: number, z: number, type: FXParticleType, count: number, scale?: number, life?: number) => this.callbacks.spawnParticle(x, y, z, type, count, undefined, undefined, undefined, scale, life),
                startCinematic: (target?: THREE.Object3D | null, sectorId?: number, dialogueId?: number, params?: any) => session.startCinematic(target, sectorId, dialogueId, params),
                setCameraOverride: this.callbacks.setCameraOverride,
                setWind: (direction: number, strength: number) => session.engine.wind.setOverride(direction, strength),
                resetWind: () => session.engine.wind.clearOverride(),
                setWindRandomized: (active: boolean) => session.engine.wind.setRandomWind(0.02, 0.05),
                setWeather: (type: any, count?: number) => session.engine.weather.sync(type, count || 100),

                // Safe Lighting Adjustments
                setLight: (params: any) => {
                    const skyLight = scene.getObjectByName(SKY_SYSTEM.SKY_LIGHT) as THREE.DirectionalLight;
                    if (skyLight) {
                        if (params.skyLightColor) skyLight.color.copy(params.skyLightColor);
                        if (params.skyLightPosition) skyLight.position.set(params.skyLightPosition.x, params.skyLightPosition.y, params.skyLightPosition.z);

                        // FIX: Zero-GC approach. We never touch 'skyLight.visible' during runtime 
                        // to prevent WebGL shader re-compilations. We manipulate intensity instead.
                        if (params.skyLightVisible !== undefined) {
                            if (params.skyLightVisible === false) {
                                skyLight.intensity = 0;
                            } else {
                                // Restore to requested intensity, or default back to 1.0
                                skyLight.intensity = params.skyLightIntensity !== undefined ? params.skyLightIntensity : 1.0;
                            }
                        } else if (params.skyLightIntensity !== undefined) {
                            skyLight.intensity = params.skyLightIntensity;
                        }
                    }

                    const hemi = scene.getObjectByName(SKY_SYSTEM.HEMI_LIGHT) as THREE.HemisphereLight;
                    if (hemi && params.skyLightIntensity !== undefined) hemi.intensity = params.skyLightIntensity;
                },

                setBackgroundColor: (color: number) => {
                    if (scene.background instanceof THREE.Color) {
                        scene.background.setHex(color);
                    } else {
                        _sharedBackground.setHex(color);
                        scene.background = _sharedBackground;
                    }
                },
                setGroundColor: (color: number) => {
                    const ground = scene.getObjectByName('GROUND') as THREE.Mesh;
                    if (ground && ground.material) (ground.material as THREE.MeshStandardMaterial).color.setHex(color);
                },
                setFOV: (fov: number) => {
                    session.engine.camera.set('fov', fov);
                },
                setFog: (density: number, height?: number, color?: THREE.Color) => {
                    session.engine.fog.sync(density, height, color);
                },
                setWater: (level?: number, waveHeight?: number) => {
                    // Future expansion: hook into engine.water for global level changes
                },
                makeNoise: (pos: THREE.Vector3, type: NoiseType, radius: number) => session.makeNoise(pos, type, radius),
                spawnHorde: (count: number, type?: EnemyType, pos?: THREE.Vector3) => {
                    if (this.callbacks.spawnHorde) {
                        this.callbacks.spawnHorde(count, type, pos);
                    } else {
                        for (let i = 0; i < count; i++) this.callbacks.spawnZombie(type || EnemyType.WALKER, pos);
                    }
                },
                setOverlay: this.callbacks.setOverlay,
                onAction: this.callbacks.onAction,
                gainXp: this.callbacks.gainXp,
                gainSp: this.callbacks.gainSp,
                gainScrap: this.callbacks.gainScrap,
                handleDiscovery: this.callbacks.onDiscovery,
                onPlayerHit: (damage: number, attacker: any, damageType: DamageType, damageSource: DamageID, isDoT: boolean = false, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => {
                    this.callbacks.onPlayerHit(damage, attacker, damageType, damageSource, isDoT, effectType, duration, intensity, specificAttackType);
                },
                applyDamage: (enemy: any, amount: number, damageType: DamageType, damageSource: DamageID, isHighImpact: boolean = false) => {
                    return this.callbacks.applyDamage(enemy, amount, damageType, damageSource, isHighImpact);
                },
            };
        }

        // Use the cached reference
        const events = this.cachedEvents;

        // 3. Process Interaction Requests
        if (state.interactionRequest.active && state.interactionRequest.type === InteractionType.SECTOR_SPECIFIC) {
            const req = state.interactionRequest;
            if (this.currentSector.onInteract) {
                this.currentSector.onInteract(req.id, req.object as THREE.Object3D, state, events);
            }
            req.active = false;
        }

        // 4. Centralized Environment Update
        this.updateEnvironment(session, pPos, dt);

        // 5. Finalize Sector Logic (Authoritative Hook)
        if (this.currentSector.onSectorUpdate) {
            this.currentSector.onSectorUpdate({
                delta: dt,
                simTime: simTime,
                renderTime: renderTime,
                playerPos: pPos,
                gameState: session.state,
                sectorState: session.state.sectorState,
                triggerSystem: session.triggerSystem,
                ctx: session.sectorCtx,
                state: session.state,
                engine: session.engine,
                worldStreamer: session.state.worldStreamer,
                scene: session.engine.scene,
                ...events
            });
        }
    }

    private updateEnvironment(session: GameSessionLogic, playerPos: THREE.Vector3, dt: number) {
        const engine = session.engine;
        const defaultEnv = this.currentSector.environment;
        const staticZones = this.currentSector.environmentalZones;
        const state = session.state;
        const sectorState = state.sectorState;
        const streamer = state.worldStreamer;

        const settings = engine.settings;
        const defaultWeatherCount = defaultEnv.weather?.particles ?? 1000;
        const defaultWindMin = defaultEnv.wind?.strengthMin ?? 0.2;
        const defaultWindMax = defaultEnv.wind?.strengthMax ?? 1.0;

        // --- Cache default environment values locally (avoids repeated optional-chain lookups) ---
        const defFogColor = defaultEnv.fog?.color ?? defaultEnv.bgColor;
        const defFogDensity = defaultEnv.fog?.density ?? 0;
        const defGroundColor = defaultEnv.groundColor ?? 0xffffff;
        const defWeatherType = defaultEnv.weather?.type ?? WeatherType.NONE;
        const defWindMax = defaultEnv.wind?.strengthMax ?? 0.5;

        // 1. Reset Target Environment to Sector Defaults (runs every frame — fast scalar writes)
        const target = this._targetEnv;
        target.fogColor = defFogColor;
        target.fogDensity = defFogDensity;
        target.groundColor = defGroundColor;
        target.weatherType = defWeatherType;
        target.weatherDensity = 1.0;
        target.windStrength = defWindMax;
        target.ambient = defaultEnv.ambient ?? 1.0;
        target.maxWeight = 0;

        // Initialize interpolated state on first run or sector change (snap — no lerp)
        if (!this._initialized || this._lastSectorId !== this.currentSector.id) {
            this._currFogColor.setHex(defFogColor);
            this._currFogDensity = defFogDensity;
            this._currGroundColor.setHex(defGroundColor);
            this._currWeatherType = defWeatherType;
            this._currWeatherCount = defaultWeatherCount;
            this._currWindMax = defWindMax;
            this._currAmbient = defaultEnv.ambient ?? 1.0;
            // Invalidate spatial cache to force first-frame query
            this._lastEnvQueryX = Infinity;
            this._lastEnvQueryZ = Infinity;
            this._lastEnvCount = 0;
            this._initialized = true;
            this._lastSectorId = this.currentSector.id;
        }

        // 2. Zone Blending Logic
        const override = sectorState.envOverride;
        if (!override && streamer && staticZones?.length) {

            // --- PHASE 2: Spatial Query Throttle ---
            // Only re-query the WorldStreamer if player has moved ≥1m since last check.
            // Logic cells are 10m wide — this is safe and eliminates ~59 of 60 queries per second
            // during stationary gameplay.
            const dqx = playerPos.x - this._lastEnvQueryX;
            const dqz = playerPos.z - this._lastEnvQueryZ;
            if (dqx * dqx + dqz * dqz >= 1.0) {
                streamer.getNearbyEnvironmentalZones(playerPos.x, playerPos.z, 2.0, 0);
                const pool = streamer.getEnvironmentalZonePool();
                this._lastEnvPoolIdx = 0;
                this._lastEnvCount = pool.getCount(0);

                const indices = pool.getPool(this._lastEnvPoolIdx);
                for (let i = 0; i < this._lastEnvCount; i++) {
                    this._lastEnvIndices[i] = indices[i];
                }

                this._lastEnvQueryX = playerPos.x;
                this._lastEnvQueryZ = playerPos.z;
            }

            const count = this._lastEnvCount;

            if (count > 0) {
                const indices = this._lastEnvIndices;

                let totalWeight = 0;
                let blendedR = 0, blendedG = 0, blendedB = 0;
                let blendedDensity = 0;
                let blendedAmbient = 0;

                for (let i = 0; i < count; i++) {
                    const zoneIdx = indices[i] | 0;
                    // Indices <1000: static (SectorDef). >=1000: dynamic (added at runtime).
                    const z = (zoneIdx < 1000) ? staticZones[zoneIdx] : sectorState.ctx?.environmentalZones?.[zoneIdx - 1000];
                    if (!z) continue;

                    let weight = 0;

                    if (z.polygon) {
                        // --- PHASE 3: AABB pre-check before expensive polygon ray-cast ---
                        // The AABB min/max are precomputed by SectorBuilder.getZoneAABB during registration.
                        // If not cached, fall through directly to isPointInPolygon (safe fallback).
                        const poly = z.polygon;
                        const len = poly.length;
                        if (z.minX === undefined) {
                            let minX = poly[0].x, maxX = poly[0].x;
                            let minZ = poly[0].z, maxZ = poly[0].z;
                            for (let j = 1; j < len; j++) {
                                if (poly[j].x < minX) minX = poly[j].x;
                                if (poly[j].x > maxX) maxX = poly[j].x;
                                if (poly[j].z < minZ) minZ = poly[j].z;
                                if (poly[j].z > maxZ) maxZ = poly[j].z;
                            }
                            z.minX = minX; z.maxX = maxX; z.minZ = minZ; z.maxZ = maxZ;
                        }
                        const minX = z.minX;
                        const maxX = z.maxX;
                        const minZ = z.minZ;
                        const maxZ = z.maxZ;
                        const px = playerPos.x;
                        const pz = playerPos.z;
                        // Fade distance for smooth polygon edge blending
                        const fade = z.polygonFadeDistance ?? 0;
                        if (px >= minX - fade && px <= maxX + fade && pz >= minZ - fade && pz <= maxZ + fade) {
                            if (isPointInPolygon(px, pz, poly)) {
                                weight = 1.0;
                            } else if (fade > 0) {
                                // Simple outer-AABB distance fade for polygon zones with a fade margin
                                const edgeDx = Math.max(minX - px, 0, px - maxX);
                                const edgeDz = Math.max(minZ - pz, 0, pz - maxZ);
                                const edgeDist = Math.sqrt(edgeDx * edgeDx + edgeDz * edgeDz);
                                if (edgeDist < fade) {
                                    weight = 1.0 - edgeDist / fade;
                                    weight *= weight; // Quadratic falloff
                                }
                            }
                        }
                    } else {
                        const dx = playerPos.x - (z.x || 0);
                        const dz = playerPos.z - (z.z || 0);
                        const distSq = dx * dx + dz * dz;
                        const inner = z.innerRadius || 100;
                        const outer = z.outerRadius || 250;
                        if (distSq < outer * outer) {
                            const dist = Math.sqrt(distSq);
                            weight = 1.0;
                            if (dist > inner) weight = 1.0 - ((dist - inner) / (outer - inner));
                            weight *= weight; // Quadratic falloff
                        }
                    }

                    if (weight > 0) {
                        _c2.setHex(z.bgColor);
                        blendedR += _c2.r * weight;
                        blendedG += _c2.g * weight;
                        blendedB += _c2.b * weight;
                        blendedDensity += (z.fogDensity ?? 0) * weight;
                        blendedAmbient += z.ambient * weight;
                        totalWeight += weight;

                        if (weight > target.maxWeight) {
                            target.maxWeight = weight;
                            target.weatherType = z.weather;
                            target.weatherDensity = z.weatherDensity ?? 1.0;
                            target.windStrength = z.windStrength ?? defWindMax;
                        }
                    }
                }

                if (totalWeight > 0) {
                    // --- PHASE 1: Weighted-Default Blending ---
                    // Inject the sector's own defaults as the "remaining weight" (1.0 - totalWeight).
                    // This prevents edge-of-zone snap and ensures a smooth return to the global env
                    // when exiting a zone (totalWeight → 0 ⟹ result == sector default).
                    const clampedTotal = Math.min(totalWeight, 1.0);
                    const defaultWeight = 1.0 - clampedTotal;

                    _c1.setHex(defFogColor);
                    _c2.setRGB(
                        blendedR / totalWeight * clampedTotal + _c1.r * defaultWeight,
                        blendedG / totalWeight * clampedTotal + _c1.g * defaultWeight,
                        blendedB / totalWeight * clampedTotal + _c1.b * defaultWeight
                    );
                    target.fogColor = _c2.getHex();
                    target.fogDensity = blendedDensity / totalWeight * clampedTotal + defFogDensity * defaultWeight;
                    target.ambient = blendedAmbient / totalWeight * clampedTotal + (defaultEnv.ambient ?? 1.0) * defaultWeight;
                    // groundColor blends back to sector default outside zones (automatic via defaultWeight)
                    target.groundColor = defGroundColor; // zones don't override ground color for now
                }
            }
        } else if (override) {
            if (override.bgColor !== undefined) target.fogColor = override.bgColor;
            if (override.fogColor !== undefined) target.fogColor = override.fogColor;
            if (override.fogDensity !== undefined) target.fogDensity = override.fogDensity;
            if (override.groundColor !== undefined) target.groundColor = override.groundColor;
            if (override.weather !== undefined) {
                target.weatherType = (typeof override.weather === 'number') ? override.weather : override.weather.type;
                target.weatherDensity = override.weatherDensity ?? 1.0;
            }
        }

        // 3. Frame-Independent Smoothing (Exponential decay — framerate independent)
        const lerpFactor = 1.0 - Math.exp(-3.0 * dt);
        this._currFogColor.lerp(_c1.setHex(target.fogColor), lerpFactor);
        this._currFogDensity = THREE.MathUtils.lerp(this._currFogDensity, target.fogDensity, lerpFactor);
        this._currAmbient = THREE.MathUtils.lerp(this._currAmbient, target.ambient, lerpFactor);
        this._currGroundColor.lerp(_c1.setHex(target.groundColor), lerpFactor);

        // 4. Low-Level Engine Sync (guarded by epsilon — avoids 60fps WebGL state thrash)
        const camY = engine.camera.position.y;
        const FOG_HEIGHT_MIN = 25;
        const FOG_HEIGHT_MAX = 90;
        const heightFactor = 1.0 - Math.max(0, Math.min(1, (camY - FOG_HEIGHT_MIN) / (FOG_HEIGHT_MAX - FOG_HEIGHT_MIN)));
        const scaledFogDensity = this._currFogDensity * heightFactor;

        engine.fog?.sync(scaledFogDensity, undefined, this._currFogColor);

        // --- Ambient Light Sync ---
        // SkySystem owns the lights, but SectorSystem drives the intensity for zones
        if (engine.sky) {
            const hemi = engine.scene.getObjectByName(SKY_SYSTEM.HEMI_LIGHT) as THREE.HemisphereLight;
            if (hemi) hemi.intensity = this._currAmbient;
        }

        // --- Ground Color Sync (lazy cache) ---
        if (!this._cachedGround) {
            this._cachedGround = engine.scene.getObjectByName('GROUND') as THREE.Mesh;
        }
        if (this._cachedGround && this._cachedGround.material) {
            const mat = this._cachedGround.material as THREE.MeshStandardMaterial;
            if (mat.color) mat.color.copy(this._currGroundColor);
        }

        // 5. Weather & Wind Sync (gated — only push when meaningfully changed)
        const tWeather = (target.maxWeight > 0.4 || override) ? target.weatherType : defWeatherType;
        const tCount = (target.maxWeight > 0.4 || override) ? (target.weatherDensity * defaultWeatherCount) : defaultWeatherCount;
        const tWindMin = (target.maxWeight > 0.4 || override) ? (target.windStrength * 0.2) : defaultWindMin;
        const tWindMax = (target.maxWeight > 0.4 || override) ? target.windStrength : defaultWindMax;

        if (engine.weather.type !== tWeather || Math.abs(this._currWeatherCount - tCount) > 10) {
            engine.weather.sync(tWeather, tCount);
            this._currWeatherCount = tCount;
        }

        if (Math.abs(this._currWindMax - tWindMax) > 0.01) {
            engine.wind.sync(tWindMin, tWindMax);
            this._currWindMax = tWindMax;
        }
    }
}
