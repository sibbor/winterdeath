import { DamageID, EnemyAttackType, ENEMY_ATTACK_NAMES, ENVIRONMENTAL_DAMAGE_NAMES } from '../../entities/player/CombatTypes';
import { EnemyType } from '../../entities/enemies/EnemyTypes';
import { WEAPONS, WEAPON_CATEGORY_NAMES, WeaponCategory } from '../../content/weapons';
import { ZOMBIE_TYPES } from '../../content/enemies/zombies';
import { BOSSES } from '../../content/enemies/bosses';
import { POIS } from '../../content/pois';
import { PERKS, StatusEffectType } from '../../content/perks';
import { FAMILY_MEMBERS } from '../../content/constants';
import { DiscoveryType } from '../../components/ui/hud/HudTypes';
import { CLUES } from '../../content/clues';
import { COLLECTIBLES } from '../../content/collectibles';
import { SECTOR_THEMES } from '../../content/sectors/sector_themes';
import { WeaponStats } from '../../content/weapons';
import { sv } from '../../locales/sv';
import { SECTORS } from '../../systems/SectorSystem';
import { SoundID } from '../audio/AudioTypes';

/**
 * VINTERDÖD: Central Data Resolver (Facade Pattern)
 * Decouples System/UI from raw data structures.
 * Provides O(1), Zero-GC access to entity localized names and metadata.
 */

/**
 * Type-safe interface for voice parameters to enable Zero-GC audio synthesis.
 */
export interface VoiceParams {
    baseFreq: number;
    oscType: OscillatorType;
    pitchScale: number;
}

const DISCOVERY_BUCKETS: Record<string, any[]> = {
    POI: Object.values(POIS),
    COLLECTIBLE: Object.values(COLLECTIBLES),
    CLUE: Object.values(CLUES),
    BOSS: Object.values(BOSSES),
    ENEMY: Object.values(ZOMBIE_TYPES)
};

const SPEAKER_COLORS: Record<string, string> = {
    'robert': '#3b82f6', // PLAYER_CHARACTER.color
    'pappa': '#3b82f6',
    'narrator': '#ef4444',
    'unknown': '#9ca3af',
    'radio': '#9ca3af'
};

const CHATTER_MAP: Record<string, string[]> = (sv.chatter as Record<string, string[]>);

// Pre-populate family member colors and IDs
FAMILY_MEMBERS.forEach(m => {
    const colorHex = '#' + m.color.toString(16).padStart(6, '0');
    SPEAKER_COLORS[m.id] = colorHex;
    SPEAKER_COLORS[m.name.toLowerCase()] = colorHex;
});

const VOICE_PARAMS_MAP: Record<number, VoiceParams> = {
    [-1]: { baseFreq: 110, oscType: 'sawtooth', pitchScale: 1.0 } // Robert
};

FAMILY_MEMBERS.forEach(m => {
    let baseFreq = 220;
    const name = m.name.toLowerCase();
    if (name === 'nathalie') baseFreq = 380;
    else if (name === 'esmeralda') baseFreq = 450;
    else if (name === 'loke') baseFreq = 420;
    else if (name === 'jordan') baseFreq = 500;
    else if (m.race === 'animal') baseFreq = 700;

    VOICE_PARAMS_MAP[m.id] = {
        baseFreq,
        oscType: name === 'nathalie' || m.race === 'animal' ? 'sine' : 'triangle',
        pitchScale: 1.0 / (m.scale || 1.0)
    };
});

