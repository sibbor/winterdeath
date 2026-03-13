import * as THREE from 'three';
import { WinterEngine } from '../../../core/engine/WinterEngine';
import { GameSessionLogic } from '../../../core/GameSessionLogic';
import { RuntimeState } from '../../../core/RuntimeState';
import { PerformanceMonitor } from '../../../core/systems/PerformanceMonitor';
import { HudSystem } from '../../../core/systems/HudSystem';
import { PlayerAnimation } from '../../../core/animation/PlayerAnimation';
import { FootprintSystem } from '../../../core/systems/FootprintSystem';
import { FXSystem } from '../../../core/systems/FXSystem';
import { ProjectileSystem } from '../../../core/weapons/ProjectileSystem';
import { TriggerHandler } from '../../../core/systems/TriggerHandler';
import { CAMERA_HEIGHT } from '../../../content/constants';
import { soundManager } from '../../../utils/SoundManager';
import { EnemyManager } from '../../../core/EnemyManager';
import { WeaponType } from '../../../content/weapons';
import { EnemyDeathState } from '../../../types/enemy';
import { DamageType, PlayerDeathState } from '../../../types/combat';

interface LoopContext {
    engine: WinterEngine;
    session: GameSessionLogic;
    state: RuntimeState;
    refs: any; // GameSessionState refs
    propsRef: any;
    callbacks: {
        setInteractionType: (val: any) => void;
        setInteractionScreenPos: (val: any) => void;
        concludeSector: (val: boolean) => void;
        gainXp: (val: number) => void;
        spawnPart: (x: number, y: number, z: number, type: string, count: number, customMesh?: THREE.Mesh, customVel?: THREE.Vector3, color?: number, scale?: number) => void;
        spawnDecal: (x: number, z: number, scale: number, material?: THREE.Material, type?: string) => void;
        spawnFloatingText: (x: number, y: number, z: number, text: string, color?: string) => void;
        t: (k: string) => string;
    };
}

// Zero-GC Pre-allocations for the loop
const _vLightOffset = new THREE.Vector3();
const _vCamera = new THREE.Vector3();
const _vInteraction = new THREE.Vector3();
const _interactionScreenPosScratch = { x: 0, y: 0 };
const _animStateScratch: any = {};
const _fxCallbacks: any = {};
const _triggerOptionsScratch: any = {};

