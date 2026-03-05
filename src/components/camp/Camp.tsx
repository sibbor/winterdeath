
import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { PlayerStats } from '../../types';
import { WeaponType } from '../../content/weapons';
import { WEAPONS, SECTOR_THEMES, FAMILY_MEMBERS, PLAYER_CHARACTER, CHATTER_LINES } from '../../content/constants';
import { soundManager } from '../../utils/sound';
import { t } from '../../utils/i18n';
import { ModelFactory } from '../../utils/assets';
import { PlayerAnimation } from '../../core/animation/PlayerAnimation';
import { createProceduralTextures } from '../../utils/assets';
import { WinterEngine, GraphicsSettings } from '../../core/engine/WinterEngine';
import { CampWorld } from './CampWorld';
import { CampEnvironment, CampEffectsState } from './CampEnvironment';
import { WeatherType } from '../../types';
import { PerformanceMonitor } from '../../core/systems/PerformanceMonitor';

// [VINTERDÖD] Zero-GC Scratchpads
const _v1 = new THREE.Vector3();

// Import UI Components
import CampHUD from './CampHUD';
import ScreenStatistics from './ScreenStatistics';
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
}

const STATIONS = [
    { id: 'armory', pos: new THREE.Vector3(-6, 0, -3.75) },
    { id: 'sectors', pos: new THREE.Vector3(2.25, 0, -7.125) },
    { id: 'skills', pos: new THREE.Vector3(6, 0, -3.75) },
    { id: 'adventure_log', pos: new THREE.Vector3(-2.25, 0, -7.125) }
];

