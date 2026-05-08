import * as THREE from 'three';
import { SystemID } from './System';
import { PerformanceMonitor } from './PerformanceMonitor';
import { InteractionType, MetaActionId } from './ui/UIEventBridge';
import { HudStore, HudStateSoA } from '../store/HudStore';
import {
    MAX_STATUS_EFFECTS,
    MAX_PASSIVES,
    MAX_BUFFS,
    MAX_DEBUFFS,
    MAX_MAP_ITEMS
} from '../components/ui/hud/HudTypes';
import { PlayerStatID, PlayerStatusFlags } from '../entities/player/PlayerTypes';
import { DataResolver } from '../utils/ui/DataResolver';
import { WeaponType } from '../content/weapons';
import { InputAction } from '../core/engine/InputManager';
import { CLUES } from '../content/clues';
import { POIS } from '../content/pois';
import { COLLECTIBLES } from '../content/collectibles';
import { UIEventBridge } from './ui/UIEventBridge';

// Performance Scratchpads (Zero-GC)
const _v1 = new THREE.Vector3();


// ============================================================================
// ZERO-GC DOUBLE BUFFERING
// We allocate two identical state trees (A and B) on load.
// By swapping between them each frame, we force React's strict equality (===)
// to detect a change and re-render, without ever allocating new objects.
// ============================================================================

// Double-buffering
const _bufferA = new HudStateSoA();
const _bufferB = new HudStateSoA();
let _useBufferA = true;

const truncate1 = (val: number) => Math.round(val * 10) / 10;
const truncate2 = (val: number) => Math.round(val * 100) / 100;

const _fastUpdateDetail = {
    hp: 0,
    maxHp: 0,
    stamina: 0,
    maxStamina: 0,
    ammo: 0,
    currentXp: 0,
    nextLevelXp: 0,
    reloadProgress: 0,
    bossHpP: -1,
    vehicleSpeed: 0,
    throttleState: 0,
    kills: 0,
    scrap: 0,
    challengePoints: 0,
    spEarned: 0,
    // Phase 12 Expansion
    isCritical: false,
    interactionActive: false,
    interactionId: 0,
    interactionType: 0,
    interactionLabel: '',
    interactionX: 0,
    interactionY: 0
};

