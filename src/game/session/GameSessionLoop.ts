import * as THREE from 'three';
import { WinterEngine } from '../../core/engine/WinterEngine';
import { GameSessionLogic } from './GameSessionLogic';
import { CameraShakeType } from '../../systems/CameraSystem';
import { GameSessionState } from './GameSessionState';
import { HudSystem } from '../../systems/HudSystem';
import { FootprintSystem } from '../../systems/FootprintSystem';
import { FXSystem } from '../../systems/FXSystem';
import { CAMERA_HEIGHT } from '../../content/constants';
import { audioEngine } from '../../utils/audio/AudioEngine';
import { Enemy, EnemyFlags, EnemyDeathState, NoiseType, EnemyType } from '../../entities/enemies/EnemyTypes';
import { StatusEffectID } from '../../types/StatusEffects';
import { DeathPhase } from '../../types/SessionTypes';
import { StatID, PlayerStatusFlags } from '../../types/CareerStats';
import { DamageID, DamageType, EnemyAttackType } from '../../entities/player/CombatTypes';
import { HudStore } from '../../store/HudStore';
import { DiscoveryType } from '../../components/ui/hud/HudTypes';
import { InteractionType } from '../../systems/ui/UIEventBridge';
import { SoundID } from '../../utils/audio/AudioTypes';
import { NavigationSystem } from '../../systems/NavigationSystem';
import { FXParticleType, FXDecalType } from '../../types/FXTypes';
import { EffectPool, SubEffectType } from '../../systems/EffectManager';
import { WeaponFX } from '../../systems/WeaponFX';
import { PerkFX } from '../../systems/PerkFX';
import { SectorUpdateContext } from './SectorTypes';
import { ChunkManager } from '../../core/world/ChunkManager';
import { CombatEngine } from './CombatEngine';

