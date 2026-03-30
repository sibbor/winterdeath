import * as THREE from 'three';
import { DamageNumberSystem } from '../../systems/DamageNumberSystem';
import { WinterEngine } from '../../core/engine/WinterEngine';
import { GameSessionLogic } from './GameSessionLogic';
import { RuntimeState } from '../../core/RuntimeState';
import { PerformanceMonitor } from '../../systems/PerformanceMonitor';
import { HudSystem } from '../../systems/HudSystem';
import { PlayerAnimator } from '../../entities/player/PlayerAnimator';
import { FootprintSystem } from '../../systems/FootprintSystem';
import { FXSystem } from '../../systems/FXSystem';
import { ProjectileSystem } from '../../systems/ProjectileSystem';
import { TriggerHandler } from '../../systems/TriggerHandler';
import { CAMERA_HEIGHT, HEALTH_CRITICAL_THRESHOLD } from '../../content/constants';
import { soundManager } from '../../utils/audio/SoundManager';
import { EnemyManager } from '../../entities/enemies/EnemyManager';
import { WeaponType, WeaponCategoryColors, WEAPONS } from '../../content/weapons';
import { EnemyDeathState } from '../../entities/enemies/EnemyTypes';
import { DamageType } from '../../entities/player/CombatTypes';
import { HudStore } from '../../store/HudStore';
import { NoiseType } from '../../entities/enemies/EnemyTypes';
import { PLAYER_CHARACTER } from '../../content/constants';

interface LoopContext {
    engine: WinterEngine;
    session: GameSessionLogic;
    state: RuntimeState;
    refs: any;
    propsRef: any;
    callbacks: {
        concludeSector: (val: boolean) => void;
        gainXp: (val: number) => void;
        spawnPart: (x: number, y: number, z: number, type: string, count: number, customMesh?: THREE.Mesh, customVel?: THREE.Vector3, color?: number, scale?: number) => void;
        spawnDecal: (x: number, z: number, scale: number, material?: THREE.Material, type?: string) => void;
        showDamageText: (x: number, y: number, z: number, text: string, color?: string) => void;
        t: (k: string) => string;
        spawnBubble: (text: string, duration?: number) => void;
        onAction: (action: any) => void;
        onDiscovery?: (type: string, id: string, titleKey: string, detailsKey: string, payload?: any) => void;
        onDeathStateChange?: (val: boolean) => void;
        gainSp: (amount: number) => void;
    };
}

// ============================================================================
// ZERO-GC GLOBALS
// ============================================================================
const EMPTY_ARRAY: any[] = [];
const EMPTY_OBJECT: any = {};

const _vCamera = new THREE.Vector3();
const _vInteraction = new THREE.Vector3();
const _interactionScreenPosScratch = { x: 0, y: 0 };
const _animStateScratch: any = {};
const _traverseStack: THREE.Object3D[] = []; // Used for Zero-GC scene traversal

// Pre-define ALL properties to lock V8 Hidden Classes (Shapes)
const _fxCallbacks: any = {
    spawnPart: null,
    spawnDecal: null,
    onPlayerHit: null
};

// Pre-define ALL properties to lock V8 Hidden Classes (Shapes)
const _triggerOptionsScratch: any = {
    t: null,
    spawnBubble: null,
    onTrigger: null,
    onAction: null,
    removeVisual: null,
    resolveDynamicPos: null,
    onDiscovery: null,
    playSound: null,
    isFamilyFollowing: null
};

// String cache for damage numbers to prevent GC spikes during rapid fire
const _numberStringCache: Record<number, string> = {};
function getCachedNumberString(num: number): string {
    const rounded = Math.round(num);
    if (!_numberStringCache[rounded]) _numberStringCache[rounded] = rounded.toString();
    return _numberStringCache[rounded];
}

