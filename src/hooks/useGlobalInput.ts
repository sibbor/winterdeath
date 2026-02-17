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
    isInteractionOpen?: boolean;
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
        // [VINTERDÖD] Snabb-cull: Om vi är i lägret hanterar vi inte dessa globala inputs.
        if (screen === GameScreen.CAMP) return;

        const handleInput = (e: KeyboardEvent) => {
            const key = e.key;

            // --- ESC Logic ---
            if (key === 'Escape') {
                // If a dialogue or boss intro is active, let GameCanvas handle the ESC key
                if (ui.isDialogueOpen || ui.isBossIntroActive || ui.isInteractionOpen) return;

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
                    actions.setShowTeleportMenu(false);
                    actions.setTeleportInitialCoords(null);
                    actions.setIsMapOpen(true);
                    soundManager.playUiClick();
                } else if (ui.isSettingsOpen) {
                    actions.setIsSettingsOpen(false);
                    soundManager.playUiClick();
                } else if (ui.isAdventureLogOpen) {
                    actions.setIsAdventureLogOpen?.(false);
                    soundManager.playUiClick();
                } else if (ui.isPaused) {
                    actions.requestPointerLock?.();
                    actions.onResume();
                } else if (screen === GameScreen.SECTOR && ui.hp > 0) {
                    // [VINTERDÖD] Rensat i villkorsträdet för snabbare exekvering
                    if (!ui.activeCollectible && !ui.isDialogueOpen && !ui.isBossIntroActive && !ui.isAdventureLogOpen) {
                        actions.setIsPaused(true);
                        if (document.pointerLockElement) document.exitPointerLock();
                    }
                }
            }
            // --- Map Logic (M) ---
            // [VINTERDÖD] Undvik .toLowerCase() allokering. Kolla båda fallen direkt.
            else if (key === 'm' || key === 'M') {
                if (screen === GameScreen.SECTOR && !ui.activeCollectible && !ui.isDialogueOpen && !ui.showTeleportMenu && ui.hp > 0) {
                    if (ui.isMapOpen) {
                        actions.requestPointerLock?.();
                        actions.setIsMapOpen(false);
                        actions.setIsPaused(false);
                        soundManager.playUiClick();
                    } else if (!ui.isPaused) {
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

        // [VINTERDÖD] Håll matrisen så stabil som möjligt för att undvika onödiga re-binds.
    }, [screen, ui.isPaused, ui.isMapOpen, ui.showTeleportMenu, ui.activeCollectible, ui.isDialogueOpen, ui.isAdventureLogOpen, ui.isInteractionOpen, ui.hp, actions]);
};