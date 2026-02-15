# Vinterdöd: Technical Guidelines & Architecture

Always follow these rules when developing for **Vinterdöd**.

## 🏗 World Generation Architecture
Maintain a strict 3-tier separation for all world-building logic:

### 1. ObjectGenerator.ts (Atoms & Area Fillers)
- **Atoms**: Logic for building individual 3D models (trees, containers, vehicles).
- **Area Fillers**: Logic for filling areas (forests, wheat fields, debris fields).
- **Rules**: Should return `THREE.Group` or `THREE.Mesh`. Does NOT handle global positioning or gameplay systems (unless requested for specific sub-components).

### 2. PathGenerator.ts (Linear Assemblies)
- **Linear paths**: Roads, dirt paths, rail tracks.
- **Assemblies**: Fences, hedges, stone walls, embankments.
- **Rules**: Uses coordinates (`Vector3[]`) to create geometries that follow a spline. Can call `ObjectGenerator` to spawn repeating assets (like fence posts).

### 3. SectorGenerator.ts (SectorGenerator.ts - Orchestrator)
- **Glue Logic**: The high-level API used in `SectorN.ts` files.
- **System Integration**: Responsible for adding objects to the scene AND connecting them to gameplay systems (adding colliders to `ctx.obstacles`, spawning triggers, etc.).
- **Responsibility**: "ObjectGenerator knows how to build a tree; SectorGenerator knows that the tree belongs at (X, Z) and should have a collider."

---

## ⚙️ Game Engine
- **Singleton Architecture**: The `Engine` class (in `src/core/engine/Engine.ts`) is a singleton. Access it via `Engine.getInstance()`.
- **Game Loop**:
  - `onUpdate(dt)`: Dedicated for logic, movement, and physics. `dt` is clamped delta time.
  - `onRender()`: Dedicated for rendering. If not provided, the engine defaults to `renderer.render(scene, camera)`.
- **Scene Management**: Use `pushScene(newScene)` and `popScene()` to handle overlays or sub-scenes (like interior bunkers) while preserving the main world state.

## 🎨 Graphics
- **Rendering**: Three.js `WebGLRenderer` with `high-performance` power preference.
- **Shadows**: Managed via `SHADOW_PRESETS`. Never set shadow properties directly on the renderer; use `engine.updateSettings({ shadows, shadowMapType })`.
- **Effects (FXSystem)**:
  - **Decals**: Use `FXSystem.spawnDecal` for persistent marks (blood pools, scorch marks). Limit is 250 per scene.
  - **Particles**: Use `FXSystem.spawnPart` for transient effects (smoke, fire, gore, glass).
- **Weather**: Managed via `WeatherSystem.ts`. Supports snow, rain, and ground fog using particle pools.

## 🔊 Sound
- **Manager**: `SoundManager` (in `src/utils/sound.ts`) is the main interface.
- **Sound Libraries**: Centralized in `src/utils/audio/SoundLib.ts`. Grouped by `WeaponSounds`, `UiSounds`, `VoiceSounds`, etc.
- **Dynamic Synthesis**: Supports real-time synthesized sounds for ambiance, such as the `startCampfire()` crackle and `updateRadioStatic(intensity)` effect.

## 🎮 Input & Controllers
- **InputState**: The `InputManager` tracks a unified `InputState` including:
  - **Keyboard**: `w, a, s, d, space, r, e, 1-4`.
  - **Mouse**: `fire` (left click), `aimVector`, `cursorPos`, and `locked` (pointer lock status).
  - **Controllers**: `joystickMove` and `joystickAim` for mobile/gamepad support.
- **Pointer Lock**: Always use `input.requestPointerLock(element)` for immersive controls.

## 🗺 Maps: Sectors
- **Lifecycle**: individual levels (Sectors) handle their own initialization (`onInit`) and per-frame logic (`onUpdate`).
- **State Persistence**: Sector-specific state should be kept in the `sectorState` object. Global state (xp, items) belongs in `gameState`.
- **SectorGenerator**: Always use the 3-tier architecture defined in the World Generation section for building sectors.

## 🏕 Hub: Camp
- **React-3D Hybrid**: The Camp (in `src/components/camp/Camp.tsx`) is a React component that mounts the 3D `Engine`.
- **Interactivity**:
  - **Raycasting**: Handled via `THREE.Raycaster` within React. Station and family member interaction is triggered by `userData.id` matching specific constants (e.g., `'armory'`, `'sectors'`).
  - **Modals**: Station interactions open React-based modals (e.g., `ScreenArmory.tsx`) that overlay the 3D scene.
- **CampWorld**: The 3D layout is defined in `CampWorld.ts`. It uses deterministic "seeded" randomness for tree placement to ensure visual consistency.

