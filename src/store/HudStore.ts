import { HudState, DiscoveryType } from '../components/ui/hud/HudTypes';
import { WeaponType } from '../content/weapons';
import { InteractionType } from '../systems/InteractionTypes';

// ============================================================================
// INITIAL STATE
// Mirrored perfectly from HudSystem's Double-Buffer structure.
// This ensures that the first React render has valid objects to read from,
// preventing "cannot read property x of null" errors.
// ============================================================================
const INITIAL_HUD_STATE: HudState = {
    statsBuffer: new Float32Array(64), // Expanded for Phase 12
    vectorBuffer: new Float32Array(256), // 128 entities (x, z pairs)
    statusFlags: 0,
    hp: 100,
    maxHp: 100,
    stamina: 100,
    maxStamina: 100,
    ammo: 0,
    magSize: 0,
    score: 0,
    scrap: 0,
    challengePoints: 0,
    multiplier: 1,
    activeWeapon: WeaponType.PISTOL,
    isReloading: false,
    boss: { active: false, name: '', hp: 0, maxHp: 0 },
    bossSpawned: false,
    bossDefeated: false,
    familyFound: false,
    familySignal: 0,
    level: 1,
    currentXp: 0,
    nextLevelXp: 1000,
    throwableAmmo: 0,
    reloadProgress: 0,
    playerPos: { x: 0, z: 0 },
    familyPos: { x: 0, z: 0 },
    bossPos: { x: 0, z: 0 },
    distanceTraveled: 0,
    kills: 0,
    spEarned: 0,
    isDead: false,
    isDriving: false,
    vehicleSpeed: 0,
    throttleState: 0,
    currentSector: 0,
    cluesFoundCount: 0,
    poisFoundCount: 0,
    collectiblesFoundCount: 0,
    fps: 60,
    sectorStats: { unlimitedAmmo: false, unlimitedThrowables: false, isInvincible: false, waveActive: false, waveKills: 0, waveTarget: 0, currentWave: 1, totalWaves: 1 },
    statusEffects: [],
    isDisoriented: false,
    activePassives: [],
    activeBuffs: [],
    activeDebuffs: [],
    killerName: '',
    killerAttackName: '',
    killedByEnemy: false,
    mapItems: [],
    debugMode: false,
    systems: [],
    currentLine: { active: false, speaker: '', text: '' },
    cinematicActive: false,
    interactionPrompt: { active: false, type: InteractionType.NONE, label: '', x: 0, y: 0, targetId: '' },
    hudVisible: false,
    sectorName: '',
    isMobileDevice: false,
    discovery: { active: false, id: '', type: DiscoveryType.CLUE, title: '', details: '', timestamp: 0 },
    
    // Real-time telemetry (Synced from persistent stats + session)
    enemyKills: new Float64Array(16),
    seenEnemies: [],
    seenBosses: [],

    // Death details
    lethalSourceId: 0,
    lethalStatusEffect: 0,

    // Nested structures pre-allocated to lock Hidden Class "Shapes"
    debugInfo: {
        aim: { x: 0, y: 0 },
        input: { w: 0, a: 0, s: 0, d: 0, fire: 0, reload: 0 },
        cam: { x: 0, y: 0, z: 0 },
        camera: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, fov: 0 },
        modes: 'Standard',
        enemies: 0,
        objects: 0,
        drawCalls: 0,
        coords: { x: 0, z: 0 },
            performance: {
            cpu: null,
            memory: { heapLimit: 0, heapTotal: 0, heapUsed: 0 },
            renderer: null
        }
    },
    challengeTiers: new Int32Array(64)
};

type Listener = (state: HudState) => void;
export type HudFastUpdateListener = (data: any) => void;

class HudStoreClass {
    private state: HudState = INITIAL_HUD_STATE;
    
    // VINTERDÖD: Standby buffer for Zero-GC reference swapping.
    private standbyState: HudState = {
        ...INITIAL_HUD_STATE,
        statsBuffer: new Float32Array(64),
        vectorBuffer: new Float32Array(256),
        enemyKills: new Float64Array(16),
        statusEffects: [],
        activePassives: [],
        activeBuffs: [],
        activeDebuffs: [],
        mapItems: [],
        systems: [],
        challengeTiers: new Int32Array(64)
    };
    
    // PERFORMANCE: Version tracking for reference stability.
    private versions = {
        statusEffects: -1,
        activePassives: -1,
        activeBuffs: -1,
        activeDebuffs: -1,
        mapItems: -1
    };

    private listeners: Listener[] = [];
    private fastListeners: HudFastUpdateListener[] = [];

