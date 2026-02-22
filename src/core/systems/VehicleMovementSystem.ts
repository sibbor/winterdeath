import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { FXSystem } from './FXSystem';
import { EnemyManager } from '../EnemyManager';
import { soundManager } from '../../utils/sound';
import { VehicleDef } from '../../content/vehicles';
import { MATERIALS } from '../../utils/assets';
import { _buoyancyResult } from './WaterSystem';

// --- PERFORMANCE SCRATCHPADS ---
const _v1 = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _toEnemy = new THREE.Vector3();
const _knockDir = new THREE.Vector3();
const _dismountDir = new THREE.Vector3();

// Constants
const HIT_COOLDOWN_MS = 350;
const SPEED_SQ_PUSH = 4.0;
const SPEED_SQ_KNOCKBACK = 36.0;
const SPEED_SQ_SPLATTER = 144.0;
const KMH_TO_MS = 1.0 / 3.6; // Multiplication is faster than division

export class VehicleMovementSystem implements System {
    id = 'vehicle_movement';

    constructor(private playerGroup: THREE.Group) { }

    update(session: GameSessionLogic, delta: number, now: number) {
        const state = session.state;
        const input = session.engine.input.state;

        const interactables = state.sectorState?.ctx?.interactables;
        if (interactables) {
            const len = interactables.length;
            for (let i = 0; i < len; i++) {
                const obj = interactables[i];
                // Direct property access check
                const def = obj.userData?.vehicleDef;
                if (def) {
                    const isActive = (state.activeVehicle === obj);
                    this.handleVehiclePhysics(
                        obj,
                        this.playerGroup,
                        isActive ? input : null,
                        state,
                        delta,
                        session,
                        now,
                        def
                    );
                }
            }
        }

        // Ensure engine sounds/state are reset if no vehicle is active
        if (!state.activeVehicle && state.vehicleEngineState !== 'OFF') {
            state.vehicleEngineState = 'OFF';
            state.vehicleSpeed = 0;
            soundManager.stopVehicleEngine();
        }
    }

    private handleVehiclePhysics(
        vehicle: THREE.Object3D,
        playerGroup: THREE.Group,
        input: any | null,
        state: any,
        delta: number,
        session: GameSessionLogic,
        now: number,
        def: VehicleDef
    ) {
        // Clamp delta to prevent physics explosions on lag spikes
        const dt = delta > 0.1 ? 0.1 : delta;
        const fpsRatio = dt * 60; // Cached for friction calculations

        const ud = vehicle.userData;
        if (!ud.velocity) {
            ud.velocity = new THREE.Vector3();
            ud.angularVelocity = new THREE.Vector3();
            ud.suspY = 0;
            ud.suspVelY = 0;
        }

        const vel = ud.velocity as THREE.Vector3;
        const angVel = ud.angularVelocity as THREE.Vector3;

        // --- AUDIO ENGINE ---
        if (input && state.vehicleEngineState === 'OFF') {
            state.vehicleEngineState = 'RUNNING';
            state.activeVehicleType = def.type;
            const category = def.category === 'BOAT' ? 'BOAT' : 'CAR';
            soundManager.playVehicleEnter(category);
            soundManager.playVehicleEngine(category);
            vel.set(0, 0, 0);
            angVel.set(0, 0, 0);
        }

        // --- COMPUTE FORWARD & RIGHT VECTORS (Matrix Extraction) ---
        // Faster than applyQuaternion. Extracted from the object's world matrix.
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

            if (def.category === 'BOAT' && session.engine.water) {
                session.engine.water.checkBuoyancy(vehicle.position.x, vehicle.position.y, vehicle.position.z);
                if (!_buoyancyResult.inWater || vehicle.position.y < _buoyancyResult.waterLevel - 2.0) {
                    if (throttle > 0.1 || throttle < -0.1) throttle = 0;
                }
            }
        }

        // Fast clamping without Math.max/min
        throttle = throttle > 1 ? 1 : (throttle < -1 ? -1 : throttle);
        steer = steer > 1 ? 1 : (steer < -1 ? -1 : steer);

        // --- ACCELERATION / REVERSE / BRAKING ---
        const forwardSpeed = vel.dot(_forward);
        const maxSpeedMS = def.maxSpeed * KMH_TO_MS;

