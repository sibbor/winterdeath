import { ZombieTypeData } from '../../types/enemy';

export const ZOMBIE_TYPES: Record<string, ZombieTypeData> = {
    WALKER: {
        hp: 50,
        speed: 0.9,
        damage: 5,
        score: 20,
        color: 0x5a6e5a,
        scale: 1.0
    },
    RUNNER: {
        hp: 30,
        speed: 1.10,
        damage: 2.5,
        score: 10,
        color: 0x8f3a3a,
        scale: 0.8
    },
    TANK: {
        hp: 150,
        speed: 0.80,
        damage: 10,
        score: 50,
        color: 0x2d3436,
        scale: 1.15,
        widthScale: 1.1
    },
    BOMBER: {
        hp: 80,
        speed: 0.70,
        damage: 25,
        score: 30,
        color: 0xcf6e36,
        scale: 1.25,
        widthScale: 1.4
    }
};
