import { ClueID } from '../content/clues';
import { CollectibleID } from '../content/collectibles';
import { FamilyMemberID } from '../content/constants';
import { PoiID } from '../content/pois';
import { SectorEventID } from '../content/sector_events';

/**
 * Centralized Trigger Types & Statuses.
 * Numeric enums (SMI) are used for O(1) matching and to prevent heap allocations
 * during high-frequency trigger checking in TriggerSystem.
 */

export enum TriggerType {
  NONE = 0,
  COLLECTIBLE = 1,
  CLUE = 2,
  POI = 3,
  ENEMY = 4,
  BOSS = 5,
  INTERACTION = 6,
  STATION = 7,
  SECTOR_END = 8,
  SPEAK = 9,
  THOUGHT = 10,
  INFO = 11,
  AMBUSH = 12,
  EVENT = 13,
  ZONE = 14,
}

export enum TriggerActionType {
  NONE = 0,
  GIVE_REWARD = 1,
  START_CINEMATIC = 2,
  SPAWN_ENEMY = 3,
  PLAY_SOUND = 4,
  SET_STATE = 5,
  COMPLETE_MISSION = 6,
  APPLY_EFFECT = 7,
  SPAWN_BOSS = 9,
  FAMILY_MEMBER_FOLLOW = 10,
  FAMILY_MEMBER_FOUND = 11,
  SET_SECTOR_FLAG = 12,
  END_SECTOR = 13,
  CAMERA_SHAKE = 14,
  CAMERA_PAN = 15,
  START_WAVE = 16
}

export enum TriggerStatus {
  NONE = 0,
  ACTIVE = 1 << 0,
  TRIGGERED = 1 << 1,
  RESET_ON_EXIT = 1 << 2,
  ONCE = 1 << 3,
  HIDDEN = 1 << 4,
  REPEATABLE = 1 << 5,
}

export interface TriggerAction {
  type: TriggerActionType;
  amount?: number;
  id?: string;
  payload?: any;
}

import { StatusEffectID } from './StatusEffects';

export interface SectorTrigger {
  id: ClueID | PoiID | CollectibleID | FamilyMemberID | StatusEffectID | SectorEventID;
  position: { x: number; z: number };
  radius?: number;
  size?: { width: number; depth: number };
  type: TriggerType;
  statusFlags: number; // SMI bitmask (TriggerStatus)

  label?: string;
  icon?: string;
  color?: string;
  content?: string;
  actions?: TriggerAction[];
  repeatInterval?: number;
  lastTriggerTime?: number;
  rotation?: number;
  familyId?: FamilyMemberID;
  ownerId?: string;
  data?: any;
}
