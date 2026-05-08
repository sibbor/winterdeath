import {
    HudState as IHudState,
    DiscoveryType,
    MAX_STATUS_EFFECTS,
    MAX_PASSIVES,
    MAX_BUFFS,
    MAX_DEBUFFS,
    MAX_MAP_ITEMS,
    MapItemType,
    MapItem,
    HudVector2,
    DebugInfoData
} from '../components/ui/hud/HudTypes';
import { WeaponType } from '../content/weapons';
import { InteractionType, InteractionPromptId, MetaActionId, UIEventBridge } from '../systems/ui/UIEventBridge';

/**
 * HudState Implementation
 * Optimized for Zero-GC and V8 Hidden Class stability.
 */
export class HudStateSoA implements IHudState {
    // --- DOD BUFFERS ---
    public statsBuffer = new Float32Array(64);
    public vectorBuffer = new Float32Array(256);
    public statusFlags = 0;

    public hp = 0;
    public maxHp = 0;
    public stamina = 0;
    public maxStamina = 0;
    public ammo = 0;
    public magSize = 0;
    public score = 0;
    public scrap = 0;
    public challengePoints = 0;
    public multiplier = 1;
    public activeWeapon = WeaponType.PISTOL;
    public isReloading = false;

    // Complex slices (Flattened for Zero-GC)
    public bossActive = false;
    public bossName = '';
    public bossHp = 0;
    public bossMaxHp = 0;

    public bossSpawned = false;
    public bossDefeated = false;
    public familyFound = false;
    public familySignal = 0;

    public level = 1;
    public currentXp = 0;
    public nextLevelXp = 1000;
    public throwableAmmo = 0;
    public reloadProgress = 0;

    public playerPos: HudVector2 = { x: 0, z: 0 };
    public familyPos: HudVector2 | null = { x: 0, z: 0 };
    public bossPos: HudVector2 | null = { x: 0, z: 0 };
    public distanceTraveled = 0;

    public kills = 0;
    public spEarned = 0;
    public isDead = false;
    public isDriving = false;
    public vehicleSpeed = 0;
    public throttleState = 0;
    public currentSector = 0;
    public cluesFoundCount = 0;
    public poisFoundCount = 0;
    public collectiblesFoundCount = 0;
    public fps = 60;
    // Sector Stats (Flattened)
    public unlimitedAmmo = false;
    public unlimitedThrowables = false;
    public isInvincible = false;
    public waveActive = false;
    public waveKills = 0;
    public waveTarget = 0;
    public currentWave = 1;
    public totalWaves = 1;

    public enemyKills = new Float64Array(16);
    public seenEnemies: number[] = [];
    public seenBosses: number[] = [];

    // SoA Status Effects
    public StatusEffectIDs = new Int32Array(MAX_STATUS_EFFECTS);
    public statusEffectDurations = new Float32Array(MAX_STATUS_EFFECTS);
    public statusEffectMaxDurations = new Float32Array(MAX_STATUS_EFFECTS);
    public statusEffectIntensities = new Float32Array(MAX_STATUS_EFFECTS);
    public statusEffectProgress = new Float32Array(MAX_STATUS_EFFECTS);
    public statusEffectsCount = 0;

    public isDisoriented = false;
    public activePassives = new Int32Array(MAX_PASSIVES);
    public activePassivesCount = 0;
    public activeBuffs = new Int32Array(MAX_BUFFS);
    public activeBuffsCount = 0;
    public activeDebuffs = new Int32Array(MAX_DEBUFFS);
    public activeDebuffsCount = 0;

    public killerName = '';
    public killerAttackName = '';
    public killedByEnemy = false;
    public lethalSourceId = 0;
    public lethalStatusEffect = 0;

