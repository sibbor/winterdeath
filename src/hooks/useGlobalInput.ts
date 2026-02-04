
import { useEffect } from 'react';
import { GameScreen } from '../types';
import { soundManager } from '../utils/sound';

interface UIState {
    isPaused: boolean;
    isMapOpen: boolean;
    showTeleportMenu: boolean;
    activeCollectible: any;
    isDialogueOpen: boolean;
    isBossIntroActive?: boolean;
    hp: number;
    isSettingsOpen: boolean;
    isAdventureLogOpen: boolean;
}

interface UIActions {
    setIsPaused: (val: boolean) => void;
    setIsMapOpen: (val: boolean) => void;
    setShowTeleportMenu: (val: boolean) => void;
    setTeleportInitialCoords: (val: any) => void;
    onResume: () => void;
    setIsSettingsOpen: (val: boolean) => void;
    setIsAdventureLogOpen?: (val: boolean) => void;
    setActiveCollectible?: (val: any) => void;
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
                } else if (ui.activeCollectible) {
                    actions.requestPointerLock?.();
                    actions.setActiveCollectible?.(null);
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
                } else if (ui.isAdventureLogOpen) {
                    actions.setIsAdventureLogOpen?.(false);
                    soundManager.playUiClick();
                } else if (ui.isPaused) {
                    // Try to lock FIRST before state changes (which might unmount UI)
                    actions.requestPointerLock?.();
                    actions.onResume();
                } else if (screen === GameScreen.SECTOR && !ui.activeCollectible && !ui.isDialogueOpen && !ui.isBossIntroActive && ui.hp > 0 && !ui.isAdventureLogOpen) {
                    actions.setIsPaused(true);
                    if (document.pointerLockElement) document.exitPointerLock();
                }
            }
            // Map Logic (M)
            else if (e.key.toLowerCase() === 'm') {
                if (screen === GameScreen.SECTOR && !ui.activeCollectible && !ui.isDialogueOpen && !ui.showTeleportMenu && ui.hp > 0) {
                    if (ui.isMapOpen) {
                        actions.requestPointerLock?.();
                        actions.setIsMapOpen(false);
                        actions.setIsPaused(false);
                        soundManager.playUiClick();
                    } else if (!ui.isPaused) {
                        // Only allow opening map if the game is not currently paused (e.g. Pause Menu)
                        actions.setIsMapOpen(true);
                        actions.setIsPaused(true);
                        if (document.pointerLockElement) document.exitPointerLock();
                        soundManager.playUiConfirm();
                    }
                }
            }
        };

        window.addEventListener('keydown', handleInput, { capture: true });
        return () => window.removeEventListener('keydown', handleInput, { capture: true });
    }, [screen, ui.isPaused, ui.isMapOpen, ui.showTeleportMenu, ui.activeCollectible, ui.isDialogueOpen, ui.isAdventureLogOpen, ui.hp, actions]);
};