        if (throttle !== 0) {
            if (throttle < 0 && forwardSpeed > 1.0) {
                const decel = def.brakeForce * (throttle * -1) * dt;
                vel.addScaledVector(_forward, -decel);
            } else if (throttle > 0 && forwardSpeed < -1.0) {
                const decel = def.brakeForce * throttle * dt;
                vel.addScaledVector(_forward, decel);
            } else {
                const maxReverseMS = maxSpeedMS * def.reverseSpeedFraction;
                const atLimit = throttle > 0 ? (forwardSpeed >= maxSpeedMS) : (forwardSpeed <= -maxReverseMS);

                if (!atLimit) {
                    let tractionMul = 1.0;
                    if (def.drivetrain === 'FWD') {
                        const latSpd = vel.dot(_right);
                        const slip = (latSpd < 0 ? -latSpd : latSpd) * 0.05;
                        tractionMul = 1.0 - (slip > 0.5 ? 0.5 : slip);
                    }
                    vel.addScaledVector(_forward, def.acceleration * throttle * tractionMul * dt);
                }
            }
        }

        // --- HANDBRAKE ---
        if (handbrake) {
            const brakeBase = 1.0 - (def.brakeForce * 0.1);
            const brakeDamp = Math.pow(brakeBase > 0.01 ? brakeBase : 0.01, fpsRatio);
            vel.multiplyScalar(brakeDamp > 0 ? brakeDamp : 0);
            angVel.multiplyScalar(Math.pow(0.97, fpsRatio));
        }

        // --- SPEED DECOMPOSITION ---
        const speedSq = vel.lengthSq();
        const speed = speedSq > 0 ? Math.sqrt(speedSq) : 0;
        const isReversing = forwardSpeed < -0.5;

        // --- STEERING ---
        if ((steer > 0.1 || steer < -0.1) && speedSq > 1.0) {
            const directionalSteer = isReversing ? -steer : steer;
            const lowSpeedFactor = speed * 0.1; // speed / 10.0
            const highSpeedFactor = 4.0 / (1.0 + speed);
            const speedFactor = lowSpeedFactor < highSpeedFactor ? lowSpeedFactor : highSpeedFactor;

            angVel.y -= directionalSteer * def.turnSpeed * speedFactor * dt;
        }

        // --- LATERAL FRICTION (Drift Physics) ---
        let effLatFriction = def.lateralFriction;
        if (handbrake) effLatFriction *= 0.3;
        if (def.drivetrain === 'RWD' && (throttle > 0.5 || throttle < -0.5) && speedSq > 16) {
            effLatFriction *= 0.85;
        }

        const currentLatSpeed = vel.dot(_right);
        const baseFriction = throttle !== 0 ? 0.998 : def.friction;

        const dampedFwd = vel.dot(_forward) * Math.pow(baseFriction, fpsRatio);
        const latDamping = effLatFriction * def.friction; // Simplified approximation
        const dampedLat = currentLatSpeed * Math.pow(latDamping, fpsRatio);

        const savedVelY = vel.y;
        vel.copy(_forward).multiplyScalar(dampedFwd);
        vel.addScaledVector(_right, dampedLat);
        vel.y = savedVelY;

        angVel.multiplyScalar(Math.pow(handbrake ? 0.92 : 0.90, fpsRatio));

        // --- SUSPENSION ---
        let suspY = 0;
        let suspVelY = 0;

        if (def.suspensionStiffness !== undefined && def.suspensionDamping !== undefined) {
            suspY = ud.suspY as number;
            suspVelY = ud.suspVelY as number;

            suspVelY -= suspY * def.suspensionStiffness * dt;
            suspVelY *= (1.0 - def.suspensionDamping * dt);
            suspY += suspVelY * dt;

            if (suspY > 0.3) { suspY = 0.3; suspVelY = 0; }
            else if (suspY < -0.3) { suspY = -0.3; suspVelY = 0; }

            ud.suspY = suspY;
            ud.suspVelY = suspVelY;
        } else {
            ud.suspY = 0;
            ud.suspVelY = 0;
        }

        // --- APPLY TRANSFORMS ---
        vehicle.position.addScaledVector(vel, dt);
        vehicle.rotation.y += angVel.y * dt;

