import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { FXSystem } from './FXSystem';
import { FXParticleType } from '../types/FXTypes';
import { VehicleSounds } from '../utils/audio/AudioLib';
import { audioEngine } from '../utils/audio/AudioEngine';
import { VehicleDef } from '../content/vehicles';
import { VehicleManager } from './VehicleManager';
import { _buoyancyResult } from './WaterSystem';
import { KMH_TO_MS } from '../content/constants';
import { VehicleState, VehicleNodes, VehicleTypes, VehicleDrivetrain, VehicleCategory } from '../entities/vehicles/VehicleTypes';

// --- PERFORMANCE SCRATCHPADS ---
const _v1 = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();

export class VehicleMovementSystem implements System {
    id = 'vehicle_movement';
    isFixedStep = true;

    constructor(private playerGroup: THREE.Group) {
    }

    update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        VehicleManager.update(session, this.playerGroup, delta, simTime, renderTime);

        const state = session.state;
        const input = session.engine.input.state;

        const interactables = state.sectorState.ctx.interactables;
        const len = interactables.length;
        for (let i = 0; i < len; i++) {
            const obj = interactables[i];
            const def = obj.userData.vehicleDef;
            if (def) {
                const isActive = (state.vehicle.active && state.vehicle.mesh === obj);

                this.handleVehiclePhysics(
                    obj,
                    this.playerGroup,
                    isActive ? input : null,
                    state,
                    delta,
                    session,
                    renderTime,
                    def
                );
            }
        }

