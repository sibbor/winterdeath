/**
 * HapticManager — thin wrapper around navigator.vibrate().
 * Silently no-ops on desktop or when the Vibration API is unavailable.
 */

const canVibrate = (): boolean =>
    typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function';

const doVibrate = (pattern: number | number[]) => {
    if (canVibrate()) {
        try {
            navigator.vibrate(pattern);
        } catch (e) {
            // Silently fail if blocked by browser policy
        }
    }
};

export const haptic = {
    /** Short pulse — fired on every gun shot. */
    gunshot(): void {
        doVibrate(30);
    },

    /** Two-stage pulse — mag out then mag in feel. */
    reload(): void {
        doVibrate([50, 30, 80]);
    },

    /** Brief tap — weapon swap. */
    weaponSwap(): void {
        doVibrate(20);
    },

    /** Heavy rumble — grenade, boss, misc explosion. */
    explosion(): void {
        doVibrate([80, 40, 120]);
    },
};
