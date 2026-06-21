import * as THREE from 'three';
import { WeaponCategory, WeaponBehavior, WEAPONS, WeaponStats } from '../content/weapons';
import { ToolID, HoldableID, WeaponID } from '../entities/player/CombatTypes';
import { StatID } from '../types/CareerStats';
import { ProjectileSystem } from './ProjectileSystem';
import { WeaponSounds, UISounds } from '../utils/audio/AudioLib';
import { haptic } from '../utils/HapticManager';
import { NoiseType, NOISE_RADIUS } from '../entities/enemies/EnemyTypes';
import { TOOLS } from '../content/tools';
import { WeaponFX } from './WeaponFX';
import { SystemID } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { CareerStatsSystem } from './CareerStatsSystem';
import { InputAction } from '../core/engine/InputManager';
import { UIEventRingBuffer, UIEventType } from './ui/UIEventRingBuffer';
import { _buoyancyResult } from './WaterSystem';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();

const _UP = new THREE.Vector3(0, 1, 0);
const _validWeaponsScratch: HoldableID[] = [];

/**
 * Executes a throwable weapon launch.
 * Extracted out of hot path to eliminate closure allocation spikes.
 */
function _executeThrow(
    session: GameSessionLogic,
    playerGroup: THREE.Group,
    state: any,
    loadout: any,
    simTime: number,
    wep: WeaponStats,
    ratio: number,
    aimCrossMesh?: THREE.Group | null,
    trajectoryLineMesh?: THREE.Mesh | null
) {
    const isUnlimited = !!state.sectorState?.unlimitedThrowables;
    if (!isUnlimited) state.combat.weaponAmmo[state.combat.activeWeapon]--;

    CareerStatsSystem.recordThrowable(session, state.combat.activeWeapon);

    // Use locked rotation to guarantee throw path consistency if player releases stick while turning
    _v1.set(0, 0, 1).applyQuaternion(state.combat.throwChargeRotation).normalize();

    const rangeMult = state.player.statsBuffer[StatID.MULTIPLIER_RANGE] || 1.0;
    const reloadMult = state.player.statsBuffer[StatID.MULTIPLIER_RELOAD] || 1.0;
    const maxDist = (wep.range || 25.0) * rangeMult;
    const dist = Math.max(2.0, ratio * maxDist);

    _v2.copy(playerGroup.position).add(_v4.set(0, 1.5, 0)); // Origin height
    _v3.copy(playerGroup.position).addScaledVector(_v1, dist); // Landing destination
    _v3.y = 0.1;

    const tMax = 1.0 + (dist / maxDist) * 0.5;
    const damage = WeaponHandler.getScaledDamage(state.combat.activeWeapon, state.gameState.weaponLevels[state.combat.activeWeapon]);

    ProjectileSystem.launchThrowable(_v2, _v3, state.combat.activeWeapon, tMax, damage);

    if (wep.reloadTime && wep.reloadTime > 0) {
        state.combat.isReloading = true;
        state.combat.reloadEndTime = simTime + (wep.reloadTime * reloadMult);
        WeaponSounds.playMagOut();
    }

    if (state.combat.weaponAmmo[state.combat.activeWeapon] <= 0) {
        state.combat.activeWeapon = loadout.primary;
    }

    state.combat.throwChargeStart = 0;
    state.combat.lastShotTime = simTime;

    if (aimCrossMesh) aimCrossMesh.visible = false;
    if (trajectoryLineMesh) trajectoryLineMesh.visible = false;
}

