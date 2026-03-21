import * as THREE from 'three';
import { Obstacle } from './CollisionResolution';
import { Enemy, EnemyDeathState } from '../../entities/enemies/EnemyTypes';

// Prime number for optimal spatial hash distribution without collisions
const HASH_SIZE = 4093;

export class SpatialGrid {
    // Replaced Map with fixed-size arrays for O(1) direct memory access
    private obstacleCells: Obstacle[][];
    private enemyCells: Enemy[][];
    private cellSize: number;

    // --- ZERO-GC SCRATCHPADS ---
    private obstacleQueryResults: Obstacle[] = [];
    private enemyQueryResults: Enemy[] = [];
    private triggerQueryResults: any[] = [];
    private interactableQueryResults: THREE.Object3D[] = [];
    private _vWorld = new THREE.Vector3();

    // Scratchpad to completely avoid function allocations in loops
    private _hashScratchpad = new Int32Array(1024);
    private _hashCount = 0;

    // Frame counters replace Set allocations for lightning-fast dedup
    private _queryFrame: number = 0;

    // Tracks only populated cells to avoid clearing entire grid every frame
    private _touchedEnemyCells: Enemy[][] = [];

    // --- TRIGGER & INTERACTABLE EXTENSIONS ---
    private triggerCells: any[][];
    private interactableCells: THREE.Object3D[][];
    private dynamicTriggers: any[] = []; // Triggers with familyId/ownerId

    constructor(cellSize: number = 15) {
        this.cellSize = cellSize;

        // Pre-allocate the entire grid to force V8 into PACKED_ELEMENTS mode
        this.obstacleCells = new Array(HASH_SIZE);
        this.enemyCells = new Array(HASH_SIZE);
        this.triggerCells = new Array(HASH_SIZE);
        this.interactableCells = new Array(HASH_SIZE);

        for (let i = 0; i < HASH_SIZE; i++) {
            this.obstacleCells[i] = [];
            this.enemyCells[i] = [];
            this.triggerCells[i] = [];
            this.interactableCells[i] = [];
        }
    }

    // Computes hashes without callbacks and puts them in the scratchpad
    private computeHashesInRange(x: number, z: number, radius: number) {
        this._hashCount = 0;
        const sX = Math.floor((x - radius) / this.cellSize);
        const eX = Math.floor((x + radius) / this.cellSize);
        const sZ = Math.floor((z - radius) / this.cellSize);
        const eZ = Math.floor((z + radius) / this.cellSize);

        for (let ix = sX; ix <= eX; ix++) {
            for (let iz = sZ; iz <= eZ; iz++) {
                const hash = Math.abs((ix * 73856093) ^ (iz * 19349663)) % HASH_SIZE;
                // FIX: Säkerställ att vi inte skriver utanför minnet
                if (this._hashCount < 1024) {
                    this._hashScratchpad[this._hashCount++] = hash;
                }
            }
        }
    }

    // --- OBSTACLE MANAGEMENT ---

    addObstacle(obstacle: Obstacle) {
        const pos = obstacle.position;
        const radius = obstacle.radius || 2.0;

        this.computeHashesInRange(pos.x, pos.z, radius);
        for (let i = 0; i < this._hashCount; i++) {
            this.obstacleCells[this._hashScratchpad[i]].push(obstacle);
        }
    }

    updateObstacle(obstacle: Obstacle, oldPos?: THREE.Vector3, oldRadius?: number) {
        if (!obstacle || !obstacle.position) return;

        // OPTIMERING: Om vi vet den gamla positionen behöver vi inte loopa 4093 gånger!
        if (oldPos && oldRadius !== undefined) {
            this.computeHashesInRange(oldPos.x, oldPos.z, oldRadius);
            for (let i = 0; i < this._hashCount; i++) {
                const cell = this.obstacleCells[this._hashScratchpad[i]];
                let index = cell.indexOf(obstacle);
                while (index !== -1) {
                    cell[index] = cell[cell.length - 1];
                    cell.pop();
                    index = cell.indexOf(obstacle);
                }
            }
        } else {
            // Fallback (Flat iteration)
            for (let i = 0; i < HASH_SIZE; i++) {
                const cell = this.obstacleCells[i];
                if (cell.length > 0) {
                    let index = cell.indexOf(obstacle);
                    while (index !== -1) {
                        cell[index] = cell[cell.length - 1];
                        cell.pop();
                        index = cell.indexOf(obstacle);
                    }
                }
            }
        }

        // Re-add it to its new position
        this.addObstacle(obstacle);
    }

    getNearbyObstacles(pos: THREE.Vector3, radius: number): Obstacle[] {
        this.obstacleQueryResults.length = 0;
        this._queryFrame++;

        this.computeHashesInRange(pos.x, pos.z, radius);
        for (let c = 0; c < this._hashCount; c++) {
            const cell = this.obstacleCells[this._hashScratchpad[c]];
            for (let i = 0; i < cell.length; i++) {
                const obs = cell[i];
                if ((obs as any)._sqf !== this._queryFrame) {
                    (obs as any)._sqf = this._queryFrame;
                    this.obstacleQueryResults.push(obs);
                }
            }
        }

        return this.obstacleQueryResults;
    }

    // --- ENEMY MANAGEMENT ---

