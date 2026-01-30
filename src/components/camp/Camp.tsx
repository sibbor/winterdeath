
import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { PlayerStats, WeaponType } from '../../types';
import { WEAPONS, MAP_THEMES, FAMILY_MEMBERS, PLAYER_CHARACTER, CHATTER_LINES } from '../../content/constants';
import { soundManager } from '../../utils/sound';
import { t } from '../../utils/i18n';
import { ModelFactory } from '../../utils/assets';
import { PlayerAnimation } from '../../core/animation/PlayerAnimation';
import { createCampTextures } from '../../utils/assets/campTextures';
import { CampWorld } from './CampWorld';
import { CampEnvironment, CampEffectsState } from './CampEnvironment';

// Import UI Components
import CampHUD from './CampHUD';
import ScreenStatistics from './ScreenStatistics';
import ScreenPlayerSkills from './ScreenPlayerSkills';
import ScreenArmory from './ScreenArmory';
import ScreenSectorOverview from './ScreenSectorOverview';
import ScreenSettings from './ScreenSettings';
import ScreenSectorBriefing from './ScreenSectorBriefing';
import ScreenResetConfirm from './ScreenResetConfirm';

interface CampProps {
    stats: PlayerStats;
    currentLoadout: { primary: WeaponType; secondary: WeaponType; throwable: WeaponType };
    weaponLevels: Record<WeaponType, number>;
    onSaveStats: (newStats: PlayerStats) => void;
    onSaveLoadout: (loadout: { primary: WeaponType; secondary: WeaponType; throwable: WeaponType }, levels: Record<WeaponType, number>) => void;
    onSelectMap: (mapIndex: number) => void;
    onStartMission: () => void;
    currentMap: number;
    debugMode: boolean;
    onToggleDebug: (val: boolean) => void;
    showFps: boolean;
    onToggleFps: (val: boolean) => void;
    familyMembersFound: number[];
    isMapLoaded: boolean;
    bossesDefeated: number[];
    onResetGame: () => void;
    hasCheckpoint?: boolean;
    onFPSUpdate?: (fps: number) => void; // New prop
}

const STATIONS = [
    { id: 'armory', pos: new THREE.Vector3(-7, 0, -4) },
    { id: 'missions', pos: new THREE.Vector3(0, 0, -12) },
    { id: 'skills', pos: new THREE.Vector3(8, 0, -4) }
];

