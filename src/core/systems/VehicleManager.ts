import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { soundManager } from '../../utils/SoundManager';
import { EnemyManager } from '../EnemyManager';
import { EnemyDeathState } from '../../types/enemy';
import { VehicleDef } from '../../content/vehicles';
import { FLASHLIGHT } from '../../content/constants';

const HIT_COOLDOWN_MS = 350;
const SPEED_SQ_PUSH = 1.0;

const _v1 = new THREE.Vector3();
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
        }

        // 2. Collision Logic
        const interactables = state.sectorState?.ctx?.interactables;
        if (interactables) {
            const len = interactables.length;
            for (let i = 0; i < len; i++) {
                const obj = interactables[i];
                const def = obj.userData?.vehicleDef;
                if (def && obj.userData.velocity) {
                    const vel = obj.userData.velocity as THREE.Vector3;
                    VehicleManager.handleEnemyCollisions(obj, vel, def, session, now);
                    VehicleManager.handleObstacleCollisions(obj, vel, def, session);
                }
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
