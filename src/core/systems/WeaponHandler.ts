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
        else if (key === '4') next = WeaponType.RADIO;

        if (!next || !WEAPONS[next]) return;

        // Restriction: Cannot switch to empty throwables
        if (WEAPONS[next].category === WeaponCategory.THROWABLE && (state.weaponAmmo[next] || 0) <= 0) {
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
            const potential = [loadout.primary, loadout.secondary, loadout.throwable, WeaponType.RADIO];

            for (let i = 0; i < potential.length; i++) {
                const s = potential[i];
                if (!s || !WEAPONS[s]) continue;
                if (WEAPONS[s].category === WeaponCategory.THROWABLE && state.weaponAmmo[s] <= 0) continue;
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
    handleFiring: (scene: THREE.Scene, playerGroup: THREE.Group, input: any, state: any, now: number, loadout: any, aimCrossMesh: THREE.Group | null, trajectoryLineMesh?: THREE.Line | null, debugMode: boolean = false) => {
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
                if (now > state.lastShotTime + wep.fireRate && hasAmmo) {
                    state.lastShotTime = now;
                    if (!debugMode) state.weaponAmmo[state.activeWeapon]--;

                    // Calculate Muzzle/Origin Position
                    _v1.set(0.3, 1.4, 0.8).applyQuaternion(playerGroup.quaternion);
                    _v2.copy(playerGroup.position).add(_v1);

                    // Forward direction
                    _v3.set(0, 0, 1).applyQuaternion(playerGroup.quaternion).normalize();

                    // Sound and visual particles
                    soundManager.playShot(wep.name);
                    const effectType = wep.name === WeaponType.FLAMETHROWER ? 'campfire_flame' : 'spark';

                    // Spawn stream particles
                    for (let i = 0; i < 3; i++) {
                        _v4.copy(_v3).multiplyScalar(wep.range * (0.3 + Math.random() * 0.7));
                        _v4.x += (Math.random() - 0.5) * wep.spread * 5;
                        _v4.z += (Math.random() - 0.5) * wep.spread * 5;
                        state.callbacks.spawnPart(_v2.x, _v2.y, _v2.z, effectType, 1, undefined, _v4);
                    }

                    // Cone-based Hit Detection
                    const nearby = state.collisionGrid.getNearbyEnemies(_v2, wep.range);
                    for (const e of nearby) {
                        if (e.deathState !== 'alive') continue;

                        _v4.subVectors(e.mesh.position, _v2);
                        const distSq = _v4.lengthSq();
                        if (distSq > wep.range * wep.range) continue;

                        _v5.copy(_v4).normalize();
                        const dot = _v3.dot(_v5);

                        // If enemy is within the weapon's firing cone (approx 30 degrees)
                        if (dot > 0.86) {
                            e.lastDamageType = wep.name;
                            e.hp -= wep.damage;
                            e.hitTime = now;
                            e.lastHitWasHighImpact = true;

                            // Apply Status Effects (Burning / Stun)
                            if (wep.statusEffect.type === 'burning') {
                                e.isBurning = true;
                                e.afterburnTimer = wep.statusEffect.duration;
                                e.burnTimer = 0.5;
                            } else if (wep.statusEffect.type === 'electrified') {
                                e.stunTimer = wep.statusEffect.duration;
                            }

                            state.callbacks.onDamageDealt(wep.damage);
                            state.callbacks.spawnPart(e.mesh.position.x, 1.5, e.mesh.position.z, 'blood', 1);
                        }
                    }
                }
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

                        const attr = trajectoryLineMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
                        for (let i = 0; i <= 20; i++) {
                            const t = (i / 20) * tMax;
                            attr.setXYZ(i, playerGroup.position.x + vx * t, Math.max(0.1, startY + vy * t - 0.5 * g * t * t), playerGroup.position.z + vz * t);
                        }
                        attr.needsUpdate = true;
                        (trajectoryLineMesh.material as THREE.LineBasicMaterial).opacity = 0.4 + ratio * 0.6;
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