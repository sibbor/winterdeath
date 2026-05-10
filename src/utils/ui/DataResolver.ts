import { DamageID, EnemyAttackType, ENEMY_ATTACK_NAMES, ENVIRONMENTAL_DAMAGE_NAMES } from '../../entities/player/CombatTypes';
import { EnemyType } from '../../entities/enemies/EnemyTypes';
import { WEAPONS, WEAPON_CATEGORY_NAMES, WeaponCategory, WeaponType } from '../../content/weapons';
import { ZOMBIE_TYPES } from '../../content/enemies/zombies';
import { BOSSES } from '../../content/enemies/bosses';
import { POIS } from '../../content/pois';
import { PERKS, PERK_CATALOG, PerkCategory } from '../../content/perks';
import { FAMILY_MEMBERS, FamilyMemberID, PLAYER_CHARACTER, SPEAKER_ID_TO_KEY, VoiceParams, VOICE_PARAMS_MAP } from '../../content/constants';
import { DiscoveryType } from '../../components/ui/hud/HudTypes';
import { CLUES } from '../../content/clues';
import { COLLECTIBLES } from '../../content/collectibles';
import { ChallengeID } from '../../content/ChallengeTypes';
import { WeaponStats } from '../../content/weapons';
import { PlayerStatID, StatWeaponIndex, StatEnemyIndex, PlayerStats, TelemetrySourceOffset, TELEMETRY_SOURCES_COUNT, TELEMETRY_ATTACKS_PER_SOURCE } from '../../entities/player/PlayerTypes';
import { BossID, SectorID } from '../../game/session/SectorTypes';
import { SECTOR_THEMES } from '../../content/sectors/sector_themes';
import { t } from '../i18n';
import { en } from '../../locales/en';
import { StatusEffectID } from '../../types/StatusEffects';
import { ColorPair, COLORS } from './ColorUtils';


/**
 * Central Data Resolver (Facade Pattern)
 * Decouples System/UI from raw data structures.
 * Provides O(1), Zero-GC access to entity localized names and metadata.
 */


const DISCOVERY_BUCKETS: Record<number, any[]> = {
    [DiscoveryType.POI]: Object.values(POIS),
    [DiscoveryType.COLLECTIBLE]: Object.values(COLLECTIBLES),
    [DiscoveryType.CLUE]: Object.values(CLUES),
    [DiscoveryType.BOSS]: Object.entries(BOSSES).map(([id, boss]) => ({ ...boss, id: Number(id) })),
    [DiscoveryType.ZOMBIE]: Object.entries(ZOMBIE_TYPES).map(([type, data]) => ({ ...data, id: type, type: Number(type) }))
};

// --- SMI MAPPING (Zero-GC Transport) ---
// Maps (sector << 8 | index) numeric IDs to string IDs for world content.
const POI_SMI_MAP: Record<number, string> = {};
const CLUE_SMI_MAP: Record<number, string> = {};
const COLLECTIBLE_SMI_MAP: Record<number, string> = {};

const poiValues = Object.values(POIS);
for (let i = 0; i < poiValues.length; i++) {
    const p = poiValues[i];
    POI_SMI_MAP[(p.sector << 8) | p.index] = p.id;
}

const clueValues = Object.values(CLUES);
for (let i = 0; i < clueValues.length; i++) {
    const c = clueValues[i];
    CLUE_SMI_MAP[(c.sector << 8) | c.index] = c.id;
}

const collValues = Object.values(COLLECTIBLES);
for (let i = 0; i < collValues.length; i++) {
    const c = collValues[i];
    COLLECTIBLE_SMI_MAP[(c.sector << 8) | c.index] = c.id;
}

const SPEAKER_COLORS: Record<string | number, ColorPair> = {
    [FamilyMemberID.ROBERT]: PLAYER_CHARACTER.color,
    'robert': PLAYER_CHARACTER.color,
    [FamilyMemberID.UNKNOWN]: COLORS.GRAY,
    'unknown': COLORS.GRAY,
    [FamilyMemberID.RADIO]: COLORS.GRAY,
    'radio': COLORS.GRAY
};