    /**
     * Absolute Zero-GC Update Path.
     * Synchronizes state between the engine buffer and the React state.
     */
    public update(nextState: HudState): void {
        // 1. Manual Copy of Primitives (Avoids Object.assign and spread GC)
        const src = nextState as any;
        const dst = this.standbyState as any;
        
        // VINTERDÖD: Explicit copy of critical telemetry primitives
        dst.hp = src.hp;
        dst.maxHp = src.maxHp;
        dst.stamina = src.stamina;
        dst.maxStamina = src.maxStamina;
        dst.ammo = src.ammo;
        dst.kills = src.kills;
        dst.scrap = src.scrap;
        dst.challengePoints = src.challengePoints;
        dst.spEarned = src.spEarned;
        dst.isDead = src.isDead;
        dst.isDriving = src.isDriving;
        dst.activeWeapon = src.activeWeapon;
        dst.hudVisible = src.hudVisible;
        dst.level = src.level;
        dst.currentXp = src.currentXp;
        dst.nextLevelXp = src.nextLevelXp;
        dst.cinematicActive = src.cinematicActive;
        dst.isDisoriented = src.isDisoriented;

        // Nested Object Property Sync (Zero-GC / Shape Stable)
        dst.discovery.active = src.discovery.active;
        dst.discovery.id = src.discovery.id;
        dst.discovery.type = src.discovery.type;
        dst.discovery.title = src.discovery.title;
        dst.discovery.details = src.discovery.details;
        dst.discovery.timestamp = src.discovery.timestamp;

        dst.currentLine.active = src.currentLine.active;
        dst.currentLine.speaker = src.currentLine.speaker;
        dst.currentLine.text = src.currentLine.text;

        dst.interactionPrompt.active = src.interactionPrompt.active;
        dst.interactionPrompt.type = src.interactionPrompt.type;
        dst.interactionPrompt.label = src.interactionPrompt.label;
        dst.interactionPrompt.x = src.interactionPrompt.x;
        dst.interactionPrompt.y = src.interactionPrompt.y;
        dst.interactionPrompt.targetId = src.interactionPrompt.targetId;

        dst.boss.active = src.boss.active;
        dst.boss.name = src.boss.name;
        dst.boss.hp = src.boss.hp;
        dst.boss.maxHp = src.boss.maxHp;
        
        // 2. Version-Gated Array Sync (Smart Cloning)
        // We only allocate a new array reference when the logical content changes.
        if (src._effVersion !== this.versions.statusEffects) {
            dst.statusEffects = [...src.statusEffects];
            this.versions.statusEffects = src._effVersion;
        } else {
            dst.statusEffects = this.state.statusEffects; // Keep reference stable
        }
        
        if (src._mapVersion !== this.versions.mapItems) {
            dst.mapItems = [...src.mapItems];
            this.versions.mapItems = src._mapVersion;
        } else {
            dst.mapItems = this.state.mapItems;
        }

        // Copy persistent buffers (TypedArrays are already stable, we just copy contents if needed, 
        // but here we just copy the reference if they are the same buffers)
        dst.statsBuffer = src.statsBuffer;
        dst.vectorBuffer = src.vectorBuffer;
        dst.challengeTiers = src.challengeTiers;
        
        // 3. Pointer Swap
        const prev = this.state;
        this.state = this.standbyState;
        this.standbyState = prev;

        this.notifyListeners();
    }

    /**
     * Patch method for one-off event updates.
     */
    public patch(changes: Partial<HudState>): void {
        // Only used for sparse updates outside the main loop.
        Object.assign(this.state, changes);
        this.notifyListeners();
    }

    public setHudVisible(visible: boolean): void {
        if (this.state.hudVisible !== visible) {
            this.state.hudVisible = visible;
            this.notifyListeners();
        }
    }

    public setDiscovery(discovery: any): void {
        this.state.discovery = discovery;
        this.notifyListeners();
    }

    /**
     * Synchronous getter for current state.
     * Used by useSyncExternalStore to get the current buffer.
     */
    public getState(): HudState {
        return this.state;
    }

    /**
     * Subscribes a listener (usually a React update trigger).
     * Returns a Zero-GC cleanup function.
     */
    public subscribe(listener: Listener): () => void {
        this.listeners.push(listener);

        // Immediate notify to prevent UI "pop-in" or flickering on mount
        listener(this.state);

        return () => {
            const index = this.listeners.indexOf(listener);
            if (index !== -1) {
                // Zero-GC Swap-and-Pop Strategy:
                // Instead of splice (which creates a new array and shifts indices),
                // we move the last element to the target index and truncate.
                const lastIndex = this.listeners.length - 1;
                if (index !== lastIndex) {
                    this.listeners[index] = this.listeners[lastIndex];
                }
                this.listeners.pop();
            }
        };
    }

    /**
     * Subscribes to high-frequency (120FPS) telemetry updates.
     * ZERO-GC: Bypasses React and the browser event bus entirely.
     */
    public subscribeFastUpdate(listener: HudFastUpdateListener): () => void {
        this.fastListeners.push(listener);
        return () => {
            const index = this.fastListeners.indexOf(listener);
            if (index !== -1) {
                const lastIndex = this.fastListeners.length - 1;
                if (index !== lastIndex) this.fastListeners[index] = this.fastListeners[lastIndex];
                this.fastListeners.pop();
            }
        };
    }

    /**
     * Emits a high-frequency telemetry update block to all subscribers.
     * Called directly by HudSystem.emitFastUpdate.
     * ZERO-GC: Transmits data as a reference without allocating Event objects.
     */
    public emitFastUpdate(data: any): void {
        const len = this.fastListeners.length;
        for (let i = 0; i < len; i++) {
            this.fastListeners[i](data);
        }
    }

    /**
     * Performance-Hardened triggers for virtual inputs.
     * Currently still uses window events for inter-system compatibility, 
     * but could be migrated to a dedicated input registry if needed.
     */
    public triggerInteraction(pressed: boolean): void {
        // Note: Interaction triggers are low-frequency compared to 120fps telemetry
        window.dispatchEvent(new CustomEvent('hud-virtual-key', { 
            detail: { key: 'e', pressed } 
        }));
    }

    /**
     * Trigger any virtual key pulse.
     */
    public triggerVirtualKey(key: string, pressed: boolean): void {
        window.dispatchEvent(new CustomEvent('hud-virtual-key', { 
            detail: { key, pressed } 
        }));
    }

    /**
     * Internal zero-GC loop to notify all subscribers.
     */
    private notifyListeners(): void {
        const len = this.listeners.length;
        for (let i = 0; i < len; i++) {
            this.listeners[i](this.state);
        }
    }
}

export const HudStore = new HudStoreClass();