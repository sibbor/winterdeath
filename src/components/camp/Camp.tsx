
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
import { Engine, GraphicsSettings } from '../../core/engine/Engine';
import { CampWorld } from './CampWorld';
import { CampEnvironment, CampEffectsState } from './CampEnvironment';
import { WindUniforms } from '../../utils/assets/materials';
import { WeatherType } from '../../types';

// Import UI Components
import CampHUD from './CampHUD';
import ScreenStatistics from './ScreenStatistics';
import ScreenPlayerSkills from './ScreenPlayerSkills';
import ScreenArmory from './ScreenArmory';
import ScreenSectorOverview from './ScreenSectorOverview';
import ScreenSettings from './ScreenSettings';
import ScreenResetConfirm from './ScreenResetConfirm';
import ScreenAdventureLog from './ScreenAdventureLog';
import DebugSystemPanel from '../game/DebugSystemPanel';

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
}

const STATIONS = [
    { id: 'armory', pos: new THREE.Vector3(-6, 0, -3.75) },
    { id: 'sectors', pos: new THREE.Vector3(2.25, 0, -7.125) },
    { id: 'skills', pos: new THREE.Vector3(6, 0, -3.75) },
    { id: 'adventure_log', pos: new THREE.Vector3(-2.25, 0, -7.125) }
];

