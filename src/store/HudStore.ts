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
    skillPoints: 0,
    isDead: false,
    isDriving: false,
    vehicleSpeed: 0,
    throttleState: 0,
    currentSector: 0,
    cluesFoundCount: 0,
    poisFoundCount: 0,
    fps: 60,
    sectorStats: { unlimitedAmmo: false, unlimitedThrowables: false, isInvincible: false, hordeTarget: 0, zombiesKilled: 0, zombiesKillTarget: 0, zombieWaveActive: false },
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
    }
};

type Listener = (state: HudState) => void;
export type HudFastUpdateListener = (data: any) => void;

class HudStoreClass {
    private state: HudState = INITIAL_HUD_STATE;
    // Standby buffer for Zero-GC patch mutations. 
    // VINTERDÖD FIX: We MUST ensure nested arrays have unique references 
    // otherwise React's shallow checks skip re-renders for lists.
    private standbyState: HudState = {
        ...INITIAL_HUD_STATE,
        statsBuffer: new Float32Array(64),
        vectorBuffer: new Float32Array(256),
        statusEffects: [],
        activePassives: [],
        activeBuffs: [],
        activeDebuffs: [],
        mapItems: [],
        systems: []
    };
    private listeners: Listener[] = [];
    private fastListeners: HudFastUpdateListener[] = [];

    /**
     * Updates the store with a completely new HUD buffer.
     * Called at 60/120 FPS by the WinterEngine loop.
     * PERFORMANCE: Since we use Double-Buffering in the HudSystem, we simply
     * swap the reference here. React's useSyncExternalStore will detect the
     * reference change (=== check) and trigger the UI update.
     */
    public update(nextState: HudState): void {
        // PERFORMANCE (VINTERDÖD FIX): 
        // If we simply set this.state = nextState, and nextState is always the 
        // same memory reference (the pooled _current), React's useSyncExternalStore 
        // will SKIP the update. We MUST use the ping-pong buffer to force a re-render.
        this.patch(nextState);
    }

    /**
     * Zero-GC alternative to the spread operator (...state).
     * Mutates a standby buffer and swaps pointers to trigger React renders
     * without allocating new objects in memory. Perfect for one-off events.
     */
    public patch(changes: Partial<HudState>): void {
        // 1. Copy current state and apply changes into the standby buffer (in-place mutation)
        Object.assign(this.standbyState, this.state, changes);
 
        // 1.5 VINTERDÖD FIX: Clone array references to force React re-renders for lists.
        // Even if we are Zero-GC focussed, React REQUIRES reference changes for consistency.
        if (changes.statusEffects) this.standbyState.statusEffects = [...changes.statusEffects];
        if (changes.activeBuffs) this.standbyState.activeBuffs = [...changes.activeBuffs];
        if (changes.activeDebuffs) this.standbyState.activeDebuffs = [...changes.activeDebuffs];
        if (changes.activePassives) this.standbyState.activePassives = [...changes.activePassives];
        if (changes.mapItems) this.standbyState.mapItems = [...changes.mapItems];
 
        // 2. Pointer swap (Ping-Pong) to give React a "new" root object
        const temp = this.state;
        this.state = this.standbyState;
        this.standbyState = temp;

        // 3. Trigger UI update
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