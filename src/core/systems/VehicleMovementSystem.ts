import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { FXSystem } from './FXSystem';
import { EnemyManager } from '../EnemyManager';
import { soundManager } from '../../utils/sound';
import { VehicleDef } from '../../content/vehicles';
import { MATERIALS } from '../../utils/assets';
import { _buoyancyResult } from './WaterSystem'; // [VINTERDÖD] Zero-GC import

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _toEnemy = new THREE.Vector3();
const _knockDir = new THREE.Vector3();
const _dismountDir = new THREE.Vector3();

// Collision damage cooldown per enemy (avoids dealing damage every frame)
const _hitCooldowns = new Map<string, number>();
const HIT_COOLDOWN_MS = 350;

// Minimum speed² thresholds for damage tiers
const SPEED_SQ_PUSH = 4.0;        // > 2 u/s — nudge
const SPEED_SQ_KNOCKBACK = 36.0;  // > 6 u/s — knockback
const SPEED_SQ_SPLATTER = 144.0;  // > 12 u/s — splatter (instant kill modifier)

export class VehicleMovementSystem implements System {
    id = 'vehicle_movement';

    constructor(private playerGroup: THREE.Group) { }

    update(session: GameSessionLogic, delta: number, now: number) {
        const state = session.state;
        const input = session.engine.input.state;

        // Update ALL vehicles in the sector (not just the active one)
        // This allows boats to be pushed even when the player is outside.
        const interactables = state.sectorState?.ctx?.interactables;
        if (interactables) {
            const len = interactables.length;
            for (let i = 0; i < len; i++) {
                const obj = interactables[i];
                if (obj.userData?.vehicleDef) {
                    const isActive = (state.activeVehicle === obj);
                    this.handleVehiclePhysics(
                        obj,
                        this.playerGroup,
                        isActive ? input : null, // Only pass input if active
                        state,
                        delta,
                        session,
                        now
                    );
                }
            }
        }

        // Ensure engine sounds/state are reset if no vehicle is active
        if (!state.activeVehicle) {
            if (state.vehicleEngineState !== 'OFF') {
                state.vehicleEngineState = 'OFF';
                state.vehicleSpeed = 0;
                soundManager.stopVehicleEngine();
            }
        }
    }

