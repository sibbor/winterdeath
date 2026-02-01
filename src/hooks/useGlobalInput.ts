
import { useEffect } from 'react';
import { GameScreen } from '../types';
import { soundManager } from '../utils/sound';

interface UIState {
    isPaused: boolean;
    isMapOpen: boolean;
    showTeleportMenu: boolean;
    activeClue: any;
    isDialogueOpen: boolean;
    isBossIntroActive?: boolean;
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
    setActiveClue?: (val: any) => void;
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

                // If a dialogue or boss intro is active, let GameCanvas handle the ESC key
                if (ui.isDialogueOpen || ui.isBossIntroActive) return;

                e.preventDefault();
                e.stopPropagation();

                if (ui.isMapOpen) {
                    actions.requestPointerLock?.();
                    actions.setIsMapOpen(false);
                    actions.setIsPaused(false);
                    soundManager.playUiClick();
                } else if (ui.activeClue) {
                    actions.requestPointerLock?.();
                    actions.setActiveClue?.(null);
                    actions.setIsPaused(false);
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
                } else if (screen === GameScreen.SECTOR && !ui.activeClue && !ui.isDialogueOpen && !ui.isBossIntroActive && ui.hp > 0) {
                    actions.setIsPaused(true);
                    // DO NOT request lock here. We want to unlock or stay unlocked.
                }
            }
            // Map Logic (M)
            else if (e.key.toLowerCase() === 'm') {
                if (screen === GameScreen.SECTOR && !ui.activeClue && !ui.isDialogueOpen && !ui.showTeleportMenu && ui.hp > 0) {
                    if (ui.isMapOpen) {
                        actions.requestPointerLock?.();
                        actions.setIsMapOpen(false);
                        actions.setIsPaused(false);
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
