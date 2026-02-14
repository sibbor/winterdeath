import * as THREE from 'three';
import { WeaponType, WeaponCategory, WeaponBehavior, WEAPONS } from '../../content/weapons';
import { ProjectileSystem } from '../weapons/ProjectileSystem';
import { soundManager } from '../../utils/sound';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _slotArray: WeaponType[] = [];

export const WeaponHandler = {
    // Handle switching weapons via 1-4 keys
    handleSlotSwitch: (state: any, loadout: any, key: string) => {
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
        }
    },

    // Handle weapon-related inputs (Scroll to switch, R to reload)
    handleInput: (input: any, state: any, loadout: any, now: number, disableInput: boolean) => {
        if (disableInput) return;

        // 1. Optimized Scroll Switching
        if (input.scrollDown || input.scrollUp) {
            _slotArray.length = 0;
            const potential = [loadout.primary, loadout.secondary, loadout.throwable, loadout.special, WeaponType.RADIO];

            for (let i = 0; i < potential.length; i++) {
                const s = potential[i];
                if (!s) continue; // Special might be undefined/null
                if (WEAPONS[s] && WEAPONS[s].category === WeaponCategory.THROWABLE && state.weaponAmmo[s] <= 0) continue;
                if (s === WeaponType.RADIO && state.familyFound) continue;
                _slotArray.push(s);
            }

            const currentIdx = _slotArray.indexOf(state.activeWeapon);
            if (currentIdx !== -1) {
                const step = input.scrollDown ? 1 : -1;
                const nextIdx = (currentIdx + step + _slotArray.length) % _slotArray.length;
                const nextWep = _slotArray[nextIdx];

                if (nextWep !== state.activeWeapon) {
                    state.activeWeapon = nextWep;
                    state.isReloading = false;
                    state.reloadEndTime = 0;
                    state.throwChargeStart = 0;
                    soundManager.playWeaponSwap();
                }
                input.scrollDown = input.scrollUp = false;
            }
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
    handleFiring: (scene: THREE.Scene, playerGroup: THREE.Group, input: any, state: any, delta: number, now: number, loadout: any, aimCrossMesh: THREE.Group | null, trajectoryLineMesh?: THREE.Mesh | null, debugMode: boolean = false) => {
        if (state.isRolling || state.isReloading) return;

        let wep = WEAPONS[state.activeWeapon];
        if (!wep) { state.activeWeapon = loadout.primary; wep = WEAPONS[state.activeWeapon]; }

        if (state.activeWeapon === WeaponType.RADIO) {
            state.throwChargeStart = 0;
            if (aimCrossMesh) aimCrossMesh.visible = false;
            if (trajectoryLineMesh) trajectoryLineMesh.visible = false;
            return;
        }

        // --- 1. CONTINUOUS FIRE (Flamethrower / Tesla) ---
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

                    // Calculate Origin/Direction
                    _v1.set(0.3, 1.4, 0.8).applyQuaternion(playerGroup.quaternion);
                    _v2.copy(playerGroup.position).add(_v1); // Origin
                    _v3.set(0, 0, 1).applyQuaternion(playerGroup.quaternion).normalize(); // Dir

                    // Sound Loop Management
                    if (state.activeWeapon === WeaponType.FLAMETHROWER) {
                        soundManager.playFlamethrowerStart();
                    }

                    // Construct Context (Mapping GameState to GameContext)
                    const ctx = {
                        scene: scene,
                        enemies: state.enemies || [],
                        collisionGrid: state.collisionGrid,
                        spawnPart: state.callbacks.spawnPart,
                        spawnFloatingText: state.callbacks.spawnFloatingText || ((x: number, y: number, z: number, t: string, c?: string) => { }),
                        spawnDecal: state.callbacks.spawnDecal,
                        explodeEnemy: state.callbacks.explodeEnemy,
                        trackStats: state.callbacks.trackStats,
                        addScore: state.callbacks.addScore,
                        addFireZone: state.callbacks.addFireZone,
                        now: now,
                        noiseEvents: state.noiseEvents
                    } as any;

                    // Hand off to ProjectileSystem
                    ProjectileSystem.handleContinuousFire(state.activeWeapon, _v2, _v3, delta, ctx);

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

                    if (state.noiseEvents) state.noiseEvents.push({ pos: _v2.clone(), radius: 60, time: now, active: true });

                    soundManager.playShot(wep.name);

                    const pellets = wep.name === WeaponType.SHOTGUN ? 8 : 1;
                    for (let i = 0; i < pellets; i++) {
                        _v3.set(0, 0, 1).applyQuaternion(playerGroup.quaternion).normalize();
                        ProjectileSystem.spawnBullet(scene, state.projectiles, _v2, _v3, wep.name);
                    }
                } else if (input.fire && state.weaponAmmo[state.activeWeapon] <= 0 && now > state.lastShotTime + 250) {
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
            if (input.fire) {
                if (state.weaponAmmo[state.activeWeapon] > 0 || debugMode) {
                    if (state.throwChargeStart === 0) state.throwChargeStart = now;
                    const ratio = Math.min(1, (now - state.throwChargeStart) / 1250);

                    _v1.set(0, 0, 1).applyQuaternion(playerGroup.quaternion).normalize();
                    const dist = Math.max(2, ratio * 25);

                    if (aimCrossMesh) {
                        aimCrossMesh.visible = true;
                        _v2.copy(_v1).multiplyScalar(dist);
                        aimCrossMesh.position.copy(playerGroup.position).add(_v2);
                        aimCrossMesh.position.y = 0.2;
                        aimCrossMesh.scale.setScalar(1 + ratio * 0.5);
                    }

                    if (trajectoryLineMesh) {
                        trajectoryLineMesh.visible = true;
                        const g = 30, tMax = 1.0, startY = playerGroup.position.y + 1.5;
                        const vx = (_v1.x * dist) / tMax, vz = (_v1.z * dist) / tMax;
                        const vy = (0 - startY + 0.5 * g * tMax * tMax) / tMax;

                        const posAttr = trajectoryLineMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
                        const width = 0.15; // Half-width
                        const up = new THREE.Vector3(0, 1, 0);
                        const forward = new THREE.Vector3();
                        const right = new THREE.Vector3();
                        const pCurrent = new THREE.Vector3();
                        const pNext = new THREE.Vector3();

                        for (let i = 0; i <= 20; i++) {
                            const t = (i / 20) * tMax;
                            pCurrent.set(
                                playerGroup.position.x + vx * t,
                                Math.max(0.1, startY + vy * t - 0.5 * g * t * t),
                                playerGroup.position.z + vz * t
                            );

                            // Calculate direction for ribbon expansion
                            if (i < 20) {
                                const tNext = ((i + 1) / 20) * tMax;
                                pNext.set(
                                    playerGroup.position.x + vx * tNext,
                                    Math.max(0.1, startY + vy * tNext - 0.5 * g * tNext * tNext),
                                    playerGroup.position.z + vz * tNext
                                );
                                forward.subVectors(pNext, pCurrent).normalize();
                            }
                            // Last point uses previous forward

                            right.crossVectors(forward, up).normalize().multiplyScalar(width);

                            // Set two vertices for this point (Triangle Strip)
                            // 2 * i and 2 * i + 1
                            posAttr.setXYZ(2 * i, pCurrent.x - right.x, pCurrent.y, pCurrent.z - right.z);
                            posAttr.setXYZ(2 * i + 1, pCurrent.x + right.x, pCurrent.y, pCurrent.z + right.z);
                        }
                        posAttr.needsUpdate = true;
                        (trajectoryLineMesh.material as THREE.MeshBasicMaterial).opacity = 0.4 + ratio * 0.6;
                    }
                }
            } else if (state.throwChargeStart > 0) {
                const ratio = Math.min(1, (now - state.throwChargeStart) / 1250);
                if (!debugMode) state.weaponAmmo[state.activeWeapon]--;
                state.throwablesThrown++;

                _v1.set(0, 0, 1).applyQuaternion(playerGroup.quaternion).normalize();
                _v2.copy(playerGroup.position).add(_v3.set(0, 1.5, 0));

                ProjectileSystem.spawnThrowable(scene, state.projectiles, _v2, _v1, state.activeWeapon, ratio);

                if (state.weaponAmmo[state.activeWeapon] <= 0 && !debugMode) state.activeWeapon = loadout.primary;

                state.throwChargeStart = 0;
                if (aimCrossMesh) aimCrossMesh.visible = false;
                if (trajectoryLineMesh) trajectoryLineMesh.visible = false;
            }
        }
    }
};