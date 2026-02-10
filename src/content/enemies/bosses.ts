
export const BOSSES: Record<number, { id: number; name: string; hp: number; maxHp: number; speed: number; damage: number; color: number; scale: number; widthScale?: number; deathStory: string }> = {
    0: {
        id: 0,
        name: 'bosses.0.name',
        hp: 500, maxHp: 500, speed: 1.20, damage: 35, color: 0x4a0404, scale: 3.0, widthScale: 3.5,
        deathStory: "bosses.0.death"
    },
    1: {
        id: 1,
        name: 'bosses.1.name',
        hp: 800, maxHp: 800, speed: 0.75, damage: 20, color: 0x2c3e50, scale: 3.0, widthScale: 1.5,
        deathStory: "bosses.1.death"
    },
    2: {
        id: 2,
        name: 'bosses.2.name',
        hp: 600, maxHp: 600, speed: 1.25, damage: 30, color: 0x8e44ad, scale: 3.0, widthScale: 1.0,
        deathStory: "bosses.2.death"
    },
    3: {
        id: 3,
        name: 'bosses.3.name',
        hp: 1200, maxHp: 1200, speed: 0.20, damage: 15, color: 0xc0392b, scale: 3.5, widthScale: 1.8,
        deathStory: "bosses.3.death"
    }
};
