import * as THREE from 'three';
import { ZOMBIE_TYPES } from '../../content/constants';
import { ModelFactory, GEOMETRY, MATERIALS } from '../../utils/assets';
import { soundManager } from '../../utils/sound';
import { Enemy, AIState } from '../../types/enemy';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();

/**
 * EnemySpawner System
 * Handles the creation of new enemies and the "re-speccing" of recycled entities.
 */
export const EnemySpawner = {
    /**
     * Logic to decide which type of zombie should spawn based on current game state.
     * Extracted from spawn() to allow EnemyManager to know the type BEFORE picking from pool.
     */
    determineType: (enemyCount: number, bossSpawned: boolean): string => {
        // Difficulty modifier: If a boss is out, we primarily spawn Walkers to avoid chaos
        if (bossSpawned) return 'WALKER';

        const roll = Math.random();
        // Probabilities: Walker 70%, Runner 15%, Tank 10%, Bomber 5%
        if (roll > 0.95) return 'BOMBER';
        if (roll > 0.85) return 'TANK';
        if (roll > 0.70) return 'RUNNER';
        return 'WALKER';
    },

    /**
     * Applies/Overwrites an existing enemy object with stats from a specific type.
     * This is the "DNA-reset" that makes Object Pooling safe.
     */
    applyTypeStats: (e: Enemy, typeKey: string) => {
        const typeData = (ZOMBIE_TYPES as any)[typeKey] || ZOMBIE_TYPES.WALKER;

        // Identity & Core Stats
        e.type = typeKey;
        e.hp = typeData.hp;
        e.maxHp = typeData.hp;
        e.speed = typeData.speed;
        e.damage = typeData.damage;
        e.score = typeData.score;
        e.color = typeData.color;

        // Visual Transformation Data
        e.originalScale = typeData.scale || 1.0;
        e.widthScale = typeData.widthScale || 1.0;

        // Special logic for specific types (e.g., Bomber rings)
        if (e.indicatorRing) {
            e.indicatorRing.visible = (typeKey === 'BOMBER');
        } else if (typeKey === 'BOMBER' && e.mesh) {
            // Failsafe: Add ring if it doesn't exist on this recycled mesh
            const ring = new THREE.Mesh(GEOMETRY.blastRadius, MATERIALS.blastRadius);
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(0, 0.1, 0);
            ring.scale.setScalar(5.0);
            ring.visible = false;
            e.mesh.add(ring);
            e.indicatorRing = ring;
        }
    },

    /**
     * Spawns a brand new enemy unit. 
     * Note: EnemyManager calls this only when the pool is empty.
     */
    spawn: (
        scene: THREE.Scene,
        playerPos: THREE.Vector3,
        forcedType?: string,
        forcedPos?: THREE.Vector3,
        bossSpawned: boolean = false,
        enemyCount: number = 0
    ): Enemy | null => {
        // 1. PERFORMANCE CAP
        if (enemyCount >= 100) return null;

        // 2. COORDINATE CALCULATION
        let x: number, z: number;
        if (forcedPos) {
            x = forcedPos.x + (Math.random() - 0.5) * 4;
            z = forcedPos.z + (Math.random() - 0.5) * 4;
        } else {
            const angle = Math.random() * Math.PI * 2;
            const dist = 45 + Math.random() * 30;
            x = playerPos.x + Math.cos(angle) * dist;
            z = playerPos.z + Math.sin(angle) * dist;
        }

        // 3. TYPE SELECTION
        const typeKey = forcedType?.toUpperCase() || EnemySpawner.determineType(enemyCount, bossSpawned);
        const typeData = (ZOMBIE_TYPES as any)[typeKey] || ZOMBIE_TYPES.WALKER;

        // 4. VISUAL INITIALIZATION
        const g = ModelFactory.createZombie(typeKey, typeData);
        g.position.set(x, 0, z);
        g.visible = true;

        const ashPile = g.getObjectByName('AshPile'); // New linkage
        scene.add(g);

        // 5. ENTITY CONSTRUCTION
        const enemy: Enemy = {
            id: `z_${Date.now()}_${Math.random()}`,
            mesh: g,
            type: typeKey,
            hp: typeData.hp,
            maxHp: typeData.hp,
            speed: typeData.speed,
            damage: typeData.damage,
            score: typeData.score,
            color: typeData.color,

            originalScale: typeData.scale || 1.0,
            widthScale: typeData.widthScale || 1.0,

            ashPile: ashPile as THREE.Object3D,

            state: AIState.IDLE,
            idleTimer: 1.0 + Math.random() * 2.0,
            searchTimer: 0,
            attackCooldown: 0,

            spawnPos: new THREE.Vector3(x, 0, z),
            lastSeenPos: null,
            lastSeenTime: 0,
            hearingThreshold: 1.0,

            isBoss: false,
            dead: false,
            hitTime: 0,
            fleeing: false,

            isBurning: false,
            burnTimer: 0,
            afterburnTimer: 0,
            isBlinded: false,
            blindTimer: 0,
            blindUntil: 0,
            slowTimer: 0,
            stunTimer: 0,

            isGrappling: false,
            grappleTimer: 0,

            explosionTimer: 0,

            velocity: new THREE.Vector3(0, 0, 0),
            knockbackVel: new THREE.Vector3(0, 0, 0),
            deathVel: new THREE.Vector3(0, 0, 0),

            deathState: 'alive',
            deathTimer: 0,
            lastHitWasHighImpact: false,
            lastDamageType: '',
            fallForward: Math.random() > 0.5,
            bloodSpawned: false,
            lastKnockback: 0
        };

        // Apply scale based on construction stats
        const s = enemy.originalScale;
        const w = enemy.widthScale;
        g.scale.set(s * w, s, s * w);

        // Link for collision lookups
        g.userData.entity = enemy;

        // 6. SPECIAL TYPE ADD-ONS
        if (typeKey === 'BOMBER') {
            const ring = new THREE.Mesh(GEOMETRY.blastRadius, MATERIALS.blastRadius);
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(0, 0.1, 0);
            ring.scale.setScalar(5.0);
            ring.visible = false;
            g.add(ring);
            enemy.indicatorRing = ring;
        }

        return enemy;
    },

    /**
     * Specialized spawn for Boss entities.
     */
    spawnBoss: (scene: THREE.Scene, pos: { x: number, z: number }, bossData: any): Enemy => {
        const g = ModelFactory.createBoss('Boss', bossData);
        const scale = bossData.scale || 3.0;
        const widthMod = bossData.widthScale || 1.0;

        g.scale.set(scale * widthMod, scale, scale * widthMod);
        g.position.set(pos.x, 0, pos.z);
        scene.add(g);

        soundManager.playZombieGrowl('TANK');

        const enemy: Enemy = {
            id: `boss_${bossData.id}`,
            mesh: g,
            type: 'Boss',
            hp: bossData.hp,
            maxHp: bossData.hp,
            speed: bossData.speed,
            damage: bossData.damage,
            score: 1000,
            color: bossData.color,
            originalScale: scale,
            widthScale: widthMod,
            state: AIState.IDLE,
            idleTimer: 2.0,
            searchTimer: 0,
            attackCooldown: 0,
            spawnPos: new THREE.Vector3(pos.x, 0, pos.z),
            lastSeenPos: null,
            lastSeenTime: 0,
            hearingThreshold: 1.5,
            isBoss: true,
            bossId: bossData.id,
            dead: false,
            hitTime: 0,
            fleeing: false,
            isBurning: false,
            burnTimer: 0,
            afterburnTimer: 0,
            isBlinded: false,
            blindTimer: 0,
            blindUntil: 0,
            slowTimer: 0,
            stunTimer: 0,
            isGrappling: false,
            grappleTimer: 0,
            explosionTimer: 0,
            velocity: new THREE.Vector3(0, 0, 0),
            knockbackVel: new THREE.Vector3(0, 0, 0),
            deathVel: new THREE.Vector3(0, 0, 0),
            deathState: 'alive',
            lastDamageType: '',
            lastHitWasHighImpact: false,
            deathTimer: 0,
            fallForward: false,
            bloodSpawned: false,
            lastKnockback: 0
        };

        g.userData.entity = enemy;
        return enemy;
    },

    /**
     * Spawns a cluster of enemies.
     */
    spawnHorde: (
        scene: THREE.Scene,
        startPos: THREE.Vector3,
        count: number,
        bossSpawned: boolean,
        currentCount: number
    ): Enemy[] => {
        const horde: Enemy[] = [];
        for (let i = 0; i < count; i++) {
            _v1.set(
                startPos.x + (Math.random() - 0.5) * 10,
                0,
                startPos.z + (Math.random() - 0.5) * 10
            );

            const enemy = EnemySpawner.spawn(scene, startPos, undefined, _v1, bossSpawned, currentCount + i);
            if (enemy) horde.push(enemy);
        }
        return horde;
    }
};