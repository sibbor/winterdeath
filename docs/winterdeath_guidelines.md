# Vinterdöd — Technical Guidelines

## Architecture Rules
- **ECS-Split**: Logic systems manage data coordinates/variables. Renderers/FX systems handle presentation.
- **Dual-Clock Sync**: 
  - `simTime`: Physics, AI, combat, cooldowns. Freezes during pauses.
  - `renderTime`: Wind, water, weather, animators, UI sways. Never stops.

## Directory Structure Source of Truth
- `src/core/systems/`: Core gameplay loops and orchestration.
- `src/core/world/`: `SpatialGrid.ts` (mandatory proximity queries) and `ChunkManager.ts`.
- `src/content/`: Configuration data (`weapons.ts`, `perks.ts`, `constants.ts`).
- `src/components/ui/`: React UI layer. High-frequency data uses `HudStore` (Swap-and-Flip pre-allocated buffer A/B tree) to ensure Zero-GC.

## Performance Requirements
- No runtime allocations in updates. 
- Avoid heavy CPU calculations inside loops. Leverage V8 optimizations (monomorphic functions, contiguous arrays).
- Register all new assets in `AssetPreloader.ts` for initialization warmup.