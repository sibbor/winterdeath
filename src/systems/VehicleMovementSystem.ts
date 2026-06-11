import * as THREE from 'three';
import { System, SystemID } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { FXSystem } from './FXSystem';
import { FXParticleType } from '../types/FXTypes';
import { VehicleSounds } from '../utils/audio/AudioLib';
import { audioEngine } from '../utils/audio/AudioEngine';
import { VehicleDef } from '../content/vehicles';
import { MaterialType } from '../content/environment';
import { VehicleManager } from './VehicleManager';
import { _buoyancyResult } from './WaterSystem';
import { KMH_TO_MS } from '../content/constants';
import { VehicleState, VehicleNodes, VehicleTypes, VehicleDrivetrain, VehicleCategory, VehicleEngineState, VehicleID } from '../entities/vehicles/VehicleTypes';
import { InputAction } from '../core/engine/InputManager';
import { RuntimeStressHarness } from '../utils/debug/RuntimeStressHarness';

// --- PERFORMANCE SCRATCHPADS ---
const _v1 = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();

export class VehicleMovementSystem implements System {
    readonly systemId = SystemID.VEHICLE_MOVEMENT;
    id = 'vehicle_movement';
    isFixedStep = true;

    constructor(private playerGroup: THREE.Group) {
    }

    update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        // --- VINTERDÖD LIFECYCLE GUARD ---
        if (!session?.sectorCtx) return;

        VehicleManager.tick(session, this.playerGroup, delta, simTime, renderTime);

        const state = session.state;
        const input = session.engine.input.state;

        const interactables = session.sectorCtx.interactables;
        if (!interactables) return;

