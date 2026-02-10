
import * as THREE from 'three';
import { ZOMBIE_TYPES } from '../../content/constants';
import { ModelFactory } from '../../utils/assets';
import { soundManager } from '../../utils/sound';
import { Enemy, AIState } from '../../types/enemy';

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
            typeKey = forcedType.toUpperCase();
            typeData = ZOMBIE_TYPES[typeKey as keyof typeof ZOMBIE_TYPES] || ZOMBIE_TYPES.WALKER;
        } else {
            // Updated Rates: Walker 70%, Runner 15%, Tank 10%, Bomber 5%
            // Random is 0-1.
            // Bomber: 0.95 - 1.0 (5%)
            // Tank: 0.85 - 0.95 (10%)
            // Runner: 0.70 - 0.85 (15%)
            // Walker: 0 - 0.70 (70%)
            if (roll > 0.95) { typeData = ZOMBIE_TYPES.BOMBER; typeKey = 'BOMBER'; }
            else if (roll > 0.85) { typeData = ZOMBIE_TYPES.TANK; typeKey = 'TANK'; }
            else if (roll > 0.70) { typeData = ZOMBIE_TYPES.RUNNER; typeKey = 'RUNNER'; }
        }

        const scale = typeData.scale || 1.0;

        const g = ModelFactory.createZombie(typeKey, typeData, false);
        g.position.set(x, 0, z);

        scene.add(g);
        g.visible = true; // Safety net visibility to verify spawning while debugging InstancedMesh

        const enemy: Enemy = {
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
            widthScale: typeData.widthScale || 1.0,
            deathState: 'alive',
            deathTimer: 0,
            velocity: new THREE.Vector3(0, 0, 0),
            fallForward: false,
            bloodSpawned: false,

            // AI Fields
            state: AIState.IDLE,
            spawnPos: new THREE.Vector3(x, 0, z),
            lastSeenPos: null,
            lastSeenTime: 0,
            searchTimer: 0,
            hearingThreshold: 1.0,
            idleTimer: 0,

            // Mechanics
            isGrappling: false,
            grappleTimer: 0,
            explosionTimer: 0,
            abilityCooldown: 0,
            stunTimer: 0
        };

        g.userData.entity = enemy;

        return enemy;
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
            bossId: bossData.id,
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
            widthScale: 1.0,
            deathState: 'alive',
            deathTimer: 0,
            velocity: new THREE.Vector3(0, 0, 0),
            fallForward: false,
            bloodSpawned: false,

            // AI Fields
            state: AIState.IDLE,
            spawnPos: new THREE.Vector3(pos.x, 0, pos.z),
            lastSeenPos: null,
            lastSeenTime: 0,
            searchTimer: 0,
            hearingThreshold: 1.0,
            idleTimer: 0,

            isGrappling: false,
            grappleTimer: 0,
            explosionTimer: 0,
            abilityCooldown: 0
        };
    },

    spawnHorde: (
        scene: THREE.Scene,
        startPos: THREE.Vector3,
        count: number,
        bossSpawned: boolean,
        currentCount: number
    ): Enemy[] => {
        const horde: Enemy[] = [];
        for (let i = 0; i < count; i++) {
            // Tight grouping: 3m radius
            const offsetX = (Math.random() - 0.5) * 6;
            const offsetZ = (Math.random() - 0.5) * 6;
            const spawnPos = new THREE.Vector3(startPos.x + offsetX, 0, startPos.z + offsetZ);

            // Allow random types within horde? Or forced?
            // "Pre-defined hordes" usually implies mixed content or specific type.
            // Let's use standard random logic but respecting caps.

            const enemy = EnemySpawner.spawn(scene, startPos, undefined, spawnPos, bossSpawned, currentCount + i);
            if (enemy) horde.push(enemy);
        }
        return horde;
    }
};
