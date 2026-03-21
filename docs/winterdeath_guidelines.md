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
- **HudSystem & HudStore**: `HudSystem.ts` extracts data from the game loop and updates `HudStore`. React components subscribe to this store to ensure **Zero Re-renders** of the main tree during combat.

## ⚡ Performance Optimization (Zero-GC)
- **SpatialGrid**: `src/core/world/SpatialGrid.ts` is mandatory for finding nearby loot (`WorldLootSystem`), enemies, or obstacles. Do not use $O(N^2)$ loops.
- **AssetPreloader**: Generic warmup for ALL models, materials, and sounds (`src/core/systems/AssetPreloader.ts`).
- **Memory Management**: Use module-level scratchpads (`const _v1 = new THREE.Vector3()`). Use "Swap-and-Pop" to remove items from arrays.