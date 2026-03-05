import * as THREE from 'three';
import { WeaponType, WeaponCategory, WeaponBehavior, WEAPONS } from '../../content/weapons';
import { ProjectileSystem } from '../weapons/ProjectileSystem';
import { soundManager } from '../../utils/sound';
import { haptic } from '../../utils/HapticManager';
import { WinterEngine } from '../engine/WinterEngine';
import { _buoyancyResult } from './WaterSystem';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);
const _slotArray: WeaponType[] = [];

// Reusable context object to prevent GC allocation during continuous fire
const _continuousCtx: any = {
    scene: null,
    enemies: null,
    collisionGrid: null,
    spawnPart: null,
    spawnFloatingText: null,
    spawnDecal: null,
    explodeEnemy: null,
    trackStats: null,
    addScore: null,
    addFireZone: null,
    now: 0,
    noiseEvents: null
};

export const WeaponHandler = {
    // Handle switching weapons via 1-4 keys
    handleSlotSwitch: (state: any, loadout: any, key: string) => {
        if (state.activeVehicle) return;
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
    handleInput: (input: any, state: any, loadout: any, now: number, disableInput: boolean) => {
        if (disableInput || state.activeVehicle) return;

        // 1. Optimized Scroll Switching (Zero-GC)
        if (input.scrollDown || input.scrollUp) {
            _slotArray.length = 0;
            let currentIdx = -1;

            // Manual checks avoid array allocation
            const checkSlot = (wepType: WeaponType | null | undefined) => {
                if (!wepType) return;
                if (WEAPONS[wepType] && WEAPONS[wepType].category === WeaponCategory.THROWABLE && state.weaponAmmo[wepType] <= 0) return;
                if (wepType === WeaponType.RADIO && state.familyFound) return;

                if (wepType === state.activeWeapon) {
                    currentIdx = _slotArray.length;
                }
                _slotArray.push(wepType);
            };

            checkSlot(loadout.primary);
            checkSlot(loadout.secondary);
            checkSlot(loadout.throwable);
            checkSlot(loadout.special);
            checkSlot(WeaponType.RADIO);

            if (currentIdx !== -1 && _slotArray.length > 1) {
                const step = input.scrollDown ? 1 : -1;
                const nextIdx = (currentIdx + step + _slotArray.length) % _slotArray.length;
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
        if (!wep) { state.activeWeapon = loadout.primary; wep = WEAPONS[state.activeWeapon]; }

        // 3. Reload Logic
        const isThrowable = wep.category === WeaponCategory.THROWABLE;
        const isRadio = state.activeWeapon === WeaponType.RADIO;

        if (input.r && !state.isReloading && !isThrowable && !isRadio && state.weaponAmmo[state.activeWeapon] < wep.magSize) {
            state.isReloading = true;
            state.reloadEndTime = now + wep.reloadTime;
            soundManager.playMagOut();
            haptic.reload();
        }

        if (state.isReloading && now > state.reloadEndTime) {
            state.isReloading = false;
            state.weaponAmmo[state.activeWeapon] = wep.magSize;
            soundManager.playMagIn();
        }
    },

    // Updates the reload progress bar above the player
    updateReloadBar: (reloadBar: { bg: THREE.Mesh, fg: THREE.Mesh } | null, state: any, playerPos: THREE.Vector3, cameraQuaternion: THREE.Quaternion, now: number) => {
        if (!reloadBar) return;

        if (state.isReloading) {
            const wep = WEAPONS[state.activeWeapon];
            const progress = Math.min(1, Math.max(0, 1 - ((state.reloadEndTime - now) / (wep.reloadTime || 1))));

            _v1.copy(playerPos);
            _v1.y += 2.5;

            reloadBar.bg.visible = reloadBar.fg.visible = true;
            reloadBar.bg.position.copy(_v1);
            reloadBar.fg.position.copy(_v1);
            reloadBar.bg.quaternion.copy(cameraQuaternion);
            reloadBar.fg.quaternion.copy(cameraQuaternion);

            reloadBar.fg.scale.set(progress, 1, 1);
            const offset = -0.75 + (progress * 0.75);
            _v2.set(offset, 0, 0.01).applyQuaternion(cameraQuaternion);
            reloadBar.fg.position.add(_v2);
        } else {
            reloadBar.bg.visible = reloadBar.fg.visible = false;
        }
    },

    // --- CORE FIRING LOGIC ---
    handleFiring: (scene: THREE.Scene, playerGroup: THREE.Group, input: any, state: any, delta: number, now: number, loadout: any, aimCrossMesh: THREE.Group | null, trajectoryLineMesh?: THREE.Mesh | null, debugMode: boolean = false, cameraAngle: number = 0, camera: THREE.Camera | null = null) => {
        if (state.activeVehicle) {
            return;
        }

        if (state.isRolling || state.isReloading) return;

        let wep = WEAPONS[state.activeWeapon];
        if (!wep) { state.activeWeapon = loadout.primary; wep = WEAPONS[state.activeWeapon]; }

        const laser = playerGroup.getObjectByName('laserSight');
        if (laser) {
            laser.visible = state.activeWeapon !== WeaponType.ARC_CANNON;
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
                const hasAmmo = state.weaponAmmo[state.activeWeapon] > 0 || debugMode;
                if (hasAmmo) {
                    if (!debugMode) {
                        if (now > state.lastShotTime + wep.fireRate) {
                            state.weaponAmmo[state.activeWeapon]--;
                            state.lastShotTime = now;
                        }
                    }

                    _v1.set(0.3, 1.4, 0.8).applyQuaternion(playerGroup.quaternion);
                    _v2.copy(playerGroup.position).add(_v1);
                    _v3.set(0, 0, 1).applyQuaternion(playerGroup.quaternion).normalize();

                    if (state.activeWeapon === WeaponType.FLAMETHROWER) {
                        soundManager.playFlamethrowerStart();
                    }

                    _continuousCtx.scene = scene;
                    _continuousCtx.enemies = state.enemies || [];
                    _continuousCtx.collisionGrid = state.collisionGrid;
                    _continuousCtx.spawnPart = state.callbacks.spawnPart;
                    _continuousCtx.spawnFloatingText = state.callbacks.spawnFloatingText || ((x: number, y: number, z: number, t: string, c?: string) => { });
                    _continuousCtx.spawnDecal = state.callbacks.spawnDecal;
                    _continuousCtx.explodeEnemy = state.callbacks.explodeEnemy;
                    _continuousCtx.trackStats = state.callbacks.trackStats;
                    _continuousCtx.addScore = state.callbacks.addScore;
                    _continuousCtx.addFireZone = state.callbacks.addFireZone;
                    _continuousCtx.now = now;
                    _continuousCtx.noiseEvents = state.noiseEvents;

                    ProjectileSystem.handleContinuousFire(state.activeWeapon, _v2, _v3, delta, _continuousCtx);

                } else {
                    if (state.activeWeapon === WeaponType.FLAMETHROWER) soundManager.playFlamethrowerEnd();
                    if (input.fire && now > state.lastShotTime + 500) {
                        soundManager.playEmptyClick();
                        state.lastShotTime = now;
                    }
                }
            } else {
                if (state.activeWeapon === WeaponType.FLAMETHROWER) soundManager.playFlamethrowerEnd();
            }
            return;
        }

        // --- 2. PROJECTILE FIRING (Guns) ---
        if (wep.behavior === WeaponBehavior.PROJECTILE) {
            if (aimCrossMesh) aimCrossMesh.visible = false;
            if (trajectoryLineMesh) trajectoryLineMesh.visible = false;

            if (input.fire) {
                const hasAmmo = state.weaponAmmo[state.activeWeapon] > 0 || debugMode;
                if (now > state.lastShotTime + wep.fireRate && hasAmmo) {
                    state.lastShotTime = now;
                    if (!debugMode) state.weaponAmmo[state.activeWeapon]--;
                    state.shotsFired++;

                    _v1.set(0.3, 1.4, 0.4).applyQuaternion(playerGroup.quaternion);
                    _v2.copy(playerGroup.position).add(_v1);

                    if (state.callbacks && state.callbacks.makeNoise) {
                        state.callbacks.makeNoise(_v2, 60, 'gunshot');
                    }

                    soundManager.playShot(wep.name);
                    haptic.gunshot();

                    const pellets = wep.name === WeaponType.SHOTGUN ? 8 : 1;
                    const spread = wep.name === WeaponType.SHOTGUN ? 0.15 : 0;

                    for (let i = 0; i < pellets; i++) {
                        _v3.set(0, 0, 1).applyQuaternion(playerGroup.quaternion);

                        if (spread > 0) {
                            _v3.x += (Math.random() - 0.5) * spread;
                            _v3.y += (Math.random() - 0.5) * spread;
                            _v3.z += (Math.random() - 0.5) * spread;
                            _v3.normalize();
                        } else {
                            _v3.normalize();
                        }

                        ProjectileSystem.spawnBullet(scene, state.projectiles, _v2, _v3, wep.name);
                    }
                } else if (input.fire && state.weaponAmmo[state.activeWeapon] <= 0 && now > state.lastShotTime + wep.fireRate) {
                    state.lastShotTime = now;
                    soundManager.playEmptyClick();
                    state.isReloading = true;
                    state.reloadEndTime = now + wep.reloadTime;
                    soundManager.playMagOut();
                }
            }
            return;
        }

        // --- 3. THROWABLE CHARGING (Grenades / Molotovs) ---
        if (wep.behavior === WeaponBehavior.THROWABLE) {

            // Helper function to force the throw and avoid code duplication.
            // Restored the exact _v3 target calculation logic from the original code!
            const executeThrow = (ratio: number) => {
                if (!debugMode) state.weaponAmmo[state.activeWeapon]--;
                state.throwablesThrown = (state.throwablesThrown || 0) + 1;

                _v1.set(0, 0, 1).applyQuaternion(playerGroup.quaternion).normalize();

                const maxDist = (wep as any).maxThrowDistance || 25.0;
                const dist = Math.max(2.0, ratio * maxDist);

                // Origin and exact Target calculation restored
                _v2.copy(playerGroup.position).add(_v4.set(0, 1.5, 0)); // Origin
                _v3.copy(playerGroup.position).addScaledVector(_v1, dist); // Target
                _v3.y = 0.1;

                const tMax = 1.0 + (dist / maxDist) * 0.5;

                // Provide exact target (_v3) and physics metrics (tMax) to the system
                ProjectileSystem.spawnThrowable(scene, state.projectiles, _v2, _v3, state.activeWeapon, tMax);

                if (state.weaponAmmo[state.activeWeapon] <= 0 && !debugMode) {
                    state.activeWeapon = loadout.primary;
                }

                state.throwChargeStart = 0;
                state.lastShotTime = now; // Add a small cooldown before the next throw can be charged

                if (aimCrossMesh) aimCrossMesh.visible = false;
                if (trajectoryLineMesh) trajectoryLineMesh.visible = false;
            };

            // We can only start charging if we have ammo, OR debugMode is on, 
            // AND we haven't thrown a grenade within the last 500ms.
            const canCharge = (state.weaponAmmo[state.activeWeapon] > 0 || debugMode) && now > (state.lastShotTime || 0) + 500;

            if (input.fire && canCharge) {
                if (state.throwChargeStart === 0) state.throwChargeStart = now;

                const chargeTime = 1250;
                const elapsed = now - state.throwChargeStart;

                // Cap the ratio at 1.0 (max distance) instead of continuous modulo loop
                const ratio = Math.min(1, elapsed / chargeTime);

                _v1.set(0, 0, 1).applyQuaternion(playerGroup.quaternion).normalize();

                const maxDist = (wep as any).maxThrowDistance || 25.0;
                const dist = Math.max(2.0, ratio * maxDist);

                // Origin and exact Target calculation for rendering
                _v2.copy(playerGroup.position).add(_v4.set(0, 1.5, 0));
                _v3.copy(playerGroup.position).addScaledVector(_v1, dist);
                _v3.y = 0.1;

                const tMax = 1.0 + (dist / maxDist) * 0.5;
                const g = 30;

                if (aimCrossMesh) {
                    aimCrossMesh.visible = true;
                    aimCrossMesh.position.copy(_v3);
                    aimCrossMesh.position.y = 0.2;

                    // Visual feedback pulse when fully charged
                    if (ratio >= 1.0) {
                        aimCrossMesh.scale.setScalar(1.5 + Math.sin(now * 0.01) * 0.1);
                    } else {
                        aimCrossMesh.scale.setScalar(1 + ratio * 0.5);
                    }
                }

                // Advanced Trajectory rendering restored with water buoyancy support
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
                            water.checkBuoyancy(tx, 0.5, tz);
                            if (_buoyancyResult.inWater) {
                                groundY = _buoyancyResult.waterLevel + 0.05;
                            }
                        }

                        _v4.set(tx, Math.max(groundY, ty), tz);
                        _v5.set(vx, instVy, vz).normalize();

                        // Uses _v1 as scratch to avoid overwriting _v3
                        _v1.crossVectors(_v5, _UP).normalize().multiplyScalar(width);

                        posAttr.setXYZ(2 * i, _v4.x - _v1.x, _v4.y, _v4.z - _v1.z);
                        posAttr.setXYZ(2 * i + 1, _v4.x + _v1.x, _v4.y, _v4.z + _v1.z);
                    }
                    posAttr.needsUpdate = true;
                    (trajectoryLineMesh.material as THREE.MeshBasicMaterial).opacity = 0.4 + ratio * 0.6;
                    (trajectoryLineMesh.material as THREE.MeshBasicMaterial).depthTest = false;
                }

                // Auto-throw logic: Force the throw if the button is held for 3.25 seconds
                if (elapsed >= chargeTime + 2000) {
                    executeThrow(1.0);
                }

            } else if (state.throwChargeStart > 0) {
                // The player released the mouse button before auto-throw was triggered
                const ratio = Math.min(1, (now - state.throwChargeStart) / 1250);
                executeThrow(ratio);
            } else {
                // Do nothing, ensure UI is hidden
                if (aimCrossMesh) aimCrossMesh.visible = false;
                if (trajectoryLineMesh) trajectoryLineMesh.visible = false;
            }
        }
    }
};