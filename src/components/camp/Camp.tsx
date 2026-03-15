import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { PlayerStats } from '../../types';
import { WeaponType } from '../../content/weapons';
import { WEAPONS, SECTOR_THEMES, FAMILY_MEMBERS, PLAYER_CHARACTER, CHATTER_LINES } from '../../content/constants';
import { soundManager } from '../../utils/SoundManager';
import { t } from '../../utils/i18n';
import { ModelFactory } from '../../utils/assets';
import { PlayerAnimator } from '../../core/animation/PlayerAnimator';
import { createProceduralTextures } from '../../utils/assets';
import { WinterEngine, GraphicsSettings } from '../../core/engine/WinterEngine';
import { CampWorld } from './CampWorld';
import { CampEffectsState, CAMP_SCENE } from './CampWorld';
import { WeatherType } from '../../types';
import { PerformanceMonitor } from '../../core/systems/PerformanceMonitor';

// Zero-GC Scratchpads
const _v1 = new THREE.Vector3();

// Import UI Components
import CampHUD from './CampHUD';
import ScreenPlayerSkills from './ScreenPlayerSkills';
import ScreenArmory from './ScreenArmory';
import ScreenSectorOverview from './ScreenSectorOverview';
import ScreenSettings from './ScreenSettings';
import ScreenResetConfirm from './ScreenResetConfirm';
import ScreenAdventureLog from './ScreenAdventureLog';

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
    onUpdateHUD: (data: any) => void;
    isMobileDevice?: boolean;
    weather: WeatherType;
    hasCheckpoint?: boolean;
    isRunning?: boolean;
    activeOverlay: string | null;
    setActiveOverlay: (type: any) => void;
    onInteractionStateChange: (type: string | null) => void;
}