export const HudSystem = {
    systemId: SystemID.HUD,
    id: 'hud_system',
    enabled: true,
    persistent: true,
    emitFastUpdate: (state: any, input: any, now: number, props: any) => {
        const wep = DataResolver.getWeapons()[state.activeWeapon];
        const stats = state.statsBuffer;

        // Clamp reloadProgress for stable rendering
        const reloadDuration = (wep?.reloadTime || 1000) + (input.actions[InputAction.FIRE] ? 1000 : 0);
        const reloadRemaining = state.reloadEndTime - now;
        const reloadProgress = state.isReloading
            ? Math.max(0, Math.min(1, 1 - (reloadRemaining / reloadDuration)))
            : 0;

        // Boss/Wave logic
        let bossHpP = -1;
        const enemies = state.enemies;
        let activeBossObj = null;
        for (let i = 0; i < enemies.length; i++) {
            if (enemies[i].isBoss) {
                activeBossObj = enemies[i];
                break;
            }
        }

        if (activeBossObj) {
            bossHpP = activeBossObj.hp / activeBossObj.maxHp;
        } else if (state.sectorState && state.sectorState.waveActive) {
            const kills = state.sectorState.waveKills || 0;
            const target = state.sectorState.waveTarget || 0;
            bossHpP = (target > 0) ? kills / target : 0;
        }

        _fastUpdateDetail.hp = stats[PlayerStatID.HP];
        _fastUpdateDetail.maxHp = stats[PlayerStatID.MAX_HP];
        _fastUpdateDetail.stamina = stats[PlayerStatID.STAMINA];
        _fastUpdateDetail.maxStamina = stats[PlayerStatID.MAX_STAMINA];
        _fastUpdateDetail.ammo = state.weaponAmmo[state.activeWeapon] || 0;
        _fastUpdateDetail.currentXp = stats[PlayerStatID.CURRENT_XP];
        _fastUpdateDetail.nextLevelXp = stats[PlayerStatID.NEXT_LEVEL_XP];
        _fastUpdateDetail.reloadProgress = reloadProgress;
        _fastUpdateDetail.bossHpP = bossHpP;
        _fastUpdateDetail.vehicleSpeed = state.vehicle.active ? state.vehicle.speed : 0;
        _fastUpdateDetail.throttleState = state.vehicle.active ? state.vehicle.throttle : 0;
        _fastUpdateDetail.kills = state.sessionStats.kills;
        _fastUpdateDetail.scrap = (props.stats?.statsBuffer?.[PlayerStatID.SCRAP] || 0) + state.statsBuffer[PlayerStatID.SCRAP];
        _fastUpdateDetail.challengePoints = (props.stats?.statsBuffer?.[PlayerStatID.TOTAL_CHALLENGE_POINTS] || 0) + state.statsBuffer[PlayerStatID.TOTAL_CHALLENGE_POINTS];
        _fastUpdateDetail.spEarned = state.sessionStats.spGained;

        // Phase 12 Additions
        _fastUpdateDetail.isCritical = _fastUpdateDetail.hp > 0 && _fastUpdateDetail.hp < _fastUpdateDetail.maxHp * 0.25;

        if (state.hasInteractionTarget && state.interactionTargetPos) {
            _fastUpdateDetail.interactionActive = true;
            _fastUpdateDetail.interactionId = state.interaction.promptId;
            _fastUpdateDetail.interactionType = state.interaction.type;
            _fastUpdateDetail.interactionLabel = state.interaction.label;

            _fastUpdateDetail.interactionX = 0;
            _fastUpdateDetail.interactionY = 0;

            // Zero-GC Interaction Bridge
            UIEventBridge.setInteractionPrompt(state.interaction.promptId);
        } else {
            _fastUpdateDetail.interactionActive = false;
            _fastUpdateDetail.interactionId = 0;
            UIEventBridge.setInteractionPrompt(0); // InteractionPromptId.NONE
        }

        // ZERO-GC: Replaced CustomEvent with direct callback registry
        HudStore.emitFastUpdate(_fastUpdateDetail);
    },

    getHudData: (
        state: any,
        playerPos: THREE.Vector3,
        familyMemberMesh: THREE.Object3D | null,
        input: any,
        now: number,
        props: any,
        distanceTraveled: number,
        camera: THREE.Camera
    ) => {
        // Swap active buffer
        _useBufferA = !_useBufferA;
        const _current = _useBufferA ? _bufferA : _bufferB;

        // --- 1. MINIMAP ENTITY PROJECTION (Zero-GC SIMD Lane) ---
        // Pre-clear the vectorBuffer (Zero-GC loop)
        const vecBuf = _current.vectorBuffer;
        for (let i = 0; i < 256; i++) vecBuf[i] = -99999; // Sentinel value for "Inactive"

        const enemies = state.enemies;
        let activeBossObj = null;
        let entitiesWritten = 0;

        // Write enemies (Max 100 to leave space for loot/points)
        const enemyLimit = Math.min(enemies.length, 100);
        for (let i = 0; i < enemyLimit; i++) {
            const ent = enemies[i];
            if (ent.isBoss) activeBossObj = ent;

            const idx = entitiesWritten * 2;
            vecBuf[idx] = ent.mesh.position.x;
            vecBuf[idx + 1] = ent.mesh.position.z;
            entitiesWritten++;
        }

        // --- 2. REST OF DATA SYNC ---
        if (activeBossObj) {
            _current.bossActive = true;
            _current.bossName = activeBossObj.bossId !== undefined ? DataResolver.getBossName(activeBossObj.bossId) : 'ui.boss';
            _current.bossHp = activeBossObj.hp;
            _current.bossMaxHp = activeBossObj.maxHp;
            _current.bossPos!.x = activeBossObj.mesh.position.x;
            _current.bossPos!.z = activeBossObj.mesh.position.z;
        } else if (state.sectorState && state.sectorState.waveActive && (state.sectorState.waveKills || 0) < (state.sectorState.waveTarget || 0)) {
            _current.bossActive = true;
            _current.bossName = 'ui.zombie_wave';
            _current.bossHp = Math.max(0, (state.sectorState.waveTarget || 0) - (state.sectorState.waveKills || 0));
            _current.bossMaxHp = state.sectorState.waveTarget || 0;
        } else {
            _current.bossActive = false;
        }

        let famSignal = 0;
        if (state.activeWeapon === WeaponType.RADIO && familyMemberMesh) {
            const distSq = playerPos.distanceToSquared(familyMemberMesh.position);
            if (distSq < 40000) {
                famSignal = Math.max(0, 1 - (Math.sqrt(distSq) / 200));
            }
        }

        if (familyMemberMesh && _current.familyPos) {
            _current.familyPos.x = familyMemberMesh.position.x;
            _current.familyPos.z = familyMemberMesh.position.z;
        }

        const wep = DataResolver.getWeapons()[state.activeWeapon];
        _current.reloadProgress = state.isReloading
            ? 1 - ((state.reloadEndTime - now) / ((wep?.reloadTime || 1000) + (input.actions[InputAction.FIRE] ? 1000 : 0)))
            : 0;

        const spGained = state.sessionStats.spGained;

        // Status Effects (Zero-GC SoA Mutation)
        const effectDurations = state.effectDurations;
        const effectIntensities = state.effectIntensities;
        let effectCount = 0;

        for (let i = 0; i < 32; i++) { // Engine supports 32, we display up to 16
            const duration = effectDurations[i];
            if (duration > 0 && effectCount < MAX_STATUS_EFFECTS) {
                const maxDur = state.effectMaxDurations[i] || 1;

                _current.StatusEffectIDs[effectCount] = i;
                _current.statusEffectDurations[effectCount] = duration;
                _current.statusEffectMaxDurations[effectCount] = maxDur;
                _current.statusEffectIntensities[effectCount] = effectIntensities[i];
                _current.statusEffectProgress[effectCount] = Math.max(0, Math.min(1, duration / maxDur));

                effectCount++;
            }
        }

        _current.statusEffectsCount = effectCount;

        _current.playerPos.x = playerPos.x;
        _current.playerPos.z = playerPos.z;

        _current.isDisoriented = (state.statusFlags & PlayerStatusFlags.DISORIENTED) !== 0;

        // Zero-GC Buffer Copy for Passives/Buffs/Debuffs
        _current.statusFlags = state.statusFlags;

        let pCount = 0;
        const passives = state.activePassives;
        if (passives) {
            const len = Math.min(passives.length, MAX_PASSIVES);
            for (let i = 0; i < len; i++) _current.activePassives[pCount++] = passives[i];
        }
        _current.activePassivesCount = pCount;

        let bCount = 0;
        const buffs = state.activeBuffs;
        if (buffs) {
            const len = Math.min(buffs.length, MAX_BUFFS);
            for (let i = 0; i < len; i++) _current.activeBuffs[bCount++] = buffs[i];
        }
        _current.activeBuffsCount = bCount;

        let dCount = 0;
        const debuffs = state.activeDebuffs;
        if (debuffs) {
            const len = Math.min(debuffs.length, MAX_DEBUFFS);
            for (let i = 0; i < len; i++) _current.activeDebuffs[dCount++] = debuffs[i];
        }
        _current.activeDebuffsCount = dCount;

        _current.statsBuffer.set(state.statsBuffer);

        _current.hp = state.statsBuffer[PlayerStatID.HP];
        _current.maxHp = state.statsBuffer[PlayerStatID.MAX_HP];
        _current.stamina = state.statsBuffer[PlayerStatID.STAMINA];
        _current.maxStamina = state.statsBuffer[PlayerStatID.MAX_STAMINA];
        _current.ammo = state.weaponAmmo[state.activeWeapon] || 0;
        _current.magSize = wep?.magSize || 0;
        _current.score = state.statsBuffer[PlayerStatID.SCORE];
        _current.scrap = (props.stats?.statsBuffer?.[PlayerStatID.SCRAP] || 0) + state.statsBuffer[PlayerStatID.SCRAP];
        _current.challengePoints = (props.stats?.statsBuffer?.[PlayerStatID.TOTAL_CHALLENGE_POINTS] || 0) + state.statsBuffer[PlayerStatID.TOTAL_CHALLENGE_POINTS];

        _current.activeWeapon = state.activeWeapon;
        _current.isReloading = state.isReloading;
        _current.bossSpawned = state.bossSpawned;
        _current.bossDefeated = activeBossObj ? activeBossObj.dead : false;
        _current.familyFound = state.familyFound;
        _current.familySignal = famSignal;
        _current.level = state.statsBuffer[PlayerStatID.LEVEL];
        _current.currentXp = state.statsBuffer[PlayerStatID.CURRENT_XP];
        _current.nextLevelXp = state.statsBuffer[PlayerStatID.NEXT_LEVEL_XP];
        _current.throwableAmmo = state.weaponAmmo[props.loadout?.throwable] || 0;
        _current.distanceTraveled = Math.floor(distanceTraveled);
        _current.kills = state.sessionStats.kills;

        // Sync persistent telemetry
        if (state.stats) {
            _current.enemyKills.set(state.enemyKills);

            _current.seenEnemies = state.stats.seenEnemies;
            _current.seenBosses = state.stats.seenBosses;

            // Sync challenge tiers
            if (state.stats.challengeTiers) {
                _current.challengeTiers.set(state.stats.challengeTiers);
            }
        }

        if (state.sectorState) {
            _current.unlimitedAmmo = !!state.sectorState.unlimitedAmmo;
            _current.unlimitedThrowables = !!state.sectorState.unlimitedThrowables;
            _current.isInvincible = !!state.sectorState.isInvincible;
            _current.waveActive = !!state.sectorState.waveActive;
            _current.waveKills = state.sectorState.waveKills || 0;
            _current.waveTarget = state.sectorState.waveTarget || 0;
            _current.currentWave = state.sectorState.currentWave || 0;
            _current.totalWaves = state.sectorState.totalWaves || 0;
        }

        _current.isDriving = !!state.vehicle.active;
        _current.vehicleSpeed = state.vehicle.speed || 0;
        _current.throttleState = state.vehicle.throttle || 0;
        _current.spEarned = spGained;

        _current.isDead = (state.statusFlags & PlayerStatusFlags.DEAD) !== 0;
        _current.killerName = state.killerName;
        _current.killerAttackName = state.killerAttackName;
        _current.killedByEnemy = state.killedByEnemy;
        _current.lethalSourceId = state.lethalSourceId ?? -1;
        _current.lethalStatusEffect = state.lethalStatusEffect ?? -1;

        // Map Items Sync (Zero-GC Mutation)
        let mCount = 0;
        const mapItems = state.mapItems;
        if (mapItems) {
            const len = Math.min(mapItems.length, MAX_MAP_ITEMS);
            for (let i = 0; i < len; i++) {
                const s = mapItems[i];
                const d = _current.mapItems[mCount++];
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
        }
        _current.mapItemsCount = mCount;
        _current.fps = PerformanceMonitor.getInstance().getFps();
        _current.hudVisible = state.hudVisible ?? _current.hudVisible;
        _current.sectorName = state.sectorName || '';
        _current.currentSector = props.currentSector || 0;

        // --- ZERO-GC SECTOR-SPECIFIC DISCOVERY TALLYING ---
        let cCount = 0;
        if (state.discoverySets?.clues) {
            for (const id of state.discoverySets.clues) {
                if (CLUES[id]?.sector === _current.currentSector) cCount++;
            }
        }
        _current.cluesFoundCount = cCount;

        let poiCount = 0;
        if (state.discoverySets?.pois) {
            for (const id of state.discoverySets.pois) {
                if (POIS[id]?.sector === _current.currentSector) poiCount++;
            }
        }
        _current.poisFoundCount = poiCount;

        let colCount = 0;
        if (state.discoverySets?.collectibles) {
            for (const id of state.discoverySets.collectibles) {
                if (COLLECTIBLES[id]?.sector === _current.currentSector) colCount++;
            }
        }
        _current.collectiblesFoundCount = colCount;

        _current.isMobileDevice = !!props.isMobileDevice;

        const hp = _current.hp;
        const maxHp = _current.maxHp;
        _current.isCritical = hp > 0 && hp < maxHp * 0.25;
        _current.isGibMaster = (state.statusFlags & PlayerStatusFlags.GIB_MASTER) !== 0;
        _current.isQuickFinger = (state.statusFlags & PlayerStatusFlags.QUICK_FINGER) !== 0;

        // Sync interaction (BOTH buffers)
        if (state.hasInteractionTarget && state.interactionTargetPos) {
            _v1.copy(state.interactionTargetPos);
            _v1.project(camera);
            const screenX = (0.5 + _v1.x * 0.5) * window.innerWidth;
            const screenY = (0.5 - _v1.y * 0.5) * window.innerHeight;

            _bufferA.interactionActive = true;
            _bufferA.interactionType = state.interaction.type;
            _bufferA.interactionLabel = state.interaction.label;
            _bufferA.interactionTargetId = state.interaction.targetId;
            _bufferA.interactionX = screenX;
            _bufferA.interactionY = screenY;

            _bufferB.interactionActive = true;
            _bufferB.interactionType = state.interaction.type;
            _bufferB.interactionLabel = state.interaction.label;
            _bufferB.interactionTargetId = state.interaction.targetId;
            _bufferB.interactionX = screenX;
            _bufferB.interactionY = screenY;

            UIEventBridge.setInteractionPrompt(state.interaction.promptId);
        } else {
            _bufferA.interactionActive = false;
            _bufferB.interactionActive = false;
            UIEventBridge.setInteractionPrompt(0); // InteractionPromptId.NONE
        }

        _bufferA.cinematicActive = !!state.cinematicActive;
        _bufferA.dialogueActive = !!state.cinematicActive;
        _bufferA.dialogueSpeaker = state.cinematicLine.speaker || '';
        _bufferA.dialogueText = state.cinematicLine.text || '';
        _bufferB.cinematicActive = !!state.cinematicActive;
        _bufferB.dialogueActive = !!state.cinematicActive;
        _bufferB.dialogueSpeaker = state.cinematicLine.speaker || '';
        _bufferB.dialogueText = state.cinematicLine.text || '';

        // --- ZERO-GC NAVIGATION SIGNAL SYNC ---
        const engineSignal = UIEventBridge.consumeEngineSignal();
        if (engineSignal !== MetaActionId.NONE) {
            _bufferA.lastMetaSignal = engineSignal;
            _bufferA.metaSignalTimestamp = now;
            _bufferB.lastMetaSignal = engineSignal;
            _bufferB.metaSignalTimestamp = now;
        }

        _current.discoveryActive = false;

        // Debug mapping
        if (input.aimVector) {
            _current.debugInfo.aim.x = truncate2(input.aimVector.x);
            _current.debugInfo.aim.y = truncate2(input.aimVector.y);
        } else {
            _current.debugInfo.aim.x = 0; _current.debugInfo.aim.y = 0;
        }

        const dbgActs = input.actions;
        _current.debugInfo.input.w = dbgActs[InputAction.UP] ? 1 : 0;
        _current.debugInfo.input.a = dbgActs[InputAction.LEFT] ? 1 : 0;
        _current.debugInfo.input.s = dbgActs[InputAction.DOWN] ? 1 : 0;
        _current.debugInfo.input.d = dbgActs[InputAction.RIGHT] ? 1 : 0;
        _current.debugInfo.input.fire = dbgActs[InputAction.FIRE] ? 1 : 0;
        _current.debugInfo.input.reload = dbgActs[InputAction.RELOAD] ? 1 : 0;
        _current.debugInfo.cam.x = truncate1(camera.position.x);
        _current.debugInfo.cam.y = truncate1(camera.position.y);
        _current.debugInfo.cam.z = truncate1(camera.position.z);
        _current.debugInfo.camera.x = _current.debugInfo.cam.x;
        _current.debugInfo.camera.y = _current.debugInfo.cam.y;
        _current.debugInfo.camera.z = _current.debugInfo.cam.z;
        _current.debugInfo.camera.rotX = camera.rotation.x;
        _current.debugInfo.camera.rotY = camera.rotation.y;
        _current.debugInfo.camera.rotZ = camera.rotation.z;
        _current.debugInfo.camera.fov = (camera as THREE.PerspectiveCamera).fov;
        _current.debugInfo.coords.x = truncate1(playerPos.x);
        _current.debugInfo.coords.z = truncate1(playerPos.z);
        _current.debugInfo.performance.cpu = PerformanceMonitor.getInstance().getTimings();
        const perfMem = (performance as any).memory;
        if (perfMem) {
            _current.debugInfo.performance.memory.heapLimit = Math.round(perfMem.jsHeapSizeLimit / 1048576);
            _current.debugInfo.performance.memory.heapTotal = Math.round(perfMem.totalJSHeapSize / 1048576);
            _current.debugInfo.performance.memory.heapUsed = Math.round(perfMem.usedJSHeapSize / 1048576);
        }
        _current.debugInfo.modes = state.interaction.active ? state.interaction.type : InteractionType.NONE;
        _current.debugInfo.enemies = enemies.length;
        _current.debugInfo.objects = state.obstacles?.length || 0;

        return _current;
    },

    /** Explicitly clears cinematic and sector data from both buffers to prevent leakage */
    reset: () => {
        _bufferA.cinematicActive = false;
        _bufferA.dialogueActive = false;
        _bufferB.cinematicActive = false;
        _bufferB.dialogueActive = false;
        _bufferA.discoveryActive = false;
        _bufferB.discoveryActive = false;
    }

};
