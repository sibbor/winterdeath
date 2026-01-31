
import { useEffect } from 'react';
import { GameScreen } from '../types';
import { soundManager } from '../utils/sound';

interface UIState {
    isPaused: boolean;
    isMapOpen: boolean;
    showTeleportMenu: boolean;
    activeClue: any;
    isDialogueOpen: boolean;
    hp: number;
    isSettingsOpen: boolean;
}

interface UIActions {
    setIsPaused: (val: boolean) => void;
    setIsMapOpen: (val: boolean) => void;
    setShowTeleportMenu: (val: boolean) => void;
    setTeleportInitialCoords: (val: any) => void;
    onResume: () => void;
    setIsSettingsOpen: (val: boolean) => void;
    requestPointerLock?: () => void;
}


export const useGlobalInput = (
    screen: GameScreen,
    ui: UIState,
    actions: UIActions
) => {
    useEffect(() => {
        const handleInput = (e: KeyboardEvent) => {
            // ESC Logic
            if (e.key === 'Escape') {
                if (screen === GameScreen.CAMP) return;

                e.preventDefault();
                e.stopPropagation();

                if (ui.isMapOpen) {
                    actions.setIsMapOpen(false);
                    actions.setIsPaused(false);
                    actions.requestPointerLock?.();
                    soundManager.playUiClick();
                } else if (ui.showTeleportMenu) {
                    // Return to Map Screen instead of unpausing
                    actions.setShowTeleportMenu(false);
                    actions.setTeleportInitialCoords(null);
                    actions.setIsMapOpen(true);
                    // actions.setIsPaused(false); // Removed: Keep game paused on map
                    soundManager.playUiClick();
                } else if (ui.isSettingsOpen) {
                    actions.setIsSettingsOpen(false);
                    soundManager.playUiClick();
                } else if (ui.isPaused) {
                    actions.onResume();
                    // OnResume handles the lock in App.tsx usually, but we can double tap here if needed
                    // But onResume passed to this hook likely just sets state.
                    // Wait, App.tsx passes `() => setIsPaused(false)` as onResume to this hook.
                    // So we must handle lock here OR update the passed onResume.
                    // Let's rely on actions.requestPointerLock for consistency if it's not handled in onResume.
                    actions.requestPointerLock?.();
                } else if (screen === GameScreen.MISSION && !ui.activeClue && ui.hp > 0) {
                    actions.setIsPaused(true);
                }
            }
            // Map Logic (M)
            else if (e.key.toLowerCase() === 'm') {
                if (screen === GameScreen.MISSION && !ui.activeClue && !ui.isDialogueOpen && !ui.showTeleportMenu && ui.hp > 0) {
                    if (ui.isMapOpen) {
                        actions.setIsMapOpen(false);
                        actions.setIsPaused(false);
                        actions.requestPointerLock?.();
                        soundManager.playUiClick();
                    } else if (!ui.isPaused) {
                        // Only allow opening map if the game is not currently paused (e.g. Pause Menu)
                        actions.setIsMapOpen(true);
                        actions.setIsPaused(true);
                        soundManager.playUiConfirm();
                    }
                }
            }
        };

        window.addEventListener('keydown', handleInput, { capture: true });
        return () => window.removeEventListener('keydown', handleInput, { capture: true });
    }, [screen, ui.isPaused, ui.isMapOpen, ui.showTeleportMenu, ui.activeClue, ui.isDialogueOpen, ui.hp, actions]);
};