interface LoopContext {
    engine: WinterEngine;
    session: GameSessionLogic;
    state: GameSessionState;
    refs: any;
    propsRef: any;
    callbacks: {
        endSector: (val: boolean) => void;
        spawnParticle: (x: number, y: number, z: number, type: FXParticleType, count: number, customMesh?: THREE.Object3D, customVel?: THREE.Vector3, color?: number, scale?: number, life?: number) => void;
        spawnDecal: (x: number, z: number, scale: number, material?: THREE.Material, type?: FXDecalType) => void;
        showDamageText: (x: number, y: number, z: number, text: string, color?: number) => void;
        t: (k: string) => string;
        onAction: (action: any) => void;
        onDiscovery?: (type: DiscoveryType, id: string, titleKey: string, detailsKey: string, payload?: any) => void;
        onDeathStateChange?: (val: boolean) => void;
        handlePlayerHit: (damage: number, attacker: any, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => boolean;
        spawnZombie: (type: EnemyType, pos?: THREE.Vector3) => void;
        spawnHorde: (count: number, type: EnemyType, pos?: THREE.Vector3) => void;
        setBubble: (n: any) => void;
        setInteraction: (interaction: any) => void;
        setOverlay: (type: number | null) => void;
        playSound: (id: SoundID) => void;
        playTone: (freq: number, type: any, duration: number, vol?: number) => void;
        cameraShake: (amount: number, type?: any) => void;
        startCinematic: (target: any, sectorId: number, dialogueId?: number, params?: any) => void;
        setCameraOverride: (params: any) => void;
        makeNoise: (pos: THREE.Vector3, type: NoiseType, radius?: number) => void;
        rewardXP: (amount: number) => void;
        rewardSP: (amount: number) => void;
        rewardScrap: (amount: number) => void;
    };
}

// ============================================================================
// ZERO-GC GLOBALS
// ============================================================================
const EMPTY_OBJECT: any = {};

const _v1 = new THREE.Vector3();
const _vCamera = new THREE.Vector3();
const _vInteraction = new THREE.Vector3();
const _interactionScreenPosScratch = { x: 0, y: 0 };
const _traverseStack: THREE.Object3D[] = []; // Used for Zero-GC scene traversal

// --- INTERACTIVE VEGETATION BENDING ---
const _bendInteractors = new Array(8).fill(null).map(() => new THREE.Vector4(0, 0, 0, 0));
const _bendDistSq = new Float32Array(8);

// Pre-define ALL properties to lock V8 Hidden Classes (Shapes)
const _fxCallbacks = {
    handlePlayerHit: null as any,
    spawnDecal: null as any,
    spawnParticle: null as any
};

// Pre-define ALL properties to lock V8 Hidden Classes (Shapes)
const _triggerOptionsScratch: any = {
    t: null,
    setBubble: null,
    onTrigger: null,
    onAction: null,
    removeVisual: null,
    resolveDynamicPos: null,
    onDiscovery: null,
    playSound: null,
    activeFamilyMembers: null
};

// String cache for damage numbers to prevent GC spikes during rapid fire
const _numberStringCache: Record<number, string> = {};
function getCachedNumberString(num: number): string {
    const rounded = Math.round(num);
    if (!_numberStringCache[rounded]) _numberStringCache[rounded] = rounded.toString();
    return _numberStringCache[rounded];
}

// --- PRE-ALLOCATED SECTOR UPDATE CONTEXT (ZERO-GC) ---
const _sectorUpdateContext: SectorUpdateContext = {
    delta: 0,
    simTime: 0,
    renderTime: 0,
    playerPos: null as any,
    triggerSystem: null as any,
    state: null,
    gameState: null,
    handleDiscovery: null as any,
    sectorState: null,
    scene: null,
    onAction: null,
    spawnZombie: null,
    spawnHorde: null,
    setBubble: null,
    setInteraction: null,
    setOverlay: null,
    playSound: null,
    playTone: null,
    cameraShake: null,
    engine: null,
    worldStreamer: null,
    t: null as any,
    spawnParticle: null as any,
    spawnDecal: null as any,
    handlePlayerHit: null,
    startCinematic: null,
    setCameraOverride: null,
    makeNoise: null,
    ctx: null as any,
    setWeather: null as any,
    setFog: null as any,
    setWindStrength: null as any,
    setBackgroundColor: null as any,
    setGroundColor: null as any,
    setFOV: null as any,
    rewardXP: null as any,
    rewardSP: null as any,
    rewardScrap: null as any,
    setLight: null as any
};

export function createGameLoop(ctx: LoopContext): (dt: number, simTime: number, renderTime: number) => void {
    const { engine, session, state, refs, propsRef, callbacks } = ctx;

    let frame = 0;
    let lastHudSyncTime = 0;
    let lastThrottledTime = 0;
    let lastBossIntroShakeTime = 0;
    ChunkManager.clear();

    // Cache system references to avoid Map/registry lookup overhead
    let discoverySystem: any = null;
    let windSystem: any = null;

    const getActiveCallbacks = () => state.callbacks || callbacks || EMPTY_OBJECT;

    // Initial binding for FX (will be updated in loop if needed)
    _fxCallbacks.handlePlayerHit = callbacks.handlePlayerHit;
    _fxCallbacks.spawnDecal = callbacks.spawnDecal;
    _fxCallbacks.spawnParticle = callbacks.spawnParticle;

    // --- BIND STABLE CALLBACKS TO SECTOR CONTEXT ---
    _sectorUpdateContext.onAction = callbacks.onAction;
    _sectorUpdateContext.spawnZombie = callbacks.spawnZombie;
    _sectorUpdateContext.spawnHorde = callbacks.spawnHorde;
    _sectorUpdateContext.setBubble = callbacks.setBubble;
    _sectorUpdateContext.setInteraction = callbacks.setInteraction;
    _sectorUpdateContext.setOverlay = callbacks.setOverlay;
    _sectorUpdateContext.playSound = callbacks.playSound;
    _sectorUpdateContext.playTone = callbacks.playTone;
    _sectorUpdateContext.cameraShake = callbacks.cameraShake;
    _sectorUpdateContext.spawnParticle = callbacks.spawnParticle;
    _sectorUpdateContext.spawnDecal = callbacks.spawnDecal;
    _sectorUpdateContext.startCinematic = callbacks.startCinematic;
    _sectorUpdateContext.setCameraOverride = callbacks.setCameraOverride;
    _sectorUpdateContext.makeNoise = callbacks.makeNoise;
    _sectorUpdateContext.rewardXP = callbacks.rewardXP;
    _sectorUpdateContext.rewardSP = callbacks.rewardSP;
    _sectorUpdateContext.rewardScrap = callbacks.rewardScrap;
    _sectorUpdateContext.t = callbacks.t;
    _sectorUpdateContext.scene = engine.scene;
    _sectorUpdateContext.gameState = state;

    // [VINTERDÖD FIX] Zero-GC Traversal avoiding Three.js .traverse() closures
    _triggerOptionsScratch.removeVisual = (id: string) => {
        const scene = engine.scene;
        let visual: THREE.Object3D | null = null;
        const targetName = `clue_visual_${id}`;

        _traverseStack.length = 0;
        _traverseStack.push(scene);

        while (_traverseStack.length > 0) {
            const node = _traverseStack.pop() as THREE.Object3D;

            if (node.name === targetName || (node.userData.id === id && node.userData.type === 'clue_visual')) {
                visual = node;
                _traverseStack.length = 0; // Clear immediately to free refs
                break;
            }

            for (let i = 0; i < node.children.length; i++) {
                _traverseStack.push(node.children[i]);
            }
        }

        if (visual) {
            _traverseStack.length = 0;
            _traverseStack.push(visual);

            while (_traverseStack.length > 0) {
                const child = _traverseStack.pop() as any;

                if (child.isPointLight || child.isSpotLight || child.isDirectionalLight) {
                    child.intensity = 0;
                } else if (child.isMesh) {
                    child.visible = false;
                }

                for (let i = 0; i < child.children.length; i++) {
                    _traverseStack.push(child.children[i]);
                }
            }
        }
    };

    const _gameContext: any = {
        scene: null,
        enemies: null,
        obstacles: null,
        worldStreamer: null,
        spawnParticle: null,
        spawnDecal: null,
        showDamageText: null,
        simTime: 0,
        renderTime: 0,
        playerPos: null as any,
        session: null,
        fireZones: null,
        makeNoise: (pos: THREE.Vector3, type: NoiseType, radius: number) => session.makeNoise(pos, type, radius),
        handlePlayerHit: (damage: number, attacker: any, damageType: DamageType, damageSource: DamageID, isDoT: boolean = false, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => {
            return CombatEngine.handlePlayerHit(session, damage, attacker, damageType, damageSource, isDoT, effectType, duration, intensity, specificAttackType);
        },
        handleEnemyHit: (enemy: Enemy, amount: number, damageType: DamageType, damageSource: DamageID, isHighImpact: boolean = false) => {
            return CombatEngine.handleEnemyHit(session, enemy, amount, damageType, damageSource, isHighImpact);
        },
    };

    state.handleEnemyHit = _gameContext.handleEnemyHit;

    _triggerOptionsScratch.resolveDynamicPos = (familyId?: number, ownerId?: string) => {
        if (familyId !== undefined) {
            const members = refs.activeFamilyMembers.current;
            for (let i = 0; i < members.length; i++) {
                if (members[i].id === familyId) {
                    if (members[i].following) return null;
                    return members[i].mesh?.position || null;
                }
            }
            return null;
        }

        if (ownerId) {
            const scene = engine.scene;
            _traverseStack.length = 0;
            _traverseStack.push(scene);

            while (_traverseStack.length > 0) {
                const node = _traverseStack.pop() as THREE.Object3D;

                if (node.name === ownerId || node.userData.id === ownerId) {
                    _traverseStack.length = 0;
                    return node.position;
                }

                for (let i = 0; i < node.children.length; i++) {
                    _traverseStack.push(node.children[i]);
                }
            }
            return null;
        }
        return null;
    };

    return (dt: number, simTime: number, renderTime: number) => {
        if (!refs.isMounted.current || refs.isBuildingSectorRef.current) return;

        // Inject unified callbacks into session for systems to access (Zero-GC Bridge)
        session.callbacks = callbacks;

        let delta = dt;
        if (delta > 0.1) delta = 0.016;

        const isCinematic = state.ui.cinematicActive;
        const isBossIntro = refs.bossIntroRef.current?.active;
        const isHardPaused = propsRef.current.isPaused || propsRef.current.isClueOpen;
        const isInteractionPaused = state.triggers.isInteractionOpen && !isCinematic;

        // 1. ESC-Meny eller Clue = TOTAL FRYSNING
        if (isHardPaused && !isCinematic && !isBossIntro) {
            engine.isSimulationPaused = true;
            return;
        }

        if (engine.isSimulationPaused) {
            engine.input.clearActions();
            engine.isSimulationPaused = false;
        }

        // --- Simulation & Visual Clocks ---
        state.lastSimDelta = delta;
        state.lastRenderDelta = delta;
        state.renderTime = renderTime;
        state.simTime = simTime;

        const now = renderTime;

        const water = engine.water;

        const sf = state.combat.statusFlags;
        const isDead = (sf & PlayerStatusFlags.DEAD) !== 0;

        const monitor = engine.systems.performanceMonitor!;
        frame++;

        if (isInteractionPaused) {
            refs.lastDrawCallsRef.current = engine.renderer.info.render.calls;
            engine.isRenderingPaused = false;
            return;
        } else {
            engine.isRenderingPaused = false;
        }

        const playerGroup = refs.playerGroupRef.current;
        if (!playerGroup || playerGroup.children.length === 0) return;

        // 2. UI Throttling (Stympat och oanvänt block borttaget för renare prestanda)
        refs.lastDrawCallsRef.current = engine.renderer.info.render.calls;
        state.metrics.framesSinceHudUpdate++;

        // 3. Boss Intro overrides
        if (isBossIntro && refs.bossIntroRef.current.bossMesh) {
            const bossMesh = refs.bossIntroRef.current.bossMesh;
            const bossPos = bossMesh.position;
            const introTime = renderTime - refs.bossIntroRef.current.startTime;

            _vCamera.set(bossPos.x, 12, bossPos.z + 20);
            engine.camera.setPosition(_vCamera);
            _vInteraction.set(bossPos.x, bossPos.y + 3, bossPos.z);
            engine.camera.lookAt(_vInteraction);

            if (now - lastBossIntroShakeTime >= 83 && introTime < 3000) { // ~12Hz (every 83ms)
                lastBossIntroShakeTime = now;
                bossMesh.rotation.y += (Math.random() - 0.5) * 0.2;
                bossMesh.scale.setScalar(3.0 + Math.sin(now * 0.02) * 0.1);
            }
            refs.lastDrawCallsRef.current = engine.renderer.info.render.calls;
            return;
        }

        // 4. Throttled logic (Burning effects) - runs at 10Hz (every 100ms)
        if (now - lastThrottledTime >= 100) {
            lastThrottledTime = now;

            monitor.begin('burning_effects');
            const effectCount = EffectPool.activeCount;
            for (let i = 0; i < effectCount; i++) {
                const target = EffectPool.target[i];
                if (!target || !target.visible) continue;

                if (EffectPool.type[i] !== SubEffectType.EMITTER) continue;
                if (Math.random() > 0.3) continue;

                _vInteraction.set(EffectPool.offsetX[i], EffectPool.offsetY[i], EffectPool.offsetZ[i]);
                _vInteraction.add(target.position);

                const distSq = _vInteraction.distanceToSquared(playerGroup.position);
                if (distSq > 3600) continue;

                const pType = EffectPool.particleType[i] as FXParticleType;
                const color = EffectPool.color[i];
                const count = EffectPool.count[i];
                const areaX = EffectPool.areaX[i];
                const areaZ = EffectPool.areaZ[i];

                for (let k = 0; k < count; k++) {
                    _v1.copy(_vInteraction);

                    if (areaX > 0 || areaZ > 0) {
                        const cos = Math.cos(target.rotation.y);
                        const sin = Math.sin(target.rotation.y);
                        const lx = (Math.random() - 0.5) * areaX;
                        const lz = (Math.random() - 0.5) * areaZ;
                        _v1.x += lx * cos + lz * sin;
                        _v1.z += -lx * sin + lz * cos;
                    } else {
                        const spread = EffectPool.spread[i] || 0.4;
                        _v1.x += (Math.random() - 0.5) * spread;
                        _v1.z += (Math.random() - 0.5) * spread;
                    }

                    callbacks.spawnParticle(_v1.x, _v1.y, _v1.z, pType, 1, undefined, undefined, color);
                }
            }

            monitor.end('burning_effects');
        }

        // Run burning particle spawn outside the throttled 100ms check for high-frequency rendering fluidity
        if (!isDead && (state.combat.statusFlags & PlayerStatusFlags.BURNING) !== 0) {
            if (Math.random() < 0.25) {
                FXSystem.spawnParticle(
                    engine.scene,
                    state.combat.particles,
                    playerGroup.position.x + (Math.random() - 0.5) * 0.5,
                    playerGroup.position.y + 0.5 + Math.random() * 1.3,
                    playerGroup.position.z + (Math.random() - 0.5) * 0.5,
                    FXParticleType.ENEMY_EFFECT_FLAME, 1
                );
            }
        }

        // 5. Sector Flow
        if (state.enemies.bossDefeatedTime > 0) {
            if (simTime - state.enemies.bossDefeatedTime < 10000) {
                state.player.invulnerableUntil = simTime + 10000;
                if (simTime - state.enemies.bossDefeatedTime > 4000) {
                    callbacks.endSector(state.world.familyFound);
                    return;
                }
            } else {
                state.enemies.bossDefeatedTime = 0;
            }
        }

        if (propsRef.current.triggerEndSector) {
            callbacks.endSector(false);
            return;
        }

        if (!propsRef.current.isGameRunning || (propsRef.current.isPaused && !isCinematic && !isBossIntro)) {
            audioEngine.stopAmbience();
            return;
        }

        // 6. Teleport Logic delegated to PlayerManager

        // 7. Session updates
        if (isCinematic || isBossIntro) {
            session.inputDisabled = true;
        } else {
            session.inputDisabled = !!propsRef.current.disableInput || (!!refs.cameraOverrideRef.current?.active);
        }

        session.isMobileDevice = !!propsRef.current.isMobileDevice;
        session.debugMode = propsRef.current.debugMode;
        session.cameraAngle = engine.camera.angle;

        monitor.begin('session_update');
        if (playerGroup) {
            NavigationSystem.tick(state.player.position, simTime);
        }

        session.update(delta, propsRef.current.currentSector || 0);
        monitor.end('session_update');

        monitor.begin('chunk_mounting');
        if (engine.camera && engine.camera.threeCamera) {
            ChunkManager.update(engine.camera.threeCamera.position, engine.scene);
        } else if (playerGroup) {
            ChunkManager.update(playerGroup.position, engine.scene);
        }
        monitor.end('chunk_mounting');

        _sectorUpdateContext.state = state;
        _sectorUpdateContext.gameState = state;
        _sectorUpdateContext.playerPos = state.player.position;
        _sectorUpdateContext.triggerSystem = session.systems.triggerSystem;
        _sectorUpdateContext.handleDiscovery = (type: any, id: any, smi?: number, title?: string, details?: string, payload?: any) => {
            if (!discoverySystem) discoverySystem = session.systems.discovery;
            return discoverySystem ? discoverySystem.handleDiscovery(session, type, id, smi, title, details, payload) : false;
        };

        _sectorUpdateContext.handleEnemyHit = state.handleEnemyHit;
        _sectorUpdateContext.handlePlayerHit = callbacks.handlePlayerHit;
        _sectorUpdateContext.playSound = (id: any) => audioEngine.playSound(id);
        _sectorUpdateContext.playTone = callbacks.playTone;
        _sectorUpdateContext.cameraShake = callbacks.cameraShake;
        _sectorUpdateContext.t = callbacks.t;
        _sectorUpdateContext.spawnParticle = callbacks.spawnParticle;
        _sectorUpdateContext.startCinematic = (target?: any, sectorId?: number, dialogueId?: number, params?: any) => {
            session.startCinematic(target, sectorId, dialogueId, params);
        };
        _sectorUpdateContext.setCameraOverride = callbacks.setCameraOverride;
        _sectorUpdateContext.makeNoise = (pos: THREE.Vector3, type: any, radius?: number) => session.makeNoise(pos, type, radius);

        // --- ENVIRONMENT CONTROLS ---
        _sectorUpdateContext.setWeather = (type: any, count?: number) => engine.weather.sync(type, count || 2000);
        _sectorUpdateContext.setFog = (density: number, height?: number, color?: THREE.Color) => engine.fog.sync(density, height, color);
        _sectorUpdateContext.setWindStrength = (strength: number) => engine.wind.sync(strength * 0.5, strength);
        _sectorUpdateContext.setFOV = (fov: number) => engine.camera.set('fov', fov);

        monitor.end('sector_update');        // 8. Standard Gameplay State Updates and Animation delegated to PlayerManager and PlayerStatsSystem  }

        // 9. Footprints
        monitor.begin('footprints');
        FootprintSystem.update(session, delta, simTime, renderTime);
        monitor.end('footprints');

        // 11. Camera Processing (Optimized Math.pow out for pure multiplication)
        if (!isCinematic && !isBossIntro) {
            if (refs.cameraOverrideRef.current && refs.cameraOverrideRef.current.active) {
                const override = refs.cameraOverrideRef.current;

                if (!override.startPos) {
                    override.startPos = engine.camera.position.clone();
                    override.startTime = renderTime;
                    override.endTime = renderTime + 4000;
                    engine.camera.setCinematic(true);
                }

                if (renderTime > override.endTime) {
                    refs.cameraOverrideRef.current = null;
                    engine.camera.setCinematic(false);
                } else {
                    const elapsed = renderTime - override.startTime;
                    const rawT = Math.min(1.0, elapsed / 1500);
                    const invT = 1.0 - rawT;
                    const t = 1.0 - (invT * invT * invT); // Optimerad heltalspow

                    const heightArc = Math.sin(t * Math.PI) * 20;

                    const currentX = THREE.MathUtils.lerp(override.startPos.x, override.targetPos.x, t);
                    const currentY = THREE.MathUtils.lerp(override.startPos.y, override.targetPos.y, t) + heightArc;
                    const currentZ = THREE.MathUtils.lerp(override.startPos.z, override.targetPos.z, t);

                    _vCamera.set(currentX, currentY, currentZ);
                    engine.camera.setPosition(_vCamera, true);
                    engine.camera.lookAt(override.lookAtPos, true);
                }
            } else {
                if (state.metrics.hurtShake > 0) {
                    engine.camera.shake(state.metrics.hurtShake, CameraShakeType.HURT);
                    state.metrics.hurtShake *= Math.exp(-4.0 * delta);
                    if (state.metrics.hurtShake < 0.01) state.metrics.hurtShake = 0;
                }
                if (state.metrics.cameraShake > 0) {
                    engine.camera.shake(state.metrics.cameraShake, CameraShakeType.GENERAL);
                    state.metrics.cameraShake *= Math.exp(-10.0 * delta);
                    if (state.metrics.cameraShake < 0.01) state.metrics.cameraShake = 0;
                }
                if ((state.combat.statusFlags & PlayerStatusFlags.DISORIENTED) !== 0) {
                    engine.camera.shake(0.20, CameraShakeType.GENERAL);
                }

                const envCameraZ = propsRef.current.currentSectorData?.environment.cameraOffsetZ || 25;
                const envCameraY = propsRef.current.currentSectorData?.environment.cameraHeight || CAMERA_HEIGHT;
                engine.camera.setCinematic(false);
                engine.camera.follow(playerGroup.position, envCameraZ, envCameraY);
            }
        } else {
            engine.camera.setCinematic(true);
        }
        if (water) {
            water.update(_gameContext, delta, simTime, renderTime);
        }


        refs.lastDrawCallsRef.current = engine.renderer.info.render.calls;

        // 13. Interaction Logic
        const currentInter = state.triggers.interaction.type;
        const currentLabel = state.triggers.interaction.label;
        const lastType = refs.interactionTypeRef.current;

        if (state.triggers.interaction.active && state.triggers.hasInteractionTarget) {
            _vInteraction.copy(state.triggers.interactionTargetPos);
            _vInteraction.y += 1.5;

            const vector = _vInteraction.project(engine.camera.threeCamera);

            if (vector.z >= -1.0 && vector.z <= 1.05) {
                const screenX = Math.round((vector.x + 1) / 2 * engine.screenWidth);
                const screenY = Math.round((1 - vector.y) / 2 * engine.screenHeight);

                const lastPos = refs.lastInteractionPosRef.current;

                const posChanged = !lastPos || Math.abs(lastPos.x - screenX) > 3.0 || Math.abs(lastPos.y - screenY) > 2.0;
                const typeChanged = currentInter !== lastType;
                const labelChanged = currentLabel !== (state as any).lastInteractionLabel;

                if (posChanged || typeChanged || labelChanged) {
                    _interactionScreenPosScratch.x = screenX;
                    _interactionScreenPosScratch.y = screenY;
                    refs.lastInteractionPosRef.current = _interactionScreenPosScratch;
                    refs.interactionTypeRef.current = currentInter;
                    (state as any).lastInteractionLabel = currentLabel;

                    const hData = HudStore.getState();
                    hData.interactionActive = true;
                    hData.interactionType = currentInter;
                    hData.interactionLabel = currentLabel;
                    hData.interactionTargetId = state.triggers.interaction.targetId;
                    hData.interactionX = screenX;
                    hData.interactionY = screenY;

                    HudStore.update(hData);
                }
            } else {
                if (refs.interactionTypeRef.current !== InteractionType.NONE) {
                    refs.interactionTypeRef.current = InteractionType.NONE;
                    const hData = HudStore.getState();
                    hData.interactionActive = false;
                    HudStore.update(hData);
                }
            }
        } else {
            if (refs.interactionTypeRef.current !== InteractionType.NONE) {
                refs.interactionTypeRef.current = InteractionType.NONE;
                refs.lastInteractionPosRef.current = null;
                (state as any).lastInteractionLabel = null;

                const hData = HudStore.getState();
                hData.interactionActive = false;
                HudStore.update(hData);
            }
        }

        // 14. Game Context
        const activeCallbacks = getActiveCallbacks();

        _gameContext.scene = engine.scene;
        _gameContext.enemies = state.enemies.pool;
        _gameContext.obstacles = state.world.obstacles;
        _gameContext.worldStreamer = session.systems.worldStreamer;
        _gameContext.spawnParticle = activeCallbacks.spawnParticle || callbacks.spawnParticle;
        _gameContext.spawnDecal = activeCallbacks.spawnDecal || callbacks.spawnDecal;
        _gameContext.showDamageText = activeCallbacks.showDamageText || callbacks.showDamageText;

        if (activeCallbacks.explodeEnemy) _gameContext.explodeEnemy = activeCallbacks.explodeEnemy;
        if (activeCallbacks.trackStats) _gameContext.trackStats = activeCallbacks.trackStats;
        _gameContext.fireZones = state.combat.fireZones;

        _gameContext.simTime = simTime;
        _gameContext.renderTime = renderTime;
        _gameContext.playerPos = state.player.position;
        _gameContext.session = session;

        refs.gameContextRef.current = _gameContext;

        // 18. Emitters Update
        monitor.begin('active_effects');

        FXSystem.updateFX(engine.scene, state.combat.particles, state.world.bloodDecals, _fxCallbacks, delta, simTime, renderTime, state);
        WeaponFX.updateFX(session, delta);
        PerkFX.updateFX(session, delta, simTime, renderTime);

        if (state.world.activeEffects.length > 0) {
            const isBacklogged = (FXSystem as any).ambientQueue && (FXSystem as any).ambientQueue.length > 1000;

            for (let i = 0; i < state.world.activeEffects.length; i++) {
                const obj = state.world.activeEffects[i];
                if (!obj.visible || !obj.userData.effects) continue;

                const distSq = obj.position.distanceToSquared(playerGroup.position);
                if (distSq > 3600) {
                    continue;
                }

                const effects = obj.userData.effects;
                for (let j = 0; j < effects.length; j++) {
                    const eff = effects[j];
                    if (eff.type === SubEffectType.EMITTER) {
                        if (isBacklogged && !eff.essential) continue;

                        if (!eff.lastEmit) eff.lastEmit = 0;
                        if (simTime - eff.lastEmit > eff.interval) {
                            eff.lastEmit = simTime;
                            if (eff.offset) {
                                _vInteraction.copy(eff.offset);
                                obj.localToWorld(_vInteraction);
                            } else {
                                // Optimization: Avoid getWorldPosition if parent is stationary or matrix is frozen
                                if (obj.matrixAutoUpdate === false) {
                                    _vInteraction.copy(obj.position);
                                } else {
                                    obj.getWorldPosition(_vInteraction);
                                }
                            }

                            if (eff.spread) {
                                _vInteraction.x += (Math.random() - 0.5) * eff.spread;
                                _vInteraction.z += (Math.random() - 0.5) * eff.spread;
                            }

                            callbacks.spawnParticle(_vInteraction.x, _vInteraction.y, _vInteraction.z, eff.particle, eff.count || 1, undefined, undefined, eff.color);
                        }
                    }
                }
            }
        }
        monitor.end('active_effects');

        // 19. Update PerformanceMonitor
        monitor.updateGameState(
            playerGroup.position.x,
            playerGroup.position.z,
            engine.camera.position.x,
            engine.camera.position.y,
            engine.camera.position.z,
            state.enemies.pool.length,
            state.world.obstacles ? state.world.obstacles.length : 0
        );

        // 20. VEGETATION INTERACTION (Optimerad för platta och strikta Array/LOD-kontroller)
        if (!windSystem) windSystem = session.systems.wind;
        if (windSystem && windSystem.enabled) {
            for (let i = 0; i < 8; i++) {
                _bendInteractors[i].w = 0.0;
                _bendDistSq[i] = Infinity;
            }

            const pPos = refs.playerGroupRef.current.position;
            const refMember = refs.activeFamilyMembers.current;
            const vehicle = state.vehicle.mesh;

            let count = 0;

            if (pPos && count < 8) {
                _bendInteractors[count].set(pPos.x, pPos.y, pPos.z, 1.2);
                _bendDistSq[count] = 0;
                count++;
            }

            if (vehicle && count < 8) {
                _bendInteractors[count].set(vehicle.position.x, vehicle.position.y, vehicle.position.z, 2.5);
                _bendDistSq[count] = 0;
                count++;
            }

            if (refMember && Array.isArray(refMember) && count < 8) {
                const fLen = refMember.length;
                for (let i = 0; i < fLen && count < 8; i++) {
                    const m = refMember[i];
                    if (m && m.mesh && m.following) {
                        _bendInteractors[count].set(m.mesh.position.x, m.mesh.position.y, m.mesh.position.z, 1.2);
                        _bendDistSq[count] = 0;
                        count++;
                    }
                }
            }

            const grid = session.systems.worldStreamer;
            if (grid && count < 8 && pPos) {
                const enPool = grid.getEnemyPool();
                const enPoolIdx = enPool.nextIndex();
                grid.getNearbyEnemies(pPos.x, pPos.z, 15, enPoolIdx);

                const nearby = enPool.getPool(enPoolIdx);
                const nLen = enPool.getCount(enPoolIdx);

                for (let i = 0; i < nLen && count < 8; i++) {
                    const e = nearby[i];
                    if (!e || e.deathState !== EnemyDeathState.ALIVE) continue;

                    const dx = e.mesh.position.x - pPos.x;
                    const dz = e.mesh.position.z - pPos.z;
                    const dSq = dx * dx + dz * dz;

                    _bendInteractors[count].set(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z, (e.statusFlags & EnemyFlags.BOSS) !== 0 ? 2.0 : 1.0);
                    _bendDistSq[count] = dSq;
                    count++;
                }
            }

            windSystem.setInteractors(_bendInteractors);
        }

        // --- HUD TELEMETRY SYNC ---
        if (now - lastHudSyncTime >= 66) { // ~15Hz or every 66ms
            lastHudSyncTime = now;
            monitor.begin('hud_sync');
            const hudMesh = refs.playerMeshRef.current;
            const hudData = HudSystem.getHudData(state, playerGroup.position, hudMesh, engine.input.state, now, propsRef.current, state.player.statsBuffer[StatID.TOTAL_DISTANCE_TRAVELED], engine.camera.threeCamera, playerGroup.rotation.y);
            monitor.end('hud_sync');

            hudData.debugInfo.drawCalls = refs.lastDrawCallsRef.current;
            state.metrics.renderCpuTime = engine.renderer.info.render.frame || 0;
            state.metrics.drawCalls = engine.renderer.info.render.calls;
            state.metrics.triangles = engine.renderer.info.render.triangles;

            (hudData as any).debugMode = propsRef.current.gameState.settings.debugMode;
            (hudData as any).systems = session.getSystems();
            (hudData as any).interactionActive = HudStore.getState().interactionActive;

            HudStore.update(hudData);
        }

        // 21. High-frequency HUD update
        HudSystem.emitFastUpdate(state, engine.input.state, simTime, propsRef.current, playerGroup.position, engine.camera.threeCamera);
    };
}