    updateEnemyGrid(enemies: Enemy[]) {
        for (let i = 0; i < this._touchedEnemyCells.length; i++) {
            this._touchedEnemyCells[i].length = 0;
        }
        this._touchedEnemyCells.length = 0;

        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (e.dead || e.deathState !== EnemyDeathState.ALIVE) continue;

            const hitRadius = 1.0 * (e.originalScale || 1.0) * (e.widthScale || 1.0);

            this.computeHashesInRange(e.mesh.position.x, e.mesh.position.z, hitRadius);
            for (let c = 0; c < this._hashCount; c++) {
                const cell = this.enemyCells[this._hashScratchpad[c]];

                if (cell.length === 0) {
                    this._touchedEnemyCells.push(cell);
                }
                cell.push(e);
            }
        }
    }

    getNearbyEnemies(pos: THREE.Vector3, radius: number): Enemy[] {
        this.enemyQueryResults.length = 0;
        this._queryFrame++;

        this.computeHashesInRange(pos.x, pos.z, radius);
        for (let c = 0; c < this._hashCount; c++) {
            const cell = this.enemyCells[this._hashScratchpad[c]];
            for (let i = 0; i < cell.length; i++) {
                const e = cell[i];
                if ((e as any)._sqf !== this._queryFrame) {
                    (e as any)._sqf = this._queryFrame;
                    this.enemyQueryResults.push(e);
                }
            }
        }
        return this.enemyQueryResults;
    }

    // --- TRIGGER MANAGEMENT ---

    addTrigger(t: any) {
        if (t.familyId !== undefined || t.ownerId !== undefined) {
            this.dynamicTriggers.push(t);
            return;
        }

        let radius = t.radius || 2.0;
        if (t.size) {
            radius = Math.max(radius, Math.sqrt((t.size.width / 2) ** 2 + (t.size.depth / 2) ** 2));
        }

        this.computeHashesInRange(t.position.x, t.position.z, radius);
        for (let i = 0; i < this._hashCount; i++) {
            this.triggerCells[this._hashScratchpad[i]].push(t);
        }
    }

    getNearbyTriggers(pos: THREE.Vector3, radius: number): any[] {
        this.triggerQueryResults.length = 0;
        this._queryFrame++;

        this.computeHashesInRange(pos.x, pos.z, radius);
        for (let c = 0; c < this._hashCount; c++) {
            const cell = this.triggerCells[this._hashScratchpad[c]];
            for (let i = 0; i < cell.length; i++) {
                const t = cell[i];
                if ((t as any)._sqf !== this._queryFrame) {
                    (t as any)._sqf = this._queryFrame;
                    this.triggerQueryResults.push(t);
                }
            }
        }

        for (let i = 0; i < this.dynamicTriggers.length; i++) {
            const dt = this.dynamicTriggers[i];
            if ((dt as any)._sqf !== this._queryFrame) {
                (dt as any)._sqf = this._queryFrame;
                this.triggerQueryResults.push(dt);
            }
        }

        return this.triggerQueryResults;
    }

    // --- INTERACTABLE MANAGEMENT ---

    addInteractable(obj: THREE.Object3D) {
        let radius = obj.userData.interactionRadius || 4.0;
        if (obj.userData.vehicleDef) {
            const size = obj.userData.vehicleDef.size;
            radius = Math.max(radius, Math.sqrt((size.x / 2) ** 2 + (size.z / 2) ** 2) + 2.0);
        }

        obj.updateMatrixWorld(true);
        obj.getWorldPosition(this._vWorld);

        this.computeHashesInRange(this._vWorld.x, this._vWorld.z, radius);
        for (let i = 0; i < this._hashCount; i++) {
            this.interactableCells[this._hashScratchpad[i]].push(obj);
        }
    }

    updateInteractable(obj: THREE.Object3D, oldPos?: THREE.Vector3, oldRadius?: number) {
        if (!obj || !obj.position) return;

        if (oldPos && oldRadius !== undefined) {
            this.computeHashesInRange(oldPos.x, oldPos.z, oldRadius);
            for (let i = 0; i < this._hashCount; i++) {
                const cell = this.interactableCells[this._hashScratchpad[i]];
                let index = cell.indexOf(obj);
                while (index !== -1) {
                    cell[index] = cell[cell.length - 1];
                    cell.pop();
                    index = cell.indexOf(obj);
                }
            }
        } else {
            for (let i = 0; i < HASH_SIZE; i++) {
                const cell = this.interactableCells[i];
                if (cell.length > 0) {
                    let index = cell.indexOf(obj);
                    while (index !== -1) {
                        cell[index] = cell[cell.length - 1];
                        cell.pop();
                        index = cell.indexOf(obj);
                    }
                }
            }
        }

        this.addInteractable(obj);
    }

    getNearbyInteractables(pos: THREE.Vector3, radius: number): THREE.Object3D[] {
        this.interactableQueryResults.length = 0;
        this._queryFrame++;

        this.computeHashesInRange(pos.x, pos.z, radius);
        for (let c = 0; c < this._hashCount; c++) {
            const cell = this.interactableCells[this._hashScratchpad[c]];
            for (let i = 0; i < cell.length; i++) {
                const obj = cell[i];
                if ((obj as any)._sqf !== this._queryFrame) {
                    (obj as any)._sqf = this._queryFrame;
                    this.interactableQueryResults.push(obj);
                }
            }
        }

        return this.interactableQueryResults;
    }

    clear() {
        for (let i = 0; i < HASH_SIZE; i++) {
            this.obstacleCells[i].length = 0;
            this.enemyCells[i].length = 0;
            this.triggerCells[i].length = 0;
            this.interactableCells[i].length = 0;
        }
        this._touchedEnemyCells.length = 0;
        this.dynamicTriggers.length = 0;
    }
}