const Camp: React.FC<CampProps> = ({ stats, currentLoadout, weaponLevels, onSaveStats, onSaveLoadout, onSelectSector, onStartSector, currentSector, debugMode, onToggleDebug, rescuedFamilyIndices, isSectorLoaded, deadBossIndices, onResetGame, onSaveGraphics, initialGraphics, onCampLoaded, onUpdateHUD, isMobileDevice, weather, hasCheckpoint, isRunning = true }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const chatOverlayRef = useRef<HTMLDivElement>(null);
    const lastDrawCallsRef = useRef(0);

    const [hoveredStation, setHoveredStation] = useState<string | null>(null);
    const [activeModal, setActiveModal] = useState<'armory' | 'sectors' | 'skills' | 'stats' | 'settings' | 'reset_confirm' | 'adventure_log' | null>(null);
    const [tooltip, setTooltip] = useState<{ x: number, y: number, text: string } | null>(null);

    const [graphics, setGraphics] = useState<GraphicsSettings>(initialGraphics || WinterEngine.getInstance().getSettings());


    // Renderer Ref for live updates
    const engineRef = useRef<WinterEngine | null>(null);

    // Idle UI State
    const [isIdle, setIsIdle] = useState(false);
    const isIdleRef = useRef(false);
    const lastInputRef = useRef(Date.now());

    const hoveredRef = useRef<string | null>(null);
    const activeRef = useRef<'armory' | 'sectors' | 'skills' | 'stats' | 'adventure_log' | 'settings' | 'reset_confirm' | null>(null);
    const activeModalRef = useRef<'armory' | 'sectors' | 'skills' | 'stats' | 'adventure_log' | 'settings' | 'reset_confirm' | null>(null);

    const nextChatterTime = useRef<number>(0); // First chatter soon
    const nextWildlifeTime = useRef<number>(15000); // Start wildlife after 15s
    const activeChats = useRef<Array<{ id: string, mesh: THREE.Object3D, text: string, startTime: number, duration: number, element: HTMLDivElement, playedSound: boolean }>>([]);

    const envStateRef = useRef<CampEffectsState | null>(null);

    const textures = useMemo(() => createProceduralTextures(), []);

    // Refs for scene data shared between build and interactivity effects
    const sceneInteractablesRef = useRef<THREE.Mesh[]>([]);
    const sceneOutlinesRef = useRef<Record<string, THREE.Mesh>>({});
    const sceneFamilyMembersRef = useRef<any[]>([]);
    const sceneActiveMembersRef = useRef<any[]>([]);
    const sceneBaseLookAtRef = useRef(new THREE.Vector3(0, 2, -5));
    const sceneCinematicLookAtRef = useRef(new THREE.Vector3(0, 8, -5));

    useEffect(() => { isIdleRef.current = isIdle; }, [isIdle]);
    useEffect(() => { activeModalRef.current = activeModal; }, [activeModal]);


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

    // --- KEYBOARD LISTENERS ---
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (activeModal) {
                    if (activeModal === 'reset_confirm') {
                        // specialized closing
                        soundManager.playUiClick();
                        setActiveModal('settings');
                    } else {
                        soundManager.playUiClick();
                        setActiveModal(null);
                    }
                } else {
                    soundManager.playUiClick();
                    setActiveModal('settings');
                }
            }
        };
        window.addEventListener('keydown', handleEsc); return () => window.removeEventListener('keydown', handleEsc);
    }, [activeModal]);


    useEffect(() => {
        if (!containerRef.current) return;
        const container = containerRef.current;
        while (container.firstChild) container.removeChild(container.firstChild);

        const width = container.clientWidth;
        const height = container.clientHeight;

        // --- ENGINE & RENDERER ---
        const engine = WinterEngine.getInstance();
        engine.updateSettings(graphics);
        engine.mount(container);
        engineRef.current = engine;

        const scene = engine.scene;
        const camera = engine.camera;
        const renderer = engine.renderer;

        // Reset Scene for Camp
        scene.clear();
        camera.reset();

        camera.setPosition(0, 10, 22, true);
        camera.set('fov', 50);
        camera.set('far', 2500); // Increase draw distance for stars (r=1800)

        //0x050510
        scene.background = new THREE.Color(0x161629);
        scene.fog = new THREE.FogExp2(0x161629, 0.01);

        const BASE_LOOK_AT = new THREE.Vector3(0, 2, -5);
        const CINEMATIC_LOOK_AT = new THREE.Vector3(0, 8, -5);
        camera.lookAt(BASE_LOOK_AT.x, BASE_LOOK_AT.y, BASE_LOOK_AT.z, true);

        const hemiLight = new THREE.HemisphereLight(0x444455, 0x111115, 0.6);
        scene.add(hemiLight);

        // --- SETUP WORLD & ENV via Systems ---
        CampWorld.setupTerrain(scene, textures);
        const { interactables, outlines } = CampWorld.setupStations(scene, textures, STATIONS);

        // Initialize Environment (Sky, Campfire, Particles, Wind, Weather, Water)
        envStateRef.current = CampEnvironment.initEffects(scene, textures, weather);

        // --- FAMILY MEMBERS ---
        const familyGroup = new THREE.Group();
        const familyMembers: any[] = [];
        const activeMembers: any[] = [PLAYER_CHARACTER];

        if (debugMode) {
            for (let i = 0; i < FAMILY_MEMBERS.length; i++) activeMembers.push(FAMILY_MEMBERS[i]);
        }
        else {
            const indices = rescuedFamilyIndices || [];
            for (let i = 0; i < indices.length; i++) {
                const sectorId = indices[i];
                if (sectorId < 4) activeMembers.push(FAMILY_MEMBERS[sectorId]);
                else if (sectorId === 4) { activeMembers.push(FAMILY_MEMBERS[4]); activeMembers.push(FAMILY_MEMBERS[5]); }
            }
        }

        const humans = activeMembers.filter(m => m.race === 'human');
        const animals = activeMembers.filter(m => m.race === 'animal');

        for (let globalIdx = 0; globalIdx < activeMembers.length; globalIdx++) {
            const memberData = activeMembers[globalIdx];
            // Use createFamilyMember for everyone (removes flashlight/gun for player in camp)
            const member = ModelFactory.createFamilyMember(memberData);

            // Ensure player has the correct ID format for interaction
            if (memberData.id === 'player') {
                member.userData.id = `player_${memberData.name}`;
                member.userData.type = 'family';
            }
            let angle = 0, radius = memberData.race === 'animal' ? 5.2 : 5.0;

            if (memberData.race === 'animal') {
                angle = 1.2 + animals.indexOf(memberData) * 0.25;
            } else {
                const idx = humans.indexOf(memberData);
                angle = -(humans.length - 1) * 0.25 / 2 + idx * 0.25;
            }

            member.position.set(Math.sin(angle) * radius, -0.25, Math.cos(angle) * radius);
            member.lookAt(0, 0, 0);

            const bodyMesh = member.children.find(c => c.userData.isBody);
            if (bodyMesh) interactables.push(bodyMesh as THREE.Mesh);

            member.traverse(c => {
                if (c instanceof THREE.Mesh) {
                    c.castShadow = true;
                    c.userData.id = member.userData.id;
                    c.userData.name = member.userData.name;
                    c.userData.type = 'family';
                }
            });
            familyGroup.add(member);

            let baseY = bodyMesh ? bodyMesh.userData.baseY : 0;
            familyMembers.push({ mesh: member, baseY, phase: Math.random() * Math.PI * 2, bounce: 0, name: memberData.name, seed: Math.random() * 100 });
        }
        scene.add(familyGroup);

        // Store scene data for the interactivity effect
        sceneInteractablesRef.current = interactables;
        sceneOutlinesRef.current = outlines;
        sceneFamilyMembersRef.current = familyMembers;
        sceneActiveMembersRef.current = activeMembers;

        // Signal the loading screen to close after several frames to ensure scene is settled and shaders linked
        let framesToWait = 3;
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
            // Scene cleanup not strictly required here as it's shared,
            // but we ensure listeners are handled by the interactivity effect.
        };
    }, [rescuedFamilyIndices, debugMode, textures]);
    // NOT isRunning

    // --- INTERACTIVITY EFFECT: Registers loop + events only when running ---
    useEffect(() => {
        const engine = engineRef.current;
        if (!isRunning || !engine || !containerRef.current) return;

        const container = containerRef.current;
        const scene = engine.scene;
        const camera = engine.camera;
        const interactables = sceneInteractablesRef.current;
        const outlines = sceneOutlinesRef.current;
        const familyMembers = sceneFamilyMembersRef.current;
        const activeMembers = sceneActiveMembersRef.current;
        const BASE_LOOK_AT = sceneBaseLookAtRef.current;
        const CINEMATIC_LOOK_AT = sceneCinematicLookAtRef.current;

        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2(-1000, -1000);

        const onMM = (e: MouseEvent) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        };

        const onCL = () => {
            if (activeModalRef.current) return;
            if (hoveredRef.current) {
                if (hoveredRef.current.startsWith('family_') || hoveredRef.current.startsWith('player_')) {
                    const fmWrapper = familyMembers.find((fm: any) => fm.mesh.userData.id === hoveredRef.current);
                    if (fmWrapper) { fmWrapper.bounce = 1; soundManager.playVoice(fmWrapper.mesh.userData.name); }
                } else {
                    soundManager.playUiConfirm();
                    openModal(hoveredRef.current as any);
                }
            }
        };

        const onTS = (e: TouchEvent) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const touch = e.touches[0];
            mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;

            // Force raycast update for touch
            raycaster.setFromCamera(mouse, camera.threeCamera);
            const hits = raycaster.intersectObjects(interactables);
            if (hits.length > 0) {
                let target: any = hits[0].object;
                if (!target.userData.id && target.parent && target.parent.userData.id) target = target.parent;
                hoveredRef.current = target.userData.id;
            }

            onCL();
        };

        const onResize = () => {
            const width = container.clientWidth;
            const height = container.clientHeight;
            camera.set('aspect', width / height);
            engine.renderer.setSize(width, height);
        };

        window.addEventListener('mousemove', onMM);
        window.addEventListener('click', onCL);
        window.addEventListener('touchstart', onTS, { passive: false });
        window.addEventListener('resize', onResize);

        let frameCount = 0;
        let lastRaycastFrame = 0;

        engine.onUpdate = (dt: number) => {
            const now = performance.now();
            const monitor = PerformanceMonitor.getInstance();

            monitor.begin('env_camera');
            CampEnvironment.updateEffects(scene, envStateRef.current, dt, now, frameCount);

            const targetLookAt = isIdleRef.current ? CINEMATIC_LOOK_AT : BASE_LOOK_AT;
            camera.set('lookSpeed', isIdleRef.current ? 0.2 : 3.0);
            camera.lookAt(targetLookAt.x, targetLookAt.y, targetLookAt.z);
            camera.update(dt, now);
            monitor.end('env_camera');

            monitor.begin('family_anim');
            const talkingMembers = new Set(activeChats.current.map((c: any) => (now >= c.startTime && now <= c.startTime + c.duration) ? c.mesh.uuid : null).filter(Boolean));
            for (let i = 0; i < familyMembers.length; i++) {
                const fm = familyMembers[i];
                const isSpeaking = talkingMembers.has(fm.mesh.uuid) || fm.bounce > 0;
                if (fm.bounce > 0) { fm.bounce -= 0.02 * (dt / 0.016); if (fm.bounce < 0) fm.bounce = 0; }
                const body = fm.mesh.children.find((c: any) => c.userData.isBody) as THREE.Mesh;
                if (body) {
                    PlayerAnimation.update(body, {
                        isMoving: false, isRushing: false, isRolling: false, rollStartTime: 0, staminaRatio: 1.0,
                        isSpeaking, isThinking: false, isIdleLong: now > 5000, seed: fm.seed
                    }, now, dt);
                }
            }
            monitor.end('family_anim');

            monitor.begin('chatter');
            if (now > nextChatterTime.current && activeMembers.length > 1) {
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
                } else {
                    soundManager.playBirdAmbience();
                }
                // Randomized interval between 30 and 90 seconds
                nextWildlifeTime.current = now + 30000 + Math.random() * 60000;
            }
            monitor.end('chatter');

            monitor.begin('chat_bubbles');
            const width = container.clientWidth;
            const height = container.clientHeight;
            for (let i = activeChats.current.length - 1; i >= 0; i--) {
                const chat = activeChats.current[i];
                const timeAlive = now - chat.startTime;
                if (timeAlive > chat.duration + 500) {
                    if (chat.element.parentNode) chat.element.parentNode.removeChild(chat.element);
                    activeChats.current.splice(i, 1); continue;
                }
                if (timeAlive >= 0) {
                    if (!chat.playedSound) { soundManager.playVoice(chat.mesh.userData.name); chat.playedSound = true; }
                    chat.element.style.opacity = timeAlive < 500 ? '1' : (timeAlive > chat.duration ? '0' : '1');
                    const vec = _v1; chat.mesh.getWorldPosition(vec); vec.y += 1.8; vec.project(camera.threeCamera);
                    chat.element.style.left = `${(vec.x * 0.5 + 0.5) * width}px`; chat.element.style.top = `${(-(vec.y * 0.5) + 0.5) * height}px`; chat.element.style.transform = 'translate(-50%, -100%)';
                }
            }
            monitor.end('chat_bubbles');

            monitor.begin('raycasting');
            frameCount++;
            if (frameCount - lastRaycastFrame >= 3) {
                lastRaycastFrame = frameCount;
                raycaster.setFromCamera(mouse, camera.threeCamera);
                const hits = raycaster.intersectObjects(interactables);
                let newHover = null, toolTipText = "", tooltipX = 0, tooltipY = 0;
                if (hits.length > 0) {
                    let target: any = hits[0].object;
                    if (!target.userData.id && target.parent && target.parent.userData.id) target = target.parent;
                    newHover = target.userData.id;
                    if (newHover && (newHover.startsWith('family_') || newHover.startsWith('player_'))) {
                        toolTipText = `${target.userData.name}`;
                        const vec = _v1; target.getWorldPosition(vec); vec.y += 1.8; vec.project(camera.threeCamera);
                        tooltipX = (vec.x * 0.5 + 0.5) * width; tooltipY = (-(vec.y * 0.5) + 0.5) * height;
                    }
                }
                if (newHover !== hoveredRef.current) { if (newHover) soundManager.playUiHover(); hoveredRef.current = newHover; setHoveredStation(newHover); }
                setTooltip((newHover && (newHover.startsWith('family_') || newHover.startsWith('player_'))) ? { text: toolTipText, x: tooltipX, y: tooltipY } : null);
                const outlineKeys = Object.keys(outlines);
                for (let i = 0; i < outlineKeys.length; i++) { outlines[outlineKeys[i]].visible = !activeModalRef.current && (hoveredRef.current === outlineKeys[i]); }
                for (let i = 0; i < interactables.length; i++) {
                    const o = interactables[i];
                    if (o.userData.type === 'family') {
                        (o.material as THREE.MeshStandardMaterial).emissiveIntensity = (o.userData.id === hoveredRef.current) ? 0.5 + Math.sin(frameCount * 0.2) * 0.5 : 0;
                        (o.material as THREE.MeshStandardMaterial).emissive.setHex(0xaaaaaa);
                    }
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
            engine.onUpdate = null;
            engine.onRender = null;
            const chats = activeChats.current;
            for (let i = 0; i < chats.length; i++) {
                const c = chats[i];
                if (c.element.parentNode) c.element.parentNode.removeChild(c.element);
            }
        };
    }, [isRunning]);

    const openModal = (id: typeof activeModal) => setActiveModal(id);
    const closeModal = () => { soundManager.playUiClick(); setActiveModal(null); };

    return (
        <div className={`relative w-full h-full bg-black font-sans overflow-hidden`} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
            <div ref={containerRef} className="absolute inset-0" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }} />
            <div ref={chatOverlayRef} className="absolute inset-0 pointer-events-none z-40 overflow-hidden" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 40 }} />

            {tooltip && tooltip.text && (
                <div className="absolute pointer-events-none z-50 bg-black/90 border-2 border-black px-4 py-2 text-white font-bold uppercase tracking-wider text-sm -translate-x-1/2 -translate-y-full" style={{ left: tooltip.x, top: tooltip.y }}>
                    {tooltip.text} <div className="absolute bottom-[-6px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-black"></div>
                </div>
            )}

            {!activeModal && (
                <CampHUD
                    stats={stats} hoveredStation={hoveredStation} currentSectorName={t(SECTOR_THEMES[currentSector]?.name || '')} hasCheckpoint={!!hasCheckpoint} isIdle={isIdle}
                    currentLoadoutNames={{ pri: t(WEAPONS[currentLoadout.primary].displayName), sec: t(WEAPONS[currentLoadout.secondary].displayName), thr: t(WEAPONS[currentLoadout.throwable].displayName) }}
                    onOpenStats={() => openModal('stats')} onOpenArmory={() => openModal('armory')} onOpenSkills={() => openModal('skills')}
                    onOpenSettings={() => openModal('settings')} onStartSector={() => { }}
                    debugMode={debugMode} onToggleDebug={onToggleDebug} onResetGame={() => openModal('reset_confirm')}
                    onDebugScrap={() => onSaveStats({ ...stats, scrap: stats.scrap + 10 })} onDebugSkill={() => onSaveStats({ ...stats, skillPoints: stats.skillPoints + 1 })}
                    isMobileDevice={isMobileDevice}
                />
            )}

            {activeModal === 'stats' && <ScreenStatistics stats={stats} onClose={closeModal} isMobileDevice={isMobileDevice} />}
            {activeModal === 'armory' && <ScreenArmory stats={stats} currentLoadout={currentLoadout} weaponLevels={weaponLevels} onClose={closeModal} onSave={(s, l, wl) => { onSaveStats(s); onSaveLoadout(l, wl); closeModal(); }} isMobileDevice={isMobileDevice} />}
            {activeModal === 'adventure_log' && <ScreenAdventureLog
                stats={stats}
                onClose={closeModal}
                isMobileDevice={isMobileDevice}
                debugMode={debugMode}
                onMarkCollectiblesViewed={(newIds) => {
                    const updated = [...(stats.viewedCollectibles || [])];
                    for (let i = 0; i < newIds.length; i++) {
                        const id = newIds[i];
                        if (!updated.includes(id)) {
                            updated.push(id);
                        }
                    }
                    onSaveStats({ ...stats, viewedCollectibles: updated });
                }}
            />}
            {activeModal === 'sectors' && <ScreenSectorOverview currentSector={currentSector} rescuedFamilyIndices={rescuedFamilyIndices} deadBossIndices={deadBossIndices} debugMode={debugMode} stats={stats} onClose={closeModal} onSelectSector={onSelectSector} onStartSector={onStartSector} isMobileDevice={isMobileDevice} />}
            {activeModal === 'skills' && <ScreenPlayerSkills stats={stats} onSave={onSaveStats} onClose={closeModal} isMobileDevice={isMobileDevice} />}
            {activeModal === 'settings' && (
                <ScreenSettings
                    onClose={closeModal}
                    graphics={graphics}
                    onUpdateGraphics={(newG) => {
                        setGraphics(newG);
                        onSaveGraphics(newG);
                        WinterEngine.getInstance().updateSettings(newG);
                    }}
                />
            )}

            {activeModal === 'reset_confirm' && (
                <ScreenResetConfirm
                    onConfirm={onResetGame}
                    onCancel={closeModal}
                />
            )}

        </div>
    );
};

export default Camp;