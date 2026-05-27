import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { PlayerStats, PlayerStatID } from '../../entities/player/PlayerTypes';;
import { WeaponID } from '../../entities/player/CombatTypes';
import { PLAYER_CHARACTER } from '../../content/constants';
import { UiSounds, AmbientSounds, VoiceSounds } from '../../utils/audio/AudioLib';
import { audioEngine } from '../../utils/audio/AudioEngine';
import { DataResolver } from '../../core/data/DataResolver';
import { t } from '../../utils/i18n';
import { createProceduralTextures } from '../../utils/assets';
import { WinterEngine, GameSettings } from '../../core/engine/WinterEngine';
import { CampWorld } from './CampWorld';
import { CampEffectsState, CAMP_SCENE } from './CampWorld';
import { WeatherType } from '../../core/engine/EngineTypes';
import { PerformanceMonitor } from '../../systems/PerformanceMonitor';
import { CampEffectsSystem, CampFamilyAnimationSystem, CampChatterSystem } from './CampSystems';
import { SystemID } from '../../systems/System';

// Zero-GC Scratchpads
const _v1 = new THREE.Vector3();
const _campCtx: any = { dynamicLights: [] };

// Pre-allocated timer context objects — set callbacks wired once per mount.
// Avoids creating { val, set } + arrow-function allocations on every frame.
const _nextChatterTimeCtx: { val: number; set: (v: number) => void } = { val: 0, set: () => {} };
const _nextWildlifeTimeCtx: { val: number; set: (v: number) => void } = { val: 0, set: () => {} };

/** Safe O(1) WEAPONS lookup via DataResolver */
const weaponName = (id: number): string => DataResolver.getDamageName(id);

// Import UI Components
import CampHUD from '../ui/hud/CampHUD';
import { OverlayType } from '../ui/hud/HudTypes';
import { StatsBridge } from '../../core/data/StatsBridge';

interface CampProps {
    stats: PlayerStats;
    currentLoadout: { primary: WeaponID; secondary: WeaponID; throwable: WeaponID; special: WeaponID; };
    weaponLevels: Record<WeaponID, number>;
    onSaveStats: (newStats: PlayerStats) => void;
    onSaveLoadout: (loadout: { primary: WeaponID; secondary: WeaponID; throwable: WeaponID; special: WeaponID; }, levels: Record<WeaponID, number>) => void;
    onSelectSector: (sectorIndex: number) => void;
    onStartSector: () => void;
    currentSector: number;
    debugMode: boolean;
    onToggleDebug: (val: boolean) => void;
    rescuedFamilyIndices: number[];
    isSectorLoaded: boolean;
    deadBossIndices: number[];
    onResetGame: () => void;
    onSaveGraphics: (graphics: GameSettings) => void;
    settings?: GameSettings;
    onCampLoaded?: () => void;
    isMobileDevice?: boolean;
    weather: WeatherType;
    hasCheckpoint?: boolean;
    isGameRunning?: boolean;
    activeOverlay: string | null;
    setActiveOverlay: (type: any) => void;
    onInteractionStateChange: (type: string | null) => void;
}

const areEqual = (prevProps: CampProps, nextProps: CampProps) => {
    return prevProps.stats === nextProps.stats &&
        prevProps.currentLoadout === nextProps.currentLoadout &&
        prevProps.currentSector === nextProps.currentSector &&
        prevProps.activeOverlay === nextProps.activeOverlay &&
        prevProps.weather === nextProps.weather &&
        prevProps.isGameRunning === nextProps.isGameRunning;
    // Ignore debugMode, rescuedFamilyIndices (handled via effects/Store)
};

