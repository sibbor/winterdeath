/**
 * VINTERDÖD: Centralized Interaction Types.
 * Numeric enums (SMI) are used for O(1) matching and to prevent heap allocations
 * during high-frequency interaction checking in PlayerInteractionSystem.
 */
export enum InteractionType {
  NONE = 0,
  COLLECTIBLE = 1,
  CHEST = 2,
  VEHICLE = 3,
  SECTOR_SPECIFIC = 4,
  PLANT_EXPLOSIVE = 5,
  KNOCK_ON_PORT = 6
}

export enum InteractionShape {
  BOX = 0,
  SPHERE = 1,
  CYLINDER = 2
}
