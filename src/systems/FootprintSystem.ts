import * as THREE from 'three';
import { MATERIALS } from '../utils/assets/materials';
import { GamePlaySounds } from '../utils/audio/AudioLib';
import { MaterialType } from '../content/environment';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { FXSystem } from './FXSystem';
import { System, SystemID } from './System';
import { FXParticleType, FXDecalType } from '../types/FXTypes';
import { MAX_ENTITIES, FX } from '../content/constants';

const MAX_FOOTPRINTS = MAX_ENTITIES.FOOTPRINTS;
const FADE_DURATION = FX.FADE_DURATION;

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _color = new THREE.Color();
const _scaleRight = new THREE.Vector3(-0.6, 1, 1);
const _scaleLeft = new THREE.Vector3(0.6, 1, 1);

// Direct matrix composition scratchpads completely bypassing Object3D overhead
const _tempMatrix = new THREE.Matrix4();
const _tempScale = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);

// Pre-calculated zero matrix for instant O(1) hiding without composition math
const _zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

interface FootprintData {
    life: number;
    active: boolean;
    scaleRef: THREE.Vector3;
    // Caching original transformations to completely avoid matrix.decompose() during updates
    position: THREE.Vector3;
    quat: THREE.Quaternion;
}

class FootprintSystemClass implements System {
    readonly systemId = SystemID.FOOTPRINT;
    public id = 'footprint_system';
    public isFixedStep = true;
    public enabled = true;
    public persistent = false;
    private scene: THREE.Scene | null = null;

    private instancedMesh: THREE.InstancedMesh | null = null;
    private geometry: THREE.PlaneGeometry;

    private footprintData: FootprintData[] = [];
    private index = 0;

    constructor() {
        this.geometry = new THREE.PlaneGeometry(0.25, 0.45);
        this.geometry.rotateX(-Math.PI / 2); // Orient flat for ground placement
    }

