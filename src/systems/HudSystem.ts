import * as THREE from 'three';
import { SystemID } from './System';
import { WinterEngine } from '../core/engine/WinterEngine';
import { InteractionType, InteractionPromptId, MetaActionId } from './ui/UIEventBridge';
import { HudStore, HudStateSoA } from '../store/HudStore';
import { StatusStore } from '../store/StatusStore';
import { MAX_STATUS_EFFECTS, MAX_PASSIVES, MAX_BUFFS, MAX_DEBUFFS, MAX_MAP_ITEMS } from '../components/ui/hud/game/HudTypes';
import { StatID, PlayerStatusFlags } from '../types/CareerStats';
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
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

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

const MAX_DAMAGED_OBS_HUD = 8;
const _damagedObsHudPool: any[] = [];
for (let i = 0; i < MAX_DAMAGED_OBS_HUD; i++) {
    _damagedObsHudPool.push({ id: '', x: 0, y: 0, progress: 0 });
}

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
    waveActive: false,
    waveName: '',
    waveProgress: 0,
    waveKills: 0,
    waveTarget: 0,
    waveIndicatorActive: false,
    waveIndicatorAngle: 0,
    vehicleSpeed: 0,
    throttleState: 0,
    isSkidding: false,
    kills: 0,
    scrap: 0,
    challengePoints: 0,
    spEarned: 0,
    hasCriticalHp: false,
    statusFlags: 0,
    interactionActive: false,
    interactionId: 0,
    interactionType: 0,
    interactionLabel: '',
    interactionX: 0,
    interactionY: 0,
    damagedObstacles: [] as any[],
    hudEffectsQuality: true
};

