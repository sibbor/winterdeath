/**
 * Messaging & Bridge Contracts
 * 
 * Centralized SMI (Small Integer) enums to avoid fragmented module boundaries.
 * Using numeric enums ensures V8 SMI optimization and O(1) jump-table performance.
 */

export enum InteractionType {
    NONE = 0,
    COLLECTIBLE = 1,
    CHEST = 2,
    VEHICLE = 3,
    SECTOR_SPECIFIC = 4,
}

export enum InteractionSubType {
    NONE = 0,
    CHEST = 1,
    BIG_CHEST = 2,
    TERMINAL = 3,
    PLANT_EXPLOSIVE = 10,
    KNOCK_ON_PORT = 11
}

export enum InteractionShape {
    BOX = 0,
    SPHERE = 1
}

export enum InteractionPromptId {
    NONE = 0,
    ENTER_VEHICLE = 1,
    EXIT_VEHICLE = 2,
    PICKUP_COLLECTIBLE = 3,
    OPEN_CHEST = 4,
    INTERACT = 5,
    PLANT_EXPLOSIVE = 6,
    KNOCK_ON_PORT = 7
}

export enum MetaActionId {
    NONE = 0,
    TOGGLE_PAUSE = 1,
    TOGGLE_MAP = 2,
    TOGGLE_ADVENTURE_LOG = 3,
    RESTART_SECTOR = 4,
    QUIT_TO_MENU = 5,
    INTERACT_TAP = 6,     // Simulated 'E' tap from UI
    RELOAD_TAP = 7,       // Simulated 'R' tap from UI
    WEAPON_SLOT_1 = 10,   // Key '1'
    WEAPON_SLOT_2 = 11,   // Key '2'
    WEAPON_SLOT_3 = 12,   // Key '3'
    WEAPON_SLOT_4 = 13,   // Key '4'
    WEAPON_SLOT_5 = 14,   // Key '5'

    // --- NAVIGATION ACTIONS (Engine -> UI) ---
    NAV_BACK = 20,        // [ESC] pressed
    NAV_CONFIRM = 21,     // [ENTER] pressed
    NAV_MAP = 22,         // [M] pressed
    NAV_LOG = 23,         // [L] pressed

    TOGGLE_FLASHLIGHT = 30
}

/**
 * UI Event Bridge
 * 
 * Centralized, Zero-GC communication hub using SMI (Small Integer) scratchpads.
 * This bypasses the browser's expensive Event system and React's re-render cycle
 * for high-frequency interaction and telemetry data.
 */

// --- PERFORMANCE: Shared SMI Scratchpad (Zero-GC) ---
// We use a fixed-size buffer to store real-time state that doesn't need a history (Ring Buffer).
// Index 0: Interaction Prompt ID (Engine -> UI)
// Index 1: Interaction Trigger State (UI -> Engine, 1=Pressed, 0=Released)
// Index 2: UI-to-Engine Action (e.g., Slot Swap, Menu Trigger)
// Index 3: Engine-to-UI Signal (e.g., [ESC] Navigation)
const _smiBuffer = new Int32Array(16);

export enum SMI_INDEX {
    INTERACTION_PROMPT = 0,
    INTERACTION_TRIGGER = 1,
    UI_TO_ENGINE_ACTION = 2,
    ENGINE_TO_UI_SIGNAL = 3
}

export const UIEventBridge = {
    /**
     * Engine -> UI: Sets the current interaction prompt to be displayed.
     */
    setInteractionPrompt: (promptId: InteractionPromptId) => {
        _smiBuffer[SMI_INDEX.INTERACTION_PROMPT] = promptId;
    },

    /**
     * UI -> Engine: Polls the current prompt ID.
     */
    getInteractionPrompt: (): InteractionPromptId => {
        return _smiBuffer[SMI_INDEX.INTERACTION_PROMPT] as InteractionPromptId;
    },

    /**
     * UI -> Engine: Sets the interaction trigger state (e.g., Virtual E button).
     * Replaces the expensive window.dispatchEvent() path.
     */
    setInteractionTrigger: (pressed: boolean) => {
        _smiBuffer[SMI_INDEX.INTERACTION_TRIGGER] = pressed ? 1 : 0;
    },

    /**
     * Engine -> UI: Polls the trigger state.
     */
    getInteractionTrigger: (): boolean => {
        return _smiBuffer[SMI_INDEX.INTERACTION_TRIGGER] === 1;
    },

    /**
     * UI -> Engine: Triggers a high-level action from UI to Engine.
     */
    triggerUiAction: (actionId: MetaActionId) => {
        _smiBuffer[SMI_INDEX.UI_TO_ENGINE_ACTION] = actionId;
    },

    /**
     * Engine -> UI: Polls and consumes the current UI action.
     */
    consumeUiAction: (): MetaActionId => {
        const actionId = _smiBuffer[SMI_INDEX.UI_TO_ENGINE_ACTION] as MetaActionId;
        if (actionId !== MetaActionId.NONE) {
            _smiBuffer[SMI_INDEX.UI_TO_ENGINE_ACTION] = MetaActionId.NONE;
        }
        return actionId;
    },

    /**
     * Engine -> UI: Signals a navigation event (e.g., ESC, ENTER) to the UI.
     */
    signalEngineEvent: (actionId: MetaActionId) => {
        _smiBuffer[SMI_INDEX.ENGINE_TO_UI_SIGNAL] = actionId;
    },

    /**
     * UI -> Engine: Polls and consumes the current Engine signal.
     */
    consumeEngineSignal: (): MetaActionId => {
        const actionId = _smiBuffer[SMI_INDEX.ENGINE_TO_UI_SIGNAL] as MetaActionId;
        if (actionId !== MetaActionId.NONE) {
            _smiBuffer[SMI_INDEX.ENGINE_TO_UI_SIGNAL] = MetaActionId.NONE;
        }
        return actionId;
    },

    /**
     * Resets all SMI states.
     */
    clear: () => {
        _smiBuffer.fill(0);
    }
};