    init(scene: THREE.Scene) {
        this.scene = scene;
        this.index = 0;

        if (!this.instancedMesh) {
            this.instancedMesh = new THREE.InstancedMesh(this.geometry, MATERIALS.footprintDecal, MAX_FOOTPRINTS);
            this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

            const colors = new Float32Array(MAX_FOOTPRINTS * 3);
            this.instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);

            this.instancedMesh.renderOrder = 2;
            this.instancedMesh.frustumCulled = false;

            // Pre-allocate tracking data with dedicated Zero-GC vectors and quaternions
            for (let i = 0; i < MAX_FOOTPRINTS; i++) {
                this.footprintData.push({
                    life: 0,
                    active: false,
                    scaleRef: _scaleLeft,
                    position: new THREE.Vector3(),
                    quat: new THREE.Quaternion()
                });

                // Hide all instances initially
                this.instancedMesh.setMatrixAt(i, _zeroMatrix);
            }

            scene.add(this.instancedMesh);
        } else {
            if (this.instancedMesh.parent !== scene) scene.add(this.instancedMesh);
            for (let i = 0; i < MAX_FOOTPRINTS; i++) {
                this.footprintData[i].active = false;
                this.instancedMesh.setMatrixAt(i, _zeroMatrix);
            }
            this.instancedMesh.instanceMatrix.needsUpdate = true;
        }
    }

    /**
     * Places a new footprint decal in the world or handles water FX.
     * Centralized hub for ALL step-based audio/visual feedback.
     */
    addFootprint(
        session: GameSessionLogic,
        position: THREE.Vector3,
        rotationY: number,
        isRight: boolean,
        isRushing: boolean,
        inWater: boolean,
        isSwimming: boolean,
        groundMaterial: number = 0
    ) {
        if (!this.enabled || !this.scene || !this.instancedMesh) return;

        // 1. Water Handle (No decals)
        if (inWater) {
            if (isSwimming) {
                GamePlaySounds.playSwimming();
                FXSystem.spawnParticle(
                    this.scene,
                    session.state.particles,
                    position.x, position.y + 1.0, position.z,
                    FXParticleType.SPLASH,
                    10
                );
                session.engine.water?.spawnRipple(position.x, position.z, session.state.simTime, 4.0);
            } else {
                GamePlaySounds.playFootstep(MaterialType.WATER, isRight, isRushing);
                session.engine.water?.spawnRipple(position.x, position.z, session.state.simTime, 1.5);
            }
            return;
        }

        // 2. Leverage frame-stamped snapped coordinate from player position (O(1) time snap)
        const streamer = session.state.worldStreamer;

        // Extremely fast mathematical X/Z offset avoiding trig overhead where possible
        const offsetDist = isRight ? 0.15 : -0.15;
        const cosY = Math.cos(rotationY);
        const sinY = Math.sin(rotationY);

        const spawnX = position.x + (offsetDist * cosY);
        const spawnZ = position.z + (-offsetDist * sinY);
        const spawnY = position.y + 0.02;

        const data = this.footprintData[this.index];
        data.active = true;
        data.life = FADE_DURATION;
        data.scaleRef = isRight ? _scaleRight : _scaleLeft;

        // Cache exact position and quaternion directly to bypass runtime decomposition later
        data.position.set(spawnX, spawnY, spawnZ);
        data.quat.setFromAxisAngle(_UP, rotationY);

        // Fast raw composition
        _tempMatrix.compose(data.position, data.quat, data.scaleRef);
        this.instancedMesh.setMatrixAt(this.index, _tempMatrix);

        _color.setHex(0x222222); // Default dark
        this.instancedMesh.setColorAt(this.index, _color);

        if (this.instancedMesh.instanceColor) {
            this.instancedMesh.instanceColor.needsUpdate = true;
        }
        this.instancedMesh.instanceMatrix.needsUpdate = true;

        this.index = (this.index + 1) % MAX_FOOTPRINTS;

        // 3. Audio & Particle Feedback
        const groundMat = session.engine.ground ? session.engine.ground.getGroundMaterial(position.x, position.z, streamer) : groundMaterial;
        let playMaterial: number = groundMat || MaterialType.SNOW;
        if (inWater || isSwimming) playMaterial = MaterialType.WATER;

        GamePlaySounds.playFootstep(playMaterial, isRight, isRushing);

        if (!inWater && !isSwimming) {
            const vegMat = streamer.getVegetationAt(position.x, position.z);
            if (vegMat === MaterialType.PLANT) {
                GamePlaySounds.playVegetationStep(isRight, isRushing ? 1.4 : 1.0);
            }
        }

        if (isRushing) {
            FXSystem.spawnParticle(
                this.scene,
                session.state.particles,
                spawnX, spawnY, spawnZ,
                FXParticleType.LARGE_SMOKE,
                1
            );
        }
    }

    /**
     * Main update loop for fading footprints.
     * Highly optimized: Bypasses getMatrixAt() and decompose() entirely via cached transformations.
     */
    update(ctx: any, delta: number, simTime: number, renderTime: number) {
        if (!this.enabled || !this.instancedMesh) return;

        let needsUpdate = false;

        for (let i = 0; i < MAX_FOOTPRINTS; i++) {
            const data = this.footprintData[i];
            if (!data.active) continue;

            data.life -= delta * 1000;

            if (data.life <= 0) {
                data.active = false;
                // Instantly hide using the pre-composed zero matrix
                this.instancedMesh.setMatrixAt(i, _zeroMatrix);
                needsUpdate = true;
            } else if (data.life < 2000) {
                // Shrink fade during the last 2 seconds
                const scaleDown = data.life / 2000;

                _tempScale.set(
                    data.scaleRef.x * scaleDown,
                    data.scaleRef.y,
                    data.scaleRef.z * scaleDown
                );

                // Direct matrix composition from cached state (Zero-GC, extremely low CPU cycles)
                _tempMatrix.compose(data.position, data.quat, _tempScale);
                this.instancedMesh.setMatrixAt(i, _tempMatrix);
                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            this.instancedMesh.instanceMatrix.needsUpdate = true;
        }
    }

    public clear() {
        if (this.scene && this.instancedMesh) {
            this.scene.remove(this.instancedMesh);
            this.instancedMesh.dispose();
            this.instancedMesh = null;
            this.footprintData.length = 0;
            this.scene = null;
        }
    }

    public reAttach(scene: THREE.Scene) {
        this.scene = scene;
        if (this.instancedMesh) {
            scene.add(this.instancedMesh);
        }
    }
}

export const FootprintSystem = new FootprintSystemClass();