// Pre-populate family member colors and IDs
const familyLen = FAMILY_MEMBERS.length;
for (let i = 0; i < familyLen; i++) {
    const m = FAMILY_MEMBERS[i];
    const cPair = m.color;
    SPEAKER_COLORS[m.id] = cPair;

    // Also map the string key (e.g. 'loke') for UI string-based lookups
    const key = SPEAKER_ID_TO_KEY[m.id];
    if (key) SPEAKER_COLORS[key] = cPair;
}

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
     * Unified Source Resolver for Incoming Damage (Telemetry)
     * Maps the 64 possible sources from the incomingDamageBuffer to localized names.
     */
    resolveIncomingSource(sourceId: number): { name: string, type: 'enemy' | 'boss' | 'environment' | 'unknown' } {
        if (sourceId < TelemetrySourceOffset.BOSS) {
            return { name: this.getZombieName(sourceId as EnemyType), type: 'enemy' };
        } else if (sourceId < TelemetrySourceOffset.ENVIRONMENT) {
            return { name: this.getBossName((sourceId - TelemetrySourceOffset.BOSS) as any), type: 'boss' };
        } else if (sourceId < TELEMETRY_SOURCES_COUNT) {
            return { name: this.getDamageName((sourceId - TelemetrySourceOffset.ENVIRONMENT) as DamageID), type: 'environment' };
        }
        return { name: 'ui.unknown', type: 'unknown' };
    },

    /**
     * Resolves the localized name key for a specific Zombie Type.
     */
    getZombieName(type: EnemyType): string {
        const data = ZOMBIE_TYPES[type];
        return data ? data.name : 'ui.unknown';
    },

    /**
     * Resolves the localized name key for a specific Zombie Type.
     */
    getZombieStory(type: EnemyType): string {
        const data = ZOMBIE_TYPES[type];
        return data ? data.story : 'ui.unknown';
    },

    /**
     * Resolves the localized name key for a specific Boss ID.
     */
    getBossName(id: BossID): string {
        const boss = BOSSES[id as any];
        return boss ? boss.name : 'ui.boss';
    },

    /**
     * Resolves the localized name key for a specific Boss ID.
     */
    getBossStory(id: BossID): string {
        const boss = BOSSES[id as any];
        return boss ? boss.story : 'ui.unknown';
    },

    /**
     * Resolves the localized name key for a specific Boss ID.
     */
    getBossDeathStory(id: BossID): string {
        const boss = BOSSES[id as any];
        return boss ? boss.deathStory : 'ui.unknown';
    },

    /**
     * Resolves the localized name key for a specific Weapon Category.
     */
    getWeaponCategoryName(cat: WeaponCategory): string {
        return WEAPON_CATEGORY_NAMES[cat] || 'ui.unknown';
    },

    /**
     * Resolves the localized name key for a specific Weapon.
     */
    getWeaponName(type: WeaponType, logFriendly: boolean = false): string {
        const weapon = WEAPONS[type];
        const key = weapon ? weapon.displayName : 'ui.unknown';
        if (logFriendly) return this._resolveLogName(key);
        return key;
    },

    /**
     * Resolves the localized name for an effect (Environmental or Status).
     * Used primarily for combat logs and debug telemetries.
     */
    getEffectName(id: number, logFriendly: boolean = true): string {
        const name = ENVIRONMENTAL_DAMAGE_NAMES[id] || 'ui.unknown';
        if (logFriendly) return this._resolveLogName(name);
        return name;
    },

    /**
     * Resolves the localized name key for a Sector.
     */
    getSectorName(id: number): string {
        const theme = SECTOR_THEMES[id];
        return theme ? theme.name : `sectors.sector_${id}_name`;
    },

    /**
     * Resolves the localized description/briefing key for a Sector.
     */
    getSectorDescription(id: number): string {
        const theme = SECTOR_THEMES[id];
        return theme ? theme.briefing : `story.sector_${id}_briefing`;
    },

    /**
     * Resolves the Family Member ID associated with a Sector.
     */
    getSectorFamilyMemberId(id: number): number | undefined {
        return SECTOR_THEMES[id]?.familyMemberId;
    },

    /**
     * Resolves the localized description key for a specific Weapon.
     */
    getWeaponDescription(type: WeaponType): string {
        const weapon = WEAPONS[type];
        return weapon ? `${weapon.displayName}.description` : 'ui.description_missing';
    },

    /**
     * Resolves the name of the player character.
     */
    getPlayerName(): string {
        return PLAYER_CHARACTER.name;
    },

    /**
     * Resolves the localized name key for a Family Member.
     */
    getFamilyMemberName(idOrIndex: number | string): string {
        const id = Number(idOrIndex);
        if (id === FamilyMemberID.ROBERT) return PLAYER_CHARACTER.name;
        const member = typeof idOrIndex === 'number' ? FAMILY_MEMBERS[idOrIndex] : FAMILY_MEMBERS.find(m => m.id === id);
        return member ? t(member.name) : 'ui.unknown';
    },

    /**
     * Resolves the localized name key for a Player Rank.
     */
    getRankName(level: number): string {
        const rankKey = Math.min(Math.max(0, level - 1), 19);
        return `ranks.${rankKey}`;
    },

    /**
     * Unified Enemy Name lookup (Handles both Bosses and Mob types).
     * @param logFriendly If true, returns a localized or readable name (e.g. "Vandrare" or "Walker") 
     * instead of a raw translation key.
     */
    getEnemyName(type: EnemyType, bossId: BossID = BossID.NONE, logFriendly: boolean = false): string {
        let key = '';
        if (type === EnemyType.BOSS && bossId !== -1) {
            key = this.getBossName(bossId);
        } else {
            key = this.getZombieName(type);
        }

        if (logFriendly) return this._resolveLogName(key);
        return key;
    },

    /**
     * Resolves the localized name key for an Enemy Attack.
     */
    getAttackName(type: EnemyAttackType, logFriendly: boolean = false): string {
        const key = ENEMY_ATTACK_NAMES[type] || 'ui.unknown';
        if (logFriendly) return this._resolveLogName(key);
        return key;
    },

    /**
     * Internal helper to resolve a translation key to its localized value for logs.
     * ZERO-GC: Direct traversal of the locale object with a memoization cache.
     */
    _logNameCache: new Map<string, string>(),
    _resolveLogName(key: string): string {
        if (!key) return 'Unknown';

        const cached = this._logNameCache.get(key);
        if (cached) return cached;

        const parts = key.split('.');

        // 1. Attempt O(N) traversal of the 'en' locale object (Logs are always English)
        let current: any = en;
        for (let i = 0; i < parts.length; i++) {
            current = current?.[parts[i]];
            if (!current) break;
        }

        if (typeof current === 'string') {
            this._logNameCache.set(key, current);
            return current;
        }

        const raw = (parts.length > 1) ? parts[parts.length - 2] : parts[0];
        const result = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();

        this._logNameCache.set(key, result);
        return result;
    },

    /**
     * Resolves the localized name key for a POI by its unique ID.
     */
    getPoiName(id: string | number): string {
        const strId = typeof id === 'number' ? POI_SMI_MAP[id] : id;
        const poi = POIS[strId];
        return poi ? poi.displayNameKey : 'ui.poi';
    },

    /**
     * Resolves the localized name key for a Collectible.
     */
    getCollectibleName(id: string | number): string {
        const strId = typeof id === 'number' ? COLLECTIBLE_SMI_MAP[id] : id;
        const item = COLLECTIBLES[strId];
        if (!item) return `collectibles.${strId}.title`;
        return `collectibles.${item.sector}.${item.index}.title`;
    },

    /**
     * Resolves the localized description for a Collectible.
     */
    getCollectibleDescription(id: string | number): string {
        const strId = typeof id === 'number' ? COLLECTIBLE_SMI_MAP[id] : id;
        const item = COLLECTIBLES[strId];
        if (!item) return `collectibles.${strId}.description`;
        return `collectibles.${item.sector}.${item.index}.description`;
    },

    /**
     * Resolves the localized name key for a Perk or Status Effect.
     */
    getPerkName(id: StatusEffectID, logFriendly: boolean = false): string {
        const perk = PERKS[id];
        const key = perk ? perk.displayName : 'ui.unknown';
        if (logFriendly) return this._resolveLogName(key);
        return key;
    },

    /**
     * Resolves the localized reaction text for a Clue.
     */
    getClueReaction(id: string | number): string {
        const strId = typeof id === 'number' ? CLUE_SMI_MAP[id] : id;
        const clue = CLUES[strId];
        if (!clue) return `clues.${strId}.reaction`;
        return `clues.${clue.sector}.${clue.index}.reaction`;
    },

    /**
     * Resolves the localized description/reaction for a Clue.
     */
    getClueDescription(id: string | number): string {
        const strId = typeof id === 'number' ? CLUE_SMI_MAP[id] : id;
        const clue = CLUES[strId];
        if (!clue) return `clues.${strId}.description`;
        return `clues.${clue.sector}.${clue.index}.description`;
    },

    /**
     * Resolves the title translation key for a Discovery event.
     */
    getDiscoveryTitle(type: DiscoveryType): string {
        switch (type) {
            case DiscoveryType.CLUE: return 'ui.discovered_clue';
            case DiscoveryType.POI: return 'ui.discovered_poi';
            case DiscoveryType.COLLECTIBLE: return 'ui.discovered_collectible';
            case DiscoveryType.ZOMBIE: return 'ui.discovered_enemy';
            case DiscoveryType.BOSS: return 'ui.boss_encountered';
            case DiscoveryType.PERK: return 'ui.skill_point';
            default: return 'ui.discovery';
        }
    },

    /**
     * Resolves which DiscoveryType category (Tab) to open for a specific DiscoveryType.
     * ZERO-GC: Returns the numeric enum directly.
     */
    getAdventureLogTab(type: DiscoveryType): DiscoveryType {
        // Most types map to themselves as tabs, except BOSS which might share or have its own
        return type;
    },

    // --- DISCOVERY & NARRATIVE (Phase 3) ---

    /**
     * Returns a static reference to the pre-computed list of discovery items.
     * ZERO-GC: No allocations or filtering inside the getter.
     */
    getDiscoveryList(type: DiscoveryType): any[] {
        return DISCOVERY_BUCKETS[type] || [];
    },

    /**
     * Resolves a speaker identifier to a CSS hex color.
     * O(1) lookup on pre-computed Record.
     */
    getSpeakerColor(id: FamilyMemberID | string): string {
        const key = typeof id === 'string' ? id.toLowerCase() : id;
        const color = SPEAKER_COLORS[key];
        return color ? color.str : COLORS.WHITE.str;
    },

    /**
     * Returns localized chatter lines for a family member.
     * O(1) resolution via pre-mapped locale object.
     */
    getChatterLines(id: FamilyMemberID): string[] {
        const key = SPEAKER_ID_TO_KEY[id];
        const chatter = t('chatter');
        return (chatter && (chatter as any)[key]) || ["..."];
    },

    /**
     * Resolves voice synthesis parameters for a given speaker ID.
     * Used by SoundManager to bypass mid-frame logic branching.
     */
    getVoiceParams(id: number): VoiceParams {
        return VOICE_PARAMS_MAP[id] || VOICE_PARAMS_MAP[FamilyMemberID.UNKNOWN];
    },

    /**
     * Resolves the localized description for an Enemy Attack.
     */
    getAttackDescription(type: EnemyAttackType | DamageID): string {
        // 1. Try EnemyAttackType Enum lookup
        let attackKey = EnemyAttackType[type as number];

        // 2. Fallback to DamageID Enum lookup (Environmental causes)
        if (!attackKey) {
            attackKey = DamageID[type as number];
        }

        return attackKey ? `attacks.${attackKey}.description` : 'ui.description_missing';
    },

    /**
     * Resolves the localized description for a POI.
     */
    getPoiDescription(id: string | number): string {
        const strId = typeof id === 'number' ? POI_SMI_MAP[id] : id;
        const poi = POIS[strId];
        if (!poi) return 'ui.description_missing';
        return poi.descriptionKey || `pois.${poi.sector}.${poi.index}.description`;
    },

    /**
     * Resolves the localized reaction text for a POI.
     */
    getPoiReaction(id: string | number): string {
        const strId = typeof id === 'number' ? POI_SMI_MAP[id] : id;
        const poi = POIS[strId];
        if (!poi) return '';
        return poi.reactionKey || `pois.${poi.sector}.${poi.index}.reaction`;
    },

    /**
     * Resolves the localized description for a Perk.
     */
    getPerkDescription(id: StatusEffectID): string {
        const perk = PERKS[id];
        return perk ? perk.description : 'ui.description_missing';
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
    getSectors(): number[] { return [SectorID.VILLAGE, SectorID.MOUNTAIN_VAULT, SectorID.THE_MAST, SectorID.SCRAPYARD]; },
    getWeapons(): WeaponStats[] { return WEAPONS; },
    getFamilyMembers(): typeof FAMILY_MEMBERS { return FAMILY_MEMBERS; },

    /**
     * SMI TO STRING RESOLUTION (Zero-GC)
     */
    resolveClueId(smi: any): string { return CLUE_SMI_MAP[Number(smi)] || String(smi); },
    resolvePoiId(smi: any): string { return POI_SMI_MAP[Number(smi)] || String(smi); },
    resolveCollectibleId(smi: any): string { return COLLECTIBLE_SMI_MAP[Number(smi)] || String(smi); },

    resolveDiscoveryId(type: DiscoveryType, id: any): string {
        if (typeof id === 'string') return id;
        const smi = Number(id);
        switch (type) {
            case DiscoveryType.CLUE: return this.resolveClueId(smi);
            case DiscoveryType.POI: return this.resolvePoiId(smi);
            case DiscoveryType.COLLECTIBLE: return this.resolveCollectibleId(smi);
            default: return String(id);
        }
    },

    /**
     * Returns a pre-computed list of perks by category (O(1)).
     */
    getPerksByCategory(cat: PerkCategory): any[] {
        return PERK_CATALOG[cat] || [];
    },

    /**
     * Resolves the localized label for a Perk Category for UI display.
     */
    getCategoryLabel(cat: PerkCategory): string {
        switch (cat) {
            case PerkCategory.PASSIVE: return 'ui.passive_abilities';
            case PerkCategory.BUFF: return 'ui.buffs';
            case PerkCategory.DEBUFF: return 'ui.debuffs';
            default: return 'ui.unknown';
        }
    },


    /**
     * Resolves the translation key for a Perk Category (short version).
     */
    getPerkCategoryKey(cat: PerkCategory): string {
        switch (cat) {
            case PerkCategory.PASSIVE: return 'categories.passive';
            case PerkCategory.BUFF: return 'categories.buff';
            case PerkCategory.DEBUFF: return 'categories.debuff';
            default: return 'ui.unknown';
        }
    },



};
