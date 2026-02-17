import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { soundManager } from '../../utils/sound';
import { WorldLootSystem } from './WorldLootSystem';
import { getCollectibleById } from '../../content/collectibles';

// --- PERFORMANCE SCRATCHPADS ---
const _v1 = new THREE.Vector3();

// [VINTERDÖD] Delat objekt för returvärden från detektion.
// Eliminering av ständiga { type, pos } allokeringar.
const _detectionResult = {
    type: null as 'chest' | 'collectible' | 'sector_specific' | null,
    position: new THREE.Vector3(),
    id: null as string | null,
    object: null as THREE.Object3D | null
};

// [VINTERDÖD] Typ för cachad material-array för Zero-GC animering
interface ActiveAnimation {
    obj: THREE.Group;
    startY: number;
    progress: number;
    duration: number;
    materials: THREE.Material[]; // Pre-cachade material
}

export class PlayerInteractionSystem implements System {
    id = 'player_interaction';
    public onCollectibleFound?: (collectibleId: string) => void;
    private lastDetectionTime: number = 0;

    constructor(
        private playerGroup: THREE.Group,
        private onSectorEnded: (isExtraction: boolean) => void,
        private collectibles: THREE.Group[],
        onCollectibleFound?: (collectibleId: string) => void
    ) {
        this.onCollectibleFound = onCollectibleFound;
    }

    private activeAnimations: ActiveAnimation[] = [];

    update(session: GameSessionLogic, dt: number, now: number) {
        const state = session.state;
        const input = session.engine.input.state;

        // 1. Detect nearby interactive objects (Optimized: Throttle to 10hz)
        if (now - this.lastDetectionTime > 100) {
            this.lastDetectionTime = now;
            this.detectInteraction(
                this.playerGroup.position,
                state.chests,
                state.triggers,
                state.sectorState,
                session.mapId
            );

            state.interactionType = _detectionResult.type;

            let label = (_detectionResult.object?.userData?.interactionLabel as string) || null;
            // [VINTERDÖD] Dynamic label for vehicles: Exit vs Enter
            if (state.activeVehicle && _detectionResult.object === state.activeVehicle) {
                label = 'ui.exit_vehicle';
            }
            state.interactionLabel = label;

            if (_detectionResult.position) {
                if (!state.interactionTargetPos) state.interactionTargetPos = new THREE.Vector3();
                state.interactionTargetPos.copy(_detectionResult.position);
            } else {
                state.interactionTargetPos = null;
            }
        }

        // 2. Handle Interaction Press (Edge Triggered)
        if (input.e && !state.eDepressed) {
            state.eDepressed = true;

            // Re-validate if we have a target
            if (state.interactionType) {
                this.handleInteraction(
                    state.interactionType,
                    this.playerGroup.position,
                    state.chests,
                    state.triggers, // [VINTERDÖD] Lagt till triggers här för hanteringen
                    state,
                    session
                );
            }
        }

        if (!input.e) state.eDepressed = false;

        // 3. Update Active Animations (Synced with Game Loop)
        const animLen = this.activeAnimations.length;
        for (let i = animLen - 1; i >= 0; i--) {
            const anim = this.activeAnimations[i];
            anim.progress += dt / anim.duration;

            if (anim.progress > 1) anim.progress = 1;

            anim.obj.position.y = anim.startY + anim.progress * 2.0;
            anim.obj.rotation.y += 3.0 * dt;

            // [VINTERDÖD] Platt iteration över cachade material istället för Object3D-traversering
            const op = 1.0 - anim.progress;
            const mats = anim.materials;
            const mLen = mats.length;
            for (let m = 0; m < mLen; m++) {
                mats[m].opacity = op;
            }

            if (anim.progress >= 1) {
                session.engine.scene.remove(anim.obj);

                // [VINTERDÖD] Dispose itereras via den platta cachen också
                for (let m = 0; m < mLen; m++) {
                    mats[m].dispose();
                }

                // Radera mesh/geom från scene (bara ifall de ligger kvar)
                anim.obj.traverse((child: any) => {
                    if (child.isMesh && child.geometry) {
                        child.geometry.dispose();
                    }
                });

                const idx = this.collectibles.indexOf(anim.obj);
                if (idx > -1) {
                    // Swap and Pop på collectibles array
                    this.collectibles[idx] = this.collectibles[this.collectibles.length - 1];
                    this.collectibles.pop();
                }

                // Swap-and-Pop animation removal
                this.activeAnimations[i] = this.activeAnimations[this.activeAnimations.length - 1];
                this.activeAnimations.pop();
            }
        }
    }

