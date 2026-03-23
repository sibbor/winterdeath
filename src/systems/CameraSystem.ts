import * as THREE from 'three';
import { CAMERA_HEIGHT } from '../content/constants';

/**
 * CameraSystem
 * Centralized manager for the PerspectiveCamera.
 * Handles FPS-independent smoothing, additive shaking, and panning.
 * Optimized for Zero-GC during runtime.
 */
export class CameraSystem {
    public threeCamera: THREE.PerspectiveCamera;

    // --- INTERNAL STATE ---
    private _idealPos = new THREE.Vector3();
    private _idealLookAt = new THREE.Vector3();
    private _currentLookAt = new THREE.Vector3();

    // Shake State
    private _shakeOffset = new THREE.Vector3();
    private _shakeIntensity = 0; // Persistent environmental shake
    private _hurtIntensity = 0;  // Rapidly decaying damage shake

    // Instant reaction, not using lerp
    private instantReact = { follow: true, lookAt: false };

    // Smoothing settings
    private _moveSpeed = 35.0;
    private _lookSpeed = 25.0;

    // Mode
    private _isCinematic = false;
    private _initialized = false;

    // Follow settings
    private _followTarget: THREE.Vector3 | null = null;
    private _followOffsetZ = 40;
    private _baseHeight = CAMERA_HEIGHT;
    private _followAngle = 0;
    private _followHeightMod = 0;
    private _targetAngle = 0;
    private _targetHeightMod = 0;

    constructor() {
        // Create the camera that WinterEngine will use
        this.threeCamera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2500);
        this.threeCamera.position.set(0, CAMERA_HEIGHT, 40);