export function createGameLoop(ctx: LoopContext): (dt: number) => void {
    const { engine, session, state, refs, propsRef, callbacks } = ctx;

    let uiSyncTimer = 0;
    let frame = 0;
    let lastTime = performance.now();

    const getActiveCallbacks = () => state.callbacks || callbacks || EMPTY_OBJECT;

    // Initial binding for FX (will be updated in loop if needed)
    _fxCallbacks.spawnPart = callbacks.spawnPart;
    _fxCallbacks.spawnDecal = callbacks.spawnDecal;
    _fxCallbacks.onPlayerHit = (damage: number, attacker: any, type: string, isDoT: boolean, effectType?: any, effectDuration?: number, effectDamage?: number, attackName?: string) => {
        const statsSystem = session.getSystem('player_stats_system') as any;
        if (statsSystem) {
            statsSystem.handlePlayerHit(session, damage, attacker, type, isDoT, effectType, effectDuration, effectDamage, attackName);
        }
    };

    // [VINTERDÖD FIX] Zero-GC Traversal avoiding Three.js .traverse() closures
    _triggerOptionsScratch.removeVisual = (id: string) => {
        const scene = engine.scene;
        let visual: THREE.Object3D | null = null;
        const targetName = `clue_visual_${id}`;

        // 1. Iterativ sökning istället för scene.getObjectByName (Zero-GC)
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

        // 2. Iterativ uppdatering istället för visual.traverse (Zero-GC)
        if (visual) {
            _traverseStack.length = 0;
            _traverseStack.push(visual);

            while (_traverseStack.length > 0) {
                const child = _traverseStack.pop() as any;

                // Använd Three.js snabba boolean-flaggor istället för trög instanceof
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

    // Pre-declare ALL properties to lock V8 memory shape and avoid dynamic property allocations
    const _gameContext: any = {
        scene: null,
        enemies: null,
        obstacles: null,
        collisionGrid: null,
        spawnPart: null,
        spawnDecal: null,
        showDamageText: null,
        now: 0,
        playerPos: null,
        session: null,
        makeNoise: (pos: THREE.Vector3, type: NoiseType, radius: number) => session.makeNoise(pos, type, radius),
        explodeEnemy: (e: any, force: THREE.Vector3) => EnemyManager.explodeEnemy(e, refs.sectorContextRef.current, force),
        trackStats: (type: 'damage' | 'hit', amt: number, isBoss?: boolean) => {
            if (type === 'damage') {
                const damageTracker = session.getSystem('damage_tracker_system') as any;
                if (damageTracker) {
                    damageTracker.recordOutgoingDamage(session, amt, 'Generic', isBoss);
                }
            }
            if (type === 'hit') state.sessionStats.shotsHit += amt;
        },
        addFireZone: (z: any) => state.fireZones.push(z),
        onPlayerHit: (dmg: number, attacker: any, type: DamageType, isDoT: boolean = false, effect?: any, dur?: number, intense?: number, attackName?: string) => {
            if (_fxCallbacks.onPlayerHit) _fxCallbacks.onPlayerHit(dmg, attacker, type, isDoT, effect, dur, intense, attackName);
        },
        applyDamage: (enemy: any, amount: number, type: DamageType | WeaponType | string, isHighImpact: boolean = false) => {
            // VINTERDÖD FIX: Safeguard against non-damaging hits skipping death state check
            if (enemy.deathState !== EnemyDeathState.ALIVE || amount <= 0) return false;


            // --- O(1) ZERO-GC ENEMY DISCOVERY ---
            if (!enemy.discovered) {
                enemy.discovered = true;

                if (!enemy.isBoss && callbacks.onDiscovery) {
                    const sets = state.discoverySets;
                    if (sets && !sets.seenEnemies.has(enemy.type)) {
                        sets.seenEnemies.add(enemy.type);
                        state.sessionStats.seenEnemies.push(enemy.type);
                        callbacks.onDiscovery('enemy', enemy.type, 'ui.enemy_encountered', `enemies.${enemy.type}.name`);
                    }
                }
            }

            // Damage
            const actualDmg = Math.max(0, Math.min(enemy.hp, amount));
            enemy.hp -= actualDmg;
            enemy.lastDamageType = type as string;
            enemy.hitTime = _gameContext.now;
            enemy.lastHitWasHighImpact = isHighImpact;

            // Track stats centrally
            if (actualDmg > 0) {
                const damageTracker = session.getSystem('damage_tracker_system') as any;
                if (damageTracker) {
                    damageTracker.recordOutgoingDamage(session, actualDmg, type as string, enemy.isBoss);
                }
            }

            // Resolve color using the centralized system
            const weaponData = (WEAPONS as any)[type];
            const color = DamageNumberSystem.getColorForType(type as string, isHighImpact);

            // Throttle text spawning for performance (Zero-GC Accumulation)
            const isContinuous = weaponData?.behavior === 'CONTINUOUS' || type === DamageType.BURN || type === 'BURN' || type === DamageType.DROWNING;
            const textThrottle = isContinuous ? 250 : 0;

            enemy._accumulatedDamage = (enemy._accumulatedDamage || 0) + amount;

            if (_gameContext.now - (enemy._lastDamageTextTime || 0) > textThrottle) {
                if (_gameContext.showDamageText && enemy._accumulatedDamage >= 1) {
                    const textX = enemy.mesh.position.x;
                    // --- DYNAMIC HEIGHT FIX ---
                    // 1.8 is the approximate visual top, 1.2 is the float offset
                    const textY = (enemy.originalScale || 1.0) * 1.8 + 1.2;
                    const textZ = enemy.mesh.position.z;

                    _gameContext.showDamageText(
                        textX, textY, textZ,
                        getCachedNumberString(enemy._accumulatedDamage),
                        color
                    );
                    enemy._accumulatedDamage = 0; // Reset accumulation after showing
                    enemy._lastDamageTextTime = _gameContext.now;
                }
            }

            return enemy.hp <= 0;
        },
    };

    state.applyDamage = _gameContext.applyDamage;

    // Hoist dynamic pos resolution to avoid allocating a new function every frame
    _triggerOptionsScratch.resolveDynamicPos = (familyId?: number, ownerId?: string) => {
        if (familyId !== undefined) {
            const members = refs.activeFamilyMembers.current;
            for (let i = 0; i < members.length; i++) {
                if (members[i].id === familyId) {
                    // If the family member is already following the player (Replay), don't move the trigger to them!
                    // Let it stay at the end of the track so we can use it to start the boss fight.
                    if (members[i].following) return null;

                    return members[i].mesh?.position || null;
                }
            }
            return null;
        }

        if (ownerId) {
            const scene = engine.scene;

            // [VINTERDÖD FIX] Zero-GC iterative traversal instead of .getObjectByName
            _traverseStack.length = 0;
            _traverseStack.push(scene);

            while (_traverseStack.length > 0) {
                const node = _traverseStack.pop() as THREE.Object3D;

                if (node.name === ownerId || node.userData.id === ownerId) {
                    _traverseStack.length = 0; // Free refs
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

    let lastHudSyncTime = 0;

    return (dt: number) => {
        if (!refs.isMounted.current || refs.isBuildingSectorRef.current) return;

        // --- VINTERDÖD FIX: Pause & Cinematic Time Logic ---
        let delta = dt;
        if (delta > 0.1) delta = 0.016;

        // Spara den ofrysta tiden för UI, session och miljösystem
        const realDt = delta;

        const isCinematic = state.cinematicActive;
        const isBossIntro = refs.bossIntroRef.current?.active;
        const isHardPaused = propsRef.current.isPaused || propsRef.current.isClueOpen;
        const isInteractionPaused = state.isInteractionOpen && !isCinematic;

        // 1. ESC-Meny eller Clue = TOTAL FRYSNING (Bakåtkompatibelt)
        if (isHardPaused && !isCinematic && !isBossIntro) {
            engine.isSimulationPaused = true;
            engine.isSoftPaused = false;
            return;
        }

        // Släpp den totala frysningen om vi inte är i en meny
        engine.isSimulationPaused = false;

        // 2. Cinematic = SOFT PAUSE (Fiender/Fysik stannar, Miljö lever)
        if (isCinematic || isBossIntro) {
            delta = 0; // Skickas till alla lokala spelsystem (fiender, projektiler)
            engine.isSoftPaused = true;
        } else {
            engine.isSoftPaused = false;
        }

        // --- VINTERDÖD FIX: Simulation Clock (Milliseconds) ---
        state.accumulatedTime += delta * 1000;
        const simTime = state.accumulatedTime;

        const now = performance.now();

        // Death Trigger Bridge
        if (state.isDead && (refs.deathPhaseRef.current === 'NONE' || !refs.deathPhaseRef.current)) {
            refs.deathPhaseRef.current = 'DEAD';
            callbacks.onDeathStateChange?.(true);
        }

        const monitor = PerformanceMonitor.getInstance();
        frame++;

        if (isInteractionPaused) {
            refs.lastDrawCallsRef.current = engine.renderer.info.render.calls;
            engine.isRenderingPaused = true;
            lastTime = now;
            return;
        } else {
            engine.isRenderingPaused = false;
        }

        const playerGroup = refs.playerGroupRef.current;
        if (!playerGroup || playerGroup.children.length === 0) return;

        // 2. UI Throttling
        refs.lastDrawCallsRef.current = engine.renderer.info.render.calls;
        state.framesSinceHudUpdate++;
        uiSyncTimer += realDt;

        if (now - lastHudSyncTime >= 66) { // ~15 FPS
            lastHudSyncTime = now;
            state.framesSinceHudUpdate = 0;

            if (!playerGroup || playerGroup.children.length === 0) {
                if (now % 5000 < 16) console.error("[GameSessionLoop] ERROR: playerGroup missing or empty!");
                return; if (!propsRef.current.isRunning || (propsRef.current.isPaused && !isCinematic && !isBossIntro)) {
                    soundManager.stopRadioStatic();
                    lastTime = now;
                    return;
                }
            }

            const hudMesh = refs.playerMeshRef.current;
            monitor.begin('hud_sync');
            const hudData = HudSystem.getHudData(state, playerGroup.position, hudMesh, engine.input.state, now, propsRef.current, refs.distanceTraveledRef.current, engine.camera.threeCamera);
            monitor.end('hud_sync');

            hudData.debugInfo.drawCalls = refs.lastDrawCallsRef.current;

            // Expose performance metrics implicitly onto state struct
            state.renderCpuTime = engine.renderer.info.render.frame || 0;
            state.drawCalls = engine.renderer.info.render.calls;
            state.triangles = engine.renderer.info.render.triangles;

            // Append data directly to avoid Object Spread allocation
            (hudData as any).debugMode = propsRef.current.debugMode;
            (hudData as any).systems = session.getSystems();

            // Always copy interactionPrompt from the store into the freshly swapped buffer.
            (hudData as any).interactionPrompt = HudStore.getState().interactionPrompt;

            HudStore.update(hudData);
        }

        // 3. Boss Intro overrides
        if (isBossIntro && refs.bossIntroRef.current.bossMesh) {
            const bossMesh = refs.bossIntroRef.current.bossMesh;
            const bossPos = bossMesh.position;
            const introTime = now - refs.bossIntroRef.current.startTime;

            _vCamera.set(bossPos.x, 12, bossPos.z + 20);
            engine.camera.setPosition(_vCamera);
            _vInteraction.set(bossPos.x, bossPos.y + 3, bossPos.z);
            engine.camera.lookAt(_vInteraction);

            if (frame % 5 === 0 && introTime < 3000) {
                bossMesh.rotation.y += (Math.random() - 0.5) * 0.2;
                bossMesh.scale.setScalar(3.0 + Math.sin(now * 0.02) * 0.1);
            }
            if (refs.playerMeshRef.current) {
                _animStateScratch.isMoving = false;
                _animStateScratch.isRushing = false;
                // VINTERDÖD FIX: Använd realDt för animationer under Boss Intro
                PlayerAnimator.update(refs.playerMeshRef.current, _animStateScratch, now, realDt);
            }
            refs.lastDrawCallsRef.current = engine.renderer.info.render.calls;
            lastTime = now;
            return;
        }

        // 4. Throttled logic (Health warnings, burning effects)
        if (frame % 5 === 0) {
            if (state.hp < state.maxHp * HEALTH_CRITICAL_THRESHOLD && !state.isDead) {
                if (now - ((state as any).lastHeartbeat || 0) > 800) {
                    (state as any).lastHeartbeat = now;
                    soundManager.playHeartbeat();
                }
            }

            monitor.begin('burning_effects');
            const burningObjects = refs.sectorContextRef.current?.burningObjects || EMPTY_ARRAY;
            for (let i = 0; i < burningObjects.length; i++) {
                const mesh = burningObjects[i];
                if (!mesh.visible || !mesh.userData.effects) continue;

                // --- DISTANCE CULLING ---
                const distSq = mesh.position.distanceToSquared(playerGroup.position);
                if (distSq > 3600) { // 60 units radius
                    continue;
                }

                const effs = mesh.userData.effects;
                const cos = Math.cos(mesh.rotation.y);
                const sin = Math.sin(mesh.rotation.y);

                for (let j = 0; j < effs.length; j++) {
                    const eff = effs[j];
                    if (eff.type === 'emitter' && Math.random() < 0.8) {
                        let count = eff.particle === 'flame' ? 2 : (eff.count || 1);
                        if (eff.area && (eff.area.x * eff.area.z > 50)) count = Math.max(count, 3);

                        for (let k = 0; k < count; k++) {
                            _vInteraction.copy(mesh.position);
                            if (eff.offset) _vInteraction.add(eff.offset);

                            if (eff.area) {
                                const lx = (Math.random() - 0.5) * eff.area.x;
                                const lz = (Math.random() - 0.5) * eff.area.z;
                                _vInteraction.x += lx * cos + lz * sin;
                                _vInteraction.z += -lx * sin + lz * cos;
                            } else {
                                _vInteraction.x += (Math.random() - 0.5) * (eff.spread || 0.4);
                                _vInteraction.z += (Math.random() - 0.5) * (eff.spread || 0.4);
                            }

                            callbacks.spawnPart(_vInteraction.x, _vInteraction.y, _vInteraction.z, eff.particle, 1, undefined, undefined, eff.color);
                        }
                    }
                }
            }
            monitor.end('burning_effects');
        }

        // 5. Sector Flow (Boss Defeated, End Sector)
        if (state.bossDefeatedTime > 0) {
            if (now - state.bossDefeatedTime < 10000) {
                state.invulnerableUntil = now + 10000;
                if (now - state.bossDefeatedTime > 4000) {
                    callbacks.concludeSector(state.familyFound);
                    return;
                }
            } else {
                state.bossDefeatedTime = 0;
            }
        }

        if (propsRef.current.triggerEndSector) {
            callbacks.concludeSector(false);
            return;
        }

        if (!propsRef.current.isRunning || (propsRef.current.isPaused && !isCinematic && !isBossIntro)) {
            soundManager.stopRadioStatic();
            lastTime = now;
            return;
        }

        // 6. Teleport Logic
        if (!isCinematic && !isBossIntro) {
            if (propsRef.current.teleportTarget && propsRef.current.teleportTarget.timestamp > refs.lastTeleportRef.current) {
                const tgt = propsRef.current.teleportTarget;

                if (state.activeVehicle) {
                    state.activeVehicle = null;
                    state.activeVehicleType = null;
                    state.vehicleSpeed = 0;
                    (state as any).vehicleThrottle = 0;
                }

                playerGroup.position.set(tgt.x, 0, tgt.z);
                callbacks.spawnPart(tgt.x, 1, tgt.z, 'flash', 1, undefined, undefined, undefined, 2);
                soundManager.playTone(800, 'sine', 0.6, 0.1);

                for (let i = 0; i < refs.activeFamilyMembers.current.length; i++) {
                    const fm = refs.activeFamilyMembers.current[i];
                    if (fm.mesh && fm.following) {
                        const offX = (Math.random() - 0.5) * 3;
                        const offZ = (Math.random() - 0.5) * 3;
                        fm.mesh.position.set(tgt.x + offX, 0, tgt.z + offZ);
                        callbacks.spawnPart(tgt.x + offX, 1, tgt.z + offZ, 'smoke', 10);
                    }
                }

                refs.lastTeleportRef.current = tgt.timestamp;
                engine.camera.setPosition(tgt.x, 50, tgt.z + (propsRef.current.currentSectorData?.environment.cameraOffsetZ || 0), true);
                engine.camera.lookAt(playerGroup.position, true);
                refs.prevPosRef.current.copy(playerGroup.position);
            }
        }

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
            session.playerPos = playerGroup.position;
        }

        // --- VINTERDÖD FIX: Session update ALWAYS gets realDt.
        // This ensures triggers, state machines, and end-of-dialogue logic
        // process correctly, even when enemies/physics are frozen (delta = 0).
        session.update(realDt, propsRef.current.mapId || 0);
        monitor.end('session_update');

        // 8. Standard Gameplay State Updates
        if (!isCinematic && !isBossIntro) {
            const isMoving = state.isMoving;
            if (refs.hasSetPrevPosRef.current && playerGroup) {
                refs.distanceTraveledRef.current += playerGroup.position.distanceTo(refs.prevPosRef.current);
            }

            if (playerGroup) {
                refs.prevPosRef.current.copy(playerGroup.position);
                refs.hasSetPrevPosRef.current = true;
            }

            if (refs.playerMeshRef.current) {
                const safeStamina = state.stamina ?? 100;
                const safeMaxStamina = state.maxStamina ?? 100;
                _animStateScratch.staminaRatio = safeStamina / safeMaxStamina;
                _animStateScratch.isMoving = isMoving;
                _animStateScratch.isRushing = state.isRushing;
                _animStateScratch.isRolling = state.isRolling;
                _animStateScratch.rollStartTime = state.rollStartTime;
                _animStateScratch.isSpeaking = state.speakBounce > 0 || now < state.speakingUntil;
                _animStateScratch.isThinking = now < state.thinkingUntil;
                _animStateScratch.isIdleLong = (now - state.lastActionTime > 20000);
                _animStateScratch.isWading = state.isWading;
                _animStateScratch.isSwimming = state.isSwimming;
                _animStateScratch.isDead = state.isDead;
                _animStateScratch.deathStartTime = state.deathStartTime;
                _animStateScratch.seed = 0;

                monitor.begin('player_animation');
                // VINTERDÖD FIX: Player animation uses realDt during cinematics to breathe/talk!
                PlayerAnimator.update(refs.playerMeshRef.current, _animStateScratch, now, engine.isSoftPaused ? realDt : delta);
                monitor.end('player_animation');
            }
        }

        // 9. Secondary Systems
        monitor.begin('footprints');
        // VINTERDÖD FIX: Fotspår raderas långsamt i realtid även om spelet är fryst
        FootprintSystem.update(realDt);
        monitor.end('footprints');

        // 10. FX System
        monitor.begin('fx');
        try {
            // VINTERDÖD FIX: Använd realDt! Då fortsätter bränder, rök och snöstorm!
            FXSystem.update(engine.scene, state.particles, state.bloodDecals, realDt, frame, now, _fxCallbacks);
        } catch (e) {
            console.error("[GameSessionLoop] FXSystem.update failed:", e);
        }
        monitor.end('fx');

        // 11. Camera Processing
        if (!isCinematic && !isBossIntro) {
            if (refs.cameraOverrideRef.current && refs.cameraOverrideRef.current.active) {
                const override = refs.cameraOverrideRef.current;

                // --- VINTERDÖD FIX: The Epic Drone Camera ---
                if (!override.startPos) {
                    override.startPos = engine.camera.position.clone();
                    override.startTime = now;
                    // Tvinga exakt 4000ms visningstid
                    override.endTime = now + 4000;
                    // Göm UI (crosshair, hp, etc) under flygningen för en cinematisk look
                    engine.camera.setCinematic(true);
                }

                if (now > override.endTime) {
                    refs.cameraOverrideRef.current = null;
                    engine.camera.setCinematic(false);
                } else {
                    const elapsed = now - override.startTime;

                    // Flyg i 1500ms, hovra kvar resten av tiden!
                    let t = Math.min(1.0, elapsed / 1500);
                    t = 1.0 - Math.pow(1.0 - t, 3); // Ease-out inbromsning

                    // Drönar-Bågen: Lägg till höjd (y) i mitten av flygningen för ett top-down svep
                    const heightArc = Math.sin(t * Math.PI) * 20;

                    const currentX = THREE.MathUtils.lerp(override.startPos.x, override.targetPos.x, t);
                    const currentY = THREE.MathUtils.lerp(override.startPos.y, override.targetPos.y, t) + heightArc;
                    const currentZ = THREE.MathUtils.lerp(override.startPos.z, override.targetPos.z, t);

                    _vCamera.set(currentX, currentY, currentZ);
                    engine.camera.setPosition(_vCamera, true);
                    engine.camera.lookAt(override.lookAtPos, true);
                }
            } else {
                if (state.hurtShake > 0) {
                    engine.camera.shake(state.hurtShake, 'hurt');
                    state.hurtShake = Math.max(0, state.hurtShake - 2.0 * delta);
                }
                if (state.cameraShake > 0) {
                    engine.camera.shake(state.cameraShake, 'general');
                    state.cameraShake = Math.max(0, state.cameraShake - 5.0 * delta);
                }

                const envCameraZ = propsRef.current.currentSectorData?.environment.cameraOffsetZ || 25;
                const envCameraY = propsRef.current.currentSectorData?.environment.cameraHeight || CAMERA_HEIGHT;
                engine.camera.setCinematic(false);
                engine.camera.follow(playerGroup.position, envCameraZ, envCameraY);
            }
        } else {
            engine.camera.setCinematic(true);
        }

        // 12. TRACKING SHADOW CAMERA
        if (refs.skyLightRef?.current && refs.skyLightOffsetRef?.current && playerGroup) {
            let shadowTarget = playerGroup.position;

            if (refs.cameraOverrideRef.current && refs.cameraOverrideRef.current.active) {
                shadowTarget = refs.cameraOverrideRef.current.lookAtPos;
            }

            refs.skyLightRef.current.target.position.copy(shadowTarget);
            refs.skyLightRef.current.position.copy(shadowTarget).add(refs.skyLightOffsetRef.current);
            refs.skyLightRef.current.target.updateMatrixWorld();
        }

        refs.lastDrawCallsRef.current = engine.renderer.info.render.calls;
        lastTime = now;

        // 13. Interaction Logic
        const currentInter = state.interactionType;
        const currentLabel = state.interactionLabel;
        const lastType = refs.interactionTypeRef.current;

        if (currentInter && state.hasInteractionTarget && state.interactionTargetPos) {
            _vInteraction.copy(state.interactionTargetPos);
            _vInteraction.y += 1.5;

            const vector = _vInteraction.project(engine.camera.threeCamera);

            if (vector.z >= -1.0 && vector.z <= 1.05) {
                const screenX = Math.round((vector.x + 1) / 2 * engine.screenWidth);
                const screenY = Math.round((1 - vector.y) / 2 * engine.screenHeight);

                const lastPos = refs.lastInteractionPosRef.current;

                // VINTERDÖD FIX: More solid fast-check before writing object properties
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

                    // ZERO-GC: Mutate the prompt inside the HudStore buffer instead of allocating new objects
                    if (!hData.interactionPrompt) {
                        hData.interactionPrompt = {
                            type: currentInter as any,
                            label: currentLabel,
                            pos: { x: screenX, y: screenY }
                        };
                    } else {
                        hData.interactionPrompt.type = currentInter as any;
                        hData.interactionPrompt.label = currentLabel;
                        hData.interactionPrompt.pos.x = screenX;
                        hData.interactionPrompt.pos.y = screenY;
                    }

                    HudStore.update(hData);
                }
            } else {
                if (refs.interactionTypeRef.current !== null) {
                    refs.interactionTypeRef.current = null;
                    const hData = HudStore.getState();
                    hData.interactionPrompt = null;
                    HudStore.update(hData);
                }
            }
        } else {
            if (refs.interactionTypeRef.current !== null) {
                refs.interactionTypeRef.current = null;
                refs.lastInteractionPosRef.current = null;
                (state as any).lastInteractionLabel = null;

                const hData = HudStore.getState();
                hData.interactionPrompt = null;
                HudStore.update(hData);
            }
        }

        // 14. Game Context
        const activeCallbacks = getActiveCallbacks();

        _gameContext.scene = engine.scene;
        _gameContext.enemies = state.enemies;
        _gameContext.obstacles = state.obstacles;
        _gameContext.collisionGrid = state.collisionGrid;
        _gameContext.spawnPart = activeCallbacks.spawnPart || callbacks.spawnPart;
        _gameContext.spawnDecal = activeCallbacks.spawnDecal || callbacks.spawnDecal;
        _gameContext.showDamageText = activeCallbacks.showDamageText || callbacks.showDamageText;

        if (activeCallbacks.explodeEnemy) _gameContext.explodeEnemy = activeCallbacks.explodeEnemy;
        if (activeCallbacks.trackStats) _gameContext.trackStats = activeCallbacks.trackStats;
        if (activeCallbacks.addFireZone) _gameContext.addFireZone = activeCallbacks.addFireZone;

        _gameContext.now = simTime;
        _gameContext.playerPos = playerGroup.position;
        _gameContext.session = session;

        refs.gameContextRef.current = _gameContext;

        // 15. ProjectileSystem
        monitor.begin('projectiles');
        ProjectileSystem.update(delta, simTime, _gameContext, state.projectiles, state.fireZones);
        monitor.end('projectiles');

        // 16. TriggerSystem
        monitor.begin('triggers');
        _triggerOptionsScratch.t = activeCallbacks.t || callbacks.t;
        _triggerOptionsScratch.spawnBubble = activeCallbacks.spawnBubble;
        _triggerOptionsScratch.onTrigger = activeCallbacks.onTrigger;
        _triggerOptionsScratch.onAction = activeCallbacks.onAction;
        _triggerOptionsScratch.onDiscovery = activeCallbacks.onDiscovery || callbacks.onDiscovery;
        _triggerOptionsScratch.playSound = (id: string) => {
            if (id === 'voice') soundManager.playVoice(PLAYER_CHARACTER.name);
            else soundManager.playUiHover();
        };
        _triggerOptionsScratch.isFamilyFollowing = (familyId: number) => {
            const members = refs.activeFamilyMembers.current;
            if (!members) return false;
            for (let i = 0; i < members.length; i++) {
                if (members[i].id === familyId && members[i].following) return true;
            }
            return false;
        };

        TriggerHandler.checkTriggers(playerGroup.position, state, now, _triggerOptionsScratch as any);
        monitor.end('triggers');

        // 16. Emitters Update
        monitor.begin('active_effects');
        if (state.activeEffects) {
            const isBacklogged = (FXSystem as any).ambientQueue && (FXSystem as any).ambientQueue.length > 1000;

            for (let i = 0; i < state.activeEffects.length; i++) {
                const obj = state.activeEffects[i];
                if (!obj.visible || !obj.userData.effects) continue;

                const distSq = obj.position.distanceToSquared(playerGroup.position);
                if (distSq > 3600) {
                    continue;
                }

                const effects = obj.userData.effects;
                for (let j = 0; j < effects.length; j++) {
                    const eff = effects[j];
                    if (eff.type === 'emitter') {
                        if (isBacklogged && !eff.essential) continue;

                        if (!eff.lastEmit) eff.lastEmit = 0;
                        if (now - eff.lastEmit > eff.interval) {
                            eff.lastEmit = now;
                            if (eff.offset) {
                                _vInteraction.copy(eff.offset);
                                obj.localToWorld(_vInteraction);
                            } else {
                                obj.getWorldPosition(_vInteraction);
                            }

                            if (eff.spread) {
                                _vInteraction.x += (Math.random() - 0.5) * eff.spread;
                                _vInteraction.z += (Math.random() - 0.5) * eff.spread;
                            }

                            callbacks.spawnPart(_vInteraction.x, _vInteraction.y, _vInteraction.z, eff.particle, eff.count || 1, undefined, undefined, eff.color);
                        }
                    }
                }
            }
        }
        monitor.end('active_effects');

        // 17. Update PerformanceMonitor
        monitor.updateGameState(
            playerGroup.position.x,
            playerGroup.position.z,
            engine.camera.position.x,
            engine.camera.position.y,
            engine.camera.position.z,
            state.enemies.length,
            state.obstacles ? state.obstacles.length : 0
        );

        // 18. High-frequency HUD update (Zero-GC, bypasses React)
        HudSystem.emitFastUpdate(state, engine.input.state, simTime);
    };
}