## 🔄 Game Loop & Flow
1. **Prologue**: Narrative introduction.
2. **The Camp (Hub)**:
   - Upgrade weapons in the Armory.
   - Invest skill points in the Medical Cabinet.
   - Review story progress in the Adventure Log.
   - Choose the next mission via the Sector Overview.
3. **Sector (Mission)**:
   - Combat, exploration, and objective completion.
   - Successful extraction returns the player to Camp with rewards (scrap, xp).
4. **Game State**: Managed globally and persisted to `localStorage`. `GameState` tracks found family members, level progress, and unlocked gear.

## 🍎 Physics & Collisions
- **Resolver**: Use `resolveCollision` (in `src/utils/physics.ts`) for top-down sphere-vs-box or sphere-vs-sphere interactions.
- **Obstacles**: All solid objects must be pushed to `ctx.obstacles` within the `SectorGenerator` logic to enable collision detection.
- **Spatial Queries (Zero-GC)**: NEVER iterate over the global `state.enemies` or global obstacle arrays to find distances. ALWAYS use `ctx.collisionGrid.getNearbyEnemies(pos, radius)` and `ctx.collisionGrid.getNearbyObstacles(pos, radius)`. Beware of shared internal buffers in SpatialGrid; do not nest queries.

## ⚡ Performance & Optimization
- **AssetPreloader**: To prevent runtime stutters (jank) when spawning new objects or triggering effects:
  - **Register New Assets**: Every new geometry, material, or unique model must be added to `src/core/systems/AssetPreloader.ts`.
  - **Shader Warmup**: The preloader forces the GPU to compile shaders before gameplay starts. This is critical for objects created or modified at runtime (e.g., transparent clones for pickup animations).
  - **Animations**: Skinned meshes must be "warmed up" in the preloader to ensure animation shaders are ready.
  - AssetLoader loads static bump maps from disk (cached).
  - procedural draws heavy textures with code (cached after first run).
  - materials combines these into ready material instances.
  - AssetPreloader ensures all this happens before the player sees the first frame.

- **Zero-GC & Memory Management (Update Loops)**:
  - **No Allocation in Hot Paths**: NEVER use `new THREE.Vector3()`, `new THREE.Color()`, `new THREE.Quaternion()`, or `.clone()` inside `update()`, `useFrame()`, or any function called frequently.
  - **Module-Level Scratchpads**: Always declare reusable vectors globally at the top of the file (e.g., `const _v1 = new THREE.Vector3();`). Use `.set()`, `.copy()`, or `.setHex()` to mutate them instead of creating new ones.
  - **No Object/Array Literals**: Do not create inline arrays `[]` or objects `{}` inside update loops.
  - **Arrow Functions**: Do not define inline arrow functions inside hot paths or loops, as they allocate memory every frame.
  - **Array Iteration**: NEVER use `.forEach()`, `.map()`, or `.filter()` inside hot paths. Always use a standard `for` loop (`for (let i = 0; i < arr.length; i++)`).
  - **Array Removal**: NEVER use `.splice()` inside an update loop. Always use the **Swap-and-Pop** method: 
    ```typescript
    array[index] = array[array.length - 1]; 
    array.pop();
    ```

- **Graphical Optimization & Math**:
  - **Object Pooling**: Mandatory for particles, projectiles, enemies, and decals. Always explicitly reset an object's state (position, rotation, life) when popping it from a pool.
  - **Instancing**: For large quantities of identical geometry (blood, debris, grass), ALWAYS use `THREE.InstancedMesh`.
  - **Math Shortcuts**: ALWAYS use `.distanceToSquared()` instead of `.distanceTo()`. Compare against the squared threshold (e.g., `distSq < 144.0` instead of `dist < 12.0`) to avoid CPU-heavy square-root calculations.
  - **Hoist Trigonometry**: Calculate constant or predictable math (`Math.sin`, `Math.cos`) outside loops where possible.

## 💾 Persistence
- **GameState**: The `DEFAULT_STATE` in `src/utils/persistence.ts` defines the save file structure.
- **LocalStorage**: Game state is saved to `localStorage` under `winterDeathSave_v1`.

---

## 🔤 Strings & Translations
- **No Hardcoding**: Never hardcode UI strings in components or sector files.
- **Locales**:
  - Add English strings to `src/locales/en.ts`.
  - Add Swedish translations to `src/locales/sv.ts`.
- **Usage**: Reference them via their ID (e.g., `ctx.t('ui.chest')`).

---

## 📦 Object Lifecycle
- **ObjectGenerator**: Always add new 3D props/objects to `ObjectGenerator.ts` using the existing patterns (geometry + materials).
- **Metadata**: Add relevant gameplay metadata to `userData`.

---

## 🌍 Narrative Context
- Always refer to `docs/STORY.md` for lore, sector descriptions, and dialogue tone to ensure consistency with the game's atmosphere.

---

## 💬 Code Style
- **Comments**: Write all source code comments in English.