const Camp: React.FC<CampProps> = ({ stats, currentLoadout, weaponLevels, onSaveStats, onSaveLoadout, onSelectSector, onStartSector, currentSector, debugMode, onToggleDebug, rescuedFamilyIndices, isSectorLoaded, deadBossIndices, onResetGame, onSaveGraphics, initialGraphics, onCampLoaded, onUpdateHUD, isMobileDevice, weather, hasCheckpoint }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const chatOverlayRef = useRef<HTMLDivElement>(null);
    const lastDrawCallsRef = useRef(0);

    const [hoveredStation, setHoveredStation] = useState<string | null>(null);
    const [activeModal, setActiveModal] = useState<'armory' | 'sectors' | 'skills' | 'stats' | 'settings' | 'reset_confirm' | 'adventure_log' | null>(null);
    const [tooltip, setTooltip] = useState<{ x: number, y: number, text: string } | null>(null);

    const [graphics, setGraphics] = useState<GraphicsSettings>(initialGraphics || Engine.getInstance().getSettings());

    // Debug System Flags (Local to Camp)
    const [debugSystemFlags, setDebugSystemFlags] = useState({
        wind: true,
        weather: true,
        footprints: true,
        enemies: true,
        fx: true,
        lighting: true
    });
    const debugSystemFlagsRef = useRef(debugSystemFlags);
    useEffect(() => { debugSystemFlagsRef.current = debugSystemFlags; }, [debugSystemFlags]);

    const [showDebugPanel, setShowDebugPanel] = useState(false);

    // Renderer Ref for live updates
    const engineRef = useRef<Engine | null>(null);

    // Idle UI State
    const [isIdle, setIsIdle] = useState(false);
    const isIdleRef = useRef(false);
    const lastInputRef = useRef(Date.now());

    const hoveredRef = useRef<string | null>(null);
    const activeRef = useRef<'armory' | 'sectors' | 'skills' | 'stats' | 'adventure_log' | 'settings' | 'reset_confirm' | null>(null);
    const activeModalRef = useRef<'armory' | 'sectors' | 'skills' | 'stats' | 'adventure_log' | 'settings' | 'reset_confirm' | null>(null);

    const nextChatterTime = useRef<number>(Date.now() + 5000);
    const activeChats = useRef<Array<{ id: string, mesh: THREE.Object3D, text: string, startTime: number, duration: number, element: HTMLDivElement, playedSound: boolean }>>([]);

    const envStateRef = useRef<CampEffectsState | null>(null);

    const textures = useMemo(() => createProceduralTextures(), []);

    useEffect(() => {
        soundManager.resume();
        soundManager.startCampfire();

        // Signal loaded after a short delay for smooth transition
        if (onCampLoaded) {
            setTimeout(() => {
                onCampLoaded();
            }, 1000);
        }

        return () => soundManager.stopCampfire();
    }, []);

    // Idle Timer
    useEffect(() => {
        const handleInput = () => { lastInputRef.current = Date.now(); if (isIdle) setIsIdle(false); };
        window.addEventListener('mousemove', handleInput); window.addEventListener('mousedown', handleInput); window.addEventListener('keydown', handleInput); window.addEventListener('touchstart', handleInput, { passive: true });
        const idleTimer = setInterval(() => { if (!isIdle && Date.now() - lastInputRef.current > 10000) setIsIdle(true); }, 1000);
        return () => { window.removeEventListener('mousemove', handleInput); window.removeEventListener('mousedown', handleInput); window.removeEventListener('keydown', handleInput); window.removeEventListener('touchstart', handleInput); clearInterval(idleTimer); };
    }, [isIdle]);

    useEffect(() => { isIdleRef.current = isIdle; }, [isIdle]);
    useEffect(() => { activeModalRef.current = activeModal; }, [activeModal]);

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
        window.addEventListener('keydown', handleEsc); return () => window.removeEventListener('keydown', handleEsc);
    }, [activeModal]);

    // Debug Panel Toggle (P)
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'p') {
                setShowDebugPanel(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, []);

    // --- THREE.JS SCENE SETUP ---
    useEffect(() => {
        if (!containerRef.current) {
            return;
        }
        const container = containerRef.current;
        while (container.firstChild) container.removeChild(container.firstChild);

        const width = container.clientWidth;
        const height = container.clientHeight;

        // --- ENGINE & RENDERER ---
        const engine = Engine.getInstance();
        engine.updateSettings(graphics);
        engine.mount(container);
        engineRef.current = engine;

        const scene = engine.scene;
        const camera = engine.camera;
        const renderer = engine.renderer;

        // Reset Scene for Camp
        scene.clear();

        camera.position.set(0, 10, 22);
        camera.far = 2500; // Increase draw distance for stars (r=1800)
        camera.updateProjectionMatrix();

        scene.background = new THREE.Color(0x050510);
        scene.fog = new THREE.FogExp2(0x050510, 0.015);

        const BASE_LOOK_AT = new THREE.Vector3(0, 2, -5);
        const CINEMATIC_LOOK_AT = new THREE.Vector3(0, 8, -5);
        const currentLookAt = BASE_LOOK_AT.clone();
        camera.lookAt(currentLookAt);

        const hemiLight = new THREE.HemisphereLight(0x444455, 0x111115, 0.6);
        scene.add(hemiLight);

        // --- SETUP WORLD & ENV via Systems ---
        CampWorld.setupTerrain(scene, textures);
        const { interactables, outlines } = CampWorld.setupStations(scene, textures, STATIONS);

        // Initialize Environment (Sky, Campfire, Particles, Wind)
        envStateRef.current = CampEnvironment.initEffects(scene, textures, weather);

        // --- FAMILY MEMBERS ---
        const familyGroup = new THREE.Group();
        const familyMembers: any[] = [];
        const activeMembers: any[] = [PLAYER_CHARACTER];

        if (debugMode) FAMILY_MEMBERS.forEach(m => activeMembers.push(m));
        else {
            (rescuedFamilyIndices || []).forEach(sectorId => {
                if (sectorId < 4) activeMembers.push(FAMILY_MEMBERS[sectorId]);
                else if (sectorId === 4) { activeMembers.push(FAMILY_MEMBERS[4]); activeMembers.push(FAMILY_MEMBERS[5]); }
            });
        }

        const humans = activeMembers.filter(m => m.race === 'human');
        const animals = activeMembers.filter(m => m.race === 'animal');

        activeMembers.forEach((memberData) => {
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

            member.position.set(Math.sin(angle) * radius, -0.1, Math.cos(angle) * radius);
            member.lookAt(0, 0, 0);

            const bodyMesh = member.children.find(c => c.userData.isBody);
            if (bodyMesh) interactables.push(bodyMesh as THREE.Mesh);

            member.traverse(c => { if (c instanceof THREE.Mesh) { c.userData.id = member.userData.id; c.userData.name = member.userData.name; c.userData.type = 'family'; } });
            familyGroup.add(member);

            let baseY = bodyMesh ? bodyMesh.userData.baseY : 0;
            familyMembers.push({ mesh: member, baseY, phase: Math.random() * Math.PI * 2, bounce: 0, name: memberData.name, seed: Math.random() * 100 });
        });
        scene.add(familyGroup);

        // --- INTERACTION HANDLING ---
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2(-1000, -1000);

        const onMM = (e: MouseEvent) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        };

        const onCL = () => {
            if (activeRef.current) return;
            if (hoveredRef.current) {
                if (hoveredRef.current.startsWith('family_') || hoveredRef.current.startsWith('player_')) {
                    const fmWrapper = familyMembers.find(fm => fm.mesh.userData.id === hoveredRef.current);
                    if (fmWrapper) { fmWrapper.bounce = 1; soundManager.playVoice(fmWrapper.mesh.userData.name); }
                } else {
                    soundManager.playUiConfirm(); openModal(hoveredRef.current as any);
                }
            }
        };

        window.addEventListener('mousemove', onMM); window.addEventListener('click', onCL);
        const onResize = () => {
            const width = container.clientWidth;
            const height = container.clientHeight;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            engine.renderer.setSize(width, height);
        };
        window.addEventListener('resize', onResize);

        // --- ANIMATION LOOP ---
        let frame = 0;
        let framesSinceUpdate = 0;
        let lastFpsUpdate = Date.now();

        const animate = () => {
            const frameStart = performance.now();
            frameId = requestAnimationFrame(animate);
            frame++;
            // activeRef is managed by the sync effect now, or we read from activeModalRef directly. 
            // But to be safe with existing logic:
            activeRef.current = activeModalRef.current;
            const now = Date.now();

            // Performance timing
            const timings: Record<string, number> = {};
            let lastTime = frameStart;

            // Update FPS / Debug Info
            framesSinceUpdate++;
            if (now - lastFpsUpdate >= 200) { // Faster update for debug smoothness
                const fps = Math.round((framesSinceUpdate * 1000) / (now - lastFpsUpdate));
                framesSinceUpdate = 0;
                lastFpsUpdate = now;

                if (debugMode) {
                    onUpdateHUD({
                        fps,
                        debugInfo: {
                            input: { w: 0, a: 0, s: 0, d: 0, fire: 0, reload: 0 },
                            aim: { x: 0, y: 0 },
                            cam: {
                                x: parseFloat(camera.position.x.toFixed(1)),
                                y: parseFloat(camera.position.y.toFixed(1)),
                                z: parseFloat(camera.position.z.toFixed(1))
                            },
                            modes: 'Camp',
                            enemies: 0,
                            objects: scene.children.length, // Direct children count
                            drawCalls: lastDrawCallsRef.current,
                            coords: { x: 0, z: 0 }
                        }
                    });
                } else {
                    onUpdateHUD({ fps });
                }
            }

            let perfTime = performance.now();
            timings.hud = perfTime - lastTime;
            lastTime = perfTime;

            // Update Environment (Wind, Stars, Fire, Particles)
            if (envStateRef.current) {
                // Update Wind
                CampEnvironment.updateEffects(scene, envStateRef.current, 0.016, now, frame, debugSystemFlagsRef.current);
            }

            perfTime = performance.now();
            timings.environment = perfTime - lastTime;
            lastTime = perfTime;

            const talkingMembers = new Set(activeChats.current.map(c => (now >= c.startTime && now <= c.startTime + c.duration) ? c.mesh.uuid : null).filter(Boolean));

            // Camera Lerp
            const targetLookAt = isIdleRef.current ? CINEMATIC_LOOK_AT : BASE_LOOK_AT;
            currentLookAt.lerp(targetLookAt, isIdleRef.current ? 0.002 : 0.05);
            camera.lookAt(currentLookAt);

            perfTime = performance.now();
            timings.camera = perfTime - lastTime;
            lastTime = perfTime;

            // Family Animations
            familyMembers.forEach(fm => {
                const isSpeaking = talkingMembers.has(fm.mesh.uuid) || fm.bounce > 0;
                if (fm.bounce > 0) { fm.bounce -= 0.02; if (fm.bounce < 0) fm.bounce = 0; }
                const body = fm.mesh.children.find((c: any) => c.userData.isBody) as THREE.Mesh;
                if (body) {
                    // In Camp, they are always 'idle' in terms of movement. 
                    // We allow 'isIdleLong' to trigger fidgeting animations regardless of UI state (isIdleRef).
                    // We just check if they've been instantiated for > 5 seconds to avoid sync glitches.
                    PlayerAnimation.update(body, {
                        isMoving: false,
                        isRushing: false,
                        isRolling: false,
                        rollStartTime: 0,
                        staminaRatio: 1.0,
                        isSpeaking,
                        isThinking: false,
                        isIdleLong: now > 5000,
                        seed: fm.seed
                    }, now, 0.016);
                }
            });

            perfTime = performance.now();
            timings.familyAnimation = perfTime - lastTime;
            lastTime = perfTime;

            // Chatter
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

            perfTime = performance.now();
            timings.chatter = perfTime - lastTime;
            lastTime = perfTime;

            // Update Chats
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
                    const vec = new THREE.Vector3(); chat.mesh.getWorldPosition(vec); vec.y += 1.8; vec.project(camera);
                    chat.element.style.left = `${(vec.x * 0.5 + 0.5) * width}px`; chat.element.style.top = `${(-(vec.y * 0.5) + 0.5) * height}px`; chat.element.style.transform = 'translate(-50%, -100%)';
                }
            }

            perfTime = performance.now();
            timings.chatUpdate = perfTime - lastTime;
            lastTime = perfTime;

            // Raycasting
            raycaster.setFromCamera(mouse, camera);
            const hits = raycaster.intersectObjects(interactables);
            let newHover = null, toolTipText = "", tooltipX = 0, tooltipY = 0;

            if (hits.length > 0) {
                let target: any = hits[0].object;
                if (!target.userData.id && target.parent && target.parent.userData.id) target = target.parent;
                newHover = target.userData.id;
                if (newHover && (newHover.startsWith('family_') || newHover.startsWith('player_'))) {
                    toolTipText = `${target.userData.name}`;
                    const vec = new THREE.Vector3(); target.getWorldPosition(vec); vec.y += 1.8; vec.project(camera);
                    tooltipX = (vec.x * 0.5 + 0.5) * width; tooltipY = (-(vec.y * 0.5) + 0.5) * height;
                }
            }

            if (newHover !== hoveredRef.current) { if (newHover) soundManager.playUiHover(); hoveredRef.current = newHover; setHoveredStation(newHover); }
            setTooltip((newHover && (newHover.startsWith('family_') || newHover.startsWith('player_'))) ? { text: toolTipText, x: tooltipX, y: tooltipY } : null);

            perfTime = performance.now();
            timings.raycasting = perfTime - lastTime;
            lastTime = perfTime;

            Object.keys(outlines).forEach(key => { outlines[key].visible = !isIdleRef.current && (hoveredRef.current === key); });
            interactables.forEach(o => {
                if (o.userData.type === 'family') {
                    (o.material as THREE.MeshStandardMaterial).emissiveIntensity = (o.userData.id === hoveredRef.current) ? 0.5 + Math.sin(frame * 0.2) * 0.5 : 0;
                    (o.material as THREE.MeshStandardMaterial).emissive.setHex(0xaaaaaa);
                }
            });

            perfTime = performance.now();
            timings.outlines = perfTime - lastTime;
            lastTime = perfTime;

            engine.renderer.render(scene, camera);

            perfTime = performance.now();
            timings.render = perfTime - lastTime;
            lastTime = perfTime;

            lastDrawCallsRef.current = engine.renderer.info.render.calls;

            const totalTime = performance.now() - frameStart;

            // Log if frame took >50ms (slow frame)
            if (totalTime > 50) {
                console.log(`[Camp Performance] Frame took ${totalTime.toFixed(2)}ms:`, {
                    hud: timings.hud.toFixed(2) + 'ms',
                    environment: timings.environment.toFixed(2) + 'ms',
                    camera: timings.camera.toFixed(2) + 'ms',
                    familyAnimation: timings.familyAnimation.toFixed(2) + 'ms',
                    chatter: timings.chatter.toFixed(2) + 'ms',
                    chatUpdate: timings.chatUpdate.toFixed(2) + 'ms',
                    raycasting: timings.raycasting.toFixed(2) + 'ms',
                    outlines: timings.outlines.toFixed(2) + 'ms',
                    render: timings.render.toFixed(2) + 'ms'
                });
            }
        };

        let frameId = requestAnimationFrame(animate);
        return () => {
            cancelAnimationFrame(frameId);
            window.removeEventListener('mousemove', onMM); window.removeEventListener('click', onCL); window.removeEventListener('resize', onResize);
            // We NO LONGER dispose the renderer here as it's shared
            // We only unmount it if necessary, but mount() handles unparenting
            activeChats.current.forEach(c => { if (c.element.parentNode) c.element.parentNode.removeChild(c.element); });
        };
    }, [rescuedFamilyIndices, debugMode, textures]);

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
                onMarkCollectiblesViewed={(newIds) => {
                    const updated = [...(stats.viewedCollectibles || [])];
                    newIds.forEach(id => {
                        if (!updated.includes(id)) {
                            updated.push(id);
                        }
                    });
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
                        Engine.getInstance().updateSettings(newG);
                    }}
                />
            )}

            {activeModal === 'reset_confirm' && (
                <ScreenResetConfirm
                    onConfirm={onResetGame}
                    onCancel={closeModal}
                />
            )}

            {showDebugPanel && (
                <DebugSystemPanel
                    flags={debugSystemFlags}
                    onToggle={(sys) => setDebugSystemFlags(prev => ({ ...prev, [sys]: !prev[sys] }))}
                    onClose={() => setShowDebugPanel(false)}
                />
            )}
        </div>
    );
};

export default Camp;