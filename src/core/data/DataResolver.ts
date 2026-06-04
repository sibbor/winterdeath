import { DamageID, DamageType, EnemyAttackType, ENEMY_ATTACK_NAMES, ENVIRONMENTAL_DAMAGE_NAMES, ABILITY_DAMAGE_NAMES, VEHICLE_DAMAGE_NAMES, DAMAGE_DOMAIN } from '../../entities/player/CombatTypes';
import { WeaponID, ToolID, AbilityID, HoldableID } from '../../entities/player/CombatTypes';
import { EnemyType } from '../../entities/enemies/EnemyTypes';
import { WEAPONS, WEAPON_CATEGORY_NAMES, WeaponCategory } from '../../content/weapons';
import { TOOLS } from '../../content/tools';
import { ABILITIES } from '../../content/abilities';
import { ZOMBIE_TYPES } from '../../content/enemies/zombies';
import { BOSSES } from '../../content/enemies/bosses';
import { POIS, PoiID } from '../../content/pois';
import { CLUES, ClueID } from '../../content/clues';
import { COLLECTIBLES, CollectibleID } from '../../content/collectibles';
import { PERKS, PERK_CATALOG, PerkCategory } from '../../content/perks';
import { FAMILY_MEMBERS, FamilyMemberID, PLAYER_CHARACTER, SPEAKER_ID_TO_KEY, VoiceParams, VOICE_PARAMS_MAP } from '../../content/constants';
import { DiscoveryType } from '../../components/ui/hud/HudTypes';
import { TelemetrySourceOffset, TELEMETRY_SOURCES_COUNT } from '../../types/CareerStats';
import { BossID, SectorID, SECTOR_THEMES } from '../../game/session/SectorTypes';
import { t } from '../../utils/i18n';
import { en } from '../../locales/en';
import { StatusEffectID } from '../../types/StatusEffects';
import { COLORS } from '../../utils/ui/ColorUtils';
import { SectorEventID } from '../../content/sector_events';

/**
 * DataResolver.ts
 * 
 * Unified UI data bridge for consistent rendering of combat entities.
 * Ensures O(1) lookups for names, icons, and descriptions across weapons, tools, and abilities.
 * Maintains Zero-GC performance by returning static references.
 */

export interface UnifiedCombatData {
  id: number;
  name: string;
  description: string;
  icon: string;
  iconIsPng?: boolean;
  categoryName?: string;
  color?: string;
}

const FALLBACK_DATA: UnifiedCombatData = {
  id: DamageID.NONE,
  name: 'Unknown',
  description: '',
  icon: 'question-mark',
  categoryName: 'misc'
};

const DISCOVERY_BUCKETS: Record<number, any[]> = {
  [DiscoveryType.POI]: Object.values(POIS),
  [DiscoveryType.COLLECTIBLE]: Object.values(COLLECTIBLES),
  [DiscoveryType.CLUE]: Object.values(CLUES),
  [DiscoveryType.BOSS]: Object.entries(BOSSES).map(([id, boss]) => ({ ...boss, id: Number(id) })),
  [DiscoveryType.ZOMBIE]: Object.entries(ZOMBIE_TYPES).map(([type, data]) => ({ ...data, id: type, type: Number(type) }))
};

// --- SMI MAPPING (Zero-GC Transport) ---
const POI_SMI_MAP: Record<number, string> = {};
const CLUE_SMI_MAP: Record<number, string> = {};
const REACTION_SMI_MAP: Record<number, string> = {};
const COLLECTIBLE_SMI_MAP: Record<number, string> = {};

const poiValues = Object.values(POIS);
for (let i = 0; i < poiValues.length; i++) {
  const p = poiValues[i];
  POI_SMI_MAP[p.id] = String(p.id);
  POI_SMI_MAP[(p.sector << 8) | p.index] = String(p.id);
}

const clueValues = Object.values(CLUES);
for (let i = 0; i < clueValues.length; i++) {
  const c = clueValues[i];
  CLUE_SMI_MAP[c.id] = String(c.id);
  CLUE_SMI_MAP[(c.sector << 8) | c.index] = String(c.id);
}

