import { t } from '../../utils/i18n';

/**
 * FormatUtils
 * 
 * Centralized string formatting for the UI layer. 
 * Warning: String manipulation allocates memory on the V8 heap and triggers GC.
 * Do NOT use these functions inside the core game loop or systems. Use ONLY
 * in React render cycles where GC overhead is accepted.
 */
export class FormatUtils {

    /**
     * Formats milliseconds into a readable MM:SS string.
     * Uses bitwise OR (| 0) for fast float-to-int conversion (faster than Math.floor).
     */
    public static formatTimeMinutes(ms: number): string {
        const totalSec = (ms / 1000) | 0;
        const m = (totalSec / 60) | 0;
        const s = totalSec % 60;
        return `${m}:${s.toString().padStart(2, '0')}${t('report.time.unit_min')}`;
    }

    /**
     * Formats seconds into hours with one decimal.
     */
    public static formatTimeHours(seconds: number): string {
        return (seconds / 3600).toFixed(1);
    }

    /**
     * Formats distance in meters to a readable string (m or km).
     * Uses bitwise OR (| 0) for fast flooring when under 1km.
     */
    public static formatDistance(meters: number): string {
        if (meters >= 1000) {
            return `${(meters / 1000).toFixed(2)}${t('report.distance.unit_km')}`;
        }
        return `${meters | 0}${t('report.distance.unit_m')}`;
    }

    /**
     * Safely formats accuracy as a percentage string.
     */
    public static formatAccuracy(fired: number, hits: number): string {
        if (fired <= 0) return "0.0%";
        return `${((hits / fired) * 100).toFixed(1)}%`;
    }

    /**
     * Formats a number to a fixed number of decimals.
     */
    public static formatDecimal(val: number, decimals: number = 1): string {
        return val.toFixed(decimals);
    }

}