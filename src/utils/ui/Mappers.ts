import { DamageID, EnemyAttackType } from '../../entities/player/CombatTypes';
import { EnemyType } from '../../entities/enemies/EnemyTypes';
import { WeaponCategory } from '../../content/weapons';
import { DiscoveryType } from '../../components/ui/hud/HudTypes';

/**
 * VINTERDÖD: Static Mapping Arrays for Zero-GC UI Rendering.
 * These arrays provide O(1) lookup from numeric SMI enums to translation keys.
 * This eliminates runtime string manipulation/interpolation (Concatenation, .toLowerCase()).
 * 
 * NOTE: These are sparse arrays indexed by the enum's numeric value.
 */

export const DAMAGE_ID_KEYS: string[] = [];
DAMAGE_ID_KEYS[DamageID.NONE] = 'ui.none';
DAMAGE_ID_KEYS[DamageID.SMG] = 'weapons.smg';
DAMAGE_ID_KEYS[DamageID.SHOTGUN] = 'weapons.shotgun';
DAMAGE_ID_KEYS[DamageID.RIFLE] = 'weapons.rifle';
DAMAGE_ID_KEYS[DamageID.PISTOL] = 'weapons.pistol';
DAMAGE_ID_KEYS[DamageID.REVOLVER] = 'weapons.revolver';
DAMAGE_ID_KEYS[DamageID.GRENADE] = 'weapons.grenade';
DAMAGE_ID_KEYS[DamageID.MOLOTOV] = 'weapons.molotov';
DAMAGE_ID_KEYS[DamageID.FLASHBANG] = 'weapons.flashbang';
DAMAGE_ID_KEYS[DamageID.MINIGUN] = 'weapons.minigun';
DAMAGE_ID_KEYS[DamageID.FLAMETHROWER] = 'weapons.flamethrower';
DAMAGE_ID_KEYS[DamageID.ARC_CANNON] = 'weapons.arc_cannon';
DAMAGE_ID_KEYS[DamageID.RADIO] = 'weapons.radio';
DAMAGE_ID_KEYS[DamageID.RUSH] = 'weapons.rush';
DAMAGE_ID_KEYS[DamageID.VEHICLE] = 'weapons.vehicle';

DAMAGE_ID_KEYS[DamageID.PHYSICAL] = 'ui.physical';
DAMAGE_ID_KEYS[DamageID.BURN] = 'ui.burn';
DAMAGE_ID_KEYS[DamageID.FIRE] = 'ui.fire';
DAMAGE_ID_KEYS[DamageID.BLEED] = 'ui.bleed';
DAMAGE_ID_KEYS[DamageID.DROWNING] = 'ui.drowning';
DAMAGE_ID_KEYS[DamageID.FALL] = 'ui.fall';
DAMAGE_ID_KEYS[DamageID.FALL_DAMAGE] = 'ui.fall_damage';
DAMAGE_ID_KEYS[DamageID.EXPLOSION] = 'ui.explosion';
DAMAGE_ID_KEYS[DamageID.BITE] = 'ui.bite';
DAMAGE_ID_KEYS[DamageID.ELECTRIC] = 'ui.electric';
DAMAGE_ID_KEYS[DamageID.BOSS] = 'ui.boss';
DAMAGE_ID_KEYS[DamageID.BOSS_GENERIC] = 'ui.boss';
DAMAGE_ID_KEYS[DamageID.OTHER] = 'ui.other';
DAMAGE_ID_KEYS[DamageID.VEHICLE_SPLATTER] = 'ui.vehicle_splatter';
DAMAGE_ID_KEYS[DamageID.VEHICLE_RAM] = 'ui.vehicle_ram';
DAMAGE_ID_KEYS[DamageID.VEHICLE_PUSH] = 'ui.vehicle_push';

export const ENEMY_TYPE_KEYS: string[] = [];
ENEMY_TYPE_KEYS[EnemyType.WALKER] = 'enemies.zombies.WALKER.name';
ENEMY_TYPE_KEYS[EnemyType.RUNNER] = 'enemies.zombies.RUNNER.name';
ENEMY_TYPE_KEYS[EnemyType.TANK] = 'enemies.zombies.TANK.name';
ENEMY_TYPE_KEYS[EnemyType.BOMBER] = 'enemies.zombies.BOMBER.name';
ENEMY_TYPE_KEYS[EnemyType.BOSS] = 'ui.boss';

