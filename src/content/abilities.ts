import { DamageType, AbilityID } from '../entities/player/CombatTypes';

const PNG_PATH = '/assets/icons/abilities/';

export interface AbilityStats {
    name: AbilityID;
    displayName: string;
    icon: string;
    iconIsPng: boolean;
    damage: number;
    damageType: DamageType;
    cooldown: number; // ms
    staminaCost: number;
    force: number; // Hur mycket de knuffar bort fiender
    description: string;
}

export const ABILITIES: AbilityStats[] = [];

ABILITIES[AbilityID.RUSH] = {
    name: AbilityID.RUSH,
    displayName: 'ui.combat.rush',
    icon: PNG_PATH + 'icon_dodge.png',
    iconIsPng: true,
    damage: 0,
    damageType: DamageType.PHYSICAL,
    cooldown: 0,
    staminaCost: 25,
    force: 15.0,
    description: 'abilities.rush_desc'
};

ABILITIES[AbilityID.DODGE] = {
    name: AbilityID.DODGE,
    displayName: 'ui.combat.dodge',
    icon: PNG_PATH + 'icon_dodge.png',
    iconIsPng: true,
    damage: 0,
    damageType: DamageType.PHYSICAL,
    cooldown: 250,
    staminaCost: 15,
    force: 0.0,
    description: 'abilities.dodge_desc'
};

ABILITIES[AbilityID.VEHICLE] = {
    name: AbilityID.VEHICLE,
    displayName: 'ui.vehicle',
    icon: PNG_PATH + 'icon_vehicle.png',
    iconIsPng: true,
    damage: 0,
    damageType: DamageType.PHYSICAL,
    cooldown: 0,
    staminaCost: 0,
    force: 100.0,
    description: 'abilities.vehicle_desc'
};