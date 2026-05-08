import * as THREE from 'three';

export enum VehicleDrivetrain {
    FWD = 0,
    RWD = 1,
    AWD = 2
}

export enum VehicleID {
    TRACTOR = 0,
    STATION_WAGON = 1,
    SEDAN = 2,
    POLICE = 3,
    AMBULANCE = 4,
    BUS = 5,
    TIMBER_TRUCK = 6,
    BOAT = 7,
    NONE = -1
}

export enum VehicleCategory {
    CAR = 0,
    TRUCK = 1,
    BOAT = 2,
    AGRICULTURAL = 3
}

export enum VehicleEngineState {
    OFF = 0,
    STARTING = 1,
    RUNNING = 2
}

export enum VehicleImpactIntensity {
    NONE = 0,
    LIGHT = 1,
    HEAVY = 2
}

/**
 * High-performance volatile entity state for vehicles.
 * Replaces string-keyed userData lookups in the physics hot-path.
 */
export interface VehicleState {
    velocity: THREE.Vector3;
    angularVelocity: THREE.Vector3;
    suspY: number;
    suspVelY: number;
    prevFwdSpeed: number;
    speed: number;
    throttle: number;
    type: VehicleID;
    engineState: VehicleEngineState;
    _lastNoiseTime: number;

    engineStartTime: number;

    // Voices
    engineVoiceIdx: number;
    skidVoiceIdx: number;
}

/**
 * Cached scene-graph references for O(1) node access.
 * Replaces recursive getObjectByName traversals.
 */
export interface VehicleNodes {
    visualMesh: THREE.Object3D | null;
    chassis: THREE.Object3D | null;

    // Lights
    headlights: THREE.Mesh | null;
    brakeLights: THREE.Mesh[] | null;
    brakeGlow: THREE.Mesh | null; // Pre-allocated ground decal

    sirenBlue: THREE.Mesh | null;
    sirenRed: THREE.Mesh | null;

    // Wheels (for potential spinning/turning animation)
    wheels: THREE.Object3D[];
}

export const VehicleTypes = {
    createState: (): VehicleState => ({
        velocity: new THREE.Vector3(),
        angularVelocity: new THREE.Vector3(),
        suspY: 0,
        suspVelY: 0,
        prevFwdSpeed: 0,
        speed: 0,
        throttle: 0,
        type: VehicleID.STATION_WAGON,
        engineState: VehicleEngineState.OFF,
        _lastNoiseTime: 0,
        engineStartTime: 0,
        engineVoiceIdx: -1,
        skidVoiceIdx: -1
    }),

    createNodes: (): VehicleNodes => ({
        visualMesh: null,
        chassis: null,
        headlights: null,
        brakeLights: null,
        brakeGlow: null,
        sirenBlue: null,
        sirenRed: null,
        wheels: []
    })
};