const Camp: React.FC<CampProps> = ({ stats, currentLoadout, weaponLevels, onSaveStats, onSaveLoadout, onSelectSector, onStartSector, currentSector, debugMode, onToggleDebug, rescuedFamilyIndices, isSectorLoaded, deadBossIndices, onResetGame, onSaveGraphics, initialGraphics, onCampLoaded, onUpdateHUD, isMobileDevice, weather, hasCheckpoint, isRunning = true, activeOverlay, setActiveOverlay, onInteractionStateChange }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const chatOverlayRef = useRef<HTMLDivElement>(null);
    const lastDrawCallsRef = useRef(0);

    const [hoveredStation, setHoveredStation] = useState<string | null>(null);
    const [tooltip, setTooltip] = useState<{ x: number, y: number, text: string, subText?: string } | null>(null);
    const [idleTooltips, setIdleTooltips] = useState<Array<{ x: number, y: number, text: string, id: string }>>([]);

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
    const frameRef = useRef(0);

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

    // --- KEYBOARD LISTENERS REMOVED (NOW GLOBAL) ---


    const setupCounterRef = useRef(0);

    useEffect(() => {
        if (!containerRef.current) return;
        const container = containerRef.current;
        const engine = WinterEngine.getInstance();

        setupCounterRef.current++;
        const currentSetupId = setupCounterRef.current;

        while (container.firstChild) container.removeChild(container.firstChild);

        const width = container.clientWidth;
        const height = container.clientHeight;

        // --- ENGINE & RENDERER ---
        engine.updateSettings(graphics);
        engine.mount(container);
        engineRef.current = engine;

        const scene = engine.scene;
        const camera = engine.camera;
        const renderer = engine.renderer;

        // Reset & Setup Scene via CampWorld
        const setup = async () => {
            // Setup Scene via CampWorld
            const { interactables, outlines, envState } = await CampWorld.setupCampScene(renderer, scene, camera, textures, weather);

            // Race condition check: If another setup started, abort this one
            if (setupCounterRef.current !== currentSetupId || !container.parentElement) return;

            envStateRef.current = envState;

            // Setup Family Members
            const { familyMembers, interactables: familyInteractables, activeMembers } = CampWorld.setupFamilyMembers(
                scene, rescuedFamilyIndices, debugMode, PLAYER_CHARACTER, FAMILY_MEMBERS
            );

            // Final check inside the async scope
            if (setupCounterRef.current !== currentSetupId) return;

            // Consolidate interactables from both stations and family
            const allInteractables = [...interactables, ...familyInteractables];

            // [VINTERDÖD] Adjust camera for Portrait Mode (Mobile/Narrow View)
            const aspect = container.clientWidth / container.clientHeight;
            if (aspect < 1.0) {
                camera.set('fov', 68);
                camera.setPosition(0, 10, 28, true);
            } else {
                camera.set('fov', 50);
                camera.setPosition(0, 10, 22, true);
            }

            // Store scene data for the interactivity loop
            sceneInteractablesRef.current = allInteractables;
            sceneOutlinesRef.current = outlines;
            sceneOutlineKeysRef.current = Object.keys(outlines);
            sceneFamilyMembersRef.current = familyMembers;
            sceneActiveMembersRef.current = activeMembers;
        };

        setup();

        // Buffer frames to ensure campfire and particles are fully initialized
        let framesToWait = 10;
        const checkReady = () => {
            if (framesToWait > 0) {
                framesToWait--;
                requestAnimationFrame(checkReady);
            } else {
                if (onCampLoaded) onCampLoaded();
            }
        };
        requestAnimationFrame(checkReady);

        return () => {
            // Scene cleanup handled by engine
        };
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

        const onMM = (e: MouseEvent) => {
            if (!isRunning || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
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
                    // Map local Camp station IDs to Global OverlayTypes
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

            // Force raycast update for touch
            raycaster.setFromCamera(mouse, camera.threeCamera);
            const hits = raycaster.intersectObjects(sceneInteractablesRef.current);
            if (hits.length > 0) {
                let target: any = hits[0].object;
                // Use groupId to find the root family member group
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

            // [VINTERDÖD] Dynamic FOV/Position adjustment for Mobile Portrait
            if (aspect < 1.0) {
                camera.set('fov', 68);
                camera.setPosition(0, 10, 28, false); // Smoothly slide back
            } else {
                camera.set('fov', 50);
                camera.setPosition(0, 10, 22, false); // Smoothly slide forward
            }

            engine.renderer.setSize(width, height);
        };

        window.addEventListener('mousemove', onMM);
        window.addEventListener('click', onCL);
        window.addEventListener('touchstart', onTS, { passive: false });
        window.addEventListener('resize', onResize);

        let frameCount = 0;

        engine.onUpdate = (dt: number) => {
            const now = performance.now();

            // Late init for wildlife sounds (15-45s after load)
            if (nextWildlifeTime.current === 0) {
                nextWildlifeTime.current = now + 5000 + Math.random() * 10000;
            }
            const monitor = PerformanceMonitor.getInstance();

            monitor.begin('env_camera');
            if (envStateRef.current) {
                CampWorld.updateEffects(scene, camera.threeCamera, envStateRef.current, dt, now, frameCount);
            }

            const CINEMATIC_LOOK_AT = sceneCinematicLookAtRef.current;
            const BASE_LOOK_AT = sceneBaseLookAtRef.current;
            const targetLookAt = isIdleRef.current ? CINEMATIC_LOOK_AT : BASE_LOOK_AT;
            camera.set('lookSpeed', isIdleRef.current ? 0.2 : 3.0);
            camera.lookAt(targetLookAt.x, targetLookAt.y, targetLookAt.z);
            camera.update(dt, now);
            monitor.end('env_camera');

            frameCount++;

            // Access scene data directly via .current inside the loop
            const familyMembers = sceneFamilyMembersRef.current;
            const interactables = sceneInteractablesRef.current;
            const outlines = sceneOutlinesRef.current;
            const outlineKeys = sceneOutlineKeysRef.current;

            monitor.begin('family_anim');
            // Zero-GC: Avoid Set creation and .map/.filter in the loop
            const chats = activeChats.current;
            for (let i = 0; i < familyMembers.length; i++) {
                const fm = familyMembers[i];
                let isSpeaking = fm.bounce > 0;

                // Check if this member is currently speaking in any active chat
                if (!isSpeaking) {
                    for (let j = 0; j < chats.length; j++) {
                        const c = chats[j];
                        if (c.mesh.uuid === fm.mesh.uuid && now >= c.startTime && now <= c.startTime + c.duration) {
                            isSpeaking = true;
                            break;
                        }
                    }
                }

                if (fm.bounce > 0) { fm.bounce -= 0.02 * (dt / 0.016); if (fm.bounce < 0) fm.bounce = 0; }

                // Animate the entire Group (fm.mesh) to prevent head/body splitting
                PlayerAnimator.update(fm.mesh as any, {
                    isMoving: false, isRushing: false, isRolling: false, rollStartTime: 0, staminaRatio: 1.0,
                    isSpeaking, isThinking: false, isIdleLong: now > 5000, seed: fm.seed
                }, now, dt);

                // Emissive highlight logic utilizing pre-cached materials to avoid traverse
                const isHov = hoveredRef.current === (fm.mesh.userData.id);
                const emissiveIntensity = isHov ? 0.5 + Math.sin(frameCount * 0.2) * 0.5 : 0;

                for (let j = 0; j < fm.emissiveMaterials.length; j++) {
                    const mat = fm.emissiveMaterials[j];
                    mat.emissive.setHex(0xaaaaaa);
                    mat.emissiveIntensity = emissiveIntensity;
                }
            }
            monitor.end('family_anim');

            monitor.begin('chatter');
            // Gated chatter by isRunning to avoid noise during loading
            if (isRunning && now > nextChatterTime.current && sceneActiveMembersRef.current.length > 1) {
                const numSpeakers = 1 + Math.floor(Math.random() * 2.5);
                let delayOffset = 0;
                for (let i = 0; i < numSpeakers; i++) {
                    const speaker = familyMembers[Math.floor(Math.random() * familyMembers.length)];
                    const linesKey = (speaker.name || '').toLowerCase();
                    let lines = t(`chatter.${linesKey}`) as unknown as string[];
                    if (!Array.isArray(lines)) lines = CHATTER_LINES[speaker.name] || ["..."];
                    const text = lines[Math.floor(Math.random() * lines.length)];
                    const duration = 2000 + text.length * 60;
                    const el = document.createElement('div');
                    el.className = 'absolute bg-black/80 border-2 border-black text-white px-4 py-2 text-sm font-bold rounded-lg pointer-events-none opacity-0 transition-opacity duration-500 whitespace-normal z-40 w-max max-w-[280px] text-center shadow-lg';
                    el.innerText = text;
                    if (chatOverlayRef.current) chatOverlayRef.current.appendChild(el);
                    activeChats.current.push({ id: `chat_${now}_${i}`, mesh: speaker.mesh, text, startTime: now + delayOffset, duration, element: el, playedSound: false });
                    delayOffset += duration + 500;
                }
                nextChatterTime.current = now + delayOffset + 10000 + Math.random() * 20000;
            }

            // Wildlife Sounds
            if (now > nextWildlifeTime.current) {
                if (Math.random() > 0.5) {
                    soundManager.playOwlHoot();
                }
                nextWildlifeTime.current = now + 30000 + Math.random() * 60000;
            }

            // Chat movement & opacity logic
            for (let i = activeChats.current.length - 1; i >= 0; i--) {
                const c = activeChats.current[i];
                if (now > c.startTime + c.duration) {
                    if (c.element.parentNode) c.element.parentNode.removeChild(c.element);
                    activeChats.current.splice(i, 1);
                } else if (now >= c.startTime) {
                    // Only play chatter sound if running
                    if (!c.playedSound) { c.playedSound = true; if (isRunning) soundManager.playUiConfirm(); }
                    c.element.style.opacity = now < c.startTime + 500 ? String((now - c.startTime) / 500) : (now > c.startTime + c.duration - 500 ? String((c.startTime + c.duration - now) / 500) : '1');
                    const vec = _v1; c.mesh.getWorldPosition(vec); vec.y += 2.2; vec.project(camera.threeCamera);
                    const width = container.clientWidth, height = container.clientHeight;
                    c.element.style.left = `${(vec.x * 0.5 + 0.5) * width}px`;
                    c.element.style.top = `${(-(vec.y * 0.5) + 0.5) * height}px`;
                    c.element.style.transform = 'translate(-50%, -100%)';
                }
            }
            monitor.end('chatter');

            monitor.begin('raycasting');
            const isMobileLabels = isMobileDevice && !isIdleRef.current;

            if (isRunning && !activeOverlayRef.current) {
                frameRef.current++;
                const shouldUpdateInteractions = (frameRef.current % 2 === 0);

                if (shouldUpdateInteractions) {
                    scene.updateMatrixWorld();
                    const width = container.clientWidth, height = container.clientHeight;

                    // Standard raycast tooltip
                    raycaster.setFromCamera(mouse, camera.threeCamera);
                    const hits = raycaster.intersectObjects(interactables);
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
                            tooltipX = (vec.x * 0.5 + 0.5) * width; tooltipY = (-(vec.y * 0.5) + 0.5) * height;
                        }
                    }

                    if (newHover !== hoveredRef.current) { if (newHover) soundManager.playUiHover(); hoveredRef.current = newHover; setHoveredStation(newHover); }
                    setTooltip(newHover ? { text: toolTipText, subText: toolTipSubText, x: tooltipX, y: tooltipY } : null);

                    // Use the cached outline keys to avoid array allocation
                    for (let i = 0; i < outlineKeys.length; i++) { outlines[outlineKeys[i]].visible = (hoveredRef.current === outlineKeys[i]); }

                    // Mobile Labels: Project all stations
                    if (isMobileLabels) {
                        const idles: Array<{ x: number, y: number, text: string, id: string }> = [];
                        for (let i = 0; i < CAMP_SCENE.stationPositions.length; i++) {
                            const station = CAMP_SCENE.stationPositions[i];
                            const vec = _v1.copy(station.pos);
                            vec.y += 2.2; // A bit higher for idle labels
                            vec.project(camera.threeCamera);
                            idles.push({
                                id: station.id,
                                text: t(`stations.${station.id}`),
                                x: (vec.x * 0.5 + 0.5) * width,
                                y: (-(vec.y * 0.5) + 0.5) * height
                            });
                        }
                        setIdleTooltips(idles);
                    } else if (idleTooltips.length > 0) {
                        setIdleTooltips([]);
                    }
                }

            } else {
                // Not running or Modal open: Clean up
                if (hoveredRef.current !== null) {
                    hoveredRef.current = null;
                    setHoveredStation(null);
                    setTooltip(null);
                    for (let i = 0; i < outlineKeys.length; i++) { outlines[outlineKeys[i]].visible = false; }
                }
            }
            monitor.end('raycasting');

            lastDrawCallsRef.current = engine.renderer.info.render.calls;
            monitor.printIfHeavy('Camp Performance', performance.now() - now, 50);
        };

        engine.onRender = () => {
            engine.renderer.render(scene, camera.threeCamera);
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

            {tooltip && tooltip.text && !isIdle && (
                <div className="absolute pointer-events-none z-50 flex flex-col items-center -translate-x-1/2 -translate-y-full mb-2" style={{ left: tooltip.x, top: tooltip.y }}>
                    <div className="bg-black/90 border-2 border-black px-4 py-1 text-white font-black uppercase tracking-wider text-lg md:text-xl shadow-2xl">
                        {tooltip.text}
                    </div>
                    {tooltip.subText && (
                        <div className="bg-black/80 border-x-2 border-b-2 border-black px-3 py-1 text-slate-400 font-bold uppercase text-[10px] md:text-xs whitespace-nowrap shadow-xl">
                            {tooltip.subText}
                        </div>
                    )}
                    <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-black mt-[-1px]"></div>
                </div>
            )}

            {/* Mobile Station Labels (Floating Tooltips) - Visible when NOT idle */}
            {!isIdle && isMobileDevice && idleTooltips.map(it => (
                <div key={it.id} className="absolute pointer-events-none z-50 flex flex-col items-center -translate-x-1/2 -translate-y-full mb-2 animate-[fadeIn_1s_ease-out_forwards]" style={{ left: it.x, top: it.y }}>
                    <div className="bg-black/90 border-2 border-black px-3 py-1 text-white font-black uppercase tracking-wider text-sm shadow-2xl">
                        {it.text}
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