// String cache for damage numbers to prevent GC spikes during rapid fire (Flamethrower/Arc-Cannon)
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

    const getActiveCallbacks = () => state.callbacks || callbacks || {};

    // Initial binding for FX (will be updated in loop if needed)
    _fxCallbacks.spawnPart = callbacks.spawnPart;
    _fxCallbacks.spawnDecal = callbacks.spawnDecal;
    _fxCallbacks.onPlayerHit = (dmg: number, attacker: any, type: DamageType) => {
        const statsSystem = session.getSystem('player_stats_system') as any;
        if (statsSystem) {
            statsSystem.handlePlayerHit(session, dmg, attacker, type);
        }
    };

    _triggerOptionsScratch.removeVisual = (id: string) => {
        const scene = engine.scene;
        const visual = scene.getObjectByName(`clue_visual_${id}`) || scene.children.find(o => o.userData.id === id && o.userData.type === 'clue_visual');
        if (visual) {
            visual.traverse((child) => {
                if (child instanceof THREE.PointLight || child instanceof THREE.SpotLight || child instanceof THREE.DirectionalLight) {
                    child.intensity = 0;
                } else if (child instanceof THREE.Mesh) {
                    child.visible = false;
                }
            });
        }
    };

    // Allocate the GameContext once to achieve true Zero-GC. 
    // We update its properties dynamically inside the loop instead of creating a new object `{}` every frame.
    const _gameContext: any = {
        explodeEnemy: (e: any, force: THREE.Vector3) => EnemyManager.explodeEnemy(e, refs.sectorContextRef.current, force),
        trackStats: (type: 'damage' | 'hit', amt: number, isBoss?: boolean) => {
            if (type === 'damage') { state.damageDealt += amt; if (isBoss) state.bossDamageDealt += amt; callbacks.gainXp(Math.ceil(amt)); }
            if (type === 'hit') state.shotsHit += amt;
        },
        addFireZone: (z: any) => state.fireZones.push(z),
        onPlayerHit: (dmg: number, attacker: any, type: DamageType) => {
            if (_fxCallbacks.onPlayerHit) _fxCallbacks.onPlayerHit(dmg, attacker, type);
        },
        applyDamage: (enemy: any, amount: number, type: DamageType | WeaponType, isHighImpact: boolean = false) => {
            if (enemy.deathState !== EnemyDeathState.ALIVE) return false;

            const actualDmg = Math.max(0, Math.min(enemy.hp, amount));
            enemy.hp -= actualDmg;
            enemy.lastDamageType = type;
            enemy.hitTime = _gameContext.now;
            enemy.lastHitWasHighImpact = isHighImpact;

            // Track stats & XP centrally
            if (actualDmg > 0) {
                state.damageDealt += actualDmg;
                if (enemy.isBoss) state.bossDamageDealt += actualDmg;
                callbacks.gainXp(Math.ceil(actualDmg));
            }

            // Throttle text spawning for continuous weapons to save performance
            let isContinuous = false;
            let color = '#ffffff';

            if (isHighImpact) {
                color = '#ff0000';
            } else if (type === WeaponType.FLAMETHROWER || type === WeaponType.MOLOTOV || type === DamageType.BURN) {
                isContinuous = true;
                color = '#ffaa00'; // Orange
            } else if (type === WeaponType.ARC_CANNON) {
                isContinuous = true;
                color = '#00ffff'; // Cyan
            } else if (type === WeaponType.MINIGUN) {
                // If Minigun shoots extremely fast, you can set isContinuous = true here as well
                color = '#cccccc'; // Gray
            }

            // 1. Räkna ut throttle EFTER att isContinuous har satts
            const textThrottle = isContinuous ? 250 : 0;

            // 2. Samla upp skadan i bakgrunden (Zero-GC)
            enemy._accumulatedDamage = (enemy._accumulatedDamage || 0) + amount;

            if (_gameContext.now - (enemy._lastDamageTextTime || 0) > textThrottle) {
                if (_gameContext.spawnFloatingText) {
                    _gameContext.spawnFloatingText(enemy.mesh.position.x, enemy.isBoss ? 4.0 : 2.5, enemy.mesh.position.z, getCachedNumberString(amount), color);
                }
                enemy._lastDamageTextTime = _gameContext.now;
            }

            return enemy.hp <= 0;
        },
    };

    state.applyDamage = _gameContext.applyDamage;


    return (dt: number) => {
        if (!refs.isMounted.current || refs.isBuildingSectorRef.current) return;

        // --- Delta-Time Spike Guard ---
        let delta = dt;
        if (delta > 0.1) delta = 0.016; // Prevent physics explosions after alt-tab

        // Added propsRef.current.isClueOpen so the game loop pauses when a collectible is read
        if (propsRef.current.isPaused || propsRef.current.isClueOpen) {
            engine.isSimulationPaused = true;
            engine.isRenderingPaused = true;
            return;
        } else {
            engine.isSimulationPaused = false;
        }

        const now = performance.now();
        const input = engine.input.state;
        const monitor = PerformanceMonitor.getInstance();
        frame++;

        // 1. Sky Light Shadow Tracking
        if (refs.skyLightRef.current && refs.playerGroupRef.current) {
            const sky = refs.skyLightRef.current;
            const pPos = refs.playerGroupRef.current.position;
            _vLightOffset.set(80, 50, 50);
            sky.position.copy(pPos).add(_vLightOffset);
            sky.target.position.copy(pPos);
            sky.target.updateMatrixWorld();
        }

        // 2. Interaction Input
        if (input.e && !refs.prevInputRef.current) {
            if ((state as any).currentInteraction && (state as any).currentInteraction.action) {
                (state as any).currentInteraction.action();
            }
        }
        refs.prevInputRef.current = input.e;

        const isCinematic = refs.cinematicRef.current.active;
        const isBossIntro = refs.bossIntroRef.current.active;
        const isInteractionPaused = state.isInteractionOpen && !isCinematic;

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

        // 3. UI Throttling (Zero-GC Update to React props)
        refs.lastDrawCallsRef.current = engine.renderer.info.render.calls;
        state.framesSinceHudUpdate++;
        uiSyncTimer += delta;

        if (uiSyncTimer >= 0.066) { // ~15 FPS
            uiSyncTimer = 0;
            state.lastHudUpdate = now;

            const hudMesh = refs.familyMemberRef.current?.mesh || null;

            const hudData = HudSystem.getHudData(state, playerGroup.position, hudMesh, engine.input.state, now, propsRef.current, refs.distanceTraveledRef.current, engine.camera.threeCamera);
            hudData.debugInfo.drawCalls = refs.lastDrawCallsRef.current;

            // Expose performance metrics implicitly onto state struct (updated by renderer)
            state.renderCpuTime = engine.renderer.info.render.frame || 0;
            state.drawCalls = engine.renderer.info.render.calls;
            state.triangles = engine.renderer.info.render.triangles;

            if (propsRef.current.onUpdateHUD) {
                propsRef.current.onUpdateHUD({
                    ...hudData,
                    debugMode: propsRef.current.debugMode,
                    systems: session.getSystems()
                });
            }
        }

        // 4. Boss Intro overrides
        if (isBossIntro && refs.bossIntroRef.current.bossMesh) {
            const bossMesh = refs.bossIntroRef.current.bossMesh;
            const bossPos = bossMesh.position;
            const introTime = now - refs.bossIntroRef.current.startTime;

            _vCamera.set(bossPos.x, 12, bossPos.z + 20);
            engine.camera.setPosition(_vCamera.x, _vCamera.y, _vCamera.z);
            engine.camera.lookAt(bossPos.x, bossPos.y + 3, bossPos.z);

            if (frame % 5 === 0 && introTime < 3000) {
                bossMesh.rotation.y += (Math.random() - 0.5) * 0.2;
                bossMesh.scale.setScalar(3.0 + Math.sin(now * 0.02) * 0.1);
            }
            if (refs.playerMeshRef.current) {
                _animStateScratch.isMoving = false;
                _animStateScratch.isRushing = false;
                // Zero out rest to avoid closure recreation
                PlayerAnimation.update(refs.playerMeshRef.current, _animStateScratch, now, delta);
            }
            refs.lastDrawCallsRef.current = engine.renderer.info.render.calls;
            lastTime = now;
            return;
        }

        // 5. Throttled logic (Health warnings, burning effects)
        if (frame % 5 === 0) {
            if (state.hp < state.maxHp * 0.3 && !state.isDead) {
                if (now - ((state as any).lastHeartbeat || 0) > 800) {
                    (state as any).lastHeartbeat = now;
                    soundManager.playHeartbeat();
                }
            }

            monitor.begin('burning_effects');
            const burningObjects = refs.sectorContextRef.current?.burningObjects || [];
            for (let i = 0; i < burningObjects.length; i++) {
                const mesh = burningObjects[i];
                if (!mesh.userData.effects) continue;
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

        // 6. Sector Flow (Boss Defeated, End Sector)
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

        if (!propsRef.current.isRunning || propsRef.current.isPaused) {
            soundManager.stopRadioStatic();
            lastTime = now;
            return;
        }

        // 7. Teleport Logic
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
                engine.camera.lookAt(playerGroup.position.x, playerGroup.position.y, playerGroup.position.z, true);
                refs.prevPosRef.current.copy(playerGroup.position);
            }
        }

        // 8. Session updates
        if (isCinematic || isBossIntro) {
            session.inputDisabled = true;
        } else {
            session.inputDisabled = !!propsRef.current.disableInput || (!!refs.cameraOverrideRef.current?.active);
        }

        session.isMobile = !!propsRef.current.isMobileDevice;
        session.debugMode = propsRef.current.debugMode;
        session.cameraAngle = engine.camera.angle;

        monitor.begin('session_update');
        session.update(delta, propsRef.current.mapId || 0);
        monitor.end('session_update');

        // 9. Standard Gameplay State Updates
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
                // Safe stamina calculation to prevent invisible player (NaN scaling)
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
                PlayerAnimation.update(refs.playerMeshRef.current, _animStateScratch, now, delta);
                monitor.end('player_animation');
            }
        }

        // 10. Secondary Systems
        monitor.begin('footprints');
        FootprintSystem.update(delta);
        monitor.end('footprints');

        if (playerGroup) {
            monitor.begin('fx');
            FXSystem.update(engine.scene, state.particles, state.bloodDecals, delta, frame, now, playerGroup.position, _fxCallbacks);
            monitor.end('fx');
        }

        // 11. Camera Processing
        if (!isCinematic && !isBossIntro) {
            if (refs.cameraOverrideRef.current && refs.cameraOverrideRef.current.active) {
                const override = refs.cameraOverrideRef.current;
                if (now > override.endTime) {
                    refs.cameraOverrideRef.current = null;
                    engine.camera.setCinematic(false);
                } else {
                    _vCamera.copy(engine.camera.position).lerp(override.targetPos, 1.0 - Math.exp(-10.0 * delta));
                    engine.camera.setPosition(_vCamera.x, _vCamera.y, _vCamera.z, true);
                    engine.camera.lookAt(override.lookAtPos.x, override.lookAtPos.y, override.lookAtPos.z, true);
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

                // Default camera Z-offset changed from 0 to 25 to prevent Gimbal Lock on sector load
                const envCameraZ = propsRef.current.currentSectorData?.environment.cameraOffsetZ || 25;
                const envCameraY = propsRef.current.currentSectorData?.environment.cameraHeight || CAMERA_HEIGHT;
                engine.camera.setCinematic(false);
                engine.camera.follow(playerGroup.position, envCameraZ, envCameraY);
            }
        } else {
            engine.camera.setCinematic(true);
        }

        refs.lastDrawCallsRef.current = engine.renderer.info.render.calls;
        lastTime = now;

        // 12. Interaction Screen Pos
        const currentInter = state.interactionType;
        if (currentInter !== refs.interactionTypeRef.current) {
            refs.interactionTypeRef.current = currentInter;
            callbacks.setInteractionType(currentInter);
        }

        if (currentInter && (state as any).currentInteraction) {
            if ((state as any).currentInteraction.position) {
                _vInteraction.copy((state as any).currentInteraction.position);
                _vInteraction.y += 1.5;
            } else {
                _vInteraction.copy(playerGroup.position);
                _vInteraction.y += 2.5;
            }

            const vector = _vInteraction.project(engine.camera.threeCamera);
            const screenX = Math.round((vector.x + 1) / 2 * 100);
            const screenY = Math.round((1 - vector.y) / 2 * 100);

            const lastPos = refs.lastInteractionPosRef.current;
            if (!lastPos || Math.abs(lastPos.x - screenX) > 0.5 || Math.abs(lastPos.y - screenY) > 0.5) {
                _interactionScreenPosScratch.x = screenX;
                _interactionScreenPosScratch.y = screenY;
                refs.lastInteractionPosRef.current = _interactionScreenPosScratch;
                callbacks.setInteractionScreenPos({ x: screenX, y: screenY });
            }
        } else {
            if (refs.lastInteractionPosRef.current !== null) {
                refs.lastInteractionPosRef.current = null;
                callbacks.setInteractionScreenPos(null);
            }
        }

        const activeCallbacks = getActiveCallbacks() as any;

        // 13. Game Context (Zero-GC property updates instead of Object reassignment)
        _gameContext.scene = engine.scene;
        _gameContext.enemies = state.enemies;
        _gameContext.obstacles = state.obstacles;
        _gameContext.collisionGrid = state.collisionGrid;

        _gameContext.spawnPart = activeCallbacks.spawnPart || callbacks.spawnPart;
        _gameContext.spawnDecal = activeCallbacks.spawnDecal || callbacks.spawnDecal;
        _gameContext.spawnFloatingText = activeCallbacks.spawnFloatingText || callbacks.spawnFloatingText;

        // Only assign these if they are explicitly overridden (otherwise keep default)
        if (activeCallbacks.explodeEnemy) _gameContext.explodeEnemy = activeCallbacks.explodeEnemy;
        if (activeCallbacks.trackStats) _gameContext.trackStats = activeCallbacks.trackStats;
        if (activeCallbacks.addFireZone) _gameContext.addFireZone = activeCallbacks.addFireZone;

        _gameContext.now = now;
        _gameContext.playerPos = playerGroup.position;

        refs.gameContextRef.current = _gameContext;

        if (state.isMoving && playerGroup) {
            const noiseRadius = (state.isRushing || state.isRolling) ? 20 : 15;
            session.makeNoise(playerGroup.position, noiseRadius, 'footstep');
        }

        monitor.begin('projectiles');
        ProjectileSystem.update(delta, now, _gameContext, state.projectiles, state.fireZones);
        monitor.end('projectiles');

        monitor.begin('triggers');
        _triggerOptionsScratch.t = activeCallbacks.t || callbacks.t;
        _triggerOptionsScratch.spawnBubble = activeCallbacks.spawnBubble;
        _triggerOptionsScratch.onClueDiscovered = activeCallbacks.onClueDiscovered;
        _triggerOptionsScratch.onPOIdiscovered = activeCallbacks.onPOIdiscovered;
        _triggerOptionsScratch.onTrigger = activeCallbacks.onTrigger;
        _triggerOptionsScratch.onAction = activeCallbacks.onAction;
        _triggerOptionsScratch.collectedCluesRef = (activeCallbacks as any).collectedCluesRef || refs.collectedCluesRef;

        TriggerHandler.checkTriggers(playerGroup.position, state, now, _triggerOptionsScratch as any);
        monitor.end('triggers');

        // 14. Bubbles Update
        // V8 Zero-GC Swap-and-Pop: Uses a forward loop with decrement to avoid missing elements
        for (let i = 0; i < refs.activeBubbles.current.length; i++) {
            const b = refs.activeBubbles.current[i];
            const age = now - b.startTime;

            if (age > b.duration) {
                if (b.element.parentNode) b.element.parentNode.removeChild(b.element);

                refs.activeBubbles.current[i] = refs.activeBubbles.current[refs.activeBubbles.current.length - 1];
                refs.activeBubbles.current.pop();

                i--; // Decrement to re-evaluate swapped element
                continue;
            }

            const stackIndex = (refs.activeBubbles.current.length - 1) - i;
            const baseX = window.innerWidth * 0.5;
            const baseY = window.innerHeight * 0.45;
            const bubbleHeight = 45;
            const x = baseX;
            const y = baseY - (stackIndex * bubbleHeight + 10);

            b.element.style.left = `${x}px`;
            b.element.style.top = `${y}px`;

            // String allocation optimization (.toFixed(2) prevents long floats in DOM)
            let opacity = '1';
            if (age < 200) opacity = (age / 200).toFixed(2);
            else if (age > b.duration - 500) opacity = ((b.duration - age) / 500).toFixed(2);

            let transform = `translate(-50%, -100%)`;
            if (age < 200) {
                const slide = ((1 - (age / 200)) * 20).toFixed(2);
                transform += ` translateY(${slide}px)`;
            }

            b.element.style.transform = transform;
            b.element.style.opacity = opacity;
            b.element.style.zIndex = `${1000 - stackIndex}`;
            b.element.style.transition = 'top 0.3s ease-out';
        }

        // 15. Emitters Update
        monitor.begin('active_effects');
        if (state.activeEffects) {
            for (let i = 0; i < state.activeEffects.length; i++) {
                const obj = state.activeEffects[i];
                if (!obj.visible || !obj.userData.effects) continue;
                const effects = obj.userData.effects;
                for (let j = 0; j < effects.length; j++) {
                    const eff = effects[j];
                    if (eff.type === 'emitter') {
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

    };
}