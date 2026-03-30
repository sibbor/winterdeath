import React, { useEffect, useImperativeHandle, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { GameCanvasProps, SectorStats } from '../../game/session/SessionTypes';
import { WinterEngine } from '../../core/engine/WinterEngine';
import { GameSessionLogic } from './GameSessionLogic';
import { soundManager } from '../../utils/audio/SoundManager';
import { t } from '../../utils/i18n';
import { WEAPONS, LEVEL_CAP, BOSSES, WEATHER_SYSTEM, WIND_SYSTEM } from '../../content/constants';
import { useGameSessionState } from './useGameSessionState';
import { useGameInput } from './useGameInput';
import { GameSessionSetup, SetupContext } from './GameSessionSetup';
import { createGameLoop } from './GameSessionLoop';
import { GameSessionUI } from './GameSessionUI';
import { FXSystem } from '../../systems/FXSystem';
import { aggregateStats } from '../../game/progression/ProgressionManager';
import { SectorSystem } from '../../systems/SectorSystem';
import { HudStore } from '../../store/HudStore';
import { PlayerStatsSystem } from '../../systems/PlayerStatsSystem';

export interface GameSessionHandle {
    requestPointerLock: () => void;
    getSectorStats: (isExtraction?: boolean, aborted?: boolean) => SectorStats;
    triggerInput: (key: string) => void;
    rotateCamera: (dir: number) => void;
    adjustPitch: (dir: number) => void;
    getSystems: () => { id: string; enabled: boolean }[];
    setSystemEnabled: (id: string, enabled: boolean) => void;
    getMergedSessionStats: () => any;
    spawnBoss: (type: string, pos?: THREE.Vector3) => any;
    spawnEnemies: (newEnemies: any[]) => void;
    respawnPlayer: () => void;
    restartSector: () => Promise<void>;
}

// Zero-GC fallback constants
const EMPTY_ARRAY: any[] = [];
const EMPTY_OBJECT: any = {};
const _spawnPosScratch = new THREE.Vector3();

const GameSession = React.forwardRef<GameSessionHandle, GameCanvasProps>((props, ref) => {

    const { refs, uiState, updateUiState, setUiState } = useGameSessionState(props);
    const setupContextRef = useRef<SetupContext | null>(null);

    // Zero-GC latest state proxy
    const latestStateRef = useRef({ uiState, props });
    useEffect(() => {
        latestStateRef.current = { uiState, props };
    });

    useGameInput(refs, props, setUiState);

    // --- CORE CALLBACKS ---
    const spawnPart = useCallback((x: number, y: number, z: number, type: string, count: number, customMesh?: any, customVel?: any, color?: number, scale?: number) => {
        const engine = refs.engineRef.current;
        if (engine) FXSystem.spawnPart(engine.scene, refs.stateRef.current.particles, x, y, z, type, count, customMesh, customVel, color, scale);
    }, [refs]);

    const spawnDecal = useCallback((x: number, z: number, scale: number, material?: any, type: string = 'decal') => {
        const engine = refs.engineRef.current;
        if (engine) FXSystem.spawnDecal(engine.scene, refs.stateRef.current.bloodDecals, x, z, scale, material, type);
    }, [refs]);

    const showDamageText = useCallback((x: number, y: number, z: number, text: string, color?: string) => {
        const session = refs.gameSessionRef.current;
        if (session) {
            const damageSystem = session.getSystem('damage_number_system') as any;
            if (damageSystem) damageSystem.spawn(x, y, z, text, color);
        }
    }, [refs]);

    const getSectorStats = useCallback((isExtraction: boolean = false, aborted: boolean = false): SectorStats => {
        const state = refs.stateRef.current;
        if (!state.sessionStats) return ({} as SectorStats);

        // Zero-GC: Breakdown objects and lists are already in sessionStats
        const stats = state.sessionStats;
        stats.isExtraction = isExtraction;
        stats.aborted = aborted;
        stats.timeElapsed = performance.now() - (state.startTime || performance.now());
        stats.timePlayed = stats.timeElapsed;
        stats.accuracy = (stats.shotsFired > 0 ? (stats.shotsHit / stats.shotsFired) : 1) * 100;
        stats.distanceTraveled = refs.distanceTraveledRef.current;

        return stats;
    }, [refs]);

    const concludeSector = useCallback((isExtraction: boolean) => {
        if (!refs.hasEndedSector.current) {
            refs.hasEndedSector.current = true;
            if (isExtraction) {
                refs.stateRef.current.familyExtracted = true;
                soundManager.stopRadioStatic();
                soundManager.setReverb(0);
            }
            latestStateRef.current.props.onSectorEnded(getSectorStats(isExtraction));
        }
    }, [getSectorStats, refs]);

    const spawnBubble = useCallback((text: string, duration?: number) => {
        window.dispatchEvent(new CustomEvent('spawn-bubble', { detail: { text, duration } }));
    }, []);

    const gainXp = useCallback((amount: number) => {
        const session = refs.gameSessionRef.current;
        if (!session) return;

        const tracker = session.getSystem('damage_tracker_system') as any;
        if (tracker) tracker.recordXp(session, amount);

        const state = refs.stateRef.current;
        state.score += amount;
        state.currentXp += amount;
        while (state.currentXp >= state.nextLevelXp && state.level < LEVEL_CAP) {
            state.currentXp -= state.nextLevelXp;
            state.level++;
            state.nextLevelXp = Math.floor(state.nextLevelXp * 1.2);
            soundManager.playLevelUp();
        }
    }, [refs]);

    const gainSp = useCallback((amount: number) => {
        const session = refs.gameSessionRef.current;
        if (!session) return;

        const tracker = session.getSystem('damage_tracker_system') as any;
        if (tracker) tracker.recordSp(session, amount);
    }, [refs]);

    const closeModal = useCallback(() => {
        const { props: currentProps } = latestStateRef.current;
        if (currentProps.onInteractionStateChange) currentProps.onInteractionStateChange(null);

        const s = refs.gameSessionRef.current;
        if (s) {
            s.setSystemEnabled('player_combat', true);
            s.setSystemEnabled('player_movement', true);
            s.setSystemEnabled('player_interaction', true);
        }
        if (!currentProps.isMobileDevice && refs.containerRef.current) {
            refs.engineRef.current?.input.requestPointerLock(refs.containerRef.current);
        }
    }, [refs]);

    /**
     * Central Action Handler - VINTERDÖD EDITION
     * Processes game events triggered by AI, Triggers, or Cinematics.
     * Fully supports arrays, generic bridging to sectorState, and backwards compatibility.
     */
    const onAction = useCallback((action: any) => {
        const state = refs.stateRef.current;

        // 1. Array-based triggers (from dialog scripts)
        if (Array.isArray(action)) {
            for (let i = 0; i < action.length; i++) {
                onAction(action[i]);
            }
            return;
        }

        // 2. Extract type and payload
        const actionType = typeof action === 'string' ? action : action.type;
        const payload = typeof action === 'object' ? (action.payload || action) : {};

        // 3. Execution Switch
        switch (actionType) {
            case 'HEAL':
                state.hp = Math.min(state.maxHp, state.hp + (payload.amount || 20));
                soundManager.playUiConfirm();
                break;

            case 'SOUND':
            case 'PLAY_SOUND':
                const soundId = payload.id || action.id;
                if (soundId === 'explosion') {
                    soundManager.playExplosion();
                    if ((window as any).haptic) (window as any).haptic.explosion();
                } else {
                    soundManager.playEffect(soundId || 'ui_hover');
                }
                break;

            case 'GIVE_REWARD':
                if (payload.scrap) {
                    state.collectedScrap += payload.scrap;
                    state.sessionStats.scrapLooted += payload.scrap;
                }
                if (payload.xp) gainXp(payload.xp);
                if (payload.sp) gainSp(payload.sp);
                soundManager.playUiConfirm();
                break;

            case 'SPAWN_BOSS':
                window.dispatchEvent(new CustomEvent('boss-spawn-trigger', {
                    detail: {
                        type: payload.type || 'BOSS',
                        pos: payload.pos
                    }
                }));
                break;

            case 'FAMILY_MEMBER_FOLLOW':
                window.dispatchEvent(new CustomEvent('family-follow', {
                    detail: { active: true }
                }));
                break;

            case 'FAMILY_MEMBER_FOUND': {
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

                window.dispatchEvent(new CustomEvent('family-member-found', {
                    detail: { id: targetId, name: targetName }
                }));

                if (targetName) {
                    spawnBubble(targetName + " saved!", 3000);
                    soundManager.playVictory();
                }
                break;
            }

            case 'START_CINEMATIC':
                const engine = refs.engineRef.current;
                let target: THREE.Object3D | null = null;
                const currentFMDef = refs.familyMemberRef.current;

                // --- VINTERDÖD FIX: NEW GAME+ / REPLAY LOGIC ---
                // Vi måste kolla LIVE-objekten i världen, inte bara mallen!
                let isFollowing = false;
                const activeMembers = refs.activeFamilyMembers.current;
                if (activeMembers) {
                    for (let i = 0; i < activeMembers.length; i++) {
                        if (activeMembers[i].id === currentFMDef?.id && activeMembers[i].following) {
                            isFollowing = true;
                            break;
                        }
                    }
                }

                // --- VINTERDÖD FIX: NEW GAME+ / REPLAY LOGIC ---
                // If the family member is already following or rescued, we skip the cutscene!
                if (isFollowing || props.familyAlreadyRescued) {
                    const sectorData = props.currentSectorData || (window as any).SectorSystem?.getSector(props.currentSector || 0);
                    const bossPos = sectorData?.bossSpawn;

                    if (bossPos) {
                        onAction({ type: 'SPAWN_BOSS', payload: { pos: bossPos } });
                    }
                    return;
                }

                // If no specific target is specified, use the sector's current family member! (Zero-config)
                if (payload.familyId === undefined && !payload.targetName && !payload.id) {
                    const currentFM = refs.familyMemberRef.current;
                    if (currentFM && currentFM.mesh) {
                        target = currentFM.mesh;
                    }
                }

                // Priority 1: Specific Family ID (om angett manuellt)
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

                // Priority 2: Scene Object Name or UserData ID
                if (!target && (payload.targetName || payload.id)) {
                    const scene = engine?.scene;
                    if (scene) {
                        target = scene.getObjectByName(payload.targetName || payload.id);

                        // Priority 3: Deep search
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

                if (target) {
                    const cinematicSystem = refs.gameSessionRef.current?.getSystem('cinematic') as any;
                    if (cinematicSystem) {
                        cinematicSystem.startCinematic(
                            target,
                            payload.scriptId || 0,
                            payload
                        );
                    }
                }
                break;

            case 'CAMERA_SHAKE':
                if (payload.amount) refs.engineRef.current?.camera.shake(payload.amount);
                break;

            case 'CAMERA_PAN':
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

            case 'START_WAVE':
                if (payload.count) {
                    state.sectorState.zombiesKilled = 0;
                    state.sectorState.targetKills = payload.count;
                    state.sectorState.waveActive = true;
                    spawnBubble(t('ui.wave_start'), 4000);
                }
                break;

            case 'SHOW_TEXT':
                if (payload?.text) spawnBubble(t(payload.text), payload.duration || 3000);
                break;

            case 'SPAWN_ENEMY':
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

            default:
                // GENERIC BRIDGE: Pass unknown triggers directly to the sector's state memory
                if (actionType) {
                    state.sectorState.pendingTrigger = actionType;
                }
                break;
        }
    }, [gainXp, refs, spawnBubble]);

    // --- ZERO-GC DISCOVERY HANDLER ---
    const handleDiscovery = useCallback((type: string, id: string, titleKey: string, detailsKey: string, payload?: any) => {
        const state = refs.stateRef.current;
        const currentProps = latestStateRef.current.props;
        if (!state || !state.sessionStats) return;

        const stats = state.sessionStats;
        const sets = state.discoverySets;
        let isNew = false;

        switch (type) {
            case 'enemy':
                if (!sets.seenEnemies.has(id)) {
                    sets.seenEnemies.add(id);
                    stats.seenEnemies.push(id);
                    isNew = true;
                    if (currentProps.onEnemyDiscovered) currentProps.onEnemyDiscovered(id);
                }
                break;
            case 'boss':
                // Check seenBosses (Set)
                let bossSeenBefore = false;
                for (let i = 0; i < stats.seenBosses.length; i++) {
                    if (stats.seenBosses[i] === id) { bossSeenBefore = true; break; }
                }
                if (!bossSeenBefore) {
                    stats.seenBosses.push(id);
                    isNew = true;
                    if (currentProps.onBossDiscovered) currentProps.onBossDiscovered(id);
                }
                break;
            case 'collectible':
                if (!sets.collectibles.has(id)) {
                    sets.collectibles.add(id);
                    stats.collectiblesDiscovered.push(id);
                    state.sessionCollectiblesDiscovered.push(id);
                    isNew = true;
                    if (currentProps.onCollectibleDiscovered) currentProps.onCollectibleDiscovered(id);
                }
                break;
            case 'poi':
                if (!sets.pois.has(id)) {
                    sets.pois.add(id);
                    stats.discoveredPOIs.push(id);
                    isNew = true;
                    if (currentProps.onPOIdiscovered) currentProps.onPOIdiscovered(payload || id);
                }
                break;
            case 'clue':
                if (!sets.clues.has(id)) {
                    sets.clues.add(id);
                    const cluePayload = payload || { id, content: detailsKey };
                    stats.cluesFound.push(cluePayload);
                    isNew = true;
                    if (currentProps.onClueDiscovered) currentProps.onClueDiscovered(cluePayload);
                }
                break;
        }

        if (isNew && currentProps.settings?.showDiscoveryPopups !== false) {
            soundManager.playUiConfirm();

            // Push to queue instead of overwriting directly
            (refs as any).discoveryQueueRef.current.push({
                id,
                type,
                title: t(titleKey),
                details: t(detailsKey),
                timestamp: performance.now()
            });
        }
    }, [refs, t]);

    // --- ZERO-GC: uiCallbacks Object ---
    const uiCallbacks = React.useMemo(() => ({
        onContinue: () => {
            const { uiState: currentUi, props: currentProps } = latestStateRef.current;
            if (currentUi.deathPhase === 'CONTINUE') {
                updateUiState({ deathPhase: 'FADEOUT' as any });
                soundManager.playUiConfirm();
                setTimeout(() => {
                    currentProps.onSectorEnded({
                        timeElapsed: 0, shotsFired: 0, shotsHit: 0, throwablesThrown: 0, killsByType: {}, scrapLooted: 0, xpGained: 0, bonusXp: 0, familyFound: false, familyExtracted: false, damageDealt: 0, damageTaken: 0, bossDamageDealt: 0, bossDamageTaken: 0, chestsOpened: 0, bigChestsOpened: 0, distanceTraveled: refs.distanceTraveledRef.current, cluesFound: [], collectiblesDiscovered: [], isExtraction: false, spEarned: 0, seenEnemies: [], discoveredPOIs: [], aborted: true, seenBosses: [], incomingDamageBreakdown: {}, outgoingDamageBreakdown: {}
                    });
                }, 1000);
            } else {
                updateUiState({ deathPhase: 'CONTINUE' });
            }
        },
        onInteract: () => {
            if (refs.engineRef.current) {
                refs.engineRef.current.input.state.e = true;
                setTimeout(() => { if (refs.engineRef.current) refs.engineRef.current.input.state.e = false; }, 100);
            }
        },
        closeModal,
        openMap: () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', code: 'KeyM', bubbles: true }));
            return true;
        },
        onPauseToggle: (val: boolean) => latestStateRef.current.props.onPauseToggle(val),
        requestPointerLock: () => refs.engineRef.current?.input.requestPointerLock(refs.containerRef.current!),
        triggerCinematicNext: () => {
            const wasTyping = refs.bubbleRef.current?.finishTyping();
            if (!wasTyping) {
                const sys = refs.gameSessionRef.current?.getSystem('cinematic') as any;
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
                refs.stateRef.current.weaponAmmo[wepType] = WEAPONS[wepType]?.magSize || 0;
            }
            closeModal();
            soundManager.playUiConfirm();
        },
        spawnEnemies: (newEnemies: any[]) => {
            // Simplified: Just spawn. Discovery happens on damage/aggro.
            const enemies = refs.stateRef.current.enemies;
            const len = newEnemies.length;
            for (let i = 0; i < len; i++) {
                enemies.push(newEnemies[i]);
            }
        },
        saveSkills: (newStats: any, newSectorState: any) => {
            const currentProps = latestStateRef.current.props;
            if (currentProps.onSaveStats) currentProps.onSaveStats(newStats);
            refs.stateRef.current.hp = newStats.maxHp;
            refs.stateRef.current.maxHp = newStats.maxHp;
            refs.stateRef.current.stamina = newStats.maxStamina;
            refs.stateRef.current.maxStamina = newStats.maxStamina;
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
        spawnBubble,
        spawnZombie: (type: string, pos: THREE.Vector3) => {
            refs.sectorContextRef.current?.spawnZombie(type, pos);
        },
        onAction,
        gainXp
    }), [closeModal, gainXp, onAction, refs, spawnBubble, updateUiState]);

    // --- ZERO-GC: Global Event Listeners ---
    useEffect(() => {
        const handleBossSpawn = (e: any) => {
            const { type, pos } = e.detail || {};
            const boss = refs.sectorContextRef.current?.spawnBoss(type, pos);

            if (boss) {
                refs.bossIntroRef.current = {
                    active: true,
                    bossMesh: boss.mesh,
                    startTime: performance.now()
                };

                const bossNameKey = (BOSSES as any)[boss.bossId]?.name || 'BOSS';
                updateUiState({
                    bossIntroActive: true,
                    bossName: t(bossNameKey)
                });
                soundManager.stopMusic();

                if (boss.bossId !== undefined) soundManager.playBossSpawn(boss.bossId);
                else soundManager.playTankRoar();

                if (refs.bossIntroTimerRef.current) clearTimeout(refs.bossIntroTimerRef.current);
                refs.bossIntroTimerRef.current = setTimeout(() => {
                    refs.bossIntroRef.current.active = false;
                    updateUiState({ bossIntroActive: false });

                    const currentProps = latestStateRef.current.props;
                    const sectorData = (currentProps as any).currentSectorData || { environment: { bossMusic: 'boss_battle' } };
                    soundManager.playMusic(sectorData.environment.bossMusic || 'boss_battle');
                }, 3000);
            }
        };

        const handleFamilyFollow = (e: any) => {
            const { active } = e.detail || {};
            const fms = refs.activeFamilyMembers.current;
            const len = fms.length;
            for (let i = 0; i < len; i++) {
                if (fms[i].found) fms[i].following = active;
            }
        };

        const handleFamilyMemberFound = (e: any) => {
            const { name, id } = e.detail || {};
            const fms = refs.activeFamilyMembers.current;
            let newlyFound = false;
            const len = fms.length;

            for (let i = 0; i < len; i++) {
                const fm = fms[i];
                if ((name && fm.name === name) || (id && fm.id === id)) {
                    fm.found = true;
                    fm.following = true;
                    newlyFound = true;
                }
            }

            if (newlyFound && refs.gameSessionRef.current) {
                const statsSystem = refs.gameSessionRef.current.getSystem('player_stats_system') as PlayerStatsSystem;
                if (statsSystem) statsSystem.updatePassives();
            }
        };

        const handleKeepCamera = (e: any) => {
            const { targetPos, lookAtPos, duration } = e.detail || {};
            if (targetPos && lookAtPos && refs.engineRef.current) {
                refs.cameraOverrideRef.current = {
                    active: true,
                    targetPos: new THREE.Vector3(targetPos.x, targetPos.y || 30, targetPos.z),
                    lookAtPos: new THREE.Vector3(lookAtPos.x, lookAtPos.y || 0, lookAtPos.z),
                    endTime: performance.now() + (duration || 5000)
                };
                refs.engineRef.current.camera.setCinematic(true);
            }
        };

        const handleClearCameraOverride = () => {
            refs.cameraOverrideRef.current = null;
            if (refs.engineRef.current) refs.engineRef.current.camera.setCinematic(false);
        };

        const handleOpenStation = (e: any) => {
            const { id } = e.detail || {};
            if (id) updateUiState({ stationOverlay: id });
        };

        window.addEventListener('boss-spawn-trigger', handleBossSpawn);
        window.addEventListener('family-follow', handleFamilyFollow);
        window.addEventListener('family-member-found', handleFamilyMemberFound);
        window.addEventListener('keep_camera', handleKeepCamera);
        window.addEventListener('clearCameraOverride', handleClearCameraOverride);
        window.addEventListener('open_station', handleOpenStation);

        return () => {
            window.removeEventListener('boss-spawn-trigger', handleBossSpawn);
            window.removeEventListener('family-follow', handleFamilyFollow);
            window.removeEventListener('family-member-found', handleFamilyMemberFound);
            window.removeEventListener('keep_camera', handleKeepCamera);
            window.removeEventListener('clearCameraOverride', handleClearCameraOverride);
            window.removeEventListener('open_station', handleOpenStation);
        };
    }, [refs, updateUiState]);

    // --- Sector Intro Logic ---
    const hasPlayedIntroRef = React.useRef(false);
    useEffect(() => {
        hasPlayedIntroRef.current = false;
    }, [props.currentSector]);

    useEffect(() => {
        if (props.isRunning && !props.isPaused && !uiState.isSectorLoading) {
            const currentSector = refs.propsRef.current.currentSectorData;

            if (currentSector?.ambientLoop && !soundManager.isMusicPlaying()) {
                soundManager.playMusic(currentSector.ambientLoop);
            }

            if (currentSector?.intro && !hasPlayedIntroRef.current) {
                hasPlayedIntroRef.current = true;
                setTimeout(() => {
                    if (refs.isMounted.current) {
                        const introText = t(currentSector.intro!.text);
                        window.dispatchEvent(new CustomEvent('spawn-bubble', {
                            detail: { text: `🧠 ${introText}`, duration: currentSector.intro!.duration || 4000 }
                        }));
                        if (currentSector.intro!.sound) soundManager.playEffect(currentSector.intro!.sound);
                    }
                }, currentSector.intro.delay || 1500);
            }
        }
    }, [props.isRunning, props.isPaused, uiState.isSectorLoading, props.currentSector]);

    // Exposed API
    useImperativeHandle(ref, () => ({
        requestPointerLock: () => {
            if (refs.containerRef.current) refs.engineRef.current?.input.requestPointerLock(refs.containerRef.current);
        },
        getSectorStats,
        getMergedSessionStats: () => {
            const sessionStats = getSectorStats(false, false);
            return aggregateStats(latestStateRef.current.props.stats, sessionStats, false, false, 0);
        },
        triggerInput: (key: string) => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true }));
            setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: key, bubbles: true })), 50);
        },
        rotateCamera: (dir: number) => refs.engineRef.current?.camera.adjustAngle(dir * (Math.PI / 4)),
        adjustPitch: (dir: number) => refs.engineRef.current?.camera.adjustPitch(dir * 2.0),
        getSystems: () => refs.gameSessionRef.current?.getSystems() ?? [],
        setSystemEnabled: (id: string, enabled: boolean) => refs.gameSessionRef.current?.setSystemEnabled(id, enabled),
        spawnBoss: (type: string, pos?: THREE.Vector3) => refs.sectorContextRef.current?.spawnBoss(type, pos),
        spawnEnemies: (newEnemies: any[]) => {
            // Simplified: Direct push. Discovery handled by combat/aggro systems
            const enemies = refs.stateRef.current.enemies;
            const len = newEnemies.length;
            for (let i = 0; i < len; i++) {
                enemies.push(newEnemies[i]);
            }
        },
        respawnPlayer: () => {
            const engine = WinterEngine.getInstance();
            const state = refs.stateRef.current;
            GameSessionSetup.respawnPlayer(engine, state, refs, props, (phase) => updateUiState({ deathPhase: phase as any }));
        },
        restartSector: async () => {
            const currentSetupId = refs.setupIdRef.current;
            const ctx = setupContextRef.current;
            if (!ctx) return;
            await GameSessionSetup.restartSector(ctx, currentSetupId);
        },
    }), [getSectorStats, props, refs, updateUiState]);

    // Initialization and Teardown
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

        engine.onUpdate = null;
        engine.onRender = null;

        const session = new GameSessionLogic(engine);
        if (refs.stateRef.current) session.init(refs.stateRef.current);
        refs.gameSessionRef.current = session;

        if (refs.playerGroupRef.current) {
            session.playerPos = refs.playerGroupRef.current.position;
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
                    setDeathPhase: (val: any) => {
                        updateUiState({ deathPhase: val });
                        const pProps = latestStateRef.current.props;
                        if ((val === 'MESSAGE' || val === 'CONTINUE') && pProps.onDeathStateChange) {
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
                        hData.currentLine = val;
                        hData.cinematicActive = refs.gameSessionRef.current ? refs.gameSessionRef.current.getSystem('cinematic').cinematicRef.current.active : false;
                        HudStore.update(hData);
                    },
                    setCinematicActive: (val: boolean) => {
                        updateUiState({ cinematicActive: val });
                        const hData = HudStore.getState();
                        hData.cinematicActive = val;
                        HudStore.update(hData);
                        if (latestStateRef.current.props.onDialogueStateChange) latestStateRef.current.props.onDialogueStateChange(val);
                    },
                    setInteractionType: (val: any) => updateUiState({ interactionType: val }),
                    setFoundMemberName: (val: string) => updateUiState({ foundMemberName: val }),
                    setOverlay: (val: string | null) => {
                        if (latestStateRef.current.props.onInteractionStateChange) latestStateRef.current.props.onInteractionStateChange(val);
                    }
                },
                callbacks: {
                    t,
                    showDamageText,
                    onDiscovery: handleDiscovery,
                    spawnBubble: (text: string, duration?: number) => {
                        window.dispatchEvent(new CustomEvent('spawn-bubble', { detail: { text, duration: duration || 3000 } }));
                    },
                    spawnPart: (x, y, z, type, count, customMesh, customVel, color, scale) => {
                        FXSystem.spawnPart(engine.scene, refs.stateRef.current.particles, x, y, z, type, count, customMesh, customVel, color, scale);
                    },
                    spawnDecal: (x, z, scale, material, type = 'decal') => {
                        FXSystem.spawnDecal(engine.scene, refs.stateRef.current.bloodDecals, x, z, scale, material, type);
                    },
                    onTrigger: (type: string, duration: number) => {
                        const state = refs.stateRef.current;
                        if (type === 'SPEAK') state.speakingUntil = performance.now() + duration;
                        else state.thinkingUntil = performance.now() + duration;
                    },
                    onAction: (action: any) => onAction(action),
                    handleTriggerAction: (action: any, scene: THREE.Scene) => {
                        // VINTERDÖD: We unified this directly with onAction
                        onAction(action);
                    },
                    startCinematic: (mesh: any, scriptId?: number, params?: any) => {
                        const sys = refs.gameSessionRef.current?.getSystem('cinematic') as any;
                        sys?.startCinematic(mesh, scriptId || 0, params);
                    },
                    playCinematicLine: (index: number) => {
                        const sys = refs.gameSessionRef.current?.getSystem('cinematic') as any;
                        sys?.playLine(index);
                    },
                    endCinematic: () => {
                        const cinematicSystem = refs.gameSessionRef.current?.getSystem('cinematic') as any;
                        if (!cinematicSystem) return;

                        const state = cinematicSystem.cinematicRef.current;
                        if (!state.active) return;

                        const script = cinematicSystem.getScript(state.scriptId);
                        if (script && script[state.lineIndex]?.trigger) {
                            onAction(script[state.lineIndex].trigger);
                        }
                        cinematicSystem.stop();

                        const { props: currentProps } = latestStateRef.current;
                        if (!currentProps.isMobileDevice && refs.containerRef.current) {
                            refs.engineRef.current?.input.requestPointerLock(refs.containerRef.current);
                        }
                        setUiState(prev => ({ ...prev, isInteractionOpen: false }));
                    },
                    spawnZombie: (forcedType?: string, forcedPos?: THREE.Vector3) => {
                        const sectorData = (props as any).currentSectorData || SectorSystem.getSector(props.currentSector || 0);
                        const origin = (refs.playerGroupRef.current && refs.playerGroupRef.current.children.length > 0)
                            ? refs.playerGroupRef.current.position
                            : new THREE.Vector3(sectorData?.playerSpawn?.x || 0, 0, sectorData?.playerSpawn?.z || 0);
                        refs.sectorContextRef.current?.spawnZombie(forcedType, forcedPos || origin);
                    },
                    concludeSector,
                    gainXp,
                    gainSp,
                    onSectorLoaded: props.onSectorLoaded,
                    collectedCluesRef: refs.collectedCluesRef,
                    onBossKilled: (id: number) => {
                        soundManager.stopMusic();
                        const pProps = latestStateRef.current.props;
                        const sectorData = pProps.currentSectorData || SectorSystem.getSector(pProps.currentSector || 0);
                        if (sectorData?.ambientLoop) soundManager.playMusic(sectorData.ambientLoop);
                    }
                }
            };

            setupContextRef.current = ctx;
            await GameSessionSetup.runSectorSetup(ctx, currentSetupId);

            let framesToWait = 3;
            await new Promise<void>((resolve) => {
                const setupRAFRef = { id: 0 };
                const checkReady = () => {
                    if (framesToWait > 0) {
                        framesToWait--;
                        setupRAFRef.id = requestAnimationFrame(checkReady);
                    } else {
                        if (refs.isMounted.current && refs.setupIdRef.current === currentSetupId) {
                            updateUiState({ isSectorLoading: false });
                        }
                        resolve();
                    }
                };

                // Store the RAF ID in refs so we can cancel it on unmount
                (refs as any).setupRAFId = setupRAFRef;
                setupRAFRef.id = requestAnimationFrame(checkReady);
            });
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
                gainXp,
                spawnPart,
                spawnDecal,
                showDamageText,
                t,
                spawnBubble: (text: string, duration?: number) => {
                    window.dispatchEvent(new CustomEvent('spawn-bubble', { detail: { text, duration: duration || 3000 } }));
                },
                onAction: (action: any) => setupContextRef.current?.callbacks.onAction(action),
                onDiscovery: handleDiscovery,
                onDeathStateChange: props.onDeathStateChange,
                gainSp
            }
        });

        return () => {
            refs.isMounted.current = false;
            const finalSetupId = ++refs.setupIdRef.current;

            if ((refs as any).setupRAFId?.id) {
                cancelAnimationFrame((refs as any).setupRAFId.id);
            }

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
            const env = sector?.environment;
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

    // Discovery Queue Processor
    useEffect(() => {
        let interval = setInterval(() => {
            const queue = refs.discoveryQueueRef.current;
            if (!queue || queue.length === 0) return;

            const hData = HudStore.getState();
            // If there's an active discovery, let it show for at least 3 seconds (or whatever the UI logic is)
            // But we want to ensure we don't spam. If discovery is null, we can show the next one.
            if (!hData.discovery) {
                const next = queue.shift();
                HudStore.update({
                    ...hData,
                    discovery: next
                });
            }
        }, 500);
        return () => clearInterval(interval);
    }, [refs]);

    return <GameSessionUI refs={refs} uiState={uiState} gameProps={props} callbacks={uiCallbacks} />;
});

export default GameSession;