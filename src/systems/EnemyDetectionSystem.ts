import * as THREE from 'three';
import { Enemy, ENEMY_DETECTION, NoiseType, NOISE_RADIUS, AIState, EnemyFlags, EnemyType } from '../entities/enemies/EnemyTypes';
import { WorldStreamer } from '../core/world/WorldStreamer';
import { System, SystemID } from './System';
import { RuntimeStressHarness } from '../utils/debug/RuntimeStressHarness';

export interface NoiseEvent {
    pos: THREE.Vector3;
    type: NoiseType;
    radius: number;
    timestamp: number;
}

export class EnemyDetectionSystem implements System {
    readonly systemId = SystemID.ENEMY_DETECTION;
    id = 'enemy_detection_system';
    enabled = true;
    persistent = false;
    isFixedStep = true;
    
    // --- ZERO-GC NOISE POOL ---
    private readonly maxNoises = 32;
    private readonly noiseEvents: NoiseEvent[];
    private activeNoiseCount: number = 0;
    
    private context: any = null;

    // Reusable array to hold objects for intersection (Pruned in Phase 5)
    private _intersectCandidates: THREE.Object3D[] = [];

    // Pre-allocated vectors for Zero-GC
    private _vStart = new THREE.Vector3();
    private _vEnd = new THREE.Vector3();
    private _vDir = new THREE.Vector3();
    private _vForward = new THREE.Vector3();

    constructor() {
        this.noiseEvents = new Array(this.maxNoises);
        for (let i = 0; i < this.maxNoises; i++) {
            this.noiseEvents[i] = {
                pos: new THREE.Vector3(),
                type: 0,
                radius: 0,
                timestamp: 0
            };
        }
    }

    public attach() { }
    public detach() { }

    public init(context: any) {
        this.context = context;
        context.detectionSystem = this;
    }

    /**
         * Broadcasts a noise event for enemies to hear. 
         * Uses Spatial Merging to automatically throttle high-frequency events (like automatic gunfire or vehicles) without allocating new memory.
         */
    makeNoise(pos: THREE.Vector3, type: NoiseType = NoiseType.OTHER, customRadius?: number) {
        let radius = customRadius;
        if (radius === undefined) {
            radius = NOISE_RADIUS[type] || 30;
        }

        const simTime = this.context.state.simTime;

        // --- CENTRALIZED THROTTLING (SPATIAL MERGING) ---
        for (let i = 0; i < this.activeNoiseCount; i++) {
            const evt = this.noiseEvents[i];

            if (evt.type === type) {
                const distSq = evt.pos.distanceToSquared(pos);
                if (distSq < 25.0) {
                    evt.pos.copy(pos);
                    evt.timestamp = simTime;
                    return;
                }
            }
        }

        if (this.activeNoiseCount < this.maxNoises) {
            const evt = this.noiseEvents[this.activeNoiseCount];
            evt.pos.copy(pos);
            evt.type = type;
            evt.radius = radius;
            evt.timestamp = simTime;
            this.activeNoiseCount++;
            
            // --- STRESS HARNESS: MONITOR NOISE POOL STARVATION ---
            RuntimeStressHarness.checkPoolCapacity("NoiseEventPool", this.activeNoiseCount, this.maxNoises);
        }
    }

    /**
     * Determines if an enemy has direct line of sight to the player utilizing SpatialGrid occlusion.
     */
    canSeePlayer(enemy: Enemy, playerPos: THREE.Vector3, streamer: WorldStreamer): boolean {
        const dx = playerPos.x - enemy.mesh.position.x;
        const dy = playerPos.y - enemy.mesh.position.y;
        const dz = playerPos.z - enemy.mesh.position.z;
        const distSq = dx * dx + dy * dy + dz * dz;

        // Early Out: Stealth Zone (360 degrees aware)
        if (distSq < ENEMY_DETECTION.STEALTH_ZONE_RADIUS_SQ) {
            return true;
        }

        // Early Out: Beyond Visual Range
        if (distSq > ENEMY_DETECTION.VISUAL_RANGE_SQ) {
            return false;
        }

        // FOV Check using fast dot product
        this._vDir.set(dx, dy, dz).normalize();
        this._vForward.set(0, 0, 1).applyQuaternion(enemy.mesh.quaternion);

        if (this._vForward.dot(this._vDir) < ENEMY_DETECTION.FOV_COS) {
            return false; // Player is outside FOV cone
        }

        // Raycast Check using WorldStreamer Path Query (Zero-GC)
        this._vStart.copy(enemy.mesh.position);
        this._vStart.y += 1.5; // Eye height
        this._vEnd.copy(playerPos);
        this._vEnd.y += 1.0; // Player torso height

        const pool = streamer.getObstaclePool();
        const poolIdx = pool.nextIndex();
        streamer.getObstaclesInPath(this._vStart, this._vEnd, poolIdx);
        
        // If any obstacle intersects the path segment, line-of-sight is blocked.
        // O(1) mathematical occlusion replaces the heavy Three.js Raycaster allocation.
        return pool.getCount(poolIdx) === 0;
    }