const collValues = Object.values(COLLECTIBLES);
for (let i = 0; i < collValues.length; i++) {
  const c = collValues[i];
  COLLECTIBLE_SMI_MAP[c.id] = String(c.id);
  COLLECTIBLE_SMI_MAP[(c.sector << 8) | c.index] = String(c.id);
}

function resolvePoiID(id: any): PoiID | undefined {
  if (id === undefined || id === null) return undefined;
  if (typeof id === 'object') id = id.id;
  if (typeof id === 'number') return id;
  const num = Number(id);
  if (!isNaN(num)) return num as PoiID;
  const strId = typeof id === 'string' ? id : String(id);
  const enumVal = PoiID[strId.toUpperCase() as keyof typeof PoiID];
  if (typeof enumVal === 'number') return enumVal;
  const found = Object.values(POIS).find(p => PoiID[p.id]?.toUpperCase() === strId.toUpperCase());
  if (found) return found.id;
  return undefined;
}

function resolveClueID(id: any): ClueID | undefined {
  if (id === undefined || id === null) return undefined;
  if (typeof id === 'object') id = id.id;
  if (typeof id === 'number') return id;
  const num = Number(id);
  if (!isNaN(num)) return num as ClueID;
  const strId = typeof id === 'string' ? id : String(id);
  const enumVal = ClueID[strId.toUpperCase() as keyof typeof ClueID];
  if (typeof enumVal === 'number') return enumVal;
  const found = Object.values(CLUES).find(c => ClueID[c.id]?.toUpperCase() === strId.toUpperCase());
  if (found) return found.id;
  return undefined;
}

function resolveCollectibleID(id: any): CollectibleID | undefined {
  if (id === undefined || id === null) return undefined;
  if (typeof id === 'object') id = id.id;
  if (typeof id === 'number') return id;
  const num = Number(id);
  if (!isNaN(num)) return num as CollectibleID;
  const strId = typeof id === 'string' ? id : String(id);
  const enumVal = CollectibleID[strId.toUpperCase() as keyof typeof CollectibleID];
  if (typeof enumVal === 'number') return enumVal;
  const found = Object.values(COLLECTIBLES).find(c => CollectibleID[c.id]?.toUpperCase() === strId.toUpperCase());
  if (found) return found.id;
  return undefined;
}

function hashStringToSMI(str: string): number {
  let h = 2166136261 | 0;
  const len = str.length | 0;
  for (let i = 0; i < len; i = (i + 1) | 0) {
    h = (h ^ str.charCodeAt(i)) | 0;
    h = Math.imul(h, 16777619) | 0;
  }
  return h & 0x7FFFFFFF;
}

// Pre-hash Clue reactions
for (let i = 0; i < clueValues.length; i++) {
  const c = clueValues[i];
  const key = `clues.${c.sector}.${c.index}.reaction`;
  REACTION_SMI_MAP[c.id] = key;
  REACTION_SMI_MAP[hashStringToSMI(String(c.id))] = key;
}

// Pre-hash POI reactions
for (let i = 0; i < poiValues.length; i++) {
  const p = poiValues[i];
  const key = p.reactionKey || `pois.${p.sector}.${p.index}.reaction`;
  REACTION_SMI_MAP[p.id] = key;
  REACTION_SMI_MAP[hashStringToSMI(String(p.id))] = key;
}

// Pre-hash Sector Event reactions
for (const key in SectorEventID) {
  const val = SectorEventID[key];
  if (typeof val === 'number') {
    const sector = ((val - 15000) >> 8) & 0xFF;
    const index = (val - 15000) & 0xFF;
    const reactionKey = `sector_events.${sector}.${index}.reaction`;
    REACTION_SMI_MAP[val] = reactionKey;
    REACTION_SMI_MAP[hashStringToSMI(String(val))] = reactionKey;
  }
}

// --- SPEAKER MAPPING (Zero-GC) ---
const SPEAKER_TO_ID: Record<string, FamilyMemberID> = {
  'robert': FamilyMemberID.ROBERT,
  'player': FamilyMemberID.ROBERT,
  'loke': FamilyMemberID.LOKE,
  'jordan': FamilyMemberID.JORDAN,
  'esmeralda': FamilyMemberID.ESMERALDA,
  'nathalie': FamilyMemberID.NATHALIE,
  'sotis': FamilyMemberID.SOTIS,
  'panter': FamilyMemberID.PANTER,
  'unknown': FamilyMemberID.UNKNOWN,
  'radio': FamilyMemberID.RADIO
};

