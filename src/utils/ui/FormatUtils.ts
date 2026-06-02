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
     * Formats seconds into a readable MM:SS string.
     * Uses bitwise OR (| 0) for fast float-to-int conversion.
     */
    public static formatTimeMinutes(seconds: number): string {
        const totalSec = seconds | 0;
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
     * Smart Time Formatting
     * Returns minutes (MM:SS) if under 1 hour, otherwise returns hours (X.X hrs).
     */
    public static formatTimeSmart(seconds: number): string {
        if (seconds < 3600) {
            const totalSec = seconds | 0;
            const m = (totalSec / 60) | 0;
            const s = totalSec % 60;
            return `${m}:${s.toString().padStart(2, '0')} ${t('report.time.unit_min')}`;
        }
        return `${(seconds / 3600).toFixed(1)} ${t('ui.hrs')}`;
    }

    /**
     * Deterministic Distance Formatting
     * Enforces strict numeric thresholds (< 1000m vs >= 1.00km) with exactly 2 decimal places.
     */
    public static formatDistance(meters: number): string {
        const val = meters || 0;
        if (val >= 1000) {
            return `${(val / 1000).toFixed(2)} ${t('report.distance.unit_km')}`;
        }
        return `${val | 0} ${t('report.distance.unit_m')}`;
    }

    /**
     * Alias for formatDistance to maintain API compatibility while enforcing deterministic output.
     */
    public static formatDistanceSmart(meters: number): string {
        return FormatUtils.formatDistance(meters);
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
