import * as THREE from 'three';
import { ZOMBIE_TYPES } from '../../content/constants';
import { ModelFactory, GEOMETRY, MATERIALS } from '../../utils/assets';
import { soundManager } from '../../utils/audio/SoundManager';
import { Enemy, AIState, EnemyDeathState, EnemyType } from '../../entities/enemies/EnemyTypes';
import { PerformanceMonitor } from '../../systems/PerformanceMonitor';
import { NoiseType } from './EnemyTypes';

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

        const roll = Math.random();
        // Probabilities: Walker 70%, Runner 15%, Tank 10%, Bomber 5%
        if (roll > 0.95) return EnemyType.BOMBER;
        if (roll > 0.85) return EnemyType.TANK;
        if (roll > 0.70) return EnemyType.RUNNER;
        return EnemyType.WALKER;
    },

    /**
     * Applies/Overwrites an existing enemy object with stats from a specific type.
     * This is the "DNA-reset" that makes Object Pooling safe.
     */
    applyTypeStats: (e: Enemy, typeKey: EnemyType | string) => {
        const typeData = (ZOMBIE_TYPES as any)[typeKey] || ZOMBIE_TYPES.WALKER;

        // Identity & Core Stats
        e.type = typeKey as EnemyType;
        e.hp = typeData.hp;
        e.maxHp = typeData.hp;
        e.speed = typeData.speed;
        e.color = typeData.color;
        e.attacks = typeData.attacks || [];

        // Zero-GC loop to reset attack cooldowns
        for (const key in e.attackCooldowns) {
            e.attackCooldowns[key] = 0;
        }

        // Visual Transformation Data
        e.originalScale = typeData.scale || 1.0;
        e.widthScale = typeData.widthScale || 1.0;

        if (!e.indicatorRing && e.mesh) {
            const ring = new THREE.Mesh(
                GEOMETRY.blastRadius,
                new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.3,
                    side: THREE.DoubleSide,
                    depthWrite: false
                })
            );
            ring.rotation.x = -Math.PI / 2;
            ring.visible = false;
            e.mesh.add(ring);
            e.indicatorRing = ring;
        } else if (e.indicatorRing) {
            e.indicatorRing.visible = false;
        }
    },

    /** Spawn a new enemy from the pool. */
    spawn: (
        scene: THREE.Scene,
        playerPos: THREE.Vector3,
        forcedType?: EnemyType | string,
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

        const typeKey = forcedType || EnemySpawner.determineType(enemyCount, bossSpawned);
        const typeData = (ZOMBIE_TYPES as any)[typeKey] || ZOMBIE_TYPES.WALKER;

        const g = ModelFactory.createZombie(typeKey, typeData);
        g.position.set(x, 0, z);
        g.visible = true;

        const ashPile = g.getObjectByName('AshPile');
        scene.add(g);

        const currentPoolId = _nextPoolId++;

        // V8 Shape Locking: All properties declared explicitly
        const enemy: Enemy = {
            id: `z_${currentPoolId}`,
            poolId: currentPoolId,
            mesh: g,
            indicatorRing: null,
            ashPile: (ashPile as THREE.Object3D) || null,
            type: typeKey as EnemyType,
            hp: typeData.hp,
            maxHp: typeData.hp,
            speed: typeData.speed,
            score: typeData.score,
            color: typeData.color,
            attacks: typeData.attacks || [],
            attackCooldowns: {},
            abilityCooldown: 0,

            originalScale: typeData.scale || 1.0,
            widthScale: typeData.widthScale || 1.0,

            state: AIState.IDLE,
            idleTimer: 1.0 + Math.random() * 2.0,
            searchTimer: 0,

            spawnPos: new THREE.Vector3(x, 0, z),
            lastSeenTime: 0,
            lastKnownPosition: new THREE.Vector3(x, 0, z),
            hearingThreshold: 1.0,
            awareness: 0,
            lastHeardNoiseType: NoiseType.NONE,

            isBoss: false,
            bossId: -1,
            dead: false,
            hitTime: 0,
            lastStepTime: 0,
            lastTackleTime: 0,
            lastVehicleHit: 0,
            fleeing: false,

            currentAttackIndex: -1,
            attackTimer: 0,

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

            deathState: EnemyDeathState.ALIVE,
            deathTimer: 0,
            lastHitWasHighImpact: false,
            lastDamageType: '',
            hasLastTrailPos: false,
            lastTrailPos: new THREE.Vector3(),
            fallForward: Math.random() > 0.5,
            bloodSpawned: false,
            lastKnockback: 0,

            // Water states
            isInWater: false,
            isWading: false,
            isDrowning: false,
            drownTimer: 0,
            drownDmgTimer: 0,

            // Airborne / fall damage
            isAirborne: false,
            fallStartY: 0,
            _accumulatedDamage: 0,
            _lastDamageTextTime: 0,

            // Discovered
            discovered: false
        };

        const s = enemy.originalScale;
        const w = enemy.widthScale;
        g.scale.set(s * w, s, s * w);
        g.userData.entity = enemy;

        const ring = new THREE.Mesh(
            GEOMETRY.blastRadius,
            new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide,
                depthWrite: false
            })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.visible = false;
        g.add(ring);
        enemy.indicatorRing = ring;

        if (PerformanceMonitor.getInstance().aiLoggingEnabled) {
            console.log(`[EnemySpawner] Spawns ${typeKey}_${enemy.id} at (${x.toFixed(1)}, ${z.toFixed(1)})`);
        }
        return enemy;
    },

    /**
     * Specialized spawn for Boss entities.
     */
    spawnBoss: (scene: THREE.Scene, pos: { x: number, z: number }, bossData: any): Enemy => {
        const boss = ModelFactory.createBoss('Boss', bossData);
        const scale = bossData.scale || 3.0;
        const widthMod = bossData.widthScale || 1.0;

        boss.scale.set(scale * widthMod, scale, scale * widthMod);
        boss.position.set(pos.x, 0, pos.z);
        scene.add(boss);

        soundManager.playZombieGrowl('TANK');

        const currentPoolId = _nextPoolId++;

        // V8 Shape Locking: All properties declared explicitly
        const enemy: Enemy = {
            id: `boss_${bossData.id}`,
            poolId: currentPoolId,
            mesh: boss,
            indicatorRing: null,
            ashPile: null,
            type: EnemyType.BOSS,
            hp: bossData.hp,
            maxHp: bossData.hp,
            speed: bossData.speed,
            score: 3000,
            color: bossData.color,
            attacks: bossData.attacks || [],
            attackCooldowns: {},
            abilityCooldown: 0,
            originalScale: scale,
            widthScale: widthMod,
            state: AIState.IDLE,
            idleTimer: 2.0,
            searchTimer: 0,
            spawnPos: new THREE.Vector3(pos.x, 0, pos.z),
            lastSeenTime: 0,
            lastKnownPosition: new THREE.Vector3(pos.x, 0, pos.z),
            hearingThreshold: 1.5,
            awareness: 0.2,
            lastHeardNoiseType: NoiseType.NONE,
            isBoss: true,
            bossId: bossData.id,
            dead: false,
            hitTime: 0,
            lastStepTime: 0,
            lastTackleTime: 0,
            lastVehicleHit: 0,
            fleeing: false,
            currentAttackIndex: -1,
            attackTimer: 0,
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
            deathState: EnemyDeathState.ALIVE,
            lastDamageType: '',
            lastHitWasHighImpact: false,
            deathTimer: 0,
            hasLastTrailPos: false,
            lastTrailPos: new THREE.Vector3(),
            fallForward: false,
            bloodSpawned: false,
            lastKnockback: 0,

            // Water states
            isInWater: false,
            isWading: false,
            isDrowning: false,
            drownTimer: 0,
            drownDmgTimer: 0,

            // Airborne / fall damage
            isAirborne: false,
            fallStartY: 0,
            _accumulatedDamage: 0,
            _lastDamageTextTime: 0,

            // Discovered
            discovered: false
        };

        boss.userData.entity = enemy;

        // Ensure boss has an indicator ring for its special attacks
        const ring = new THREE.Mesh(
            GEOMETRY.blastRadius,
            new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide,
                depthWrite: false
            })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.visible = false;
        boss.add(ring);
        enemy.indicatorRing = ring;

        console.log(`[Spawner] Spawns BOSS at (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)})`);
        return enemy;
    },

};