const Camp: React.FC<CampProps> = ({ stats, currentLoadout, onSaveStats, currentSector, debugMode, onToggleDebug, rescuedFamilyIndices, settings, onCampLoaded, isMobileDevice, weather, hasCheckpoint, isGameRunning = true, activeOverlay, setActiveOverlay, onInteractionStateChange }) => {
    const monitor = PerformanceMonitor.getInstance();

    const containerRef = useRef<HTMLDivElement>(null);
    const chatOverlayRef = useRef<HTMLDivElement>(null);
    const lastDrawCallsRef = useRef(0);

    const [hoveredStation, setHoveredStation] = useState<string | null>(null);

    // Note: We only store text data in state now. Coordinates are handled via DOM Refs to prevent re-renders.
    const [tooltipData, setTooltipData] = useState<{ text: string, subText?: string } | null>(null);
    const tooltipDOMRef = useRef<HTMLDivElement>(null);

    const [showIdleTooltips, setShowIdleTooltips] = useState(false);
    const showIdleTooltipsRef = useRef(false);
    const idleTooltipDOMRefs = useRef<(HTMLDivElement | null)[]>([]);

    const [graphics, setGraphics] = useState<GameSettings>(settings || WinterEngine.getInstance().getSettings());

    // Renderer Ref for live updates
    const engineRef = useRef<WinterEngine | null>(null);

    // Idle UI State
    const [isIdle, setIsIdle] = useState(false);
    const isIdleRef = useRef(false);
    const lastInputRef = useRef(Date.now());

    const hoveredRef = useRef<string | null>(null);
    const activeOverlayRef = useRef<string | null>(null);

    const nextChatterTime = useRef<number>(0); // First chatter soon
    const nextWildlifeTime = useRef<number>(15000); // Start wildlife after 15s
    const activeChats = useRef<Array<{ id: string, mesh: THREE.Object3D, text: string, startTime: number, duration: number, element: HTMLDivElement, playedSound: boolean }>>([]);

    const envStateRef = useRef<CampEffectsState | null>(null);
    const debugModeRef = useRef(debugMode);
    useEffect(() => { debugModeRef.current = debugMode; }, [debugMode]);

    const textures = useMemo(() => createProceduralTextures(), []);

    // Refs for scene data shared between build and interactivity effects
    const sceneInteractablesRef = useRef<THREE.Mesh[]>([]);
    const sceneOutlinesRef = useRef<Record<string, THREE.LineSegments>>({});
    const sceneOutlineKeysRef = useRef<string[]>([]);
    const sceneFamilyMembersRef = useRef<any[]>([]);
    const sceneActiveMembersRef = useRef<any[]>([]);
    const sceneBaseLookAtRef = useRef(CAMP_SCENE.cameraBaseLookAt);
    const sceneCinematicLookAtRef = useRef(CAMP_SCENE.cameraCinematicLookAt);

    useEffect(() => { isIdleRef.current = isIdle; }, [isIdle]);
    useEffect(() => { activeOverlayRef.current = activeOverlay; }, [activeOverlay]);

    useEffect(() => {
        if (isGameRunning) {
            audioEngine.resume();
            AmbientSounds.startCampfire();
        }
        return () => AmbientSounds.stopCampfire();
    }, [isGameRunning]);

    // Idle Timer
    useEffect(() => {
        const handleInput = () => { lastInputRef.current = Date.now(); if (isIdle) setIsIdle(false); };
        window.addEventListener('mousemove', handleInput); window.addEventListener('mousedown', handleInput); window.addEventListener('keydown', handleInput); window.addEventListener('touchstart', handleInput, { passive: true });
        const idleTimer = setInterval(() => { if (!isIdle && Date.now() - lastInputRef.current > 10000) setIsIdle(true); }, 1000);
        return () => { window.removeEventListener('mousemove', handleInput); window.removeEventListener('mousedown', handleInput); window.removeEventListener('keydown', handleInput); window.removeEventListener('touchstart', handleInput); clearInterval(idleTimer); };
    }, [isIdle]);

    const setupCounterRef = useRef(0);
    const campStateRef = useRef<any>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        const container = containerRef.current;
        const engine = WinterEngine.getInstance();

        setupCounterRef.current++;
        const currentSetupId = setupCounterRef.current;
        let active = true;

        while (container.firstChild) container.removeChild(container.firstChild);

        // --- ENGINE & RENDERER ---
        engine.updateSettings(graphics);
        engine.clearUpdateContext(); // HARSH RESET: Prevent state leakage during mount
        engine.mount(container);

        // Ensure systems are attached to the current scene immediately
        engine.syncSystemsToScene(engine.scene);
        engineRef.current = engine;

        const scene = engine.scene;
        const camera = engine.camera;

        const debugUnsubscribeRef = { current: null as (() => void) | null };

        // Reset & Setup Scene via CampWorld
        const setup = async () => {
            if (currentSetupId !== setupCounterRef.current) return;

            // ARCHITECTURAL UNIFICATION: Provide a minimal RuntimeState for the Camp
            const campState: any = {
                simTime: 0, renderTime: 0, lastSimDelta: 0.016, lastRenderDelta: 0.016,
                playerPos: camera.threeCamera.position, isDodging: false,
                isDead: false, staminaRatio: 1.0, hp: 100, maxHp: 100
            };
            campStateRef.current = campState;
            _campCtx.state = campState;
            _campCtx.camera = camera;
            _campCtx.playerPos = camera.threeCamera.position;
            _campCtx.dynamicLights.length = 0; // reset on each setup
            engine.onUpdateContext = _campCtx;

            engine.resetTime();
            const { interactables, outlines, envState } = await CampWorld.build(scene, textures, weather);

            if (!active || setupCounterRef.current !== currentSetupId || !container.parentElement) return;

            // Register the campfire light into the persistent dynamic lights array.
            // We push into _campCtx.dynamicLights directly (not reassign campState.dynamicLights)
            // because engine.onUpdateContext already holds a reference to _campCtx.
            _campCtx.dynamicLights.length = 0;
            if (envState && envState.fireLight) {
                _campCtx.dynamicLights.push(envState.fireLight);
            }
            campState.dynamicLights = _campCtx.dynamicLights;

            envStateRef.current = envState;

            // Setup Family Members
            const setupFamily = () => {
                const curDebug = (window as any).HudStore?.getState().debugMode ?? debugModeRef.current;
                const { familyMembers, interactables, activeMembers } = CampWorld.setupFamilyMembers(
                    scene, rescuedFamilyIndices, curDebug, PLAYER_CHARACTER, DataResolver.getFamilyMembers()
                );
                return { familyMembers, familyInteractables: interactables, activeMembers };
            };

            const { familyMembers, familyInteractables, activeMembers } = setupFamily();
            sceneFamilyMembersRef.current = familyMembers;
            sceneActiveMembersRef.current = activeMembers;
            sceneInteractablesRef.current = [...interactables, ...familyInteractables];

            // Listen for debug mode changes
            debugUnsubscribeRef.current = (window as any).HudStore?.subscribe((state: any) => {
                if (state.debugMode !== debugModeRef.current) {
                    debugModeRef.current = state.debugMode;

                    const fmWrappers = sceneFamilyMembersRef.current;
                    const rescuedIndices = rescuedFamilyIndices;
                    const familyData = DataResolver.getFamilyMembers();

                    // Rebuild interaction and active lists based on new visibility
                    const nextInteractables = [...interactables]; // base camp interactables
                    const nextActiveMembers: any[] = [];

                    for (let i = 0; i < fmWrappers.length; i++) {
                        const fm = fmWrappers[i];
                        const isPlayer = fm.mesh.userData.id.startsWith('player_');

                        if (isPlayer) {
                            fm.mesh.visible = true;
                            nextActiveMembers.push(fm);
                        } else {
                            const familyIdx = familyData.findIndex(d => d.name === fm.name);
                            const isRescued = rescuedIndices.includes(familyIdx);
                            const visible = isRescued || state.debugMode;

                            fm.mesh.visible = visible;

                            if (visible) {
                                if (familyIdx !== -1) nextActiveMembers.push(fm);

                                // Direct child traversal to find interaction mesh
                                for (let c = 0; c < fm.mesh.children.length; c++) {
                                    const child = fm.mesh.children[c];
                                    if (child.userData.isBody) nextInteractables.push(child as THREE.Mesh);
                                }
                            }
                        }
                    }

                    sceneInteractablesRef.current = nextInteractables;
                    sceneActiveMembersRef.current = nextActiveMembers;
                }
            });

            if (!active || setupCounterRef.current !== currentSetupId) return;

            engine.syncSystemsToScene(scene);

            const allInteractables = [...interactables, ...familyInteractables];
            const aspect = container.clientWidth / container.clientHeight;
            if (aspect < 1.0) {
                camera.set('fov', 68); camera.setPosition(0, 10, 28, true);
            } else {
                camera.set('fov', 50); camera.setPosition(0, 10, 22, true);
            }

            sceneInteractablesRef.current = allInteractables;
            sceneOutlinesRef.current = outlines;
            sceneOutlineKeysRef.current = Object.keys(outlines);
            sceneFamilyMembersRef.current = familyMembers;
            sceneActiveMembersRef.current = activeMembers;

            engine.registerSystem(SystemID.CAMP_EFFECT_MANAGER, new CampEffectsSystem());
            engine.registerSystem(SystemID.CAMP_FAMILY_ANIMATION, new CampFamilyAnimationSystem());
            engine.registerSystem(SystemID.CAMP_CHATTER, new CampChatterSystem());

            // --- VINTERDÖD FIX: Signal ready only AFTER async build is complete ---
            if (onCampLoaded) onCampLoaded();
        };

        setup();

        return () => {
            active = false;
            if (debugUnsubscribeRef.current) debugUnsubscribeRef.current();
            const engine = WinterEngine.getInstance();
            engine.unregisterSystem(SystemID.CAMP_EFFECT_MANAGER);
            engine.unregisterSystem(SystemID.CAMP_FAMILY_ANIMATION);
            engine.unregisterSystem(SystemID.CAMP_CHATTER);
        };

    }, [rescuedFamilyIndices, textures]);

    // --- INTERACTIVITY EFFECT: Registers loop + events ---
    useEffect(() => {
        const engine = engineRef.current;
        if (!engine || !containerRef.current) return;

        const container = containerRef.current;
        const scene = engine.scene;
        const camera = engine.camera;

        // Wire up Zero-GC timer context callbacks once per mount.
        // The closures capture stable React refs — safe to assign once.
        _nextChatterTimeCtx.set = (v: number) => { nextChatterTime.current = v; _nextChatterTimeCtx.val = v; };
        _nextWildlifeTimeCtx.set = (v: number) => { nextWildlifeTime.current = v; _nextWildlifeTimeCtx.val = v; };
        _campCtx.nextChatterTime = _nextChatterTimeCtx;
        _campCtx.nextWildlifeTime = _nextWildlifeTimeCtx;

        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2(-1000, -1000);
        let mouseMoved = false;
        let lastRaycastTime = 0

        const onMM = (e: MouseEvent) => {
            if (!isGameRunning) return;

            mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

            mouseMoved = true;
        };

        const onCL = () => {
            if (!isGameRunning || activeOverlayRef.current) return;
            const hovered = hoveredRef.current;
            if (hovered) {
                if (hovered.startsWith('family_') || hovered.startsWith('player_')) {
                    const familyMembers = sceneFamilyMembersRef.current;
                    const fmWrapper = familyMembers.find((fm: any) => fm.mesh.userData.id === hovered);
                    if (fmWrapper) { fmWrapper.bounce = 1; VoiceSounds.playDialogueBeep(fmWrapper.mesh.userData.name); }
                } else {
                    UiSounds.playConfirm();
                    const typeMap: Record<string, OverlayType> = {
                        'armory': OverlayType.STATION_ARMORY,
                        'skills': OverlayType.STATION_SKILLS,
                        'sectors': OverlayType.STATION_SECTORS,
                        'stats': OverlayType.STATION_STATISTICS,
                        'adventure_log': OverlayType.ADVENTURE_LOG,
                        'settings': OverlayType.SETTINGS
                    };
                    onInteractionStateChange(typeMap[hovered] || OverlayType.NONE);
                }
            }
        };

        const onTS = (e: TouchEvent) => {
            if (!isGameRunning || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const touch = e.touches[0];
            mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera.threeCamera);
            const hits = raycaster.intersectObjects(sceneInteractablesRef.current);
            if (hits.length > 0) {
                let target: any = hits[0].object;
                if (target.userData.groupId) {
                    hoveredRef.current = target.userData.groupId;
                } else {
                    if (!target.userData.id && target.parent && target.parent.userData.id) target = target.parent;
                    hoveredRef.current = target.userData.id;
                }
            }

            onCL();
        };

        const onResize = () => {
            const width = container.clientWidth;
            const height = container.clientHeight;
            const aspect = width / height;
            camera.set('aspect', aspect);

            if (aspect < 1.0) {
                camera.set('fov', 68);
                camera.setPosition(0, 10, 28, false);
            } else {
                camera.set('fov', 50);
                camera.setPosition(0, 10, 22, false);
            }

            engine.renderer.setSize(width, height);
        };

        window.addEventListener('mousemove', onMM);
        window.addEventListener('click', onCL);
        window.addEventListener('touchstart', onTS, { passive: false });
        window.addEventListener('resize', onResize);

        engine.onUpdate = (dt: number, simTime: number, renderTime: number) => {
            const frameStart = performance.now();
            if (nextWildlifeTime.current === 0) {
                nextWildlifeTime.current = renderTime + 5000 + Math.random() * 10000;
            }
            const familyMembers = sceneFamilyMembersRef.current;
            const interactables = sceneInteractablesRef.current;
            const outlines = sceneOutlinesRef.current;
            const outlineKeys = sceneOutlineKeysRef.current;

            // Zero-GC for Camp context
            const campState = campStateRef.current;
            if (campState) {
                campState.simTime = simTime;
                campState.renderTime = renderTime;
                campState.lastSimDelta = dt;
                campState.lastRenderDelta = dt;
                campState.playerPos = camera.threeCamera.position;
            }

            _campCtx.scene = scene;
            _campCtx.state = campState;
            _campCtx.camera = camera.threeCamera;
            _campCtx.container = container;
            _campCtx.envState = envStateRef.current;

            // ARCHITECTURAL FIX: LightSystem prioritizes 'state.dynamicLights'.
            // By updating the campState directly, we ensure the lights are picked up even before React re-renders.
            // campState.dynamicLights is assigned to _campCtx.dynamicLights once during setup to be 100% Zero-GC.

            _campCtx.playerPos = camera.threeCamera.position;
            _campCtx.familyMembers = familyMembers;
            _campCtx.activeMembers = sceneActiveMembersRef.current;
            _campCtx.activeChats = activeChats.current;
            _campCtx.chatOverlay = chatOverlayRef.current;
            _campCtx.isGameRunning = isGameRunning;
            // Zero-GC: mutate pre-allocated objects — no new objects or closures per frame.
            _nextChatterTimeCtx.val = nextChatterTime.current;
            _nextWildlifeTimeCtx.val = nextWildlifeTime.current;
            _campCtx.hoveredId = hoveredRef.current

            // Tell engine to update the systems:
            engine.onUpdateContext = _campCtx;

            // Camera logic (still manual for now due to complex state)
            const CINEMATIC_LOOK_AT = sceneCinematicLookAtRef.current;
            const BASE_LOOK_AT = sceneBaseLookAtRef.current;
            const targetLookAt = isIdleRef.current ? CINEMATIC_LOOK_AT : BASE_LOOK_AT;
            camera.set('lookSpeed', isIdleRef.current ? 0.2 : 3.0);
            camera.lookAt(targetLookAt.x, targetLookAt.y, targetLookAt.z);

            monitor.begin('raycasting');

            if (isGameRunning && !activeOverlayRef.current) {
                if (mouseMoved && (renderTime - lastRaycastTime > 100)) {
                    lastRaycastTime = renderTime;
                    mouseMoved = false;

                    raycaster.setFromCamera(mouse, camera.threeCamera);
                    const hits = raycaster.intersectObjects(interactables);
                    const width = container.clientWidth;
                    const height = container.clientHeight;

                    let newHover = null, toolTipText = '', toolTipSubText = '', tooltipX = 0, tooltipY = 0;

                    if (hits.length > 0) {
                        let target: any = hits[0].object;
                        if (!target.userData.id && target.parent && target.parent.userData.id) target = target.parent;
                        newHover = target.userData.id;
                        if (newHover) {
                            const isMember = newHover.startsWith('family_') || newHover.startsWith('player_');
                            if (isMember) {
                                toolTipText = t(target.userData.name);
                            } else {
                                toolTipText = t(`stations.${target.userData.name || newHover}`);
                                if (newHover === 'armory') {
                                    toolTipSubText = `${t(weaponName(currentLoadout.primary))} • ${t(weaponName(currentLoadout.secondary))} • ${t(weaponName(currentLoadout.throwable))}${currentLoadout.special !== 'none' ? ` • ${t(weaponName(currentLoadout.special))}` : ''}`;
                                } else if (newHover === 'adventure_log') {
                                    const totalCollectibles = StatsBridge.getCollectiblesDiscoveredLength(stats);
                                    const totalClues = StatsBridge.getDiscoveredClues(stats).length;
                                    const totalPois = StatsBridge.getDiscoveredPois(stats).length;
                                    const totalEnemies = StatsBridge.getDiscoveredZombies(stats).length;
                                    const totalBosses = StatsBridge.getDiscoveredBosses(stats).length;
                                    toolTipSubText = `${t('camp_tooltips.collectibles')}: ${totalCollectibles} • ${t('camp_tooltips.clues')}: ${totalClues} • ${t('camp_tooltips.poi')}: ${totalPois} • ${t('camp_tooltips.enemies')}: ${totalEnemies} • ${t('camp_tooltips.bosses')}: ${totalBosses}`;
                                } else if (newHover === 'sectors') {
                                    const finishedSectors = StatsBridge.getSectorsCompleted(stats);
                                    toolTipSubText = `${t('camp_tooltips.finished_sectors')}: ${finishedSectors} • ${t('camp_tooltips.selected_sector')}: ${t(DataResolver.getSectorName(currentSector))}`;
                                } else if (newHover === 'skills') {
                                    toolTipSubText = `${t('camp_tooltips.vitality')}: ${StatsBridge.getMaxHP(stats)} • ${t('camp_tooltips.adrenaline')}: ${StatsBridge.getMaxStamina(stats)} • ${t('camp_tooltips.reflexes')}: ${StatsBridge.getSpeed(stats).toFixed(1)} ${t('ui.speed_unit')}`;
                                }
                            }
                            const vec = _v1; target.getWorldPosition(vec); vec.y += 1.8; vec.project(camera.threeCamera);
                            tooltipX = (vec.x * 0.5 + 0.5) * width;
                            tooltipY = (-(vec.y * 0.5) + 0.5) * height;
                        }
                    }

                    // --- DIRECT DOM MANIPULATION FOR PERFORMANCE ---
                    // Only trigger a React state change if the actual hover target changed
                    if (newHover !== hoveredRef.current) {
                        if (newHover) UiSounds.playHover();
                        hoveredRef.current = newHover;
                        setHoveredStation(newHover);
                        setTooltipData(newHover ? { text: toolTipText, subText: toolTipSubText } : null);
                    }

                    // Update coordinates directly on the DOM element via ref (Bypasses React completely = Zero GC / Re-render)
                    if (newHover && tooltipDOMRef.current) {
                        tooltipDOMRef.current.style.left = `${tooltipX}px`;
                        tooltipDOMRef.current.style.top = `${tooltipY}px`;
                    }

                    for (let i = 0; i < outlineKeys.length; i++) {
                        outlines[outlineKeys[i]].visible = (hoveredRef.current === outlineKeys[i]);
                    }

                    /*
                    // --- MOBILE LABELS DOM MANIPULATION ---
                    if (isMobileLabels !== showIdleTooltipsRef.current) {
                        showIdleTooltipsRef.current = !!isMobileLabels;
                        setShowIdleTooltips(!!isMobileLabels);
                    }
    
                    if (isMobileLabels && showIdleTooltipsRef.current) {
                        for (let i = 0; i < CAMP_SCENE.stationPositions.length; i++) {
                            const station = CAMP_SCENE.stationPositions[i];
                            const vec = _v1.copy(station.pos);
                            vec.y += 2.2;
                            vec.project(camera.threeCamera);
    
                            const el = idleTooltipDOMRefs.current[i];
                            if (el) {
                                el.style.left = `${(vec.x * 0.5 + 0.5) * width}px`;
                                el.style.top = `${(-(vec.y * 0.5) + 0.5) * height}px`;
                            }
                        }
                    }
                    */
                }

            } else {
                if (hoveredRef.current !== null) {
                    hoveredRef.current = null;
                    setHoveredStation(null);
                    setTooltipData(null);
                    for (let i = 0; i < outlineKeys.length; i++) { outlines[outlineKeys[i]].visible = false; }
                }
            }
            monitor.end('raycasting');

            lastDrawCallsRef.current = engine.renderer.info.render.calls;
            monitor.printIfHeavy('Camp Performance', performance.now() - frameStart, 50);
        };

        return () => {
            window.removeEventListener('mousemove', onMM);
            window.removeEventListener('click', onCL);
            window.removeEventListener('touchstart', onTS);
            window.removeEventListener('resize', onResize);
            if (engineRef.current) engineRef.current.clearUpdateContext();
            // NOTE: ChunkManager.clear() is intentionally NOT called here.
            // This cleanup runs on every isGameRunning/stats/loadout change, including
            // the warmup-complete transition, which would wipe the camp trees.
            // Camp→Sector cleanup is handled by GameSessionLoop and CampWorld.build().
        };
    }, [isGameRunning, stats, currentLoadout, currentSector]);

    const closeModal = () => { UiSounds.playClick(); setActiveOverlay(OverlayType.NONE); };

    return (
        <div className={`relative w-full h-full bg-black font-sans overflow-hidden`} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
            <div ref={containerRef} className="absolute inset-0" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }} />
            <div ref={chatOverlayRef} className={`absolute inset-0 pointer-events-none z-40 overflow-hidden transition-opacity duration-1000 ${isIdle ? 'opacity-0' : 'opacity-100'}`} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 40 }} />

            {/* Standard Hover Tooltip - Position driven by ref to avoid re-renders */}
            {tooltipData && tooltipData.text && !isIdle && (
                <div ref={tooltipDOMRef} className="absolute pointer-events-none z-50 flex flex-col items-center -translate-x-1/2 -translate-y-full mb-2">
                    <div className="bg-black/90 border-2 border-black px-4 py-1 text-white font-black uppercase tracking-wider text-lg md:text-xl shadow-2xl">
                        {tooltipData.text}
                    </div>
                    {tooltipData.subText && (
                        <div className="bg-black/80 border-x-2 border-b-2 border-black px-3 py-1 text-slate-400 font-bold uppercase text-[10px] md:text-xs whitespace-nowrap shadow-xl">
                            {tooltipData.subText}
                        </div>
                    )}
                    <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-black mt-[-1px]"></div>
                </div>
            )}

            {/* Mobile Station Labels (Floating Tooltips) - Position driven by refs */}
            {showIdleTooltips && CAMP_SCENE.stationPositions.map((station, i) => (
                <div
                    key={station.id}
                    ref={el => idleTooltipDOMRefs.current[i] = el}
                    className="absolute pointer-events-none z-50 flex flex-col items-center -translate-x-1/2 -translate-y-full mb-2 animate-[fadeIn_1s_ease-out_forwards]"
                >
                    <div className="bg-black/90 border-2 border-black px-3 py-1 text-white font-black uppercase tracking-wider text-sm shadow-2xl">
                        {t(`stations.${station.id}`)}
                    </div>
                    <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-black mt-[-1px]"></div>
                </div>
            ))}

            {!activeOverlay && (
                <CampHUD
                    stats={stats} hoveredStation={hoveredStation} currentSectorName={t(DataResolver.getSectorName(currentSector))} hasCheckpoint={!!hasCheckpoint} isIdle={isIdle}
                    currentLoadoutNames={{ pri: t(weaponName(currentLoadout.primary)), sec: t(weaponName(currentLoadout.secondary)), thr: t(weaponName(currentLoadout.throwable)) }}
                    onOpenStats={() => onInteractionStateChange(OverlayType.STATION_STATISTICS)}
                    onOpenArmory={() => onInteractionStateChange(OverlayType.STATION_ARMORY)}
                    onOpenSkills={() => onInteractionStateChange(OverlayType.STATION_SKILLS)}
                    onOpenAdventureLog={(tab) => { onInteractionStateChange(OverlayType.ADVENTURE_LOG); if (tab !== undefined) (window as any).dispatchEvent(new CustomEvent('open-adventure-log', { detail: { tab } })); }}
                    onOpenSettings={() => setActiveOverlay(OverlayType.SETTINGS)}
                    onStartSector={() => { }}
                    debugMode={debugMode} onToggleDebug={onToggleDebug} onResetGame={() => setActiveOverlay(OverlayType.RESET_CONFIRM)}
                    onDebugScrap={() => {
                        const next = StatsBridge.deepCloneStats(stats);
                        StatsBridge.addStatInt(next, PlayerStatID.SCRAP, 100);
                        onSaveStats(next);
                    }}
                    onDebugSkill={() => {
                        const next = StatsBridge.deepCloneStats(stats);
                        StatsBridge.addStatInt(next, PlayerStatID.SKILL_POINTS, 10);
                        onSaveStats(next);
                    }}
                    onDebugCP={() => {
                        const next = StatsBridge.deepCloneStats(stats);
                        StatsBridge.addStatInt(next, PlayerStatID.CHALLENGE_POINTS, 10);
                        StatsBridge.addStatInt(next, PlayerStatID.TOTAL_CHALLENGE_POINTS, 10);
                        onSaveStats(next);
                    }}
                    isMobileDevice={isMobileDevice}
                />
            )}

        </div>
    );
};

export default React.memo(Camp, areEqual);