    public mapItems: MapItem[];
    public mapItemsCount = 0;
    public debugMode = false;
    public debugInfo: DebugInfoData = {
        aim: { x: 0, y: 0 },
        input: { w: 0, a: 0, s: 0, d: 0, fire: 0, reload: 0 },
        cam: { x: 0, y: 0, z: 0 },
        camera: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, fov: 0 },
        modes: 'Standard',
        enemies: 0,
        objects: 0,
        drawCalls: 0,
        coords: { x: 0, z: 0 },
        performance: {
            cpu: null,
            memory: { heapLimit: 0, heapTotal: 0, heapUsed: 0 },
            renderer: null
        }
    };
    public systems: any[] = [];

    // Cinematics & Interactions (Flattened)
    public dialogueActive = false;
    public dialogueSpeaker = '';
    public dialogueText = '';
    public cinematicActive = false;
    public interactionActive = false;
    public interactionType = InteractionType.NONE;
    public interactionLabel = '';
    public interactionTargetId = '';
    public interactionX = 0;
    public interactionY = 0;
    public interactionId: InteractionPromptId = InteractionPromptId.NONE;
    public hudVisible = false;
    public sectorName = '';
    public isMobileDevice = false;

    public discoveryActive = false;
    public discoveryId = '';
    public discoveryType = DiscoveryType.CLUE;
    public discoveryTitle = '';
    public discoveryDetails = '';
    public discoveryTimestamp = 0;
    public challengeTiers = new Int32Array(64);
    public lastMetaSignal: MetaActionId = MetaActionId.NONE;
    public metaSignalTimestamp = 0;
    public isCritical = false;
    public isGibMaster = false;
    public isQuickFinger = false;

    constructor() {
        // Initialize map items pool
        this.mapItems = new Array(MAX_MAP_ITEMS);
        for (let i = 0; i < MAX_MAP_ITEMS; i++) {
            this.mapItems[i] = { id: '', x: 0, z: 0, type: MapItemType.OTHER, label: null, icon: null, color: null, radius: null, points: null };
        }
    }

    /**
     * V8 Optimized Deep Copy (Zero-GC)
     */
    public copy(src: IHudState): void {
        this.statsBuffer.set(src.statsBuffer);
        this.vectorBuffer.set(src.vectorBuffer);
        this.statusFlags = src.statusFlags;

        this.hp = src.hp;
        this.maxHp = src.maxHp;
        this.stamina = src.stamina;
        this.maxStamina = src.maxStamina;
        this.ammo = src.ammo;
        this.magSize = src.magSize;
        this.score = src.score;
        this.scrap = src.scrap;
        this.challengePoints = src.challengePoints;
        this.multiplier = src.multiplier;
        this.activeWeapon = src.activeWeapon;
        this.isReloading = src.isReloading;

        this.bossActive = src.bossActive;
        this.bossName = src.bossName;
        this.bossHp = src.bossHp;
        this.bossMaxHp = src.bossMaxHp;

        this.bossSpawned = src.bossSpawned;
        this.bossDefeated = src.bossDefeated;
        this.familyFound = src.familyFound;
        this.familySignal = src.familySignal;

        this.level = src.level;
        this.currentXp = src.currentXp;
        this.nextLevelXp = src.nextLevelXp;
        this.throwableAmmo = src.throwableAmmo;
        this.reloadProgress = src.reloadProgress;

        this.playerPos.x = src.playerPos.x;
        this.playerPos.z = src.playerPos.z;
        if (src.familyPos && this.familyPos) {
            this.familyPos.x = src.familyPos.x;
            this.familyPos.z = src.familyPos.z;
        }
        if (src.bossPos && this.bossPos) {
            this.bossPos.x = src.bossPos.x;
            this.bossPos.z = src.bossPos.z;
        }
        this.distanceTraveled = src.distanceTraveled;

        this.kills = src.kills;
        this.spEarned = src.spEarned;
        this.isDead = src.isDead;
        this.isDriving = src.isDriving;
        this.vehicleSpeed = src.vehicleSpeed;
        this.throttleState = src.throttleState;
        this.currentSector = src.currentSector;
        this.cluesFoundCount = src.cluesFoundCount;
        this.poisFoundCount = src.poisFoundCount;
        this.collectiblesFoundCount = src.collectiblesFoundCount;
        this.fps = src.fps;

        this.unlimitedAmmo = src.unlimitedAmmo;
        this.unlimitedThrowables = src.unlimitedThrowables;
        this.isInvincible = src.isInvincible;
        this.waveActive = src.waveActive;
        this.waveKills = src.waveKills;
        this.waveTarget = src.waveTarget;
        this.currentWave = src.currentWave;
        this.totalWaves = src.totalWaves;

        this.enemyKills.set(src.enemyKills);
        // Note: Reference copy for seen lists as they change infrequently
        this.seenEnemies = src.seenEnemies;
        this.seenBosses = src.seenBosses;

        this.StatusEffectIDs.set(src.StatusEffectIDs);
        this.statusEffectDurations.set(src.statusEffectDurations);
        this.statusEffectMaxDurations.set(src.statusEffectMaxDurations);
        this.statusEffectIntensities.set(src.statusEffectIntensities);
        this.statusEffectProgress.set(src.statusEffectProgress);
        this.statusEffectsCount = src.statusEffectsCount;

        this.isDisoriented = src.isDisoriented;
        this.activePassives.set(src.activePassives);
        this.activePassivesCount = src.activePassivesCount;
        this.activeBuffs.set(src.activeBuffs);
        this.activeBuffsCount = src.activeBuffsCount;
        this.activeDebuffs.set(src.activeDebuffs);
        this.activeDebuffsCount = src.activeDebuffsCount;

        this.killerName = src.killerName;
        this.killerAttackName = src.killerAttackName;
        this.killedByEnemy = src.killedByEnemy;
        this.lethalSourceId = src.lethalSourceId;
        this.lethalStatusEffect = src.lethalStatusEffect;

        this.mapItemsCount = src.mapItemsCount;
        for (let i = 0; i < this.mapItemsCount; i++) {
            const s = src.mapItems[i];
            const d = this.mapItems[i];
            d.id = s.id;
            d.x = s.x;
            d.z = s.z;
            d.type = s.type;
            d.label = s.label;
            d.icon = s.icon;
            d.color = s.color;
            d.radius = s.radius;
            d.points = s.points;
        }

        this.debugMode = src.debugMode;
        // Skip deep copy of debugInfo for now if performance is an issue, 
        // but here's a primitive sync:
        this.debugInfo.enemies = src.debugInfo.enemies;
        this.debugInfo.objects = src.debugInfo.objects;
        this.debugInfo.drawCalls = src.debugInfo.drawCalls;
        this.debugInfo.modes = src.debugInfo.modes;
        this.debugInfo.coords.x = src.debugInfo.coords.x;
        this.debugInfo.coords.z = src.debugInfo.coords.z;

        this.dialogueActive = src.dialogueActive;
        this.dialogueSpeaker = src.dialogueSpeaker;
        this.dialogueText = src.dialogueText;

        this.cinematicActive = src.cinematicActive;

        this.interactionActive = src.interactionActive;
        this.interactionType = src.interactionType;
        this.interactionLabel = src.interactionLabel;
        this.interactionTargetId = src.interactionTargetId;
        this.interactionX = src.interactionX;
        this.interactionY = src.interactionY;

        this.interactionId = src.interactionId;
        this.hudVisible = src.hudVisible;
        this.sectorName = src.sectorName;
        this.isMobileDevice = src.isMobileDevice;

        this.discoveryActive = src.discoveryActive;
        this.discoveryId = src.discoveryId;
        this.discoveryType = src.discoveryType;
        this.discoveryTitle = src.discoveryTitle;
        this.discoveryDetails = src.discoveryDetails;
        this.discoveryTimestamp = src.discoveryTimestamp;

        this.challengeTiers.set(src.challengeTiers);
        this.lastMetaSignal = src.lastMetaSignal;
        this.metaSignalTimestamp = src.metaSignalTimestamp;

        this.isCritical = src.isCritical;
        this.isGibMaster = src.isGibMaster;
        this.isQuickFinger = src.isQuickFinger;
    }
}

