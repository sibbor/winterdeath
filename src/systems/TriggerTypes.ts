export type TriggerType = 'COLLECTIBLE' | 'CLUE' | 'POI' | 'ENEMY' | 'BOSS' | 'INTERACTION' | 'STATION' | 'SECTOR_END' | 'SPEAK' | 'THOUGHT' | 'INFO' | 'AMBUSH' | string;

export interface TriggerAction {
  type: string;
  amount?: number;
  id?: string;
  payload?: any;
  [key: string]: any;
}

export interface SectorTrigger {
  id: string;
  position?: { x: number; z: number };
  x?: number;
  z?: number;
  radius?: number;
  size?: { width: number; depth: number };
  type: TriggerType;
  label?: string;
  icon?: string;
  color?: string;
  content?: string;
  triggered?: boolean;
  actions?: TriggerAction[];
  resetOnExit?: boolean;
  repeatInterval?: number;
  lastTriggerTime?: number;
  rotation?: number;
  familyId?: number;
  ownerId?: string;
  data?: any;
}
