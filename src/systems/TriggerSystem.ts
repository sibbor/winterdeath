import { WinterEngine } from '../core/engine/WinterEngine';
import { TriggerType, TriggerAction, TriggerStatus } from '../types/TriggerTypes';
import { System, SystemID } from './System';
import { DataResolver } from '../core/data/DataResolver';
import { UIEventRingBuffer, UIEventType, ChatBubbleSubtype, CHAT_BUBBLE_DURATIONS } from './ui/UIEventRingBuffer';
import { DiscoveryType } from '../components/ui/hud/HudTypes';
import { InteractionPromptId } from './ui/UIEventBridge';
import { WorldStreamer } from '../core/world/WorldStreamer';
import { TriggerShape, MAX_ENTITIES } from '../content/constants';
import { ClueType } from '../game/session/SectorTypes';

export class TriggerSystem implements System {
    readonly systemId = SystemID.TRIGGER_SYSTEM;
    id = 'trigger_system';
    enabled = true;
    persistent = false;
    isFixedStep = true;

    private readonly maxTriggers: number;
    private activeCount: number = 0;
    private streamer: WorldStreamer | null = null;

    // --- Struct of Arrays (SoA) ---
    private readonly activeFlags: Uint8Array;
    private readonly triggerTypes: Uint8Array;
    private readonly shapeTypes: Uint8Array;
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

    public readonly metadata: Array<{
        id: string | number;
        content: string;
        contentId: number;
        actions: TriggerAction[];
        familyId?: number;
        ownerId?: string;
        interactionPromptId?: InteractionPromptId;
        label?: string;
    }>;

    constructor(maxCapacity: number = MAX_ENTITIES.TRIGGERS) {
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

    public setStreamer(streamer: WorldStreamer): void {
        this.streamer = streamer;

        // Retroactive registration: Index all currently active triggers into the spatial grid
        for (let i = 0; i < this.maxTriggers; i++) {
            if (this.activeFlags[i] === 1) {
                const tx = this.positionsX[i];
                const tz = this.positionsZ[i];

                let radius = 5;
                if (this.shapeTypes[i] === TriggerShape.CIRCLE) {
                    radius = Math.sqrt(this.radiiSq[i]);
                } else if (this.shapeTypes[i] === TriggerShape.BOX) {
                    radius = Math.max(this.halfWidths[i], this.halfDepths[i]);
                }

                if (this.streamer) {
                    this.streamer.registerTrigger(i, tx - radius, tz - radius, tx + radius, tz + radius);
                }
            }
        }
    }

    /**
     * Re-syncs all active triggers with the world streamer.
     * Essential for cold-starts and sector transitions.
     */
    public syncWithStreamer(): void {
        if (!this.streamer) return;
        for (let i = 0; i < this.maxTriggers; i++) {
            if (this.activeFlags[i] === 1) {
                const tx = this.positionsX[i];
                const tz = this.positionsZ[i];
                let radius = 5;
                if (this.shapeTypes[i] === TriggerShape.CIRCLE) {
                    radius = Math.sqrt(this.radiiSq[i]);
                } else if (this.shapeTypes[i] === TriggerShape.BOX) {
                    radius = Math.max(this.halfWidths[i], this.halfDepths[i]);
                }
                this.streamer.registerTrigger(i, tx - radius, tz - radius, tx + radius, tz + radius);
            }
        }
    }

    public resetTriggerStates(): void {
        for (let i = 0; i < this.maxTriggers; i++) {
            if (this.activeFlags[i] === 1) {
                this.statusFlags[i] &= ~TriggerStatus.TRIGGERED;
                this.lastTriggerTimes[i] = 0;
            }
        }
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
            (m.actions as any)._count = 0;
            m.familyId = undefined;
            m.ownerId = undefined;
            m.interactionPromptId = undefined;
            m.label = undefined;
        }
    }

    /**
     * Batch registers an array of buffered triggers.
     * Use this after sector construction to sync buffered triggers into the SoA system.
     */
    public addTriggers(triggers: any[]): void {
        if (!triggers) return;
        const len = triggers.length;
        for (let i = 0; i < len; i++) {
            const t = triggers[i];
            this.addTrigger({
                id: t.id,
                type: t.type,
                x: t.position.x,
                y: (t.position as any).y || 0,
                z: t.position.z,
                radius: t.radius,
                size: t.size,
                rotation: t.rotation,
                statusFlags: t.statusFlags,
                content: t.content,
                actions: t.actions,
                repeatInterval: t.repeatInterval,
                familyId: t.familyId,
                ownerId: t.ownerId,
                interactionPromptId: t.interactionPromptId,
                label: t.label
            });
        }
    }

