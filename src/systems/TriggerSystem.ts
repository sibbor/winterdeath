import { WinterEngine } from '../core/engine/WinterEngine';
import { TriggerType, TriggerAction, TriggerStatus } from '../types/TriggerTypes';
import { System, SystemID } from './System';
import { DataResolver } from '../utils/ui/DataResolver';
import { UIEventRingBuffer, UIEventType } from './ui/UIEventRingBuffer';
import { DiscoveryType } from '../components/ui/hud/HudTypes';
import { InteractionPromptId } from './ui/UIEventBridge';
import { t } from '../utils/i18n';
import { SpatialGrid } from '../core/world/SpatialGrid';

/**
 * Data-Oriented Trigger System using Struct of Arrays (SoA).
 * Pre-allocated typed arrays ensure Zero-GC and maximum L1/L2 cache locality.
 * Phase 2 Optimization.
 */
export class TriggerSystem implements System {
    readonly systemId = SystemID.TRIGGER_SYSTEM;
    id = 'trigger_system';
    enabled = true;
    persistent = false;

    private readonly maxTriggers: number;
    private activeCount: number = 0;
    private grid: SpatialGrid | null = null;

    // --- Struct of Arrays (SoA) ---
    private readonly activeFlags: Uint8Array;
    private readonly triggerTypes: Uint8Array;
    private readonly shapeTypes: Uint8Array; // 0 = Circle, 1 = Box
    private readonly statusFlags: Uint16Array;
    private readonly positionsX: Float32Array;
    private readonly positionsY: Float32Array;
    private readonly positionsZ: Float32Array;
    private readonly radiiSq: Float32Array;
    private readonly halfWidths: Float32Array;
    private readonly halfDepths: Float32Array;
    private readonly rotations: Float32Array;
    private readonly lastTriggerTimes: Float64Array;
    public readonly repeatIntervals: Float64Array;

    public get capacity(): number { return this.maxTriggers; }
    public get count(): number { return this.activeCount; }
    public getActiveFlags(): Uint8Array { return this.activeFlags; }
    public getPositionsX(): Float32Array { return this.positionsX; }
    public getPositionsY(): Float32Array { return this.positionsY; }
    public getPositionsZ(): Float32Array { return this.positionsZ; }
    public getRadiiSq(): Float32Array { return this.radiiSq; }
    public getHalfWidths(): Float32Array { return this.halfWidths; }
    public getHalfDepths(): Float32Array { return this.halfDepths; }
    public getRotations(): Float32Array { return this.rotations; }
    public getTriggerTypes(): Uint8Array { return this.triggerTypes; }
    public getStatusFlags(): Uint16Array { return this.statusFlags; }

    // --- Metadata Pool (Pre-allocated objects to store non-numeric data) ---
    public readonly metadata: Array<{
        id: string;
        content: string;
        contentId: number; // SMI for Zero-GC transport
        actions: TriggerAction[];
        familyId?: number;
        ownerId?: string;
        interactionPromptId?: InteractionPromptId;
        label?: string;
    }>;

    constructor(maxCapacity: number = 256) {
        this.maxTriggers = maxCapacity;

        this.activeFlags = new Uint8Array(maxCapacity);
        this.triggerTypes = new Uint8Array(maxCapacity);
        this.shapeTypes = new Uint8Array(maxCapacity);
        this.statusFlags = new Uint16Array(maxCapacity);
        this.positionsX = new Float32Array(maxCapacity);
        this.positionsY = new Float32Array(maxCapacity);
        this.positionsZ = new Float32Array(maxCapacity);
        this.radiiSq = new Float32Array(maxCapacity);
        this.halfWidths = new Float32Array(maxCapacity);
        this.halfDepths = new Float32Array(maxCapacity);
        this.rotations = new Float32Array(maxCapacity);
        this.lastTriggerTimes = new Float64Array(maxCapacity);
        this.repeatIntervals = new Float64Array(maxCapacity);

        this.metadata = new Array(maxCapacity);
        for (let i = 0; i < maxCapacity; i++) {
            this.metadata[i] = { id: '', content: '', contentId: 0, actions: [] };
        }
    }

    public setGrid(grid: SpatialGrid): void {
        this.grid = grid;
    }

    public reset(): void {
        this.activeCount = 0;
        this.activeFlags.fill(0);
        this.statusFlags.fill(0);
        this.lastTriggerTimes.fill(0);
        for (let i = 0; i < this.maxTriggers; i++) {
            const m = this.metadata[i];
            m.id = '';
            m.content = '';
            m.contentId = 0;
            m.actions.length = 0;
            m.familyId = undefined;
            m.ownerId = undefined;
            m.interactionPromptId = undefined;
            m.label = undefined;
        }
    }