    private handleVehiclePhysics(
        vehicle: THREE.Object3D,
        playerGroup: THREE.Group,
        input: any | null, // null if NOT active
        state: any,
        delta: number,
        session: GameSessionLogic,
        now: number
    ) {
        const def: VehicleDef | undefined = vehicle.userData.vehicleDef;
        if (!def) return;

        delta = Math.min(delta, 0.1);

        if (!vehicle.userData.velocity) vehicle.userData.velocity = new THREE.Vector3();
        if (!vehicle.userData.angularVelocity) vehicle.userData.angularVelocity = new THREE.Vector3();
        if (vehicle.userData.suspY === undefined) vehicle.userData.suspY = 0;
        if (vehicle.userData.suspVelY === undefined) vehicle.userData.suspVelY = 0;

        const vel = vehicle.userData.velocity as THREE.Vector3;
        const angVel = vehicle.userData.angularVelocity as THREE.Vector3;

        // --- AUDIO ENGINE ---
        if (input && state.vehicleEngineState === 'OFF') {
            state.vehicleEngineState = 'RUNNING';
            state.activeVehicleType = def.type;
            soundManager.startVehicleEngine(def.category === 'BOAT' ? 'BOAT' : 'CAR');
            soundManager.playVehicleEnter(def.category === 'BOAT' ? 'BOAT' : 'CAR');
            // Reset velocity on entry to prevent leftover floating/physics velocity
            vel.set(0, 0, 0);
            angVel.set(0, 0, 0);
        }

        // --- COMPUTE FORWARD & RIGHT VECTORS ---
        _forward.set(0, 0, 1).applyQuaternion(vehicle.quaternion);
        _right.set(1, 0, 0).applyQuaternion(vehicle.quaternion);

        // --- INPUT ---
        let throttle = 0;
        let steer = 0;
        let handbrake = false;

        if (input) {
            // Keyboard Throttle
            if (input.w) throttle += 1;
            if (input.s) throttle -= 1;

            // Keyboard Steer (Inverted as per user preference / A/D switched)
            if (input.a) steer -= 1;
            if (input.d) steer += 1;

            if (input.space) handbrake = true;

            // Mobile Joystick support (Left = Throttle, Right = Steer)
            if (input.joystickMove) {
                throttle += input.joystickMove.y * -1;
            }
            if (input.joystickAim) {
                steer += input.joystickAim.x;
            }

            // Specialized logic for BOATS: engine only works in water
            if (def.category === 'BOAT') {
                if (session.engine.water) {
                    session.engine.water.checkBuoyancy(vehicle.position.x, vehicle.position.y, vehicle.position.z);
                    if (!_buoyancyResult.inWater || vehicle.position.y < _buoyancyResult.waterLevel - 0.5) {
                        // If not in water (or very stuck inside the ground), cut power
                        if (Math.abs(throttle) > 0.1) {
                            throttle = 0;
                        }
                    }
                }
            }
        }

        // Clamp to avoid "double-power" when using both keyboard and joystick
        throttle = Math.max(-1, Math.min(1, throttle));
        steer = Math.max(-1, Math.min(1, steer));

        // --- ACCELERATION / REVERSE ---
        if (throttle !== 0) {
            const maxSpd = throttle > 0 ? def.maxSpeed : def.maxSpeed * def.reverseSpeedFraction;
            const fwdSpeed = vel.dot(_forward);
            const atLimit = throttle > 0 ? (fwdSpeed >= maxSpd) : (fwdSpeed <= -maxSpd);

            if (!atLimit) {
                // Drivetrain traction scaling
                let tractionMul = 1.0;
                if (def.drivetrain === 'FWD') {
                    // FWD: loses traction at high lateral speed (understeer)
                    const latSpd = vel.dot(_right);
                    tractionMul = 1.0 - Math.min(0.5, Math.abs(latSpd) * 0.05);
                } else if (def.drivetrain === 'RWD') {
                    // RWD: full power but oversteer tendency (handled in lateral friction)
                    tractionMul = 1.0;
                }
                // AWD: neutral, full traction always

                const acc = def.acceleration * throttle * tractionMul * delta;
                vel.addScaledVector(_forward, acc);
            }
        }

        // --- HANDBRAKE ---
        if (handbrake) {
            const brakeDamp = 1.0 - (def.brakeForce * delta);
            vel.multiplyScalar(Math.max(0.0, brakeDamp));
            // Handbrake reduces lateral grip for donuts/drifts
            angVel.multiplyScalar(0.97);
        }

        // --- SPEED DECOMPOSITION ---
        const forwardSpeed = vel.dot(_forward);
        const lateralSpeed = vel.dot(_right);
        const speedSq = vel.lengthSq();
        const speed = Math.sqrt(speedSq);
        const isReversing = forwardSpeed < -0.5;

        // --- STEERING ---
        if (Math.abs(steer) > 0.1 && speedSq > 0.5) {
            // Invert steering when reversing
            const directionalSteer = isReversing ? -steer : steer;

            // Speed-dependent turning: sharper at low speed, wider at high speed
            const speedFactor = Math.min(1.0, 4.0 / (1.0 + speed));
            angVel.y -= directionalSteer * def.turnSpeed * speedFactor * delta;
        }

        // --- LATERAL FRICTION (Drift Physics) ---
        const fwdComponent = forwardSpeed;
        const latComponent = lateralSpeed;

        let effLatFriction = def.lateralFriction;
        if (handbrake) {
            effLatFriction *= 0.3;
        }
        if (def.drivetrain === 'RWD' && Math.abs(throttle) > 0.5 && speedSq > 16) {
            effLatFriction *= 0.85;
        }

        const dampedFwd = fwdComponent * def.friction;
        const dampedLat = latComponent * (1.0 - (1.0 - def.friction) * 1.0) * effLatFriction;

        vel.copy(_forward).multiplyScalar(dampedFwd);
        vel.addScaledVector(_right, dampedLat);

        angVel.multiplyScalar(handbrake ? 0.92 : 0.90);

        // --- SUSPENSION ---
        let suspY = vehicle.userData.suspY as number;
        let suspVelY = vehicle.userData.suspVelY as number;

        suspVelY -= suspY * def.suspensionStiffness * delta;
        suspVelY *= (1.0 - def.suspensionDamping * delta);
        suspY += suspVelY * delta;

        if (suspY > 0.3) { suspY = 0.3; suspVelY = 0; }
        if (suspY < -0.3) { suspY = -0.3; suspVelY = 0; }

        vehicle.userData.suspY = suspY;
        vehicle.userData.suspVelY = suspVelY;

        // --- APPLY VELOCITY ---
        vehicle.position.addScaledVector(vel, delta);

        // --- APPLY ROTATION ---
        vehicle.rotation.y += angVel.y * delta;

        // --- AUDIO & HUD UPDATE ---
        if (input) {
            const normSpeed = Math.min(1.0, speed / def.maxSpeed);
            state.vehicleSpeed = speed;
            soundManager.updateVehicleEngine(normSpeed);

            if (speedSq > 25 && Math.abs(angVel.y) > 0.8) {
                soundManager.playVehicleSkid(0.5);
            } else {
                soundManager.playVehicleSkid(0);
            }
        }

        // --- COLLISION ---
        this.handleEnemyCollisions(vehicle, vel, def, session, now);
        this.handleObstacleCollisions(vehicle, vel, def, session);

        // --- SYNC PLAYER TO VEHICLE ---
        if (input) {
            playerGroup.position.copy(vehicle.position);
            playerGroup.quaternion.copy(vehicle.quaternion);

            playerGroup.position.x += def.seatOffset.x;
            playerGroup.position.y += def.seatOffset.y + suspY;
            playerGroup.position.z += def.seatOffset.z;

            const childLen = playerGroup.children.length;
            for (let i = 0; i < childLen; i++) {
                const child = playerGroup.children[i];
                if (child.rotation) {
                    child.rotation.y = 0;
                }
            }

            // --- DISMOUNT ---
            if (input.e && !state.eDepressed) {
                state.eDepressed = true;
                state.activeVehicle = null;
                state.activeVehicleType = null;
                state.vehicleSpeed = 0;
                state.vehicleEngineState = 'OFF';
                soundManager.stopVehicleEngine();
                soundManager.playVehicleExit(def.category === 'BOAT' ? 'BOAT' : 'CAR');

                _dismountDir.set(def.dismountOffset.x, def.dismountOffset.y, def.dismountOffset.z)
                    .applyQuaternion(vehicle.quaternion);
                playerGroup.position.add(_dismountDir);
                playerGroup.position.y = 0;
            }
        }
    }