    update(context: any, delta: number, simTime: number, renderTime: number) {
        const state = context.state;
        if (!state || !context.playerPos) return;

        const enemies: Enemy[] = state.enemies || [];
        const playerPos: THREE.Vector3 = context.playerPos;
        const streamer: WorldStreamer = context.worldStreamer;

        if (!playerPos || !streamer) return;

        // 1. Cleanup stale noise events FIRST using Swap-and-Go to save inner loop cycles
        // 1. Cleanup stale noise events FIRST using Swap-and-Go to save inner loop cycles
        for (let i = this.activeNoiseCount - 1; i >= 0; i--) {
            const evt = this.noiseEvents[i];
            if (simTime - evt.timestamp > 200) { 
                // Swap with last active
                const lastIdx = this.activeNoiseCount - 1;
                if (i < lastIdx) {
                    const lastEvt = this.noiseEvents[lastIdx];
                    // Swap the object references in the pool
                    this.noiseEvents[lastIdx] = evt;
                    this.noiseEvents[i] = lastEvt;
                }
                this.activeNoiseCount--;
            }
        }

        // Calculate a repeating staggered index 0, 1, or 2 based on current time
        const frameIndex = Math.floor(simTime / 16.666) % 3;

        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];

            if ((e.statusFlags & EnemyFlags.DEAD) !== 0) continue;

            // 2. VISUAL CHECK (Staggered)
            if ((i % 3) === frameIndex) {
                if (this.canSeePlayer(e, playerPos, streamer)) {
                    e.lastKnownPosition.copy(playerPos);
                    e.searchTimer = 0;
                    e.awareness = 1.0;
                    e.lastSeenTime = simTime;
                    const isAggressive = e.state === AIState.ATTACK_CHARGE || e.state === AIState.ATTACKING || e.state === AIState.GRAPPLE;
                    if (!isAggressive) e.state = AIState.CHASE;

                    // --- Discovery Logic ---
                    const stats = state.stats; // Use persistent stats for discovery
                    const discovery = state.discoverySets;

                    if (stats && discovery && (e.statusFlags & EnemyFlags.BOSS) !== 0) {
                        const sectorIndex = state.sessionStats?.currentSector || 0;
                        const bossDiscoveryId = sectorIndex;
                        if (!discovery.seenBosses?.has(bossDiscoveryId)) {
                            discovery.seenBosses?.add(bossDiscoveryId);
                            if (stats.seenBosses && stats.seenBosses.indexOf(bossDiscoveryId) === -1) {
                                stats.seenBosses.push(bossDiscoveryId);
                            }
                            if (state.sessionStats?.seenBosses && state.sessionStats.seenBosses.indexOf(bossDiscoveryId) === -1) {
                                state.sessionStats.seenBosses.push(bossDiscoveryId);
                            }
                            if (state.callbacks?.onBossDiscovered) {
                                state.callbacks.onBossDiscovered(bossDiscoveryId);
                            }
                        }
                    } else if (stats && discovery) {
                        const enemyType = e.type;
                        if (discovery?.seenEnemies && !discovery.seenEnemies.has(enemyType)) {
                            discovery.seenEnemies.add(enemyType);
                            if (stats.seenEnemies && stats.seenEnemies.indexOf(enemyType) === -1) {
                                stats.seenEnemies.push(enemyType);
                            }
                            if (state.sessionStats?.seenEnemies && state.sessionStats.seenEnemies.indexOf(enemyType) === -1) {
                                state.sessionStats.seenEnemies.push(enemyType);
                            }
                            if (state.callbacks?.onEnemyDiscovered) {
                                state.callbacks.onEnemyDiscovered(enemyType);
                            }
                        }
                    }
                } else {
                    if (e.awareness > 0) {
                        e.awareness = Math.max(0, e.awareness - delta * 0.2);
                    }
                }
            }

            // 3. AUDIO CHECK - Skip if already in an aggressive state
            const isAggressive = e.state === AIState.CHASE || e.state === AIState.ATTACK_CHARGE || e.state === AIState.ATTACKING || e.state === AIState.GRAPPLE;

            if (!isAggressive) {
                for (let j = 0; j < this.activeNoiseCount; j++) {
                    const evt = this.noiseEvents[j];

                    const dx = evt.pos.x - e.mesh.position.x;
                    const dz = evt.pos.z - e.mesh.position.z;
                    const distSq = dx * dx + dz * dz;

                    const hearingThreshold = e.hearingThreshold || 1.0;
                    const effectiveRadius = evt.radius * hearingThreshold;

                    if (distSq <= effectiveRadius * effectiveRadius) {
                        e.lastKnownPosition.copy(evt.pos);
                        e.lastHeardNoiseType = evt.type;
                        e.awareness = 1.0;

                        if (e.state === AIState.IDLE || e.state === AIState.WANDER) {
                            e.state = AIState.SEARCH;
                            e.searchTimer = ENEMY_DETECTION.SEARCH_DURATION;

                            const angle = Math.atan2(dx, dz);
                            e.mesh.rotation.y = angle;
                            e.mesh.quaternion.setFromEuler(e.mesh.rotation);

                            break;
                        }
                    }
                }
            }
        }
    }
}
