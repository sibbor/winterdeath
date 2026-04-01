# Vinterdöd: Technical Guidelines & Architecture

## 🧠 System Architecture: Strict Separation of Concerns
The engine relies on modular systems (`src/core/systems/`) inheriting from a base `System.ts` or acting as singletons.
- **Data & State**: Logic systems (e.g., `PlayerCombatSystem`, `SectorSystem`) handle coordinates and variables.
- **Presentation**: Renderers (`ZombieRenderer`, `CorpseRenderer`) and FX systems (`FXSystem`) listen to logic states to update the scene.

## 🏗 Core Systems Breakdown
- **Combat Pipeline**: `InputManager` -> `PlayerCombatSystem` -> `WeaponHandler` -> `ProjectileSystem` -> `CollisionResolution` -> `DeathSystem`.
- **Interaction Pipeline**: `InputManager` -> `PlayerInteractionSystem` -> Raycast against `ctx.obstacles` or triggers -> `HudSystem` (prompts).
- **Environment**: `WindSystem` (updates global wind uniforms), `WaterSystem` (procedural flow), `WeatherSystem` (snow/fog particles).

## 🗺 World Generation (3-Tier + Environment)
1.  **ObjectGenerator**: Builds individual `THREE.Group` or `Mesh` assets (Atoms).
2.  **PathGenerator**: Spline-based assemblies (roads, fences).
3.  **EnvironmentGenerator**: Mass-population of trees and rocks.
4.  **SectorGenerator**: Orchestrates placement and registers colliders.

## 🎨 UI & HUD Performance
- **Directory Structure**:
  - `src/components/ui/core/`: Global components.
  - `src/components/ui/hud/`: Active gameplay UI.
  - `src/components/ui/layout/`: Wrappers like `ScreenModalLayout`.
  - `src/components/ui/screens/`: Routed views (`camp`, `game`, `shared`).
- **HudSystem & HudStore**: `HudSystem.ts` extracts data from the game loop and updates `HudStore`. 
  - **Double Buffering**: Uses a **Swap-and-Flip** pattern by keeping two pre-allocated state trees (Buffer A/B). Swapping the reference each frame triggers React's shallow equality (`===`) for a re-render while maintaining Zero-GC.


## ⚡ Performance Optimization (Zero-GC)
- **SpatialGrid**: `src/core/world/SpatialGrid.ts` is mandatory for finding nearby loot (`WorldLootSystem`), enemies, or obstacles. Do not use $O(N^2)$ loops.
- **AssetPreloader**: Generic warmup for ALL models, materials, and sounds (`src/core/systems/AssetPreloader.ts`).
- **Memory Management**: Use module-level scratchpads (`const _v1 = new THREE.Vector3()`). Use "Swap-and-Pop" to remove items from arrays.

## ⏲ Clock Synchronization (Dual-Clock)
To support cinematic pauses and smooth procedural animations, the engine maintains two distinct clocks in the `RuntimeState`:
- **`simTime`**: The simulation clock. Used for physics, AI, cooldowns, and gameplay logic. This clock **freezes** during cinematic soft pauses or hard pauses.
- **`renderTime`**: The visual clock. Used for breathing, swaying, wind, and HUD effects. This clock **never stops**, ensuring the world remains "alive" even when gameplay is suspended.
- **System Rule**: Environmental systems (Wind, Water, Weather) and Animators must use `renderTime`. Physics and Combat systems must use `simTime`.