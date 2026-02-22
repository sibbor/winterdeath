// Vehicle Database — Source of Truth for all driveable vehicle definitions.
// Pattern follows weapons.ts and zombies.ts.

// --- TYPES ---

export type VehicleType = 'tractor' | 'station_wagon' | 'sedan' | 'police' | 'ambulance' | 'bus' | 'timber_truck' | 'boat';
export type Drivetrain = 'FWD' | 'RWD' | 'AWD';
export type VehicleCategory = 'CAR' | 'TRUCK' | 'BOAT' | 'AGRICULTURAL';

// --- INTERFACE ---

export interface VehicleDef {
    type: VehicleType;
    category: VehicleCategory;
    displayName: string;               // Locale key

    // Physics
    maxSpeed: number;                  // Top speed (km/h)
    acceleration: number;              // Units/sec² force
    brakeForce: number;                // Deceleration multiplier (higher = harder brakes)
    reverseSpeedFraction: number;      // Max reverse speed as fraction of maxSpeed (0.0–1.0)
    turnSpeed: number;                 // Base turning rate (radians/sec)
    mass: number;                      // Kg — affects collision forces
    friction: number;                  // Per-frame velocity decay (0.90–0.99)
    lateralFriction: number;           // Sideways grip (1.0 = full grip, 0.0 = ice)
    drivetrain: Drivetrain;

    // Suspension
    suspensionStiffness?: number;      // Spring constant (0.0 = no bounce, higher = stiffer)
    suspensionDamping?: number;        // How fast bounce settles (0.0–1.0)

    // Collision Damage
    collisionDamageMultiplier: number; // Scales speed-based damage to enemies

    // Dimensions (collision box half-extents)
    size: { x: number; y: number; z: number };

    // Player positioning
    seatOffset: { x: number; y: number; z: number };
    dismountOffset: { x: number; y: number; z: number };
}

// --- DATABASE ---

