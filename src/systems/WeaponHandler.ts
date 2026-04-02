import * as THREE from 'three';
import { WeaponType, WeaponCategory, WeaponBehavior, WEAPONS } from '../content/weapons';
import { ProjectileSystem } from './ProjectileSystem';
import { soundManager } from '../utils/audio/SoundManager';
import { haptic } from '../utils/HapticManager';
import { WinterEngine } from '../core/engine/WinterEngine';
import { NoiseType, NOISE_RADIUS } from '../entities/enemies/EnemyTypes';
import { _buoyancyResult } from './WaterSystem';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);
const _slotArray: WeaponType[] = [];

// Avoid creating empty objects and functions in loops
const _NOOP_DAMAGE_TEXT = (x: number, y: number, z: number, t: string, c?: string) => { };

// For Billboard Math
const _cameraWorldPos = new THREE.Vector3();

const _continuousNumberCache: Record<number, string> = {};
function getContinuousNumberString(num: number): string {
    const rounded = Math.round(num);
    if (!_continuousNumberCache[rounded]) _continuousNumberCache[rounded] = rounded.toString();
    return _continuousNumberCache[rounded];
}

// Reusable context object to prevent GC allocation during continuous fire
const _continuousCtx: any = {
    scene: null,
    enemies: null,
    collisionGrid: null,
    spawnPart: null,
    showDamageText: null,
    spawnDecal: null,
    explodeEnemy: null,
    trackStats: null,
    addScore: null,
    addFireZone: null,
    now: 0,
    noiseEvents: null
};

// Shared state for the checkSlot algorithm to avoid closure allocation
let _currentSlotIdx = -1;
function _checkSlot(wepType: WeaponType | null | undefined, state: any) {
    if (!wepType) return;
    if (WEAPONS[wepType] && WEAPONS[wepType].category === WeaponCategory.THROWABLE && (state.weaponAmmo[wepType] || 0) <= 0) return;
    if (wepType === WeaponType.RADIO && state.familyFound) return;

    if (wepType === state.activeWeapon) {
        _currentSlotIdx = _slotArray.length;
    }
    _slotArray.push(wepType);
}

// Extracted to prevent closure allocations per frame during throwing charge
function _executeThrow(
    session: any,
    scene: THREE.Scene,
    playerGroup: THREE.Group,
    state: any,
    loadout: any,
    now: number,
    wep: any,
    ratio: number,
    aimCrossMesh?: THREE.Group | null,
    trajectoryLineMesh?: THREE.Mesh | null
) {
    const isUnlimited = !!state.sectorState?.unlimitedThrowables;
    if (!isUnlimited) state.weaponAmmo[state.activeWeapon]--;

    const tracker = (session as any).getSystem('damage_tracker_system') as any;
    if (tracker) tracker.recordThrowable(session);

    _v1.set(0, 0, 1).applyQuaternion(playerGroup.quaternion).normalize();

    const maxDist = (wep.range || 25.0) * (state.multipliers.range || 1.0);
    const dist = Math.max(2.0, ratio * maxDist);

    _v2.copy(playerGroup.position).add(_v4.set(0, 1.5, 0)); // Origin
    _v3.copy(playerGroup.position).addScaledVector(_v1, dist); // Target
    _v3.y = 0.1;

    const tMax = 1.0 + (dist / maxDist) * 0.5;

    const damage = WeaponHandler.getScaledDamage(state.activeWeapon, state.weaponLevels[state.activeWeapon]);
    ProjectileSystem.launchThrowable(scene, state.projectiles, _v2, _v3,
        state.activeWeapon, tMax, damage);

    if (wep.reloadTime && wep.reloadTime > 0) {
        state.isReloading = true;
        state.reloadEndTime = now + (wep.reloadTime * (state.multipliers.reloadTime || 1.0));
        soundManager.playMagOut();
    }

    if (state.weaponAmmo[state.activeWeapon] <= 0) {
        state.activeWeapon = loadout.primary;
    }

    state.throwChargeStart = 0;
    state.lastShotTime = now;

    if (aimCrossMesh) aimCrossMesh.visible = false;
    if (trajectoryLineMesh) trajectoryLineMesh.visible = false;
}