export const BOSS_NAME_KEYS: string[] = [];
BOSS_NAME_KEYS[0] = 'bosses.0.name';
BOSS_NAME_KEYS[1] = 'bosses.1.name';
BOSS_NAME_KEYS[2] = 'bosses.2.name';
BOSS_NAME_KEYS[3] = 'bosses.3.name';

export const WEAPON_CATEGORY_KEYS: string[] = [];
WEAPON_CATEGORY_KEYS[WeaponCategory.PRIMARY] = 'categories.primary';
WEAPON_CATEGORY_KEYS[WeaponCategory.SECONDARY] = 'categories.secondary';
WEAPON_CATEGORY_KEYS[WeaponCategory.THROWABLE] = 'categories.throwable';
WEAPON_CATEGORY_KEYS[WeaponCategory.SPECIAL] = 'categories.special';
WEAPON_CATEGORY_KEYS[WeaponCategory.TOOL] = 'categories.tool';

export const ENEMY_ATTACK_NAMES: string[] = [];
ENEMY_ATTACK_NAMES[EnemyAttackType.HIT] = 'HIT';
ENEMY_ATTACK_NAMES[EnemyAttackType.BITE] = 'BITE';
ENEMY_ATTACK_NAMES[EnemyAttackType.JUMP] = 'JUMP';
ENEMY_ATTACK_NAMES[EnemyAttackType.EXPLODE] = 'EXPLODE';
ENEMY_ATTACK_NAMES[EnemyAttackType.SMASH] = 'SMASH';
ENEMY_ATTACK_NAMES[EnemyAttackType.FREEZE_JUMP] = 'FREEZE_JUMP';
ENEMY_ATTACK_NAMES[EnemyAttackType.SCREECH] = 'SCREECH';
ENEMY_ATTACK_NAMES[EnemyAttackType.ELECTRIC_BEAM] = 'ELECTRIC_BEAM';
ENEMY_ATTACK_NAMES[EnemyAttackType.MAGNETIC_CHAIN] = 'MAGNETIC_CHAIN';

export const ATTACK_TYPE_KEYS: string[] = [];
ATTACK_TYPE_KEYS[EnemyAttackType.HIT] = 'attacks.HIT.title';
ATTACK_TYPE_KEYS[EnemyAttackType.BITE] = 'attacks.BITE.title';
ATTACK_TYPE_KEYS[EnemyAttackType.JUMP] = 'attacks.JUMP.title';
ATTACK_TYPE_KEYS[EnemyAttackType.EXPLODE] = 'attacks.EXPLODE.title';
ATTACK_TYPE_KEYS[EnemyAttackType.SMASH] = 'attacks.SMASH.title';
ATTACK_TYPE_KEYS[EnemyAttackType.FREEZE_JUMP] = 'attacks.FREEZE_JUMP.title';
ATTACK_TYPE_KEYS[EnemyAttackType.SCREECH] = 'attacks.SCREECH.title';
ATTACK_TYPE_KEYS[EnemyAttackType.ELECTRIC_BEAM] = 'attacks.ELECTRIC_BEAM.title';
ATTACK_TYPE_KEYS[EnemyAttackType.MAGNETIC_CHAIN] = 'attacks.MAGNETIC_CHAIN.title';

export const DISCOVERY_TYPE_KEYS: string[] = [];
DISCOVERY_TYPE_KEYS[DiscoveryType.CLUE] = 'ui.clue';
DISCOVERY_TYPE_KEYS[DiscoveryType.POI] = 'ui.poi';
DISCOVERY_TYPE_KEYS[DiscoveryType.COLLECTIBLE] = 'ui.collectible_discovered';
DISCOVERY_TYPE_KEYS[DiscoveryType.ENEMY] = 'ui.enemy_encountered';
DISCOVERY_TYPE_KEYS[DiscoveryType.BOSS] = 'ui.boss_encountered';
DISCOVERY_TYPE_KEYS[DiscoveryType.PERK] = 'ui.skill_point';