    public addTrigger(config: {
        id: string;
        type: TriggerType;
        x: number;
        y: number;
        z: number;
        radius?: number;
        size?: { width: number; depth: number };
        rotation?: number;
        statusFlags: number;
        content?: string;
        actions?: TriggerAction[];
        repeatInterval?: number;
        familyId?: number;
        ownerId?: string;
        interactionPromptId?: InteractionPromptId;
        label?: string;
    }): number {
        if (this.activeCount >= this.maxTriggers) {
            console.warn("TriggerSystem capacity reached.");
            return -1;
        }

        for (let i = 0; i < this.maxTriggers; i++) {
            if (this.activeFlags[i] === 0) {
                this.activeFlags[i] = 1;
                this.activeCount++;
                this.triggerTypes[i] = config.type;
                this.statusFlags[i] = config.statusFlags;
                this.positionsX[i] = config.x;
                this.positionsY[i] = config.y;
                this.positionsZ[i] = config.z;
                this.repeatIntervals[i] = config.repeatInterval || 0;
                this.lastTriggerTimes[i] = 0;

                if (config.size) {
                    this.shapeTypes[i] = 1; // BOX
                    this.halfWidths[i] = config.size.width * 0.5;
                    this.halfDepths[i] = config.size.depth * 0.5;
                    this.radiiSq[i] = 0;
                } else {
                    this.shapeTypes[i] = 0; // CIRCLE
                    const r = config.radius || 5;
                    this.radiiSq[i] = r * r;
                    this.halfWidths[i] = 0;
                    this.halfDepths[i] = 0;
                }

                this.rotations[i] = config.rotation || 0;

                const m = this.metadata[i];
                m.id = config.id;
                m.content = config.content || '';
                m.actions.length = 0;
                if (config.actions) {
                    for (let j = 0; j < config.actions.length; j++) {
                        m.actions.push(config.actions[j]);
                    }
                }
                m.familyId = config.familyId;
                m.ownerId = config.ownerId;
                m.interactionPromptId = config.interactionPromptId;
                m.label = config.label;

                // --- VINTERDÖD RESTORATION: DISCOVERY SMI RESOLUTION ---
                m.contentId = 0;
                if (config.type === TriggerType.POI) {
                    const poi = DataResolver.getPois()[m.id];
                    if (poi) m.contentId = (poi.sector << 8) | poi.index;
                } else if (config.type === TriggerType.CLUE) {
                    const clue = DataResolver.getClues()[m.id];
                    if (clue) m.contentId = (clue.sector << 8) | clue.index;
                } else if (config.type === TriggerType.COLLECTIBLE) {
                    const col = DataResolver.getCollectibles()[m.id];
                    if (col) m.contentId = (col.sector << 8) | col.index;
                }

                // Register in SpatialGrid if provided
                if (this.grid) {
                    this.grid.addTrigger({
                        index: i,
                        position: { x: config.x, z: config.z },
                        radius: config.size ? Math.sqrt((config.size.width/2)**2 + (config.size.depth/2)**2) : (config.radius || 5)
                    });
                }

                return i;
            }
        }

        return -1;
    }

    /**
     * Zero-GC Hot-Path Addition
     * Use this method to add triggers during the simulation loop without object allocation.
     */
    public addTriggerPrimitive(
        id: string,
        type: TriggerType,
        x: number,
        y: number,
        z: number,
        radius: number,
        statusFlags: number,
        content: string = '',
        interactionPromptId: InteractionPromptId = InteractionPromptId.NONE,
        label: string = ''
    ): number {
        for (let i = 0; i < this.maxTriggers; i++) {
            if (this.activeFlags[i] === 0) {
                this.activeFlags[i] = 1;
                this.activeCount++;
                this.triggerTypes[i] = type;
                this.statusFlags[i] = statusFlags;
                this.positionsX[i] = x;
                this.positionsY[i] = y;
                this.positionsZ[i] = z;
                this.shapeTypes[i] = 0; // CIRCLE
                this.radiiSq[i] = radius * radius;
                this.halfWidths[i] = 0;
                this.halfDepths[i] = 0;
                this.rotations[i] = 0;
                this.repeatIntervals[i] = 0;
                this.lastTriggerTimes[i] = 0;

                const m = this.metadata[i];
                m.id = id;
                m.content = content;
                m.actions.length = 0;
                m.familyId = undefined;
                m.ownerId = undefined;
                m.interactionPromptId = interactionPromptId;
                m.label = label;

                return i;
            }
        }
        return -1;
    }

    public removeTrigger(index: number): void {
        if (index < 0 || index >= this.maxTriggers) return;
        if (this.activeFlags[index] === 1) {
            this.activeFlags[index] = 0;
            this.activeCount--;
        }
    }

    public getTriggerById(id: string): number {
        for (let i = 0; i < this.maxTriggers; i++) {
            if (this.activeFlags[i] === 1 && this.metadata[i].id === id) {
                return i;
            }
        }
        return -1;
    }

    public isTriggered(index: number): boolean {
        if (index < 0 || index >= this.maxTriggers) return false;
        return (this.statusFlags[index] & TriggerStatus.TRIGGERED) !== 0;
    }