export const HudSystem = {
    systemId: SystemID.HUD,
    id: 'hud_system',
    enabled: true,
    persistent: true,
    emitFastUpdate: (state: any, input: any, now: number, props: any, playerPos?: THREE.Vector3, camera?: THREE.Camera, engine?: any) => {
        const wep = DataResolver.getWeapons()[state.combat.activeWeapon];
        const stats = state.player.statsBuffer;

        // Clamp reloadProgress for stable rendering
        const reloadDuration = (wep?.reloadTime || 1000) + (input.actions[InputAction.FIRE] ? 1000 : 0);
        const reloadRemaining = state.combat.reloadEndTime - now;
        const reloadProgress = state.combat.isReloading
            ? Math.max(0, Math.min(1, 1 - (reloadRemaining / reloadDuration)))
            : 1;

        // Boss logic
        let bossHp = -1;
        const activeBoss = state.enemies.activeBoss;
        if (activeBoss) {
            bossHp = activeBoss.hp / activeBoss.maxHp;
        } else if (state.enemies.bossDefeatedTime > 0) {
            const timeSinceDefeat = (engine ? engine.simTime : state.simTime) - state.enemies.bossDefeatedTime;
            if (timeSinceDefeat < 10000) {
                bossHp = 0;
            }
        }

        _fastUpdateDetail.hp = stats[StatID.HP] || 0;
        _fastUpdateDetail.maxHp = stats[StatID.MAX_HP] || 100;
        _fastUpdateDetail.stamina = stats[StatID.STAMINA] || 0;
        _fastUpdateDetail.maxStamina = stats[StatID.MAX_STAMINA] || 100;
        _fastUpdateDetail.ammo = state.combat.weaponAmmo[state.combat.activeWeapon] || 0;
        _fastUpdateDetail.currentXp = stats[StatID.CURRENT_XP] || 0;
        _fastUpdateDetail.nextLevelXp = stats[StatID.NEXT_LEVEL_XP] || 1000;
        _fastUpdateDetail.reloadProgress = isFinite(reloadProgress) ? reloadProgress : 0;
        _fastUpdateDetail.bossHpP = isFinite(bossHp) ? bossHp : -1;

        // Wave logic
        const sState = state.sectorState;
        if (sState && sState.waveActive && !sState.waveDisabled) {
            _fastUpdateDetail.waveActive = true;
            _fastUpdateDetail.waveName = sState.waveName || '';
            _fastUpdateDetail.waveProgress = isFinite(sState.waveProgress) ? sState.waveProgress : 0;
            _fastUpdateDetail.waveKills = sState.waveKills || 0;
            _fastUpdateDetail.waveTarget = sState.waveTarget || 0;
        } else {
            _fastUpdateDetail.waveActive = false;
            _fastUpdateDetail.waveName = '';
            _fastUpdateDetail.waveProgress = 0;
            _fastUpdateDetail.waveKills = 0;
            _fastUpdateDetail.waveTarget = 0;
        }

        // VINTERDÖD: Nearest Wave Enemy Indicator (Offscreen)
        if (playerPos && camera && _fastUpdateDetail.waveActive) {
            let nearestDistSq = Infinity;
            let nearestEnemy = null;
            const enemies = state.enemies.pool;
            for (let i = 0; i < enemies.length; i++) {
                const ent = enemies[i];
                if (ent && ent.isWaveEnemy && ent.deathState === 0) { // ALIVE
                    const d = playerPos.distanceToSquared(ent.mesh.position);
                    if (d < nearestDistSq) {
                        nearestDistSq = d;
                        nearestEnemy = ent;
                    }
                }
            }

            if (nearestEnemy) {
                // Determine if behind using camera world direction (Zero-GC dot-product)
                _v2.copy(nearestEnemy.mesh.position).sub(camera.position);
                camera.getWorldDirection(_v3);
                const isBehind = _v2.dot(_v3) < 0;

                _v1.copy(nearestEnemy.mesh.position);
                _v1.y += 1.0; // Aim at chest height
                _v1.project(camera);

                _fastUpdateDetail.waveIndicatorActive = true;
                let dirX = _v1.x;
                let dirY = -_v1.y; // Invert WebGL Y for CSS screen space
                if (isBehind) {
                    dirX *= -1;
                    dirY *= -1;
                }
                _fastUpdateDetail.waveIndicatorAngle = Math.atan2(dirY, dirX);
            } else {
                _fastUpdateDetail.waveIndicatorActive = false;
            }
        } else {
            _fastUpdateDetail.waveIndicatorActive = false;
        }

        _fastUpdateDetail.vehicleSpeed = state.vehicle.active ? (state.vehicle.speed || 0) : 0;
        _fastUpdateDetail.throttleState = state.vehicle.active ? (state.vehicle.throttle || 0) : 0;
        _fastUpdateDetail.isSkidding = state.vehicle.active ? !!state.vehicle.isSkidding : false;
        _fastUpdateDetail.kills = state.sessionStats.kills || 0;
        _fastUpdateDetail.scrap = state.player.statsBuffer[StatID.SCRAP] || 0;
        _fastUpdateDetail.challengePoints = state.player.statsBuffer[StatID.TOTAL_CHALLENGE_POINTS] || 0;
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
        } else if (state.triggers.hasInteractionTarget && state.triggers.interactionTargetPos) {
            _fastUpdateDetail.interactionActive = true;
            _fastUpdateDetail.interactionId = state.triggers.interaction.promptId;
            _fastUpdateDetail.interactionType = state.triggers.interaction.type;
            _fastUpdateDetail.interactionLabel = state.triggers.interaction.label;
            _fastUpdateDetail.interactionX = 0;
            _fastUpdateDetail.interactionY = 0;

            // Zero-GC Interaction Bridge
            UIEventBridge.setInteractionPrompt(state.triggers.interaction.promptId);
        } else {
            _fastUpdateDetail.interactionActive = false;
            _fastUpdateDetail.interactionId = 0;
            UIEventBridge.setInteractionPrompt(InteractionPromptId.NONE);
        }

        _fastUpdateDetail.statusFlags = state.combat.statusFlags || 0;
        _fastUpdateDetail.hudEffectsQuality = props.gameState.settings.hudEffectsQuality !== false;

        // Sync StatusStore flags with the main engine state (Zero-GC)
        StatusStore.setStatusFlags(state.combat.statusFlags || 0);

        // --- Destroyable Obstacles Durability Tracking (Zero-GC Screen Projection) ---
        let damagedObsCount = 0;
        const ws = (engine || WinterEngine.getInstance()).systems.worldStreamer;
        if (ws && playerPos && camera) {
            const poolIdx = ws.getObstaclePool().nextIndex();
            ws.getNearbyObstacles(playerPos.x, playerPos.z, 20.0, poolIdx);
            const obstacles = ws.getObstaclePool().getPool(poolIdx);
            const count = ws.getObstaclePool().getCount(poolIdx);

            for (let i = 0; i < count; i++) {
                const obs = obstacles[i];
                if (obs && obs.durability !== undefined && obs.durability < (obs.maxDurability || 100) && obs.durability > 0 && !obs.isMutated) {
                    _v1.copy(obs.position);
                    _v1.y += (obs.collider?.size?.y || 1.5) + 0.3; // Float above the collider top
                    _v1.project(camera);

                    if (_v1.z <= 1.0) {
                        const screenX = (0.5 + _v1.x * 0.5) * _cachedWidth;
                        const screenY = (0.5 - _v1.y * 0.5) * _cachedHeight;

                        if (damagedObsCount < MAX_DAMAGED_OBS_HUD) {
                            const item = _damagedObsHudPool[damagedObsCount];
                            item.id = obs.id || `${obs.position.x}_${obs.position.z}`;
                            item.x = screenX;
                            item.y = screenY;
                            item.progress = obs.durability / (obs.maxDurability || 100);
                            _fastUpdateDetail.damagedObstacles[damagedObsCount] = item;
                            damagedObsCount++;
                        }
                    }
                }
            }
        }
        _fastUpdateDetail.damagedObstacles.length = damagedObsCount;

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
        playerRotY: number,
        engine?: any
    ) => {
        // Swap active buffer
        _useBufferA = !_useBufferA;
        const _current = _useBufferA ? _bufferA : _bufferB;

        // --- 1. MINIMAP ENTITY PROJECTION (Zero-GC SIMD Lane) ---
        // Pre-clear the vectorBuffer (Zero-GC loop)
        const vecBuf = _current.vectorBuffer;
        for (let i = 0; i < 256; i++) vecBuf[i] = -99999; // Sentinel value for "Inactive"

        const enemies = state.enemies.pool;
        let activeBoss = state.enemies.activeBoss;
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
        let isRecentlyDefeated = false;
        if (!activeBoss && state.enemies.bossDefeatedTime > 0) {
            const timeSinceDefeat = (engine ? engine.simTime : state.simTime) - state.enemies.bossDefeatedTime;
            if (timeSinceDefeat < 10000) {
                isRecentlyDefeated = true;
            }
        }

        if (activeBoss || isRecentlyDefeated) {
            _current.bossActive = true;
            if (activeBoss) {
                _current.bossName = activeBoss.bossId !== undefined ? DataResolver.getBossName(activeBoss.bossId) : 'ui.boss';
                _current.bossHp = activeBoss.hp;
                _current.bossMaxHp = activeBoss.maxHp;
                _current.bossPos!.x = activeBoss.mesh.position.x;
                _current.bossPos!.z = activeBoss.mesh.position.z;
            } else {
                _current.bossHp = 0;
            }
        } else {
            _current.bossActive = false;
        }

        const sState2 = state.sectorState;
        if (sState2 && sState2.waveActive && !sState2.waveDisabled) {
            _current.waveActive = true;
            _current.waveName = sState2.waveName || '';
            _current.waveProgress = sState2.waveProgress || 0;
            _current.waveKills = sState2.waveKills || 0;
            _current.waveTarget = sState2.waveTarget || 0;
        } else {
            _current.waveActive = false;
            _current.waveName = '';
            _current.waveProgress = 0;
            _current.waveKills = 0;
            _current.waveTarget = 0;
        }

        let famSignal = 0;
        if (state.combat.activeWeapon === ToolID.RADIO && familyMemberMesh) {
            const distSq = playerPos.distanceToSquared(familyMemberMesh.position);
            if (distSq < 40000) {
                famSignal = Math.max(0, 1 - (Math.sqrt(distSq) / 200));
            }
        }

        if (familyMemberMesh && _current.familyPos) {
            _current.familyPos.x = familyMemberMesh.position.x;
            _current.familyPos.z = familyMemberMesh.position.z;
        }

        const wep = DataResolver.getWeapons()[state.combat.activeWeapon];
        _current.reloadProgress = state.combat.isReloading
            ? 1 - ((state.combat.reloadEndTime - now) / ((wep?.reloadTime || 1000) + (input.actions[InputAction.FIRE] ? 1000 : 0)))
            : 1;

        const spGained = state.sessionStats.spGained;

        // Status Effects (Zero-GC SoA Mutation)
        const effectDurations = state.combat.effectDurations;
        const effectIntensities = state.combat.effectIntensities;
        const activePassives = state.combat.activePassives;
        const activePassivesCount = state.combat.activePassivesCount;
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

                const maxDur = state.combat.effectMaxDurations[i] || 1;

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

        _current.isDisoriented = (state.combat.statusFlags & PlayerStatusFlags.DISORIENTED) !== 0;

        // Zero-GC Buffer Copy for Passives/Buffs/Debuffs
        _current.statusFlags = state.combat.statusFlags;

        let pCount = 0;
        const passives = state.combat.activePassives;
        if (passives) {
            const len = Math.min(state.combat.activePassivesCount, MAX_PASSIVES);
            for (let i = 0; i < len; i++) _current.activePassives[pCount++] = passives[i];
        }
        _current.activePassivesCount = pCount;

        let bCount = 0;
        const buffs = state.combat.activeBuffs;
        if (buffs) {
            const len = Math.min(state.combat.activeBuffsCount, MAX_BUFFS);
            for (let i = 0; i < len; i++) _current.activeBuffs[bCount++] = buffs[i];
        }
        _current.activeBuffsCount = bCount;

        let dCount = 0;
        const debuffs = state.combat.activeDebuffs;
        if (debuffs) {
            const len = Math.min(state.combat.activeDebuffsCount, MAX_DEBUFFS);
            for (let i = 0; i < len; i++) _current.activeDebuffs[dCount++] = debuffs[i];
        }
        _current.activeDebuffsCount = dCount;

        _current.statsBuffer.set(state.player.statsBuffer);

        _current.hp = state.player.statsBuffer[StatID.HP] || 0;
        _current.maxHp = state.player.statsBuffer[StatID.MAX_HP] || 100;
        _current.stamina = state.player.statsBuffer[StatID.STAMINA] || 0;
        _current.maxStamina = state.player.statsBuffer[StatID.MAX_STAMINA] || 100;
        _current.ammo = state.combat.weaponAmmo[state.combat.activeWeapon] || 0;
        _current.magSize = wep?.magSize || 0;
        _current.score = state.player.statsBuffer[StatID.SCORE] || 0;
        _current.scrap = state.player.statsBuffer[StatID.SCRAP] || 0;
        _current.challengePoints = state.player.statsBuffer[StatID.TOTAL_CHALLENGE_POINTS] || 0;
        _current.activeWeapon = state.combat.activeWeapon;
        _current.isReloading = state.combat.isReloading;
        _current.bossSpawned = state.enemies.bossSpawned;
        _current.bossDefeated = activeBoss ? activeBoss.dead : (state.enemies.bossDefeatedTime > 0);
        _current.familyFound = state.world.familyFound;
        _current.familySignal = isFinite(famSignal) ? famSignal : 0;
        _current.level = state.player.statsBuffer[StatID.LEVEL] || 1;
        _current.currentXp = state.player.statsBuffer[StatID.CURRENT_XP] || 0;
        _current.nextLevelXp = state.player.statsBuffer[StatID.NEXT_LEVEL_XP] || 1000;
        _current.throwableAmmo = state.combat.weaponAmmo[props.gameState?.loadout?.throwable] || 0;
        _current.distanceTraveled = Math.floor(distanceTraveled) || 0;
        _current.kills = state.sessionStats.kills || 0;
        _current.spEarned = state.sessionStats.spGained || 0;

        // Count set bits in the discovery Uint8Array maps (O(256) per type, compile-friendly)
        if (state.careerStats) {
            let cCount = 0, pCount = 0, colCount = 0;
            const dc = state.careerStats.discoveredClues, dp = state.careerStats.discoveredPois, dco = state.careerStats.discoveredCollectibles;
            if (dc && dp && dco) {
                for (let i = 0; i < dc.length; i++) if (dc[i] === 1) cCount++;
                for (let i = 0; i < dp.length; i++) if (dp[i] === 1) pCount++;
                for (let i = 0; i < dco.length; i++) if (dco[i] === 1) colCount++;
            }
            _current.discoveredCluesCount = cCount;
            _current.discoveredPoisCount = pCount;
            _current.discoveredCollectiblesCount = colCount;
        }

        // Sync persistent telemetry
        if (state.stats) {
            _current.enemyKills.set(state.enemies.enemyKills);

            _current.discoveredZombies = state.gameState.stats.discoveredZombies;
            _current.discoveredBosses = state.gameState.stats.discoveredBosses;

            // Sync challenge tiers
            if (state.gameState.stats.challengeTiers) {
                _current.challengeTiers.set(state.gameState.stats.challengeTiers);
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

        _current.isDead = (state.combat.statusFlags & PlayerStatusFlags.DEAD) !== 0;
        _current.killerName = state.player.killerName;
        _current.killerAttackName = state.player.killerAttackName;
        _current.killedByEnemy = state.player.killedByEnemy;
        _current.lethalSourceId = state.player.lethalSourceId ?? -1;
        _current.lethalStatusEffect = state.player.lethalStatusEffect ?? -1;

        // Map Items Sync (Zero-GC Mutation)
        let mCount = 0;
        const mapItems = state.world.mapItems;
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
        _current.fps = (engine || WinterEngine.getInstance()).systems.performanceMonitor?.getFps() ?? 0;
        _current.hudVisible = state.ui.hudVisible ?? _current.hudVisible;
        _current.sectorName = state.world.sectorName || '';
        _current.currentSector = props.gameState?.currentSector ?? 0;

        // --- ZERO-GC SECTOR-SPECIFIC DISCOVERY TALLYING ---
        let cCount = 0;
        const clues = state.careerStats?.discoveredClues;
        if (clues) {
            for (let i = 0; i < clues.length; i++) {
                if (clues[i] === 1) {
                    const resolved = DataResolver.resolveClueID(i);
                    if (resolved !== undefined && CLUES[resolved]?.sector === _current.currentSector) cCount++;
                }
            }
        }
        _current.discoveredCluesCount = cCount;

        let poiCount = 0;
        const pois = state.careerStats?.discoveredPois;
        if (pois) {
            for (let i = 0; i < pois.length; i++) {
                if (pois[i] === 1) {
                    const resolved = DataResolver.resolvePoiID(i);
                    if (resolved !== undefined && POIS[resolved]?.sector === _current.currentSector) poiCount++;
                }
            }
        }
        _current.discoveredPoisCount = poiCount;

        let colCount = 0;
        const cols = state.careerStats?.discoveredCollectibles;
        if (cols) {
            for (let i = 0; i < cols.length; i++) {
                if (cols[i] === 1) {
                    const resolved = DataResolver.resolveCollectibleID(i);
                    if (resolved !== undefined && COLLECTIBLES[resolved]?.sector === _current.currentSector) colCount++;
                }
            }
        }
        _current.discoveredCollectiblesCount = colCount;

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
        } else if (state.triggers.hasInteractionTarget && state.triggers.interactionTargetPos) {
            _v1.copy(state.triggers.interactionTargetPos);
            _v1.project(camera);
            const screenX = (0.5 + _v1.x * 0.5) * _cachedWidth;
            const screenY = (0.5 - _v1.y * 0.5) * _cachedHeight;

            _bufferA.interactionActive = true;
            _bufferA.interactionType = state.triggers.interaction.type;
            _bufferA.interactionLabel = state.triggers.interaction.label;
            _bufferA.interactionTargetId = state.triggers.interaction.targetId;
            _bufferA.interactionX = screenX;
            _bufferA.interactionY = screenY;

            _bufferB.interactionActive = true;
            _bufferB.interactionType = state.triggers.interaction.type;
            _bufferB.interactionLabel = state.triggers.interaction.label;
            _bufferB.interactionTargetId = state.triggers.interaction.targetId;
            _bufferB.interactionX = screenX;
            _bufferB.interactionY = screenY;

            UIEventBridge.setInteractionPrompt(state.triggers.interaction.promptId);
        } else {
            _bufferA.interactionActive = false;
            _bufferB.interactionActive = false;
            UIEventBridge.setInteractionPrompt(0); // InteractionPromptId.NONE
        }

        _bufferA.cinematicActive = !!state.ui.cinematicActive;
        _bufferA.dialogueActive = !!state.ui.cinematicLine.active;
        _bufferA.dialogueSpeaker = state.ui.cinematicLine.speaker !== undefined ? state.ui.cinematicLine.speaker : '';
        _bufferA.dialogueText = state.ui.cinematicLine.text || '';
        _bufferB.cinematicActive = !!state.ui.cinematicActive;
        _bufferB.dialogueActive = !!state.ui.cinematicLine.active;
        _bufferB.dialogueSpeaker = state.ui.cinematicLine.speaker !== undefined ? state.ui.cinematicLine.speaker : '';
        _bufferB.dialogueText = state.ui.cinematicLine.text || '';

        _current.discoveryActive = false;

        // Debug mapping
        if (input.aimVector) {
            _current.debugInfo.aim.x = truncate2(input.aimVector.x);
            _current.debugInfo.aim.y = truncate2(input.aimVector.y);
        } else {
            _current.debugInfo.aim.x = 0; _current.debugInfo.aim.y = 0;
        }

        const perfMon = (engine || WinterEngine.getInstance()).systems.performanceMonitor!;
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
        _current.debugInfo.modes = state.triggers.interaction.active ? state.triggers.interaction.type : InteractionType.NONE;
        _current.debugInfo.enemies = enemies.length;
        _current.debugInfo.objects = state.world.obstacles?.length || 0;

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