const Camp: React.FC<CampProps> = ({ stats, currentLoadout, weaponLevels, onSaveStats, onSaveLoadout, onSelectMap, onStartMission, currentMap, debugMode, onToggleDebug, showFps, onToggleFps, familyMembersFound, isMapLoaded, bossesDefeated, onResetGame, hasCheckpoint, onFPSUpdate }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const chatOverlayRef = useRef<HTMLDivElement>(null);
    // fpsRef removed as it is now global

    const [hoveredStation, setHoveredStation] = useState<string | null>(null);
    const [activeModal, setActiveModal] = useState<'armory' | 'missions' | 'skills' | 'stats' | 'settings' | 'briefing' | 'reset_confirm' | null>(null);
    const [tooltip, setTooltip] = useState<{ x: number, y: number, text: string } | null>(null);

    // Idle UI State
    const [isIdle, setIsIdle] = useState(false);
    const isIdleRef = useRef(false);
    const lastInputRef = useRef(Date.now());

    const hoveredRef = useRef<string | null>(null);
    const activeRef = useRef<'armory' | 'missions' | 'skills' | 'stats' | 'settings' | 'briefing' | 'reset_confirm' | null>(null);
    const activeModalRef = useRef<'armory' | 'missions' | 'skills' | 'stats' | 'settings' | 'briefing' | 'reset_confirm' | null>(null);

    const nextChatterTime = useRef<number>(Date.now() + 5000);
    const activeChats = useRef<Array<{ id: string, mesh: THREE.Object3D, text: string, startTime: number, duration: number, element: HTMLDivElement, playedSound: boolean }>>([]);

    const envStateRef = useRef<CampEffectsState | null>(null);

    const textures = useMemo(() => createCampTextures(), []);

    useEffect(() => {
        soundManager.resume();
        soundManager.startCampfire();
        return () => soundManager.stopCampfire();
    }, []);

    // Idle Timer
    useEffect(() => {
        const handleInput = () => { lastInputRef.current = Date.now(); if (isIdle) setIsIdle(false); };
        window.addEventListener('mousemove', handleInput); window.addEventListener('mousedown', handleInput); window.addEventListener('keydown', handleInput); window.addEventListener('touchstart', handleInput);
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
    }, [activeModal]);

    // --- THREE.JS SCENE SETUP ---
    useEffect(() => {
        if (!containerRef.current) {
            return;
        }
        const container = containerRef.current;
        while (container.firstChild) container.removeChild(container.firstChild);

        const width = container.clientWidth;
        const height = container.clientHeight;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x050510);
        scene.fog = new THREE.FogExp2(0x050510, 0.015);

        const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 3000);
        camera.position.set(0, 10, 22);

        const BASE_LOOK_AT = new THREE.Vector3(0, 2, -5);
        const CINEMATIC_LOOK_AT = new THREE.Vector3(0, 8, -5);
        const currentLookAt = BASE_LOOK_AT.clone();
        camera.lookAt(currentLookAt);

        const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        renderer.setSize(width, height);
        // Optimize: Cap pixel ratio for high-DPI screens (Surface Pro)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        const hemiLight = new THREE.HemisphereLight(0x444455, 0x111115, 0.6);
        scene.add(hemiLight);

        // --- SETUP WORLD & ENV via Systems ---
        CampWorld.setupTerrain(scene, textures);
        const { interactables, outlines } = CampWorld.setupStations(scene, textures, STATIONS);

        // Initialize Environment (Sky, Campfire, Particles, Wind)
        envStateRef.current = CampEnvironment.initEffects(scene, textures);

        // --- FAMILY MEMBERS ---
        const familyGroup = new THREE.Group();
        const familyMembers: any[] = [];
        const activeMembers: any[] = [PLAYER_CHARACTER];

        if (debugMode) FAMILY_MEMBERS.forEach(m => activeMembers.push(m));
        else {
            familyMembersFound.forEach(mapId => {
                if (mapId < 4) activeMembers.push(FAMILY_MEMBERS[mapId]);
                else if (mapId === 4) { activeMembers.push(FAMILY_MEMBERS[4]); activeMembers.push(FAMILY_MEMBERS[5]); }
            });
        }

        const humans = activeMembers.filter(m => m.race === 'human');
        const animals = activeMembers.filter(m => m.race === 'animal');

        activeMembers.forEach((memberData) => {
            const member = (memberData.id === 'player') ? ModelFactory.createPlayer() : ModelFactory.createFamilyMember(memberData);
            let angle = 0, radius = memberData.race === 'animal' ? 5.2 : 5.0;

            if (memberData.race === 'animal') {
                angle = 1.2 + animals.indexOf(memberData) * 0.25;
            } else {
                const idx = humans.indexOf(memberData);
                angle = -(humans.length - 1) * 0.25 / 2 + idx * 0.25;
            }

            member.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
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
            if (!containerRef.current) return;
            const w = containerRef.current.clientWidth, h = containerRef.current.clientHeight;
            camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
        };
        window.addEventListener('resize', onResize);

        // --- ANIMATION LOOP ---
        let frame = 0;
        let framesSinceUpdate = 0;
        let lastFpsUpdate = Date.now();

        const animate = () => {
            frameId = requestAnimationFrame(animate);

            // Performance Optimization: Throttle FPS when menu is open
            if (activeModalRef.current) {
                // Skip every other frame (30 FPS cap)
                if (frame % 2 !== 0) {
                    frame++;
                    return;
                }
            }

            frame++;
            // activeRef is managed by the sync effect now, or we read from activeModalRef directly. 
            // But to be safe with existing logic:
            activeRef.current = activeModalRef.current;
            const now = Date.now();

            // Update FPS Ref text
            framesSinceUpdate++;
            if (now - lastFpsUpdate >= 500) {
                const fps = Math.round((framesSinceUpdate * 1000) / (now - lastFpsUpdate));
                if (onFPSUpdate) onFPSUpdate(fps);
                framesSinceUpdate = 0;
                lastFpsUpdate = now;
            }

            // Update Environment (Wind, Stars, Fire, Particles)
            if (envStateRef.current) {
                CampEnvironment.updateEffects(scene, envStateRef.current, 0.016, now, frame);
            }

            const talkingMembers = new Set(activeChats.current.map(c => (now >= c.startTime && now <= c.startTime + c.duration) ? c.mesh.uuid : null).filter(Boolean));

            // Camera Lerp
            const targetLookAt = isIdleRef.current ? CINEMATIC_LOOK_AT : BASE_LOOK_AT;
            currentLookAt.lerp(targetLookAt, isIdleRef.current ? 0.002 : 0.05);
            camera.lookAt(currentLookAt);

            // Family Animations
            familyMembers.forEach(fm => {
                const isSpeaking = talkingMembers.has(fm.mesh.uuid) || fm.bounce > 0;
                if (fm.bounce > 0) { fm.bounce -= 0.02; if (fm.bounce < 0) fm.bounce = 0; }
                const body = fm.mesh.children.find((c: any) => c.userData.isBody) as THREE.Mesh;
                if (body) {
                    PlayerAnimation.update(body, { isMoving: false, isRushing: false, isRolling: false, rollStartTime: 0, staminaRatio: 1.0, isSpeaking, isThinking: false, isIdleLong: isIdleRef.current, seed: fm.seed }, now, 0.016);
                }
            });

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

            Object.keys(outlines).forEach(key => { outlines[key].visible = !isIdleRef.current && (hoveredRef.current === key); });
            interactables.forEach(o => {
                if (o.userData.type === 'family') {
                    (o.material as THREE.MeshStandardMaterial).emissiveIntensity = (o.userData.id === hoveredRef.current) ? 0.5 + Math.sin(frame * 0.2) * 0.5 : 0;
                    (o.material as THREE.MeshStandardMaterial).emissive.setHex(0xaaaaaa);
                }
            });
            renderer.render(scene, camera);
        };

        let frameId = requestAnimationFrame(animate);
        return () => {
            cancelAnimationFrame(frameId);
            window.removeEventListener('mousemove', onMM); window.removeEventListener('click', onCL); window.removeEventListener('resize', onResize);
            renderer.dispose(); if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
            activeChats.current.forEach(c => { if (c.element.parentNode) c.element.parentNode.removeChild(c.element); });
        };
    }, [familyMembersFound, debugMode, textures]);

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
                    stats={stats} hoveredStation={hoveredStation} currentMapName={t(MAP_THEMES[currentMap]?.name || '')} hasCheckpoint={!!hasCheckpoint} isIdle={isIdle}
                    currentLoadoutNames={{ pri: t(WEAPONS[currentLoadout.primary].displayName), sec: t(WEAPONS[currentLoadout.secondary].displayName), thr: t(WEAPONS[currentLoadout.throwable].displayName) }}
                    onOpenStats={() => openModal('stats')} onOpenArmory={() => openModal('armory')} onOpenSkills={() => openModal('skills')}
                    onOpenSettings={() => openModal('settings')} onStartMission={() => { }}
                    debugMode={debugMode} onToggleDebug={onToggleDebug} onResetGame={() => openModal('reset_confirm')}
                    onDebugScrap={() => onSaveStats({ ...stats, scrap: stats.scrap + 10 })} onDebugSkill={() => onSaveStats({ ...stats, skillPoints: stats.skillPoints + 1 })}
                />
            )}

            {activeModal === 'stats' && <ScreenStatistics stats={stats} onClose={closeModal} />}
            {activeModal === 'armory' && <ScreenArmory stats={stats} currentLoadout={currentLoadout} weaponLevels={weaponLevels} onClose={closeModal} onSave={(s, l, wl) => { onSaveStats(s); onSaveLoadout(l, wl); closeModal(); }} />}
            {activeModal === 'skills' && <ScreenPlayerSkills stats={stats} onSave={onSaveStats} onClose={closeModal} />}
            {activeModal === 'missions' && <ScreenSectorOverview currentMap={currentMap} familyMembersFound={familyMembersFound} bossesDefeated={bossesDefeated} debugMode={debugMode} onClose={closeModal} onSelectMap={(id) => { onSelectMap(id); openModal('briefing'); }} />}
            {activeModal === 'settings' && <ScreenSettings onClose={closeModal} showFps={showFps} onToggleFps={onToggleFps} />}
            {activeModal === 'briefing' && <ScreenSectorBriefing mapIndex={currentMap} isExtracted={familyMembersFound.includes(currentMap)} isBossDefeated={bossesDefeated.includes(currentMap)} onStart={() => onStartMission()} onCancel={() => openModal('missions')} />}
            {activeModal === 'reset_confirm' && <ScreenResetConfirm onConfirm={onResetGame} onCancel={closeModal} />}
        </div>
    );
};

export default Camp;