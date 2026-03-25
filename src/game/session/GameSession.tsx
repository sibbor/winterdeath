import React, { useEffect, useImperativeHandle, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { GameCanvasProps, SectorStats } from '../../game/session/SessionTypes';
import { WinterEngine } from '../../core/engine/WinterEngine';
import { GameSessionLogic } from './GameSessionLogic';
import { soundManager } from '../../utils/SoundManager';
import { t } from '../../utils/i18n';
import { WEAPONS, LEVEL_CAP, BOSSES, WEATHER_SYSTEM, WIND_SYSTEM } from '../../content/constants';
import { useGameSessionState } from './useGameSessionState';
import { useGameInput } from './useGameInput';
import { GameSessionSetup } from './GameSessionSetup';
import { createGameLoop } from './GameSessionLoop';
import { GameSessionUI } from './GameSessionUI';
import { requestWakeLock, releaseWakeLock } from '../../utils/device';
import { FXSystem } from '../../systems/FXSystem';
import { aggregateStats } from '../../game/progression/ProgressionManager';
import { SectorSystem } from '../../systems/SectorSystem';
import { HudStore } from '../../store/HudStore';

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
}

// Zero-GC fallback constants to prevent allocating new objects/arrays on every stat fetch
const EMPTY_ARRAY: any[] = [];
const EMPTY_OBJECT: any = {};

// Scratchpad for trigger event spawn positions
const _spawnPosScratch = new THREE.Vector3();

