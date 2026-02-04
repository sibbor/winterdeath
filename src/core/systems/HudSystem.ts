
import * as THREE from 'three';
import { WEAPONS, BOSSES } from '../../content/constants';
import { WeaponType } from '../../types';

export const HudSystem = {
    getHudData: (
        state: any,
        playerPos: THREE.Vector3,
        familyMemberMesh: THREE.Object3D | null,
        input: any,
        now: number,
        props: any,
        distanceTraveled: number,
        camera: THREE.Camera
    ) => {
        let bossInfo = null;
        let activeBoss = null;
        const activeBossObj = state.enemies.find((e: any) => e.isBoss);

        if (activeBossObj) {
            activeBoss = activeBossObj;
            bossInfo = {
                active: true,
                name: activeBossObj.type === 'Boss' ? (BOSSES[props.currentMap]?.name || 'Unknown') : 'Boss',
                hp: activeBossObj.hp,
                maxHp: activeBossObj.maxHp
            };
        }

        let famSignal = 0;
        if (state.activeWeapon === WeaponType.RADIO && familyMemberMesh) {
            const dist = playerPos.distanceTo(familyMemberMesh.position);
            famSignal = Math.max(0, 1 - (dist / 200));
        }

        let fPos = null;
        if (familyMemberMesh) {
            fPos = { x: familyMemberMesh.position.x, z: familyMemberMesh.position.z };
        }
        let bPos = null;
        if (activeBoss) {
            bPos = { x: activeBoss.mesh.position.x, z: activeBoss.mesh.position.z };
        }

        const wep = WEAPONS[state.activeWeapon];
        const reloadProgress = state.isReloading
            ? 1 - ((state.reloadEndTime - now) / ((wep?.reloadTime || 1000) + (input.fire ? 1000 : 0)))
            : 0;

        // Calculate potential SP earned in this run
        let spEarned = (state.spFromLevelUp || 0) + (state.spFromCollectibles || 0);

        // 1. Family Found (if not previously rescued)
        if (state.familyFound && !props.familyAlreadyRescued) {
            spEarned++;
        }
        // 2. Boss Defeated (if not previously defeated)
        const bossKilled = (state.killsByType['Boss'] || 0) > 0;
        if (bossKilled && !props.bossPermanentlyDefeated) {
            spEarned++;
        }

        return {
            hp: state.hp,
            maxHp: state.maxHp,
            stamina: state.stamina,
            maxStamina: state.maxStamina,
            ammo: state.weaponAmmo[state.activeWeapon],
            magSize: (wep || {}).magSize || 0,
            score: state.score,
            scrap: state.collectedScrap,
            multiplier: 1,
            activeWeapon: state.activeWeapon,
            isReloading: state.isReloading,
            boss: bossInfo,
            bossSpawned: state.bossSpawned,
            bossDefeated: activeBoss && activeBoss.dead,
            familyFound: state.familyFound,
            familySignal: famSignal,
            level: state.level,
            currentXp: state.currentXp,
            nextLevelXp: state.nextLevelXp,
            throwableAmmo: state.weaponAmmo[props.loadout.throwable],
            reloadProgress: reloadProgress,
            playerPos: { x: playerPos.x, z: playerPos.z },
            familyPos: fPos,
            bossPos: bPos,
            distanceTraveled: Math.floor(distanceTraveled),
            kills: state.killsInRun,
            spEarned: spEarned,
            skillPoints: (props.stats.skillPoints || 0) + spEarned, // Total SP: base + session
            totalScrap: (props.stats.scrap || 0) + state.collectedScrap, // Total scrap: base + session
            debugInfo: {
                aim: input.aimVector ? { x: parseFloat(input.aimVector.x.toFixed(2)), y: parseFloat(input.aimVector.y.toFixed(2)) } : { x: 0, y: 0 },
                input: {
                    w: input.w ? 1 : 0,
                    a: input.a ? 1 : 0,
                    s: input.s ? 1 : 0,
                    d: input.d ? 1 : 0,
                    fire: input.fire ? 1 : 0,
                    reload: input.reload ? 1 : 0
                },
                cam: { x: parseFloat(camera.position.x.toFixed(1)), y: parseFloat(camera.position.y.toFixed(1)), z: parseFloat(camera.position.z.toFixed(1)) },
                camera: {
                    x: parseFloat(camera.position.x.toFixed(1)),
                    y: parseFloat(camera.position.y.toFixed(1)),
                    z: parseFloat(camera.position.z.toFixed(1)),
                    rotX: camera.rotation.x,
                    rotY: camera.rotation.y,
                    rotZ: camera.rotation.z,
                    fov: (camera as THREE.PerspectiveCamera).fov
                },
                modes: state.interactionType || 'Standard',
                enemies: state.enemies.length,
                objects: state.obstacles.length,
                drawCalls: 0, // Injected by GameSession
                coords: { x: playerPos.x, z: playerPos.z }
            }
        };
    }
};
