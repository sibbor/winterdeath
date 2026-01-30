
export const BOSSES: Record<number, { name: string; hp: number; maxHp: number; speed: number; damage: number; color: number; scale: number; deathStory: string }> = {
    0: { 
        name: 'bosses.0.name', 
        hp: 500, maxHp: 500, speed: 1.20, damage: 30, color: 0x4a0404, scale: 3.0,
        deathStory: "bosses.0.death" 
    },
    1: { 
        name: 'bosses.1.name', 
        hp: 800, maxHp: 800, speed: 0.75, damage: 45, color: 0x2c3e50, scale: 3.0,
        deathStory: "bosses.1.death" 
    },
    2: { 
        name: 'bosses.2.name', 
        hp: 600, maxHp: 600, speed: 1.25, damage: 20, color: 0x8e44ad, scale: 5.0,
        deathStory: "bosses.2.death" 
    },
    3: { 
        name: 'bosses.3.name', 
        hp: 1200, maxHp: 1200, speed: 0.20, damage: 60, color: 0xc0392b, scale: 3.5,
        deathStory: "bosses.3.death" 
    }
};