const GameSession = React.forwardRef<GameSessionHandle, GameCanvasProps>((props, ref) => {

    // 1. Core State and References
    const { refs, uiState, updateUiState, setUiState } = useGameSessionState(props);

    // --- ZERO-GC: Latest Props Ref ---
    // We store the latest closures and state here to prevent rebuilding the massive uiCallbacks object
    // or tearing down event listeners.
    const latestStateRef = useRef({ uiState, props });
    useEffect(() => {
        latestStateRef.current = { uiState, props };
    }); // Runs safely on every render without teardown

    // 2. Local keyboard shortcuts (Flashlight, Rolling, Escaping)
    useGameInput(refs, props, setUiState);

    // --- Stable Gameplay Callbacks ---
    const spawnPart = useCallback((x: number, y: number, z: number, type: string, count: number, customMesh?: any, customVel?: any, color?: number, scale?: number) => {
        const engine = refs.engineRef.current;
        if (engine) {
            FXSystem.spawnPart(engine.scene, refs.stateRef.current.particles, x, y, z, type, count, customMesh, customVel, color, scale);
        }
    }, [refs]);

    const spawnDecal = useCallback((x: number, z: number, scale: number, material?: any, type: string = 'decal') => {
        const engine = refs.engineRef.current;
        if (engine) {
            FXSystem.spawnDecal(engine.scene, refs.stateRef.current.bloodDecals, x, z, scale, material, type);
        }
    }, [refs]);

    const showDamageText = useCallback((x: number, y: number, z: number, text: string, color?: string) => {
        const session = refs.gameSessionRef.current;

        if (session) {
            const damageSystem = session.getSystem('damage_number_system') as any;
            if (damageSystem) {
                damageSystem.spawn(x, y, z, text, color);
            }
        }
    }, [refs]);

    const getSectorStats = useCallback((isExtraction: boolean = false, aborted: boolean = false): SectorStats => {
        const state = refs.gameSessionRef.current?.state || EMPTY_OBJECT;
        const now = performance.now();
        const pStats = latestStateRef.current.props.stats; // Always use latest safely

        // Zero-GC Boss concatenation
        const finalSeenBosses = [];
        const stateSeenBosses = state.seenBosses || EMPTY_ARRAY;
        const refBossesDefeated = refs.stateRef.current.bossesDefeated || EMPTY_ARRAY;
        for (let i = 0; i < stateSeenBosses.length; i++) finalSeenBosses.push(stateSeenBosses[i]);
        for (let i = 0; i < refBossesDefeated.length; i++) finalSeenBosses.push(refBossesDefeated[i]);

        return {
            timeElapsed: now - (state.startTime || now),
            timePlayed: now - (state.startTime || now),
            kills: state.killsInRun || 0,
            accuracy: (state.shotsFired > 0 ? (state.shotsHit / state.shotsFired) : 1) * 100,
            itemsCollected: state.collectedScrap || 0,
            shotsFired: state.shotsFired || 0,
            shotsHit: state.shotsHit || 0,
            throwablesThrown: state.throwablesThrown || 0,
            killsByType: state.killsByType || EMPTY_OBJECT,
            scrapLooted: state.collectedScrap || 0,
            xpGained: state.score || 0,
            familyFound: state.familyFound || refs.stateRef.current.familyFound,
            familyExtracted: isExtraction && (state.familyFound || refs.stateRef.current.familyFound),
            damageDealt: state.damageDealt || 0,
            damageTaken: state.damageTaken || 0,
            bossDamageDealt: state.bossDamageDealt || 0,
            bossDamageTaken: state.bossDamageTaken || 0,
            chestsOpened: state.chestsOpened || 0,
            bigChestsOpened: state.bigChestsOpened || 0,
            distanceTraveled: refs.distanceTraveledRef.current,
            cluesFound: refs.collectedCluesRef.current,
            collectiblesDiscovered: state.sessionCollectiblesDiscovered || EMPTY_ARRAY,
            isExtraction,
            aborted,
            spEarned: (state.level - pStats.level) + (state.sessionCollectiblesDiscovered?.length || 0) + ((state.bossesDefeated?.length || 0) > 0 ? 1 : 0) + (state.familyFound ? 1 : 0),
            seenEnemies: state.seenEnemies || EMPTY_ARRAY,
            seenBosses: finalSeenBosses,
            discoveredPOIs: state.discoveredPOIs || EMPTY_ARRAY,
            incomingDamageBreakdown: state.incomingDamageBreakdown || EMPTY_OBJECT,
            outgoingDamageBreakdown: state.outgoingDamageBreakdown || EMPTY_OBJECT
        };
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
        const state = refs.stateRef.current;
        state.score += amount;
        state.currentXp += amount;
        while (state.currentXp >= state.nextLevelXp && state.level < LEVEL_CAP) {
            state.currentXp -= state.nextLevelXp;
            state.level++;
            state.nextLevelXp = Math.floor(state.nextLevelXp * 1.2);
            soundManager.playUiConfirm();
        }
    }, []);

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

    const onAction = useCallback((action: any) => {
        const state = refs.stateRef.current;
        const { type, payload } = action;

        if (type === 'HEAL') {
            state.hp = Math.min(state.maxHp, state.hp + (payload?.amount || action.amount || 20));
            soundManager.playUiConfirm();
        }
        if (type === 'SOUND' && (payload?.id || action.id)) {
            soundManager.playEffect(payload?.id || action.id);
        }
        if (type === 'GIVE_REWARD' && payload) {
            if (payload.scrap) state.collectedScrap += payload.scrap;
            if (payload.xp) gainXp(payload.xp);
            soundManager.playUiConfirm();
        }
        if (type === 'UNLOCK_OBJECT') {
            const id = payload?.id || action.id;
            if (id === 'bus') {
                state.busUnlocked = true;
                state.sectorState.busUnlocked = true;
                spawnBubble(`${t('clues.bus_clear')}`);
                soundManager.playUiConfirm();
            }
        }
        if (type === 'START_CINEMATIC') {
            const engine = refs.engineRef.current;
            let target: THREE.Object3D | null | undefined = null;

            if (payload?.familyId !== undefined && refs.activeFamilyMembers.current) {
                const members = refs.activeFamilyMembers.current;
                for (let i = 0; i < members.length; i++) {
                    if (members[i].id === payload.familyId) {
                        target = members[i].mesh;
                        break;
                    }
                }
            }

            if (!target && (payload?.targetName || payload?.id)) {
                target = engine?.scene.getObjectByName(payload?.targetName || payload?.id);
                if (!target && payload?.id) {
                    const children = engine?.scene.children || [];
                    for (let i = 0; i < children.length; i++) {
                        if (children[i].userData?.id === payload.id) {
                            target = children[i];
                            break;
                        }
                    }
                }
            }

            if (target) {
                refs.gameSessionRef.current?.getSystem('cinematic')?.startCinematic(target, payload?.scriptId || 0, payload);
            }
        }
        if (type === 'TRIGGER_FAMILY_FOLLOW') {
            window.dispatchEvent(new CustomEvent('family-follow', { detail: { active: true } }));
        }
    }, []);

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

            // Zero-GC object property reset
            for (const key in refs.stateRef.current.weaponAmmo) {
                const wepType = key as any;
                refs.stateRef.current.weaponAmmo[wepType] = WEAPONS[wepType]?.magSize || 0;
            }
            closeModal();
            soundManager.playUiConfirm();
        },
        spawnEnemies: (newEnemies: any[]) => {
            for (let i = 0; i < newEnemies.length; i++) {
                const e = newEnemies[i];
                refs.stateRef.current.enemies.push(e);

                if (e.type) {
                    let seen = false;
                    for (let j = 0; j < refs.stateRef.current.seenEnemies.length; j++) {
                        if (refs.stateRef.current.seenEnemies[j] === e.type) { seen = true; break; }
                    }
                    if (!seen) refs.stateRef.current.seenEnemies.push(e.type);
                }
            }
        },
        saveSkills: (newStats: any, newSectorState: any) => {
            const currentProps = latestStateRef.current.props;
            if (currentProps.onSaveStats) currentProps.onSaveStats(newStats);
            refs.stateRef.current.hp = newStats.maxHp; refs.stateRef.current.maxHp = newStats.maxHp;
            refs.stateRef.current.stamina = newStats.maxStamina; refs.stateRef.current.maxStamina = newStats.maxStamina;
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
    }), []);

    // --- Wake Lock Management ---
    /*
    useEffect(() => {
        requestWakeLock();
        return () => {
            releaseWakeLock();
        };
    }, []);
    */

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

                if (boss.bossId !== undefined) {
                    soundManager.playBossSpawn(boss.bossId);
                } else {
                    soundManager.playTankRoar(); // Fallback
                }

                if (refs.bossIntroTimerRef.current) clearTimeout(refs.bossIntroTimerRef.current);
                refs.bossIntroTimerRef.current = setTimeout(() => {
                    refs.bossIntroRef.current.active = false;
                    updateUiState({ bossIntroActive: false });

                    // Safely read latest props
                    const currentProps = latestStateRef.current.props;
                    const sectorData = (currentProps as any).currentSectorData || { environment: { bossMusic: 'boss_battle' } };
                    soundManager.playMusic(sectorData.environment.bossMusic || 'boss_battle');
                }, 3000);
            }
        };

        const handleFamilyFollow = (e: any) => {
            const { active } = e.detail || {};
            const fms = refs.activeFamilyMembers.current;
            for (let i = 0; i < fms.length; i++) {
                if (fms[i].found) fms[i].following = active;
            }
        };

        const handleFamilyMemberFound = (e: any) => {
            const { name, id } = e.detail || {};
            const fms = refs.activeFamilyMembers.current;
            for (let i = 0; i < fms.length; i++) {
                const fm = fms[i];
                if ((name && fm.name === name) || (id && fm.id === id)) {
                    fm.found = true;
                    fm.following = true;
                }
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


    // --- Sector Intro Logic (Music & Narrative) ---
    const hasPlayedIntroRef = React.useRef(false);
    useEffect(() => {
        hasPlayedIntroRef.current = false;
    }, [props.currentSector]);

    useEffect(() => {
        if (props.isRunning && !props.isPaused && !uiState.isSectorLoading) {
            const currentSector = refs.propsRef.current.currentSectorData;

            if (currentSector?.environment.ambientLoop && !soundManager.isMusicPlaying()) {
                soundManager.playMusic(currentSector.environment.ambientLoop);
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


    // 3. Exposed API for the enclosing App component
    useImperativeHandle(ref, () => ({
        requestPointerLock: () => {
            if (refs.containerRef.current) {
                refs.engineRef.current?.input.requestPointerLock(refs.containerRef.current);
            }
        },
        getSectorStats,
        getMergedSessionStats: () => {
            const sessionStats = getSectorStats(false, false);
            // Safe props read
            return aggregateStats(latestStateRef.current.props.stats, sessionStats, false, false, 0);
        },
        triggerInput: (key: string) => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true }));
            setTimeout(() => {
                window.dispatchEvent(new KeyboardEvent('keyup', { key: key, bubbles: true }));
            }, 50);
        },
        rotateCamera: (dir: number) => refs.engineRef.current?.camera.adjustAngle(dir * (Math.PI / 4)),
        adjustPitch: (dir: number) => refs.engineRef.current?.camera.adjustPitch(dir * 2.0),
        getSystems: () => refs.gameSessionRef.current?.getSystems() ?? [],
        setSystemEnabled: (id: string, enabled: boolean) => refs.gameSessionRef.current?.setSystemEnabled(id, enabled),
        spawnBoss: (type: string, pos?: THREE.Vector3) => refs.sectorContextRef.current?.spawnBoss(type, pos),
        spawnEnemies: (newEnemies: any[]) => {
            for (let i = 0; i < newEnemies.length; i++) {
                const e = newEnemies[i];
                refs.stateRef.current.enemies.push(e);
                if (e.type) {
                    let seen = false;
                    for (let j = 0; j < refs.stateRef.current.seenEnemies.length; j++) {
                        if (refs.stateRef.current.seenEnemies[j] === e.type) { seen = true; break; }
                    }
                    if (!seen) refs.stateRef.current.seenEnemies.push(e.type);
                }
            }
        }
    }), []);

    // 4. Initialization and Teardown
    useEffect(() => {
        if (!refs.containerRef.current || refs.isMounted.current) return;
        refs.isMounted.current = true;

        const engine = WinterEngine.getInstance();
        const currentSetupId = ++refs.setupIdRef.current;

        // Clean previous instances
        if (refs.playerGroupRef.current) {
            engine.scene.remove(refs.playerGroupRef.current);
            refs.playerGroupRef.current = null as any;
        }

        for (let i = engine.scene.children.length - 1; i >= 0; i--) {
            const child = engine.scene.children[i];
            if (child.name !== 'MainCamera' && !child.userData.isEngineStatic) {
                engine.scene.remove(child);
            }
        }

        if (props.initialGraphics) {
            engine.updateSettings(props.initialGraphics);
        }

        engine.mount(refs.containerRef.current);
        refs.engineRef.current = engine;
        engine.input.enable();

        engine.onUpdate = null;
        engine.onRender = null;
        engine.isRenderingPaused = false;

        const session = new GameSessionLogic(engine);
        if (refs.stateRef.current) session.init(refs.stateRef.current);
        refs.gameSessionRef.current = session;

        // [VINTERDÖD FIX] Attach the player reference for systems (EnemyDetection, etc)
        if (refs.playerGroupRef.current) {
            session.playerPos = refs.playerGroupRef.current.position;
        }

        // [VINTERDÖD FIX] Bind the session as the logic context for all engine systems
        engine.onUpdateContext = session;

        if (props.debugMode) {
            (window as any).gameSession = session;
        }

        // Call the setup routine
        // Call the setup routine ASYNCHRONOUSLY
        const initSector = async () => {
            await GameSessionSetup.runSectorSetup({
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
                    onCollectibleDiscovered: (collectibleId: string) => {
                        if (!refs.stateRef.current.sessionCollectiblesDiscovered.includes(collectibleId)) {
                            refs.stateRef.current.sessionCollectiblesDiscovered.push(collectibleId);
                        }
                        if (latestStateRef.current.props.onCollectibleDiscovered) {
                            latestStateRef.current.props.onCollectibleDiscovered(collectibleId);
                        }
                    },
                    spawnBubble: (text: string, duration?: number) => {
                        window.dispatchEvent(new CustomEvent('spawn-bubble', {
                            detail: { text, duration: duration || 3000 }
                        }));
                    },
                    spawnPart: (x, y, z, type, count, customMesh, customVel, color, scale) => {
                        FXSystem.spawnPart(engine.scene, refs.stateRef.current.particles, x, y, z, type, count, customMesh, customVel, color, scale);
                    },
                    spawnDecal: (x, z, scale, material, type = 'decal') => {
                        FXSystem.spawnDecal(engine.scene, refs.stateRef.current.bloodDecals, x, z, scale, material, type);
                    },
                    onClueDiscovered: (clue: any) => {
                        if (latestStateRef.current.props.onClueDiscovered) latestStateRef.current.props.onClueDiscovered(clue);
                    },
                    onPOIdiscovered: (poi: any) => {
                        if (latestStateRef.current.props.onPOIdiscovered) latestStateRef.current.props.onPOIdiscovered(poi);
                    },
                    onTrigger: (type: string, duration: number) => {
                        const state = refs.stateRef.current;
                        if (type === 'SPEAK') state.speakingUntil = performance.now() + duration;
                        else state.thinkingUntil = performance.now() + duration;
                    },
                    onAction: (action: any) => {
                        onAction(action);
                    },
                    handleTriggerAction: (action: any, scene: THREE.Scene) => {
                        const { type, payload, delay } = action;
                        const execute = () => {
                            switch (type) {
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
                                case 'CAMERA_SHAKE':
                                    if (payload?.amount) refs.engineRef.current?.camera.shake(payload.amount);
                                    break;
                                case 'CAMERA_PAN':
                                    if (payload?.target && payload.duration) {
                                        refs.engineRef.current?.camera.setCinematic(true);
                                        refs.engineRef.current?.camera.setPosition(payload.target.x, 30, payload.target.z + 20);
                                        refs.engineRef.current?.camera.lookAt(payload.target.x, 0, payload.target.z);
                                        setTimeout(() => {
                                            refs.engineRef.current?.camera.setCinematic(false);
                                        }, payload.duration);
                                    }
                                    break;
                                case 'START_WAVE':
                                    if (payload?.count) {
                                        refs.stateRef.current.sectorState.zombiesKilled = 0;
                                        refs.stateRef.current.sectorState.targetKills = payload.count;
                                        refs.stateRef.current.sectorState.waveActive = true;
                                        spawnBubble(t('ui.wave_start'), 4000);
                                    }
                                    break;
                                case 'GIVE_REWARD':
                                case 'UNLOCK_OBJECT':
                                case 'START_CINEMATIC':
                                case 'TRIGGER_FAMILY_FOLLOW':
                                    onAction(action);
                                    break;
                                case 'PLAY_SOUND':
                                    onAction({ type: 'SOUND', payload: { id: payload?.id || action.id } });
                                    break;
                                default:
                                    onAction(action);
                                    break;
                            }
                        };

                        if (delay) setTimeout(execute, delay);
                        else execute();
                    },
                    startCinematic: (mesh: any, scriptId?: number, params?: any) => {
                        const sys = refs.gameSessionRef.current?.getSystem('cinematic') as any;
                        sys?.startCinematic(mesh, scriptId || 0, params);
                    },
                    endCinematic: () => {
                    },
                    playCinematicLine: (index: number) => {
                        const sys = refs.gameSessionRef.current?.getSystem('cinematic') as any;
                        sys?.playLine(index);
                    },
                    spawnZombie: (forcedType?: string, forcedPos?: THREE.Vector3) => {
                        const origin = (refs.playerGroupRef.current && refs.playerGroupRef.current.children.length > 0)
                            ? refs.playerGroupRef.current.position
                            : new THREE.Vector3(props.currentSectorData.playerSpawn.x, 0, props.currentSectorData.playerSpawn.z);
                        refs.sectorContextRef.current?.spawnZombie(forcedType, forcedPos || origin);
                    },
                    concludeSector,
                    gainXp,
                    // VINTERDÖD FIX: Vi skickar INTE onSectorLoaded här längre. Det sköts nedan.
                    onBossKilled: (id: number) => {
                        soundManager.stopMusic();
                        const pProps = latestStateRef.current.props;
                        if (pProps.currentSectorData?.environment.ambientLoop) {
                            soundManager.playMusic(pProps.currentSectorData.environment.ambientLoop);
                        }
                    },
                    collectedCluesRef: refs.collectedCluesRef,
                }
            }, currentSetupId);

            // =====================================================================
            // VINTERDÖD FIX: Låt GPU:n vakna och svälja all data INNAN laddningsskärmen försvinner
            // =====================================================================
            engine.isRenderingPaused = false;

            await new Promise<void>((resolve) => {
                let framesToWait = 5;
                const checkReady = () => {
                    if (framesToWait > 0) {
                        framesToWait--;
                        requestAnimationFrame(checkReady);
                    } else {
                        if (refs.isMounted.current && refs.setupIdRef.current === currentSetupId) {
                            updateUiState({ isSectorLoading: false });
                            if (props.onSectorLoaded) props.onSectorLoaded();
                        }
                        resolve();
                    }
                };
                requestAnimationFrame(checkReady);
            });
        };

        // Kör den asynkrona funktionen!
        initSector();

        // Bind the Update Loop
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
                    window.dispatchEvent(new CustomEvent('spawn-bubble', {
                        detail: { text, duration: duration || 3000 }
                    }));
                }
            }
        });

        // Cleanup
        return () => {
            refs.isMounted.current = false;

            if (refs.engineRef.current && refs.gameSessionRef.current) {
                GameSessionSetup.disposeSector(refs.gameSessionRef.current, refs.stateRef.current);
            }
        };

    }, [props.currentSector]);

    // Environmental Sync Transition (RUNTIME ONLY)
    // Updates values dynamically (e.g., Sector 6 zones) WITHOUT altering the scene graph
    useEffect(() => {
        if (!props.isWarmup && refs.engineRef.current) {
            const engine = refs.engineRef.current;
            const sector = SectorSystem.getSector(props.currentSector);
            const env = sector?.environment;
            const overrides = props.environmentOverrides?.[props.currentSector];

            if (env) {
                // 1. WindSystem (updating parameters)
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

                // 2. WeatherSystem (updating parameters)
                if (engine.weather) {
                    const weatherType = overrides?.weather?.type || env?.weather?.type || (typeof props?.weather === 'string' ? props.weather : 'none');
                    const requestedParticles = overrides?.weather?.particles || env?.weather?.particles || WEATHER_SYSTEM.DEFAULT_NUM_PARTICLES;
                    const finalWeatherCount = Math.max(0, Math.min(requestedParticles, WEATHER_SYSTEM.MAX_NUM_PARTICLES));

                    engine.weather.sync(weatherType, finalWeatherCount, 120);
                }
            }
        }
    }, [props.isWarmup, props.currentSector, props.environmentOverrides, props.weather, refs]);

    return <GameSessionUI refs={refs} uiState={uiState} gameProps={props} callbacks={uiCallbacks} />;
});

export default GameSession;