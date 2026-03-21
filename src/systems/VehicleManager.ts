import * as THREE from 'three';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { soundManager } from '../utils/SoundManager';
import { EnemyManager } from '../entities/enemies/EnemyManager';
import { EnemyDeathState } from '../entities/enemies/EnemyTypes';
import { VehicleDef } from '../content/vehicles';
import { FLASHLIGHT } from '../content/constants';

const HIT_COOLDOWN_MS = 350;
const SPEED_SQ_PUSH = 1.0;

const _toEnemy = new THREE.Vector3();
const _knockDir = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _dismountDir = new THREE.Vector3();

export const VehicleManager = {

    update: (session: GameSessionLogic, delta: number, now: number, playerGroup: THREE.Group) => {
        const state = session.state;
        const input = session.engine.input.state;

        // 1. Enter / Exit Logic
        const vehicle = state.activeVehicle;
        if (vehicle) {
            const def = vehicle.userData?.vehicleDef;
            if (def && input && state.vehicleEngineState === 'OFF') {
                if (!vehicle.userData.velocity) {
                    vehicle.userData.velocity = new THREE.Vector3();
                    vehicle.userData.angularVelocity = new THREE.Vector3();
                    vehicle.userData.suspY = 0;
                    vehicle.userData.suspVelY = 0;
                }
                const vel = vehicle.userData.velocity as THREE.Vector3;
                const angVel = vehicle.userData.angularVelocity as THREE.Vector3;
                VehicleManager.enterVehicle(playerGroup, vehicle, state, def, vel, angVel);
            }

            if (def && input && input.e && !state.eDepressed && state.vehicleEngineState !== 'OFF') {
                VehicleManager.exitVehicle(playerGroup, vehicle, state, def);
            }

            // 2. Collision Logic (OPTIMIZED)
            // Vi kollar BARA fysik/kollisioner på det fordon som spelaren faktiskt kör just nu!
            if (def && vehicle.userData.velocity && state.vehicleEngineState !== 'OFF') {
                const vel = vehicle.userData.velocity as THREE.Vector3;
                VehicleManager.handleEnemyCollisions(vehicle, vel, def, session, now);
                VehicleManager.handleObstacleCollisions(vehicle, vel, def, session);
            }
        }
    },

    enterVehicle: (
        playerGroup: THREE.Group,
        vehicle: THREE.Object3D,
        state: any,
        def: VehicleDef,
        vel: THREE.Vector3,
        angVel: THREE.Vector3
    ) => {
        state.vehicleEngineState = 'RUNNING';
        state.activeVehicleType = def.type;
        const category = def.category === 'BOAT' ? 'BOAT' : 'CAR';
        soundManager.playVehicleEnter(category);
        soundManager.playVehicleEngine(category);
        vel.set(0, 0, 0);
        angVel.set(0, 0, 0);

        // Hide player
        playerGroup.visible = false;

        // --- SPATIAL GRID OPTIMIZATION: REMOVE ON ENTER ---
        // Player is inside, so we don't need the grid to prompt "Press E to Enter" anymore.
        // We pass the position so the grid doesn't have to search all 4093 cells to remove it!
        if (state.collisionGrid) {
            // Find radius
            let r = vehicle.userData.interactionRadius || 4.0;
            const size = def.size;
            r = Math.max(r, Math.sqrt((size.x / 2) ** 2 + (size.z / 2) ** 2) + 2.0);

            // Removing an interactable is done by updateInteractable without adding it back if it's not needed,
            // but we don't have a direct `remove` in the grid yet. 
            // A simple hack without adding a method: We fake an update to move it far away, 
            // or even better, just leave it out of detection by turning off the flag:
            vehicle.userData.isInteractable = false;
        }


        // Attach headlight
        const headlight = playerGroup.getObjectByName(FLASHLIGHT.name) as THREE.SpotLight;
        if (headlight) {
            const lights = vehicle.userData.lights;
            let frontZ = 0;
            let lightY = 0;

            if (lights && lights.headlights && lights.headlights.meshes && lights.headlights.meshes.length > 0) {
                frontZ = lights.headlights.meshes[0].position.z;
                lightY = lights.headlights.meshes[0].position.y;
            } else {
                const box = new THREE.Box3().setFromObject(vehicle);
                frontZ = box.max.z;
                lightY = (box.max.y - box.min.y) * 0.4;
            }

            headlight.position.set(0, lightY, frontZ + 0.2);
            headlight.target.position.set(0, lightY, frontZ + 20);
            headlight.updateMatrix();

            let mountTarget = vehicle;
            if (vehicle.userData.chassis) {
                mountTarget = vehicle.userData.chassis;
            } else if (vehicle.children[0]?.userData?.chassis) {
                mountTarget = vehicle.children[0].userData.chassis;
            }

            mountTarget.add(headlight);
            if (headlight.target) mountTarget.add(headlight.target);

            if (state.flashlightOn) {
                headlight.intensity = FLASHLIGHT.intensity * 2;
                headlight.distance = FLASHLIGHT.distance * 2;
                headlight.angle = Math.PI / 4;
            }

            headlight.updateMatrixWorld(true);
            if (headlight.target) headlight.target.updateMatrixWorld(true);
        }
    },

    exitVehicle: (
        playerGroup: THREE.Group,
        vehicle: THREE.Object3D,
        state: any,
        def: VehicleDef
    ) => {
        state.eDepressed = true;
        state.activeVehicle = null;
        state.activeVehicleType = null;
        state.vehicleSpeed = 0;
        state.vehicleEngineState = 'OFF';

        soundManager.stopVehicleEngine();
        soundManager.playVehicleSkid(0);
        soundManager.playVehicleExit(def.category === 'BOAT' ? 'BOAT' : 'CAR');

        _dismountDir.set(def.dismountOffset.x, def.dismountOffset.y, def.dismountOffset.z)
            .applyQuaternion(vehicle.quaternion);
        playerGroup.position.add(_dismountDir);
        playerGroup.position.y = 0;

        playerGroup.visible = true;

        const headlight = vehicle.getObjectByName(FLASHLIGHT.name) as THREE.SpotLight;
        if (headlight) {
            playerGroup.add(headlight);
            headlight.position.set(FLASHLIGHT.position.x, FLASHLIGHT.position.y, FLASHLIGHT.position.z);

            if (headlight.target) {
                playerGroup.add(headlight.target);
                headlight.target.position.set(
                    FLASHLIGHT.targetPosition.x,
                    FLASHLIGHT.targetPosition.y,
                    FLASHLIGHT.targetPosition.z
                );
                headlight.target.updateMatrix();
            }

            if (state.flashlightOn) {
                headlight.intensity = FLASHLIGHT.intensity;
                headlight.distance = FLASHLIGHT.distance;
                headlight.angle = FLASHLIGHT.angle;
            }

            playerGroup.updateMatrix();
            playerGroup.updateMatrixWorld(true);
            headlight.updateMatrixWorld(true);
            if (headlight.target) headlight.target.updateMatrixWorld(true);
        }

        const lights = vehicle.userData.lights;
        if (lights?.brake?.fakeGlow) {
            lights.brake.fakeGlow.visible = false;
        }

        // --- SPATIAL GRID OPTIMIZATION: UPDATE ON EXIT ---
        if (state.collisionGrid) {
            // Player left the vehicle, it's now interactable again from the outside.
            // We don't know exactly where the vehicle was in the grid BEFORE the drive, 
            // but since we turned off `isInteractable`, we just turn it back on and push it to the grid!
            vehicle.userData.isInteractable = true;

            // To ensure it gets mapped to its NEW position, we add it back.
            // If it was still lingering in an old cell, it's fine, because detectInteraction 
            // checks distance dynamically anyway, but properly removing from old cell requires `oldPos`.
            // The cleanest Zero-GC approach: Just run the generic fallback update once upon exit.
            state.collisionGrid.updateInteractable(vehicle);
        }
    },

    handleEnemyCollisions: (
        vehicle: THREE.Object3D,
        vel: THREE.Vector3,
        def: VehicleDef,
        session: GameSessionLogic,
        now: number
    ) => {
        const speedSq = vel.lengthSq();
        if (speedSq < SPEED_SQ_PUSH) return;

        const state = session.state;
        const hitRadius = (def.size.x > def.size.z ? def.size.x : def.size.z) * 0.5 + 1.0;

        // --- SPATIAL GRID ENEMY LOOKUP ---
        const enemies = state.collisionGrid.getNearbyEnemies(vehicle.position, hitRadius);
        const eLen = enemies.length;

        for (let i = 0; i < eLen; i++) {
            const e = enemies[i];
            if (e.deathState !== EnemyDeathState.ALIVE) continue;

            _toEnemy.subVectors(e.mesh.position, vehicle.position);
            _toEnemy.y = 0;
            const distSq = _toEnemy.lengthSq();
            const collisionRad = (hitRadius * 0.7) + (e.widthScale || 1.0) * (e.originalScale || 1.0);

            if (distSq > collisionRad * collisionRad) continue;

            const lastHit = e.lastVehicleHit || 0;
            if (now - lastHit < HIT_COOLDOWN_MS) continue;
            e.lastVehicleHit = now;

            const speedMS = Math.sqrt(speedSq);

            _knockDir.copy(_toEnemy).normalize();
            if (_knockDir.lengthSq() < 0.01) {
                const elements = vehicle.matrixWorld.elements;
                _forward.set(elements[8], elements[9], elements[10]).normalize();
                _knockDir.copy(_forward);
            }

            if (typeof (EnemyManager as any).applyVehicleHit === 'function') {
                const isHeavyHit = (EnemyManager as any).applyVehicleHit(e, _knockDir, speedMS, def, state, session, now);
                if (isHeavyHit) {
                    vehicle.userData.suspVelY += 2.0;
                }
            }
        }
    },

    handleObstacleCollisions: (
        vehicle: THREE.Object3D,
        vel: THREE.Vector3,
        def: VehicleDef,
        session: GameSessionLogic,
    ) => {
        const state = session.state;
        const hitRadius = (def.size.x > def.size.z ? def.size.x : def.size.z) * 0.5;

        // --- SPATIAL GRID OBSTACLE LOOKUP ---
        const obstacles = state.collisionGrid.getNearbyObstacles(vehicle.position, hitRadius + 2.0);
        const oLen = obstacles.length;

        for (let i = 0; i < oLen; i++) {
            const obs = obstacles[i];
            if (obs.mesh === vehicle) continue;

            const obsPos = obs.position;
            _toEnemy.subVectors(vehicle.position, obsPos);
            _toEnemy.y = 0;
            const distSq = _toEnemy.lengthSq();
            const combinedRad = hitRadius + (obs.radius || 2.0);

            if (distSq < combinedRad * combinedRad && distSq > 0.01) {
                const dist = Math.sqrt(distSq);
                const overlap = combinedRad - dist;

                _toEnemy.normalize();
                vehicle.position.addScaledVector(_toEnemy, overlap * 0.6);

                const impactDot = vel.dot(_toEnemy);
                if (impactDot < 0) {
                    vel.addScaledVector(_toEnemy, -impactDot * 1.2);
                }

                vehicle.userData.suspVelY += impactDot < 0 ? -impactDot * 0.5 : impactDot * 0.5;
                vel.multiplyScalar(0.85);
            }
        }
    }
};