    /**
     * Scans the environment for the closest interactable object.
     * Priority: Collectibles > Triggers > Chests > Mission Objects
     * [VINTERDÖD] Modifierar den globala _detectionResult istället för att returnera ett nytt objekt.
     */
    private detectInteraction(
        playerPos: THREE.Vector3,
        chests: any[],
        triggers: any[],
        sectorState: any,
        mapId: number
    ): void {

        // --- 1. Check Collectibles (3.5m radius) ---
        const cLen = this.collectibles.length;
        for (let i = 0; i < cLen; i++) {
            const c = this.collectibles[i];
            if (playerPos.distanceToSquared(c.position) < 12.25) { // 3.5 * 3.5
                _detectionResult.position.copy(c.position);
                _detectionResult.type = 'collectible';
                return;
            }
        }

        // --- 2. Check Chests (3.5m radius) ---
        const chLen = chests.length;
        for (let i = 0; i < chLen; i++) {
            const ch = chests[i];
            if (!ch.opened && playerPos.distanceToSquared(ch.mesh.position) < 12.25) {
                _detectionResult.position.copy(ch.mesh.position);
                _detectionResult.type = 'chest';
                _detectionResult.object = ch.mesh;
                return;
            }
        }

        // --- 4. Check Generic Sector Interactables (Triggers/Vehicles/Stations) ---
        // Scan Trigger Volumes
        const tLen = triggers.length;
        for (let i = 0; i < tLen; i++) {
            const t = triggers[i];
            if (t.userData?.isInteractable) {
                // Check dist based on radius or box
                let inRange = false;
                if (t.size) { // Box
                    // Simplified AABB check relative to rotation would be needed here, 
                    // but for now we fallback to radius check on center for interaction prompts usually
                    // or strict containment. Let's use simple distance for prompt visibility
                    const dist = Math.max(t.size.width, t.size.depth) * 0.7; // Approx
                    if (playerPos.distanceToSquared(t.position) < dist * dist) inRange = true;
                } else {
                    const r = t.radius || 2.0;
                    if (playerPos.distanceToSquared(t.position) < r * r) inRange = true;
                }

                if (inRange) {
                    _detectionResult.position.copy(t.position);
                    _detectionResult.type = 'sector_specific';
                    _detectionResult.id = t.userData.interactionId;
                    _detectionResult.object = t; // Triggers are objects in our system? No, they are data. 
                    // Wait, triggers in RuntimeState are just data. We might need the mesh if it exists.
                    // The scan should probably look at sectorState.ctx.obstacles OR specific meshes if needed.
                    // For triggers that are just zones, we pass null object? 
                    // Actually, many "triggers" are meshes with userData.
                    return;
                }
            }
        }

        // Scan Physics/Obstacle Objects (Boats, Stations, etc)
        // This relies on them being in a known list or checking nearby entities.
        // For performance, we should ideally have a list of Key Interactables.
        // For now, let's check sectorState.ctx.obstacles if available, or just fallback to known types
        if (sectorState.ctx && sectorState.ctx.interactables) {
            const len = sectorState.ctx.interactables.length;
            for (let i = 0; i < len; i++) {
                const obj = sectorState.ctx.interactables[i];
                if (obj.userData?.isInteractable) {
                    // Use mesh radius or fixed 3m
                    const r = obj.userData.interactionRadius || 4.0;
                    if (playerPos.distanceToSquared(obj.position) < r * r) {
                        _detectionResult.position.copy(obj.position);
                        _detectionResult.type = 'sector_specific';
                        _detectionResult.id = obj.userData.interactionId;
                        _detectionResult.object = obj;
                        return;
                    }
                }
            }
        }

        _detectionResult.type = null;
        _detectionResult.id = null;
        _detectionResult.object = null;
    }

    private handleInteraction(
        type: string | null,
        playerPos: THREE.Vector3,
        chests: any[],
        triggers: any[],
        state: any,
        session: GameSessionLogic
    ) {
        if (!type) return;

        if (type === 'collectible') {
            this.handleCollectiblePickup(playerPos, session);
        }
        else if (type === 'chest') {
            const len = chests.length;
            for (let i = 0; i < len; i++) {
                const c = chests[i];
                if (!c.opened && playerPos.distanceToSquared(c.mesh.position) < 12.25) {
                    c.opened = true;
                    soundManager.playOpenChest();
                    WorldLootSystem.spawnScrapExplosion(session.engine.scene, state.scrapItems, c.mesh.position.x, c.mesh.position.z, c.scrap);

                    const light = c.mesh.getObjectByName('chestLight');
                    if (light) light.visible = false;

                    // Lid animation
                    if (c.mesh.children[1]) {
                        c.mesh.children[1].rotation.x = -Math.PI / 2;
                        c.mesh.children[1].position.y -= 0.5;
                    }

                    state.chestsOpened++;
                    if (c.type === 'big') state.bigChestsOpened++;
                    break;
                }
            }
        }
        else if (type === 'sector_specific') {
            // Dispatch to RuntimeState for SectorSystem to consume
            state.interactionRequest = {
                id: _detectionResult.id!,
                object: _detectionResult.object!,
                type: 'sector_specific'
            };
        }
    }

    private handleCollectiblePickup(playerPos: THREE.Vector3, session: GameSessionLogic) {
        let collectible: THREE.Group | null = null;

        const len = this.collectibles.length;
        for (let i = 0; i < len; i++) {
            const c = this.collectibles[i];
            if (playerPos.distanceToSquared(c.position) < 12.25) {
                collectible = c;
                break;
            }
        }

        if (!collectible || collectible.userData.pickedUp) return;

        const collectibleId = collectible.userData.collectibleId;
        if (!getCollectibleById(collectibleId)) return;

        collectible.userData.pickedUp = true;
        soundManager.playUiPickup();

        if (this.onCollectibleFound) {
            const cb = this.onCollectibleFound;
            setTimeout(() => cb(collectibleId), 500);
        }

        // --- Optimized Pickup Animation (Managed by System Update) ---
        const obj = collectible;
        const cachedMaterials: THREE.Material[] = [];

        // Clone materials only once, and cache them to avoid per-frame traversal
        obj.traverse((child: any) => {
            if (child.isMesh && child.material) {
                // If it's an array of materials (multi-material mesh), we handle that too
                if (Array.isArray(child.material)) {
                    const clonedMats = [];
                    for (let i = 0; i < child.material.length; i++) {
                        const cm = child.material[i].clone();
                        cm.transparent = true;
                        clonedMats.push(cm);
                        cachedMaterials.push(cm);
                    }
                    child.material = clonedMats;
                } else {
                    child.material = child.material.clone();
                    child.material.transparent = true;
                    cachedMaterials.push(child.material);
                }
            }
        });

        // Register animation to be handled in update()
        this.activeAnimations.push({
            obj,
            startY: obj.position.y,
            progress: 0,
            duration: 0.8,
            materials: cachedMaterials
        });
    }
}