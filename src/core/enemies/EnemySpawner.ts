
import * as THREE from 'three';
import { ZOMBIE_TYPES } from '../../content/constants';
import { ModelFactory } from '../../utils/assets';
import { soundManager } from '../../utils/sound';
import { Enemy } from '../../types/enemy';

export const EnemySpawner = {
    spawn: (
        scene: THREE.Scene,
        playerPos: THREE.Vector3,
        forcedType?: string,
        forcedPos?: THREE.Vector3,
        bossSpawned: boolean = false,
        enemyCount: number = 0
    ): Enemy | null => {
        // Cap enemies
        if (enemyCount >= 80) return null;
        if (bossSpawned && !forcedType) return null;

        let x, z;
        if (forcedPos) {
            const jitterX = (Math.random() - 0.5) * 6;
            const jitterZ = (Math.random() - 0.5) * 6;
            x = forcedPos.x + jitterX;
            z = forcedPos.z + jitterZ;
        } else {
            const a = Math.random() * Math.PI * 2;
            const r = 40 + Math.random() * 40;
            x = playerPos.x + Math.cos(a) * r;
            z = playerPos.z + Math.sin(a) * r;
        }

        let typeData = ZOMBIE_TYPES.WALKER;
        let typeKey = 'WALKER';
        const roll = Math.random();

        if (forcedType) {
            typeKey = forcedType;
            typeData = ZOMBIE_TYPES[forcedType as keyof typeof ZOMBIE_TYPES];
        } else {
            if (roll > 0.95) { typeData = ZOMBIE_TYPES.TANK; typeKey = 'TANK'; }
            else if (roll > 0.85) { typeData = ZOMBIE_TYPES.BOMBER; typeKey = 'BOMBER'; }
            else if (roll > 0.7) { typeData = ZOMBIE_TYPES.RUNNER; typeKey = 'RUNNER'; }
        }

        const isTank = typeKey === 'TANK';
        const scale = isTank ? 1.5 : 1.0;

        const g = ModelFactory.createZombie(typeKey, typeData, false);
        g.position.set(x, 0, z);

        scene.add(g);

        return {
            mesh: g,
            type: typeKey,
            hp: typeData.hp,
            speed: typeData.speed,
            damage: typeData.damage,
            score: typeData.score,
            attackCooldown: 0,
            fleeing: false,
            lastKnockback: 0,
            hitTime: 0,
            color: typeData.color,
            isBurning: false,
            burnTimer: 0,
            afterburnTimer: 0,
            isBlinded: false,
            blindUntil: 0,
            slowTimer: 0,
            originalScale: scale,
            deathState: 'alive',
            deathTimer: 0,
            velocity: new THREE.Vector3(0, 0, 0),
            fallForward: false,
            bloodSpawned: false
        };
    },

    spawnBoss: (scene: THREE.Scene, pos: { x: number, z: number }, bossData: any): Enemy => {
        const g = ModelFactory.createZombie('Boss', bossData, true);
        g.position.set(pos.x, 0, pos.z);
        scene.add(g);

        soundManager.playZombieGrowl();

        return {
            mesh: g,
            type: 'Boss',
            hp: bossData.hp,
            maxHp: bossData.hp,
            speed: bossData.speed,
            damage: bossData.damage,
            score: 500,
            attackCooldown: 0,
            isBoss: true,
            fleeing: false,
            lastKnockback: 0,
            hitTime: 0,
            color: bossData.color,
            isBurning: false,
            burnTimer: 0,
            afterburnTimer: 0,
            isBlinded: false,
            blindUntil: 0,
            slowTimer: 0,
            originalScale: bossData.scale,
            deathState: 'alive',
            deathTimer: 0,
            velocity: new THREE.Vector3(0, 0, 0),
            fallForward: false,
            bloodSpawned: false
        };
    }
};
