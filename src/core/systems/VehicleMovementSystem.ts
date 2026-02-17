import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { soundManager } from '../../utils/sound';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();

export class VehicleMovementSystem implements System {
    id = 'vehicle_movement';

    constructor(private playerGroup: THREE.Group) { }

    update(session: GameSessionLogic, delta: number, now: number) {
        const state = session.state;
        const input = session.engine.input.state;

        if (state.activeVehicle) {
            this.handleVehicleControl(
                state.activeVehicle,
                this.playerGroup,
                input,
                state,
                delta,
                session,
                now
            );
        } else {
            // Ensure engine is off
            if (state.vehicleEngineState !== 'OFF') {
                state.vehicleEngineState = 'OFF';
                soundManager.stopVehicleEngine();
            }
        }
    }

    private handleVehicleControl(
        vehicle: THREE.Object3D,
        playerGroup: THREE.Group,
        input: any,
        state: any,
        delta: number,
        session: GameSessionLogic,
        now: number
    ) {
        const def = vehicle.userData.vehicleDef;
        if (!def) return;

        // Vehicle Data (Velocity/AngularVelocity stored in userData for persistence)
        if (!vehicle.userData.velocity) vehicle.userData.velocity = new THREE.Vector3();
        if (!vehicle.userData.angularVelocity) vehicle.userData.angularVelocity = new THREE.Vector3();

        const vel = vehicle.userData.velocity as THREE.Vector3;
        const angVel = vehicle.userData.angularVelocity as THREE.Vector3;

        // --- AUDIO ENGINE ---
        if (state.vehicleEngineState === 'OFF') {
            state.vehicleEngineState = 'RUNNING';
            state.activeVehicleType = def.type;
            soundManager.startVehicleEngine(def.type);
            soundManager.playVehicleEnter(def.type);
        }

        // Input
        let throttle = 0;
        let steer = 0;

        if (input.w) throttle += 1;
        if (input.s) throttle -= 1;

        // Inverted as per user request (A/D switched)
        if (input.a) steer -= 1;
        if (input.d) steer += 1;

        if (input.joystickMove) {
            throttle += input.joystickMove.y * -1;
            steer += input.joystickMove.x;
        }

        // Apply Forces
        const fwd = def.forward || { x: 0, y: 0, z: 1 };
        _v1.set(fwd.x, fwd.y, fwd.z).applyQuaternion(vehicle.quaternion);

        // Acceleration
        if (throttle !== 0) {
            const acc = def.acceleration * throttle * delta;
            vel.addScaledVector(_v1, acc);
        }

        // Steering (Torque)
        const speedSq = vel.lengthSq();
        if (Math.abs(steer) > 0.1) {
            // [VINTERDÖD] Invert steering when reversing
            // We check the direction of travel relative to the heading
            // vel.dot(_v1) > 0 means forward, < 0 means reverse
            const directionalSteer = (vel.dot(_v1) < -0.1) ? -steer : steer;
            angVel.y -= directionalSteer * def.turnSpeed * delta;
        }

        // Drag/Friction
        vel.multiplyScalar(def.friction);
        angVel.multiplyScalar(def.friction); // Rotational drag

        // Apply Velocity
        vehicle.position.addScaledVector(vel, delta);

        // Apply Rotation
        vehicle.rotation.y += angVel.y * delta;

        // --- AUDIO UPDATE ---
        const normSpeed = Math.min(1.0, vel.length() / (def.speed || 15));
        soundManager.updateVehicleEngine(normSpeed);

        // Skidding sound if turning sharply at speed
        if (speedSq > 25 && Math.abs(angVel.y) > 0.8) {
            soundManager.playVehicleSkid(0.5);
        } else {
            soundManager.playVehicleSkid(0);
        }

        // ------------------------
        // Sync Player to Vehicle
        // ------------------------
        playerGroup.position.copy(vehicle.position);
        playerGroup.quaternion.copy(vehicle.quaternion);

        // Force player mesh and flashlight to look forward relative to vehicle
        for (let i = 0; i < playerGroup.children.length; i++) {
            const child = playerGroup.children[i];

            // Reset character orientation (mesh/flashlight/laser sight etc.)
            if (child.rotation) {
                child.rotation.y = 0;
            }
        }

        // Offset player visually (sit in boat)
        playerGroup.position.y += 0.5;

        // ------------------------
        // Dismount
        // ------------------------
        if (input.e && !state.eDepressed) {
            state.eDepressed = true;
            state.activeVehicle = null;
            state.activeVehicleType = null;
            state.vehicleEngineState = 'OFF';
            soundManager.stopVehicleEngine();
            soundManager.playVehicleExit(def.type);

            // Dismount offset (Left side)
            _v1.set(4.0, 0, 0).applyQuaternion(vehicle.quaternion);
            playerGroup.position.add(_v1);
            playerGroup.position.y = 0;
        }
    }
}