const SPEAKER_COLORS: Record<number, any> = {
  [FamilyMemberID.ROBERT]: PLAYER_CHARACTER.color,
  [FamilyMemberID.UNKNOWN]: COLORS.GRAY,
  [FamilyMemberID.RADIO]: COLORS.GRAY
};

for (let i = 0; i < FAMILY_MEMBERS.length; i++) {
  const m = FAMILY_MEMBERS[i];
  SPEAKER_COLORS[m.id] = m.color;
}

export const DataResolver = {

  // --- NARRATIVE & SPEAKERS ---
  resolveSpeaker(idOrKey: number | string): FamilyMemberID {
    if (typeof idOrKey === 'number') return idOrKey as FamilyMemberID;

    // FIX 1: Catch the ID if it's a string (e.g. "2" from HudStore)
    const parsedNum = Number(idOrKey);
    if (!isNaN(parsedNum) && String(idOrKey).trim() !== '') {
      return parsedNum as FamilyMemberID;
    }

    // 3. Fallback for text keys
    const key = String(idOrKey).toLowerCase();
    return SPEAKER_TO_ID[key] ?? FamilyMemberID.UNKNOWN;
  },

  getSpeakerColor(idOrKey: FamilyMemberID | string): string {
    const speakerId = this.resolveSpeaker(idOrKey);
    const color = SPEAKER_COLORS[speakerId];
    return color ? color.str : COLORS.WHITE.str;
  },

  getFamilyMemberName(idOrKey: FamilyMemberID | string): string {
    const speakerId = this.resolveSpeaker(idOrKey);
    if (speakerId === FamilyMemberID.ROBERT) return this.getPlayerName();

    const member = FAMILY_MEMBERS.find(m => m.id === speakerId);

    return member ? member.name : t('ui.unknown');
  },

  getPlayerName(): string {
    return PLAYER_CHARACTER.name;
  },

  getChatterLines(id: FamilyMemberID): string[] {
    const key = SPEAKER_ID_TO_KEY[id];
    const chatter = t('chatter');
    return (chatter && (chatter as any)[key]) || ["..."];
  },

  getVoiceParams(id: number): VoiceParams {
    return VOICE_PARAMS_MAP[id] || VOICE_PARAMS_MAP[FamilyMemberID.UNKNOWN];
  },

  // --- WEAPONS & ABILITIES (Domain Pipeline) ---

  getHoldableData(id: HoldableID): UnifiedCombatData {
    if (id >= WeaponID.SMG && id <= WeaponID.ARC_CANNON) {
      const wep = WEAPONS[id as WeaponID];
      if (wep) {
        return {
          id: id as number,
          name: wep.displayName,
          description: `weapons.${wep.name}.description`,
          icon: wep.icon || 'weapon-generic',
          iconIsPng: wep.iconIsPng,
          categoryName: 'weapon'
        };
      }
    } else if (id === ToolID.RADIO) {
      const tool = TOOLS[id as ToolID];
      if (tool) {
        return {
          id: id as number,
          name: tool.displayName,
          description: `tools.radio.description`,
          icon: tool.icon || 'tool-generic',
          iconIsPng: tool.iconIsPng,
          categoryName: 'tool'
        };
      }
    }
    return FALLBACK_DATA;
  },

  getAbilityData(id: AbilityID): UnifiedCombatData {
    const ability = ABILITIES[id];
    if (ability) {
      return {
        id: id as number,
        name: ability.displayName,
        description: ability.description || '',
        icon: ability.icon || 'ability-generic',
        iconIsPng: ability.iconIsPng,
        categoryName: 'ability'
      };
    }
    return FALLBACK_DATA;
  },

  getWeaponCategoryName(cat: WeaponCategory): string {
    return WEAPON_CATEGORY_NAMES[cat] || 'ui.unknown';
  },

  getWeaponName(id: WeaponID, logFriendly: boolean = false): string {
    const wep = WEAPONS[id];
    const key = wep ? wep.displayName : 'ui.unknown';
    if (logFriendly) return this._resolveLogName(key);
    return key;
  },

  // --- COMBAT & TELEMETRY ---

  getDamageData(id: DamageID): UnifiedCombatData {
    // 1. ARSENAL: Weapons & Tools
    if (id >= DAMAGE_DOMAIN.ARSENAL_MIN && id <= DAMAGE_DOMAIN.ARSENAL_MAX) {
      return this.getHoldableData(id as number as HoldableID);
    }

    // 2. TACTICS: Abilities
    if (id >= DAMAGE_DOMAIN.TACTICS_MIN && id <= DAMAGE_DOMAIN.TACTICS_MAX) {
      const abilityData = this.getAbilityData(id as number as AbilityID);
      return { ...abilityData, categoryName: 'ability' };
    }

    // 3. TRANSPORT: Vehicles
    if (id >= DAMAGE_DOMAIN.VEHICLES_MIN && id <= DAMAGE_DOMAIN.VEHICLES_MAX) {
      const vehicleName = VEHICLE_DAMAGE_NAMES[id] || 'ui.vehicle';
      return {
        id: id as number,
        name: vehicleName,
        description: 'abilities.vehicle_desc',
        icon: 'vehicle',
        categoryName: 'vehicle'
      };
    }

    // 4. ENVIRONMENT: Hazards
    if (id >= DAMAGE_DOMAIN.ENVIRONMENT_MIN && id <= DAMAGE_DOMAIN.ENVIRONMENT_MAX) {
      const envName = ENVIRONMENTAL_DAMAGE_NAMES[id];
      if (envName) {
        return {
          id: id as number,
          name: envName,
          description: '',
          icon: 'hazard',
          categoryName: 'environment'
        };
      }
    }

    return FALLBACK_DATA;
  },

  /**
   * Resolves the source of INCOMING damage (Enemy -> Player)
   * Unified logic to handle EnemyPool indices, Boss offsets, and Environment IDs.
   */
  resolveIncomingSource(sourceId: number): { name: string; category: string; icon: string } {
    // 1. Standard Enemy Type (EnemyPool)
    if (sourceId < TelemetrySourceOffset.BOSS) {
      const data = this.getEnemyData(sourceId);
      return { name: data.name, category: 'ui.enemy', icon: data.icon };
    }

    // 2. Boss Type
    if (sourceId < TelemetrySourceOffset.ENVIRONMENT) {
      const bossId = (sourceId - TelemetrySourceOffset.BOSS) as any as BossID;
      return { name: this.getBossName(bossId), category: 'ui.boss', icon: 'boss-generic' };
    }

    // 3. Environmental Hazards & Static Traps
    if (sourceId < TELEMETRY_SOURCES_COUNT) {
      const damageId = (sourceId - TelemetrySourceOffset.ENVIRONMENT) as any as DamageID;
      const data = this.getDamageData(damageId);
      if (data !== FALLBACK_DATA) {
        return { name: data.name, category: data.categoryName || 'ui.environmental', icon: data.icon };
      }
    }

    return { name: 'ui.unknown', category: 'ui.environmental', icon: 'hazard' };
  },

  /**
   * Resolves the source of OUTGOING damage (Player -> Enemy)
   */
  resolveOutgoingSource(id: number): { name: string; category: string; icon: string } {
    const data = this.getDamageData(id as DamageID);
    if (data !== FALLBACK_DATA) {
      return { name: data.name, category: data.categoryName || 'ui.unknown', icon: data.icon };
    }

    return { name: 'ui.unknown', category: 'ui.unknown', icon: 'weapon-generic' };
  },

  getDamageName(id: DamageID): string {
    const data = this.getDamageData(id);
    return data.name;
  },

  getEffectName(id: number, logFriendly: boolean = false): string {
    const key = ENVIRONMENTAL_DAMAGE_NAMES[id as DamageID] || 'ui.unknown';
    if (logFriendly) return this._resolveLogName(key);
    return key;
  },

  getDamageTypeName(type: DamageType): string {
    switch (type) {
      case DamageType.BALLISTIC: return 'ui.damage_ballistic';
      case DamageType.PHYSICAL: return 'ui.damage_physical';
      case DamageType.BURN: return 'ui.damage_burn';
      case DamageType.BLEED: return 'ui.damage_bleed';
      case DamageType.DROWNING: return 'ui.damage_drowning';
      case DamageType.ELECTRIC: return 'ui.damage_electric';
      case DamageType.EXPLOSION: return 'ui.damage_explosion';
      case DamageType.FROST: return 'ui.damage_frost';
      default: return 'ui.damage_generic';
    }
  },

  getDamageColor(source: number): number {
    if (source === DamageID.BURN || source === WeaponID.MOLOTOV || source === WeaponID.FLAMETHROWER) return 0xff4400;
    if (source === DamageID.ELECTRIC || source === WeaponID.ARC_CANNON) return 0x00ffff;
    if (source === DamageID.FROST || source === DamageID.DROWNING) return 0x4488ff;
    if (source === DamageID.EXPLOSION || source === WeaponID.GRENADE) return 0xffcc00;
    if (source === DamageID.BLEED) return 0x880000;
    return 0xffffff;
  },

  // --- LOG FRIENDLY RESOLUTION ---
  _logNameCache: new Map<string, string>(),
  _resolveLogName(key: string): string {
    if (!key) return 'Unknown';
    const cached = this._logNameCache.get(key);
    if (cached) return cached;

    const parts = key.split('.');
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

  // --- ENEMIES ---

  getEnemyData(type: number): { name: string; icon: string } {
    const data = ZOMBIE_TYPES[type];
    if (data) {
      return {
        name: data.name,
        icon: 'zombie-generic'
      };
    }
    return { name: 'Unknown Enemy', icon: 'zombie-generic' };
  },

  getEnemyName(type: EnemyType, bossId: BossID = BossID.NONE, logFriendly: boolean = false): string {
    let key = '';
    if (type === EnemyType.BOSS && bossId !== BossID.NONE) {
      key = this.getBossName(bossId);
    } else {
      key = this.getZombieName(type);
    }
    if (logFriendly) return this._resolveLogName(key);
    return key;
  },

  getZombieName(type: number | string): string {
    const tNum = typeof type === 'number' ? type : (isNaN(Number(type)) ? (EnemyType[type.toUpperCase() as keyof typeof EnemyType] as any) : Number(type));
    return this.getEnemyData(typeof tNum === 'number' ? tNum : EnemyType.WALKER).name;
  },

  getZombieStory(type: EnemyType | string | number): string {
    const tNum = typeof type === 'number' ? type : (isNaN(Number(type)) ? (EnemyType[type.toUpperCase() as keyof typeof EnemyType] as any) : Number(type));
    const data = ZOMBIE_TYPES[typeof tNum === 'number' ? tNum : EnemyType.WALKER];
    return data ? data.story : 'ui.unknown';
  },

  getBossName(id: BossID | string | number): string {
    const bId = typeof id === 'number' ? id : (isNaN(Number(id)) ? (BossID[id.toUpperCase() as keyof typeof BossID] as any) : Number(id));
    const boss = BOSSES[typeof bId === 'number' ? bId : 0];
    return boss ? boss.name : 'ui.boss';
  },

  getBossStory(id: BossID | string | number): string {
    const bId = typeof id === 'number' ? id : (isNaN(Number(id)) ? (BossID[id.toUpperCase() as keyof typeof BossID] as any) : Number(id));
    const boss = BOSSES[typeof bId === 'number' ? bId : 0];
    return boss ? boss.story : 'ui.unknown';
  },

  getBossDeathStory(id: BossID | string | number): string {
    const bId = typeof id === 'number' ? id : (isNaN(Number(id)) ? (BossID[id.toUpperCase() as keyof typeof BossID] as any) : Number(id));
    const boss = BOSSES[typeof bId === 'number' ? bId : 0];
    return boss ? boss.deathStory : 'ui.unknown';
  },

  getAttackName(type: EnemyAttackType, logFriendly: boolean = false): string {
    const key = ENEMY_ATTACK_NAMES[type] || 'ui.unknown';
    if (logFriendly) return this._resolveLogName(key);
    return key;
  },

  getAttackDescription(type: EnemyAttackType | DamageID): string {
    let attackKey = EnemyAttackType[type as number];
    if (!attackKey) attackKey = DamageID[type as number];
    return attackKey ? `attacks.${attackKey}.description` : 'ui.description_missing';
  },

  // --- WORLD & DISCOVERY ---

  getSectorName(id: number): string {
    const theme = SECTOR_THEMES[id];
    return theme ? theme.name : `sectors.sector_${id}_name`;
  },

  getSectorDescription(id: number): string {
    const theme = SECTOR_THEMES[id];
    return theme ? theme.briefing : `story.sector_${id}_briefing`;
  },

  getSectorFamilyMemberId(id: number): number | undefined {
    return SECTOR_THEMES[id]?.familyMemberId;
  },

  getPoiName(id: string | number | PoiID): string {
    const resolved = resolvePoiID(id);
    if (resolved !== undefined) {
      const poi = POIS[resolved];
      if (poi) return poi.displayNameKey;
      const sector = (resolved >> 8) & 0xFF;
      const index = resolved & 0xFF;
      return `pois.${sector}.${index}.title`;
    }
    return '';
  },

  getPoiDescription(id: string | number | PoiID): string {
    const resolved = resolvePoiID(id);
    if (resolved !== undefined) {
      const poi = POIS[resolved];
      if (poi) return poi.descriptionKey || `pois.${poi.sector}.${poi.index}.description`;
      const sector = (resolved >> 8) & 0xFF;
      const index = resolved & 0xFF;
      return `pois.${sector}.${index}.description`;
    }
    return '';
  },

  getPoiReaction(id: string | number | PoiID): string {
    const resolved = resolvePoiID(id);
    if (resolved !== undefined) {
      const poi = POIS[resolved];
      if (poi) return poi.reactionKey || `pois.${poi.sector}.${poi.index}.reaction`;
      const sector = (resolved >> 8) & 0xFF;
      const index = resolved & 0xFF;
      return `pois.${sector}.${index}.reaction`;
    }
    return '';
  },

  getCollectibleName(id: string | number | CollectibleID): string {
    const resolved = resolveCollectibleID(id);
    if (resolved !== undefined) {
      const item = COLLECTIBLES[resolved];
      if (item) return `collectibles.${item.sector}.${item.index}.title`;
      const sector = (resolved >> 8) & 0xFF;
      const index = resolved & 0xFF;
      return `collectibles.${sector}.${index}.title`;
    }
    return '';
  },

  getCollectibleDescription(id: string | number | CollectibleID): string {
    const resolved = resolveCollectibleID(id);
    if (resolved !== undefined) {
      const item = COLLECTIBLES[resolved];
      if (item) return `collectibles.${item.sector}.${item.index}.description`;
      const sector = (resolved >> 8) & 0xFF;
      const index = resolved & 0xFF;
      return `collectibles.${sector}.${index}.description`;
    }
    return '';
  },

  getClueReaction(id: string | number | ClueID): string {
    const resolved = resolveClueID(id);
    if (resolved !== undefined) {
      const clue = CLUES[resolved];
      if (clue) return `clues.${clue.sector}.${clue.index}.reaction`;
      const sector = (resolved >> 8) & 0xFF;
      const index = resolved & 0xFF;
      return `clues.${sector}.${index}.reaction`;
    }
    return '';
  },

  getSectorEventReaction(id: string | number | SectorEventID): string {
    if (id === undefined || id === null) return '';
    const numId = Number(id);
    if (!isNaN(numId)) {
      const sector = ((numId - 15000) >> 8) & 0xFF;
      const index = (numId - 15000) & 0xFF;
      return `sector_events.${sector}.${index}.reaction`;
    }
    return '';
  },

  getDiscoveryTitle(type: DiscoveryType): string {
    switch (type) {
      case DiscoveryType.CLUE: return 'ui.discovered_clue';
      case DiscoveryType.POI: return 'ui.discovered_poi';
      case DiscoveryType.COLLECTIBLE: return 'ui.discovered_collectible';
      case DiscoveryType.ZOMBIE: return 'ui.discovered_enemy';
      case DiscoveryType.BOSS: return 'ui.discovered_boss';
      case DiscoveryType.PERK: return 'ui.discovered_perk';
      default: return 'ui.discovery';
    }
  },

  getDiscoveryList(type: DiscoveryType): any[] {
    return DISCOVERY_BUCKETS[type] || [];
  },

  getReactionSmi(id: string): number {
    return hashStringToSMI(id);
  },

  getReactionKeyFromSmi(smi: number): string {
    return REACTION_SMI_MAP[smi] || '';
  },

  getAdventureLogTab(type: DiscoveryType): DiscoveryType {
    return type;
  },

  registerReaction(id: string | number, key: string) {
    if (id === undefined || id === null || !key) return;
    const numId = Number(id);
    if (!isNaN(numId)) {
      REACTION_SMI_MAP[numId] = key;
    }
    REACTION_SMI_MAP[hashStringToSMI(String(id))] = key;
  },

  // --- PERKS ---
  getPerkName(id: StatusEffectID, logFriendly: boolean = false): string {
    const perk = PERKS[id];
    const key = perk ? perk.displayName : 'ui.unknown';
    if (logFriendly) return this._resolveLogName(key);
    return key;
  },

  getPerkDescription(id: StatusEffectID): string {
    const perk = PERKS[id];
    return perk ? perk.description : 'ui.description_missing';
  },

  getPerkPrerequisite(id: StatusEffectID): string {
    const perk = PERKS[id];
    return perk ? perk.prerequisite || '' : '';
  },

  getPerksByCategory(cat: PerkCategory): any[] {
    return PERK_CATALOG[cat] || [];
  },

  getCategoryLabel(cat: PerkCategory): string {
    switch (cat) {
      case PerkCategory.PASSIVE: return 'ui.passives';
      case PerkCategory.BUFF: return 'ui.buffs';
      case PerkCategory.DEBUFF: return 'ui.debuffs';
      default: return 'ui.unknown';
    }
  },

  getPerkCategoryKey(cat: PerkCategory): string {
    switch (cat) {
      case PerkCategory.PASSIVE: return 'categories.passive';
      case PerkCategory.BUFF: return 'categories.buff';
      case PerkCategory.DEBUFF: return 'categories.debuff';
      default: return 'ui.unknown';
    }
  },

  getRankName(level: number): string {
    const rankKey = Math.min(Math.max(0, level - 1), 19);
    return `ranks.${rankKey}`;
  },

  // --- CONTENT ACCESSORS ---
  getZombies(): typeof ZOMBIE_TYPES { return ZOMBIE_TYPES; },
  getBosses(): typeof BOSSES { return BOSSES; },
  getPois(): typeof POIS { return POIS; },
  getCollectibles(): typeof COLLECTIBLES { return COLLECTIBLES; },
  getClues(): typeof CLUES { return CLUES; },
  getPerks(): typeof PERKS { return PERKS; },
  getSectorThemes(): typeof SECTOR_THEMES { return SECTOR_THEMES; },
  getSectors(): number[] { return [SectorID.VILLAGE, SectorID.MOUNTAIN_VAULT, SectorID.MAST, SectorID.SCRAPYARD]; },
  getWeapons(): typeof WEAPONS { return WEAPONS; },
  getAbilities(): typeof ABILITIES { return ABILITIES; },
  getFamilyMembers(): typeof FAMILY_MEMBERS { return FAMILY_MEMBERS; },

  // --- SMI RESOLUTION (Zero-GC) ---
  resolveClueId(smi: any): string { return CLUE_SMI_MAP[Number(smi)] || String(smi); },
  resolvePoiId(smi: any): string { return POI_SMI_MAP[Number(smi)] || String(smi); },
  resolveCollectibleId(smi: any): string { return COLLECTIBLE_SMI_MAP[Number(smi)] || String(smi); },

  resolvePoiID(id: any): PoiID | undefined {
    return resolvePoiID(id);
  },
  resolveClueID(id: any): ClueID | undefined {
    return resolveClueID(id);
  },
  resolveCollectibleID(id: any): CollectibleID | undefined {
    return resolveCollectibleID(id);
  },

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
};
