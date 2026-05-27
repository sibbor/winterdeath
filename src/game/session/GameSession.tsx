import React, { useEffect, useImperativeHandle, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { GameCanvasProps } from '../../types/CanvasTypes';
import { SectorStats } from '../../types/StateTypes';
import { WinterEngine } from '../../core/engine/WinterEngine';
import { GameSessionLogic } from './GameSessionLogic';
import { InputAction, INPUT_KEY_MAP } from '../../core/engine/InputManager';
import { audioEngine } from '../../utils/audio/AudioEngine';
import { UiSounds, WeaponSounds } from '../../utils/audio/AudioLib';
import { SoundID, MusicID } from '../../utils/audio/AudioTypes';
import { t } from '../../utils/i18n';
import { LEVEL_CAP, WEATHER_SYSTEM, WIND_SYSTEM, FamilyMemberID } from '../../content/constants';
import { useGameSessionUiState } from './useGameSessionState';
import { useGameInput } from './useGameInput';
import { GameSessionSetup, SetupContext } from './GameSessionSetup';
import { createGameLoop } from './GameSessionLoop';
import { GameSessionUI } from './GameSessionUI';
import { FXSystem } from '../../systems/FXSystem';
import { aggregateStats } from '../../game/progression/ProgressionManager';
import { SectorSystem } from '../../systems/SectorSystem';
import { HudStore } from '../../store/HudStore';
import { PlayerStatsSystem } from '../../systems/PlayerStatsSystem';
import { EnemyType } from '../../entities/enemies/EnemyTypes';
import { PlayerStatID } from '../../entities/player/PlayerTypes';
import { DataResolver } from '../../core/data/DataResolver';
import { TriggerType, TriggerActionType } from '../../types/TriggerTypes';
import { BossID, SectorID } from './SectorTypes';
import { OverlayType, DiscoveryType } from '../../components/ui/hud/HudTypes';
import { PERKS, PerkCategory } from '../../content/perks';
import { DeathPhase } from '../../types/SessionTypes';
import { FXParticleType, FXDecalType } from '../../types/FXTypes';
import { SystemID } from '../../systems/SystemID';
import { DamageID, DamageType, EnemyAttackType } from '../../entities/player/CombatTypes';
import { StatusEffectID } from '../../types/StatusEffects';
import { UIEventRingBuffer, UIEventType } from '../../systems/ui/UIEventRingBuffer';
import { useUIEventBridge } from '../../hooks/useUIEventBridge';
import { InteractionType, InteractionSubType, InteractionPromptId, MetaActionId } from '../../systems/ui/UIEventBridge';
import { safeCopyBuffer } from '../../core/GameSessionState';

export interface GameSessionHandle {
    requestPointerLock: () => void;
    getSectorStats: (isExtraction?: boolean, aborted?: boolean) => SectorStats;
    triggerInput: (key: string) => void;
    rotateCamera: (dir: number) => void;
    adjustPitch: (dir: number) => void;
    getSystems: () => { id: string; enabled: boolean }[];
    setSystemEnabled: (id: string, enabled: boolean) => void;
    getMergedSessionStats: () => any;
    spawnBoss: (type: number, pos?: THREE.Vector3) => any;
    spawnEnemies: (newEnemies: any[]) => void;
    respawnPlayer: () => void;
    restartSector: () => Promise<void>;
}

// Zero-GC fallback constants
const _spawnPosScratch = new THREE.Vector3();

const GameSession = React.forwardRef<GameSessionHandle, GameCanvasProps>((props, ref) => {

    const { refs, uiState, updateUiState, setUiState } = useGameSessionUiState(props);
    const setupContextRef = useRef<SetupContext | null>(null);

    // Zero-GC latest state proxy
    const latestStateRef = useRef({ uiState, props });
    useEffect(() => {
        latestStateRef.current = { uiState, props };
    });

    useGameInput(refs, props, setUiState);

    // --- CORE CALLBACKS ---
    const spawnParticle = useCallback((x: number, y: number, z: number, type: FXParticleType, count: number, customMesh?: any, customVel?: any, color?: number, scale?: number) => {
        const engine = refs.engineRef.current;
        if (engine) FXSystem.spawnParticle(engine.scene, refs.stateRef.current.particles, x, y, z, type, count, customMesh, customVel, color, scale);
    }, [refs]);

    const spawnDecal = useCallback((x: number, z: number, scale: number, material?: any, type: FXDecalType = FXDecalType.DECAL) => {
        const engine = refs.engineRef.current;
        if (engine) FXSystem.spawnDecal(engine.scene, refs.stateRef.current.bloodDecals, x, z, scale, material, type);
    }, [refs]);

    const showDamageText = useCallback((x: number, y: number, z: number, text: string, color?: number) => {
        const session = refs.gameSessionRef.current;
        if (session) {
            const damageSystem = session.getSystem<any>(SystemID.DAMAGE_NUMBER);
            if (damageSystem) damageSystem.spawn(x, y, z, text, color);
        }
    }, [refs]);

    const getSectorStats = useCallback((isExtraction: boolean = false, aborted: boolean = false): SectorStats => {
        const engine = WinterEngine.getInstance();
        const state = refs.stateRef.current;

        if (!state.sessionStats) return ({} as SectorStats);

        // Zero-GC: Breakdown objects and lists are already in sessionStats
        const stats = state.sessionStats;
        stats.isExtraction = isExtraction;
        stats.aborted = aborted;
        stats.timeElapsed = engine.simTime / 1000;
        stats.timePlayed = stats.timeElapsed;
        stats.accuracy = (stats.shotsFired > 0 ? (stats.shotsHit / stats.shotsFired) : 1) * 100;
        stats.distanceTraveled = refs.distanceTraveledRef.current;

        // Sync active perks for Pause/Recap screens (Zero-GC Buffer Sync)
        safeCopyBuffer(stats.activePassives, state.activePassives);
        stats.activePassivesCount = state.activePassivesCount;
        safeCopyBuffer(stats.activeBuffs, state.activeBuffs);
        stats.activeBuffsCount = state.activeBuffsCount;
        safeCopyBuffer(stats.activeDebuffs, state.activeDebuffs);
        stats.activeDebuffsCount = state.activeDebuffsCount;

        // --- PERK TELEMETRY SYNC (Sector-specific delta calculations) ---
        const pStats = state.stats;
        if (pStats) {
            const pLen = stats.perkTimesGained.length;
            for (let i = 0; i < pLen; i++) {
                stats.perkTimesGained[i] = Math.max(0, state.perkTimesGained[i] - (pStats.perkTimesGained[i] || 0));
                stats.perkDamageAbsorbed[i] = Math.max(0, state.perkDamageAbsorbed[i] - (pStats.perkDamageAbsorbed[i] || 0));
                stats.perkDamageDealt[i] = Math.max(0, state.perkDamageDealt[i] - (pStats.perkDamageDealt[i] || 0));
                stats.perkDebuffsCleansed[i] = Math.max(0, state.perkDebuffsCleansed[i] - (pStats.perkDebuffsCleansed[i] || 0));
            }
        }

        return stats;
    }, [refs]);

    const concludeSector = useCallback((isExtraction: boolean) => {
        if (!refs.hasEndedSector.current) {
            refs.hasEndedSector.current = true;
            if (isExtraction) {
                refs.stateRef.current.familyExtracted = true;
                audioEngine.stopAmbience();
                audioEngine.setReverb(0);
            }
            latestStateRef.current.props.onSectorEnded(getSectorStats(isExtraction));
        }
    }, [getSectorStats, refs]);

    const setBubble = useCallback((text: string, duration?: number) => {
        UIEventRingBuffer.pushString(UIEventType.CHAT_BUBBLE, text, duration, refs.gameSessionRef.current?.state.simTime || 0);
    }, []);

    const gainXp = useCallback((amount: number) => {
        const session = refs.gameSessionRef.current;
        if (!session) return;

        const state = session.state;
        if (state.isPlayground) return;
        const statsBuffer = state.statsBuffer;

        // Telemetry
        state.sessionStats.xpGained += amount;

        // --- DOD Progression Fix: Zero-GC ---
        statsBuffer[PlayerStatID.SCORE] += amount;
        statsBuffer[PlayerStatID.CURRENT_XP] += amount;
        statsBuffer[PlayerStatID.XP] += amount;

        let levelUps = 0;
        const maxLevel = 100;

        // Process level-ups in a single pass
        while (statsBuffer[PlayerStatID.CURRENT_XP] >= statsBuffer[PlayerStatID.NEXT_LEVEL_XP] && statsBuffer[PlayerStatID.LEVEL] < maxLevel) {
            statsBuffer[PlayerStatID.CURRENT_XP] -= statsBuffer[PlayerStatID.NEXT_LEVEL_XP];
            statsBuffer[PlayerStatID.LEVEL]++;
            statsBuffer[PlayerStatID.NEXT_LEVEL_XP] = Math.max(100, Math.floor(statsBuffer[PlayerStatID.NEXT_LEVEL_XP] * 1.2));
            levelUps++;
        }

        if (levelUps > 0) {
            UIEventRingBuffer.push(UIEventType.LEVEL_UP, statsBuffer[PlayerStatID.LEVEL], levelUps, state.simTime);
            UiSounds.playLevelUp();
        }

        UIEventRingBuffer.push(UIEventType.XP_GAIN, amount, 0, state.simTime);
    }, [refs]);

    const gainSp = useCallback((amount: number) => {
        const session = refs.gameSessionRef.current;
        if (!session || session.state.isPlayground) return;

        session.state.sessionStats.spGained += amount;
        session.state.statsBuffer[PlayerStatID.SKILL_POINTS] += amount;
        UIEventRingBuffer.push(UIEventType.SP_GAIN, amount, 0, session.state.simTime);
    }, [refs]);

    const gainScrap = useCallback((amount: number) => {
        const session = refs.gameSessionRef.current;
        if (!session || session.state.isPlayground) return;

        session.state.sessionStats.scrapLooted += amount;

        const statsBuffer = session.state.statsBuffer;
        statsBuffer[PlayerStatID.SCRAP] += amount;
        statsBuffer[PlayerStatID.TOTAL_SCRAP_COLLECTED] += amount;
        UIEventRingBuffer.push(UIEventType.SCRAP_GAIN, amount, 0, session.state.simTime);
    }, [refs]);

    // --- PAUSE SYNCHRONIZATION ---
    useEffect(() => {
        const engine = refs.engineRef.current;
        if (engine) {
            engine.isSimulationPaused = props.isPaused;
            if (props.isPaused && (props.currentGameState?.screen === 5 || props.currentGameState?.screen === 2)) {
                engine.isRenderingPaused = true;
            } else {
                engine.isRenderingPaused = false;
            }
        }
    }, [props.isPaused, props.currentGameState?.screen, refs]);

    const closeModal = useCallback(() => {
        const { props: currentProps } = latestStateRef.current;
        if (currentProps.onInteractionStateChange) currentProps.onInteractionStateChange(OverlayType.NONE);

        updateUiState({
            activeModal: null,
            collectibleId: null,
            stationOverlay: null
        });

        const s = refs.gameSessionRef.current;
        if (s) {
            s.setSystemEnabled(SystemID.PLAYER_COMBAT, true);
            s.setSystemEnabled(SystemID.PLAYER_MOVEMENT, true);
            s.setSystemEnabled(SystemID.INTERACTION, true);
        }
        if (!currentProps.isMobileDevice && refs.containerRef.current) {
            refs.engineRef.current?.input.requestPointerLock(refs.containerRef.current);
        }
    }, [refs, updateUiState]);

    const onAction = useCallback((action: any) => {
        const state = refs.stateRef.current;

        if (Array.isArray(action)) {
            const aLen = action.length;
            for (let i = 0; i < aLen; i++) {
                onAction(action[i]);
            }
            return;
        }

        const payload = typeof action === 'object' ? (action.payload || action) : {};

        switch (action.type) {
            case TriggerActionType.PLAY_SOUND: {
                const soundId = payload.id || action.id;
                if (soundId === SoundID.EXPLOSION) {
                    WeaponSounds.playExplosion(refs.playerGroupRef.current?.position || _spawnPosScratch.set(0, 0, 0));
                    if ((window as any).haptic) (window as any).haptic.explosion();
                } else {
                    audioEngine.playSound(soundId || SoundID.UI_HOVER);
                }
                break;
            }

            case TriggerActionType.GIVE_REWARD: {
                if (payload.scrap) gainScrap(payload.scrap);
                if (payload.xp) gainXp(payload.xp);
                if (payload.sp) gainSp(payload.sp);
                if (payload.amount) {
                    // Generic amount treated as HP if not otherwise specified
                    const hp = state.statsBuffer[PlayerStatID.HP];
                    const maxHp = state.statsBuffer[PlayerStatID.MAX_HP];
                    state.statsBuffer[PlayerStatID.HP] = Math.min(maxHp, hp + payload.amount);
                }
                UiSounds.playConfirm();
                break;
            }

            case TriggerActionType.APPLY_EFFECT: {
                const perkSystem = refs.gameSessionRef.current?.getSystem<any>(SystemID.PERK_SYSTEM);
                if (perkSystem) {
                    const effectId = payload.id;
                    const perk = PERKS[effectId];
                    const amount = payload.amount || 0;

                    // Support Buffs: If it's a buff and no damage is specified, apply purely as an effect
                    if (perk && perk.category === PerkCategory.BUFF && amount <= 0) {
                        perkSystem.applyPerk(
                            refs.gameSessionRef.current!,
                            effectId,
                            payload.duration || 1500
                        );
                    } else {
                        // Standard Damage/Hazard Effect via Stats System (which then calls applyPerk for the debuff)
                        const statsSystem = refs.gameSessionRef.current?.getSystem<PlayerStatsSystem>(SystemID.PLAYER_STATS);
                        if (statsSystem) {
                            let dmgId = DamageID.OTHER;
                            let dmgType = DamageType.PHYSICAL;
                            switch (effectId) {
                                case StatusEffectID.BURNING: dmgId = DamageID.BURN; dmgType = DamageType.BURN; break;
                                case StatusEffectID.BLEEDING: dmgId = DamageID.BLEED; dmgType = DamageType.BLEED; break;
                                case StatusEffectID.ELECTRIFIED: dmgId = DamageID.ELECTRIC; dmgType = DamageType.ELECTRIC; break;
                                case StatusEffectID.FREEZING: dmgId = DamageID.FROST; dmgType = DamageType.FROST; break;
                                case StatusEffectID.DROWNING: dmgId = DamageID.DROWNING; dmgType = DamageType.DROWNING; break;
                            }

                            statsSystem.handlePlayerHit(
                                refs.gameSessionRef.current!,
                                amount,
                                null,
                                dmgType,
                                dmgId,
                                true, // isDoT
                                effectId, // StatusEffectID
                                payload.duration || 1500,
                                payload.amount || 1.0 // intensity
                            );
                        }
                    }
                }
                break;
            }

            case TriggerActionType.SPAWN_ENEMY: {
                if (payload) {
                    const count = payload.count || 1;
                    for (let i = 0; i < count; i++) {
                        const spread = payload.spread || 0;
                        if (payload.pos) {
                            _spawnPosScratch.set(payload.pos.x, 0, payload.pos.z);
                        } else if (refs.playerGroupRef.current) {
                            _spawnPosScratch.copy(refs.playerGroupRef.current.position);
                        } else {
                            _spawnPosScratch.set(0, 0, 0);
                        }
                        if (spread > 0) {
                            _spawnPosScratch.x += (Math.random() - 0.5) * spread;
                            _spawnPosScratch.z += (Math.random() - 0.5) * spread;
                        }
                        refs.sectorContextRef.current?.spawnZombie(payload.type, _spawnPosScratch);
                    }
                }
                break;
            }

            case TriggerActionType.SPAWN_BOSS: {
                UIEventRingBuffer.push(UIEventType.BOSS_SPAWN, payload.type === 'BOSS' ? 1 : 0, 0, state.simTime);
                break;
            }

            case TriggerActionType.FAMILY_MEMBER_FOLLOW: {
                UIEventRingBuffer.push(UIEventType.FAMILY_FOLLOW, 1, 0, state.simTime);

                // TODO: Gain 2 SP if it's the first time a family member follows the player
                // gainSp(2);
                break;
            }

            case TriggerActionType.FAMILY_MEMBER_FOUND: {
                let targetName = payload?.name;
                let targetId = payload?.id;

                if (!targetName || targetId === undefined) {
                    const currentFM = refs.familyMemberRef.current;
                    if (currentFM) {
                        targetName = currentFM.name;
                        targetId = currentFM.id;
                    }
                }

                state.familyFound = true;
                state.sectorState.familyFound = true;

                if (!props.familyAlreadyRescued) {
                    UIEventRingBuffer.push(UIEventType.FAMILY_FOUND, targetId || 0, 0, state.simTime);

                    // Permanent Base Upgrade: Refresh passives immediately upon rescue
                    const perkSystem = refs.gameSessionRef.current?.getSystem<any>(SystemID.PERK_SYSTEM);
                    if (perkSystem) {
                        perkSystem.refreshBaseStats(refs.gameSessionRef.current!);
                    }

                    if (targetName) {
                        setBubble(targetName + " " + t('ui.saved'), 3000);
                        audioEngine.playSound(SoundID.UI_CHIME);
                    }
                }
                break;
            }

            case TriggerActionType.START_CINEMATIC: {
                const engine = refs.engineRef.current;
                let target: THREE.Object3D | null = null;
                const currentFMDef = refs.familyMemberRef.current;

                let isFollowing = false;
                const activeMembers = refs.activeFamilyMembers.current;
                if (activeMembers) {
                    const mLen = activeMembers.length;
                    for (let i = 0; i < mLen; i++) {
                        if (activeMembers[i].id === currentFMDef?.id && activeMembers[i].following) {
                            isFollowing = true;
                            break;
                        }
                    }
                }

                if (isFollowing) {
                    const sectorData = props.currentSectorData || (window as any).SectorSystem?.getSector(props.currentSector || 0);
                    const bossPos = sectorData?.bossSpawn;

                    if (bossPos) {
                        onAction({ type: TriggerActionType.SPAWN_BOSS, payload: { pos: bossPos } });
                    }
                    return;
                }

                if (payload.familyId === undefined && !payload.targetName && !payload.id) {
                    const currentFM = refs.familyMemberRef.current;
                    if (currentFM && currentFM.mesh) {
                        target = currentFM.mesh;
                    }
                }

                if (!target && payload.familyId !== undefined && refs.activeFamilyMembers.current) {
                    const members = refs.activeFamilyMembers.current;
                    const mLen = members.length;
                    for (let i = 0; i < mLen; i++) {
                        if (members[i].id === payload.familyId) {
                            target = members[i].mesh;
                            break;
                        }
                    }
                }

                if (!target && (payload.targetName || payload.id)) {
                    const scene = engine?.scene;
                    if (scene) {
                        target = scene.getObjectByName(payload.targetName || payload.id);

                        if (!target && payload.id) {
                            const children = scene.children;
                            const cLen = children.length;
                            for (let i = 0; i < cLen; i++) {
                                if (children[i].userData?.id === payload.id) {
                                    target = children[i];
                                    break;
                                }
                            }
                        }
                    }
                }

                const cinematic = refs.gameSessionRef.current?.getSystem<any>(SystemID.CINEMATIC);
                if (cinematic) {
                    const sectorId = payload.sectorId !== undefined ? payload.sectorId : props.currentSector;
                    cinematic.startCinematic(target, sectorId, payload.dialogueId, payload);
                }
                break;
            }

            case TriggerActionType.SET_SECTOR_FLAG: {
                if (payload && payload.flag) {
                    state.sectorState.pendingTrigger = payload.flag;
                }
                break;
            }

            case TriggerActionType.CAMERA_SHAKE: {
                if (payload.amount) refs.engineRef.current?.camera.shake(payload.amount);
                break;
            }

            case TriggerActionType.CAMERA_PAN: {
                if (payload.target && payload.duration) {
                    const cam = refs.engineRef.current?.camera;
                    if (cam) {
                        cam.setCinematic(true);
                        cam.setPosition(payload.target.x, 30, payload.target.z + 20);
                        cam.lookAt(payload.target.x, 0, payload.target.z);
                        setTimeout(() => {
                            cam.setCinematic(false);
                        }, payload.duration);
                    }
                }
                break;
            }

            case TriggerActionType.START_WAVE: {
                if (payload.count) {
                    state.sectorState.zombiesKilled = 0;
                    state.sectorState.targetKills = payload.count;
                    state.sectorState.waveActive = true;
                    setBubble(t('ui.wave_start'), 3000);
                }
                break;
            }

            case TriggerActionType.CONCLUDE_SECTOR: {
                concludeSector(payload?.isExtraction ?? false);
                break;
            }

            default: {
                // ZERO-GC: No string fallback. Use SET_SECTOR_FLAG for custom flags.
                break;
            }
        }
    }, [concludeSector, gainXp, props.currentSectorData, props.familyAlreadyRescued, refs, setBubble, gainSp]);

    const handleDiscovery = useCallback((type: DiscoveryType, id: any, titleKey: string = '', detailsKey: string = '', payload?: any, fromBridge: boolean = false) => {
        const state = refs.stateRef.current;
        const currentProps = latestStateRef.current.props;
        if (!state || !state.sessionStats || !state.discoverySets) return;

        const stats = state.sessionStats;
        const sets = state.discoverySets;
        let isNew = false;

        titleKey = titleKey || payload?.titleKey || '';
        detailsKey = detailsKey || payload?.detailsKey || '';

        switch (type) {
            case DiscoveryType.ZOMBIE: {
                const enemyId = Number(id);
                if (fromBridge || !sets.discoveredZombies.has(enemyId)) {
                    sets.discoveredZombies.add(enemyId);

                    let foundEnemy = false;
                    for (let i = 0; i < stats.discoveredZombies.length; i++) {
                        if (stats.discoveredZombies[i] === enemyId) { foundEnemy = true; break; }
                    }
                    if (!foundEnemy) stats.discoveredZombies.push(enemyId);

                    isNew = true;
                    titleKey = DataResolver.getDiscoveryTitle(DiscoveryType.ZOMBIE);
                    detailsKey = DataResolver.getZombieName(enemyId);
                    if (currentProps.onEnemyDiscovered) currentProps.onEnemyDiscovered(enemyId);
                }
                break;
            }

            case DiscoveryType.BOSS: {
                const bossId = Number(id);
                if (fromBridge || !sets.discoveredBosses.has(bossId)) {
                    sets.discoveredBosses.add(bossId);

                    let foundBoss = false;
                    for (let i = 0; i < stats.discoveredBosses.length; i++) {
                        if (stats.discoveredBosses[i] === bossId) { foundBoss = true; break; }
                    }
                    if (!foundBoss) stats.discoveredBosses.push(bossId);

                    isNew = true;
                    titleKey = DataResolver.getDiscoveryTitle(DiscoveryType.BOSS);
                    detailsKey = DataResolver.getBossName(bossId);
                    if (currentProps.onBossDiscovered) currentProps.onBossDiscovered(bossId);
                }
                break;
            }

            case DiscoveryType.COLLECTIBLE: {
                const colSmi = DataResolver.resolveCollectibleID(id);
                if (colSmi !== undefined) {
                    const strId = DataResolver.resolveCollectibleId(colSmi);
                    titleKey = DataResolver.getDiscoveryTitle(DiscoveryType.COLLECTIBLE);
                    detailsKey = detailsKey || payload?.detailsKey || DataResolver.getCollectibleName(strId);

                    if (fromBridge || !sets.discoveredCollectibles.has(colSmi)) {
                        sets.discoveredCollectibles.add(colSmi);
                        if (!stats.discoveredCollectibles.includes(strId)) {
                            stats.discoveredCollectibles.push(strId);
                            isNew = true;
                        }
                        state.sessionCollectiblesDiscovered.push(strId);
                    }

                    if (currentProps.onCollectibleDiscovered) currentProps.onCollectibleDiscovered(strId);
                }
                break;
            }

            case DiscoveryType.POI: {
                const poiSmi = DataResolver.resolvePoiID(id);
                if (poiSmi !== undefined) {
                    const strId = DataResolver.resolvePoiId(poiSmi);
                    titleKey = DataResolver.getDiscoveryTitle(DiscoveryType.POI);
                    detailsKey = payload?.detailsKey || DataResolver.getPoiName(strId);
                    if (fromBridge || !sets.discoveredPois.has(poiSmi)) {
                        sets.discoveredPois.add(poiSmi);

                        if (!stats.discoveredPois.includes(strId)) {
                            stats.discoveredPois.push(strId);
                            isNew = true;
                        }

                        if (currentProps.onPOIdiscovered) currentProps.onPOIdiscovered(payload || strId);
                    }
                }
                break;
            }

            case DiscoveryType.PERK: {
                const perkId = Number(id);
                if (fromBridge || state.discoveredPerksMap[perkId] === 0) {
                    state.discoveredPerksMap[perkId] = 1;
                    isNew = true;
                    titleKey = DataResolver.getDiscoveryTitle(DiscoveryType.PERK);
                    const perk = PERKS[perkId];
                    detailsKey = perk ? perk.displayName : 'ui.perk_discovered';
                    if (state.sessionStats.discoveredPerksMap) {
                        state.sessionStats.discoveredPerksMap[perkId] = 1;
                    }
                    if (currentProps.onPerkDiscovered) currentProps.onPerkDiscovered(perkId);
                }
                break;
            }

            case DiscoveryType.CLUE:
            default: {
                const clueSmi = DataResolver.resolveClueID(id);
                if (clueSmi !== undefined) {
                    const strId = DataResolver.resolveClueId(clueSmi);
                    titleKey = DataResolver.getDiscoveryTitle(DiscoveryType.CLUE);
                    detailsKey = detailsKey || 'ui.clue_found';
                    if (fromBridge || !sets.discoveredClues.has(clueSmi)) {
                        sets.discoveredClues.add(clueSmi);
                        const cluePayload = payload || { id: strId, content: detailsKey };

                        if (!stats.discoveredClues.includes(strId)) {
                            stats.discoveredClues.push(strId);
                            isNew = true;
                        }

                        if (currentProps.onClueDiscovered) currentProps.onClueDiscovered(cluePayload);
                    }
                }
                break;
            }
        }

        if (isNew) {
            // Immediately patch HudStore with the updated count to prevent stale display in the popup
            const hudState = HudStore.getState();
            if (type === DiscoveryType.CLUE) {
                HudStore.patch({ cluesFoundCount: hudState.cluesFoundCount + 1 });
            } else if (type === DiscoveryType.POI) {
                HudStore.patch({ poisFoundCount: hudState.poisFoundCount + 1 });
            } else if (type === DiscoveryType.COLLECTIBLE) {
                HudStore.patch({ collectiblesFoundCount: hudState.collectiblesFoundCount + 1 });
            }

            if (currentProps.settings?.showDiscoveryPopups !== false) {
                audioEngine.playSound(SoundID.PASSIVE_GAINED);
                if (!fromBridge && typeof id === 'number') {
                    UIEventRingBuffer.push(UIEventType.DISCOVERY, id, type, state.simTime);
                }
            }
        }
    }, [refs, t]);

    const uiCallbacks = React.useMemo(() => ({
        onContinue: () => {
            const { uiState: currentUi, props: currentProps } = latestStateRef.current;
            if (currentUi.deathPhase === DeathPhase.CONTINUE) {
                updateUiState({ deathPhase: DeathPhase.FADEOUT });
                UiSounds.playConfirm();
                setTimeout(() => {
                    const finalStats = getSectorStats(false, true);
                    currentProps.onSectorEnded(finalStats);
                }, 1000);
            } else {
                updateUiState({ deathPhase: DeathPhase.CONTINUE });
            }
        },
        onInteract: () => {
            if (refs.engineRef.current) {
                refs.engineRef.current.input.state.actions[InputAction.INTERACT] = 1;
                setTimeout(() => { if (refs.engineRef.current) refs.engineRef.current.input.state.actions[InputAction.INTERACT] = 0; }, 100);
            }
        },
        closeModal,
        openMap: () => {
            HudStore.triggerMetaAction(MetaActionId.TOGGLE_MAP);
            return true;
        },
        onPauseToggle: (val: boolean) => latestStateRef.current.props.onPauseToggle(val),
        requestPointerLock: () => refs.engineRef.current?.input.requestPointerLock(refs.containerRef.current!),
        triggerCinematicNext: () => {
            const wasTyping = refs.bubbleRef.current?.finishTyping();
            if (!wasTyping) {
                const sys = refs.gameSessionRef.current?.getSystem<any>(SystemID.CINEMATIC);
                if (sys && sys.cinematicRef.current.active) {
                    sys.playLine(sys.cinematicRef.current.lineIndex + 1);
                }
            }
        },
        saveArmory: (newLoadout: any, newLevels: any, newSectorState: any) => {
            const currentProps = latestStateRef.current.props;
            if (currentProps.onUpdateLoadout) currentProps.onUpdateLoadout(newLoadout, newLevels);
            refs.stateRef.current.loadout = newLoadout;
            refs.stateRef.current.weaponLevels = newLevels;
            refs.stateRef.current.sectorState = { ...refs.stateRef.current.sectorState, ...newSectorState };

            for (const key in refs.stateRef.current.weaponAmmo) {
                const wepType = key as any;
                refs.stateRef.current.weaponAmmo[wepType] = DataResolver.getWeapons()[wepType]?.magSize || 0;
            }
            closeModal();
            UiSounds.playConfirm();
        },
        spawnEnemies: (newEnemies: any[]) => {
            const enemies = refs.stateRef.current.enemies;
            const len = newEnemies.length;
            for (let i = 0; i < len; i++) {
                enemies.push(newEnemies[i]);
            }
        },
        saveSkills: (newStats: any, newSectorState: any) => {
            const currentProps = latestStateRef.current.props;
            if (currentProps.onSaveStats) currentProps.onSaveStats(newStats);
            const sb = refs.stateRef.current.statsBuffer;
            sb[PlayerStatID.HP] = newStats.maxHp;
            sb[PlayerStatID.MAX_HP] = newStats.maxHp;
            sb[PlayerStatID.STAMINA] = newStats.maxStamina;
            sb[PlayerStatID.MAX_STAMINA] = newStats.maxStamina;
            refs.stateRef.current.sectorState = { ...refs.stateRef.current.sectorState, ...newSectorState };
            closeModal();
        },
        changeEnvironment: (weather: any, overrides: any) => {
            const currentProps = latestStateRef.current.props;
            refs.stateRef.current.weather = weather;
            refs.stateRef.current.sectorState.envOverride = overrides;
            if (refs.engineRef.current) refs.engineRef.current.weather.sync(weather, 1000);
            if (currentProps.onEnvironmentOverrideChange) currentProps.onEnvironmentOverrideChange(overrides, weather);
        },
        setBubble,
        spawnZombie: (type: number, pos: THREE.Vector3) => {
            refs.sectorContextRef.current?.spawnZombie(type, pos);
        },
        onAction,
        gainXp
    }), [closeModal, gainXp, onAction, refs, setBubble, updateUiState]);

    const handleUIEvent = useCallback((type: UIEventType, p1: any, p2: number) => {
        switch (type) {
            case UIEventType.BOSS_SPAWN: {
                const bossType = p1 === 1 ? 'BOSS' : 'BOSS';
                const sectorData = props.currentSectorData || SectorSystem.getSector(props.currentSector || 0);
                const pos = sectorData?.bossSpawn || _spawnPosScratch.set(0, 0, 0);

                const boss = refs.sectorContextRef.current?.spawnBoss(bossType, pos);
                if (boss) {
                    refs.bossIntroRef.current = {
                        active: true,
                        bossMesh: boss.mesh,
                        startTime: WinterEngine.getInstance().renderTime
                    };

                    const bossNameKey = boss.bossId !== undefined && boss.bossId !== BossID.NONE ? DataResolver.getBossName(boss.bossId) : 'ui.boss';
                    updateUiState({
                        bossIntroActive: true,
                        bossName: t(bossNameKey)
                    });
                    audioEngine.stopMusic();
                    audioEngine.playSound(SoundID.ZOMBIE_GROWL_TANK);

                    if (refs.bossIntroTimerRef.current) clearTimeout(refs.bossIntroTimerRef.current);
                    refs.bossIntroTimerRef.current = setTimeout(() => {
                        refs.bossIntroRef.current.active = false;
                        updateUiState({ bossIntroActive: false });

                        const currentProps = latestStateRef.current.props;
                        const sectorData = (currentProps as any).currentSectorData || { environment: { bossMusic: MusicID.BOSS_FIGHT } };
                        audioEngine.playMusic(sectorData.environment.bossMusic || MusicID.BOSS_FIGHT);
                    }, 3000);
                }
                break;
            }

            case UIEventType.FAMILY_FOLLOW: {
                const active = p1 === 1;
                const fms = refs.activeFamilyMembers.current;
                const len = fms.length;
                for (let i = 0; i < len; i++) {
                    if (fms[i].found) fms[i].following = active;
                }
                break;
            }

            case UIEventType.FAMILY_FOUND: {
                const targetId = p1;
                const fms = refs.activeFamilyMembers.current;
                let newlyFound = false;
                const len = fms.length;

                for (let i = 0; i < len; i++) {
                    const fm = fms[i];
                    if (fm.id === targetId) {
                        fm.found = true;
                        fm.following = true;
                        newlyFound = true;
                    }
                }

                if (newlyFound && refs.gameSessionRef.current) {
                    const statsSystem = refs.gameSessionRef.current.getSystem<PlayerStatsSystem>(SystemID.PLAYER_STATS);
                    if (statsSystem) statsSystem.updatePassives(refs.gameSessionRef.current);
                }
                break;
            }

            case UIEventType.DISCOVERY: {
                const dType = p2 as DiscoveryType;
                handleDiscovery(dType, p1, '', '', undefined, true);
                break;
            }
            case UIEventType.CHAT_BUBBLE:
                break;
            case UIEventType.CHALLENGE_COMPLETE:
                break;
        }
    }, [handleDiscovery, props.currentSector, props.currentSectorData, refs, updateUiState]);

    useUIEventBridge(handleUIEvent);

    useEffect(() => {
        const handleKeepCamera = (e: any) => {
            const detail = e.detail || {};
            const targetPos = detail.targetPos;
            const lookAtPos = detail.lookAtPos;
            const duration = detail.duration;

            if (targetPos && lookAtPos && refs.engineRef.current) {
                refs.cameraOverrideRef.current = {
                    active: true,
                    targetPos: new THREE.Vector3(targetPos.x, targetPos.y || 30, targetPos.z),
                    lookAtPos: new THREE.Vector3(lookAtPos.x, lookAtPos.y || 0, lookAtPos.z),
                    endTime: WinterEngine.getInstance().renderTime + (duration || 5000)
                };
                refs.engineRef.current.camera.setCinematic(true);
            }
        };

        const handleClearCameraOverride = () => {
            refs.cameraOverrideRef.current = null;
            if (refs.engineRef.current) refs.engineRef.current.camera.setCinematic(false);
        };

        const handleOpenStation = (e: any) => {
            const detail = e.detail || {};
            if (detail.id) updateUiState({ stationOverlay: detail.id });
        };

        window.addEventListener('keep_camera', handleKeepCamera);
        window.addEventListener('clearCameraOverride', handleClearCameraOverride);
        window.addEventListener('open_station', handleOpenStation);

        return () => {
            window.removeEventListener('keep_camera', handleKeepCamera);
            window.removeEventListener('clearCameraOverride', handleClearCameraOverride);
            window.removeEventListener('open_station', handleOpenStation);
        };
    }, [refs, updateUiState]);

    const hasPlayedIntroRef = React.useRef(false);
    useEffect(() => {
        hasPlayedIntroRef.current = false;
    }, [props.currentSector]);

    useEffect(() => {
        if (props.isGameRunning && !props.isPaused && !uiState.isSectorLoading) {
            const currentSector = refs.propsRef.current.currentSectorData;

            if (currentSector?.ambientLoop && !audioEngine.isMusicPlaying()) {
                audioEngine.playMusic(currentSector.ambientLoop);
            }

            if (currentSector?.intro && !hasPlayedIntroRef.current) {
                hasPlayedIntroRef.current = true;
                setTimeout(() => {
                    if (refs.isMounted.current) {
                        const introText = t(currentSector.intro!.text);
                        UIEventRingBuffer.pushString(UIEventType.CHAT_BUBBLE, `🧠 ${introText}`, currentSector.intro!.duration || 4000, refs.stateRef.current?.simTime || 0);
                        if (currentSector.intro!.sound) audioEngine.playSound(currentSector.intro!.sound as any);
                    }
                }, currentSector.intro.delay || 1500);
            }
        }
    }, [props.isGameRunning, props.isPaused, uiState.isSectorLoading, props.currentSector]);

    useImperativeHandle(ref, () => ({
        requestPointerLock: () => {
            if (refs.containerRef.current) refs.engineRef.current?.input.requestPointerLock(refs.containerRef.current);
        },
        getSectorStats,
        getMergedSessionStats: () => {
            const sessionStats = getSectorStats(false, false);
            return aggregateStats(latestStateRef.current.props.stats, sessionStats, false, false, latestStateRef.current.props.currentSector, 0);
        },
        triggerInput: (input: string | InputAction) => {
            const action = typeof input === 'string' ? INPUT_KEY_MAP[input] : input;
            if (action === undefined) return;

            switch (action) {
                case InputAction.INTERACT: HudStore.triggerMetaAction(MetaActionId.INTERACT_TAP); break;
                case InputAction.RELOAD: HudStore.triggerMetaAction(MetaActionId.RELOAD_TAP); break;
                case InputAction.SLOT_1: HudStore.triggerMetaAction(MetaActionId.WEAPON_SLOT_1); break;
                case InputAction.SLOT_2: HudStore.triggerMetaAction(MetaActionId.WEAPON_SLOT_2); break;
                case InputAction.SLOT_3: HudStore.triggerMetaAction(MetaActionId.WEAPON_SLOT_3); break;
                case InputAction.SLOT_4: HudStore.triggerMetaAction(MetaActionId.WEAPON_SLOT_4); break;
                case InputAction.SLOT_5: HudStore.triggerMetaAction(MetaActionId.WEAPON_SLOT_5); break;
                case InputAction.FLASHLIGHT: HudStore.triggerMetaAction(MetaActionId.TOGGLE_FLASHLIGHT); break;
                case InputAction.MAP: HudStore.triggerMetaAction(MetaActionId.TOGGLE_MAP); break;
                case InputAction.ESCAPE: HudStore.triggerMetaAction(MetaActionId.TOGGLE_PAUSE); break;
            }
        },
        rotateCamera: (dir: number) => refs.engineRef.current?.camera.adjustAngle(dir * (Math.PI / 4)),
        adjustPitch: (dir: number) => refs.engineRef.current?.camera.adjustPitch(dir * 2.0),
        getSystems: () => refs.gameSessionRef.current?.getSystems() ?? [],
        setSystemEnabled: (id: SystemID, enabled: boolean) => refs.gameSessionRef.current?.setSystemEnabled(id, enabled),
        spawnBoss: (type: string, pos?: THREE.Vector3) => refs.sectorContextRef.current?.spawnBoss(type, pos),
        spawnEnemies: (newEnemies: any[]) => {
            const enemies = refs.stateRef.current.enemies;
            const len = newEnemies.length;
            for (let i = 0; i < len; i++) {
                enemies.push(newEnemies[i]);
            }
        },
        respawnPlayer: () => {
            const engine = WinterEngine.getInstance();
            const state = refs.stateRef.current;
            const session = refs.gameSessionRef.current;
            if (session) {
                GameSessionSetup.respawnPlayer(session, engine, state, refs, props, (phase) => updateUiState({ deathPhase: phase }));
            }
        },
        restartSector: async () => {
            const currentSetupId = refs.setupIdRef.current;
            const ctx = setupContextRef.current;
            if (!ctx) return;
            await GameSessionSetup.restartSector(ctx, currentSetupId);
        },
    }), [getSectorStats, props, refs, updateUiState]);

    useEffect(() => {
        if (!refs.containerRef.current || refs.isMounted.current) return;
        refs.isMounted.current = true;

        const engine = WinterEngine.getInstance();
        const currentSetupId = ++refs.setupIdRef.current;

        engine.clearActiveScene(false);

        if (refs.playerGroupRef.current) {
            engine.scene.remove(refs.playerGroupRef.current);
            refs.playerGroupRef.current = null as any;
        }

        if (props.settings) engine.updateSettings(props.settings);

        engine.mount(refs.containerRef.current);
        refs.engineRef.current = engine;
        engine.input.enable();
        engine.input.onMetaAction = (actionId: MetaActionId) => {
            switch (actionId) {
                case MetaActionId.RESTART_SECTOR:
                    (ref as any).current?.restartSector();
                    break;
                case MetaActionId.QUIT_TO_MENU:
                    props.onSectorEnded({ aborted: true } as any);
                    break;
            }
        };

        engine.onUpdate = null;
        engine.onPreRender = null;
        engine.onRenderOverride = null;
        engine.onRender = null;

        const session = new GameSessionLogic(engine);
        if (refs.stateRef.current) session.init(refs.stateRef.current);
        refs.gameSessionRef.current = session;

        if (refs.playerGroupRef.current) {
            session.playerPos = refs.playerGroupRef.current.position;
            (session as any).playerGroup = refs.playerGroupRef.current;
        }

        engine.onUpdateContext = session;
        if (props.debugMode) (window as any).gameSession = session;

        const initSector = async () => {
            const ctx: SetupContext = {
                engine,
                session,
                state: refs.stateRef.current,
                props: props,
                refs: refs,
                ui: {
                    setIsSectorLoading: (val: boolean) => updateUiState({ isSectorLoading: val }),
                    setDeathPhase: (val: DeathPhase) => {
                        updateUiState({ deathPhase: val });
                        const pProps = latestStateRef.current.props;
                        if ((val === DeathPhase.MESSAGE || val === DeathPhase.CONTINUE) && pProps.onDeathStateChange) {
                            pProps.onDeathStateChange(true);
                        }
                    },
                    setBossIntroActive: (val: boolean) => {
                        updateUiState({ bossIntroActive: val });
                        if (latestStateRef.current.props.onBossIntroStateChange) latestStateRef.current.props.onBossIntroStateChange(val);
                    },
                    setBubbleTailPosition: (val: any) => updateUiState({ bubbleTailPosition: val }),
                    setCurrentLine: (val: any) => {
                        updateUiState({ currentLine: val });
                        refs.stateRef.current.currentLine = val;
                    },
                    setCinematicActive: (val: boolean) => {
                        updateUiState({ cinematicActive: val });
                        refs.stateRef.current.cinematicActive = val;
                        if (latestStateRef.current.props.onDialogueStateChange) latestStateRef.current.props.onDialogueStateChange(val);
                    },
                    setInteractionType: (val: any) => updateUiState({ interactionType: val }),
                    setFoundMember: (id: FamilyMemberID) => {
                        const name = DataResolver.getFamilyMemberName(id);
                        updateUiState({ foundMemberName: name });
                    },
                    setOverlay: (val: number | null) => {
                        if (latestStateRef.current.props.onInteractionStateChange) latestStateRef.current.props.onInteractionStateChange(val);
                    }
                },
                callbacks: {
                    t,
                    showDamageText,
                    onDiscovery: handleDiscovery,
                    setBubble: (text: string, duration?: number) => {
                        UIEventRingBuffer.pushString(UIEventType.CHAT_BUBBLE, text, duration || 3000, refs.stateRef.current?.simTime || 0);
                    },
                    spawnParticle: (x, y, z, type: FXParticleType, count, customMesh, customVel, color, scale) => {
                        FXSystem.spawnParticle(engine.scene, refs.stateRef.current.particles, x, y, z, type, count, customMesh, customVel, color, scale);
                    },
                    spawnDecal: (x, z, scale, material, type: FXDecalType = FXDecalType.DECAL) => {
                        FXSystem.spawnDecal(engine.scene, refs.stateRef.current.bloodDecals, x, z, scale, material, type);
                    },
                    onTrigger: (type: TriggerType, duration: number) => {
                        const state = refs.stateRef.current;
                        const simTime = refs.engineRef.current?.simTime || 0;
                        if (type === TriggerType.SPEAK) state.speakingUntil = simTime + duration;
                        else state.thinkingUntil = simTime + duration;
                        if (state.callbacks.onTrigger) state.callbacks.onTrigger(type, duration);
                    },
                    spawnHorde: (count: number, type: any, pos: any) => refs.sectorContextRef.current?.spawnHorde(count, type, pos),
                    playSound: (id: any) => audioEngine.playSound(id),
                    onAction: (action: any) => onAction(action),
                    startCinematic: (mesh: any, sectorId?: number, dialogueId?: number, params?: any) => {
                        refs.gameSessionRef.current?.startCinematic(mesh, sectorId ?? 0, dialogueId ?? 0, params);
                    },
                    playCinematicLine: (index: number) => {
                        refs.gameSessionRef.current?.playCinematicLine(index);
                    },
                    endCinematic: () => {
                        refs.gameSessionRef.current?.stopCinematic();
                    },
                    spawnZombie: (forcedType?: EnemyType, forcedPos?: THREE.Vector3) => {
                        const sectorData = (props as any).currentSectorData || SectorSystem.getSector(props.currentSector || 0);
                        const origin = (refs.playerGroupRef.current && refs.playerGroupRef.current.children.length > 0)
                            ? refs.playerGroupRef.current.position
                            : new THREE.Vector3(sectorData.playerSpawn.x || 0, 0, sectorData?.playerSpawn?.z || 0);
                        refs.sectorContextRef.current?.spawnZombie(forcedType as EnemyType, forcedPos || origin);
                    },
                    concludeSector,
                    gainXp,
                    gainSp,
                    gainScrap,
                    onSectorLoaded: props.onSectorLoaded,
                    collectedCluesRef: refs.collectedCluesRef,
                    setInteraction: (interaction: any) => {
                        const s = refs.stateRef.current;
                        if (interaction) {
                            s.interaction.active = true;
                            s.interaction.targetId = interaction.id;
                            s.interaction.type = interaction.type || InteractionType.SECTOR_SPECIFIC;
                            s.interaction.subType = interaction.subType || InteractionSubType.NONE;
                            s.interaction.label = interaction.label;
                            s.interaction.promptId = interaction.promptId || InteractionPromptId.INTERACT;
                            if (interaction.position) s.interactionTargetPos.copy(interaction.position);
                            s.hasInteractionTarget = true;
                        } else {
                            s.interaction.active = false;
                            s.interaction.promptId = InteractionPromptId.NONE;
                            s.hasInteractionTarget = false;
                        }
                    },
                    onBossKilled: (id: number) => {
                        audioEngine.stopMusic();
                        const pProps = latestStateRef.current.props;
                        const sectorData = pProps.currentSectorData || SectorSystem.getSector(pProps.currentSector || 0);
                        if (sectorData?.ambientLoop) audioEngine.playMusic(sectorData.ambientLoop);
                        gainSp(2);

                        // Current family member set to rescued
                        const currentFamilyMember = refs.familyMemberRef.current;
                        if (currentFamilyMember && !currentFamilyMember.rescued) {
                            currentFamilyMember.rescued = true;
                        }
                    }
                }
            };

            setupContextRef.current = ctx;
            await GameSessionSetup.runSectorSetup(ctx, currentSetupId);

            if (refs.isMounted.current && refs.setupIdRef.current === currentSetupId) {
                if (engine) {
                    engine.isRenderingPaused = false;
                    engine.isSimulationPaused = false;
                }
                updateUiState({ isSectorLoading: false });
            }
        };

        initSector();

        engine.onUpdate = createGameLoop({
            engine,
            session,
            state: refs.stateRef.current,
            refs,
            propsRef: refs.propsRef,
            callbacks: {
                concludeSector,
                spawnParticle,
                spawnDecal,
                showDamageText,
                t,
                onAction: (action: any) => setupContextRef.current?.callbacks.onAction(action),
                onDiscovery: handleDiscovery,
                onDeathStateChange: props.onDeathStateChange,
                onPlayerHit: (damage: number, attacker: any, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => {
                    const session = refs.gameSessionRef.current;
                    if (!session) return;
                    const statsSystem = session.getSystem<any>(SystemID.PLAYER_STATS);
                    if (statsSystem) {
                        statsSystem.handlePlayerHit(session, damage, attacker, damageType, damageSource, isDoT, effectType, duration, intensity, specificAttackType);
                    }
                },
                spawnZombie: (type: any, pos: any) => refs.sectorContextRef.current?.spawnZombie(type, pos),
                spawnHorde: (count: number, type: any, pos: any) => refs.sectorContextRef.current?.spawnHorde(count, type, pos),
                setBubble: (text: string, duration?: number) => {
                    UIEventRingBuffer.pushString(UIEventType.CHAT_BUBBLE, text, duration || 3000, refs.stateRef.current?.simTime || 0);
                },
                setInteraction: (interaction: any) => {
                    const s = refs.stateRef.current;
                    if (interaction) {
                        s.interaction.active = true;
                        s.interaction.targetId = interaction.id;
                        s.interaction.type = interaction.type;
                        s.interaction.label = interaction.label;
                        s.interaction.promptId = interaction.promptId || InteractionPromptId.INTERACT;
                        if (interaction.position) s.interactionTargetPos.copy(interaction.position);
                        s.hasInteractionTarget = true;
                    } else {
                        s.interaction.active = false;
                        s.interaction.promptId = InteractionPromptId.NONE;
                        s.hasInteractionTarget = false;
                    }
                },
                setOverlay: (type: number | null) => props.onInteractionStateChange?.(type),
                playSound: (id: any) => audioEngine.playSound(id),
                playTone: (freq: number, type: any, duration: number, vol?: number) => (audioEngine as any).playTone?.(freq, type, duration, vol),
                cameraShake: (amount: number, type?: any) => engine.camera.shake(amount, type || 'general'),
                startCinematic: (target: any, sectorId: number, dialogueId?: number, params?: any) => {
                    refs.gameSessionRef.current?.startCinematic(target, sectorId, dialogueId ?? 0, params);
                },
                setCameraOverride: (params: any) => {
                    refs.cameraOverrideRef.current = params;
                },
                makeNoise: (pos: any, type: any, radius?: number) => session.makeNoise(pos, type, radius || 10),
                gainXp,
                gainSp,
                gainScrap
            }
        });

        return () => {
            refs.isMounted.current = false;
            const finalSetupId = ++refs.setupIdRef.current;

            if (refs.engineRef.current) {
                const engine = refs.engineRef.current;
                engine.onUpdate = null;
                engine.onUpdateContext = null;

                if (refs.gameSessionRef.current) {
                    GameSessionSetup.disposeSector(refs.gameSessionRef.current, refs.stateRef.current);
                }
            }
        };
    }, [props.currentSector]);

    // Environmental Sync 
    useEffect(() => {
        if (!props.isWarmup && refs.engineRef.current) {
            const engine = refs.engineRef.current;
            const sector = SectorSystem.getSector(props.currentSector);

            if (!sector) {
                console.warn(`[GameSession] Environmental sync deferred: Sector ${props.currentSector} not yet in cache.`);
                return;
            }

            const env = sector.environment;
            const overrides = props.environmentOverrides?.[props.currentSector];

            if (env) {
                if (env.wind || overrides?.windStrength !== undefined) {
                    const dir = (overrides as any)?.wind?.direction || env.wind?.direction || WIND_SYSTEM.DIRECTION;
                    const windAngle = overrides?.windDirection ?? Math.atan2(dir.z, dir.x);
                    engine.wind.setRandomWind(
                        overrides?.windStrength ?? env.wind?.strengthMin ?? WIND_SYSTEM.MIN_STRENGTH,
                        overrides?.windStrength ?? env.wind?.strengthMax ?? WIND_SYSTEM.MAX_STRENGTH,
                        windAngle,
                        env.wind?.angleVariance || WIND_SYSTEM.ANGLE_VARIANCE
                    );
                } else {
                    engine.wind.setRandomWind(WIND_SYSTEM.MIN_STRENGTH, WIND_SYSTEM.MAX_STRENGTH);
                }

                if (engine.weather) {
                    const weatherType = overrides?.weather?.type || env?.weather?.type || (typeof props?.weather === 'string' ? props.weather : 'none');
                    const requestedParticles = overrides?.weather?.particles || env?.weather?.particles || WEATHER_SYSTEM.DEFAULT_NUM_PARTICLES;
                    const finalWeatherCount = Math.max(0, Math.min(requestedParticles, WEATHER_SYSTEM.MAX_NUM_PARTICLES));
                    engine.weather.sync(weatherType, finalWeatherCount, 120);
                }
            }
        }
    }, [props.isWarmup, props.currentSector, props.environmentOverrides, props.weather, refs]);

    return (
        <>
            <GameSessionUI refs={refs} uiState={uiState} gameProps={props} callbacks={uiCallbacks} />
        </>
    );
});

export default GameSession;