export const DataResolver = {
    /**
     * Resolves the localized name key for any DamageID (Weapon or Environment).
     */
    getDamageName(id: DamageID): string {
        // 1. Check Weapons first
        const weapon = WEAPONS[id];
        if (weapon) return weapon.displayName;

        // 2. Check Environmental Damage
        const envName = ENVIRONMENTAL_DAMAGE_NAMES[id];
        if (envName) return envName;

        return 'ui.unknown';
    },

    /**
     * Resolves the localized name key for a specific Zombie Type.
     */
    getZombieName(type: EnemyType): string {
        const data = ZOMBIE_TYPES[type];
        return data ? data.displayNameKey : 'ui.unknown';
    },

    /**
     * Resolves the localized name key for a specific Boss ID.
     */
    getBossName(id: number): string {
        const boss = BOSSES[id];
        return boss ? boss.name : 'ui.boss';
    },

    /**
     * Resolves the localized name key for a specific Weapon Category.
     */
    getWeaponCategoryName(cat: WeaponCategory): string {
        return WEAPON_CATEGORY_NAMES[cat] || 'ui.unknown';
    },

    /**
     * Unified Enemy Name lookup (Handles both Bosses and Mob types).
     */
    getEnemyName(type: EnemyType, bossId: number = -1): string {
        if (type === EnemyType.BOSS && bossId !== -1) {
            return this.getBossName(bossId);
        }
        return this.getZombieName(type);
    },

    /**
     * Resolves the localized name key for an Enemy Attack.
     */
    getAttackName(type: EnemyAttackType): string {
        return ENEMY_ATTACK_NAMES[type] || 'ui.unknown';
    },

    /**
     * Resolves the localized name key for a POI by its unique ID.
     */
    getPoiName(id: string): string {
        const poi = POIS[id];
        return poi ? poi.displayNameKey : 'ui.poi';
    },

    /**
     * Resolves the localized name key for a Collectible.
     */
    getCollectibleName(id: string): string {
        const item = COLLECTIBLES[id];
        if (!item) return `collectibles.${id}.title`;
        return `collectibles.${item.sector}.${item.index}.title`;
    },

    /**
     * Resolves the localized name key for a Perk or Status Effect.
     */
    getPerkName(id: StatusEffectType): string {
        const perk = PERKS[id];
        return perk ? perk.displayName : 'ui.unknown';
    },

    /**
     * Resolves the localized reaction text for a Clue.
     */
    getClueReaction(id: string): string {
        const clue = CLUES[id];
        if (!clue) return `clues.${id}.reaction`;
        return `clues.${clue.sector}.${clue.index}.reaction`;
    },

    /**
     * Resolves the localized description/reaction for a Clue.
     */
    getClueDescription(id: string): string {
        const clue = CLUES[id];
        if (!clue) return `clues.${id}.description`;
        return `clues.${clue.sector}.${clue.index}.description`;
    },

    /**
     * Resolves the title translation key for a Discovery event.
     */
    getDiscoveryTitle(type: DiscoveryType): string {
        switch (type) {
            case DiscoveryType.CLUE: return 'ui.clue_found';
            case DiscoveryType.POI: return 'ui.location_discovered';
            case DiscoveryType.COLLECTIBLE: return 'ui.collectible_discovered';
            case DiscoveryType.ENEMY: return 'ui.new_threat';
            case DiscoveryType.BOSS: return 'ui.boss_encountered';
            case DiscoveryType.PERK: return 'ui.skill_point';
            default: return 'ui.discovery';
        }
    },

    /**
     * Resolves which Adventure Log tab to open for a specific DiscoveryType.
     */
    getAdventureLogTab(type: DiscoveryType): string {
        switch (type) {
            case DiscoveryType.CLUE: return 'clues';
            case DiscoveryType.POI: return 'poi';
            case DiscoveryType.COLLECTIBLE: return 'collectibles';
            case DiscoveryType.ENEMY: return 'enemy';
            case DiscoveryType.BOSS: return 'boss';
            case DiscoveryType.PERK: return 'perks';
            default: return 'clues';
        }
    },

    // --- DISCOVERY & NARRATIVE (Phase 3) ---

    /**
     * Returns a static reference to the pre-computed list of discovery items.
     * ZERO-GC: No allocations or filtering inside the getter.
     */
    getDiscoveryList(type: DiscoveryType): any[] {
        let key = '';
        if (type === DiscoveryType.POI) key = 'POI';
        else if (type === DiscoveryType.COLLECTIBLE) key = 'COLLECTIBLE';
        else if (type === DiscoveryType.CLUE) key = 'CLUE';
        else if (type === DiscoveryType.BOSS) key = 'BOSS';
        else if (type === DiscoveryType.ENEMY) key = 'ENEMY';

        return DISCOVERY_BUCKETS[key] || [];
    },

    /**
     * Resolves a speaker identifier to a CSS hex color.
     * O(1) lookup on pre-computed Record.
     */
    getSpeakerColor(id: string | number): string {
        const key = typeof id === 'string' ? id.toLowerCase() : id;
        return SPEAKER_COLORS[key] || '#ffffff';
    },

    /**
     * Returns localized chatter lines for a family member.
     * O(1) resolution via pre-mapped locale object.
     */
    getChatterLines(idOrName: number | string): string[] {
        const key = typeof idOrName === 'string' ? idOrName.toLowerCase() : FAMILY_MEMBERS[idOrName]?.name.toLowerCase();
        return CHATTER_MAP[key] || ["..."];
    },

    /**
     * Resolves voice synthesis parameters for a given speaker ID.
     * Used by SoundManager to bypass mid-frame logic branching.
     */
    getVoiceParams(id: number): VoiceParams {
        return VOICE_PARAMS_MAP[id] || VOICE_PARAMS_MAP[-1];
    },

    /**
     * Resolves the localized long-form description for a Zombie Type.
     */
    getZombieDescription(type: EnemyType): string {
        const nameKey = this.getZombieName(type);
        if (nameKey === 'ui.unknown') return 'ui.description_missing';
        const base = nameKey.substring(0, nameKey.lastIndexOf('.'));
        return `${base}.description`;
    },

    /**
     * Resolves the localized lore/description for a Boss.
     */
    getBossDescription(id: number): string {
        const nameKey = this.getBossName(id);
        if (nameKey === 'ui.boss') return 'ui.description_missing';
        const base = nameKey.substring(0, nameKey.lastIndexOf('.'));
        return `${base}.lore`;
    },

    /**
     * Resolves the localized narrative 'death story' for a Boss.
     */
    getBossDeathLore(id: number): string {
        const boss = BOSSES[id];
        return boss ? (boss.deathStory || 'ui.boss_eliminated') : 'ui.boss_eliminated';
    },

    /**
     * Resolves the localized description for an Enemy Attack.
     */
    getAttackDescription(type: EnemyAttackType): string {
        const attackKey = EnemyAttackType[type];
        return attackKey ? `attacks.${attackKey}.description` : 'ui.description_missing';
    },

    /**
     * Resolves the localized description for a POI.
     */
    getPoiDescription(id: string): string {
        const poi = POIS[id];
        return poi ? `pois.${poi.sector}.${poi.index}.description` : 'ui.description_missing';
    },

    /**
     * Resolves the localized reaction text for a POI.
     */
    getPoiReaction(id: string): string {
        const poi = POIS[id];
        return poi ? `pois.${poi.sector}.${poi.index}.reaction` : '';
    },

    /**
     * Resolves the localized description for a Perk.
     */
    getPerkDescription(id: StatusEffectType): string {
        const perk = PERKS[id];
        return perk ? perk.description : 'ui.description_missing';
    },

    // --- LEGACY MAPPING WRAPPERS (To be removed after full migration) ---

    getSectorName(id: number): string {
        return `sectors.sector_${id}_name`;
    },

    /**
     * Resolves the localized description for a Collectible.
     */
    getCollectibleDescription(id: string): string {
        const item = COLLECTIBLES[id];
        if (!item) return `collectibles.${id}.description`;
        return `collectibles.${item.sector}.${item.index}.description`;
    },

    getSectorIntro(id: number): string | null {
        // This usually comes from the sector definition object, 
        // but we can provide a facade for intro text keys if needed.
        return null; // For now, the caller handles the definition object
    },

    getSectorMusic(id: number): string | SoundID {
        const sector = SECTORS[id];
        return sector?.ambientLoop || SoundID.AMBIENT_WIND;
    },

    /**
     * CONTENT ACCESSORS (Decoupling UI from raw imports)
     */
    getZombies(): typeof ZOMBIE_TYPES { return ZOMBIE_TYPES; },
    getBosses(): typeof BOSSES { return BOSSES; },
    getPois(): typeof POIS { return POIS; },
    getCollectibles(): typeof COLLECTIBLES { return COLLECTIBLES; },
    getClues(): typeof CLUES { return CLUES; },
    getPerks(): typeof PERKS { return PERKS; },
    getSectorThemes(): typeof SECTOR_THEMES { return SECTOR_THEMES; },
    getSectors(): number[] { return [0, 1, 2, 3, 4]; },
    getWeapons(): WeaponStats[] { return WEAPONS; },
    getFamilyMembers(): typeof FAMILY_MEMBERS { return FAMILY_MEMBERS; }
};
