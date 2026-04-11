import * as THREE from 'three';
import { MATERIALS } from '../utils/assets/materials';
import { soundManager } from '../utils/audio/SoundManager';
import { MaterialType } from '../content/environment';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { FXSystem } from './FXSystem';
import { System } from './System';

const MAX_FOOTPRINTS = 100; // Vi kan dubbla antalet nu när det är Instanced!
const FADE_DURATION = 15000; // 15 seconds life

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _dummyObj = new THREE.Object3D();
const _color = new THREE.Color();
const _scaleRight = new THREE.Vector3(-0.6, 1, 1);
const _scaleLeft = new THREE.Vector3(0.6, 1, 1);

interface FootprintData {
    life: number;
    active: boolean;
    scaleRef: THREE.Vector3;
}

class FootprintSystemClass implements System {
    public id = 'footprint_system';
    public isFixedStep = true;
    public enabled = true;
    private scene: THREE.Scene | null = null;

    // Instanced rendering replaces 50 individual meshes with 1 draw call
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
            // Skapa InstancedMesh med stöd för per-instans-färger
            this.instancedMesh = new THREE.InstancedMesh(this.geometry, MATERIALS.footprintDecal, MAX_FOOTPRINTS);
            this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

            // Färg-stöd
            const colors = new Float32Array(MAX_FOOTPRINTS * 3);
            this.instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);

            this.instancedMesh.renderOrder = 2;
            this.instancedMesh.frustumCulled = false;

            // Pre-allocate tracking data
            for (let i = 0; i < MAX_FOOTPRINTS; i++) {
                this.footprintData.push({ life: 0, active: false, scaleRef: _scaleLeft });
                // Hide all instances initially by setting scale to 0
                _dummyObj.scale.set(0, 0, 0);
                _dummyObj.updateMatrix();
                this.instancedMesh.setMatrixAt(i, _dummyObj.matrix);
            }

            scene.add(this.instancedMesh);
        } else {
            // Om återanvänd
            if (this.instancedMesh.parent !== scene) scene.add(this.instancedMesh);
            for (let i = 0; i < MAX_FOOTPRINTS; i++) {
                this.footprintData[i].active = false;
                _dummyObj.scale.set(0, 0, 0);
                _dummyObj.updateMatrix();
                this.instancedMesh.setMatrixAt(i, _dummyObj.matrix);
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
                soundManager.playSwimming();
                FXSystem.spawnPart(
                    this.scene,
                    session.state.particles,
                    position.x, position.y + 1.0, position.z,
                    'splash',
                    10
                );
                session.engine.water?.spawnRipple(position.x, position.z, session.state.simTime, 4.0);
            } else {
                soundManager.playFootstep(MaterialType.WATER, isRight, isRushing);
                session.engine.water?.spawnRipple(position.x, position.z, session.state.simTime, 1.5);
            }
            return;
        }

        // 2. Fast Ground Detection via Spatial Grid (Zero-Raycast)
        const grid = session.state.collisionGrid;
        if (!grid) return;

        // Vi litar på att spelaren är på rätt y-position, men vi kan dubbelkolla
        const groundHeight = grid.getGroundHeight ? grid.getGroundHeight(position.x, position.z) : 0;

        // Blixtsnabb matematisk X/Z offset
        const offsetDist = isRight ? 0.15 : -0.15;
        const cosY = Math.cos(rotationY);
        const sinY = Math.sin(rotationY);

        const spawnX = position.x + (offsetDist * cosY);
        const spawnZ = position.z + (-offsetDist * sinY);
        const spawnY = groundHeight + 0.02;

        const data = this.footprintData[this.index];
        data.active = true;
        data.life = FADE_DURATION;
        data.scaleRef = isRight ? _scaleRight : _scaleLeft;

        _dummyObj.position.set(spawnX, spawnY, spawnZ);
        _dummyObj.rotation.set(0, rotationY, 0);
        _dummyObj.scale.copy(data.scaleRef);
        _dummyObj.updateMatrix();

        this.instancedMesh.setMatrixAt(this.index, _dummyObj.matrix);

        // Standardized color assignment (Snow/Dirt check via generic fallback if no metadata exists)
        _color.setHex(0x222222); // Default dark
        this.instancedMesh.setColorAt(this.index, _color);

        if (this.instancedMesh.instanceColor) {
            this.instancedMesh.instanceColor.needsUpdate = true;
        }
        this.instancedMesh.instanceMatrix.needsUpdate = true;

        this.index = (this.index + 1) % MAX_FOOTPRINTS;

        // 3. Audio & Particle Feedback
        let playMaterial: number = groundMaterial || MaterialType.SNOW;
        if (inWater || isSwimming) playMaterial = MaterialType.WATER;

        soundManager.playFootstep(playMaterial, isRight, isRushing);

        if (isRushing) {
            FXSystem.spawnPart(
                this.scene,
                session.state.particles,
                spawnX, spawnY, spawnZ,
                'large_smoke',
                1
            );
        }
    }

    /**
     * Main update loop for fading footprints.
     * Uses scale fading instead of opacity to allow single-material instancing.
     */
    update(delta: number) {
        if (!this.enabled || !this.instancedMesh) return;

        let needsUpdate = false;

        for (let i = 0; i < MAX_FOOTPRINTS; i++) {
            const data = this.footprintData[i];
            if (!data.active) continue;

            data.life -= delta;

            if (data.life <= 0) {
                data.active = false;
                _dummyObj.scale.set(0, 0, 0);
                this.instancedMesh.setMatrixAt(i, _dummyObj.matrix);
                needsUpdate = true;
            } else if (data.life < 2000) {
                // Shrink fade during the last 2 seconds
                const scaleDown = (data.life / 2000);

                this.instancedMesh.getMatrixAt(i, _dummyObj.matrix);
                _dummyObj.matrix.decompose(_dummyObj.position, _dummyObj.quaternion, _dummyObj.scale);

                _dummyObj.scale.set(
                    data.scaleRef.x * scaleDown,
                    data.scaleRef.y,
                    data.scaleRef.z * scaleDown
                );

                _dummyObj.updateMatrix();
                this.instancedMesh.setMatrixAt(i, _dummyObj.matrix);
                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            this.instancedMesh.instanceMatrix.needsUpdate = true;
        }
    }

    cleanup() {
        if (this.scene && this.instancedMesh) {
            this.scene.remove(this.instancedMesh);
            this.instancedMesh.dispose();
            this.instancedMesh = null;
            this.footprintData = [];
            this.scene = null;
        }
    }
}

export const FootprintSystem = new FootprintSystemClass();