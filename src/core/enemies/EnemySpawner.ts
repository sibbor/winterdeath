import * as THREE from 'three';
import { ZOMBIE_TYPES } from '../../content/constants';
import { ModelFactory, GEOMETRY, MATERIALS } from '../../utils/assets';
import { soundManager } from '../../utils/SoundManager';
import { Enemy, AIState, EnemyDeathState, EnemyType } from '../../types/enemy';
import { PerformanceMonitor } from '../systems/PerformanceMonitor';

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
        e.attackCooldowns = {};

        // Visual Transformation Data
        e.originalScale = typeData.scale || 1.0;
        e.widthScale = typeData.widthScale || 1.0;

        // [VINTERDÖD FIX] Ringen ska ALLTID vara dold när zombien spawnar.
        // Den aktiveras enbart inuti AIState.ATTACK_CHARGE i EnemyAI.
        if (e.indicatorRing) {
            e.indicatorRing.visible = false;
        } else if (typeKey === EnemyType.BOMBER && e.mesh) {
            // Unikt, transparent material för varje ring för att slippa färg-krockar
            const ringMat = MATERIALS.blastRadius.clone() as THREE.MeshBasicMaterial;
            ringMat.transparent = true;

            const ring = new THREE.Mesh(GEOMETRY.blastRadius, ringMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(0, 0.1, 0);
            ring.scale.setScalar(5.0);
            ring.visible = false;
            e.mesh.add(ring);
            e.indicatorRing = ring;
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
            console.warn(`[Spawner] Ignorerar spawn-förfrågan! Maxgräns nådd (100).`);
            return null;
        }

        let x: number, z: number;
        if (forcedPos) {
            // FIX: Sprid ut dem mycket mer om de force-spawnas, annars exploderar fysiken!
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

        const enemy: Enemy = {
            id: `z_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            mesh: g,
            type: typeKey,
            hp: typeData.hp,
            maxHp: typeData.hp,
            speed: typeData.speed,
            score: typeData.score,
            color: typeData.color,
            attacks: typeData.attacks || [],
            attackCooldowns: {},

            originalScale: typeData.scale || 1.0,
            widthScale: typeData.widthScale || 1.0,

            ashPile: ashPile as THREE.Object3D,

            state: AIState.IDLE,
            idleTimer: 1.0 + Math.random() * 2.0,
            searchTimer: 0,

            spawnPos: new THREE.Vector3(x, 0, z),
            lastSeenPos: new THREE.Vector3(),
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

            deathState: EnemyDeathState.ALIVE,
            deathTimer: 0,
            lastHitWasHighImpact: false,
            lastDamageType: '',
            fallForward: Math.random() > 0.5,
            bloodSpawned: false,
            lastKnockback: 0,
            // Water states
            isInWater: false, isWading: false, isDrowning: false,
            drownTimer: 0, drownDmgTimer: 0,
            // Airborne / fall damage
            isAirborne: false, fallStartY: 0,
            _accumulatedDamage: 0,
            _lastDamageTextTime: 0,
        };

        const s = enemy.originalScale;
        const w = enemy.widthScale;
        g.scale.set(s * w, s, s * w);
        g.userData.entity = enemy;

        if (typeKey === EnemyType.BOMBER) {
            // [VINTERDÖD FIX] Klona materialet så ringarna inte synkar färg/opacitet med varandra
            const ringMat = MATERIALS.blastRadius.clone() as THREE.MeshBasicMaterial;
            ringMat.transparent = true;

            const ring = new THREE.Mesh(GEOMETRY.blastRadius, ringMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(0, 0.1, 0);
            ring.scale.setScalar(5.0);
            ring.visible = false;
            g.add(ring);
            enemy.indicatorRing = ring;
        }

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

        const enemy: Enemy = {
            id: `boss_${bossData.id}`,
            mesh: boss,
            type: EnemyType.BOSS,
            hp: bossData.hp,
            maxHp: bossData.hp,
            speed: bossData.speed,
            score: 3000,
            color: bossData.color,
            attacks: bossData.attacks || [],
            attackCooldowns: {},
            originalScale: scale,
            widthScale: widthMod,
            state: AIState.IDLE,
            idleTimer: 2.0,
            searchTimer: 0,
            spawnPos: new THREE.Vector3(pos.x, 0, pos.z),
            lastSeenPos: new THREE.Vector3(),
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
            deathState: EnemyDeathState.ALIVE,
            lastDamageType: '',
            lastHitWasHighImpact: false,
            deathTimer: 0,
            fallForward: false,
            bloodSpawned: false,
            lastKnockback: 0,
            // Water states
            isInWater: false, isWading: false, isDrowning: false,
            drownTimer: 0, drownDmgTimer: 0,
            // Airborne / fall damage
            isAirborne: false, fallStartY: 0,
            _accumulatedDamage: 0,
            _lastDamageTextTime: 0,
        };

        boss.userData.entity = enemy;
        console.log(`[Spawner] Spawns BOSS at (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)})`);
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
        console.log(`[Spawner] Initierar spawnHorde med ${count} fiender!`);
        const horde: Enemy[] = [];
        const goldenAngle = 137.5 * (Math.PI / 180); // 2.3999 radianer
        const spacing = 1.5; // Varje zombie får 1.5 meters radie

        for (let i = 0; i < count; i++) {
            const radius = Math.sqrt(i) * spacing; // Roten ur ger en jämn densitet!
            const theta = i * goldenAngle;

            _v1.set(
                startPos.x + Math.cos(theta) * radius,
                0,
                startPos.z + Math.sin(theta) * radius
            );
            const enemy = EnemySpawner.spawn(scene, startPos, undefined, _v1, bossSpawned, currentCount + i);
            if (enemy) horde.push(enemy);
        }
        return horde;
    }
};