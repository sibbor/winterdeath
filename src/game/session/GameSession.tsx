import React, { useEffect, useImperativeHandle, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { GameCanvasProps } from '../../types/CanvasTypes';
import { SectorStats } from '../../types/StateTypes';
import { WinterEngine } from '../../core/engine/WinterEngine';
import { GameSessionLogic } from './GameSessionLogic';
import { InputAction, INPUT_KEY_MAP } from '../../core/engine/InputManager';
import { audioEngine } from '../../utils/audio/AudioEngine';
import { UISounds, WeaponSounds } from '../../utils/audio/AudioLib';
import { SoundID, MusicID } from '../../utils/audio/AudioTypes';
import { t } from '../../utils/i18n';
import { WEATHER_SYSTEM, WIND_SYSTEM, FamilyMemberID } from '../../content/constants';
import { useGameSessionUiState } from './useGameSessionState';
import { GameSessionSetup, SetupContext } from './GameSessionSetup';
import { createGameLoop } from './GameSessionLoop';
import { GameSessionUI } from './GameSessionUI';
import { FXSystem } from '../../systems/FXSystem';
import { aggregateStats } from '../../game/progression/ProgressionManager';
import { SectorSystem } from '../../systems/SectorSystem';
import { HudStore } from '../../store/HudStore';
import { EnemyType } from '../../entities/enemies/EnemyTypes';
import { StatID } from '../../types/CareerStats';
import { StatsBridge } from '../../core/data/StatsBridge';
import { DataResolver } from '../../core/data/DataResolver';
import { TriggerType, TriggerActionType } from '../../types/TriggerTypes';
import { BossID } from './SectorTypes';
import { OverlayType, DiscoveryType } from '../../components/ui/hud/game/HudTypes';
import { PERKS, PerkCategory } from '../../content/perks';
import { GameScreen, DeathPhase } from '../../types/SessionTypes';
import { FXParticleType, FXDecalType } from '../../types/FXTypes';
import { SystemID } from '../../systems/SystemID';
import { DamageID, DamageType, EnemyAttackType } from '../../entities/player/CombatTypes';
import { StatusEffectID } from '../../types/StatusEffects';
import { UIEventRingBuffer, UIEventType } from '../../systems/ui/UIEventRingBuffer';
import { useUIEventBridge } from '../../hooks/useUIEventBridge';
import { CombatEngine } from './CombatEngine';
import { UIEventBridge, InteractionType, InteractionSubType, InteractionPromptId, MetaActionId } from '../../systems/ui/UIEventBridge';

export interface GameSessionHandle {
    requestPointerLock: () => void;
    getSectorStats: (isCompleted?: boolean, aborted?: boolean) => SectorStats;
    triggerInput: (key: string) => void;
    rotateCamera: (dir: number) => void;
    adjustPitch: (dir: number) => void;
    getSystems: () => { id: string; enabled: boolean }[];
    setSystemEnabled: (id: string, enabled: boolean) => void;
    getMergedSessionStats: () => any;
    spawnBoss: (type: number, pos?: THREE.Vector3) => any;
    spawnEnemies: (newEnemies: any[]) => void;
    respawnPlayer: (atBoss?: boolean) => void;
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

    // --- CORE CALLBACKS ---
    const spawnParticle = useCallback((x: number, y: number, z: number, type: FXParticleType, count: number, customMesh?: any, customVel?: any, color?: number, scale?: number) => {
        const engine = refs.engineRef.current;
        if (engine) FXSystem.spawnParticle(engine.scene, refs.stateRef.current.combat.particles, x, y, z, type, count, customMesh, customVel, color, scale);
    }, [refs]);

    const spawnDecal = useCallback((x: number, z: number, scale: number, material?: any, type: FXDecalType = FXDecalType.DECAL) => {
        const engine = refs.engineRef.current;
        if (engine) FXSystem.spawnDecal(engine.scene, refs.stateRef.current.world.bloodDecals, x, z, scale, material, type);
    }, [refs]);

    const showDamageText = useCallback((x: number, y: number, z: number, text: string, color?: number) => {
        const session = refs.gameSessionRef.current;
        if (session) {
            const damageSystem = session.systems.damageNumber;
            if (damageSystem) damageSystem.spawn(x, y, z, text, color);
        }
    }, [refs]);

    const getSectorStats = useCallback((isCompleted: boolean = false, aborted: boolean = false): SectorStats => {
        const engine = WinterEngine.getInstance();
        const state = refs.stateRef.current;

        if (!state.sessionStats) return ({} as SectorStats);

        // Zero-GC: Breakdown objects and lists are already in sessionStats
        const stats = state.sessionStats;
        stats.isCompleted = isCompleted;
        stats.aborted = aborted;
        stats.timeElapsed = engine.simTime / 1000;
        stats.timePlayed = stats.timeElapsed;
        stats.accuracy = (stats.shotsFired > 0 ? (stats.shotsHit / stats.shotsFired) : 1) * 100;
        stats.distanceTraveled = refs.distanceTraveledRef.current;

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

    const endSector = useCallback((isCompleted: boolean) => {
        if (!refs.hasEndedSector.current) {
            refs.hasEndedSector.current = true;
            if (isCompleted) {
                refs.stateRef.current.world.familyRescued = true;
                audioEngine.stopAmbience();
                audioEngine.setReverb(0);
            }
            latestStateRef.current.props.onSectorEnded(getSectorStats(isCompleted));
        }
    }, [getSectorStats, refs]);

    const setBubble = useCallback((text: string, duration?: number) => {
        UIEventRingBuffer.pushString(UIEventType.CHAT_BUBBLE, text, duration, refs.gameSessionRef.current?.state.simTime || 0);
    }, []);

    const rewardXP = useCallback((amount: number) => {
        const session = refs.gameSessionRef.current;
        if (!session) return;

        const state = session.state;
        if (state.isPlayground) return;

        const statsBuffer = state.player.statsBuffer;

        // Telemetry
        state.sessionStats.xpGained += amount;

        // --- DOD Progression Fix: Zero-GC ---
        statsBuffer[StatID.SCORE] += amount;
        statsBuffer[StatID.CURRENT_XP] += amount;
        statsBuffer[StatID.XP] += amount;

        let levelUps = 0;
        const maxLevel = 100;

        // Process level-ups in a single pass
        while (statsBuffer[StatID.CURRENT_XP] >= statsBuffer[StatID.NEXT_LEVEL_XP] && statsBuffer[StatID.LEVEL] < maxLevel) {
            statsBuffer[StatID.CURRENT_XP] -= statsBuffer[StatID.NEXT_LEVEL_XP];
            statsBuffer[StatID.LEVEL]++;
            statsBuffer[StatID.SKILL_POINTS]++;
            statsBuffer[StatID.NEXT_LEVEL_XP] = Math.max(100, Math.floor(statsBuffer[StatID.NEXT_LEVEL_XP] * 1.2));
            levelUps++;
        }

        UIEventRingBuffer.push(UIEventType.XP_GAIN, amount, 0, state.simTime);

        // Level up
        if (levelUps > 0) {
            UIEventRingBuffer.push(UIEventType.LEVEL_UP, statsBuffer[StatID.LEVEL], levelUps, state.simTime);
        }
    }, [refs]);

    const rewardSP = useCallback((amount: number) => {
        const session = refs.gameSessionRef.current;
        if (!session || session.state.isPlayground) return;

        session.state.sessionStats.spGained += amount;
        session.state.player.statsBuffer[StatID.SKILL_POINTS] += amount;
        UIEventRingBuffer.push(UIEventType.SP_GAIN, amount, 0, session.state.simTime);
    }, [refs]);

    const rewardScrap = useCallback((amount: number) => {
        const session = refs.gameSessionRef.current;
        if (!session || session.state.isPlayground) return;

        session.state.sessionStats.scrapLooted += amount;

        const statsBuffer = session.state.player.statsBuffer;
        statsBuffer[StatID.SCRAP] += amount;
        statsBuffer[StatID.TOTAL_SCRAP_COLLECTED] += amount;
        UIEventRingBuffer.push(UIEventType.SCRAP_GAIN, amount, 0, session.state.simTime);
    }, [refs]);

    // --- PAUSE & RENDER LOOP SYNCHRONIZATION ---
    useEffect(() => {
        const engine = refs.engineRef.current;
        if (!engine) return;

        // Synchronize core simulation ticks directly with the pause condition flag
        engine.isSimulationPaused = props.isPaused;

        if (props.isPaused) {
            // Hard-disable engine input processing to prevent stray state mutations underneath
            engine.input?.disable();

            // Check against target screen states using the validated props path:
            const currentScreen = props.gameState?.screen;
            if (currentScreen === GameScreen.SECTOR || currentScreen === GameScreen.RECAP) {
                engine.isRenderingPaused = true;
            } else {
                engine.isRenderingPaused = false;
            }
        } else {
            // Restore visual rendering layers and wake up the input pipeline context safely
            engine.isRenderingPaused = false;
            if (props.isGameRunning) {
                engine.input?.enable();
            }
        }
    }, [props.isPaused, props.isGameRunning, props.gameState?.screen, refs]);

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
                if (payload.scrap) rewardScrap(payload.scrap);
                if (payload.xp) rewardXP(payload.xp);
                if (payload.sp) rewardSP(payload.sp);
                if (payload.amount) {
                    // Generic amount treated as HP if not otherwise specified
                    const hp = state.player.statsBuffer[StatID.HP];
                    const maxHp = state.player.statsBuffer[StatID.MAX_HP];
                    state.player.statsBuffer[StatID.HP] = Math.min(maxHp, hp + payload.amount);
                }
                // TODO: Add distinct sound effects:
                // UISounds.playXP();
                // UISounds.playScrap();
                // UISounds.playSP();
                break;
            }

            case TriggerActionType.APPLY_EFFECT: {
                const perkSystem = refs.gameSessionRef.current?.systems.perkSystem;
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
                        const session = refs.gameSessionRef.current;
                        if (session) {
                            let dmgId = DamageID.OTHER;
                            let dmgType = DamageType.PHYSICAL;
                            switch (effectId) {
                                case StatusEffectID.BURNING: dmgId = DamageID.BURN; dmgType = DamageType.BURN; break;
                                case StatusEffectID.BLEEDING: dmgId = DamageID.BLEED; dmgType = DamageType.BLEED; break;
                                case StatusEffectID.ELECTRIFIED: dmgId = DamageID.ELECTRIC; dmgType = DamageType.ELECTRIC; break;
                                case StatusEffectID.FREEZING: dmgId = DamageID.FROST; dmgType = DamageType.FROST; break;
                                case StatusEffectID.DROWNING: dmgId = DamageID.DROWNING; dmgType = DamageType.DROWNING; break;
                            }

                            CombatEngine.handlePlayerHit(
                                session,
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
                        refs.SectorBuildContextRef.current?.spawnZombie(payload.type, _spawnPosScratch);
                    }
                }
                break;
            }

            case TriggerActionType.SPAWN_BOSS: {
                const bossId = payload.bossId !== undefined ? payload.bossId
                    : payload.id !== undefined ? payload.id
                        : BossID.NONE;
                const bossPos = payload.pos;

                if (state.ui.cinematicActive) {
                    console.log("[GameSession] Cinematic is active, deferring boss spawn:", bossId);
                    refs.pendingBossSpawnRef.current = { bossId, pos: bossPos };
                } else {
                    UIEventRingBuffer.push(UIEventType.SPAWN_BOSS, bossId, 0, state.simTime);
                }
                break;
            }

            case TriggerActionType.FAMILY_MEMBER_FOLLOW: {
                UIEventRingBuffer.push(UIEventType.FAMILY_FOLLOW, 1, 0, state.simTime);

                // Reward 2 SP the first time a family member follows the player this sector
                if (!latestStateRef.current.props.familyAlreadyRescued) {
                    rewardSP(2);
                }
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
                    const perkSystem = refs.gameSessionRef.current?.systems.perkSystem;
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
                    const sectorData = props.currentSectorData || (window as any).SectorSystem?.getSector(props.gameState.currentSector || 0);
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

                // Cinematic
                const cinematic = refs.gameSessionRef.current?.systems.cinematic;
                if (cinematic && refs.gameSessionRef.current) {
                    const sectorId = payload.sectorId !== undefined ? payload.sectorId : props.gameState.currentSector;
                    cinematic.startCinematic(refs.gameSessionRef.current, target, sectorId, payload.dialogueId, payload);
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

            // TODO: Implement support for zombies waves
            case TriggerActionType.START_WAVE: {
                break;
            }

            case TriggerActionType.END_SECTOR: {
                endSector(payload?.isCompleted ?? false);
                break;
            }

            default: {
                // ZERO-GC: No string fallback. Use SET_SECTOR_FLAG for custom flags.
                break;
            }
        }
    }, [endSector, rewardXP, props.currentSectorData, props.familyAlreadyRescued, refs, setBubble, rewardSP]);

    // PERFORMANCE: Instance-bound lock to protect SMI type boundaries across fast layout shifts.
    // This allows unique event types to queue up in the Ring Buffer while strictly killing frame-perfect duplicates.
    const activeDiscoveryTriggersRef = useRef<Set<string>>(new Set());

    const handleDiscovery = useCallback((type: DiscoveryType, id: any, titleKey: string = '', detailsKey: string = '', payload?: any, fromBridge: boolean = false) => {
        // Create a completely unique string token for this specific event boundary (e.g., "2-10000")
        const discoveryKey = `${type}-${id}`;

        console.log(`[GameSession] handleDiscovery Triggered for: ${type}, ID: ${id}`);

        // Deterministic Early Return Gate if this specific item is already active/queued
        if (activeDiscoveryTriggersRef.current.has(discoveryKey)) {
            console.log(`[GameSession] handleDiscovery BLOCKED duplicate trigger for key: ${discoveryKey}`);
            return;
        }

        const state = refs.stateRef.current;
        const currentProps = latestStateRef.current.props;
        if (!state || !state.sessionStats || !state.careerStats) return;

        const career = state.careerStats;
        const sector = state.currentSector || 0;
        let isNewDiscovery = false;

        titleKey = titleKey || payload?.titleKey || '';
        detailsKey = detailsKey || payload?.detailsKey || '';

        // 1. Perform strict DOD buffer mutations via safe abstraction layer checks
        switch (type) {
            case DiscoveryType.ZOMBIE: {
                const enemyId = Number(id);
                if (fromBridge || (career.discoveredZombies && career.discoveredZombies[enemyId] !== 1)) {
                    if (career.discoveredZombies) career.discoveredZombies[enemyId] = 1;
                    isNewDiscovery = true;
                    if (currentProps.onEnemyDiscovered) currentProps.onEnemyDiscovered(enemyId);
                }
                break;
            }

            case DiscoveryType.BOSS: {
                const bossId = Number(id);
                if (fromBridge || (career.discoveredBosses && career.discoveredBosses[bossId] !== 1)) {
                    if (career.discoveredBosses) career.discoveredBosses[bossId] = 1;
                    isNewDiscovery = true;
                    if (currentProps.onBossDiscovered) currentProps.onBossDiscovered(bossId);
                }
                break;
            }

            case DiscoveryType.COLLECTIBLE: {
                const colSmi = DataResolver.resolveCollectibleID(id);
                if (colSmi !== undefined) {
                    const strId = DataResolver.resolveCollectibleId(colSmi);
                    if (fromBridge || (career.discoveredCollectibles && career.discoveredCollectibles[colSmi] !== 1)) {
                        if (career.discoveredCollectibles) career.discoveredCollectibles[colSmi] = 1;
                        isNewDiscovery = true;
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
                    if (fromBridge || (career.discoveredPois && career.discoveredPois[poiSmi] !== 1)) {
                        if (career.discoveredPois) career.discoveredPois[poiSmi] = 1;
                        isNewDiscovery = true;
                        if (currentProps.onPOIdiscovered) currentProps.onPOIdiscovered(payload || strId);
                    }
                }
                break;
            }

            case DiscoveryType.PERK: {
                const perkId = Number(id);
                if (fromBridge || (career.discoveredPerks && career.discoveredPerks[perkId] === 0)) {
                    if (career.discoveredPerks) career.discoveredPerks[perkId] = 1;
                    isNewDiscovery = true;
                    if (currentProps.onPerkDiscovered) currentProps.onPerkDiscovered(perkId);
                }
                break;
            }

            case DiscoveryType.CLUE:
            default: {
                const clueSmi = DataResolver.resolveClueID(id);
                if (clueSmi !== undefined) {
                    const strId = DataResolver.resolveClueId(clueSmi);
                    if (fromBridge || (career.discoveredClues && career.discoveredClues[clueSmi] !== 1)) {
                        if (career.discoveredClues) career.discoveredClues[clueSmi] = 1;
                        isNewDiscovery = true;
                        if (currentProps.onClueDiscovered) currentProps.onClueDiscovered(payload || { id: strId, content: detailsKey });
                    }
                }
                break;
            }
        }

        // 2. Patch reactive UI counters inside HudStore if a brand new log was registered
        if (isNewDiscovery) {
            // Lock this specific unique event token on the current frame execution
            activeDiscoveryTriggersRef.current.add(discoveryKey);

            const hudState = HudStore.getState();

            if (type === DiscoveryType.CLUE) HudStore.patch({ discoveredCluesCount: hudState.discoveredCluesCount + 1 });
            else if (type === DiscoveryType.POI) HudStore.patch({ discoveredPoisCount: hudState.discoveredPoisCount + 1 });
            else if (type === DiscoveryType.COLLECTIBLE) HudStore.patch({ discoveredCollectiblesCount: hudState.discoveredCollectiblesCount + 1 });

            // 3. Process sound effects, prepare flat text layouts and cache payload for the bridge
            if (currentProps.settings?.showDiscoveryPopups !== false) {
                // Extract dynamic progression data via StatsBridge layer and max capacity ceilings from DataResolver
                const currentProgress = StatsBridge.getSectorDiscoveryCount(career, sector, type);
                const maxProgress = DataResolver.getSectorMaxCapacity(sector, type);

                // Pre-bake localized item details/names right on the CPU loop execution thread
                let displayTitle = t(titleKey || DataResolver.getDiscoveryTitle(type));
                let resolvedDetails = '';

                switch (type) {
                    case DiscoveryType.CLUE:
                        resolvedDetails = t(detailsKey || DataResolver.getClueTitle(id));
                        break;
                    case DiscoveryType.COLLECTIBLE:
                        resolvedDetails = t(detailsKey || DataResolver.getCollectibleName(id));
                        break;
                    case DiscoveryType.POI:
                        resolvedDetails = t(detailsKey || DataResolver.getPoiName(id));
                        break;
                    case DiscoveryType.ZOMBIE:
                        resolvedDetails = t(detailsKey || DataResolver.getZombieName(Number(id)));
                        break;
                    case DiscoveryType.BOSS:
                        resolvedDetails = t(detailsKey || DataResolver.getBossName(Number(id)));
                        break;
                    case DiscoveryType.PERK:
                        const perk = DataResolver.getPerks()[Number(id)];
                        const catKey = DataResolver.getPerkCategoryKey(perk?.category);
                        resolvedDetails = `${t(catKey)}: ${t(detailsKey || perk?.displayName)}`;
                        break;
                }

                // Force convert ID to integer primitive to protect SMI type boundaries inside the Ring Buffer
                const numericId = typeof id === 'number' ? id : Number(id) || 0;

                // Register presentation block cleanly into the cache layer
                DataResolver.registerPresentationPayload(
                    numericId,
                    type,
                    resolvedDetails || displayTitle,
                    currentProgress,
                    maxProgress,
                    isNewDiscovery
                );

                // Drop pure primitives into the Ring Buffer thread boundary pass-through
                UIEventRingBuffer.push(UIEventType.DISCOVERY, numericId, type, state.simTime);

                // Clear the lock for this specific token after the transition window has elapsed
                setTimeout(() => {
                    activeDiscoveryTriggersRef.current.delete(discoveryKey);
                }, 500);
            } else {
                // If popups are globally muted, release the instance lock immediately
                activeDiscoveryTriggersRef.current.delete(discoveryKey);
            }
        }
    }, [refs, t]);

    const uiCallbacks = React.useMemo(() => ({
        onContinue: () => {
            const { uiState: currentUi, props: currentProps } = latestStateRef.current;
            if (currentUi.deathPhase === DeathPhase.CONTINUE) {
                updateUiState({ deathPhase: DeathPhase.FADEOUT });
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
            UIEventBridge.triggerUiAction(MetaActionId.TOGGLE_MAP);
            return true;
        },
        onPauseToggle: (val: boolean) => latestStateRef.current.props.onPauseToggle(val),
        requestPointerLock: () => refs.engineRef.current?.input.requestPointerLock(refs.containerRef.current!),
        triggerCinematicNext: () => {
            const wasTyping = refs.dialogueRef.current?.finishTyping();
            if (!wasTyping) {
                const sys = refs.gameSessionRef.current?.systems.cinematic;
                if (sys && sys.cinematicRef.current.active) {
                    sys.playLine(sys.cinematicRef.current.lineIndex + 1);
                }
            }
        },
        saveArmory: (newLoadout: any, newLevels: any, newSectorState: any) => {
            const currentProps = latestStateRef.current.props;
            if (currentProps.onUpdateLoadout) currentProps.onUpdateLoadout(newLoadout, newLevels);
            refs.stateRef.current.gameState.loadout = newLoadout;
            refs.stateRef.current.gameState.weaponLevels = newLevels;
            refs.stateRef.current.sectorState = { ...refs.stateRef.current.sectorState, ...newSectorState };

            for (const key in refs.stateRef.current.combat.weaponAmmo) {
                const wepType = key as any;
                refs.stateRef.current.combat.weaponAmmo[wepType] = DataResolver.getWeapons()[wepType]?.magSize || 0;
            }
            closeModal();
            UISounds.playConfirm();
        },
        spawnEnemies: (newEnemies: any[]) => {
            const enemies = refs.stateRef.current.enemies.pool;
            const len = newEnemies.length;
            for (let i = 0; i < len; i++) {
                enemies.push(newEnemies[i]);
            }
        },
        saveSkills: (newStats: any, newSectorState: any) => {
            const currentProps = latestStateRef.current.props;
            if (currentProps.onSaveStats) currentProps.onSaveStats(newStats);
            const sb = refs.stateRef.current.player.statsBuffer;
            sb[StatID.HP] = newStats.maxHp;
            sb[StatID.MAX_HP] = newStats.maxHp;
            sb[StatID.STAMINA] = newStats.maxStamina;
            sb[StatID.MAX_STAMINA] = newStats.maxStamina;
            refs.stateRef.current.sectorState = { ...refs.stateRef.current.sectorState, ...newSectorState };
            closeModal();
        },
        changeEnvironment: (weather: any, overrides: any) => {
            const currentProps = latestStateRef.current.props;
            refs.stateRef.current.sectorState.envOverride = overrides;
            if (refs.engineRef.current) refs.engineRef.current.weather.sync(weather, 1000);
            if (currentProps.onEnvironmentOverrideChange) currentProps.onEnvironmentOverrideChange(overrides, weather);
        },
        setBubble,
        spawnZombie: (type: number, pos: THREE.Vector3) => {
            refs.SectorBuildContextRef.current?.spawnZombie(type, pos);
        },
        onAction,
        rewardXP
    }), [closeModal, rewardXP, onAction, refs, setBubble, updateUiState]);

    const handleUIEvent = useCallback((type: UIEventType, p1: any, p2: number) => {
        switch (type) {
            case UIEventType.LEVEL_UP: {
                audioEngine.playSound(SoundID.LEVEL_UP);
                break;
            }

            case UIEventType.SPAWN_BOSS: {
                console.log("GameSession.handleEvent() -> UIEventType.SPAWN_BOSS");

                const sectorData = props.currentSectorData || SectorSystem.getSector(props.gameState.currentSector || 0);
                const defaultBoss = sectorData?.bossId !== undefined ? sectorData.bossId : (props.gameState.currentSector || 0);
                const bossType = (p1 !== BossID.NONE && p1 !== undefined) ? p1 : defaultBoss;
                const pos = sectorData?.bossSpawn || _spawnPosScratch.set(0, 0, 0);

                const boss = refs.SectorBuildContextRef.current?.spawnBoss(bossType, pos);
                if (boss) {
                    const engineInst = WinterEngine.getInstance();
                    refs.bossIntroRef.current = {
                        active: true,
                        bossMesh: boss.mesh,
                        startTime: engineInst.renderTime,
                        startPos: new THREE.Vector3().copy(engineInst.camera.position),
                        startLookAt: new THREE.Vector3().copy(engineInst.camera.lookAtTarget)
                    };

                    if (refs.engineRef.current) {
                        refs.engineRef.current.camera.setCinematic(true);
                    }

                    const bossNameKey = boss.bossId !== undefined && boss.bossId !== BossID.NONE ? DataResolver.getBossName(boss.bossId) : 'ui.boss';
                    const bossName = t(bossNameKey);
                    updateUiState({
                        bossName: bossName
                    });

                    // Trigger UI state change via context callback to alert App.tsx
                    setupContextRef.current?.ui.setBossIntroActive(true);

                    // TODO: play boss fight music instead
                    //audioEngine.playSound(SoundID.ZOMBIE_GROWL_TANK);

                    if (refs.bossIntroTimerRef.current) clearTimeout(refs.bossIntroTimerRef.current);
                    refs.bossIntroTimerRef.current = setTimeout(() => {
                        refs.bossIntroRef.current.active = false;
                        setupContextRef.current?.ui.setBossIntroActive(false);

                        if (refs.engineRef.current) {
                            refs.engineRef.current.camera.setCinematic(false);
                        }

                        // Boss Music
                        audioEngine.stopMusic();
                        audioEngine.playMusic(MusicID.BOSS_FIGHT);
                        //const currentProps = latestStateRef.current.props;
                        //const sectorData = (currentProps as any).currentSectorData || { environment: { bossMusic: MusicID.BOSS_FIGHT } };
                        //audioEngine.playMusic(sectorData.environment.bossMusic || MusicID.BOSS_FIGHT);

                        // Start looping growl sound during the fight
                        //refs.bossGrowlLoopIndexRef.current = audioEngine.playLoop(SoundID.ZOMBIE_GROWL_TANK, 0.35);
                    }, 3000);
                }
                break;
            }

            case UIEventType.FAMILY_FOLLOW: {
                console.log("GameSession.handleEvent() -> UIEventType.FAMILY_FOLLOW");

                const active = p1 === 1;
                const fms = refs.activeFamilyMembers.current;
                const len = fms.length;
                for (let i = 0; i < len; i++) {
                    if (fms[i].found) fms[i].following = active;
                }
                break;
            }

            case UIEventType.FAMILY_FOUND: {
                console.log("GameSession.handleEvent() -> UIEventType.FAMILY_FOUND");
                const targetId = p1;
                const fms = refs.activeFamilyMembers.current;
                const len = fms.length;

                let newFamilyMemberFound = false;

                for (let i = 0; i < len; i++) {
                    const fm = fms[i];
                    if (fm.id === targetId) {
                        fm.found = true;
                        fm.following = true;
                        newFamilyMemberFound = true;
                    }
                }

                if (newFamilyMemberFound && refs.gameSessionRef.current) {
                    console.log("GameSession.handleEvent() -> UIEventType.FAMILY_FOUND: update passives");
                    const perkSystem = refs.gameSessionRef.current.systems.perkSystem;
                    if (perkSystem) perkSystem.refreshBaseStats(refs.gameSessionRef.current);

                    // Set checkpoint at player position when family member starts following
                    const playerPos = refs.playerGroupRef.current?.position;
                    const session = refs.gameSessionRef.current;
                    if (playerPos && session && session.state) {
                        session.state.checkpoint.x = playerPos.x;
                        session.state.checkpoint.y = playerPos.y;
                        session.state.checkpoint.z = playerPos.z;
                        session.state.checkpoint.active = true;
                        session.state.checkpoint.familyMemberId = targetId;
                        console.log("Saved checkpoint at:", playerPos.x, playerPos.y, playerPos.z, "for familyId:", targetId);
                    }
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
    }, [handleDiscovery, props.gameState.currentSector, props.currentSectorData, refs, updateUiState]);

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
    }, [props.gameState.currentSector]);

    useEffect(() => {
        // TODO: FIX NO MUSIC PLAYING
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
    }, [props.isGameRunning, props.isPaused, uiState.isSectorLoading, props.gameState.currentSector]);

    useImperativeHandle(ref, () => ({
        requestPointerLock: () => {
            if (refs.containerRef.current) refs.engineRef.current?.input.requestPointerLock(refs.containerRef.current);
        },
        getSectorStats,
        getMergedSessionStats: () => {
            const sessionStats = getSectorStats(false, false);
            return aggregateStats(latestStateRef.current.props.gameState.stats, sessionStats, false, false, latestStateRef.current.props.gameState.currentSector);
        },
        triggerInput: (input: string | InputAction) => {
            const action = typeof input === 'string' ? INPUT_KEY_MAP[input] : input;
            if (action === undefined) return;

            // Direct mapping to unified MetaActionId navigation pipelines
            switch (action) {
                case InputAction.INTERACT:
                    UIEventBridge.signalEngineEvent(MetaActionId.INTERACT_TAP);
                    break;
                case InputAction.RELOAD:
                    UIEventBridge.signalEngineEvent(MetaActionId.RELOAD_TAP);
                    break;
                case InputAction.SLOT_1: UIEventBridge.signalEngineEvent(MetaActionId.WEAPON_SLOT_1); break;
                case InputAction.SLOT_2: UIEventBridge.signalEngineEvent(MetaActionId.WEAPON_SLOT_2); break;
                case InputAction.SLOT_3: UIEventBridge.signalEngineEvent(MetaActionId.WEAPON_SLOT_3); break;
                case InputAction.SLOT_4: UIEventBridge.signalEngineEvent(MetaActionId.WEAPON_SLOT_4); break;
                case InputAction.SLOT_5: UIEventBridge.signalEngineEvent(MetaActionId.WEAPON_SLOT_5); break;
                case InputAction.FLASHLIGHT: UIEventBridge.signalEngineEvent(MetaActionId.TOGGLE_FLASHLIGHT); break;
                case InputAction.MAP:
                    UIEventBridge.signalEngineEvent(MetaActionId.NAV_MAP);
                    break;
                case InputAction.ESCAPE:
                    UIEventBridge.signalEngineEvent(MetaActionId.NAV_BACK);
                    break;
            }
        },
        rotateCamera: (dir: number) => refs.engineRef.current?.camera.adjustAngle(dir * (Math.PI / 4)),
        adjustPitch: (dir: number) => refs.engineRef.current?.camera.adjustPitch(dir * 2.0),
        getSystems: () => refs.gameSessionRef.current?.getSystems() ?? [],
        setSystemEnabled: (id: SystemID, enabled: boolean) => refs.gameSessionRef.current?.setSystemEnabled(id, enabled),
        spawnBoss: (type: string, pos?: THREE.Vector3) => refs.SectorBuildContextRef.current?.spawnBoss(type, pos),
        spawnEnemies: (newEnemies: any[]) => {
            const enemies = refs.stateRef.current.enemies.pool;
            const len = newEnemies.length;
            for (let i = 0; i < len; i++) {
                enemies.push(newEnemies[i]);
            }
        },
        respawnPlayer: (atBoss?: boolean) => {
            const engine = WinterEngine.getInstance();
            const state = refs.stateRef.current;
            const session = refs.gameSessionRef.current;
            if (session) {
                if (atBoss !== undefined) {
                    if (!atBoss && state.checkpoint) {
                        state.checkpoint.active = false;
                    } else if (atBoss) {
                        if (!state.checkpoint) state.checkpoint = { active: true, x: 0, y: 0, z: 0 };
                        state.checkpoint.active = true;

                        const sectorData = (props as any).currentSectorData || SectorSystem.getSector(props.gameState.currentSector || 0);
                        if (sectorData && sectorData.bossSpawn) {
                            state.checkpoint.x = sectorData.bossSpawn.x;
                            state.checkpoint.y = sectorData.bossSpawn.y || 0;
                            state.checkpoint.z = sectorData.bossSpawn.z;
                        }
                    }
                }
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

        if (props.gameState.settings) engine.updateSettings(props.gameState.settings);

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

        /*
        if (refs.playerGroupRef.current) {
            session.playerPos = refs.playerGroupRef.current.position;
            (session as any).playerGroup = refs.playerGroupRef.current;
        }
        */

        engine.onUpdateContext = session;
        if (props.gameState.settings.debugMode) (window as any).gameSession = session;

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

                        const hData = HudStore.getState();

                        if (val) {
                            hData.cinematicActive = true;
                            hData.dialogueActive = true;
                            hData.dialogueSpeaker = val.speaker !== undefined ? val.speaker : '';
                            hData.dialogueText = val.text || '';
                        } else {
                            // Om val är null städar vi bort dialogen
                            hData.dialogueActive = false;
                            hData.dialogueSpeaker = '';
                            hData.dialogueText = '';
                        }

                        HudStore.update(hData);
                    },
                    setCinematicActive: (val: boolean) => {
                        updateUiState({ cinematicActive: val });
                        refs.stateRef.current.ui.cinematicActive = val;
                        if (latestStateRef.current.props.onDialogueStateChange) latestStateRef.current.props.onDialogueStateChange(val);

                        if (!val && refs.pendingBossSpawnRef.current) {
                            const pending = refs.pendingBossSpawnRef.current;
                            refs.pendingBossSpawnRef.current = null;
                            console.log("[GameSession] Dialogue ended. Spawning deferred boss:", pending.bossId);
                            UIEventRingBuffer.push(UIEventType.SPAWN_BOSS, pending.bossId, 0, refs.stateRef.current.simTime);
                        }
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
                        FXSystem.spawnParticle(engine.scene, refs.stateRef.current.combat.particles, x, y, z, type, count, customMesh, customVel, color, scale);
                    },
                    spawnDecal: (x, z, scale, material, type: FXDecalType = FXDecalType.DECAL) => {
                        FXSystem.spawnDecal(engine.scene, refs.stateRef.current.world.bloodDecals, x, z, scale, material, type);
                    },
                    onTrigger: (type: TriggerType, duration: number) => {
                        const state = refs.stateRef.current;
                        const simTime = refs.engineRef.current?.simTime || 0;
                        if (type === TriggerType.SPEAK) state.speakingUntil = simTime + duration;
                        else state.thinkingUntil = simTime + duration;
                        if (state.callbacks.onTrigger) state.callbacks.onTrigger(type, duration);
                    },
                    spawnHorde: (count: number, type: any, pos: any) => refs.SectorBuildContextRef.current?.spawnHorde(count, type, pos),
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
                        const sectorData = (props as any).currentSectorData || SectorSystem.getSector(props.gameState.currentSector || 0);
                        const origin = (refs.playerGroupRef.current && refs.playerGroupRef.current.children.length > 0)
                            ? refs.playerGroupRef.current.position
                            : new THREE.Vector3(sectorData.playerSpawn.x || 0, 0, sectorData?.playerSpawn?.z || 0);
                        refs.SectorBuildContextRef.current?.spawnZombie(forcedType as EnemyType, forcedPos || origin);
                    },
                    endSector,
                    rewardXP,
                    rewardSP,
                    rewardScrap,
                    onSectorLoaded: props.onSectorLoaded,
                    collectedCluesRef: refs.collectedCluesRef,
                    setInteraction: (interaction: any) => {
                        const state = refs.stateRef.current;
                        const s = state.triggers;
                        if (interaction) {
                            s.interaction.active = true;
                            s.interaction.targetId = interaction.id;
                            s.interaction.type = interaction.type || InteractionType.SECTOR_SPECIFIC;
                            s.interaction.subType = interaction.subType || InteractionSubType.NONE;
                            s.interaction.label = interaction.label;
                            s.interaction.promptId = interaction.promptId || InteractionPromptId.INTERACT;
                            if (interaction.position) state.interactionTargetPos.copy(interaction.position);
                            state.hasInteractionTarget = true;
                        } else {
                            s.interaction.active = false;
                            s.interaction.promptId = InteractionPromptId.NONE;
                            state.hasInteractionTarget = false;
                        }
                    },
                    onBossKilled: (id: number) => {
                        const pProps = latestStateRef.current.props;
                        const sectorData = pProps.currentSectorData || SectorSystem.getSector(pProps.currentSector || 0);

                        // Stop boss music, play victory sound & resume ambient music:
                        audioEngine.stopMusic();
                        audioEngine.playSound(SoundID.UI_VICTORY);
                        if (sectorData?.ambientLoop) audioEngine.playMusic(sectorData.ambientLoop);

                        // Reward SP
                        rewardSP(2);

                        // Current family member set to rescued
                        const currentFamilyMember = refs.familyMemberRef.current;
                        if (currentFamilyMember && !currentFamilyMember.rescued) {
                            currentFamilyMember.rescued = true;
                        }

                        if (pProps.onBossKilled) {
                            pProps.onBossKilled(id);
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
                endSector,
                spawnParticle,
                spawnDecal,
                showDamageText,
                t,
                onAction: (action: any) => setupContextRef.current?.callbacks.onAction(action),
                onDiscovery: handleDiscovery,
                onDeathStateChange: props.onDeathStateChange,
                handlePlayerHit: (damage: number, attacker: any, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => {
                    const session = refs.gameSessionRef.current;
                    if (!session) return false;
                    return CombatEngine.handlePlayerHit(session, damage, attacker, damageType, damageSource, isDoT, effectType, duration, intensity, specificAttackType);
                },
                spawnZombie: (type: any, pos: any) => refs.SectorBuildContextRef.current?.spawnZombie(type, pos),
                spawnHorde: (count: number, type: any, pos: any) => refs.SectorBuildContextRef.current?.spawnHorde(count, type, pos),
                setBubble: (text: string, duration?: number) => {
                    UIEventRingBuffer.pushString(UIEventType.CHAT_BUBBLE, text, duration || 3000, refs.stateRef.current?.simTime || 0);
                },
                setInteraction: (interaction: any) => {
                    const state = refs.stateRef.current;
                    const s = state.triggers;
                    if (interaction) {
                        s.interaction.active = true;
                        s.interaction.targetId = interaction.id;
                        s.interaction.type = interaction.type;
                        s.interaction.label = interaction.label;
                        s.interaction.promptId = interaction.promptId || InteractionPromptId.INTERACT;
                        if (interaction.position) state.interactionTargetPos.copy(interaction.position);
                        state.hasInteractionTarget = true;
                    } else {
                        s.interaction.active = false;
                        s.interaction.promptId = InteractionPromptId.NONE;
                        state.hasInteractionTarget = false;
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
                rewardXP,
                rewardSP,
                rewardScrap
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
    }, [props.gameState.currentSector]);

    // Environmental Sync 
    useEffect(() => {
        if (!props.isWarmup && refs.engineRef.current) {
            const engine = refs.engineRef.current;
            const sector = SectorSystem.getSector(props.gameState.currentSector);

            if (!sector) {
                console.warn(`[GameSession] Environmental sync deferred: Sector ${props.gameState.currentSector} not yet in cache.`);
                return;
            }

            const env = sector.environment;
            const overrides = props.gameState.sectorState?.envOverride;

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
                    const weatherType = overrides?.weather?.type || env?.weather?.type || props.gameState.environmental.weather.type;
                    const requestedParticles = overrides?.weather?.particles || env?.weather?.particles || WEATHER_SYSTEM.DEFAULT_NUM_PARTICLES;
                    const finalWeatherCount = Math.max(0, Math.min(requestedParticles, WEATHER_SYSTEM.MAX_NUM_PARTICLES));
                    engine.weather.sync(weatherType, finalWeatherCount, 120);
                }
            }
        }
    }, [props.isWarmup, props.gameState.currentSector, props.gameState.sectorState?.envOverride, props.gameState.environmental.weather.type, refs]);

    return (
        <>
            <GameSessionUI refs={refs} uiState={uiState} gameProps={props} callbacks={uiCallbacks} />
        </>
    );
});

export default GameSession;
