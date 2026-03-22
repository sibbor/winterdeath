import * as THREE from 'three';
import { Enemy, ENEMY_DETECTION, NoiseType, NOISE_RADIUS, AIState, EnemyDeathState } from '../entities/enemies/EnemyTypes';
import { SpatialGrid } from '../core/world/SpatialGrid';
import { System } from './System';

export interface NoiseEvent {
    pos: THREE.Vector3;
    type: NoiseType;
    radius: number;
    timestamp: number;
}

export class EnemyDetectionSystem implements System {
    id = 'EnemyDetectionSystem';
    private noiseEvents: NoiseEvent[] = [];
    private raycaster = new THREE.Raycaster();

    // Pre-allocated vectors for Zero-GC
    private _vStart = new THREE.Vector3();
    private _vEnd = new THREE.Vector3();
    private _vDir = new THREE.Vector3();
    private _vForward = new THREE.Vector3();

    // Reusable array to hold objects for intersection
    private _intersectCandidates: THREE.Object3D[] = [];

    public attach() { }
    public detach() { }

    /**
     * Broadcasts a noise event for enemies to hear.
     */
    makeNoise(pos: THREE.Vector3, type: NoiseType = NoiseType.OTHER, customRadius?: number) {
        let radius = customRadius;
        if (radius === undefined) {
            radius = NOISE_RADIUS[type] || 30;
        }

        this.noiseEvents.push({
            pos: pos.clone(), // Allowed here as it's an event trigger, not every frame
            type,
            radius,
            timestamp: performance.now()
        });
    }

    /**
     * Determines if an enemy has direct line of sight to the player utilizing SpatialGrid occlusion.
     */
    canSeePlayer(enemy: Enemy, playerPos: THREE.Vector3, collisionGrid: SpatialGrid): boolean {
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

        // Raycast Check using SpatialGrid candidates
        this._vStart.copy(enemy.mesh.position);
        this._vStart.y += 1.5; // Eye height
        this._vEnd.copy(playerPos);
        this._vEnd.y += 1.0; // Player torso height

        this._vDir.subVectors(this._vEnd, this._vStart).normalize();
        const dist = Math.sqrt(distSq);

        this.raycaster.set(this._vStart, this._vDir);
        this.raycaster.far = dist;

        const obstacles = collisionGrid.getObstaclesInPath(this._vStart, this._vEnd);
        this._intersectCandidates.length = 0;

        for (let i = 0; i < obstacles.length; i++) {
            if (obstacles[i].mesh) {
                this._intersectCandidates.push(obstacles[i].mesh!);
            }
        }

        if (this._intersectCandidates.length > 0) {
            const hits = this.raycaster.intersectObjects(this._intersectCandidates, false);
            if (hits.length > 0) {
                return false; // Blocked by obstacle
            }
        }

        return true;
    }

    update(delta: number, now: number, state: any) {
        const enemies: Enemy[] = state.enemies || [];
        const playerPos: THREE.Vector3 = state.playerPos;
        const collisionGrid: SpatialGrid = state.collisionGrid;

        if (!playerPos || !collisionGrid) return;

        // 1. Cleanup stale noise events FIRST using Swap-and-Go to save inner loop cycles
        for (let i = this.noiseEvents.length - 1; i >= 0; i--) {
            const evt = this.noiseEvents[i];
            if (now - evt.timestamp > 100) {
                this.noiseEvents[i] = this.noiseEvents[this.noiseEvents.length - 1];
                this.noiseEvents.pop();
            }
        }

        // Calculate a repeating staggered index 0, 1, or 2 based on current time
        const frameIndex = Math.floor(now / 16.666) % 3;

        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];

            if (e.dead || e.deathState !== EnemyDeathState.ALIVE) continue;

            // 2. VISUAL CHECK (Staggered)
            if ((i % 3) === frameIndex) {
                const visible = this.canSeePlayer(e, playerPos, collisionGrid);
                if (visible) {
                    if (!e.lastKnownPosition) e.lastKnownPosition = new THREE.Vector3();
                    e.lastKnownPosition.copy(playerPos);
                    e.searchTimer = 0;
                    e.awareness = 1.0;
                    e.lastSeenTime = now;
                } else {
                    if (e.awareness > 0) {
                        e.awareness = Math.max(0, e.awareness - delta * 0.2);
                    }
                }
            }

            // 3. AUDIO CHECK 
            for (let j = 0; j < this.noiseEvents.length; j++) {
                const evt = this.noiseEvents[j];

                const dx = evt.pos.x - e.mesh.position.x;
                const dz = evt.pos.z - e.mesh.position.z;
                const distSq = dx * dx + dz * dz;

                const hearingThreshold = e.hearingThreshold || 1.0;
                const effectiveRadius = evt.radius * hearingThreshold;

                if (distSq <= effectiveRadius * effectiveRadius) {
                    if (!e.lastKnownPosition) e.lastKnownPosition = new THREE.Vector3();
                    e.lastKnownPosition.copy(evt.pos);
                    e.lastHeardNoiseType = evt.type;

                    e.awareness = 1.0;

                    if (e.state === AIState.IDLE || e.state === AIState.WANDER) {
                        e.state = AIState.SEARCH;
                        e.searchTimer = ENEMY_DETECTION.SEARCH_DURATION;

                        const angle = Math.atan2(dx, dz);
                        e.mesh.rotation.y = angle;
                        e.mesh.quaternion.setFromEuler(e.mesh.rotation);
                    }
                }
            }
        }
    }
}