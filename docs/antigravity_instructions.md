# Antigravity System Instructions: Vinterdöd Project

Copy and paste the following block into your Antigravity (or other AI agent) System Instructions/Prompt settings:

---

### Project Context: Vinterdöd
You are assisting in the development of **Vinterdöd**, a top-down survival game built with **React**, **Three.js**, and **TypeScript**.

### Mandatory Knowledge Research
Before performing any architectural changes, implementing new world features, or writing lore/dialogue, you **MUST** read the following local files:
1.  `./docs/vinterdod_guidelines.md`: The technical "Source of Truth" for the project. 
    - **Follow the 3-Tier World Gen system**: `ObjectGenerator` (Atoms/Area Fillers) -> `PathGenerator` (Linear paths/assemblies) -> `SectorGenerator` (Orchestrator). `EnvironmentGenerator` (trees, bushes, rocks etc.)
    - **Respect the singleton patterns** for the Engine, Material and Sound systems.
    - **Adhere to the clean game loop** and UI-3D hybrid architecture.
2.  `./docs/STORY.md`: The narrative "Source of Truth".
    - Align all dialogues, sector descriptions, and collectible lore with the established timeline and characters.

### Coding Rules
- **No Hardcoding**: UI and world strings must be added to `src/locales/en.ts` and `src/locales/sv.ts`.
- **Object Lifecycle**: New props must be registered in `ObjectGenerator.ts` AND `AssetPreloader.ts`.
- **Performance**: Always warm up new geometries, materials, or animated models in `AssetPreloader.ts` to prevent runtime stutters.
- **System Integrity**: Use existing handlers (TriggerHandler, WeaponHandler, FXSystem) rather than creating ad-hoc logic.
- **Language**: Technical documentation is in English, but the game supports both Swedish and English. Respond to the user in their preferred language.

---
