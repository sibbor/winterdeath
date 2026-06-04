/**
 * ZERO-GC COLOR UTILITIES
 * Centralized logic for color manipulation and conversion.
 * Strictly avoids runtime allocations in hot paths.
 */

/**
 * Converts a numeric hex color (0xRRGGBB) to a CSS-compatible string (#RRGGBB).
 * WARNING: This causes string allocations. Use pre-allocated strings in render loops.
 */
export const colorToHex = (color: number): string => {
    return '#' + color.toString(16).padStart(6, '0');
};

/**
 * Adjusts the brightness of a numeric color by a percentage.
 * Returns a CSS-compatible hex string.
 * WARNING: This causes string allocations.
 */
export const adjustColor = (color: number, percent: number): string => {
    let R = (color >> 16) & 0xff;
    let G = (color >> 8) & 0xff;
    let B = color & 0xff;

    R = Math.floor(R * (100 + percent) / 100);
    G = Math.floor(G * (100 + percent) / 100);
    B = Math.floor(B * (100 + percent) / 100);

    R = Math.min(255, Math.max(0, R));
    G = Math.min(255, Math.max(0, G));
    B = Math.min(255, Math.max(0, B));

    return colorToHex((R << 16) | (G << 8) | B);
};

/**
 * Darkens a numeric color by a percentage.
 */
export const darkenColor = (color: number, percent: number): string => adjustColor(color, -percent);

/**
 * Lightens a numeric color by a percentage.
 */
export const lightenColor = (color: number, percent: number): string => adjustColor(color, percent);

/**
 * Shared color interface for Zero-GC dual-format access.
 */
export interface ColorPair {
    readonly num: number;
    readonly str: string;
}

/**
 * Pre-allocated helper for common UI colors to avoid runtime conversions.
 */
export const COLORS = {
    RED: { num: 0xef4444, str: '#ef4444' } as const,
    RED_DIM: { num: 0x7f1d1d, str: '#7f1d1d' } as const,
    RED_BRIGHT: { num: 0xfee2e2, str: '#fee2e2' } as const,

    GREEN: { num: 0x16a34a, str: '#16a34a' } as const,
    GREEN_DIM: { num: 0x14532d, str: '#14532d' } as const,
    GREEN_BRIGHT: { num: 0xdcfce7, str: '#dcfce7' } as const,

    BLUE: { num: 0x3b82f6, str: '#3b82f6' } as const,
    BLUE_DIM: { num: 0x1e3a8a, str: '#1e3a8a' } as const,
    BLUE_BRIGHT: { num: 0xdbeafe, str: '#dbeafe' } as const,

    YELLOW: { num: 0xeab308, str: '#eab308' } as const,
    YELLOW_DIM: { num: 0x713f12, str: '#713f12' } as const,
    YELLOW_BRIGHT: { num: 0xfef9c3, str: '#fef9c3' } as const,

    PURPLE: { num: 0xa855f7, str: '#a855f7' } as const,
    PURPLE_DIM: { num: 0x581c87, str: '#581c87' } as const,
    PURPLE_BRIGHT: { num: 0xf3e8ff, str: '#f3e8ff' } as const,

    TEAL: { num: 0x14b8a6, str: '#14b8a6' } as const,
    PINK: { num: 0xec4899, str: '#ec4899' } as const,

    CYAN: { num: 0x06b6d4, str: '#06b6d4' } as const,
    CYAN_DIM: { num: 0x164e63, str: '#164e63' } as const,
    CYAN_BRIGHT: { num: 0xcffafe, str: '#cffafe' } as const,

    INDIGO: { num: 0x6366f1, str: '#6366f1' } as const,

    ORANGE: { num: 0xf97316, str: '#f97316' } as const,
    ORANGE_DIM: { num: 0x7c2d12, str: '#7c2d12' } as const,
    ORANGE_BRIGHT: { num: 0xffedd5, str: '#ffedd5' } as const,

    GRAY: { num: 0x4b5563, str: '#4b5563' } as const,
    GRAY_DIM: { num: 0x1f2937, str: '#1f2937' } as const,
    GRAY_BRIGHT: { num: 0xf3f4f6, str: '#f3f4f6' } as const,

    WHITE: { num: 0xffffff, str: '#ffffff' } as const,
    BLACK: { num: 0x000000, str: '#000000' } as const,

    // --- SPECIALS / ENGINE ---
    ELECTRIC_FLASH: { num: 0x00ffff, str: '#00ffff' } as const,
    FIRE_ORANGE: { num: 0xffaa00, str: '#ffaa00' } as const,
    FIRE_RED: { num: 0xff4400, str: '#ff4400' } as const,
} as const;

/**
 * Challenge Tiers for the UI and Engine.
 */
export const TIER_COLORS = {
    BRONZE: { num: 0xd97706, str: '#d97706' } as const,
    SILVER: { num: 0x67e8f9, str: '#67e8f9' } as const,
    GOLD: { num: 0xfacc15, str: '#facc15' } as const,
} as const;

/**
 * Enemy and Boss specific colors for rendering and UI markers.
 */
export const ENEMY_COLORS = {
    WALKER: { num: 0xc27ba0, str: '#c27ba0' } as const,
    RUNNER: { num: 0x33a366, str: '#33a366' } as const,
    TANK: { num: 0x2b6599, str: '#2b6599' } as const,
    BLOATER: { num: 0xcf6e36, str: '#cf6e36' } as const,
    BOSS_0: { num: 0x4a0404, str: '#4a0404' } as const,
    BOSS_1: { num: 0x2c3e50, str: '#2c3e50' } as const,
    BOSS_2: { num: 0x8e44ad, str: '#8e44ad' } as const,
    BOSS_3: { num: 0xc0392b, str: '#c0392b' } as const,

    // Flash FX
    HIT_FLASH: { num: 0xffffff, str: '#ffffff' } as const,
    ELECTRIC_ARC_FLASH: { num: 0x66ffff, str: '#66ffff' } as const,
} as const;

/**
 * FX COLORS (RGB String triplets for CSS variables)
 */
export const VIGNETTE_COLORS = {
    VIGNETTE_RED: '220, 38, 38',
    VIGNETTE_PURPLE: '139, 92, 246',
    VIGNETTE_BLUE: '59, 130, 246',
    VIGNETTE_GREEN: '16, 185, 129',
    VIGNETTE_YELLOW: '250, 204, 21',
} as const;