        // --- AUDIO & HUD UPDATE ---
        if (input) {
            const speedRatio = speed / (maxSpeedMS > 1.0 ? maxSpeedMS : 1.0);
            const normSpeed = speedRatio < 1.0 ? speedRatio : 1.0;

            state.vehicleSpeed = speed;
            state.vehicleThrottle = throttle;

            if (Number.isFinite(normSpeed)) {
                soundManager.updateVehicleEngine(normSpeed);
            }

            // Skidding logic (Only cars/trucks, NOT boats)
            const latSpeed = currentLatSpeed < 0 ? -currentLatSpeed : currentLatSpeed;
            const isSkidding = latSpeed > 4.5 || (speedSq > 25 && (angVel.y > 0.8 || angVel.y < -0.8));

            if (def.category !== 'BOAT' && isSkidding) {
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
        const speedSq = vel.lengthSq();
        if (speedSq < SPEED_SQ_PUSH) return;

        const state = session.state;
        const scene = session.engine.scene;
        const hitRadius = (def.size.x > def.size.z ? def.size.x : def.size.z) * 0.5 + 1.0;

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

            // Zero-GC Cooldown stored directly on object
            const lastHit = e.lastVehicleHit || 0;
            if (now - lastHit < HIT_COOLDOWN_MS) continue;
            e.lastVehicleHit = now;

            const speed = Math.sqrt(speedSq);
            const maxSpeedMS = def.maxSpeed * KMH_TO_MS;
            const baseDamage = speed * def.mass * def.collisionDamageMultiplier * 0.01;

            const speedRatio = speed / (maxSpeedMS > 1 ? maxSpeedMS : 1);
            const knockForce = (def.mass * 0.001) * speedRatio * def.collisionDamageMultiplier * 8.0;

            _knockDir.copy(_toEnemy).normalize();
            if (_knockDir.lengthSq() < 0.01) _knockDir.copy(_forward);

            if (speedSq >= SPEED_SQ_SPLATTER) {
                e.hp = 0;
                e.lastDamageType = 'vehicle_splatter';
                e.deathState = 'exploded';
                e.dead = true;

                const forceDir = _v1.copy(_knockDir).multiplyScalar(speed * 2.0).setY(3.0);
                EnemyManager.explodeEnemy(e, forceDir, {
                    spawnPart: (x: number, y: number, z: number, t: string, c: number, m?: any, v?: any, col?: number, s?: number) =>
                        FXSystem.spawnPart(scene, state.particles, x, y, z, t, c, m, v, col, s),
                    spawnDecal: (x: number, z: number, s: number, mat?: any) =>
                        FXSystem.spawnDecal(scene, state.bloodDecals, x, z, s, mat),
                });

                state.cameraShake = state.cameraShake + 0.4 > 1.5 ? 1.5 : state.cameraShake + 0.4;
                soundManager.playImpact('flesh');

            } else if (speedSq >= SPEED_SQ_KNOCKBACK) {
                e.hp -= baseDamage;
                e.lastDamageType = 'vehicle_ram';
                e.hitTime = now;

                _knockDir.multiplyScalar(knockForce).setY(2.0);
                e.knockbackVel.add(_knockDir);

                FXSystem.spawnPart(scene, state.particles, e.mesh.position.x, 1, e.mesh.position.z, 'blood', 20);
                FXSystem.spawnDecal(scene, state.bloodDecals, e.mesh.position.x, e.mesh.position.z,
                    1.0 + Math.random() * 1.5, MATERIALS.bloodDecal);

                state.cameraShake = state.cameraShake + 0.2 > 1.0 ? 1.0 : state.cameraShake + 0.2;
                soundManager.playImpact('flesh');

                vehicle.userData.suspVelY += 3.0;

            } else {
                e.hp -= baseDamage * 0.3;
                e.lastDamageType = 'vehicle_push';

                _knockDir.multiplyScalar(knockForce * 0.3);
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

                _toEnemy.normalize().multiplyScalar(overlap * 0.6);
                vehicle.position.add(_toEnemy);

                const impactDot = vel.dot(_toEnemy.normalize());
                if (impactDot < 0) {
                    vel.addScaledVector(_toEnemy, -impactDot * 1.2);
                }

                vehicle.userData.suspVelY += impactDot < 0 ? -impactDot * 0.5 : impactDot * 0.5;
                vel.multiplyScalar(0.85);
            }
        }
    }

    cleanup() {
        // Empty since we removed the Map. Maintained interface compatibility.
    }
}