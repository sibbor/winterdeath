
/**
 * Utility function to check if the current device is a mobile device.
 * Checks both user agent and screen width.
 */
export const isMobile = (): boolean => {
    if (typeof window === 'undefined') return false;

    // Check user agent for common mobile patterns
    const uaCheck = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // Check screen width (typical breakpoint for mobile/tablet)
    const widthCheck = window.innerWidth < 1024; // Increased from 800 to cover tablets

    // Check for touch capability
    const touchCheck = window.matchMedia('(pointer: coarse)').matches;

    // We only consider it mobile if it's a mobile UA, OR if it's a small screen WITH touch capability
    return uaCheck || (widthCheck && touchCheck);
};

// --- Wake Lock API ---
let wakeLock: any = null;

/**
 * Request a screen wake lock to prevent the device from sleeping.
 * This is particularly useful for mobile games where touch input might be sparse
 * or when the game is being played with a controller.
 */
export const requestWakeLock = async () => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
        console.warn('Screen Wake Lock API not supported.');
        return;
    }

    try {
        wakeLock = await (navigator as any).wakeLock.request('screen');
        // console.log('Wake Lock active.');

        wakeLock.addEventListener('release', () => {
            // console.log('Wake Lock released.');
            wakeLock = null;
        });
    } catch (err: any) {
        console.error(`${err.name}, ${err.message}`);
    }
};

/**
 * Release the currently active screen wake lock.
 */
export const releaseWakeLock = () => {
    if (wakeLock !== null) {
        wakeLock.release()
            .then(() => {
                wakeLock = null;
            })
            .catch((err: any) => {
                console.error(`Failed to release wake lock: ${err.name}, ${err.message}`);
            });
    }
};

// Handle visibility change to re-acquire lock
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', async () => {
        if (wakeLock !== null && document.visibilityState === 'visible') {
            await requestWakeLock();
        }
    });
}
