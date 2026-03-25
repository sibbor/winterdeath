import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { PlayerStats } from '../../entities/player/PlayerTypes';;
import { WeaponType } from '../../content/weapons';
import { WEAPONS, SECTOR_THEMES, FAMILY_MEMBERS, PLAYER_CHARACTER, CHATTER_LINES } from '../../content/constants';
import { soundManager } from '../../utils/SoundManager';
import { t } from '../../utils/i18n';
import { createProceduralTextures } from '../../utils/assets';
import { WinterEngine, GraphicsSettings } from '../../core/engine/WinterEngine';
import { CampWorld } from './CampWorld';
import { CampEffectsState, CAMP_SCENE } from './CampWorld';
import { WeatherType } from '../../core/engine/EngineTypes';
import { PerformanceMonitor } from '../../systems/PerformanceMonitor';
import { CampEffectsSystem, FamilyAnimationSystem, CampChatterSystem } from './CampSystems';

// Zero-GC Scratchpads
const _v1 = new THREE.Vector3();
const _campCtx: any = { dynamicLights: [] };

// Import UI Components
import CampHUD from '../ui/hud/CampHUD';

interface CampProps {
    stats: PlayerStats;
    currentLoadout: { primary: WeaponType; secondary: WeaponType; throwable: WeaponType; special: WeaponType; };
    weaponLevels: Record<WeaponType, number>;
    onSaveStats: (newStats: PlayerStats) => void;
    onSaveLoadout: (loadout: { primary: WeaponType; secondary: WeaponType; throwable: WeaponType; special: WeaponType; }, levels: Record<WeaponType, number>) => void;
    onSelectSector: (sectorIndex: number) => void;
    onStartSector: () => void;
    currentSector: number;
    debugMode: boolean;
    onToggleDebug: (val: boolean) => void;
    rescuedFamilyIndices: number[];
    isSectorLoaded: boolean;
    deadBossIndices: number[];
    onResetGame: () => void;
    onSaveGraphics: (graphics: GraphicsSettings) => void;
    initialGraphics?: GraphicsSettings;
    onCampLoaded?: () => void;
    isMobileDevice?: boolean;
    weather: WeatherType;
    hasCheckpoint?: boolean;
    isRunning?: boolean;
    activeOverlay: string | null;
    setActiveOverlay: (type: any) => void;
    onInteractionStateChange: (type: string | null) => void;
}