    public setStatusFlag(index: number, flag: number, active: boolean): void {
        if (index < 0 || index >= this.maxTriggers) return;
        if (active) {
            this.statusFlags[index] |= flag;
        } else {
            this.statusFlags[index] &= ~flag;
        }
    }

    public update(session: any, delta: number): void {
        if (!this.enabled) return;

        const engine = WinterEngine.getInstance();
        const simTime = engine.simTime;
        const playerPos = session.playerPos;
        if (!playerPos) return;

        // --- SPATIAL GRID OPTIMIZATION ---
        // Instead of O(N) over 256 triggers, we query the grid for triggers within 15m.
        if (this.grid) {
            const nearby = this.grid.getNearbyTriggers(playerPos, 15);
            for (let j = 0; j < nearby.length; j++) {
                const tObj = nearby[j];
                const i = typeof tObj === 'number' ? tObj : tObj.index;
                if (i === undefined || this.activeFlags[i] === 0) continue;

                const status = this.statusFlags[i];
                if (!(status & TriggerStatus.ACTIVE)) continue;
                if (status & TriggerStatus.TRIGGERED && !(status & TriggerStatus.REPEATABLE)) continue;

                if (status & TriggerStatus.REPEATABLE && this.repeatIntervals[i] > 0) {
                    if (simTime - this.lastTriggerTimes[i] < this.repeatIntervals[i]) continue;
                }

                let isInside = false;
                const tx = this.positionsX[i];
                const tz = this.positionsZ[i];

                if (this.shapeTypes[i] === 0) { // Circle
                    const dx = playerPos.x - tx;
                    const dz = playerPos.z - tz;
                    const distSq = dx * dx + dz * dz;
                    isInside = distSq < this.radiiSq[i];
                } else { // Box
                    const dx = Math.abs(playerPos.x - tx);
                    const dz = Math.abs(playerPos.z - tz);
                    isInside = dx < this.halfWidths[i] && dz < this.halfDepths[i];
                }

                if (isInside) {
                    this.trigger(i, session);
                }
            }
        } else {
            // Fallback for warmup/no-grid contexts
            for (let i = 0; i < this.maxTriggers; i++) {
                if (this.activeFlags[i] === 0) continue;
                const status = this.statusFlags[i];
                if (!(status & TriggerStatus.ACTIVE)) continue;
                if (status & TriggerStatus.TRIGGERED && !(status & TriggerStatus.REPEATABLE)) continue;

                const dx = playerPos.x - this.positionsX[i];
                const dz = playerPos.z - this.positionsZ[i];
                if (dx*dx + dz*dz < this.radiiSq[i]) this.trigger(i, session);
            }
        }
    }

    private trigger(index: number, session: any): void {
        const engine = WinterEngine.getInstance();
        const simTime = engine.simTime;

        this.statusFlags[index] |= TriggerStatus.TRIGGERED;
        this.lastTriggerTimes[index] = simTime;

        const m = this.metadata[index];
        const type = this.triggerTypes[index];
        const state = session.state;

        // --- FIRE NARRATIVE & DISCOVERY VIA ZERO-GC RINGBUFFER ---
        switch (type) {
            case TriggerType.THOUGHT:
                UIEventRingBuffer.pushString(UIEventType.CHAT_BUBBLE, `🧠 ${t(DataResolver.getClueReaction(m.id))}`, 3000, simTime);
                break;

            case TriggerType.SPEAK:
                UIEventRingBuffer.pushString(UIEventType.CHAT_BUBBLE, t(DataResolver.getClueReaction(m.id)), 4000, simTime);
                break;

            case TriggerType.POI:
                // Only push discovery if it hasn't been discovered yet
                if (state && state.discoverySets && !state.discoverySets.pois.has(m.id)) {
                    UIEventRingBuffer.push(UIEventType.DISCOVERY, m.contentId, DiscoveryType.POI, simTime);
                    UIEventRingBuffer.pushString(UIEventType.CHAT_BUBBLE, t(DataResolver.getPoiReaction(m.id)), 4000, simTime);
                }
                break;

            case TriggerType.CLUE:
                if (state && state.discoverySets && !state.discoverySets.clues.has(m.id)) {
                    UIEventRingBuffer.push(UIEventType.DISCOVERY, m.contentId, DiscoveryType.CLUE, simTime);
                }
                break;

            case TriggerType.COLLECTIBLE:
                if (state && state.discoverySets && !state.discoverySets.collectibles.has(m.id)) {
                    UIEventRingBuffer.push(UIEventType.DISCOVERY, m.contentId, DiscoveryType.COLLECTIBLE, simTime);
                }
                break;
        }

        // --- FIRE ACTIONS ---
        if (m.actions && m.actions.length > 0) {
            for (let i = 0; i < m.actions.length; i++) {
                session.onAction(m.actions[i]);
            }
        }

        // --- AUTO-REMOVE IF 'ONCE' FLAG IS SET ---
        if (this.statusFlags[index] & TriggerStatus.ONCE) {
            this.activeFlags[index] = 0;
            this.activeCount--;
        }
    }
}
