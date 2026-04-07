import * as THREE from 'three';
import { ZOMBIE_TYPES } from '../../content/constants';
import { ModelFactory, GEOMETRY, MATERIALS } from '../../utils/assets';
import { soundManager } from '../../utils/audio/SoundManager';
import { Enemy, AIState, EnemyDeathState, EnemyType, EnemyFlags, ENEMY_HP, ENEMY_SPEED, ENEMY_SCORE, NoiseType } from '../../entities/enemies/EnemyTypes';
import { PerformanceMonitor } from '../../systems/PerformanceMonitor';
import { WeaponType } from '../../content/weapons';
import { KMH_TO_MS } from '../../content/constants';

let _nextPoolId = 0;

/**
 * EnemySpawner System
 * Handles the creation of new enemies and the "re-speccing" of recycled entities.
 */
export const EnemySpawner = {
    /**
     * Logic to decide which type of zombie should spawn based on current game state.
     * Extracted from spawn() to allow EnemyManager to know the type BEFORE picking from pool.
     */
    determineType: (enemyCount: number, bossSpawned: boolean): EnemyType => {
        // Difficulty modifier: If a boss is out, we primarily spawn Walkers to avoid chaos
        if (bossSpawned) return EnemyType.WALKER;

        const rand = Math.random();
        // Probabilities: Walker 70%, Runner 15%, Tank 10%, Bomber 5%
        if (rand > 0.90) return EnemyType.BOMBER;
        if (rand > 0.80) return EnemyType.TANK;
        if (rand > 0.65) return EnemyType.RUNNER;
        return EnemyType.WALKER;
    },

    /**
     * Applies/Overwrites an existing enemy object with stats from a specific type.
     * This is the "DNA-reset" that makes Object Pooling safe.
     */
    applyTypeStats: (e: Enemy, typeKey: EnemyType) => {
        const typeData = (ZOMBIE_TYPES as any)[typeKey] || ZOMBIE_TYPES.WALKER;

        // Identity & Core Stats (O(1) SMI lookup)
        e.type = typeKey;
        e.maxHp = ENEMY_HP[typeKey];
        e.hp = e.maxHp;
        e.speed = ENEMY_SPEED[typeKey] * KMH_TO_MS;
        e.score = ENEMY_SCORE[typeKey];
        e.color = typeData.color;
        e.attacks = typeData.attacks || [];

        // Zero-GC: Clear Float32Array
        if (e.attackCooldowns) e.attackCooldowns.fill(0);

        // Visual Transformation Data
        e.originalScale = typeData.scale || 1.0;
        e.widthScale = typeData.widthScale || 1.0;
        e.hitRadius = 0.5 * e.originalScale * e.widthScale;
        e.statusFlags = (typeKey === EnemyType.BOSS) ? EnemyFlags.BOSS : 0;

        if (e.indicatorRing) {
            e.indicatorRing.visible = false;
        }
    },

    /** Spawn a new enemy from the pool. */
    spawn: (
        scene: THREE.Scene,
        playerPos: THREE.Vector3,
        forcedType?: EnemyType,
        forcedPos?: THREE.Vector3,
        bossSpawned: boolean = false,
        enemyCount: number = 0
    ): Enemy | null => {
        if (enemyCount >= 100) {
            console.warn(`[Spawner] Ignoring spawn request! Max limit reached (100).`);
            return null;
        }

        let x: number, z: number;
        if (forcedPos) {
            // Spread them out significantly if force-spawned, otherwise physics will explode!
            x = forcedPos.x + (Math.random() - 0.5) * 8;
            z = forcedPos.z + (Math.random() - 0.5) * 8;
        } else {
            const angle = Math.random() * Math.PI * 2;
            const dist = 45 + Math.random() * 30;
            x = playerPos.x + Math.cos(angle) * dist;
            z = playerPos.z + Math.sin(angle) * dist;
        }

        const typeKey = (forcedType !== undefined) ? forcedType : EnemySpawner.determineType(enemyCount, bossSpawned);
        const typeData = (ZOMBIE_TYPES as any)[typeKey] || ZOMBIE_TYPES.WALKER;

        const g = ModelFactory.createZombie(typeKey, typeData);
        g.position.set(x, 0, z);
        g.visible = true;

        const ashPile = g.getObjectByName('AshPile');
        scene.add(g);

        const currentPoolId = _nextPoolId++;

        // V8 Shape Locking: All properties declared explicitly as SMIs or pre-allocated objects
        const baseScale = (typeData.scale || 1.0) * (typeData.widthScale || 1.0);
        const enemy: Enemy = {
            id: `z_${currentPoolId}`,
            poolId: currentPoolId,
            mesh: g,
            indicatorRing: null as any,
            ashPile: (ashPile as THREE.Object3D) || null,

            type: typeKey,
            maxHp: ENEMY_HP[typeKey],
            hp: ENEMY_HP[typeKey],
            speed: ENEMY_SPEED[typeKey],
            score: ENEMY_SCORE[typeKey],
            color: typeData.color,
            attacks: typeData.attacks || [],
            attackCooldowns: new Float32Array(32),
            abilityCooldown: 0,

            originalScale: typeData.scale || 1.0,
            widthScale: typeData.widthScale || 1.0,
            hitRadius: 0.5 * baseScale,
            combatRadius: 1.2 * baseScale,

            state: AIState.IDLE,
            idleTimer: 1.0 + Math.random() * 2.0,
            searchTimer: 0,
            lastBurnTick: 0,

            spawnPos: new THREE.Vector3(x, 0, z),
            lastSeenTime: 0,
            lastKnownPosition: new THREE.Vector3(x, 0, z),
            hearingThreshold: 1.0,
            awareness: 0,
            lastHeardNoiseType: NoiseType.NONE,

            statusFlags: bossSpawned ? EnemyFlags.BOSS : 0,
            bossId: -1,
            hitTime: 0,
            hitRenderTime: 0,
            lastStepTime: 0,
            lastTackleTime: 0,
            lastVehicleHit: 0,

            currentAttackIndex: -1,
            attackTimer: 0,

            stunDuration: 0,
            blindDuration: 0,
            burnDuration: 0,
            burnTickTimer: 0,
            slowDuration: 0,
            grappleDuration: 0,

            explosionTimer: 0,

            velocity: new THREE.Vector3(0, 0, 0),
            knockbackVel: new THREE.Vector3(0, 0, 0),
            deathVel: new THREE.Vector3(0, 0, 0),

            deathState: EnemyDeathState.ALIVE,
            deathTimer: 0,
            lastHitWasHighImpact: false,
            lastDamageType: WeaponType.NONE,
            hasLastTrailPos: false,
            lastTrailPos: new THREE.Vector3(),
            fallForward: Math.random() > 0.5,
            bloodSpawned: false,
            lastKnockback: 0,

            swimDistance: 0,
            maxSwimDistance: 1 + Math.random() * 4,
            drownTimer: 0,
            drownDmgTimer: 0,

            fallStartY: 0,
            _accumulatedDamage: 0,
            _lastDamageTextTime: 0
        };

        const s = enemy.originalScale;
        const w = enemy.widthScale;
        g.scale.set(s * w, s, s * w);
        g.userData.entity = enemy;

        // --- ZERO-GC PRE-ALLOCATION (VINTERDÖD) ---
        g.userData.spinVel = new THREE.Vector3();
        g.userData.hitDir = new THREE.Vector3();
        g.userData.isFlashing = false;
        g.userData.exploded = false;
        g.userData.gibbed = false;
        g.userData.electrocuted = false;
        g.userData.ashSpawned = false;
        g.userData.ashPermanent = false;
        g.userData.isRagdolling = false;

        const enemyIndicatorRing = new THREE.Mesh(GEOMETRY.blastRadius, MATERIALS.blastRadius);
        enemyIndicatorRing.rotation.x = -Math.PI / 2;
        enemyIndicatorRing.visible = false;
        g.add(enemyIndicatorRing);
        enemy.indicatorRing = enemyIndicatorRing;

        if (PerformanceMonitor.getInstance().aiLoggingEnabled) {
            console.log(`[EnemySpawner] Spawns ${EnemyType[typeKey]}_${enemy.id} at (${x.toFixed(1)}, ${z.toFixed(1)})`);
        }

        return enemy;
    },

    /** Specialized spawn for Boss entities. */
    spawnBoss: (scene: THREE.Scene, pos: { x: number, z: number }, bossData: any): Enemy => {
        const boss = ModelFactory.createBoss('Boss', bossData);
        const scale = bossData.scale || 3.0;
        const widthMod = bossData.widthScale || 1.0;
        const baseScale = scale * widthMod;

        boss.scale.set(scale * widthMod, scale, scale * widthMod);
        boss.position.set(pos.x, 0, pos.z);
        scene.add(boss);

        soundManager.playZombieGrowl(EnemyType.TANK);

        const currentPoolId = _nextPoolId++;

        // V8 Shape Locking: All properties declared explicitly as SMIs or pre-allocated objects
        const enemy: Enemy = {
            id: `boss_${bossData.id}`,
            poolId: currentPoolId,
            mesh: boss,
            indicatorRing: null as any,
            ashPile: null,
            type: EnemyType.BOSS,
            maxHp: bossData.hp,
            hp: bossData.hp,
            speed: bossData.speed * KMH_TO_MS,
            score: 3000,
            color: bossData.color,
            attacks: bossData.attacks || [],
            attackCooldowns: new Float32Array(32),
            abilityCooldown: 0,
            originalScale: scale,
            widthScale: widthMod,
            hitRadius: 0.5 * baseScale,
            combatRadius: 1.2 * baseScale,
            state: AIState.IDLE,
            idleTimer: 2.0,
            searchTimer: 0,
            lastBurnTick: 0,
            spawnPos: new THREE.Vector3(pos.x, 0, pos.z),
            lastSeenTime: 0,
            lastKnownPosition: new THREE.Vector3(pos.x, 0, pos.z),
            hearingThreshold: 1.5,
            awareness: 0.2,
            lastHeardNoiseType: NoiseType.NONE,

            statusFlags: EnemyFlags.BOSS,
            bossId: bossData.id,
            hitTime: 0,
            hitRenderTime: 0,
            lastStepTime: 0,
            lastTackleTime: 0,
            lastVehicleHit: 0,

            currentAttackIndex: -1,
            attackTimer: 0,

            stunDuration: 0,
            blindDuration: 0,
            burnDuration: 0,
            burnTickTimer: 0,
            slowDuration: 0,
            grappleDuration: 0,

            explosionTimer: 0,

            velocity: new THREE.Vector3(0, 0, 0),
            knockbackVel: new THREE.Vector3(0, 0, 0),
            deathVel: new THREE.Vector3(0, 0, 0),

            deathState: EnemyDeathState.ALIVE,
            lastDamageType: WeaponType.NONE,
            lastHitWasHighImpact: false,
            deathTimer: 0,
            hasLastTrailPos: false,
            lastTrailPos: new THREE.Vector3(),
            fallForward: false,
            bloodSpawned: false,
            lastKnockback: 0,

            swimDistance: 0,
            maxSwimDistance: 1 + Math.random() * 4,
            drownTimer: 0,
            drownDmgTimer: 0,

            fallStartY: 0,
            _accumulatedDamage: 0,
            _lastDamageTextTime: 0
        };

        boss.userData.entity = enemy;

        // Ensure boss has an indicator ring for its special attacks
        const bossIndicatorRing = new THREE.Mesh(GEOMETRY.blastRadius, MATERIALS.blastRadius);
        bossIndicatorRing.rotation.x = -Math.PI / 2;
        bossIndicatorRing.visible = false;
        boss.add(bossIndicatorRing);
        enemy.indicatorRing = bossIndicatorRing;

        console.log(`[Spawner] Spawns BOSS at (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)})`);
        return enemy;
    },
};