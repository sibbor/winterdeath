
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
