import React, { useEffect, useImperativeHandle, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { GameCanvasProps } from '../../types/CanvasTypes';
import { SectorStats } from '../../types/StateTypes';
import { WinterEngine } from '../../core/engine/WinterEngine';
import { GameSessionLogic } from './GameSessionLogic';
import { audioEngine } from '../../utils/audio/AudioEngine';
import { UiSounds, WeaponSounds } from '../../utils/audio/AudioLib';
import { SoundID, MusicID } from '../../utils/audio/AudioTypes';
import { t } from '../../utils/i18n';
import { LEVEL_CAP, WEATHER_SYSTEM, WIND_SYSTEM, FamilyMemberID } from '../../content/constants';
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
import { EnemyType } from '../../entities/enemies/EnemyTypes';
import { PlayerStatID } from '../../entities/player/PlayerTypes';
import { DataResolver } from '../../utils/ui/DataResolver';
import { DiscoveryType } from '../../components/ui/hud/HudTypes';
import { FXParticleType, FXDecalType } from '../../types/FXTypes';
import { SystemID } from '../../systems/System';
import { TriggerType } from '../../systems/TriggerTypes';

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
    const spawnParticle = useCallback((x: number, y: number, z: number, type: FXParticleType, count: number, customMesh?: any, customVel?: any, color?: number, scale?: number) => {
        const engine = refs.engineRef.current;
        if (engine) FXSystem.spawnParticle(engine.scene, refs.stateRef.current.particles, x, y, z, type, count, customMesh, customVel, color, scale);
    }, [refs]);

    const spawnDecal = useCallback((x: number, z: number, scale: number, material?: any, type: FXDecalType = FXDecalType.DECAL) => {
        const engine = refs.engineRef.current;
        if (engine) FXSystem.spawnDecal(engine.scene, refs.stateRef.current.bloodDecals, x, z, scale, material, type);
    }, [refs]);

    const showDamageText = useCallback((x: number, y: number, z: number, text: string, color?: string) => {
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
        stats.timeElapsed = engine.simTime;
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
                audioEngine.stopAmbience();
                audioEngine.setReverb(0);
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

        const tracker = session.getSystem<any>(SystemID.DAMAGE_TRACKER);
        if (tracker) tracker.recordXp(session, amount);

        const statsBuffer = session.state.statsBuffer;

        // --- VINTERDÖD FIX: Zero-GC DOD Progression ---
        // We use the statsBuffer (Float32Array) directly for O(1) SMI access.
        statsBuffer[PlayerStatID.SCORE] += amount;
        statsBuffer[PlayerStatID.CURRENT_XP] += amount;
        statsBuffer[PlayerStatID.XP] += amount;

        let levelUps = 0;
        const maxLevel = LEVEL_CAP || 100;

        // Process level-ups in a single pass to prevent sound spam and desync
        while (statsBuffer[PlayerStatID.CURRENT_XP] >= statsBuffer[PlayerStatID.NEXT_LEVEL_XP] && statsBuffer[PlayerStatID.LEVEL] < maxLevel) {
            statsBuffer[PlayerStatID.CURRENT_XP] -= statsBuffer[PlayerStatID.NEXT_LEVEL_XP];
            statsBuffer[PlayerStatID.LEVEL]++;
            // Ensure nextLevelXp doesn't become 0 to avoid infinite loops
            statsBuffer[PlayerStatID.NEXT_LEVEL_XP] = Math.max(100, Math.floor(statsBuffer[PlayerStatID.NEXT_LEVEL_XP] * 1.2));
            levelUps++;
        }

        if (levelUps > 0) {
            console.log(`DING! Level up: ${levelUps}`);
            UiSounds.playLevelUp();
        }
    }, [refs]);

    // --- PAUSE SYNCHRONIZATION (VINTERDÖD FIX: Centralized Prop-to-Engine Bridge) ---
    useEffect(() => {
        const engine = refs.engineRef.current;
        if (engine) {
            engine.isSimulationPaused = props.isPaused;
            // Also pause rendering if hard-paused (screens like recap/death)
            if (props.isPaused && (props.currentGameState?.screen === 5 || props.currentGameState?.screen === 2)) {
                engine.isRenderingPaused = true;
            } else {
                engine.isRenderingPaused = false;
            }
        }
    }, [props.isPaused, props.currentGameState?.screen, refs]);

    const gainSp = useCallback((amount: number) => {
        const session = refs.gameSessionRef.current;
        if (!session) return;

        const tracker = session.getSystem<any>(SystemID.DAMAGE_TRACKER);
        if (tracker) tracker.recordSp(session, amount);

        // --- DOD: Atomic Increment in statsBuffer ---
        session.state.statsBuffer[PlayerStatID.SKILL_POINTS] += amount;
    }, [refs]);

    const gainScrap = useCallback((amount: number) => {
        const session = refs.gameSessionRef.current;
        if (!session) return;

        // --- DOD: Atomic Increment in statsBuffer ---
        const statsBuffer = session.state.statsBuffer;
        statsBuffer[PlayerStatID.SCRAP] += amount;
        statsBuffer[PlayerStatID.TOTAL_SCRAP_COLLECTED] += amount;
    }, [refs]);

    const closeModal = useCallback(() => {
        const { props: currentProps } = latestStateRef.current;
        if (currentProps.onInteractionStateChange) currentProps.onInteractionStateChange(null);

        // Core UI State Cleanup (Fixes "Modal doesn't close" bugs)
        updateUiState({
            activeModal: null,
            collectibleId: null,
            stationOverlay: null
        });

        const s = refs.gameSessionRef.current;
        if (s) {
            s.setSystemEnabled(SystemID.PLAYER_COMBAT, true);
            s.setSystemEnabled(SystemID.PLAYER_MOVEMENT, true);
            s.setSystemEnabled(SystemID.PLAYER_INTERACTION, true);
        }
        if (!currentProps.isMobileDevice && refs.containerRef.current) {
            refs.engineRef.current?.input.requestPointerLock(refs.containerRef.current);
        }
    }, [refs, updateUiState]);

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
                const hp = state.statsBuffer[PlayerStatID.HP];
                const maxHp = state.statsBuffer[PlayerStatID.MAX_HP];
                state.statsBuffer[PlayerStatID.HP] = Math.min(maxHp, hp + (payload.amount || 20));
                UiSounds.playConfirm();
                break;

            case 'SOUND':
            case 'PLAY_SOUND':
                const soundId = payload.id || action.id;
                if (soundId === 'explosion') {
                    WeaponSounds.playExplosion(refs.playerGroupRef.current?.position || _spawnPosScratch.set(0, 0, 0));
                    if ((window as any).haptic) (window as any).haptic.explosion();
                } else {
                    audioEngine.playSound(soundId || SoundID.UI_HOVER);
                }
                break;

            case 'GIVE_REWARD':
                if (payload.scrap) {
                    state.statsBuffer[PlayerStatID.SCRAP] += payload.scrap;
                    state.statsBuffer[PlayerStatID.TOTAL_SCRAP_COLLECTED] += payload.scrap;
                    state.sessionStats.scrapLooted += payload.scrap;
                }
                if (payload.xp) gainXp(payload.xp);
                if (payload.sp) gainSp(payload.sp);
                UiSounds.playConfirm();
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

                // Session-local state: Always set so the sector report reflects the rescue
                state.familyFound = true;
                state.sectorState.familyFound = true;

                // [VINTERDÖD GUARDRAIL] Only dispatch global event and play chime if not already rescued
                // This ensures rewards and permanent progression only happen once.
                if (!props.familyAlreadyRescued) {
                    window.dispatchEvent(new CustomEvent('family-member-found', {
                        detail: { id: targetId, name: targetName }
                    }));

                    if (targetName) {
                        spawnBubble(targetName + " " + t('ui.saved'), 3000);
                        audioEngine.playSound(SoundID.UI_CHIME);
                    }
                } else {
                    // On Replay: Still fire the event for internal GameSession follow logic
                    // but we could use a flag or just assume internal logic is safe.
                    // Actually, handleFamilyMemberFound only sets fm.found/following.
                    window.dispatchEvent(new CustomEvent('family-member-found', {
                        detail: { id: targetId, name: targetName, isReplay: true }
                    }));
                }
                break;
            }

            case 'START_CINEMATIC':
                const engine = refs.engineRef.current;
                let target: THREE.Object3D | null = null;
                const currentFMDef = refs.familyMemberRef.current;

                // --- VINTERDÖD FIX: NEW GAME+ / REPLAY LOGIC ---
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

                // [VINTERDÖD FIX] Only skip if ALREADY following during the current session
                if (isFollowing) {
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

                // Priority 1: Specific Family ID
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
                    const cinematicSystem = refs.gameSessionRef.current?.getSystem<any>(SystemID.CINEMATIC);
                    if (cinematicSystem) {
                        const sectorId = payload.sectorId ?? (latestStateRef.current.props.currentSector ?? 0);
                        const dialogueId = payload.scriptId ?? 0;
                        cinematicSystem.startCinematic(
                            target,
                            sectorId,
                            dialogueId,
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
                    spawnBubble(t('ui.wave_start'), 3000);
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

            case 'CONCLUDE_SECTOR':
                // Called manually from sector scripts (e.g. Sector 3 epilogue drive)
                concludeSector(payload?.isExtraction ?? false);
                break;

            default:
                // GENERIC BRIDGE: Pass unknown triggers directly to the sector's state memory
                if (actionType) {
                    state.sectorState.pendingTrigger = actionType;
                }
                break;
        }
    }, [concludeSector, gainXp, props.currentSectorData, props.familyAlreadyRescued, refs, spawnBubble]);

    // --- ZERO-GC DISCOVERY HANDLER ---
    const handleDiscovery = useCallback((type: string | number, id: any, titleKey: string, detailsKey: string, payload?: any) => {
        const state = refs.stateRef.current;
        const currentProps = latestStateRef.current.props;
        if (!state || !state.sessionStats || !state.discoverySets) return;

        const stats = state.sessionStats;
        const sets = state.discoverySets;
        let isNew = false;

        titleKey = titleKey || payload?.titleKey || '';
        detailsKey = detailsKey || payload?.detailsKey || '';

        // [VINTERDÖD FIX] Normalize type bridge to handle both numeric enums and string keys
        const normalizedType = typeof type === 'number' ?
            (type === DiscoveryType.ENEMY ? 'enemy' :
                type === DiscoveryType.BOSS ? 'boss' :
                    type === DiscoveryType.COLLECTIBLE ? 'collectible' :
                        type === DiscoveryType.POI ? 'poi' :
                            type === DiscoveryType.CLUE ? 'clue' : 'clue') : type;

        switch (normalizedType) {
            case 'enemy':
                const enemyId = Number(id);
                if (!sets.seenEnemies.has(enemyId)) {
                    sets.seenEnemies.add(enemyId);
                    if (stats.seenEnemies.indexOf(enemyId) === -1) stats.seenEnemies.push(enemyId);
                    isNew = true;
                    titleKey = DataResolver.getDiscoveryTitle(DiscoveryType.ENEMY);
                    detailsKey = DataResolver.getZombieName(enemyId);
                    if (currentProps.onEnemyDiscovered) currentProps.onEnemyDiscovered(enemyId);
                }
                break;
            case 'boss':
                const bossId = Number(id);
                if (!sets.seenBosses.has(bossId)) {
                    sets.seenBosses.add(bossId);
                    if (stats.seenBosses.indexOf(bossId) === -1) stats.seenBosses.push(bossId);
                    isNew = true;
                    titleKey = DataResolver.getDiscoveryTitle(DiscoveryType.BOSS);
                    detailsKey = DataResolver.getBossName(bossId);
                    if (currentProps.onBossDiscovered) currentProps.onBossDiscovered(bossId);
                }
                break;
            case 'collectible':
                titleKey = DataResolver.getDiscoveryTitle(DiscoveryType.COLLECTIBLE);
                detailsKey = detailsKey || payload?.detailsKey || DataResolver.getCollectibleName(id);

                if (!sets.collectibles.has(id)) {
                    sets.collectibles.add(id);
                    stats.collectiblesDiscovered.push(id);
                    state.sessionCollectiblesDiscovered.push(id);
                    isNew = true;
                }

                // [VINTERDÖD FIX] Collectibles are now managed purely via App.tsx props
                // ALWAYS trigger the prop callback to ensure the modal opens (even on replays),
                // but rely on App.tsx to deduplicate the permanent reward logic.
                if (currentProps.onCollectibleDiscovered) currentProps.onCollectibleDiscovered(id);
                break;
            case 'poi':
                titleKey = DataResolver.getDiscoveryTitle(DiscoveryType.POI);
                detailsKey = payload.detailsKey || DataResolver.getPoiName(id);
                if (!sets.pois.has(id)) {
                    sets.pois.add(id);
                    if (!stats.discoveredPOIs.includes(id)) {
                        stats.discoveredPOIs.push(id);
                        isNew = true;
                    }
                    if (currentProps.onPOIdiscovered) currentProps.onPOIdiscovered(payload || id);
                }
                break;
            case 'clue':
                titleKey = DataResolver.getDiscoveryTitle(DiscoveryType.CLUE);
                detailsKey = detailsKey || 'ui.clue_found';
                if (!sets.clues.has(id)) {
                    sets.clues.add(id);
                    const cluePayload = payload || { id, content: detailsKey };
                    // Deduplicate session stats logic
                    const exists = stats.cluesFound.some((c: any) => c.id === id);
                    if (!exists) {
                        stats.cluesFound.push(cluePayload);
                        isNew = true;
                    }
                    if (currentProps.onClueDiscovered) currentProps.onClueDiscovered(cluePayload);
                }
                break;
        }

        if (isNew && currentProps.settings?.showDiscoveryPopups !== false) {
            audioEngine.playSound(SoundID.PASSIVE_GAINED);

            // [VINTERDÖD FIX] Correctly map normalized types back to DiscoveryType for the UI Queue
            let finalType = DiscoveryType.CLUE;
            if (normalizedType === 'enemy') finalType = DiscoveryType.ENEMY;
            else if (normalizedType === 'boss') finalType = DiscoveryType.BOSS;
            else if (normalizedType === 'collectible') finalType = DiscoveryType.COLLECTIBLE;
            else if (normalizedType === 'poi') finalType = DiscoveryType.POI;

            // Push to queue instead of overwriting directly
            (refs as any).discoveryQueueRef.current.push({
                id,
                type: finalType,
                title: titleKey,
                details: detailsKey,
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
                UiSounds.playConfirm();
                setTimeout(() => {
                    currentProps.onSectorEnded({
                        timeElapsed: 0,
                        shotsFired: 0,
                        shotsHit: 0,
                        throwablesThrown: 0,
                        scrapLooted: 0,
                        xpGained: 0,
                        bonusXp: 0,
                        familyFound: false,
                        familyExtracted: false,
                        damageDealt: 0,
                        damageTaken: 0,
                        bossDamageDealt: 0,
                        bossDamageTaken: 0,
                        distanceTraveled: refs.distanceTraveledRef.current,
                        cluesFound: [],
                        collectiblesDiscovered: [],
                        isExtraction: false,
                        spEarned: 0,
                        seenEnemies: [],
                        discoveredPOIs: [],
                        aborted: true,
                        seenBosses: []
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
                    startTime: WinterEngine.getInstance().renderTime
                };

                const bossNameKey = boss.bossId !== undefined ? DataResolver.getBossName(boss.bossId) : 'BOSS';
                updateUiState({
                    bossIntroActive: true,
                    bossName: t(bossNameKey)
                });
                audioEngine.stopMusic();

                if (boss.bossId !== undefined) audioEngine.playSound(SoundID.ZOMBIE_GROWL_TANK);
                else audioEngine.playSound(SoundID.ZOMBIE_GROWL_TANK);

                if (refs.bossIntroTimerRef.current) clearTimeout(refs.bossIntroTimerRef.current);
                refs.bossIntroTimerRef.current = setTimeout(() => {
                    refs.bossIntroRef.current.active = false;
                    updateUiState({ bossIntroActive: false });

                    const currentProps = latestStateRef.current.props;
                    const sectorData = (currentProps as any).currentSectorData || { environment: { bossMusic: MusicID.BOSS_FIGHT } };
                    audioEngine.playMusic(sectorData.environment.bossMusic || MusicID.BOSS_FIGHT);
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
                const statsSystem = refs.gameSessionRef.current.getSystem<PlayerStatsSystem>(SystemID.PLAYER_STATS);
                if (statsSystem) statsSystem.updatePassives(refs.gameSessionRef.current);
            }
        };

        const handleKeepCamera = (e: any) => {
            const { targetPos, lookAtPos, duration } = e.detail || {};
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
                        window.dispatchEvent(new CustomEvent('spawn-bubble', {
                            detail: { text: `🧠 ${introText}`, duration: currentSector.intro!.duration || 4000 }
                        }));
                        if (currentSector.intro!.sound) audioEngine.playSound(currentSector.intro!.sound as any);
                    }
                }, currentSector.intro.delay || 1500);
            }
        }
    }, [props.isGameRunning, props.isPaused, uiState.isSectorLoading, props.currentSector]);

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
                GameSessionSetup.respawnPlayer(session, engine, state, refs, props, (phase) => updateUiState({ deathPhase: phase as any }));
            }
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

                    // VINTERDÖD FIX: Removed HudStore manual syncs!
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
                    },
                    onAction: (action: any) => onAction(action),
                    handleTriggerAction: (action: any, scene: THREE.Scene) => {
                        onAction(action);
                    },
                    startCinematic: (mesh: any, sectorId?: number, dialogueId?: number, params?: any) => {
                        const sys = refs.gameSessionRef.current?.getSystem<any>(SystemID.CINEMATIC);
                        sys?.startCinematic(mesh, sectorId ?? 0, dialogueId ?? 0, params);
                    },
                    playCinematicLine: (index: number) => {
                        const sys = refs.gameSessionRef.current?.getSystem<any>(SystemID.CINEMATIC);
                        sys?.playLine(index);
                    },
                    endCinematic: () => {
                        const cinematicSystem = refs.gameSessionRef.current?.getSystem<any>(SystemID.CINEMATIC);
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
                    onBossKilled: (id: number) => {
                        audioEngine.stopMusic();
                        const pProps = latestStateRef.current.props;
                        const sectorData = pProps.currentSectorData || SectorSystem.getSector(pProps.currentSector || 0);
                        if (sectorData?.ambientLoop) audioEngine.playMusic(sectorData.ambientLoop);
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
                spawnParticle,
                spawnDecal,
                showDamageText,
                t,
                spawnBubble: (text: string, duration?: number) => {
                    window.dispatchEvent(new CustomEvent('spawn-bubble', { detail: { text, duration: duration || 3000 } }));
                },
                onAction: (action: any) => setupContextRef.current?.callbacks.onAction(action),
                onDiscovery: handleDiscovery,
                onDeathStateChange: props.onDeathStateChange,
                gainSp,
                gainScrap,
                // --- VINTERDÖD FIX: NEW STABLE CALLBACKS FOR SECTOR LOGIC ---
                spawnZombie: (type: any, pos: any) => refs.sectorContextRef.current?.spawnZombie(type, pos),
                spawnHorde: (count: number, type: any, pos: any) => refs.sectorContextRef.current?.spawnHorde(count, type, pos),
                setNotification: (n: any) => {
                    window.dispatchEvent(new CustomEvent('spawn-bubble', { detail: { text: n.text, duration: n.duration || 3000 } }));
                },
                setInteraction: (interaction: any) => {
                    const s = refs.stateRef.current;
                    if (interaction) {
                        s.interaction.active = true;
                        s.interaction.id = interaction.id;
                        s.interaction.type = interaction.type;
                        s.interaction.label = interaction.label;
                        if (interaction.position) s.interactionTargetPos.copy(interaction.position);
                    } else {
                        s.interaction.active = false;
                    }
                },
                setOverlay: (type: string | null) => props.onInteractionStateChange?.(type),
                playSound: (id: any) => audioEngine.playSound(id),
                playTone: (freq: number, type: any, duration: number, vol?: number) => (audioEngine as any).playTone?.(freq, type, duration, vol),
                cameraShake: (amount: number, type?: any) => engine.camera.shake(amount, type || 'general'),
                startCinematic: (target: any, sectorId: number, dialogueId?: number, params?: any) => {
                    if (refs.cinematicRef.current.active) return;
                    refs.cinematicRef.current.active = true;
                    refs.cinematicRef.current.target = target;
                    refs.cinematicRef.current.sectorId = sectorId;
                    refs.cinematicRef.current.dialogueId = dialogueId || 0;
                    refs.cinematicRef.current.params = params;
                },
                setCameraOverride: (params: any) => {
                    refs.cameraOverrideRef.current = params;
                },
                makeNoise: (pos: any, type: any, radius?: number) => session.makeNoise(pos, type, radius || 10)
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
            if (!hData.discovery || !hData.discovery.active) {
                const next = queue.shift();
                if (next) {
                    HudStore.update({
                        ...hData,
                        discovery: { ...next, active: true }
                    });
                }
            }
        }, 500);
        return () => clearInterval(interval);
    }, [refs]);

    return (
        <>
            <GameSessionUI refs={refs} uiState={uiState} gameProps={props} callbacks={uiCallbacks} />
        </>
    );
});

export default GameSession;