        this._idealPos.copy(this.threeCamera.position);
        this._idealLookAt.set(0, 0, 0);
        this._currentLookAt.copy(this._idealLookAt);
    }

    public set(prop: 'fov' | 'far' | 'near' | 'aspect' | 'angle' | 'baseHeight' | 'heightMod' | 'offsetZ' | 'moveSpeed' | 'lookSpeed', value: number) {
        if (prop === 'fov') this.threeCamera.fov = value;
        if (prop === 'far') this.threeCamera.far = value;
        if (prop === 'near') this.threeCamera.near = value;
        if (prop === 'aspect') this.threeCamera.aspect = value;

        if (prop === 'angle') { this._targetAngle = value; this._followAngle = value; }
        if (prop === 'baseHeight') this._baseHeight = value;
        if (prop === 'heightMod') { this._targetHeightMod = value; this._followHeightMod = value; }
        if (prop === 'offsetZ') this._followOffsetZ = value;

        if (prop === 'moveSpeed') this._moveSpeed = value;
        if (prop === 'lookSpeed') this._lookSpeed = value;

        if (prop === 'fov' || prop === 'far' || prop === 'near' || prop === 'aspect') {
            this.threeCamera.updateProjectionMatrix();
        }
    }

    public setPosition(pos: THREE.Vector3, immediate?: boolean): void;
    public setPosition(x: number, y: number, z: number, immediate?: boolean): void;
    public setPosition(arg1: number | THREE.Vector3, arg2?: number | boolean, arg3?: number, arg4?: boolean) {
        if (arg1 instanceof THREE.Vector3) {
            this._idealPos.copy(arg1);
            if (arg2 === true) {
                this.threeCamera.position.copy(this._idealPos);
                this._initialized = true;
            }
        } else {
            this._idealPos.set(arg1, arg2 as number, arg3 as number);
            if (arg4 === true) {
                this.threeCamera.position.copy(this._idealPos);
                this._initialized = true;
            }
        }
    }

    public lookAt(vector: THREE.Vector3, immediate?: boolean): void;
    public lookAt(x: number, y: number, z: number, immediate?: boolean): void;
    public lookAt(arg1: number | THREE.Vector3, arg2?: number | boolean, arg3?: number, arg4?: boolean) {
        if (arg1 instanceof THREE.Vector3) {
            this._idealLookAt.copy(arg1);
            if (arg2 === true) {
                this._currentLookAt.copy(this._idealLookAt);
                this.threeCamera.lookAt(this._currentLookAt);
            }
        } else {
            this._idealLookAt.set(arg1, arg2 as number, arg3 as number);
            if (arg4 === true) {
                this._currentLookAt.copy(this._idealLookAt);
                this.threeCamera.lookAt(this._currentLookAt);
            }
        }
    }

    /**
     * Start following a target with smooth interpolation.
     */
    public follow(target: THREE.Vector3, offsetZ: number, baseHeight: number) {
        this._followTarget = target;
        this._followOffsetZ = offsetZ;
        this._baseHeight = baseHeight;
    }

    public rotate(deltaAngle: number) {
        this._targetAngle += deltaAngle;
    }

    public adjustAngle(deltaAngle: number) {
        this._targetAngle += deltaAngle;
    }

    public adjustPitch(delta: number, min: number = -40, max: number = 40) {
        this._targetHeightMod = Math.max(min, Math.min(max, this._targetHeightMod + delta));
    }

    public setAngle(angle: number, immediate: boolean = false) {
        this._targetAngle = angle;
        if (immediate) this._followAngle = angle;
    }

    public setHeightMod(mod: number, immediate: boolean = false) {
        this._targetHeightMod = mod;
        if (immediate) this._followHeightMod = mod;
    }

    public shake(amount: number, type: 'general' | 'hurt' = 'general') {
        if (type === 'hurt') {
            this._hurtIntensity = Math.max(this._hurtIntensity, amount);
        } else {
            this._shakeIntensity = Math.max(this._shakeIntensity, amount);
        }
    }

    public setCinematic(active: boolean) {
        this._isCinematic = active;
        if (active) {
            this._followTarget = null; // Stop following when entering cinematic mode
        }
    }

    public snapToTarget() {
        if (this._followTarget) {
            const offsetX = this._followOffsetZ * Math.sin(this._followAngle);
            const offsetZRotated = this._followOffsetZ * Math.cos(this._followAngle);

            this._idealPos.set(
                this._followTarget.x + offsetX,
                this._baseHeight + this._followHeightMod,
                this._followTarget.z + offsetZRotated
            );
            this.threeCamera.position.copy(this._idealPos);
            this._currentLookAt.copy(this._followTarget);
            this.threeCamera.lookAt(this._currentLookAt);
            this._initialized = true;
        }
    }

    public update(dt: number, _now: number) {
        if (!this._initialized && this.threeCamera) {
            this._idealPos.copy(this.threeCamera.position);
            this._initialized = true;
        }

        // 1. Follow Target Position Logic
        if (!this._isCinematic && this._followTarget) {
            // Smooth interpolation of rotation/pitch
            const angleLerp = 1.0 - Math.exp(-8.0 * dt);
            this._followAngle += (this._targetAngle - this._followAngle) * angleLerp;
            this._followHeightMod += (this._targetHeightMod - this._followHeightMod) * angleLerp;

            const offsetX = this._followOffsetZ * Math.sin(this._followAngle);
            const offsetZRotated = this._followOffsetZ * Math.cos(this._followAngle);

            const targetX = this._followTarget.x + offsetX;
            const targetY = this._baseHeight + this._followHeightMod;
            const targetZ = this._followTarget.z + offsetZRotated;

            if (this.instantReact.follow) {
                // Instant snap: Zero math, zero lag
                this._idealPos.x = targetX;
                this._idealPos.y = targetY;
                this._idealPos.z = targetZ;
            } else {
                // FPS-Independent Smooth Lerp: Heavy math, cinematic feel
                const lerpFactor = 1.0 - Math.exp(-this._moveSpeed * dt);
                this._idealPos.x += (targetX - this._idealPos.x) * lerpFactor;
                this._idealPos.y += (targetY - this._idealPos.y) * lerpFactor;
                this._idealPos.z += (targetZ - this._idealPos.z) * lerpFactor;
            }

            // Direct assignment is faster than calling .copy() every frame (Zero-GC)
            this._idealLookAt.x = this._followTarget.x;
            this._idealLookAt.y = this._followTarget.y;
            this._idealLookAt.z = this._followTarget.z;
        }

        // 2. LookAt Logic (Independent of FollowTarget)
        if (this.instantReact.lookAt) {
            this._currentLookAt.copy(this._idealLookAt);
        } else {
            // FPS-Independent Smooth Lerp for panning
            const lookLerpFactor = 1.0 - Math.exp(-this._lookSpeed * dt);
            this._currentLookAt.lerp(this._idealLookAt, lookLerpFactor);
        }

        // 3. Shake Calculation
        // Calculate shake separately to easily add it to the final position without allocating new vectors
        let currentShakeX = 0;
        let currentShakeZ = 0;

        if (this._hurtIntensity > 0) {
            this._hurtIntensity = Math.max(0, this._hurtIntensity - 4.0 * dt);
            const amt = this._hurtIntensity * 0.5;
            currentShakeX += (Math.random() - 0.5) * amt;
            currentShakeZ += (Math.random() - 0.5) * amt;
        }

        if (this._shakeIntensity > 0) {
            this._shakeIntensity = Math.max(0, this._shakeIntensity - 5.0 * dt);
            const amt = this._shakeIntensity * 0.5;
            currentShakeX += (Math.random() - 0.5) * amt;
            currentShakeZ += (Math.random() - 0.5) * amt;
        }

        // 4. Final Transform Application
        // Apply position and additive shake directly to the Three.js camera
        this.threeCamera.position.x = this._idealPos.x + currentShakeX;
        this.threeCamera.position.y = this._idealPos.y;
        this.threeCamera.position.z = this._idealPos.z + currentShakeZ;

        this.threeCamera.lookAt(this._currentLookAt);
    }

    public reset() {
        this._followTarget = null;
        this._shakeIntensity = 0;
        this._hurtIntensity = 0;
        this._followAngle = 0;
        this._followHeightMod = 0;
        this._targetAngle = 0;
        this._targetHeightMod = 0;
        this._isCinematic = false;
        this._shakeOffset.set(0, 0, 0);
    }

    /**
     * Helper getters to access the underlying Three.js camera properties
     */
    public get fov() { return this.threeCamera.fov; }
    public get far() { return this.threeCamera.far; }
    public get position() { return this.threeCamera.position; }
    public get angle() { return this._followAngle; }
}