import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { FXSystem } from './FXSystem';
import { EnemyManager } from '../EnemyManager';
import { soundManager } from '../../utils/sound';
import { VehicleDef } from '../../content/vehicles';
import { _buoyancyResult } from './WaterSystem';
import { FLASHLIGHT } from '../../content/constants'; // Adjust path if needed

// --- PERFORMANCE SCRATCHPADS ---
// Pre-allocated vectors to prevent Garbage Collection (GC) during loops
const _v1 = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _toEnemy = new THREE.Vector3();
const _knockDir = new THREE.Vector3();
const _dismountDir = new THREE.Vector3();

// --- FAKE BRAKE GLOW (Zero-GC / Procedural Texture) ---
// Generates a soft, glowing gradient texture dynamically on load
function createBrakeGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 512, 512);

    const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 250);

    gradient.addColorStop(0, 'rgba(255, 30, 0, 1.0)');   // White/orange/hot core
    gradient.addColorStop(0.2, 'rgba(180, 0, 0, 0.5)');  // Intense red
    gradient.addColorStop(0.5, 'rgba(50, 0, 0, 0.1)');   // Faint red glow
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');        // Exact black/transparent at the edge

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    return tex;
}

// Plane geometry for the brake light cast on the snow
const _fakeBrakeGlowGeo = new THREE.PlaneGeometry(8, 8);
_fakeBrakeGlowGeo.rotateX(-Math.PI / 2); // Lay flat on the ground

const _fakeBrakeGlowMat = new THREE.MeshBasicMaterial({
    map: createBrakeGlowTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false, // Prevents Z-fighting with the ground
    opacity: 0.8,
    fog: false
});

