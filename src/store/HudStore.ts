import { HudState } from '../types/hud';
import { WeaponType } from '../content/weapons';

// ============================================================================
// INITIAL STATE
// Mirrored perfectly from HudSystem's Double-Buffer structure.
// This ensures that the first React render has valid objects to read from,
// preventing "cannot read property x of null" errors.
// ============================================================================
const INITIAL_HUD_STATE: HudState = {
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
    boss: null,
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
    familyPos: null,
    bossPos: null,
    distanceTraveled: 0,
    kills: 0,
    spEarned: 0,
    skillPoints: 0,
    isDead: false,
    isDriving: false,
    vehicleSpeed: 0,
    throttleState: 0,
    fps: 60,
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
    currentLine: null,
    cinematicActive: false,
    interactionPrompt: null,

    // Nested structures pre-allocated to lock Hidden Class "Shapes"
    sectorStats: null,
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

class HudStoreClass {
    private state: HudState = INITIAL_HUD_STATE;
    private listeners: Listener[] = [];

    /**
     * Updates the store with new HUD data.
     * Called at 60/120 FPS by the WinterEngine loop.
     * * PERFORMANCE: Since we use Double-Buffering in the HudSystem, we simply
     * swap the reference here. React's useSyncExternalStore will detect the
     * reference change (=== check) and trigger the UI update.
     */
    public update(nextState: HudState): void {
        this.state = nextState;

        // Zero-GC Loop: Caching length to minimize property access overhead
        const len = this.listeners.length;
        for (let i = 0; i < len; i++) {
            this.listeners[i](this.state);
        }
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
}

export const HudStore = new HudStoreClass();