        const len = interactables.length;
        for (let i = 0; i < len; i++) {
            const obj = interactables[i];
            if (!obj) continue;

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
        if (!hasActiveVehicle && state.vehicle.engineState !== VehicleEngineState.OFF) {
            state.vehicle.engineState = VehicleEngineState.OFF;
            state.vehicle.speed = 0;
            state.vehicle.throttle = 0;

            const vState = state.vehicle as any as VehicleState;
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
        if (!vehicle.userData.state) vehicle.userData.state = VehicleTypes.createState();
        if (!vehicle.userData.nodes) vehicle.userData.nodes = VehicleManager.discoverNodes(vehicle);

        const vState = vehicle.userData.state as VehicleState;
        const vNodes = vehicle.userData.nodes as VehicleNodes;
        const isActive = (state.vehicle.active && state.vehicle.mesh === vehicle);

        const dt = delta > 0.1 ? 0.1 : delta;
        const fpsRatio = dt * 60;

        const vel = vState.velocity;
        const angVel = vState.angularVelocity;

        const elements = vehicle.matrixWorld.elements;
        _right.set(elements[0], elements[1], elements[2]).normalize();
        _forward.set(elements[8], elements[9], elements[10]).normalize();

        let throttle = 0;
        let steer = 0;
        let handbrake = false;

        if (input) {
            const acts = input.actions;
            if (acts[InputAction.UP]) throttle += 1;
            if (acts[InputAction.DOWN]) throttle -= 1;
            if (acts[InputAction.LEFT]) steer -= 1;
            if (acts[InputAction.RIGHT]) steer += 1;
            if (acts[InputAction.DODGE]) handbrake = true;

            if (input.joystickMove) throttle += input.joystickMove.y * -1;
            if (input.joystickAim) steer += input.joystickAim.x;

            if (def.category === VehicleCategory.BOAT && session.engine.ground) {
                // Route through GroundSystem SSoT (cache + Y-height + proximity gate).
                // _buoyancyResult is populated as a side-effect when near water.
                session.engine.ground.getGroundHeight(vehicle.position.x, vehicle.position.z, session, vehicle.position.y);
                if (!_buoyancyResult.inWater || vehicle.position.y < _buoyancyResult.waterLevel - 2.0) {
                    if (throttle > 0.1 || throttle < -0.1) throttle = 0;
                }
            } else if (session.engine.ground) {
                // Terrain Alignment for Land Vehicles — pass Y for airborne gate
                const groundY = session.engine.ground.getGroundHeight(vehicle.position.x, vehicle.position.z, session, vehicle.position.y);
                const targetY = groundY;

                // Simple gravity/ground snap
                if (vehicle.position.y > targetY + 0.1) {
                    vel.y -= 19.8 * dt; // Gravity
                } else {
                    vehicle.position.y = THREE.MathUtils.lerp(vehicle.position.y, targetY, 15 * dt);
                    vel.y = 0;
                }
            }
        }

        throttle = THREE.MathUtils.clamp(throttle, -1, 1);
        steer = THREE.MathUtils.clamp(steer, -1, 1);

        let forwardSpeed = vel.dot(_forward);
        let currentLatSpeed = vel.dot(_right);
        let absLatSpeed = Math.abs(currentLatSpeed);
        const maxSpeedMS = def.maxSpeed * KMH_TO_MS;

        let isBraking = false;
        if (throttle !== 0) {
            if (throttle < 0 && forwardSpeed > 1.0) {
                vel.addScaledVector(_forward, -def.brakeForce * (throttle * -1) * dt);
                isBraking = true;
            } else if (throttle > 0 && forwardSpeed < -1.0) {
                vel.addScaledVector(_forward, def.brakeForce * throttle * dt);
                isBraking = true;
            } else {
                const maxReverseMS = maxSpeedMS * def.reverseSpeedFraction;
                const atLimit = throttle > 0 ? (forwardSpeed >= maxSpeedMS) : (forwardSpeed <= -maxReverseMS);
                if (!atLimit) {
                    let tractionMul = 1.0;
                    if (def.drivetrain === VehicleDrivetrain.FWD) tractionMul = 1.0 - Math.min(0.5, absLatSpeed * 0.05);
                    else if (def.drivetrain === VehicleDrivetrain.AWD) tractionMul = 1.0 - Math.min(0.2, absLatSpeed * 0.02);
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
            if (def.category === VehicleCategory.BOAT && speed < 10.0) {
                vState.suspY += Math.sin(renderTime * 0.005) * 0.04 * (1.0 - (speed / 10.0));
            }
            vState.suspY = THREE.MathUtils.clamp(vState.suspY, -0.3, 0.3);
        }

        // VISUAL SUSPENSION (Pitch & Roll)
        if (vNodes.chassis) {
            const chassis = vNodes.chassis;
            chassis.position.y = vState.suspY;
            const fwdAccel = (forwardSpeed - vState.prevFwdSpeed) / dt;
            vState.prevFwdSpeed = forwardSpeed;
            chassis.rotation.x = THREE.MathUtils.lerp(chassis.rotation.x, THREE.MathUtils.clamp(fwdAccel * 0.003, -0.04, 0.04), dt * 8);
            chassis.rotation.z = THREE.MathUtils.lerp(chassis.rotation.z, THREE.MathUtils.clamp(-currentLatSpeed * 0.015, -0.06, 0.06), dt * 8);
        }

        vehicle.position.addScaledVector(vel, dt);

        // --- STRESS HARNESS: MONITOR PHASING ---
        RuntimeStressHarness.assertPhasing("Vehicle", vehicle.position.x, vehicle.position.z, vState.prevPos.x, vState.prevPos.z);
        vState.prevPos.copy(vehicle.position);
        vehicle.rotation.y += angVel.y * dt;
        vehicle.updateMatrixWorld(true);

        const obs = vehicle.userData.obstacleRef;
        if (speedSq > 0 || angVel.lengthSq() > 0.01) {
            if (obs) {
                session.systems.worldStreamer?.updateObstacle(obs);
            }
            // Update the vehicle's interactable logic cell in the spatial grid so it remains interactable at its new position!
            session.systems.worldStreamer?.updateInteractable(vehicle);
        }

        // --- LIGHTING SYSTEM ---
        const isEngineOn = (input !== null && state.vehicle.engineState !== VehicleEngineState.OFF);
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
        }
        if (vNodes.brakeGlow) vNodes.brakeGlow.visible = isBraking;

        if (vNodes.sirenRed && vNodes.sirenBlue) {
            const matBlue = vNodes.sirenBlue.material as THREE.MeshStandardMaterial;
            const matRed = vNodes.sirenRed.material as THREE.MeshStandardMaterial;
            if (isEngineOn) {
                matBlue.emissiveIntensity = Math.sin(renderTime * 0.015) > 0 ? 20.0 : 0.0;
                matRed.emissiveIntensity = Math.cos(renderTime * 0.015) > 0 ? 20.0 : 0.0;
            } else {
                matBlue.emissiveIntensity = 0; matRed.emissiveIntensity = 0;
            }
        }

        // --- HUD & AUDIO SYNC (Zero-GC Copy) ---
        if (isActive) {
            state.vehicle.speed = speed * 3.6;
            state.vehicle.throttle = throttle;
            state.vehicle.velocity.copy(vel);
            state.vehicle.angularVelocity.copy(angVel);

            // --- AUDIO & FX ---
            const speedRatio = speed / Math.max(1.0, maxSpeedMS);
            const normSpeed = Math.min(1.0, speedRatio);
            state.vehicle.engineState = VehicleEngineState.RUNNING;
            VehicleSounds.updateEngine(vState.engineVoiceIdx, normSpeed);

            const isSkidding = absLatSpeed > 4.5 || (speedSq > 25 && Math.abs(angVel.y) > 0.8);
            state.vehicle.isSkidding = isSkidding;
            if (def.category !== VehicleCategory.BOAT) {
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
                        const groundX = vehicle.position.x + _v1.x;
                        const groundZ = vehicle.position.z + _v1.z;
                        
                        const groundY = session.engine.ground?.getGroundHeight(groundX, groundZ, session, vehicle.position.y) || 0.1;
                        const groundMat = session.systems.worldStreamer?.getGroundMaterial(groundX, groundZ) || 0;
                        
                        let pType = FXParticleType.SMOKE;
                        let pColor = 0xaaaaaa;
                        
                        if (groundMat === MaterialType.SNOW || groundMat === MaterialType.NONE) {
                            pType = FXParticleType.SNOW_PUFF;
                            pColor = 0xffffff;
                        } else if (groundMat === MaterialType.DIRT || groundMat === MaterialType.WOOD) {
                            pColor = 0x886644;
                        }

                        FXSystem.spawnParticle(session.engine.scene, state.combat.particles, groundX, groundY + 0.1, groundZ, pType, 1, undefined, undefined, pColor, 0.4);
                    }
                }
            } else if (speedSq > 4.0 && Math.random() < 0.4) {
                _v1.copy(_forward).multiplyScalar(-def.size.z * 0.35);
                _v1.addScaledVector(_right, (Math.random() - 0.5) * 2.0);
                
                const splashY = session.engine.water?.getBuoyancyResult().waterLevel || 0.1;
                FXSystem.spawnParticle(session.engine.scene, state.combat.particles, vehicle.position.x + _v1.x, splashY + 0.05, vehicle.position.z + _v1.z, FXParticleType.SPLASH, 1, undefined, undefined, 0xffffff, 0.5 + Math.random() * 0.5);
            }

            // --- SYNC PLAYER TO VEHICLE ---
            playerGroup.position.copy(vehicle.position);
            playerGroup.quaternion.copy(vehicle.quaternion);
            const chassisSuspY = vNodes.chassis?.position.y || 0;
            _v1.set(def.seatOffset.x, def.seatOffset.y + chassisSuspY, def.seatOffset.z).applyQuaternion(vehicle.quaternion);
            playerGroup.position.add(_v1);
            for (let i = 0; i < playerGroup.children.length; i++) {
                const child = playerGroup.children[i];
                if (child.rotation) child.rotation.y = 0;
            }
        }
    }

    clear() { }
}
