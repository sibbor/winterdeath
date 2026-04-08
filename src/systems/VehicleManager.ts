import * as THREE from 'three';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { soundManager } from '../utils/audio/SoundManager';
import { EnemyManager } from '../entities/enemies/EnemyManager';
import { EnemyDeathState } from '../entities/enemies/EnemyTypes';
import { DamageID } from '../entities/player/CombatTypes';
import { VehicleDef } from '../content/vehicles';
import { FLASHLIGHT } from '../content/constants';
import { NoiseType, NOISE_RADIUS } from '../entities/enemies/EnemyTypes';

const HIT_COOLDOWN_MS = 350;
const SPEED_SQ_PUSH = 1.0;

const _toEnemy = new THREE.Vector3();
const _knockDir = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _dismountDir = new THREE.Vector3();

// Zero-GC context bridge for EnemyManager physics
const _vehicleKnockbackCtx: any = {
    collisionGrid: null,
    applyDamage: null,
    scene: null,
    engine: null,
    particles: null
};

export const VehicleManager = {

    update: (session: GameSessionLogic, playerGroup: THREE.Group, delta: number, simTime: number, renderTime: number) => {
        const state = session.state;
        const input = session.engine.input.state;

        // 1. Enter / Exit Logic
        const isRunning = state.vehicle.active && state.vehicle.engineState !== 'OFF';
        const vehicle = state.vehicle.mesh;

        if (state.vehicle.active && vehicle) {
            const def = vehicle.userData.vehicleDef;

            if (state.vehicle.engineState === 'OFF') {
                const vel = vehicle.userData.velocity as THREE.Vector3;
                const angVel = vehicle.userData.angularVelocity as THREE.Vector3;
                VehicleManager.enterVehicle(playerGroup, vehicle, state, def, vel, angVel);
            }

            if (input.e && !state.eDepressed && state.vehicle.engineState !== 'OFF') {
                VehicleManager.exitVehicle(playerGroup, vehicle, state, def);
            }

            // 2. Collision Logic (OPTIMIZED)
            if (state.vehicle.engineState !== 'OFF') {
                const vel = vehicle.userData.velocity as THREE.Vector3;
                VehicleManager.handleEnemyCollisions(vehicle, vel, def, session, simTime);
                VehicleManager.handleObstacleCollisions(vehicle, vel, def, session);

                // --- ENGINE & MOVEMENT NOISE ---
                const speedSq = vel.lengthSq();
                const noiseType = speedSq > 5 ? NoiseType.VEHICLE_DRIVE : NoiseType.VEHICLE_IDLE;
                const noiseRadius = NOISE_RADIUS[noiseType];

                if (simTime - vehicle.userData._lastNoiseTime > 500) {
                    session.makeNoise(vehicle.position, noiseType, noiseRadius);
                    vehicle.userData._lastNoiseTime = simTime;
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
        state.vehicle.engineState = 'RUNNING';
        state.vehicle.type = def.type;
        state.vehicle.active = true;
        const category = def.category === 'BOAT' ? 'BOAT' : 'CAR';
        soundManager.playVehicleEnter(category);
        soundManager.playVehicleEngine(category);
        vel.set(0, 0, 0);
        angVel.set(0, 0, 0);

        playerGroup.visible = false;

        if (state.collisionGrid) {
            vehicle.userData.isInteractable = false;
        }

        const headlight = playerGroup.getObjectByName(FLASHLIGHT.name) as THREE.SpotLight;
        if (headlight) {
            const lights = vehicle.userData.lights;
            let frontZ = 0;
            let lightY = 0;

            if (lights && lights.headlights && lights.headlights.meshes.length > 0) {
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
        state.vehicle.active = false;
        state.vehicle.mesh = null;
        state.vehicle.type = '';
        state.vehicle.speed = 0;
        state.vehicle.engineState = 'OFF';

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

        if (state.collisionGrid) {
            vehicle.userData.isInteractable = true;
            state.collisionGrid.updateInteractable(vehicle);
        }
    },

    handleEnemyCollisions: (
        vehicle: THREE.Object3D,
        vel: THREE.Vector3,
        def: VehicleDef,
        session: GameSessionLogic,
        simTime: number
    ) => {
        const speedSq = vel.lengthSq();
        if (speedSq < SPEED_SQ_PUSH) return;

        const state = session.state;
        const hitRadius = (def.size.x > def.size.z ? def.size.x : def.size.z) * 0.5 + 1.0;

        // --- THE PLOW OFFSET ---
        // Project the knockback center slightly in front of the vehicle
        // so enemies are pushed forward and sideways, not pulled in from behind.
        _knockDir.copy(vel).normalize();
        if (_knockDir.lengthSq() < 0.01) {
            const elements = vehicle.matrixWorld.elements;
            _forward.set(elements[8], elements[9], elements[10]).normalize();
            _knockDir.copy(_forward);
        }

        _toEnemy.copy(vehicle.position).addScaledVector(_knockDir, 1.0);

        // --- SPATIAL GRID ENEMY LOOKUP ---
        // Look around the *front* of the vehicle
        const enemies = state.collisionGrid.getNearbyEnemies(_toEnemy, hitRadius);
        const eLen = enemies.length;

        let hitAnyone = false;
        let isHeavyHit = false;
        const speedMS = Math.sqrt(speedSq);
        const speedKmh = speedMS * 3.6;

        // Mass ratio determines how easily the vehicle bowls over enemies
        const massRatio = (def.mass * 0.001);

        for (let i = 0; i < eLen; i++) {
            const e = enemies[i];
            if (e.deathState !== EnemyDeathState.ALIVE) continue;

            const distSq = e.mesh.position.distanceToSquared(_toEnemy);
            const collisionRad = (hitRadius * 0.7) + e.widthScale * e.originalScale;

            if (distSq > collisionRad * collisionRad) continue;

            const lastHit = e.lastVehicleHit;
            if (simTime - lastHit < HIT_COOLDOWN_MS) continue;
            e.lastVehicleHit = simTime;
            hitAnyone = true;

            // --- DATA-DRIVEN KNOCKBACK ---
            // If going > 20 km/h, the force explodes. Otherwise, it's a gentle push.
            const forceMult = speedKmh > 20 ? (speedKmh * 0.5) : 5.0;
            const maxForce = forceMult * massRatio;
            const maxDamage = (speedKmh * def.collisionDamageMultiplier * 0.8) * massRatio;

            // Prepare context for EnemyManager
            _vehicleKnockbackCtx.collisionGrid = state.collisionGrid;
            _vehicleKnockbackCtx.applyDamage = state.callbacks?.applyDamage;
            _vehicleKnockbackCtx.scene = session.engine.scene;
            _vehicleKnockbackCtx.engine = session.engine;
            _vehicleKnockbackCtx.particles = state.particles;

            // Execute the highly optimized knockback
            EnemyManager.knockbackEnemies(
                _vehicleKnockbackCtx,
                _toEnemy,
                hitRadius,
                maxForce,
                maxDamage,
                DamageID.VEHICLE
            );

            if (speedKmh > 30) isHeavyHit = true;
        }

        if (hitAnyone) {
            if (isHeavyHit) {
                vehicle.userData.suspVelY += 2.0;
                soundManager.playVehicleImpact('heavy');
            } else {
                soundManager.playVehicleImpact('light');
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

                const impactSpeed = Math.abs(impactDot);
                if (impactSpeed > 2.0) {
                    soundManager.playVehicleImpact(impactSpeed > 10.0 ? 'heavy' : 'light');
                }
            }
        }
    }
};