type Listener = (state: IHudState) => void;
export type HudFastUpdateListener = (data: any) => void;

class HudStoreClass {
    private activeBuffer: HudStateSoA;
    private standbyBuffer: HudStateSoA;
    private listeners: Listener[] = [];
    private fastListeners: HudFastUpdateListener[] = [];

    constructor() {
        this.activeBuffer = new HudStateSoA();
        this.standbyBuffer = new HudStateSoA();
    }

    /**
     * Swaps pointers and synchronizes buffers (Zero-GC).
     */
    public update(nextState: IHudState): void {
        // Swap buffers
        const temp = this.activeBuffer;
        this.activeBuffer = this.standbyBuffer;
        this.standbyBuffer = temp;

        // Sync standby to newest active
        this.activeBuffer.copy(nextState);

        // Finalize pointers for React consumers
        this.notifyListeners();
    }

    public patch(changes: Partial<IHudState>): void {
        Object.assign(this.activeBuffer, changes);
        if (changes.debugMode !== undefined) {
            this.emitFastUpdate({ debugMode: changes.debugMode });
        }
        this.notifyListeners();
    }

    public setHudVisible(visible: boolean): void {
        if (this.activeBuffer.hudVisible !== visible) {
            this.activeBuffer.hudVisible = visible;
            this.notifyListeners();
        }
    }

    public getState(): IHudState {
        return this.activeBuffer;
    }

    /**
     * Bridge for UI interaction events (e.g. mobile button press).
     */
    public triggerInteraction(active: boolean): void {
        UIEventBridge.setInteractionTrigger(active);
        this.emitFastUpdate({ interactionActive: active, triggerInteraction: true });
    }

    /**
     * Bridge for UI meta actions (Pause, Map, etc.).
     */
    public triggerMetaAction(actionId: MetaActionId): void {
        this.activeBuffer.lastMetaSignal = actionId;
        this.activeBuffer.metaSignalTimestamp = Date.now();

        // Also bridge to engine for Zero-GC polling systems (e.g. INTERACT_TAP)
        UIEventBridge.triggerUiAction(actionId);

        this.notifyListeners();
    }

    public subscribe(listener: Listener): () => void {
        this.listeners.push(listener);
        listener(this.activeBuffer);
        return () => {
            const index = this.listeners.indexOf(listener);
            if (index !== -1) {
                const lastIndex = this.listeners.length - 1;
                if (index !== lastIndex) this.listeners[index] = this.listeners[lastIndex];
                this.listeners.pop();
            }
        };
    }

    public subscribeFastUpdate(listener: HudFastUpdateListener): () => void {
        this.fastListeners.push(listener);
        return () => {
            const index = this.fastListeners.indexOf(listener);
            if (index !== -1) {
                const lastIndex = this.fastListeners.length - 1;
                if (index !== lastIndex) this.fastListeners[index] = this.fastListeners[lastIndex];
                this.fastListeners.pop();
            }
        };
    }

    public emitFastUpdate(data: any): void {
        const len = this.fastListeners.length;
        for (let i = 0; i < len; i++) {
            this.fastListeners[i](data);
        }
    }

    private notifyListeners(): void {
        const len = this.listeners.length;
        for (let i = 0; i < len; i++) {
            this.listeners[i](this.activeBuffer);
        }
    }
}

export const HudStore = new HudStoreClass();
(window as any).HudStore = HudStore;