// Constants
const HIT_COOLDOWN_MS = 350;
const SPEED_SQ_PUSH = 1.0; // Lowered to allow pushing enemies even at very slow speeds
const KMH_TO_MS = 1.0 / 3.6;

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

        // Ensure engine sounds/state are reset if no vehicle is currently active
        if (!state.activeVehicle && state.vehicleEngineState !== 'OFF') {
            state.vehicleEngineState = 'OFF';
            state.vehicleSpeed = 0;
            soundManager.stopVehicleEngine();
            soundManager.playVehicleSkid(0);
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
        const dt = delta > 0.1 ? 0.1 : delta;
        const fpsRatio = dt * 60;

        const ud = vehicle.userData;
        if (!ud.velocity) {
            ud.velocity = new THREE.Vector3();
            ud.angularVelocity = new THREE.Vector3();
            ud.suspY = 0;
            ud.suspVelY = 0;
        }

        const vel = ud.velocity as THREE.Vector3;
        const angVel = ud.angularVelocity as THREE.Vector3;

        // --- START ENGINE ---
        // Triggered when player assumes control
        if (input && state.vehicleEngineState === 'OFF') {
            this.enterVehicle(playerGroup, vehicle, state, def, vel, angVel);
        }

        // --- COMPUTE FORWARD & RIGHT VECTORS ---
        // Extracted directly from the world matrix (Zero-GC)
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

            // Gamepad support
            if (input.joystickMove) throttle += input.joystickMove.y * -1;
            if (input.joystickAim) steer += input.joystickAim.x;

            // Boat specific logic: Lose power if not in water
            if (def.category === 'BOAT' && session.engine.water) {
                session.engine.water.checkBuoyancy(vehicle.position.x, vehicle.position.y, vehicle.position.z);
                if (!_buoyancyResult.inWater || vehicle.position.y < _buoyancyResult.waterLevel - 2.0) {
                    if (throttle > 0.1 || throttle < -0.1) throttle = 0;
                }
            }
        }

        throttle = throttle > 1 ? 1 : (throttle < -1 ? -1 : throttle);
        steer = steer > 1 ? 1 : (steer < -1 ? -1 : steer);

        // --- SPEED DECOMPOSITION ---
        let forwardSpeed = vel.dot(_forward);
        let currentLatSpeed = vel.dot(_right);
        let absLatSpeed = currentLatSpeed < 0 ? -currentLatSpeed : currentLatSpeed;
        const maxSpeedMS = def.maxSpeed * KMH_TO_MS;

        // --- ACCELERATION / NORMAL BRAKING ---
        let isBraking = false;

        if (throttle !== 0) {
            if (throttle < 0 && forwardSpeed > 1.0) {
                // Braking while moving forward
                const decel = def.brakeForce * (throttle * -1) * dt;
                vel.addScaledVector(_forward, -decel);
                isBraking = true;
            } else if (throttle > 0 && forwardSpeed < -1.0) {
                // Braking while reversing
                const decel = def.brakeForce * throttle * dt;
                vel.addScaledVector(_forward, decel);
                isBraking = true;
            } else {
                // Accelerating
                const maxReverseMS = maxSpeedMS * def.reverseSpeedFraction;
                const atLimit = throttle > 0 ? (forwardSpeed >= maxSpeedMS) : (forwardSpeed <= -maxReverseMS);

                if (!atLimit) {
                    let tractionMul = 1.0;
                    // Traction loss based on drivetrain
                    if (def.drivetrain === 'FWD') {
                        const slip = absLatSpeed * 0.05;
                        tractionMul = 1.0 - (slip > 0.5 ? 0.5 : slip);
                    } else if (def.drivetrain === 'AWD') {
                        const slip = absLatSpeed * 0.02;
                        tractionMul = 1.0 - (slip > 0.2 ? 0.2 : slip);
                    }
                    vel.addScaledVector(_forward, def.acceleration * throttle * tractionMul * dt);
                }
            }
        }

        // --- HANDBRAKE ---
        if (handbrake) {
            isBraking = true;
            const handbrakeDecel = def.brakeForce * 0.6 * dt;
            if (forwardSpeed > 0.1) vel.addScaledVector(_forward, -handbrakeDecel);
            else if (forwardSpeed < -0.1) vel.addScaledVector(_forward, handbrakeDecel);
        }

        // Recalculate after acceleration changes
        forwardSpeed = vel.dot(_forward);
        currentLatSpeed = vel.dot(_right);
        absLatSpeed = currentLatSpeed < 0 ? -currentLatSpeed : currentLatSpeed;
        const speedSq = vel.lengthSq();
        const speed = speedSq > 0 ? Math.sqrt(speedSq) : 0;
        const isReversing = forwardSpeed < -0.5;

        // --- STEERING ---
        if ((steer > 0.1 || steer < -0.1) && speedSq > 0.5) {
            const directionalSteer = isReversing ? -steer : steer;

            let speedFactor = 1.0;
            if (speed < 6.0) {
                speedFactor = speed / 6.0;
            } else {
                const speedRatio = speed / (maxSpeedMS > 1 ? maxSpeedMS : 1);
                speedFactor = 1.0 - (speedRatio * 0.3);
            }

            const turnMult = (handbrake && speed > 6.0) ? 1.5 : 1.0;

            angVel.y -= directionalSteer * def.turnSpeed * turnMult * speedFactor * dt;
        }

        // --- DRIVETRAIN DRIFT PHYSICS ---
        let latRetention = def.lateralFriction * def.friction;

        if (handbrake) {
            latRetention = 0.95;
        } else if ((throttle > 0.5 || throttle < -0.5) && speedSq > 20 && absLatSpeed > 2.0) {
            if (def.drivetrain === 'RWD') latRetention = 0.96;
            else if (def.drivetrain === 'AWD') latRetention = 0.92;
            else if (def.drivetrain === 'FWD') latRetention *= 0.85;
        }

        const baseFriction = throttle !== 0 ? 0.998 : def.friction;
        const dampedFwd = forwardSpeed * Math.pow(baseFriction, fpsRatio);
        const dampedLat = currentLatSpeed * Math.pow(latRetention, fpsRatio);

        // Retain gravity (y) but overwrite XZ plane velocities
        const savedVelY = vel.y;
        vel.copy(_forward).multiplyScalar(dampedFwd);
        vel.addScaledVector(_right, dampedLat);
        vel.y = savedVelY;

        // Dampen angular velocity (auto-center steering feel)
        angVel.multiplyScalar(Math.pow(0.85, fpsRatio));

        // --- SUSPENSION ---
        let suspY = 0;
        let suspVelY = 0;

        if (def.suspensionStiffness !== undefined && def.suspensionDamping !== undefined) {
            suspY = ud.suspY as number;
            suspVelY = ud.suspVelY as number;

            // Hooke's Law (Spring Force)
            suspVelY -= suspY * def.suspensionStiffness * dt;
            suspVelY *= (1.0 - def.suspensionDamping * dt);
            suspY += suspVelY * dt;

            // Clamp to prevent wild bouncing
            if (suspY > 0.3) { suspY = 0.3; suspVelY = 0; }
            else if (suspY < -0.3) { suspY = -0.3; suspVelY = 0; }

            ud.suspY = suspY;
            ud.suspVelY = suspVelY;
        } else {
            ud.suspY = 0;
            ud.suspVelY = 0;
        }

        // VISUAL SUSPENSION (Pitch & Roll)
        // Find the visual mesh inside the root and apply the bounce only to the chassis
        if (vehicle.children.length > 0) {
            const visualMesh = vehicle.children[0];
            if (visualMesh.userData.chassis) {
                const chassis = visualMesh.userData.chassis;

                // 1. Vertical bounce from collisions and bumps
                chassis.position.y = suspY;

                // 2. Calculate G-forces forward/backward (Pitch)
                const prevFwdSpeed = ud.prevFwdSpeed || 0;
                const fwdAccel = (forwardSpeed - prevFwdSpeed) / dt; // Rate of speed change
                ud.prevFwdSpeed = forwardSpeed;

                // If fwdAccel is negative (braking) -> targetPitch is positive (nose dips down)
                // If fwdAccel is positive (accelerating) -> targetPitch is negative (nose lifts up)
                // Max tilt is +/- 0.04 radians
                const targetPitch = THREE.MathUtils.clamp(fwdAccel * 0.003, -0.04, 0.04);

                // 3. Calculate lateral forces (Roll from steering and drifting)
                // currentLatSpeed indicates how fast the car moves sideways
                // Max tilt is +/- 0.06 radians
                const targetRoll = THREE.MathUtils.clamp(-currentLatSpeed * 0.015, -0.06, 0.06);

                // Apply using a smooth Lerp (Zero-GC) to prevent jitter
                chassis.rotation.x = THREE.MathUtils.lerp(chassis.rotation.x, targetPitch, dt * 8);
                chassis.rotation.z = THREE.MathUtils.lerp(chassis.rotation.z, targetRoll, dt * 8);
            }
        }

        // --- APPLY TRANSFORMS ---
        vehicle.position.addScaledVector(vel, dt);
        vehicle.rotation.y += angVel.y * dt;

        // Force the 3D engine to update the vehicle's World Matrix immediately.
        // This is critical because the Box-Collider reads quaternion & matrixWorld to calculate its corners!
        vehicle.updateMatrixWorld(true);

        // Update the spatial grid so the hitbox travels with the vehicle in real-time!
        // The obstacleRef is attached when the vehicle spawns in SectorGenerator
        const obs = ud.obstacleRef;
        if (obs && (speedSq > 0 || angVel.lengthSq() > 0.01)) {
            const grid = state.collisionGrid;
            if (grid && typeof grid.updateObstacle === 'function') {
                grid.updateObstacle(obs);
            }
        }

        // --- LIGHTING SYSTEM ---
        const lights = ud.lights;
        const isEngineOn = (input !== null && state.vehicleEngineState !== 'OFF');

        if (lights) {
            if (lights.headlights) {
                lights.headlights.material.emissiveIntensity = isEngineOn ? 5.0 : 0.0;
            }

            if (lights.brake) {
                const brakeIntensity = isBraking ? 20.0 : (isEngineOn ? 2.0 : 0.0);
                const brakeColor = isBraking ? 0xff3333 : 0x660000;

                if (Array.isArray(lights.brake)) {
                    for (let i = 0; i < lights.brake.length; i++) {
                        if (lights.brake[i].mesh) {
                            const mat = lights.brake[i].mesh.material as THREE.MeshStandardMaterial;
                            mat.emissiveIntensity = brakeIntensity;
                            mat.emissive.setHex(brakeColor);
                        }
                    }
                } else if (lights.brake.material) {
                    lights.brake.material.emissiveIntensity = brakeIntensity;
                    lights.brake.material.emissive.setHex(brakeColor);
                }

                // Brake lights floor decal
                if (isEngineOn && !lights.brake.fakeGlow) {
                    // Read the EXACT position from the car's brake light mesh
                    let rearZ = -(def.size.z / 2);
                    if (lights.brake.meshes?.[0]) {
                        rearZ = lights.brake.meshes[0].position.z;
                    }

                    const glowMesh = new THREE.Mesh(_fakeBrakeGlowGeo, _fakeBrakeGlowMat);

                    // Place the decal on the ground (y=0.1), exactly 0.2 units behind the bumper
                    glowMesh.position.set(0, 0.1, rearZ - 0.2);
                    glowMesh.visible = false;
                    vehicle.add(glowMesh);
                    lights.brake.fakeGlow = glowMesh;
                }

                if (lights.brake.fakeGlow) {
                    lights.brake.fakeGlow.visible = isBraking;
                }
            }

            // Sirens
            if (lights.siren) {
                if (isEngineOn) {
                    const blinkSpeed = 0.015;
                    lights.siren.materialBlue.emissiveIntensity = Math.sin(now * blinkSpeed) > 0 ? 20.0 : 0.0;
                    lights.siren.materialRed.emissiveIntensity = Math.cos(now * blinkSpeed) > 0 ? 20.0 : 0.0;
                } else {
                    lights.siren.materialBlue.emissiveIntensity = 0.0;
                    lights.siren.materialRed.emissiveIntensity = 0.0;
                }
            }
        }

        // --- AUDIO & SMOKE FX ---
        if (input) {
            const speedRatio = speed / (maxSpeedMS > 1.0 ? maxSpeedMS : 1.0);
            const normSpeed = speedRatio < 1.0 ? speedRatio : 1.0;

            state.vehicleSpeed = speed;
            state.vehicleThrottle = throttle;

            if (Number.isFinite(normSpeed)) {
                soundManager.updateVehicleEngine(normSpeed);
            }

            const isSkidding = absLatSpeed > 4.5 || (speedSq > 25 && (angVel.y > 0.8 || angVel.y < -0.8));

            if (def.category !== 'BOAT') {
                if (isSkidding) {
                    soundManager.playVehicleSkid(Math.min(1.0, absLatSpeed / 10.0));
                } else {
                    soundManager.playVehicleSkid(0);
                }

                // Exhaust smoke
                if (speedSq > 4.0) {
                    if (Math.random() < speedRatio * 0.3) {
                        _v1.copy(_forward).multiplyScalar(-def.size.z * 0.45);
                        FXSystem.spawnPart(session.engine.scene, state.particles, vehicle.position.x + _v1.x, 0.2, vehicle.position.z + _v1.z, 'smoke', 1, undefined, undefined, 0xaaaaaa, 0.4);
                    }
                    if (isSkidding && Math.random() < 0.6) {
                        _v1.copy(_forward).multiplyScalar(-def.size.z * 0.45);
                        _v1.addScaledVector(_right, currentLatSpeed > 0 ? -0.5 : 0.5);
                        FXSystem.spawnPart(session.engine.scene, state.particles, vehicle.position.x + _v1.x, 0.2, vehicle.position.z + _v1.z, 'large_smoke', 1, undefined, undefined, 0xcccccc, 0.8 + Math.random() * 0.5);
                    }
                }
            }
        }

        // --- COLLISION ---
        this.handleEnemyCollisions(vehicle, vel, def, session, now);
        this.handleObstacleCollisions(vehicle, vel, def, session);

        // --- SYNC PLAYER TO VEHICLE & DISMOUNT LOGIC ---
        if (input) {
            playerGroup.position.copy(vehicle.position);
            playerGroup.quaternion.copy(vehicle.quaternion);

            // Calculate seat offset LOCALLY based on the vehicle's current rotation
            const chassisSuspY = vehicle.children[0]?.userData?.chassis?.position.y || 0;

            _v1.set(def.seatOffset.x, def.seatOffset.y + chassisSuspY, def.seatOffset.z);
            _v1.applyQuaternion(vehicle.quaternion); // Make the seat offset rotate with the car
            playerGroup.position.add(_v1);

            const childLen = playerGroup.children.length;
            for (let i = 0; i < childLen; i++) {
                const child = playerGroup.children[i];
                if (child.rotation) child.rotation.y = 0;
            }

            // --- DISMOUNT ---
            if (input.e && !state.eDepressed) {
                this.exitVehicle(playerGroup, vehicle, state, def);
            }
        }
    }

    private enterVehicle(
        playerGroup: THREE.Group,
        vehicle: THREE.Object3D,
        state: any,
        def: VehicleDef,
        vel: THREE.Vector3,
        angVel: THREE.Vector3
    ) {
        state.vehicleEngineState = 'RUNNING';
        state.activeVehicleType = def.type;
        const category = def.category === 'BOAT' ? 'BOAT' : 'CAR';
        soundManager.playVehicleEnter(category);
        soundManager.playVehicleEngine(category);
        vel.set(0, 0, 0);
        angVel.set(0, 0, 0);

        // Dölj spelaren
        playerGroup.visible = false;

        // Leta efter lampan
        const headlight = playerGroup.getObjectByName(FLASHLIGHT.name) as THREE.SpotLight;

        if (headlight) {
            const lights = vehicle.userData.lights;
            let frontZ = 0;
            let lightY = 0;

            // Försök läsa av positionen från bilens befintliga små "glödande" meshes
            if (lights && lights.headlights && lights.headlights.meshes && lights.headlights.meshes.length > 0) {
                frontZ = lights.headlights.meshes[0].position.z;
                lightY = lights.headlights.meshes[0].position.y;
            } else {
                // Fallback: Använd fordonets definierade dimensioner för lokala koordinater
                const box = new THREE.Box3().setFromObject(vehicle);
                frontZ = box.max.z;
                lightY = (box.max.y - box.min.y) * 0.4;
            }

            headlight.position.set(0, lightY, frontZ + 0.2); // 0.2 m framför grillen
            headlight.target.position.set(0, lightY, frontZ + 20);
            headlight.updateMatrix();

            // Fäst i chassit så lampan guppar med fjädringen (om chassi finns)
            let mountTarget = vehicle;
            if (vehicle.userData.chassis) {
                mountTarget = vehicle.userData.chassis;
            } else if (vehicle.children[0]?.userData?.chassis) {
                mountTarget = vehicle.children[0].userData.chassis;
            }

            mountTarget.add(headlight);
            if (headlight.target) mountTarget.add(headlight.target);

            // Boosta lampan
            if (state.flashlightOn) {
                headlight.intensity = FLASHLIGHT.intensity * 2;
                headlight.distance = FLASHLIGHT.distance * 2;
                headlight.angle = Math.PI / 4;
            }

            headlight.updateMatrixWorld(true);
            if (headlight.target) headlight.target.updateMatrixWorld(true);
        }
    }

    private exitVehicle(
        playerGroup: THREE.Group,
        vehicle: THREE.Object3D,
        state: any,
        def: VehicleDef
    ) {
        state.eDepressed = true;
        state.activeVehicle = null;
        state.activeVehicleType = null;
        state.vehicleSpeed = 0;
        state.vehicleEngineState = 'OFF';

        soundManager.stopVehicleEngine();
        soundManager.playVehicleSkid(0);
        soundManager.playVehicleExit(def.category === 'BOAT' ? 'BOAT' : 'CAR');

        // Placera spelaren utanför dörren
        _dismountDir.set(def.dismountOffset.x, def.dismountOffset.y, def.dismountOffset.z)
            .applyQuaternion(vehicle.quaternion);
        playerGroup.position.add(_dismountDir);
        playerGroup.position.y = 0;

        // Visa spelaren igen
        playerGroup.visible = true;

        // Leta efter lampan PÅ FORDONET
        const headlight = vehicle.getObjectByName(FLASHLIGHT.name) as THREE.SpotLight;

        if (headlight) {
            // 1. Sätt tillbaka lampan på spelaren
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

            // 2. Återställ människo-styrka
            if (state.flashlightOn) {
                headlight.intensity = FLASHLIGHT.intensity;
                headlight.distance = FLASHLIGHT.distance;
                headlight.angle = FLASHLIGHT.angle;
            }

            // 3. Force matrix updates for proper alignment immediately
            playerGroup.updateMatrix();
            playerGroup.updateMatrixWorld(true);
            headlight.updateMatrixWorld(true);
            if (headlight.target) headlight.target.updateMatrixWorld(true);
        }

        const lights = vehicle.userData.lights;
        if (lights?.brake?.fakeGlow) {
            lights.brake.fakeGlow.visible = false;
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

        // Hit radius is slightly larger than the physical box to catch enemies early
        const hitRadius = (def.size.x > def.size.z ? def.size.x : def.size.z) * 0.5 + 1.0;

        const enemies = state.collisionGrid.getNearbyEnemies(vehicle.position, hitRadius);
        const eLen = enemies.length;

        for (let i = 0; i < eLen; i++) {
            const e = enemies[i];
            if (e.deathState !== 'ALIVE') continue;

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
            if (_knockDir.lengthSq() < 0.01) _knockDir.copy(_forward);

            // Delegera logiken för skada/animation till EnemyManager!
            if (typeof (EnemyManager as any).applyVehicleHit === 'function') {
                const isHeavyHit = (EnemyManager as any).applyVehicleHit(e, _knockDir, speedMS, def, state, session, now);

                // Om det var en tung krock som krävde lite tryck, guppa bilens chassi
                if (isHeavyHit) {
                    vehicle.userData.suspVelY += 2.0;
                }
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

            // Simple radial check for bouncing against rigid environment objects
            if (distSq < combinedRad * combinedRad && distSq > 0.01) {
                const dist = Math.sqrt(distSq);
                const overlap = combinedRad - dist;

                _toEnemy.normalize();

                vehicle.position.addScaledVector(_toEnemy, overlap * 0.6);

                const impactDot = vel.dot(_toEnemy);
                if (impactDot < 0) {
                    vel.addScaledVector(_toEnemy, -impactDot * 1.2);
                }

                // Small vertical bounce feedback upon collision
                vehicle.userData.suspVelY += impactDot < 0 ? -impactDot * 0.5 : impactDot * 0.5;
                vel.multiplyScalar(0.85);
            }
        }
    }

    cleanup() { }
}