export const WeaponHandler = {

    // Handle switching weapons via 1-4 keys
    handleSlotSwitch: (state: any, loadout: any, key: string) => {
        // VINTERDÖD FIX: Block input during cinematics
        if (state.vehicle.active || state.cinematicActive) return;
        let next: WeaponType | null = null;
        if (key === '1') next = loadout.primary;
        else if (key === '2') next = loadout.secondary;
        else if (key === '3') next = loadout.throwable;
        else if (key === '4') next = loadout.special;
        else if (key === '5') next = WeaponType.RADIO;

        if (!next) return;

        // Restriction: Cannot switch to empty throwables
        if (WEAPONS[next]?.category === WeaponCategory.THROWABLE && (state.weaponAmmo[next] || 0) <= 0) {
            soundManager.playUiClick();
            return;
        }

        // Restriction: Radio is only for calling family
        if (next === WeaponType.RADIO && state.familyFound) {
            soundManager.playUiClick();
            return;
        }

        if (state.activeWeapon !== next) {
            state.activeWeapon = next;
            state.isReloading = false;
            state.reloadEndTime = 0;
            state.throwChargeStart = 0;
            soundManager.playWeaponSwap();
            haptic.weaponSwap();
        }
    },

    // Handle weapon-related inputs (Scroll to switch, R to reload)
    handleInput: (input: any, state: any, loadout: any, simTime: number, disableInput: boolean) => {
        // VINTERDÖD FIX: Block input during cinematics
        if (disableInput || state.vehicle.active || state.cinematicActive) return;

        // 1. Optimized Scroll Switching (Zero-GC)
        if (input.scrollDown || input.scrollUp) {
            _slotArray.length = 0;
            _currentSlotIdx = -1;

            _checkSlot(loadout.primary, state);
            _checkSlot(loadout.secondary, state);
            _checkSlot(loadout.throwable, state);
            _checkSlot(loadout.special, state);
            _checkSlot(WeaponType.RADIO, state);

            if (_currentSlotIdx !== -1 && _slotArray.length > 1) {
                const step = input.scrollDown ? 1 : -1;
                const nextIdx = (_currentSlotIdx + step + _slotArray.length) % _slotArray.length;
                const nextWep = _slotArray[nextIdx];

                if (nextWep !== state.activeWeapon) {
                    state.activeWeapon = nextWep;
                    state.isReloading = false;
                    state.reloadEndTime = 0;
                    state.throwChargeStart = 0;
                    soundManager.playWeaponSwap();
                    haptic.weaponSwap();
                }
            }
            input.scrollDown = input.scrollUp = false;
        }

        // 2. Weapon Validation
        let wep = WEAPONS[state.activeWeapon];
        if (!wep) {
            state.activeWeapon = loadout.primary;
            wep = WEAPONS[state.activeWeapon];
        }

        // 3. Reload Logic
        const isThrowable = wep.category === WeaponCategory.THROWABLE;
        const isRadio = state.activeWeapon === WeaponType.RADIO;

        if (input.r && !state.isReloading && !isThrowable && !isRadio && (state.weaponAmmo[state.activeWeapon] || 0) < (wep.magSize || 0)) {
            state.isReloading = true;
            const actualReloadTime = (wep.reloadTime || 0) * (state.multipliers.reloadTime || 1.0);
            state.reloadEndTime = simTime + actualReloadTime;
            soundManager.playMagOut();
            haptic.reload();
        }

        if (state.isReloading && simTime > state.reloadEndTime) {
            state.isReloading = false;

            // VINTERDÖD FIX: Throwables use reloadTime as a cooldown, NOT an ammo refill.
            // Only guns and special weapons (Continuous) should refill their mag on reload.
            if (wep.category !== WeaponCategory.THROWABLE) {
                state.weaponAmmo[state.activeWeapon] = wep.magSize || 0;
                soundManager.playMagIn();
            }
        }
    },

    // --- DAMAGE SCALING ---
    getScaledDamage: (weaponType: WeaponType, level: number = 0) => {
        const damage = WEAPONS[weaponType]?.damage || 0;
        // 10% increase per level above 1: Damage * (1 + (level - 1) * 0.1)
        return Math.floor(damage * (1 + (level - 1) * 0.1));
    },

    // --- CORE FIRING LOGIC ---
    handleFiring: (session: any, scene: THREE.Scene, playerGroup: THREE.Group, input: any, state: any, simDelta: number, simTime: number, renderTime: number, loadout: any, aimCrossMesh: THREE.Group | null, trajectoryLineMesh?: THREE.Mesh | null) => {
        if (state.vehicle.active || state.cinematicActive) return;
        if (state.isRolling || state.isReloading) return;

        let wep = WEAPONS[state.activeWeapon];
        if (!wep) {
            state.activeWeapon = loadout.primary;
            wep = WEAPONS[state.activeWeapon];
        }

        if (state.activeWeapon === WeaponType.RADIO) {
            state.throwChargeStart = 0;
            if (aimCrossMesh) aimCrossMesh.visible = false;
            if (trajectoryLineMesh) trajectoryLineMesh.visible = false;
            return;
        }

        // --- 1. CONTINUOUS FIRE (Flamethrower / Arc-Cannon) ---
        if (wep.behavior === WeaponBehavior.CONTINUOUS) {
            if (aimCrossMesh) aimCrossMesh.visible = false;
            if (trajectoryLineMesh) trajectoryLineMesh.visible = false;

            if (input.fire) {
                const isUnlimited = !!state.sectorState?.unlimitedAmmo;
                const hasAmmo = state.weaponAmmo[state.activeWeapon] > 0 || isUnlimited;
                if (hasAmmo) {
                    if (!isUnlimited) {
                        const actualFireRate = (wep.fireRate || 0) / (state.multipliers.fireRate || 1.0);
                        if (simTime > state.lastShotTime + actualFireRate) {
                            state.weaponAmmo[state.activeWeapon]--;
                            state.lastShotTime = simTime;

                            const tracker = session.getSystem('damage_tracker_system') as any;
                            if (tracker) tracker.recordShot(session, state.activeWeapon);
                        }
                    }

                    _v1.set(0.3, 1.4, 0.8).applyQuaternion(playerGroup.quaternion);
                    _v2.copy(playerGroup.position).add(_v1);
                    _v3.set(0, 0, 1).applyQuaternion(playerGroup.quaternion).normalize();

                    const cb = state.callbacks;
                    _continuousCtx.scene = scene;
                    _continuousCtx.enemies = state.enemies || [];
                    _continuousCtx.collisionGrid = state.collisionGrid;
                    _continuousCtx.spawnPart = cb?.spawnPart;
                    _continuousCtx.showDamageText = cb?.showDamageText || _NOOP_DAMAGE_TEXT;
                    _continuousCtx.spawnDecal = cb?.spawnDecal;
                    _continuousCtx.explodeEnemy = cb?.explodeEnemy;
                    _continuousCtx.trackStats = cb?.trackStats;
                    _continuousCtx.addScore = cb?.gainXp;
                    _continuousCtx.addFireZone = cb?.addFireZone;
                    _continuousCtx.now = simTime;
                    _continuousCtx.noiseEvents = state.noiseEvents;
                    _continuousCtx.makeNoise = cb.makeNoise;

                    _continuousCtx.applyDamage = state.applyDamage;

                    ProjectileSystem.handleContinuousFire(
                        state.activeWeapon, _v2, _v3, simDelta, _continuousCtx,
                        WeaponHandler.getScaledDamage(state.activeWeapon,
                            state.weaponLevels[state.activeWeapon]) * (60 * simDelta)
                    );
                } else {
                    if (state.activeWeapon === WeaponType.FLAMETHROWER && (state as any).lastFireState) {
                        soundManager.playFlamethrowerEnd();
                    }

                    if (input.fire && simTime > state.lastShotTime + 500) {
                        soundManager.playEmptyClick();
                        state.lastShotTime = simTime;
                    }
                }
            } else {
                if (state.activeWeapon === WeaponType.FLAMETHROWER && (state as any).lastFireState) {
                    soundManager.playFlamethrowerEnd();
                }
            }
            (state as any).lastFireState = !!input.fire;
            return;
        }

        // --- 2. PROJECTILE FIRING (Guns) ---
        if (wep.behavior === WeaponBehavior.PROJECTILE) {
            if (aimCrossMesh) aimCrossMesh.visible = false;
            if (trajectoryLineMesh) trajectoryLineMesh.visible = false;

            if (input.fire) {
                const isUnlimited = !!state.sectorState?.unlimitedAmmo;
                const hasAmmo = state.weaponAmmo[state.activeWeapon] > 0 || isUnlimited;
                const actualFireRate = (wep.fireRate || 0) / (state.multipliers.fireRate || 1.0);

                if (simTime > state.lastShotTime + actualFireRate && hasAmmo) {
                    state.lastShotTime = simTime;
                    if (!isUnlimited) state.weaponAmmo[state.activeWeapon]--;

                    const tracker = session.getSystem('damage_tracker_system') as any;
                    if (tracker) tracker.recordShot(session, state.activeWeapon);

                    _v1.set(0.3, 1.4, 0.4).applyQuaternion(playerGroup.quaternion);
                    _v2.copy(playerGroup.position).add(_v1);

                    soundManager.playShot(wep.name);
                    haptic.gunshot();

                    if (state.callbacks && state.callbacks.makeNoise) {
                        state.callbacks.makeNoise(_v2, NoiseType.GUNSHOT, NOISE_RADIUS.GUNSHOT);
                    }

                    const pellets = wep.name === WeaponType.SHOTGUN ? 8 : 1;
                    const spread = wep.name === WeaponType.SHOTGUN ? 0.15 : 0;

                    // Calculate total damage once (Zero-GC and faster)
                    const totalDamage = WeaponHandler.getScaledDamage(state.activeWeapon, state.weaponLevels[state.activeWeapon]);
                    const damagePerPellet = totalDamage / pellets;

                    for (let i = 0; i < pellets; i++) {
                        _v3.set(0, 0, 1).applyQuaternion(playerGroup.quaternion);

                        if (spread > 0) {
                            _v3.x += (Math.random() - 0.5) * spread;
                            _v3.y += (Math.random() - 0.5) * spread;
                            _v3.z += (Math.random() - 0.5) * spread;
                        }
                        _v3.normalize();

                        ProjectileSystem.launchBullet(scene, state.projectiles, _v2, _v3, wep.name, damagePerPellet);
                    }
                } else if (input.fire && (state.weaponAmmo[state.activeWeapon] || 0) <= 0 && simTime > state.lastShotTime + (wep.fireRate || 0)) {
                    state.lastShotTime = simTime;
                    if (state.sectorState.noReload) {
                        state.weaponAmmo[state.activeWeapon] = wep.magSize || 0;
                    } else {
                        soundManager.playEmptyClick();
                        state.isReloading = true;
                        state.reloadEndTime = simTime + (wep.reloadTime || 0);
                        soundManager.playMagOut();
                    }
                }
            }
            return;
        }

        // --- 3. THROWABLE CHARGING (Grenades / Molotovs) ---
        if (wep.behavior === WeaponBehavior.THROWABLE) {
            const canCharge = (state.weaponAmmo[state.activeWeapon] > 0) && simTime > (state.lastShotTime || 0) + 500;

            if (input.fire && canCharge) {
                if (state.throwChargeStart === 0) state.throwChargeStart = simTime;

                const chargeTime = 1250;
                const holdTime = 500; // [VINTERDÖD FIX] Hold at max for 500ms before reset
                const totalCycle = chargeTime + holdTime;

                const elapsed = simTime - state.throwChargeStart;
                const cycleElapsed = elapsed % totalCycle;
                const ratio = cycleElapsed < chargeTime ? (cycleElapsed / chargeTime) : 1.0;

                _v1.set(0, 0, 1).applyQuaternion(playerGroup.quaternion).normalize();

                const maxDist = (wep.range || 25.0) * (state.multipliers.range || 1.0);
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

                    const engine = WinterEngine.getInstance();
                    const water = engine?.water;

                    for (let i = 0; i <= 20; i++) {
                        const t = (i / 20) * tMax;
                        const tx = _v2.x + vx * t;
                        const tz = _v2.z + vz * t;
                        const ty = _v2.y + vy * t - 0.5 * g * t * t;

                        const instVy = vy - (g * t);

                        let groundY = 0.1;
                        if (water) {
                            water.checkBuoyancy(tx, 0.5, tz, renderTime);
                            if (_buoyancyResult.inWater) {
                                groundY = _buoyancyResult.waterLevel + 0.05;
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
                }

                // [VINTERDÖD FIX] Removed auto-throw at max strength. Charge cycles indefinitely while fire is held.

            } else if (state.throwChargeStart > 0) {
                // Calculate release ratio with same cycling logic
                const totalCycle = 1250 + 500;
                const cycleElapsed = (simTime - state.throwChargeStart) % totalCycle;
                const ratio = cycleElapsed < 1250 ? (cycleElapsed / 1250) : 1.0;

                _executeThrow(session, scene, playerGroup, state, loadout, simTime, wep, ratio, aimCrossMesh, trajectoryLineMesh);
            } else {
                if (aimCrossMesh) aimCrossMesh.visible = false;
                if (trajectoryLineMesh) trajectoryLineMesh.visible = false;
            }
        }
    },
};