const Camp: React.FC<CampProps> = ({ stats, currentLoadout, onSaveStats, currentSector, debugMode, onToggleDebug, rescuedFamilyIndices, initialGraphics, onCampLoaded, isMobileDevice, weather, hasCheckpoint, isRunning = true, activeOverlay, setActiveOverlay, onInteractionStateChange }) => {
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

    const [graphics, setGraphics] = useState<GraphicsSettings>(initialGraphics || WinterEngine.getInstance().getSettings());

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
        if (isRunning) {
            soundManager.resume();
            soundManager.startCampfire();
        }
        return () => soundManager.stopCampfire();
    }, [isRunning]);

    // Idle Timer
    useEffect(() => {
        const handleInput = () => { lastInputRef.current = Date.now(); if (isIdle) setIsIdle(false); };
        window.addEventListener('mousemove', handleInput); window.addEventListener('mousedown', handleInput); window.addEventListener('keydown', handleInput); window.addEventListener('touchstart', handleInput, { passive: true });
        const idleTimer = setInterval(() => { if (!isIdle && Date.now() - lastInputRef.current > 10000) setIsIdle(true); }, 1000);
        return () => { window.removeEventListener('mousemove', handleInput); window.removeEventListener('mousedown', handleInput); window.removeEventListener('keydown', handleInput); window.removeEventListener('touchstart', handleInput); clearInterval(idleTimer); };
    }, [isIdle]);

    const setupCounterRef = useRef(0);

    useEffect(() => {
        if (!containerRef.current) return;
        const container = containerRef.current;
        const engine = WinterEngine.getInstance();

        setupCounterRef.current++;
        const currentSetupId = setupCounterRef.current;

        while (container.firstChild) container.removeChild(container.firstChild);

        // --- ENGINE & RENDERER ---
        engine.updateSettings(graphics);
        engine.mount(container);
        engineRef.current = engine;

        const scene = engine.scene;
        const camera = engine.camera;

        // Reset & Setup Scene via CampWorld
        const setup = async () => {
            const { interactables, outlines, envState } = await CampWorld.build(scene, textures, weather);

            // Race condition check: If another setup started, abort this one
            if (setupCounterRef.current !== currentSetupId || !container.parentElement) return;

            envStateRef.current = envState;

            // Setup Family Members
            const { familyMembers, interactables: familyInteractables, activeMembers } = CampWorld.setupFamilyMembers(
                scene, rescuedFamilyIndices, debugMode, PLAYER_CHARACTER, FAMILY_MEMBERS
            );

            if (setupCounterRef.current !== currentSetupId) return;

            const allInteractables = [...interactables, ...familyInteractables];

            const aspect = container.clientWidth / container.clientHeight;
            if (aspect < 1.0) {
                camera.set('fov', 68);
                camera.setPosition(0, 10, 28, true);
            } else {
                camera.set('fov', 50);
                camera.setPosition(0, 10, 22, true);
            }

            sceneInteractablesRef.current = allInteractables;
            sceneOutlinesRef.current = outlines;
            sceneOutlineKeysRef.current = Object.keys(outlines);
            sceneFamilyMembersRef.current = familyMembers;
            sceneActiveMembersRef.current = activeMembers;

            // Register Camp Systems to the Engine
            engine.registerSystem(new CampEffectsSystem());
            engine.registerSystem(new FamilyAnimationSystem());
            engine.registerSystem(new CampChatterSystem());
        };

        setup();

        let framesToWait = 0;
        const checkReady = () => {
            if (framesToWait > 0) {
                framesToWait--;
                requestAnimationFrame(checkReady);
            } else {
                if (onCampLoaded) onCampLoaded();
            }
        };
        requestAnimationFrame(checkReady);
    }, [rescuedFamilyIndices, debugMode, textures]);

    // --- INTERACTIVITY EFFECT: Registers loop + events ---
    useEffect(() => {
        const engine = engineRef.current;
        if (!engine || !containerRef.current) return;

        const container = containerRef.current;
        const scene = engine.scene;
        const camera = engine.camera;

        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2(-1000, -1000);
        let mouseMoved = false;
        let lastRaycastTime = 0

        const onMM = (e: MouseEvent) => {
            if (!isRunning) return;

            mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

            mouseMoved = true;
        };

        const onCL = () => {
            if (!isRunning || activeOverlayRef.current) return;
            const hovered = hoveredRef.current;
            if (hovered) {
                if (hovered.startsWith('family_') || hovered.startsWith('player_')) {
                    const familyMembers = sceneFamilyMembersRef.current;
                    const fmWrapper = familyMembers.find((fm: any) => fm.mesh.userData.id === hovered);
                    if (fmWrapper) { fmWrapper.bounce = 1; soundManager.playVoice(fmWrapper.mesh.userData.name); }
                } else {
                    soundManager.playUiConfirm();
                    const typeMap: Record<string, string> = {
                        'armory': 'STATION_ARMORY',
                        'skills': 'STATION_SKILLS',
                        'sectors': 'STATION_SECTORS',
                        'stats': 'ADVENTURE_LOG',
                        'adventure_log': 'ADVENTURE_LOG',
                        'settings': 'SETTINGS'
                    };
                    onInteractionStateChange(typeMap[hovered] || null);
                }
            }
        };

        const onTS = (e: TouchEvent) => {
            if (!isRunning || !containerRef.current) return;
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

        engine.onUpdate = (dt: number) => {
            const now = performance.now();

            if (nextWildlifeTime.current === 0) {
                nextWildlifeTime.current = now + 5000 + Math.random() * 10000;
            }
            const familyMembers = sceneFamilyMembersRef.current;
            const interactables = sceneInteractablesRef.current;
            const outlines = sceneOutlinesRef.current;
            const outlineKeys = sceneOutlineKeysRef.current;

            // Zero-GC for Camp context
            _campCtx.scene = scene;
            _campCtx.camera = camera.threeCamera;
            _campCtx.container = container;
            _campCtx.envState = envStateRef.current;
            _campCtx.dynamicLights = envStateRef.current?.fireLight ? [envStateRef.current.fireLight] : [];
            _campCtx.playerPos = camera.threeCamera.position;
            _campCtx.familyMembers = familyMembers;
            _campCtx.activeMembers = sceneActiveMembersRef.current;
            _campCtx.activeChats = activeChats.current;
            _campCtx.chatOverlay = chatOverlayRef.current;
            _campCtx.isRunning = isRunning;
            _campCtx.nextChatterTime = { val: nextChatterTime.current, set: (v: number) => nextChatterTime.current = v };
            _campCtx.nextWildlifeTime = { val: nextWildlifeTime.current, set: (v: number) => nextWildlifeTime.current = v };
            _campCtx.hoveredId = hoveredRef.current

            // Tell engine to update the systems:
            engine.onUpdateContext = _campCtx;

            // Camera logic (still manual for now due to complex state)
            const CINEMATIC_LOOK_AT = sceneCinematicLookAtRef.current;
            const BASE_LOOK_AT = sceneBaseLookAtRef.current;
            const targetLookAt = isIdleRef.current ? CINEMATIC_LOOK_AT : BASE_LOOK_AT;
            camera.set('lookSpeed', isIdleRef.current ? 0.2 : 3.0);
            camera.lookAt(targetLookAt.x, targetLookAt.y, targetLookAt.z);
            camera.update(dt, now);

            monitor.begin('raycasting');
            const isMobileLabels = isMobileDevice && !isIdleRef.current;

            if (isRunning && !activeOverlayRef.current) {
                if (mouseMoved && (now - lastRaycastTime > 100)) {
                    lastRaycastTime = now;
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
                                toolTipText = `${target.userData.name}`;
                            } else {
                                toolTipText = t(`stations.${target.userData.name || newHover}`);
                                if (newHover === 'armory') {
                                    toolTipSubText = `${t(WEAPONS[currentLoadout.primary].displayName)} | ${t(WEAPONS[currentLoadout.secondary].displayName)} | ${t(WEAPONS[currentLoadout.throwable].displayName)} | ${t(WEAPONS[currentLoadout.special].displayName)}`;
                                } else if (newHover === 'skills') {
                                    toolTipSubText = `${t('camp_tooltips.vitality')}: ${stats.maxHp} | ${t('camp_tooltips.adrenaline')}: ${stats.maxStamina} | ${t('camp_tooltips.reflexes')}: ${Math.round(stats.speed * 100)}`;
                                } else if (newHover === 'adventure_log') {
                                    toolTipSubText = `${t('camp_tooltips.collectibles')}: ${stats.collectiblesDiscovered?.length || 0} | ${t('camp_tooltips.clues')}: ${stats.cluesFound?.length || 0} | ${t('camp_tooltips.poi')}: ${stats.discoveredPOIs?.length || 0} | ${t('camp_tooltips.enemies')}: ${stats.seenEnemies?.length || 0} | ${t('camp_tooltips.bosses')}: ${stats.seenBosses?.length || 0}`;
                                } else if (newHover === 'sectors') {
                                    toolTipSubText = `${t('camp_tooltips.finished_sectors')}: ${stats.sectorsCompleted} | ${t('camp_tooltips.selected_sector')}: ${t(SECTOR_THEMES[currentSector]?.name || '')}`;
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
                        if (newHover) soundManager.playUiHover();
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
            monitor.printIfHeavy('Camp Performance', performance.now() - now, 50);
        };

        return () => {
            window.removeEventListener('mousemove', onMM);
            window.removeEventListener('click', onCL);
            window.removeEventListener('touchstart', onTS);
            window.removeEventListener('resize', onResize);
        };
    }, [isRunning, stats, currentLoadout, currentSector]);

    const closeModal = () => { soundManager.playUiClick(); setActiveOverlay(null); };

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
                    stats={stats} hoveredStation={hoveredStation} currentSectorName={t(SECTOR_THEMES[currentSector]?.name || '')} hasCheckpoint={!!hasCheckpoint} isIdle={isIdle}
                    currentLoadoutNames={{ pri: t(WEAPONS[currentLoadout.primary].displayName), sec: t(WEAPONS[currentLoadout.secondary].displayName), thr: t(WEAPONS[currentLoadout.throwable].displayName) }}
                    onOpenStats={() => onInteractionStateChange('ADVENTURE_LOG')}
                    onOpenArmory={() => onInteractionStateChange('STATION_ARMORY')}
                    onOpenSkills={() => onInteractionStateChange('STATION_SKILLS')}
                    onOpenSettings={() => setActiveOverlay('SETTINGS')}
                    onStartSector={() => { }}
                    debugMode={debugMode} onToggleDebug={onToggleDebug} onResetGame={() => setActiveOverlay('RESET_CONFIRM')}
                    onDebugScrap={() => onSaveStats({ ...stats, scrap: stats.scrap + 100 })} onDebugSkill={() => onSaveStats({ ...stats, skillPoints: stats.skillPoints + 1 })}
                    isMobileDevice={isMobileDevice}
                />
            )}

        </div>
    );
};

export default Camp;