        // Ensure engine sounds/state are reset if no vehicle is currently active
        const hasActiveVehicle = state.vehicle.active;
        if (!hasActiveVehicle && state.vehicle.engineState !== 'OFF') {
            state.vehicle.engineState = 'OFF';
            state.vehicle.speed = 0;
            state.vehicle.throttle = 0;

            const vState = state.vehicle as any as VehicleState; // Global active state
            if (vState) {
                if (vState.engineVoiceIdx !== -1) {
                    audioEngine.stopVoice(vState.engineVoiceIdx);
                    vState.engineVoiceIdx = -1;
                }
                if (vState.skidVoiceIdx !== -1) {
                    audioEngine.stopVoice(vState.skidVoiceIdx);
                    vState.skidVoiceIdx = -1;
                }
            }
        }
    }

    private handleVehiclePhysics(
        vehicle: THREE.Object3D,
        playerGroup: THREE.Group,
        input: any | null,
        state: any,
        delta: number,
        session: GameSessionLogic,
        renderTime: number,
        def: VehicleDef
    ) {
        // 1. O(1) Data Acquisition
        if (!vehicle.userData.state) vehicle.userData.state = VehicleTypes.createState();
        if (!vehicle.userData.nodes) vehicle.userData.nodes = VehicleManager.discoverNodes(vehicle);

        const vState = vehicle.userData.state as VehicleState;
        const vNodes = vehicle.userData.nodes as VehicleNodes;
        const isActive = (state.vehicle.active && state.vehicle.mesh === vehicle);

        const dt = delta > 0.1 ? 0.1 : delta;
        const fpsRatio = dt * 60;

        const vel = vState.velocity;
        const angVel = vState.angularVelocity;

        // --- COMPUTE FORWARD & RIGHT VECTORS ---
        const elements = vehicle.matrixWorld.elements;
        _right.set(elements[0], elements[1], elements[2]).normalize();
        _forward.set(elements[8], elements[9], elements[10]).normalize();

        // --- INPUT ---
        let throttle = 0;
        let steer = 0;
        let handbrake = false;

        if (input) {
            if (input.w) throttle += 1;
            if (input.s) throttle -= 1;
            if (input.a) steer -= 1;
            if (input.d) steer += 1;
            if (input.space) handbrake = true;

            if (input.joystickMove) throttle += input.joystickMove.y * -1;
            if (input.joystickAim) steer += input.joystickAim.x;

            if (def.category === VehicleCategory.BOAT && session.engine.water) {
                session.engine.water.checkBuoyancy(vehicle.position.x, vehicle.position.y, vehicle.position.z, renderTime);
                if (!_buoyancyResult.inWater || vehicle.position.y < _buoyancyResult.waterLevel - 2.0) {
                    if (throttle > 0.1 || throttle < -0.1) throttle = 0;
                }
            }
        }

        throttle = THREE.MathUtils.clamp(throttle, -1, 1);
        steer = THREE.MathUtils.clamp(steer, -1, 1);

        // --- SPEED DECOMPOSITION ---
        let forwardSpeed = vel.dot(_forward);
        let currentLatSpeed = vel.dot(_right);
        let absLatSpeed = Math.abs(currentLatSpeed);
        const maxSpeedMS = def.maxSpeed * KMH_TO_MS;

        // --- ACCELERATION / NORMAL BRAKING ---
        let isBraking = false;

        if (throttle !== 0) {
            if (throttle < 0 && forwardSpeed > 1.0) {
                const decel = def.brakeForce * (throttle * -1) * dt;
                vel.addScaledVector(_forward, -decel);
                isBraking = true;
            } else if (throttle > 0 && forwardSpeed < -1.0) {
                const decel = def.brakeForce * throttle * dt;
                vel.addScaledVector(_forward, decel);
                isBraking = true;
            } else {
                const maxReverseMS = maxSpeedMS * def.reverseSpeedFraction;
                const atLimit = throttle > 0 ? (forwardSpeed >= maxSpeedMS) : (forwardSpeed <= -maxReverseMS);

                if (!atLimit) {
                    let tractionMul = 1.0;
                    if (def.drivetrain === VehicleDrivetrain.FWD) {
                        const slip = absLatSpeed * 0.05;
                        tractionMul = 1.0 - Math.min(0.5, slip);
                    } else if (def.drivetrain === VehicleDrivetrain.AWD) {
                        const slip = absLatSpeed * 0.02;
                        tractionMul = 1.0 - Math.min(0.2, slip);
                    }
                    vel.addScaledVector(_forward, def.acceleration * throttle * tractionMul * dt);
                }
            }
        }

        if (handbrake) {
            isBraking = true;
            const handbrakeDecel = def.brakeForce * 0.6 * dt;
            if (forwardSpeed > 0.1) vel.addScaledVector(_forward, -handbrakeDecel);
            else if (forwardSpeed < -0.1) vel.addScaledVector(_forward, handbrakeDecel);
        }

        forwardSpeed = vel.dot(_forward);
        currentLatSpeed = vel.dot(_right);
        const speedSq = vel.lengthSq();
        const speed = speedSq > 0 ? Math.sqrt(speedSq) : 0;
        const isReversing = forwardSpeed < -0.5;

        // --- STEERING ---
        if (Math.abs(steer) > 0.1 && speedSq > 0.5) {
            const directionalSteer = isReversing ? -steer : steer;
            let speedFactor = speed < 6.0 ? (speed / 6.0) : (1.0 - (speed / Math.max(1, maxSpeedMS)) * 0.3);
            const turnMult = (handbrake && speed > 6.0) ? 1.5 : 1.0;
            angVel.y -= directionalSteer * def.turnSpeed * turnMult * speedFactor * dt;
        }

        // --- DRIVETRAIN DRIFT PHYSICS ---
        let latRetention = def.lateralFriction * def.friction;
        if (handbrake) {
            latRetention = 0.95;
        } else if (Math.abs(throttle) > 0.5 && speedSq > 20 && absLatSpeed > 2.0) {
            if (def.drivetrain === VehicleDrivetrain.RWD) latRetention = 0.96;
            else if (def.drivetrain === VehicleDrivetrain.AWD) latRetention = 0.92;
            else if (def.drivetrain === VehicleDrivetrain.FWD) latRetention *= 0.85;
        }

        const baseFriction = throttle !== 0 ? 0.998 : def.friction;
        const dampedFwd = forwardSpeed * Math.pow(baseFriction, fpsRatio);
        const dampedLat = currentLatSpeed * Math.pow(latRetention, fpsRatio);

        const savedVelY = vel.y;
        vel.copy(_forward).multiplyScalar(dampedFwd);
        vel.addScaledVector(_right, dampedLat);
        vel.y = savedVelY;

        angVel.multiplyScalar(Math.pow(0.85, fpsRatio));

        // Boat:
        const isBoat = def.category === VehicleCategory.BOAT;

        // --- SUSPENSION ---
        if (def.suspensionStiffness !== undefined && def.suspensionDamping !== undefined) {
            vState.suspVelY -= vState.suspY * def.suspensionStiffness * dt;
            vState.suspVelY *= (1.0 - def.suspensionDamping * dt);
            vState.suspY += vState.suspVelY * dt;

            // Boat bobbing (premium handle for stationary/slow boats)
            if (isBoat && speed < 10.0) {
                const bobIntensity = 0.04 * (1.0 - (speed / 10.0));
                vState.suspY += Math.sin(renderTime * 0.005) * bobIntensity;
            }

            vState.suspY = THREE.MathUtils.clamp(vState.suspY, -0.3, 0.3);
        } else {
            vState.suspY = 0;
            vState.suspVelY = 0;
        }

        // VISUAL SUSPENSION (Pitch & Roll)
        if (vNodes.chassis) {
            const chassis = vNodes.chassis;
            chassis.position.y = vState.suspY;

            const fwdAccel = (forwardSpeed - vState.prevFwdSpeed) / dt;
            vState.prevFwdSpeed = forwardSpeed;

            const targetPitch = THREE.MathUtils.clamp(fwdAccel * 0.003, -0.04, 0.04);
            const targetRoll = THREE.MathUtils.clamp(-currentLatSpeed * 0.015, -0.06, 0.06);

            chassis.rotation.x = THREE.MathUtils.lerp(chassis.rotation.x, targetPitch, dt * 8);
            chassis.rotation.z = THREE.MathUtils.lerp(chassis.rotation.z, targetRoll, dt * 8);
        }

        // --- APPLY TRANSFORMS ---
        vehicle.position.addScaledVector(vel, dt);
        vehicle.rotation.y += angVel.y * dt;
        vehicle.updateMatrixWorld(true);

        const obs = vehicle.userData.obstacleRef;
        if (obs && (speedSq > 0 || angVel.lengthSq() > 0.01)) {
            const grid = state.collisionGrid;
            if (grid && typeof grid.updateObstacle === 'function') {
                grid.updateObstacle(obs);
            }
        }

        // --- LIGHTING SYSTEM ---
        const isEngineOn = (input !== null && state.vehicle.engineState !== 'OFF');

        if (vNodes.headlights) {
            (vNodes.headlights.material as THREE.MeshStandardMaterial).emissiveIntensity = isEngineOn ? 5.0 : 0.0;
        }

        if (vNodes.brakeLights) {
            const brakeIntensity = isBraking ? 20.0 : (isEngineOn ? 2.0 : 0.0);
            const brakeColor = isBraking ? 0xff3333 : 0x660000;

            for (let i = 0; i < vNodes.brakeLights.length; i++) {
                const mat = vNodes.brakeLights[i].material as THREE.MeshStandardMaterial;
                mat.emissiveIntensity = brakeIntensity;
                mat.emissive.setHex(brakeColor);
            }

            if (vNodes.brakeGlow) {
                vNodes.brakeGlow.visible = isBraking;
            }
        }

        if (vNodes.sirenRed && vNodes.sirenBlue) {
            const matBlue = vNodes.sirenBlue.material as THREE.MeshStandardMaterial;
            const matRed = vNodes.sirenRed.material as THREE.MeshStandardMaterial;

            if (isEngineOn) {
                const blinkSpeed = 0.015;
                matBlue.emissiveIntensity = Math.sin(renderTime * blinkSpeed) > 0 ? 20.0 : 0.0;
                matRed.emissiveIntensity = Math.cos(renderTime * blinkSpeed) > 0 ? 20.0 : 0.0;
            } else {
                matBlue.emissiveIntensity = 0.0;
                matRed.emissiveIntensity = 0.0;
            }
        }

        // --- AUDIO & SMOKE FX ---
        if (input) {
            const speedRatio = speed / Math.max(1.0, maxSpeedMS);
            const normSpeed = Math.min(1.0, speedRatio);

            state.vehicle.speed = speed * 3.6;
            state.vehicle.throttle = throttle;
            state.vehicle.engineState = 'RUNNING';

            if (Number.isFinite(normSpeed)) {
                VehicleSounds.updateEngine(vState.engineVoiceIdx, normSpeed);
            }

            const isSkidding = absLatSpeed > 4.5 || (speedSq > 25 && Math.abs(angVel.y) > 0.8);

            if (!isBoat) {
                if (isSkidding) {
                    if (vState.skidVoiceIdx === -1) vState.skidVoiceIdx = VehicleSounds.startSkid();
                    VehicleSounds.updateSkid(vState.skidVoiceIdx, Math.min(1.0, absLatSpeed / 10.0));
                } else if (vState.skidVoiceIdx !== -1) {
                    audioEngine.stopVoice(vState.skidVoiceIdx);
                    vState.skidVoiceIdx = -1;
                }

                if (speedSq > 4.0) {
                    if (Math.random() < speedRatio * 0.3) {
                        _v1.copy(_forward).multiplyScalar(-def.size.z * 0.45);
                        FXSystem.spawnParticle(session.engine.scene, state.particles, vehicle.position.x + _v1.x, 0.2, vehicle.position.z + _v1.z, FXParticleType.SMOKE, 1, undefined, undefined, 0xaaaaaa, 0.4);
                    }
                    if (isSkidding && Math.random() < 0.6) {
                        _v1.copy(_forward).multiplyScalar(-def.size.z * 0.45);
                        _v1.addScaledVector(_right, currentLatSpeed > 0 ? -0.5 : 0.5);
                        FXSystem.spawnParticle(session.engine.scene, state.particles, vehicle.position.x + _v1.x, 0.2, vehicle.position.z + _v1.z, FXParticleType.LARGE_SMOKE, 1, undefined, undefined, 0xcccccc, 0.8 + Math.random() * 0.5);
                    }
                }
            } else {
                // Boat Wake Particles
                if (speedSq > 4.0 && Math.random() < 0.4) {
                    _v1.copy(_forward).multiplyScalar(-def.size.z * 0.35);
                    _v1.addScaledVector(_right, (Math.random() - 0.5) * 2.0);
                    FXSystem.spawnParticle(session.engine.scene, state.particles, vehicle.position.x + _v1.x, 0.1, vehicle.position.z + _v1.z, FXParticleType.SPLASH, 1, undefined, undefined, 0xffffff, 0.5 + Math.random() * 0.5);
                }
            }
        }

        // --- SYNC PLAYER TO VEHICLE ---
        if (isActive) {
            playerGroup.position.copy(vehicle.position);
            playerGroup.quaternion.copy(vehicle.quaternion);

            const chassisSuspY = vNodes.chassis?.position.y || 0;
            _v1.set(def.seatOffset.x, def.seatOffset.y + chassisSuspY, def.seatOffset.z);
            _v1.applyQuaternion(vehicle.quaternion);
            playerGroup.position.add(_v1);

            for (let i = 0; i < playerGroup.children.length; i++) {
                const child = playerGroup.children[i];
                if (child.rotation) child.rotation.y = 0;
            }
        }
    }

    clear() { }
}