export const VEHICLES: Record<VehicleType, VehicleDef> = {
    station_wagon: {
        type: 'station_wagon',
        category: 'CAR',
        displayName: 'vehicles.station_wagon',
        maxSpeed: 125,
        acceleration: 7.0,
        brakeForce: 4.0,
        reverseSpeedFraction: 0.3,
        turnSpeed: 50,
        mass: 1400,
        friction: 0.97,
        lateralFriction: 0.85,
        drivetrain: 'FWD',
        suspensionStiffness: 6.0,
        suspensionDamping: 0.6,
        collisionDamageMultiplier: 1.0,
        size: { x: 4.6, y: 1.8, z: 1.8 },
        seatOffset: { x: 0, y: 0.5, z: 0 },
        dismountOffset: { x: 4.0, y: 0, z: 0 }
    },

    sedan: {
        type: 'sedan',
        category: 'CAR',
        displayName: 'vehicles.sedan',
        maxSpeed: 135,
        acceleration: 8.5,
        brakeForce: 5.0,
        reverseSpeedFraction: 0.3,
        turnSpeed: 60,
        mass: 1300,
        friction: 0.97,
        lateralFriction: 0.80,
        drivetrain: 'FWD',
        suspensionStiffness: 8.0,
        suspensionDamping: 0.7,
        collisionDamageMultiplier: 1.0,
        size: { x: 4.5, y: 1.8, z: 1.8 },
        seatOffset: { x: 0, y: 0.5, z: 0 },
        dismountOffset: { x: 4.0, y: 0, z: 0 }
    },

    police: {
        type: 'police',
        category: 'CAR',
        displayName: 'vehicles.police',
        maxSpeed: 150,
        acceleration: 10.0,
        brakeForce: 12.0,
        reverseSpeedFraction: 0.35,
        turnSpeed: 70,
        mass: 1500,
        friction: 0.985,
        lateralFriction: 0.70,
        drivetrain: 'RWD',
        suspensionStiffness: 10.0,
        suspensionDamping: 0.8,
        collisionDamageMultiplier: 1.2,
        size: { x: 4.6, y: 1.8, z: 1.8 },
        seatOffset: { x: 0, y: 0.5, z: 0 },
        dismountOffset: { x: 4.0, y: 0, z: 0 }
    },

    ambulance: {
        type: 'ambulance',
        category: 'TRUCK',
        displayName: 'vehicles.ambulance',
        maxSpeed: 110,
        acceleration: 9.0,
        brakeForce: 7.0,
        reverseSpeedFraction: 0.25,
        turnSpeed: 45,
        mass: 2200,
        friction: 0.96,
        lateralFriction: 0.75,
        drivetrain: 'RWD',
        suspensionStiffness: 5.0,
        suspensionDamping: 0.5,
        collisionDamageMultiplier: 1.5,
        size: { x: 5.2, y: 2.5, z: 2.2 },
        seatOffset: { x: 0, y: 0.8, z: 0 },
        dismountOffset: { x: 4.5, y: 0, z: 0 }
    },

    bus: {
        type: 'bus',
        category: 'TRUCK',
        displayName: 'vehicles.bus',
        maxSpeed: 85,
        acceleration: 4.0,
        brakeForce: 15.0,
        reverseSpeedFraction: 0.15,
        turnSpeed: 30,
        mass: 8000,
        friction: 0.96,
        lateralFriction: 0.90,
        drivetrain: 'RWD',
        suspensionStiffness: 4.0,
        suspensionDamping: 0.4,
        collisionDamageMultiplier: 2.5,
        size: { x: 12.0, y: 3.5, z: 3.5 },
        seatOffset: { x: 0, y: 1.2, z: 0.0 },
        dismountOffset: { x: 5.0, y: 0, z: 0 }
    },

    tractor: {
        type: 'tractor',
        category: 'AGRICULTURAL',
        displayName: 'vehicles.tractor',
        maxSpeed: 40,
        acceleration: 6.0,
        brakeForce: 10.0,
        reverseSpeedFraction: 0.4,
        turnSpeed: 35,
        mass: 3500,
        friction: 0.96,
        lateralFriction: 0.85,
        drivetrain: 'AWD',
        suspensionStiffness: 3.0,
        suspensionDamping: 0.3,
        collisionDamageMultiplier: 1.8,
        size: { x: 2.5, y: 2.0, z: 1.8 },
        seatOffset: { x: 0, y: 0.8, z: 0 },
        dismountOffset: { x: 3.5, y: 0, z: 0 }
    },

    timber_truck: {
        type: 'timber_truck',
        category: 'TRUCK',
        displayName: 'vehicles.timber_truck',
        maxSpeed: 55,
        acceleration: 3.5,
        brakeForce: 20.0,
        reverseSpeedFraction: 0.15,
        turnSpeed: 25,
        mass: 12000,
        friction: 0.95,
        lateralFriction: 0.92,
        drivetrain: 'AWD',
        suspensionStiffness: 3.0,
        suspensionDamping: 0.3,
        collisionDamageMultiplier: 3.0,
        size: { x: 12.0, y: 2.5, z: 2.6 },
        seatOffset: { x: 4.0, y: 1.0, z: 0 },
        dismountOffset: { x: 5.0, y: 0, z: 0 }
    },

    boat: {
        type: 'boat',
        category: 'BOAT',
        displayName: 'vehicles.boat',
        maxSpeed: 15,
        acceleration: 5.0,
        brakeForce: 1.0,
        reverseSpeedFraction: 0.3,
        turnSpeed: 20,
        mass: 250,
        friction: 0.98,
        lateralFriction: 0.45,
        drivetrain: 'RWD',
        collisionDamageMultiplier: 0.3,
        size: { x: 6.5, y: 1.5, z: 2.5 },
        seatOffset: { x: 0, y: 0.5, z: 0 },
        dismountOffset: { x: 3.0, y: 0, z: 0 }
    }
};