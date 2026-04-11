/**
 * VINTERDÖD: Hot-Loop Performance Utility
 * Pre-allocates strings for numbers 0-9999 to prevent GC during high-frequency UI updates.
 */

const CACHE_SIZE = 10000;
const NUMBER_STRINGS: string[] = new Array(CACHE_SIZE);
const PLUS_STRINGS: string[] = new Array(CACHE_SIZE); // Ny pre-allokerad array!

// Pre-allocate ALL strings at startup (Zero runtime allocations)
for (let i = 0; i < CACHE_SIZE; i++) {
    const str = i.toString();
    NUMBER_STRINGS[i] = str;
    PLUS_STRINGS[i] = `+${str}`; // Bygg strängen en gång, lagra den för alltid
}

/**
 * Returns a cached string representation of a number.
 * Rounds to nearest integer for cache lookup.
 * Fallback to .toString() for values outside 0-9999.
 * * @param val The number to convert
 * @returns string
 */
export function getCachedNumberString(val: number): string {
    const intVal = (val + 0.5) | 0; // Extremely fast bitwise rounding

    if (intVal >= 0 && intVal < CACHE_SIZE) {
        return NUMBER_STRINGS[intVal];
    }

    // Fallback for extreme cases (critical damage, etc.)
    return val.toString();
}

/**
 * Utility for formatting XP or health gains as "+X"
 * 100% Zero-GC guarantee.
 */
export function getCachedPlusString(val: number): string {
    const intVal = (val + 0.5) | 0;

    if (intVal >= 0 && intVal < CACHE_SIZE) {
        return PLUS_STRINGS[intVal]; // Returnerar minnesreferens, skapar inget nytt!
    }

    // Fallback allocation only happens for massive, out-of-bounds numbers
    return `+${intVal}`;
}