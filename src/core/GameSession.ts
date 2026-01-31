import * as THREE from 'three';
import { Engine } from './engine/Engine';
import { GameCanvasProps, SectorState, SectorTrigger, WeaponType } from '../types';
import { Obstacle } from '../utils/physics';
import { RuntimeState } from './RuntimeState';
import { System } from './systems/System';
import { WEAPONS } from '../content/constants';
import { Enemy } from './EnemyManager';
import { ScrapItem } from './systems/WorldLootSystem';

export class GameSession {
    public inputDisabled: boolean = false;
    public debugMode: boolean = false;
    public state!: RuntimeState;
    private systems: System[] = [];

    constructor(public engine: Engine) { }

    static createInitialState(props: GameCanvasProps): RuntimeState {
        return {
            isDead: false, score: 0, collectedScrap: 0,
            hp: props.stats.maxHp, maxHp: props.stats.maxHp,
            stamina: props.stats.maxStamina, maxStamina: props.stats.maxStamina,
            level: props.stats.level,
            currentXp: props.stats.currentXp,
            nextLevelXp: props.stats.nextLevelXp,
            activeWeapon: props.loadout.primary,
            loadout: props.loadout,
            weaponAmmo: {
                [props.loadout.primary]: WEAPONS[props.loadout.primary].magSize,
                [props.loadout.secondary]: WEAPONS[props.loadout.secondary].magSize,
                [props.loadout.throwable]: WEAPONS[props.loadout.throwable].magSize
            } as Record<WeaponType, number>,
            isReloading: false, reloadEndTime: 0,
            rollStartTime: 0, rollDir: new THREE.Vector3(), isRolling: false, invulnerableUntil: 0,
            spacePressTime: 0, spaceDepressed: false, eDepressed: false, isRushing: false, rushCostPaid: false,
            wasFiring: false,
            throwChargeStart: 0,
            enemies: [] as Enemy[],
            particles: [] as any[],
            scrapItems: [] as ScrapItem[],
            chests: [] as any[],
            cameraShake: 0, lastHudUpdate: 0, startTime: performance.now(), lastShotTime: 0,
            shotsFired: 0, shotsHit: 0, throwablesThrown: 0,
            damageDealt: 0, damageTaken: 0,
            bossDamageDealt: 0, bossDamageTaken: 0,
            killsByType: {} as Record<string, number>,
            seenEnemies: props.stats.seenEnemies || [],
            seenBosses: props.stats.seenBosses || [],
            visitedPOIs: props.stats.visitedPOIs || [],
            familyFound: !!props.familyAlreadyRescued, familyExtracted: false,
            chestsOpened: 0, bigChestsOpened: 0, killsInRun: 0, isInteractionOpen: false, bossSpawned: false, bloodDecals: [] as any[], lastDamageTime: 0, lastStaminaUseTime: 0,
            noiseLevel: 0, speakBounce: 0, hurtShake: 0,
            sectorState: {} as SectorState,
            triggers: [] as SectorTrigger[],
            obstacles: [] as Obstacle[],
            busUnlocked: false,
            clueActive: false,
            bossDefeatedTime: 0,
            lastActionTime: performance.now(),
            thinkingUntil: 0,
            speakingUntil: 0,
            deathStartTime: 0,
            killerType: '',
            playerBloodSpawned: false,
            deathVel: new THREE.Vector3(),
            lastTrailPos: null as THREE.Vector3 | null,
            framesSinceHudUpdate: 0,
            lastFpsUpdate: 0,
            spFromLevelUp: 0,
            spFromCollectibles: 0,
            isMoving: false,
            interactionType: null,
            bossIntroActive: false
        };
    }

    init(state: RuntimeState) {
        this.state = state;
    }

    update(dt: number) {
        if (!this.state) return;
        const now = performance.now();
        for (const system of this.systems) {
            system.update(this, dt, now);
        }
    }

    addSystem(system: System) {
        this.systems.push(system);
        if (system.init) system.init(this);
    }

    removeSystem(id: string) {
        const idx = this.systems.findIndex(s => s.id === id);
        if (idx >= 0) {
            const sys = this.systems[idx];
            if (sys.dispose) sys.dispose();
            this.systems.splice(idx, 1);
        }
    }

    dispose() {
        this.systems.forEach(sys => {
            if (sys.cleanup) sys.cleanup(this);
        });
        this.systems = [];
        this.engine.dispose();
    }
}
