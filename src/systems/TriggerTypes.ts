/**
 * VINTERDÖD: Centralized Trigger Types & Statuses.
 * Numeric enums (SMI) are used for O(1) matching and to prevent heap allocations
 * during high-frequency trigger checking in TriggerHandler.
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
}

export enum TriggerActionType {
  NONE = 0,
  GIVE_REWARD = 1,
  START_CINEMATIC = 2,
  SPAWN_ENEMY = 3,
  PLAY_SOUND = 4,
  SET_STATE = 5,
  COMPLETE_MISSION = 6,
}

export enum TriggerStatus {
  NONE = 0,
  ACTIVE = 1 << 0,
  TRIGGERED = 1 << 1,
  RESET_ON_EXIT = 1 << 2,
  ONCE = 1 << 3,
  HIDDEN = 1 << 4,
}

export interface TriggerAction {
  type: TriggerActionType;
  amount?: number;
  id?: string;
  payload?: any;
}

export interface SectorTrigger {
  id: string;
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
  familyId?: number;
  ownerId?: string;
  data?: any;
}