export const WeaponHandler = {
    systemId: SystemID.WEAPON_HANDLER,
    id: 'weapon_handler',
    enabled: true,
    persistent: true,

    /**
     * Handles slot-specific input hotkeys (Keys 1-5)
     */
    handleSlotSwitch: (state: any, loadout: any, action: InputAction) => {
        if (state.vehicle.active || state.ui.cinematicActive) return;
        let next: HoldableID | null = null;
        switch (action) {
            case InputAction.SLOT_1: next = loadout.primary; break;
            case InputAction.SLOT_2: next = loadout.secondary; break;
            case InputAction.SLOT_3: next = loadout.throwable; break;
            case InputAction.SLOT_4: next = loadout.special; break;
            case InputAction.SLOT_5: next = ToolID.RADIO; break;
        }

        if (!next) return;

        const nextDef = (WEAPONS as any)[next] || (TOOLS as any)[next];

        if (nextDef?.category === WeaponCategory.THROWABLE && (state.combat.weaponAmmo[next] || 0) <= 0) {
            UISounds.playClick();
            return;
        }

        if (next === ToolID.RADIO && state.world.familyFound) {
            UISounds.playClick();
            return;
        }

        if (state.combat.activeWeapon !== next) {
            state.combat.activeWeapon = next;
            state.combat.isReloading = false;
            state.combat.reloadEndTime = 0;
            state.combat.throwChargeStart = 0;
            WeaponSounds.playWeaponSwap();
            haptic.weaponSwap();
        }
    },

    /**
     * Handles contextual weapon inputs such as reloading and scroll-wheel weapon selection.
     * Fully unrolled logic path to enforce monomorphic V8 shapes.
     */
    handleInput: (input: any, state: any, loadout: any, simTime: number, disableInput: boolean) => {
        if (disableInput || state.vehicle.active || state.ui.cinematicActive) return;

        const acts = input.actions;
        if (acts[InputAction.SCROLL_DOWN] || acts[InputAction.SCROLL_UP]) {
            let currentIdx = -1;
            _validWeaponsScratch.length = 0;
            let vCount = 0;
            let w: HoldableID;
            let def: any;

            // Enforce Monomorphic Caching: Explicitly unroll inventory slot lookups to maintain L1 cache velocity
            // Slot 1: Primary
            w = loadout.primary;
            if (w && (w as any) !== WeaponID.NONE) {
                def = (WEAPONS as any)[w];
                if (!(def?.category === WeaponCategory.THROWABLE && (state.combat.weaponAmmo[w] || 0) <= 0)) {
                    if (w === state.combat.activeWeapon) currentIdx = vCount;
                    _validWeaponsScratch[vCount++] = w;
                }
            }
            // Slot 2: Secondary
            w = loadout.secondary;
            if (w && (w as any) !== WeaponID.NONE) {
                def = (WEAPONS as any)[w];
                if (!(def?.category === WeaponCategory.THROWABLE && (state.combat.weaponAmmo[w] || 0) <= 0)) {
                    if (w === state.combat.activeWeapon) currentIdx = vCount;
                    _validWeaponsScratch[vCount++] = w;
                }
            }
            // Slot 3: Throwable
            w = loadout.throwable;
            if (w && (w as any) !== WeaponID.NONE) {
                def = (WEAPONS as any)[w];
                if (!(def?.category === WeaponCategory.THROWABLE && (state.combat.weaponAmmo[w] || 0) <= 0)) {
                    if (w === state.combat.activeWeapon) currentIdx = vCount;
                    _validWeaponsScratch[vCount++] = w;
                }
            }
            // Slot 4: Special
            w = loadout.special;
            if (w && (w as any) !== WeaponID.NONE) {
                def = (WEAPONS as any)[w];
                if (!(def?.category === WeaponCategory.THROWABLE && (state.combat.weaponAmmo[w] || 0) <= 0)) {
                    if (w === state.combat.activeWeapon) currentIdx = vCount;
                    _validWeaponsScratch[vCount++] = w;
                }
            }
            // Slot 5: Radio Tool
            w = ToolID.RADIO;
            if (!state.world.familyFound) {
                if (w === state.combat.activeWeapon) currentIdx = vCount;
                _validWeaponsScratch[vCount++] = w;
            }

            if (currentIdx !== -1 && vCount > 1) {
                const step = acts[InputAction.SCROLL_DOWN] ? 1 : -1;
                const nextIdx = (currentIdx + step + vCount) % vCount;
                const nextWep = _validWeaponsScratch[nextIdx];

                if (nextWep !== state.combat.activeWeapon) {
                    if (state.combat.activeWeapon === WeaponID.FLAMETHROWER) {
                        WeaponSounds.stopFlamethrower();
                    } else if (state.combat.activeWeapon === WeaponID.ARC_CANNON) {
                        WeaponSounds.stopArcCannon();
                    }
                    state.combat.activeWeapon = nextWep;
                    state.combat.isReloading = false;
                    state.combat.reloadEndTime = 0;
                    state.combat.throwChargeStart = 0;
                    WeaponSounds.playWeaponSwap();
                    haptic.weaponSwap();
                }
            }
            input.actions[InputAction.SCROLL_DOWN] = 0;
            input.actions[InputAction.SCROLL_UP] = 0;
        }

        let wep = (WEAPONS as any)[state.combat.activeWeapon] as WeaponStats;
        if (!wep) {
            state.combat.activeWeapon = loadout.primary;
            wep = (WEAPONS as any)[state.combat.activeWeapon] as WeaponStats;
            if (!wep) return;
        }

        const isThrowable = wep?.category === WeaponCategory.THROWABLE;
        const isRadio = state.combat.activeWeapon === ToolID.RADIO;
        const isEnergy = !!wep?.isEnergy;

        if (acts[InputAction.RELOAD] && !state.combat.isReloading && !isThrowable && !isRadio && !isEnergy && (state.combat.weaponAmmo[state.combat.activeWeapon] || 0) < (wep.magSize || 0)) {
            state.combat.isReloading = true;
            const actualReloadTime = (wep.reloadTime || 0) * (state.player.statsBuffer[StatID.MULTIPLIER_RELOAD] || 1.0);
            state.combat.reloadEndTime = simTime + actualReloadTime;
            UIEventRingBuffer.push(UIEventType.RELOAD_WEAPON, actualReloadTime, 0, simTime);
            WeaponSounds.playMagOut();
            haptic.reload();
        }

        if (state.combat.isReloading && simTime > state.combat.reloadEndTime) {
            state.combat.isReloading = false;
            if (wep.category !== WeaponCategory.THROWABLE) {
                state.combat.weaponAmmo[state.combat.activeWeapon] = wep.magSize || 0;
                WeaponSounds.playMagIn();
            }
        }
    },

    consumeAmmo: (state: any, weapon: WeaponID) => {
        return (state.combat.weaponAmmo[weapon] || 0) > 0 || !!state.sectorState?.unlimitedAmmo;
    },

    getScaledDamage: (weaponId: WeaponID, level: number = 0) => {
        const damage = ((WEAPONS as any)[weaponId] as WeaponStats)?.damage || 0;
        return Math.floor(damage * (1 + (level - 1) * 0.1));
    },

    /**
     * Authoritative weapon execution driver loop.
     * Enforces lightning/flame vector transformations safely inside localized buffers.
     */
    handleFiring: (session: GameSessionLogic, scene: THREE.Scene, playerGroup: THREE.Group, input: any, state: any, loadout: any, aimCrossMesh: THREE.Group | null, trajectoryLineMesh: THREE.Mesh | null | undefined, delta: number, simTime: number, renderTime: number) => {
        if (state.vehicle.active || state.ui.cinematicActive) return;
        if (state.player.isDodging || state.combat.isReloading) return;

        let weapon = (WEAPONS as any)[state.combat.activeWeapon] as WeaponStats;
        if (!weapon) {
            state.combat.activeWeapon = loadout.primary;
            weapon = (WEAPONS as any)[state.combat.activeWeapon] as WeaponStats;
            if (!weapon) return;
        }

        const wepId = state.combat.activeWeapon;

        if (wepId === ToolID.RADIO) {
            if (input.actions[InputAction.FIRE]) WeaponSounds.playRadio();
            state.combat.throwChargeStart = 0;
            if (aimCrossMesh) aimCrossMesh.visible = false;
            if (trajectoryLineMesh) trajectoryLineMesh.visible = false;
            return;
        }

        // --- OPTIMIZED ENERGY REGENERATION ---
        if (loadout.primary && (WEAPONS as any)[loadout.primary]?.isEnergy) {
            if (!(input.actions[InputAction.FIRE] && wepId === loadout.primary)) {
                state.combat.weaponAmmo[loadout.primary] = Math.min(100, (state.combat.weaponAmmo[loadout.primary] || 0) + 10 * delta);
            }
        }
        if (loadout.secondary && (WEAPONS as any)[loadout.secondary]?.isEnergy) {
            if (!(input.actions[InputAction.FIRE] && wepId === loadout.secondary)) {
                state.combat.weaponAmmo[loadout.secondary] = Math.min(100, (state.combat.weaponAmmo[loadout.secondary] || 0) + 10 * delta);
            }
        }
        if (loadout.special && (WEAPONS as any)[loadout.special]?.isEnergy) {
            if (!(input.actions[InputAction.FIRE] && wepId === loadout.special)) {
                state.combat.weaponAmmo[loadout.special] = Math.min(100, (state.combat.weaponAmmo[loadout.special] || 0) + 10 * delta);
            }
        }

        switch (weapon.behavior) {
            case WeaponBehavior.CONTINUOUS: {
                if (aimCrossMesh) aimCrossMesh.visible = false;
                if (trajectoryLineMesh) trajectoryLineMesh.visible = false;

                const isUnlimited = !!state.sectorState?.unlimitedAmmo;
                const hasAmmo = state.combat.weaponAmmo[wepId] > 0 || isUnlimited;
                const isFiring = input.actions[InputAction.FIRE] && hasAmmo;

                if (isFiring) {
                    if (weapon.isEnergy) {
                        state.combat.weaponAmmo[wepId] -= 20 * delta;
                        if (state.combat.weaponAmmo[wepId] < 0) state.combat.weaponAmmo[wepId] = 0;

                        const actualFireRate = (weapon.fireRate || 100);
                        if (simTime > state.combat.lastShotTime + actualFireRate) {
                            if (wepId == WeaponID.FLAMETHROWER) WeaponSounds.playFlamethrower();
                            else if (wepId == WeaponID.ARC_CANNON) WeaponSounds.playArcCannon();
                            else WeaponSounds.playShot(wepId); // currently only the minigun

                            state.combat.lastShotTime = simTime;
                            CareerStatsSystem.recordShot(session, wepId);
                        }
                    } else if (!isUnlimited) {
                        const actualFireRate = (weapon.fireRate || 0) * (state.player.statsBuffer[StatID.MULTIPLIER_FIRERATE] || 1.0);
                        if (simTime > state.combat.lastShotTime + actualFireRate) {
                            state.combat.weaponAmmo[wepId]--;
                            state.combat.lastShotTime = simTime;

                            if (state.combat.weaponAmmo[wepId] === 5) {
                                UIEventRingBuffer.push(UIEventType.AMMO_LOW, 5, 0, simTime);
                            }

                            CareerStatsSystem.recordShot(session, wepId);
                        }
                    }

                    _v1.set(0.3, 1.4, 0.8).applyQuaternion(playerGroup.quaternion);
                    _v2.copy(playerGroup.position).add(_v1);
                    _v3.set(state.player.aimDirection.x, 0, state.player.aimDirection.y).normalize();

                    if (WeaponHandler.consumeAmmo(state, wepId)) {
                        WeaponFX.createMuzzleEffect(scene, wepId, _v2, _v3);
                    }
                } else {
                    if (wepId === WeaponID.FLAMETHROWER) {
                        WeaponSounds.stopFlamethrower();
                    } else if (wepId === WeaponID.ARC_CANNON) {
                        WeaponSounds.stopArcCannon();
                    }

                    if (input.actions[InputAction.FIRE] && !hasAmmo && simTime > state.combat.lastShotTime + 500) {
                        WeaponSounds.playEmptyClick();
                        state.combat.lastShotTime = simTime;
                    }

                    if (wepId === WeaponID.FLAMETHROWER && (state.combat as any).lastFireState) {
                        const tip = state.player.nodes.barrelTip;
                        if (tip) {
                            tip.getWorldPosition(_v2);
                        } else {
                            _v1.set(0.3, 1.4, 0.8).applyQuaternion(playerGroup.quaternion);
                            _v2.copy(playerGroup.position).add(_v1);
                        }
                        WeaponFX.createMuzzleSmoke(_v2);
                    }
                }
                (state.combat as any).lastFireState = isFiring;
                break;
            }

            case WeaponBehavior.PROJECTILE: {
                if (aimCrossMesh) aimCrossMesh.visible = false;
                if (trajectoryLineMesh) trajectoryLineMesh.visible = false;

                if (input.actions[InputAction.FIRE]) {
                    const isUnlimited = !!state.sectorState?.unlimitedAmmo;
                    const hasAmmo = state.combat.weaponAmmo[wepId] > 0 || isUnlimited;
                    const actualFireRate = (weapon.fireRate || 0) * (state.player.statsBuffer[StatID.MULTIPLIER_FIRERATE] || 1.0);

                    if (simTime > state.combat.lastShotTime + actualFireRate && hasAmmo) {
                        state.combat.lastShotTime = simTime;
                        if (!isUnlimited) state.combat.weaponAmmo[wepId]--;

                        CareerStatsSystem.recordShot(session, wepId);

                        const tip = state.player.nodes.barrelTip;
                        if (tip) {
                            tip.getWorldPosition(_v2);
                        } else {
                            _v1.set(0.3, 1.4, 0.4).applyQuaternion(playerGroup.quaternion);
                            _v2.copy(playerGroup.position).add(_v1);
                        }

                        WeaponSounds.playShot(wepId);
                        haptic.gunshot();

                        if (state.callbacks && state.callbacks.makeNoise) {
                            state.callbacks.makeNoise(_v2, NoiseType.GUNSHOT, NOISE_RADIUS[NoiseType.GUNSHOT]);
                        }

                        const pellets = weapon.id === WeaponID.SHOTGUN ? 8 : 1;
                        const spread = weapon.id === WeaponID.SHOTGUN ? 0.15 : 0;
                        const totalDamage = WeaponHandler.getScaledDamage(wepId, state.gameState.weaponLevels[wepId]);
                        const damagePerPellet = totalDamage / pellets;

                        for (let i = 0; i < pellets; i++) {
                            _v3.set(0, 0, 1).applyQuaternion(playerGroup.quaternion);

                            if (spread > 0) {
                                _v3.x += (Math.random() - 0.5) * spread;
                                _v3.y += (Math.random() - 0.5) * spread;
                                _v3.z += (Math.random() - 0.5) * spread;
                            }
                            _v3.normalize();

                            const rangeMult = state.player.statsBuffer[StatID.MULTIPLIER_RANGE] || 1.0;
                            const bulletLife = ((weapon.range || 15) / (weapon.bulletSpeed || 70)) * rangeMult;

                            ProjectileSystem.launchBullet(_v2, _v3, weapon.id, damagePerPellet, bulletLife);
                        }

                        WeaponFX.createMuzzleEffect(scene, wepId, _v2, _v3);
                    } else if (input.actions[InputAction.FIRE] && (state.combat.weaponAmmo[wepId] || 0) <= 0 && simTime > state.combat.lastShotTime + (weapon.fireRate || 0)) {
                        state.combat.lastShotTime = simTime;
                        if (state.sectorState?.noReload) {
                            state.combat.weaponAmmo[wepId] = weapon.magSize || 0;
                        } else {
                            WeaponSounds.playEmptyClick();
                            state.combat.isReloading = true;
                            const actualReloadTime = (weapon.reloadTime || 0);
                            state.combat.reloadEndTime = simTime + actualReloadTime;
                            UIEventRingBuffer.push(UIEventType.RELOAD_WEAPON, actualReloadTime, 0, simTime);
                            //WeaponSounds.playMagOut();
                        }
                    }
                }
                break;
            }
            case WeaponBehavior.THROWABLE: {
                const canCharge = (state.combat.weaponAmmo[wepId] > 0) && simTime > (state.combat.lastShotTime || 0) + 500;

                if (input.actions[InputAction.FIRE] && canCharge) {
                    if (state.combat.throwChargeStart === 0) {
                        state.combat.throwChargeStart = simTime;
                        state.combat.throwChargeRotation.copy(playerGroup.quaternion);
                    }

                    const isAiming = (input.joystickAim && input.joystickAim.lengthSq() > 0.1) || (input.aimVector && input.aimVector.lengthSq() > 1);
                    if (isAiming) {
                        state.combat.throwChargeRotation.copy(playerGroup.quaternion);
                    }

                    const chargeTime = 1250;
                    const holdTime = 500;
                    const totalCycle = chargeTime + holdTime;

                    const elapsed = simTime - state.combat.throwChargeStart;
                    const cycleElapsed = elapsed % totalCycle;
                    const ratio = cycleElapsed < chargeTime ? (cycleElapsed / chargeTime) : 1.0;

                    _v1.set(0, 0, 1).applyQuaternion(state.combat.throwChargeRotation).normalize();

                    const maxDist = (weapon.range || 25.0) * (state.player.statsBuffer[StatID.MULTIPLIER_RANGE] || 1.0);
                    const dist = Math.max(2.0, ratio * maxDist);

                    _v2.copy(playerGroup.position).add(_v4.set(0, 1.5, 0));
                    _v3.copy(playerGroup.position).addScaledVector(_v1, dist);
                    _v3.y = 0.1;

                    const tMax = 1.0 + (dist / maxDist) * 0.5;
                    const g = 30;

                    if (aimCrossMesh) {
                        aimCrossMesh.visible = true;
                        aimCrossMesh.position.copy(_v3);
                        aimCrossMesh.position.y = 0.2;

                        if (ratio >= 1.0) {
                            aimCrossMesh.scale.setScalar(1.5 + Math.sin(renderTime * 0.01) * 0.1);
                        } else {
                            aimCrossMesh.scale.setScalar(1 + ratio * 0.5);
                        }
                    }

                    if (trajectoryLineMesh) {
                        trajectoryLineMesh.visible = true;

                        const vx = (_v3.x - _v2.x) / tMax;
                        const vz = (_v3.z - _v2.z) / tMax;
                        const vy = (_v3.y - _v2.y + 0.5 * g * tMax * tMax) / tMax;

                        const posAttr = trajectoryLineMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
                        const width = 0.15;

                        const engine = session.engine;
                        const water = engine?.systems.water;

                        const origInWater = _buoyancyResult.inWater;
                        const origWaterLevel = _buoyancyResult.waterLevel;
                        const origDepth = _buoyancyResult.depth;
                        const origMaxDepth = _buoyancyResult.maxDepth;
                        const origGroundY = _buoyancyResult.groundY;
                        const origBaseWaterLevel = _buoyancyResult.baseWaterLevel;

                        let groundY = 0.1;

                        for (let i = 0; i <= 20; i++) {
                            const t = (i / 20) * tMax;
                            const tx = _v2.x + vx * t;
                            const tz = _v2.z + vz * t;
                            const ty = _v2.y + vy * t - 0.5 * g * t * t;

                            const instVy = vy - (g * t);

                            if (water) {
                                water.checkBuoyancy(tx, 0.5, tz, renderTime);
                                if (_buoyancyResult.inWater) {
                                    groundY = _buoyancyResult.waterLevel + 0.05;
                                } else {
                                    groundY = 0.1;
                                }
                            }

                            _v4.set(tx, Math.max(groundY, ty), tz);
                            _v5.set(vx, instVy, vz).normalize();

                            _v1.crossVectors(_v5, _UP).normalize().multiplyScalar(width);

                            posAttr.setXYZ(2 * i, _v4.x - _v1.x, _v4.y, _v4.z - _v1.z);
                            posAttr.setXYZ(2 * i + 1, _v4.x + _v1.x, _v4.y, _v4.z + _v1.z);
                        }
                        posAttr.needsUpdate = true;
                        (trajectoryLineMesh.material as THREE.MeshBasicMaterial).opacity = 0.4 + ratio * 0.6;
                        (trajectoryLineMesh.material as THREE.MeshBasicMaterial).depthTest = false;

                        _buoyancyResult.inWater = origInWater;
                        _buoyancyResult.waterLevel = origWaterLevel;
                        _buoyancyResult.depth = origDepth;
                        _buoyancyResult.maxDepth = origMaxDepth;
                        _buoyancyResult.groundY = origGroundY;
                        _buoyancyResult.baseWaterLevel = origBaseWaterLevel;
                    }
                } else if (state.combat.throwChargeStart > 0) {
                    const totalCycle = 1250 + 500;
                    const cycleElapsed = (simTime - state.combat.throwChargeStart) % totalCycle;
                    const ratio = cycleElapsed < 1250 ? (cycleElapsed / 1250) : 1.0;

                    _executeThrow(session, playerGroup, state, loadout, simTime, weapon, ratio, aimCrossMesh, trajectoryLineMesh);
                } else {
                    if (aimCrossMesh) aimCrossMesh.visible = false;
                    if (trajectoryLineMesh) trajectoryLineMesh.visible = false;
                }
                break;
            }
        }
    }
};