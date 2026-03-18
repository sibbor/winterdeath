import * as THREE from 'three';
import { WinterEngine } from '../../../core/engine/WinterEngine';
import { GameSessionLogic } from '../../../core/GameSessionLogic';
import { RuntimeState } from '../../../core/RuntimeState';
import { PerformanceMonitor } from '../../../core/systems/PerformanceMonitor';
import { HudSystem } from '../../../core/systems/HudSystem';
import { PlayerAnimator } from '../../../core/animation/PlayerAnimator';
import { FootprintSystem } from '../../../core/systems/FootprintSystem';
import { FXSystem } from '../../../core/systems/FXSystem';
import { ProjectileSystem } from '../../../core/weapons/ProjectileSystem';
import { TriggerHandler } from '../../../core/systems/TriggerHandler';
import { CAMERA_HEIGHT, HEALTH_CRITICAL_THRESHOLD } from '../../../content/constants';
import { soundManager } from '../../../utils/SoundManager';
import { EnemyManager } from '../../../core/EnemyManager';
import { WeaponType, WeaponCategoryColors, WEAPONS } from '../../../content/weapons';
import { EnemyDeathState } from '../../../types/enemy';
import { DamageType } from '../../../types/combat';
import { HudStore } from '../../../core/systems/HudStore';

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
const _vCamera = new THREE.Vector3();
const _vInteraction = new THREE.Vector3();
const _interactionScreenPosScratch = { x: 0, y: 0 };
const _animStateScratch: any = {};
const _fxCallbacks: any = {};
const _triggerOptionsScratch: any = {};
const _bubbleScratch: any[] = []; // Pre-allocated scratchpad for bubbles

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
    _fxCallbacks.onPlayerHit = (damage: number, attacker: any, type: string, isDoT: boolean, effectType?: any, effectDuration?: number, effectDamage?: number, attackName?: string) => {
        const statsSystem = session.getSystem('player_stats_system') as any;
        if (statsSystem) {
            statsSystem.handlePlayerHit(session, damage, attacker, type, isDoT, effectType, effectDuration, effectDamage, attackName);
        }
    };

    _triggerOptionsScratch.removeVisual = (id: string) => {
        const scene = engine.scene;
        let visual = scene.getObjectByName(`clue_visual_${id}`);

        // Zero-GC replacement for .find()
        if (!visual) {
            for (let i = 0; i < scene.children.length; i++) {
                const child = scene.children[i];
                if (child.userData.id === id && child.userData.type === 'clue_visual') {
                    visual = child;
                    break;
                }
            }
        }

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
            if (type === 'damage') {
                const damageTracker = session.getSystem('damage_tracker_system') as any;
                if (damageTracker) {
                    damageTracker.recordOutgoingDamage(session, amt, 'Generic', isBoss);
                }
            }
            if (type === 'hit') state.shotsHit += amt;
        },
        addFireZone: (z: any) => state.fireZones.push(z),
        onPlayerHit: (dmg: number, attacker: any, type: DamageType) => {
            if (_fxCallbacks.onPlayerHit) _fxCallbacks.onPlayerHit(dmg, attacker, type);
        },
        applyDamage: (enemy: any, amount: number, type: DamageType | WeaponType | string, isHighImpact: boolean = false) => {
            if (enemy.deathState !== EnemyDeathState.ALIVE) return false;

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

            // Determine Color based on Weapon Category
            let color = '#ffffff';
            const weaponData = (WEAPONS as any)[type];
            if (weaponData && weaponData.category) {
                color = (WeaponCategoryColors as any)[weaponData.category] || '#ffffff';
            } else {
                // FALLBACKS for non-weapon damage
                if (type === DamageType.BURN || type === 'BURN') color = '#ffaa00';
                else if (type === DamageType.ELECTRIC || type === 'ELECTRIC') color = '#00ffff';
                else if (type === DamageType.FALL) color = '#ffffff';
                else if (type === DamageType.DROWNING) color = '#3b82f6';
            }

            // High Impact (Crits/Heavy) can override color to be brighter or just use the weapon color
            if (isHighImpact && !weaponData) {
                color = '#ff0000';
            }

            // Throttle text spawning for performance (Zero-GC Accumulation)
            // Guns (PROJECTILE) usually show every hit, 
            // but Sprays/DoT (CONTINUOUS/BURN) accumulate over 250ms
            const isContinuous = weaponData?.behavior === 'CONTINUOUS' || type === DamageType.BURN || type === 'BURN' || type === DamageType.DROWNING;
            const textThrottle = isContinuous ? 250 : 0;

            enemy._accumulatedDamage = (enemy._accumulatedDamage || 0) + amount;

            if (_gameContext.now - (enemy._lastDamageTextTime || 0) > textThrottle) {
                if (_gameContext.spawnFloatingText && enemy._accumulatedDamage >= 1) {
                    const textX = enemy.mesh.position.x;
                    const textY = enemy.isBoss ? 4.0 : 2.5;
                    const textZ = enemy.mesh.position.z;

                    _gameContext.spawnFloatingText(
                        textX, textY, textZ,
                        getCachedNumberString(enemy._accumulatedDamage),
                        color
                    );
                    enemy._accumulatedDamage = 0; // Reset accumulation after showing
                    enemy._lastDamageTextTime = _gameContext.now;
                }
            }

            if (PerformanceMonitor.getInstance().aiLoggingEnabled) {
                // Throttled logging for continuous damage or rapid fire
                if (!isContinuous || (frame % 10 === 0)) {
                    console.log(`[GameSessionLoop.applyDamage()] ${enemy.type}_${enemy.id} HP: ${enemy.hp} | -${amount} (${type})`);
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
                if (members[i].id === familyId) return members[i].mesh?.position || null;
            }
            return null;
        }
        if (ownerId) {
            const scene = engine.scene;
            const obj = scene.getObjectByName(ownerId);
            if (obj) return obj.position;

            for (let i = 0; i < scene.children.length; i++) {
                if (scene.children[i].userData.id === ownerId) return scene.children[i].position;
            }
            return null;
        }
        return null;
    };

    return (dt: number) => {
        if (!refs.isMounted.current || refs.isBuildingSectorRef.current) return;

        // --- Delta-Time Spike Guard ---
        let delta = dt;
        if (delta > 0.1) delta = 0.016; // Prevent physics explosions after alt-tab

        // Pause guard
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

        // 1. Interaction Input
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

        // 2. UI Throttling (Zero-GC Update to React props)
        refs.lastDrawCallsRef.current = engine.renderer.info.render.calls;
        state.framesSinceHudUpdate++;
        uiSyncTimer += delta;

        if (uiSyncTimer >= 0.066) { // ~15 FPS
            uiSyncTimer = 0;
            state.lastHudUpdate = now;

            const hudMesh = refs.familyMemberRef.current?.mesh || null;

            monitor.begin('hud_sync');
            const hudData = HudSystem.getHudData(state, playerGroup.position, hudMesh, engine.input.state, now, propsRef.current, refs.distanceTraveledRef.current, engine.camera.threeCamera);
            monitor.end('hud_sync');

            hudData.debugInfo.drawCalls = refs.lastDrawCallsRef.current;

            // Expose performance metrics implicitly onto state struct (updated by renderer)
            state.renderCpuTime = engine.renderer.info.render.frame || 0;
            state.drawCalls = engine.renderer.info.render.calls;
            state.triangles = engine.renderer.info.render.triangles;

            // Append data directly to avoid Object Spread allocation
            (hudData as any).debugMode = propsRef.current.debugMode;
            (hudData as any).systems = session.getSystems();

            HudStore.update(hudData);
        }

        // 3. Boss Intro overrides
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
                PlayerAnimator.update(refs.playerMeshRef.current, _animStateScratch, now, delta);
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

        if (!propsRef.current.isRunning || propsRef.current.isPaused) {
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
                engine.camera.lookAt(playerGroup.position.x, playerGroup.position.y, playerGroup.position.z, true);
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
        session.update(delta, propsRef.current.mapId || 0);
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
                PlayerAnimator.update(refs.playerMeshRef.current, _animStateScratch, now, delta);
                monitor.end('player_animation');
            }
        }

        // 9. Secondary Systems
        monitor.begin('footprints');
        FootprintSystem.update(delta);
        monitor.end('footprints');

        if (playerGroup) {
            monitor.begin('fx');
            FXSystem.update(engine.scene, state.particles, state.bloodDecals, delta, frame, now, playerGroup.position, _fxCallbacks);
            monitor.end('fx');
        }

        // 10. Camera Processing
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

                const envCameraZ = propsRef.current.currentSectorData?.environment.cameraOffsetZ || 25;
                const envCameraY = propsRef.current.currentSectorData?.environment.cameraHeight || CAMERA_HEIGHT;
                engine.camera.setCinematic(false);
                engine.camera.follow(playerGroup.position, envCameraZ, envCameraY);
            }
        } else {
            engine.camera.setCinematic(true);
        }

        // --- 11. TRACKING SHADOW CAMERA (Zero-GC) ---
        // Center the shadow map over the player to prevent the game from becoming dark at the edges
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

        // 12. Interaction Logic (Event-Driven)
        const currentInter = state.interactionType;
        const currentLabel = state.interactionLabel;
        const lastType = refs.interactionTypeRef.current;

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
            const posChanged = !lastPos || Math.abs(lastPos.x - screenX) > 3.0 || Math.abs(lastPos.y - screenY) > 3.0;
            const typeChanged = currentInter !== lastType;
            const labelChanged = currentLabel !== (state as any).lastInteractionLabel;

            if (posChanged || typeChanged || labelChanged) {
                _interactionScreenPosScratch.x = screenX;
                _interactionScreenPosScratch.y = screenY;
                refs.lastInteractionPosRef.current = _interactionScreenPosScratch;
                refs.interactionTypeRef.current = currentInter;
                (state as any).lastInteractionLabel = currentLabel;

                // ZERO-GC: Mutate the store data directly instead of spreading
                const hData = HudStore.getData();
                if (!hData.interactionPrompt) hData.interactionPrompt = {} as any;
                hData.interactionPrompt.type = currentInter;
                hData.interactionPrompt.label = currentLabel;
                hData.interactionPrompt.pos = _interactionScreenPosScratch;
                HudStore.update(hData);
            }
        } else {
            if (refs.interactionTypeRef.current !== null) {
                refs.interactionTypeRef.current = null;
                refs.lastInteractionPosRef.current = null;
                (state as any).lastInteractionLabel = null;

                // ZERO-GC: Mutate the store data directly
                const hData = HudStore.getData();
                hData.interactionPrompt = null;
                HudStore.update(hData);
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

        // 14. Bubbles Update (via HudStore)
        _bubbleScratch.length = 0; // Clear the scratchpad
        const bubblesRef = refs.activeBubbles.current;
        for (let i = 0; i < bubblesRef.length; i++) {
            const b = bubblesRef[i];
            const age = now - b.startTime;

            if (age > b.duration) {
                bubblesRef[i] = bubblesRef[bubblesRef.length - 1];
                bubblesRef.pop();
                i--;
                continue;
            }

            const stackIndex = (bubblesRef.length - 1) - i;
            const baseX = window.innerWidth * 0.5;
            const baseY = window.innerHeight * 0.45;
            const bubbleHeight = 45;
            const x = baseX;
            const y = baseY - (stackIndex * bubbleHeight + 10);

            let opacity = 1.0;
            if (age < 200) opacity = age / 200;
            else if (age > b.duration - 500) opacity = (b.duration - age) / 500;

            let slideY = 0;
            if (age < 200) slideY = (1 - (age / 200)) * 20;

            // Optional future optimization: pre-allocate bubble objects and mutate them
            _bubbleScratch.push({
                id: b.id || Math.random().toString(),
                text: b.text,
                duration: b.duration,
                pos: { x, y }, // Note: We still create object literals here, but it's only when a bubble exists
                opacity,
                slideY,
                zIndex: 1000 - stackIndex
            });
        }

        if (_bubbleScratch.length > 0 || (refs as any)._hadBubblesLastFrame) {
            // ZERO-GC: Mutate the store data directly
            const hData = HudStore.getData();
            // Assign the activeBubbles array to the store
            hData.activeBubbles = _bubbleScratch.length > 0 ? _bubbleScratch : undefined;
            HudStore.update(hData);

            (refs as any)._hadBubblesLastFrame = _bubbleScratch.length > 0;
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

        // 16. Update PerformanceMonitor
        monitor.updateGameState(
            playerGroup.position.x,
            playerGroup.position.z,
            engine.camera.position.x,
            engine.camera.position.y,
            engine.camera.position.z,
            state.enemies.length,
            state.obstacles ? state.obstacles.length : 0
        );

    };
}