    private handleEnemyCollisions(
        vehicle: THREE.Object3D,
        vel: THREE.Vector3,
        def: VehicleDef,
        session: GameSessionLogic,
        now: number
    ) {
        const state = session.state;
        const speedSq = vel.lengthSq();
        if (speedSq < SPEED_SQ_PUSH) return;

        const scene = session.engine.scene;
        const hitRadius = Math.max(def.size.x, def.size.z) * 0.5 + 1.0;
        const enemies = state.collisionGrid.getNearbyEnemies(vehicle.position, hitRadius);
        const eLen = enemies.length;

        for (let i = 0; i < eLen; i++) {
            const e = enemies[i];
            if (e.deathState !== 'alive') continue;

            _toEnemy.subVectors(e.mesh.position, vehicle.position);
            _toEnemy.y = 0;
            const distSq = _toEnemy.lengthSq();
            const collisionRad = (hitRadius * 0.7) + (e.widthScale || 1.0) * (e.originalScale || 1.0);

            if (distSq > collisionRad * collisionRad) continue;

            const lastHit = _hitCooldowns.get(e.id) || 0;
            if (now - lastHit < HIT_COOLDOWN_MS) continue;
            _hitCooldowns.set(e.id, now);

            const speed = Math.sqrt(speedSq);
            const baseDamage = speed * def.mass * def.collisionDamageMultiplier * 0.01;

            _knockDir.copy(_toEnemy).normalize();
            if (_knockDir.lengthSq() < 0.01) _knockDir.copy(_forward);

            if (speedSq >= SPEED_SQ_SPLATTER) {
                e.hp = 0;
                e.lastDamageType = 'vehicle_splatter';
                e.deathState = 'exploded';
                e.dead = true;

                const forceDir = _knockDir.clone().multiplyScalar(speed * 2.0).setY(3.0);
                EnemyManager.explodeEnemy(e, forceDir, {
                    spawnPart: (x: number, y: number, z: number, t: string, c: number, m?: any, v?: any, col?: number, s?: number) =>
                        FXSystem.spawnPart(scene, state.particles, x, y, z, t, c, m, v, col, s),
                    spawnDecal: (x: number, z: number, s: number, mat?: any) =>
                        FXSystem.spawnDecal(scene, state.bloodDecals, x, z, s, mat),
                });

                state.cameraShake = Math.min(state.cameraShake + 0.4, 1.5);
                soundManager.playImpact('flesh');

            } else if (speedSq >= SPEED_SQ_KNOCKBACK) {
                e.hp -= baseDamage;
                e.lastDamageType = 'vehicle_ram';
                e.hitTime = now;

                const knockForce = def.ramKnockback * (speed / def.maxSpeed);
                _knockDir.multiplyScalar(knockForce).setY(2.0);
                e.knockbackVel.add(_knockDir);

                FXSystem.spawnPart(scene, state.particles, e.mesh.position.x, 1, e.mesh.position.z, 'blood', 20);
                FXSystem.spawnDecal(scene, state.bloodDecals, e.mesh.position.x, e.mesh.position.z,
                    1.0 + Math.random() * 1.5, MATERIALS.bloodDecal);

                state.cameraShake = Math.min(state.cameraShake + 0.2, 1.0);
                soundManager.playImpact('flesh');

                vehicle.userData.suspVelY += 3.0;

            } else {
                e.hp -= baseDamage * 0.3;
                e.lastDamageType = 'vehicle_push';

                _knockDir.multiplyScalar(def.ramKnockback * 0.3);
                e.knockbackVel.add(_knockDir);

                e.slowTimer = 0.5;
            }
        }
    }

    private handleObstacleCollisions(
        vehicle: THREE.Object3D,
        vel: THREE.Vector3,
        def: VehicleDef,
        session: GameSessionLogic,
    ) {
        const state = session.state;
        const hitRadius = Math.max(def.size.x, def.size.z) * 0.5;
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

                _toEnemy.normalize().multiplyScalar(overlap * 0.6);
                vehicle.position.add(_toEnemy);

                const impactDot = vel.dot(_toEnemy.normalize());
                if (impactDot < 0) {
                    vel.addScaledVector(_toEnemy, -impactDot * 1.2);
                }

                vehicle.userData.suspVelY += Math.abs(impactDot) * 0.5;
                vel.multiplyScalar(0.85);
            }
        }
    }

    cleanup() {
        _hitCooldowns.clear();
    }
}