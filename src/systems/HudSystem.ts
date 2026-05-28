import * as THREE from 'three';
import { SystemID } from './System';
import { PerformanceMonitor } from './PerformanceMonitor';
import { InteractionType, InteractionPromptId, MetaActionId } from './ui/UIEventBridge';
import { HudStore, HudStateSoA } from '../store/HudStore';
import { StatusStore } from '../store/StatusStore';
import { MAX_STATUS_EFFECTS, MAX_PASSIVES, MAX_BUFFS, MAX_DEBUFFS, MAX_MAP_ITEMS } from '../components/ui/hud/HudTypes';
import { PlayerStatID, PlayerStatusFlags } from '../entities/player/PlayerTypes';
import { DataResolver } from '../core/data/DataResolver';
import { ToolID } from '../entities/player/CombatTypes';
import { InputAction } from '../core/engine/InputManager';
import { CLUES } from '../content/clues';
import { POIS } from '../content/pois';
import { COLLECTIBLES } from '../content/collectibles';
import { UIEventBridge } from './ui/UIEventBridge';
import { PERKS, PerkCategory } from '../content/perks';
import { MAX_ENTITIES } from '../content/constants';

// Performance Scratchpads (Zero-GC)
const _v1 = new THREE.Vector3();

// Cached screen dimensions to avoid DOM layout thrashing / window lookup overhead
let _cachedWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
let _cachedHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;
if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
        _cachedWidth = window.innerWidth;
        _cachedHeight = window.innerHeight;
    });
}

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
    isSkidding: false,
    kills: 0,
    scrap: 0,
    challengePoints: 0,
    spEarned: 0,
    hasCriticalHp: false,
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

        // Boss logic
        let bossHp = -1;
        const activeBoss = state.activeBoss;
        if (activeBoss) {
            bossHp = activeBoss.hp / activeBoss.maxHp;
        }

        _fastUpdateDetail.hp = stats[PlayerStatID.HP] || 0;
        _fastUpdateDetail.maxHp = stats[PlayerStatID.MAX_HP] || 100;
        _fastUpdateDetail.stamina = stats[PlayerStatID.STAMINA] || 0;
        _fastUpdateDetail.maxStamina = stats[PlayerStatID.MAX_STAMINA] || 100;
        _fastUpdateDetail.ammo = state.weaponAmmo[state.activeWeapon] || 0;
        _fastUpdateDetail.currentXp = stats[PlayerStatID.CURRENT_XP] || 0;
        _fastUpdateDetail.nextLevelXp = stats[PlayerStatID.NEXT_LEVEL_XP] || 1000;
        _fastUpdateDetail.reloadProgress = isFinite(reloadProgress) ? reloadProgress : 0;
        _fastUpdateDetail.bossHpP = isFinite(bossHp) ? bossHp : -1;
        _fastUpdateDetail.vehicleSpeed = state.vehicle.active ? (state.vehicle.speed || 0) : 0;
        _fastUpdateDetail.throttleState = state.vehicle.active ? (state.vehicle.throttle || 0) : 0;
        _fastUpdateDetail.isSkidding = state.vehicle.active ? !!state.vehicle.isSkidding : false;
        _fastUpdateDetail.kills = state.sessionStats.kills || 0;
        _fastUpdateDetail.scrap = state.statsBuffer[PlayerStatID.SCRAP] || 0;
        _fastUpdateDetail.challengePoints = state.statsBuffer[PlayerStatID.TOTAL_CHALLENGE_POINTS] || 0;
        const directSp = state.sessionStats.spGained || 0;
        const collSp = state.sessionStats.discoveredCollectibles?.length || 0;
        const poiSp = state.sessionStats.discoveredPois?.length || 0;
        _fastUpdateDetail.spEarned = directSp + collSp + poiSp;
        _fastUpdateDetail.hasCriticalHp = _fastUpdateDetail.hp > 0 && _fastUpdateDetail.hp < _fastUpdateDetail.maxHp * 0.25;

        if (state.vehicle.active) {
            _fastUpdateDetail.interactionActive = true;
            _fastUpdateDetail.interactionId = InteractionPromptId.EXIT_VEHICLE;
            _fastUpdateDetail.interactionType = InteractionType.VEHICLE;
            _fastUpdateDetail.interactionLabel = 'ui.exit_vehicle';
            _fastUpdateDetail.interactionX = _cachedWidth * 0.5;
            _fastUpdateDetail.interactionY = _cachedHeight - 150;

            // Zero-GC Interaction Bridge
            UIEventBridge.setInteractionPrompt(InteractionPromptId.EXIT_VEHICLE);
        } else if (state.hasInteractionTarget && state.interactionTargetPos) {
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
            UIEventBridge.setInteractionPrompt(InteractionPromptId.NONE);
        }

        // Sync StatusStore flags with the main engine state (Zero-GC)
        StatusStore.setStatusFlags(state.statusFlags || 0);

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
        camera: THREE.Camera,
        playerRotY: number
    ) => {
        // Swap active buffer
        _useBufferA = !_useBufferA;
        const _current = _useBufferA ? _bufferA : _bufferB;

        // --- 1. MINIMAP ENTITY PROJECTION (Zero-GC SIMD Lane) ---
        // Pre-clear the vectorBuffer (Zero-GC loop)
        const vecBuf = _current.vectorBuffer;
        for (let i = 0; i < 256; i++) vecBuf[i] = -99999; // Sentinel value for "Inactive"

        const enemies = state.enemies;
        let activeBoss = state.activeBoss;
        let entitiesWritten = 0;

        // Write enemies (Max 100 to leave space for loot/points)
        const enemyLimit = Math.min(enemies.length, 100);
        for (let i = 0; i < enemyLimit; i++) {
            const ent = enemies[i];

            const idx = entitiesWritten * 2;
            vecBuf[idx] = ent.mesh.position.x;
            vecBuf[idx + 1] = ent.mesh.position.z;
            entitiesWritten++;
        }

        // --- 2. REST OF DATA SYNC ---
        if (activeBoss) {
            _current.bossActive = true;
            _current.bossName = activeBoss.bossId !== undefined ? DataResolver.getBossName(activeBoss.bossId) : 'ui.boss';
            _current.bossHp = activeBoss.hp;
            _current.bossMaxHp = activeBoss.maxHp;
            _current.bossPos!.x = activeBoss.mesh.position.x;
            _current.bossPos!.z = activeBoss.mesh.position.z;
        } else {
            _current.bossActive = false;
        }

        let famSignal = 0;
        if (state.activeWeapon === ToolID.RADIO && familyMemberMesh) {
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
        const activePassives = state.activePassives;
        const activePassivesCount = state.activePassivesCount;
        let effectCount = 0;

        // Safety check for PERKS array bounds
        const maxPerks = Math.min(MAX_ENTITIES.PERKS, PERKS.length);
        for (let i = 0; i < maxPerks; i++) {
            const duration = effectDurations[i];
            if (duration > 0 && effectCount < MAX_STATUS_EFFECTS) {
                const perk = PERKS[i];

                // [VINTERDÖD FIX] Passives have their own persistent circular icons.
                // We MUST skip them here even if they accidentally have a duration.
                if (perk && perk.category === PerkCategory.PASSIVE) continue;

                // Double-guard: Check if it's already in the active passives list
                let isPassive = false;
                for (let j = 0; j < activePassivesCount; j++) {
                    if (activePassives[j] === i) { isPassive = true; break; }
                }
                if (isPassive) continue;

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
        _current.playerRotY = playerRotY;

        _current.isDisoriented = (state.statusFlags & PlayerStatusFlags.DISORIENTED) !== 0;

        // Zero-GC Buffer Copy for Passives/Buffs/Debuffs
        _current.statusFlags = state.statusFlags;

        let pCount = 0;
        const passives = state.activePassives;
        if (passives) {
            const len = Math.min(state.activePassivesCount, MAX_PASSIVES);
            for (let i = 0; i < len; i++) _current.activePassives[pCount++] = passives[i];
        }
        _current.activePassivesCount = pCount;

        let bCount = 0;
        const buffs = state.activeBuffs;
        if (buffs) {
            const len = Math.min(state.activeBuffsCount, MAX_BUFFS);
            for (let i = 0; i < len; i++) _current.activeBuffs[bCount++] = buffs[i];
        }
        _current.activeBuffsCount = bCount;

        let dCount = 0;
        const debuffs = state.activeDebuffs;
        if (debuffs) {
            const len = Math.min(state.activeDebuffsCount, MAX_DEBUFFS);
            for (let i = 0; i < len; i++) _current.activeDebuffs[dCount++] = debuffs[i];
        }
        _current.activeDebuffsCount = dCount;

        _current.statsBuffer.set(state.statsBuffer);

        _current.hp = state.statsBuffer[PlayerStatID.HP] || 0;
        _current.maxHp = state.statsBuffer[PlayerStatID.MAX_HP] || 100;
        _current.stamina = state.statsBuffer[PlayerStatID.STAMINA] || 0;
        _current.maxStamina = state.statsBuffer[PlayerStatID.MAX_STAMINA] || 100;
        _current.ammo = state.weaponAmmo[state.activeWeapon] || 0;
        _current.magSize = wep?.magSize || 0;
        _current.score = state.statsBuffer[PlayerStatID.SCORE] || 0;
        _current.scrap = state.statsBuffer[PlayerStatID.SCRAP] || 0;
        _current.challengePoints = state.statsBuffer[PlayerStatID.TOTAL_CHALLENGE_POINTS] || 0;
        _current.activeWeapon = state.activeWeapon;
        _current.isReloading = state.isReloading;
        _current.bossSpawned = state.bossSpawned;
        _current.bossDefeated = activeBoss ? activeBoss.dead : false;
        _current.familyFound = state.familyFound;
        _current.familySignal = isFinite(famSignal) ? famSignal : 0;
        _current.level = state.statsBuffer[PlayerStatID.LEVEL] || 1;
        _current.currentXp = state.statsBuffer[PlayerStatID.CURRENT_XP] || 0;
        _current.nextLevelXp = state.statsBuffer[PlayerStatID.NEXT_LEVEL_XP] || 1000;
        _current.throwableAmmo = state.weaponAmmo[props.loadout?.throwable] || 0;
        _current.distanceTraveled = Math.floor(distanceTraveled) || 0;
        _current.kills = state.sessionStats.kills || 0;
        _current.spEarned = state.sessionStats.spGained || 0;
        const sStats = state.sessionStats;
        _current.cluesFoundCount = sStats ? (sStats.discoveredClues ? sStats.discoveredClues.length : 0) : 0;
        _current.poisFoundCount = sStats ? (sStats.discoveredPois ? sStats.discoveredPois.length : 0) : 0;
        _current.collectiblesFoundCount = sStats ? (sStats.discoveredCollectibles ? sStats.discoveredCollectibles.length : 0) : 0;

        // Sync persistent telemetry
        if (state.stats) {
            _current.enemyKills.set(state.enemyKills);

            _current.discoveredZombies = state.stats.discoveredZombies;
            _current.discoveredBosses = state.stats.discoveredBosses;

            // Sync challenge tiers
            if (state.stats.challengeTiers) {
                _current.challengeTiers.set(state.stats.challengeTiers);
            }
        }

        if (state.sectorState) {
            _current.unlimitedAmmo = !!state.sectorState.unlimitedAmmo;
            _current.unlimitedThrowables = !!state.sectorState.unlimitedThrowables;
            _current.isInvincible = !!state.sectorState.isInvincible;
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
        if (state.discoverySets?.discoveredClues) {
            for (const id of state.discoverySets.discoveredClues) {
                const resolved = DataResolver.resolveClueID(id);
                if (resolved !== undefined && CLUES[resolved]?.sector === _current.currentSector) cCount++;
            }
        }
        _current.cluesFoundCount = cCount;

        let poiCount = 0;
        if (state.discoverySets?.discoveredPois) {
            for (const id of state.discoverySets.discoveredPois) {
                const resolved = DataResolver.resolvePoiID(id);
                if (resolved !== undefined && POIS[resolved]?.sector === _current.currentSector) poiCount++;
            }
        }
        _current.poisFoundCount = poiCount;

        let colCount = 0;
        if (state.discoverySets?.discoveredCollectibles) {
            for (const id of state.discoverySets.discoveredCollectibles) {
                const resolved = DataResolver.resolveCollectibleID(id);
                if (resolved !== undefined && COLLECTIBLES[resolved]?.sector === _current.currentSector) colCount++;
            }
        }
        _current.collectiblesFoundCount = colCount;

        _current.isMobileDevice = !!props.isMobileDevice;

        const hp = _current.hp;
        const maxHp = _current.maxHp;
        _current.hasCriticalHp = hp > 0 && hp < maxHp * 0.25;

        // Sync interaction (BOTH buffers)
        if (state.vehicle.active) {
            _bufferA.interactionActive = true;
            _bufferA.interactionType = InteractionType.VEHICLE;
            _bufferA.interactionLabel = 'ui.exit_vehicle';
            _bufferA.interactionTargetId = '';
            _bufferA.interactionX = _cachedWidth * 0.5;
            _bufferA.interactionY = _cachedHeight - 150;

            _bufferB.interactionActive = true;
            _bufferB.interactionType = InteractionType.VEHICLE;
            _bufferB.interactionLabel = 'ui.exit_vehicle';
            _bufferB.interactionTargetId = '';
            _bufferB.interactionX = _cachedWidth * 0.5;
            _bufferB.interactionY = _cachedHeight - 150;

            UIEventBridge.setInteractionPrompt(InteractionPromptId.EXIT_VEHICLE);
        } else if (state.hasInteractionTarget && state.interactionTargetPos) {
            _v1.copy(state.interactionTargetPos);
            _v1.project(camera);
            const screenX = (0.5 + _v1.x * 0.5) * _cachedWidth;
            const screenY = (0.5 - _v1.y * 0.5) * _cachedHeight;

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
        _bufferA.dialogueActive = !!state.cinematicLine.active;
        _bufferA.dialogueSpeaker = state.cinematicLine.speaker !== undefined ? state.cinematicLine.speaker : '';
        _bufferA.dialogueText = state.cinematicLine.text || '';
        _bufferB.cinematicActive = !!state.cinematicActive;
        _bufferB.dialogueActive = !!state.cinematicLine.active;
        _bufferB.dialogueSpeaker = state.cinematicLine.speaker !== undefined ? state.cinematicLine.speaker : '';
        _bufferB.dialogueText = state.cinematicLine.text || '';

        // --- ZERO-GC NAVIGATION SIGNAL SYNC ---
        const engineSignal = UIEventBridge.consumeEngineSignal();
        _bufferA.lastMetaSignal = engineSignal;
        _bufferA.metaSignalTimestamp = engineSignal !== MetaActionId.NONE ? now : 0;
        _bufferB.lastMetaSignal = engineSignal;
        _bufferB.metaSignalTimestamp = engineSignal !== MetaActionId.NONE ? now : 0;

        _current.discoveryActive = false;

        // Debug mapping
        if (input.aimVector) {
            _current.debugInfo.aim.x = truncate2(input.aimVector.x);
            _current.debugInfo.aim.y = truncate2(input.aimVector.y);
        } else {
            _current.debugInfo.aim.x = 0; _current.debugInfo.aim.y = 0;
        }

        const perfMon = PerformanceMonitor.getInstance();
        const gcInfo = perfMon.getFormattedGcInfo();
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
        _current.debugInfo.performance.cpu = perfMon.getTimings();
        _current.debugInfo.performance.memory.heapLimit = gcInfo.heapLimitMB;
        _current.debugInfo.performance.memory.heapTotal = gcInfo.heapLimitMB;
        _current.debugInfo.performance.memory.heapUsed = gcInfo.heapUsedMB;
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
