
import * as THREE from 'three';
import { WeaponType, WeaponCategory } from '../../types';
import { WEAPONS } from '../../content/constants';
import { ProjectileSystem } from '../weapons/ProjectileSystem';
import { soundManager } from '../../utils/sound';

export const WeaponHandler = {
    // Handle specific key presses for slot switching (1-4)
    handleSlotSwitch: (
        state: any,
        loadout: any,
        key: string
    ) => {
        const slotMap: Record<string, WeaponType> = {
            '1': loadout.primary,
            '2': loadout.secondary,
            '3': loadout.throwable,
            '4': WeaponType.RADIO
        };

        const nextWeapon = slotMap[key];
        if (!nextWeapon) return;

        // Check if weapon exists in definitions
        const wepDef = WEAPONS[nextWeapon];
        if (!wepDef) return;

        // Condition: Throwable ammo check
        if (wepDef.category === WeaponCategory.THROWABLE) {
            // Allow switch even if empty, just can't fire later (unless debug)
            if ((state.weaponAmmo[nextWeapon] || 0) <= 0) {
                // Optional: Allow switching to empty throwable? 
                // Standard behavior usually allows equipping even if empty, but let's keep it restricted for "feel" unless debug.
                // However, Slot Switch logic doesn't know about debugMode here easily without passing it.
                // Let's assume standard behavior for switching: Block if empty.
                if ((state.weaponAmmo[nextWeapon] || 0) <= 0) {
                    soundManager.playUiClick();
                    return;
                }
            }
        }

        // Condition: Radio availability check
        if (nextWeapon === WeaponType.RADIO) {
            if (state.familyFound) {
                soundManager.playUiClick();
                return;
            }
        }

        // Perform Switch
        if (state.activeWeapon !== nextWeapon) {
            state.activeWeapon = nextWeapon;
            state.isReloading = false;
            state.reloadEndTime = 0;
            state.throwChargeStart = 0;
            soundManager.playWeaponSwap();
        }
    },

    // New function to handle input state changes (Switching/Reloading)
    handleInput: (
        input: any,
        state: any,
        loadout: any,
        now: number,
        disableInput: boolean
    ) => {
        if (disableInput) return;

        // 1. Scrolling / Switching
        if (input.scrollDown || input.scrollUp) {
            const getValidSlots = () => [loadout.primary, loadout.secondary, loadout.throwable, WeaponType.RADIO].filter(s => {
                if (!s || !WEAPONS[s]) return false;
                if (WEAPONS[s].category === WeaponCategory.THROWABLE && state.weaponAmmo[s] <= 0) return false;
                if (s === WeaponType.RADIO && state.familyFound) return false;
                return true;
            });

            const slots = getValidSlots();
            const currentIdx = slots.indexOf(state.activeWeapon);
            if (currentIdx !== -1) {
                const nextIdx = input.scrollDown ? (currentIdx + 1) % slots.length : (currentIdx - 1 + slots.length) % slots.length;
                const nextWep = slots[nextIdx];

                if (nextWep !== state.activeWeapon) {
                    state.activeWeapon = nextWep;
                    // Reset actions
                    state.isReloading = false;
                    state.reloadEndTime = 0;
                    state.throwChargeStart = 0;
                    soundManager.playWeaponSwap();
                }
                input.scrollDown = false;
                input.scrollUp = false;
            }
        }

        // 2. Fallback / Validation
        let wep = WEAPONS[state.activeWeapon];
        if (!wep) { state.activeWeapon = loadout.primary; wep = WEAPONS[state.activeWeapon]; }

        const isThrowable = wep.category === WeaponCategory.THROWABLE;
        const isRadio = state.activeWeapon === WeaponType.RADIO;

        // 3. Reloading
        if (input.r && !state.isReloading && !isThrowable && !isRadio && state.weaponAmmo[state.activeWeapon] < wep.magSize) {
            state.isReloading = true;
            state.reloadEndTime = now + wep.reloadTime;
            soundManager.playMagOut();
        }

        // 4. Reload Completion
        if (state.isReloading && now > state.reloadEndTime) {
            state.isReloading = false;
            state.weaponAmmo[state.activeWeapon] = wep.magSize;
            soundManager.playMagIn();
        }
    },

    updateReloadBar: (
        reloadBar: { bg: THREE.Mesh, fg: THREE.Mesh } | null,
        state: any,
        playerPos: THREE.Vector3,
        cameraQuaternion: THREE.Quaternion,
        now: number
    ) => {
        if (!reloadBar) return;

        if (state.isReloading) {
            const wep = WEAPONS[state.activeWeapon];
            const totalTime = wep.reloadTime;
            const remaining = state.reloadEndTime - now;
            const progress = Math.min(1, Math.max(0, 1 - (remaining / totalTime)));

            const barPos = playerPos.clone();
            barPos.y += 2.5; // Above head

            reloadBar.bg.visible = true;
            reloadBar.fg.visible = true;

            reloadBar.bg.position.copy(barPos);
            reloadBar.fg.position.copy(barPos);

            reloadBar.bg.quaternion.copy(cameraQuaternion);
            reloadBar.fg.quaternion.copy(cameraQuaternion);

            reloadBar.fg.scale.set(progress, 1, 1);

            const offset = -0.75 + (progress * 1.5 / 2);
            reloadBar.fg.position.add(new THREE.Vector3(offset, 0, 0.01).applyQuaternion(cameraQuaternion));
        } else {
            reloadBar.bg.visible = false;
            reloadBar.fg.visible = false;
        }
    },

    handleFiring: (
        scene: THREE.Scene,
        playerGroup: THREE.Group,
        input: any,
        state: any,
        now: number,
        loadout: any,
        aimCrossMesh: THREE.Group | null,
        trajectoryLineMesh?: THREE.Line | null,
        debugMode: boolean = false
    ) => {
        if (state.isRolling || state.isReloading) return;

        let wep = WEAPONS[state.activeWeapon];
        // Fallback safety
        if (!wep) {
            state.activeWeapon = loadout.primary;
            wep = WEAPONS[state.activeWeapon];
        }

        const isThrowable = wep.category === WeaponCategory.THROWABLE;
        const isRadio = state.activeWeapon === WeaponType.RADIO;

        // --- RADIO LOGIC ---
        if (isRadio) {
            state.throwChargeStart = 0;
            if (aimCrossMesh) aimCrossMesh.visible = false;
            if (trajectoryLineMesh) trajectoryLineMesh.visible = false;
            return;
        }

        // --- GUN LOGIC ---
        if (!isThrowable) {
            state.throwChargeStart = 0;
            if (aimCrossMesh) aimCrossMesh.visible = false;
            if (trajectoryLineMesh) trajectoryLineMesh.visible = false;

            if (input.fire) {
                const currentAmmo = state.weaponAmmo[state.activeWeapon];
                const hasAmmo = currentAmmo > 0 || debugMode;
                const canFire = now > state.lastShotTime + wep.fireRate && hasAmmo;

                if (canFire) {
                    state.lastShotTime = now;
                    if (!debugMode) state.weaponAmmo[state.activeWeapon]--;
                    state.shotsFired++;

                    // Origin: Offset from player center to approx gun barrel position
                    const origin = playerGroup.position.clone().add(
                        new THREE.Vector3(0.3, 1.4, 0.4).applyQuaternion(playerGroup.quaternion)
                    );

                    // Noise Emission (60m radius for guns)
                    if (state.noiseEvents) {
                        state.noiseEvents.push({ pos: origin.clone(), radius: 60, time: now });
                    }

                    // Play sound once
                    soundManager.playShot(wep.name);

                    // Shotgun Logic: Multiple pellets
                    const isShotgun = wep.name === WeaponType.SHOTGUN;
                    const pellets = isShotgun ? 8 : 1;

                    for (let i = 0; i < pellets; i++) {
                        // Direction with spread
                        const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(playerGroup.quaternion).normalize();
                        dir.x += (Math.random() - 0.5) * wep.spread;
                        dir.z += (Math.random() - 0.5) * wep.spread;
                        dir.normalize();

                        ProjectileSystem.spawnBullet(scene, state.projectiles, origin, dir, wep.name, wep.baseDamage);
                    }

                } else if (input.fire && !state.isReloading && state.weaponAmmo[state.activeWeapon] <= 0) {
                    // Empty Click feedback
                    if (now > state.lastShotTime + 250) {
                        state.lastShotTime = now;
                        soundManager.playEmptyClick();
                    }

                    // Auto Reload (only if actually empty and just tried to fire)
                    state.isReloading = true;
                    state.reloadEndTime = now + wep.reloadTime;
                    soundManager.playMagOut();
                }
            }
            return;
        }

        // --- THROWABLE LOGIC ---
        if (isThrowable) {
            if (input.fire) {
                if (state.weaponAmmo[state.activeWeapon] > 0 || debugMode) {
                    // Charging
                    if (state.throwChargeStart === 0) state.throwChargeStart = now;

                    const ratio = Math.min(1, (now - state.throwChargeStart) / 1250);
                    const aimDir = new THREE.Vector3(0, 0, 1).applyQuaternion(playerGroup.quaternion).normalize();
                    const origin = playerGroup.position.clone().add(new THREE.Vector3(0, 1.5, 0));
                    const maxDist = 25;
                    const throwDist = Math.max(2, ratio * maxDist);

                    // Update Aim Cross
                    if (aimCrossMesh) {
                        aimCrossMesh.visible = true;
                        const targetPos = playerGroup.position.clone().add(aimDir.clone().multiplyScalar(throwDist));
                        aimCrossMesh.position.set(targetPos.x, 0.2, targetPos.z);
                        aimCrossMesh.scale.setScalar(1 + ratio * 0.5);
                    }

                    // Update Trajectory Line
                    if (trajectoryLineMesh) {
                        trajectoryLineMesh.visible = true;
                        const points: THREE.Vector3[] = [];
                        const gravity = 30;
                        const timeToTarget = 1.0; // Assume 1s fuse/time for arc viz
                        const vx = (aimDir.x * throwDist) / timeToTarget;
                        const vz = (aimDir.z * throwDist) / timeToTarget;
                        const vy = (0 - origin.y + 0.5 * gravity * timeToTarget * timeToTarget) / timeToTarget;

                        const segments = 20;
                        for (let i = 0; i <= segments; i++) {
                            const t = (i / segments) * timeToTarget;
                            const px = origin.x + vx * t;
                            const pz = origin.z + vz * t;
                            const py = Math.max(0.1, origin.y + vy * t - 0.5 * gravity * t * t);
                            points.push(new THREE.Vector3(px, py, pz));
                        }
                        trajectoryLineMesh.geometry.setFromPoints(points);
                        (trajectoryLineMesh.material as THREE.LineBasicMaterial).opacity = 0.4 + ratio * 0.6;
                    }
                }
            } else {
                // Release / Throw
                if (state.throwChargeStart > 0 && (state.weaponAmmo[state.activeWeapon] > 0 || debugMode)) {
                    if (!debugMode) state.weaponAmmo[state.activeWeapon]--;
                    state.throwablesThrown++;

                    const ratio = Math.min(1, (now - state.throwChargeStart) / 1250);
                    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(playerGroup.quaternion).normalize();
                    const origin = playerGroup.position.clone().add(new THREE.Vector3(0, 1.5, 0));

                    ProjectileSystem.spawnThrowable(scene, state.projectiles, origin, dir, state.activeWeapon, ratio);

                    // Auto switch back to primary if empty (Skip in debug mode)
                    if (state.weaponAmmo[state.activeWeapon] <= 0 && !debugMode) {
                        state.activeWeapon = loadout.primary;
                    }

                    state.throwChargeStart = 0;
                    if (aimCrossMesh) aimCrossMesh.visible = false;
                    if (trajectoryLineMesh) trajectoryLineMesh.visible = false;
                } else {
                    // Cancel/Reset
                    state.throwChargeStart = 0;
                    if (aimCrossMesh) aimCrossMesh.visible = false;
                    if (trajectoryLineMesh) trajectoryLineMesh.visible = false;
                }
            }
        }
    }
};
