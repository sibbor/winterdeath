export enum WaterFloraType {
    LILY = 0,
    SEAWEED = 1
}

export enum WaterBodyType {
    LAKE = 0,
    POND = 1,
    POOL = 2,
    STREAM = 3,
    WATERFALL = 4
}

export enum WaterShape {
    RECT = 0,
    CIRCLE = 1
}

export interface WaterBodyDef {
    shape: WaterShape;
    buoyancyForce: number;
    ambientRippleChance: number;
    maxDepth: number;
}