    public addTrigger(config: {
        id: string | number;
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
                    this.shapeTypes[i] = TriggerShape.BOX;
                    this.halfWidths[i] = config.size.width * 0.5;
                    this.halfDepths[i] = config.size.depth * 0.5;
                    this.radiiSq[i] = 0;
                } else {
                    this.shapeTypes[i] = TriggerShape.CIRCLE;
                    const r = config.radius || 5;
                    this.radiiSq[i] = r * r;
                    this.halfWidths[i] = 0;
                    this.halfDepths[i] = 0;
                }

                this.rotations[i] = config.rotation || 0;

                const m = this.metadata[i];
                m.id = config.id;
                m.content = config.content || '';
                m.contentId = 0;

                const mActions = m.actions as any;
                mActions._count = 0;
                if (config.actions) {
                    for (let j = 0; j < config.actions.length; j++) {
                        mActions[mActions._count++] = config.actions[j];
                    }
                }
                m.familyId = config.familyId;
                m.ownerId = config.ownerId;
                m.interactionPromptId = config.interactionPromptId;
                m.label = config.label;

                if (this.streamer) {
                    let minX, minZ, maxX, maxZ;
                    if (config.size) {
                        const hX = config.size.width * 0.5;
                        const hZ = config.size.depth * 0.5;
                        minX = config.x - hX;
                        minZ = config.z - hZ;
                        maxX = config.x + hX;
                        maxZ = config.z + hZ;
                    } else {
                        const r = config.radius || 5;
                        minX = config.x - r;
                        minZ = config.z - r;
                        maxX = config.x + r;
                        maxZ = config.z + r;
                    }
                    this.streamer.registerTrigger(i, minX, minZ, maxX, maxZ);
                }

                // [VINTERDÖD] Dynamic SMI Mapping: Register custom reaction keys at runtime
                if (config.content && config.id && (config.type === TriggerType.CLUE
                    || config.type === TriggerType.THOUGHT
                    || config.type === TriggerType.SPEAK)) {
                    DataResolver.registerReaction(config.id, config.content);
                }

                return i;
            }
        }

        return -1;
    }

    public addTriggerPrimitive(
        id: string | number,
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
                this.shapeTypes[i] = TriggerShape.CIRCLE;
                this.radiiSq[i] = radius * radius;
                this.halfWidths[i] = 0;
                this.halfDepths[i] = 0;
                this.rotations[i] = 0;
                this.repeatIntervals[i] = 0;
                this.lastTriggerTimes[i] = 0;

                const m = this.metadata[i];
                m.id = id;
                m.content = content;
                m.contentId = 0;
                (m.actions as any)._count = 0;
                m.familyId = undefined;
                m.ownerId = undefined;
                m.interactionPromptId = interactionPromptId;
                m.label = label;

                if (this.streamer) {
                    this.streamer.registerTrigger(i, x - radius, z - radius, x + radius, z + radius);
                }

                // [VINTERDÖD] Dynamic SMI Mapping: Register custom reaction keys at runtime
                if (content && id && (type === TriggerType.CLUE
                    || type === TriggerType.THOUGHT || type === TriggerType.SPEAK)) {
                    DataResolver.registerReaction(id, content);
                }

                return i;
            }
        }
        return -1;
    }

    public clear(): void {
        this.activeFlags.fill(0);
        this.statusFlags.fill(0);
        this.activeCount = 0;

        // Zero-GC: Clear metadata references to allow GC of actions/strings
        for (let i = 0; i < this.maxTriggers; i++) {
            const m = this.metadata[i];
            m.id = '';
            m.content = '';
            m.contentId = 0;
            const mActions = m.actions as any;
            if (mActions) mActions._count = 0;
            m.familyId = undefined;
            m.ownerId = undefined;
            m.interactionPromptId = undefined;
            m.label = undefined;
        }

        if (this.streamer) {
            this.streamer.clearTriggers();
        }
    }

    public removeTrigger(index: number): void {
        const idx = index | 0;
        if (idx < 0 || idx >= this.maxTriggers) return;
        if (this.activeFlags[idx] === 1) {
            this.activeFlags[idx] = 0;
            this.activeCount--;
        }
    }

    public getTriggerById(id: string | number): number {
        for (let i = 0; i < this.maxTriggers; i++) {
            if (this.activeFlags[i] === 1 && this.metadata[i].id === id) {
                return i | 0;
            }
        }
        return -1;
    }

    public isTriggered(index: number): boolean {
        const idx = index | 0;
        if (idx < 0 || idx >= this.maxTriggers) return false;
        return ((this.statusFlags[idx] | 0) & (TriggerStatus.TRIGGERED | 0)) !== 0;
    }

    public setStatusFlag(index: number, flag: number, active: boolean): void {
        const idx = index | 0;
        if (idx < 0 || idx >= this.maxTriggers) return;
        if (active) {
            this.statusFlags[idx] = (this.statusFlags[idx] | flag) | 0;
        } else {
            this.statusFlags[idx] = (this.statusFlags[idx] & ~flag) | 0;
        }
    }

    public update(session: any, delta: number): void {
        if (!this.enabled) return;

        const engine = WinterEngine.getInstance();
        const simTime = engine.simTime;
        const playerPos = session.playerPos;
        if (!playerPos) return;

        if (this.streamer) {
            const poolIdx = this.streamer.getTriggerPool().nextIndex();
            this.streamer.getNearbyTriggers(playerPos.x, playerPos.z, 50, poolIdx);

            const nearby = this.streamer.getTriggerPool().getPool(poolIdx);
            const nearCount = this.streamer.getTriggerPool().getCount(poolIdx);

            for (let j = 0; j < nearCount; j++) {
                const i = nearby[j] | 0;
                if (this.activeFlags[i] === 0) continue;

                const status = this.statusFlags[i] | 0;
                if (!(status & TriggerStatus.ACTIVE)) continue;
                if ((status & TriggerStatus.TRIGGERED) && !(status & TriggerStatus.REPEATABLE)) continue;

                if ((status & TriggerStatus.REPEATABLE) && this.repeatIntervals[i] > 0) {
                    if (simTime - this.lastTriggerTimes[i] < this.repeatIntervals[i]) continue;
                }

                let isInside = false;
                const tx = this.positionsX[i];
                const tz = this.positionsZ[i];
                const shape = this.shapeTypes[i] | 0;

                if (shape === TriggerShape.CIRCLE) {
                    const dx = playerPos.x - tx;
                    const dz = playerPos.z - tz;
                    const distSq = dx * dx + dz * dz;
                    isInside = distSq < this.radiiSq[i];
                } else if (shape === TriggerShape.BOX) {
                    const dx = Math.abs(playerPos.x - tx);
                    const dz = Math.abs(playerPos.z - tz);
                    isInside = dx < this.halfWidths[i] && dz < this.halfDepths[i];
                }

                if (isInside) {
                    this.trigger(i, session);
                }
            }
        }
    }

    private trigger(index: number, session: any): void {
        const idx = index | 0;
        const engine = WinterEngine.getInstance();
        const simTime = engine.simTime;

        this.statusFlags[idx] = (this.statusFlags[idx] | TriggerStatus.TRIGGERED) | 0;
        this.lastTriggerTimes[idx] = simTime;

        const m = this.metadata[idx];
        const type = this.triggerTypes[idx] | 0;
        const state = session.state;

        console.log("Triggered:", type, m.id);

        switch (type) {
            case TriggerType.CLUE: {
                const clue = DataResolver.getClues()[m.id as any];
                if (clue) {
                    const clueSmi = clue.id | 0;
                    session.handleDiscovery(DiscoveryType.CLUE, m.id, clueSmi);

                    const subType = clue.type === ClueType.SPEAK ? ChatBubbleSubtype.SPEAK : ChatBubbleSubtype.THOUGHT;
                    const duration = CHAT_BUBBLE_DURATIONS[subType];
                    const encodedP2 = duration | (subType << 16);

                    UIEventRingBuffer.push(
                        UIEventType.CHAT_BUBBLE,
                        clue.id,
                        encodedP2,
                        simTime
                    );
                }
                break;
            }

            case TriggerType.POI: {
                const poi = DataResolver.getPois()[m.id as any];
                const poiSmi = poi ? poi.id : 0;
                session.handleDiscovery(DiscoveryType.POI, m.id, poiSmi);

                const duration = CHAT_BUBBLE_DURATIONS[ChatBubbleSubtype.SPEAK];
                const encodedP2 = duration | (ChatBubbleSubtype.SPEAK << 16);
                UIEventRingBuffer.push(
                    UIEventType.CHAT_BUBBLE,
                    poiSmi,
                    encodedP2,
                    simTime
                );
                break;
            }

            case TriggerType.COLLECTIBLE: {
                const col = DataResolver.getCollectibles()[m.id as any];
                const colSmi = col ? col.id : 0;
                session.handleDiscovery(DiscoveryType.COLLECTIBLE, m.id, colSmi);
                break;
            }
        }

        const mActions = m.actions as any;
        const actionCount = mActions._count | 0;
        if (actionCount > 0) {
            for (let i = 0; i < actionCount; i++) {
                session.onAction(mActions[i]);
            }
        }

        // SÄKERHET: Frigör slottet omedelbart om det är en engångstrigger
        if ((this.statusFlags[idx] | 0) & (TriggerStatus.ONCE | 0)) {
            this.activeFlags[idx] = 0;
            this.activeCount--;
        }
    }
}