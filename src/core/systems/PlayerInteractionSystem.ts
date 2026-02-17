import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { soundManager } from '../../utils/sound';
import { WorldLootSystem } from './WorldLootSystem';
import { getCollectibleById } from '../../content/collectibles';

// --- PERFORMANCE SCRATCHPADS ---
const _v1 = new THREE.Vector3();

// [VINTERDÖD] Shared object for detection returns.
// Eliminates constant { type, pos } garbage allocations.
const _detectionResult = {
    type: null as 'chest' | 'collectible' | 'sector_specific' | null,
    position: new THREE.Vector3(),
    id: null as string | null,
    object: null as THREE.Object3D | null
};

// [VINTERDÖD] Type for ActiveAnimation. 
// OPTIMIZATION: Removed material array caching entirely since we use Scale instead of Opacity.
interface ActiveAnimation {
    obj: THREE.Group;
    startY: number;
    progress: number;
    duration: number;
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

            if (_detectionResult.position && _detectionResult.type) {
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
                    state.triggers,
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

            // --- OPTIMIZATION: ZERO-GC & NO SHADER RECOMPILATION ---
            // Animate scale down to 0 instead of updating material opacity.
            // Eliminates heavy CPU/GPU stuttering and prevents memory leaks.
            const s = 1.0 - anim.progress;
            anim.obj.scale.set(s, s, s);

            if (anim.progress >= 1) {
                session.engine.scene.remove(anim.obj);

                // IMPORTANT FIX: Removed geometry and material dispose() here. 
                // Since we never cloned the geometry, disposing it here would 
                // permanently break any future spawned collectibles of the same type.

                const idx = this.collectibles.indexOf(anim.obj);
                if (idx > -1) {
                    // Swap and Pop on collectibles array
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
     * [VINTERDÖD] Modifies the global _detectionResult instead of returning a new object.
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
                let inRange = false;
                if (t.size) { // Box
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
                    _detectionResult.object = t;
                    return;
                }
            }
        }

        // Scan Physics/Obstacle Objects (Boats, Stations, etc)
        if (sectorState.ctx && sectorState.ctx.interactables) {
            const len = sectorState.ctx.interactables.length;
            for (let i = 0; i < len; i++) {
                const obj = sectorState.ctx.interactables[i];
                if (obj.userData?.isInteractable) {
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

                    // Om denna funktion instansierar Nya material/meshes kan den också lagga. 
                    // Se till att WorldLootSystem använder Object Pooling (återanvänder instanser)!
                    WorldLootSystem.spawnScrapExplosion(session.engine.scene, state.scrapItems, c.mesh.position.x, c.mesh.position.z, c.scrap);

                    const light = c.mesh.getObjectByName('chestLight') as THREE.PointLight | THREE.SpotLight;
                    if (light) {
                        // --- OPTIMIZATION: ZERO SHADER RECOMPILATION ---
                        // Sätt intensity till 0 istället för visible = false.
                        // Detta hindrar Three.js från att rekompilera ALLA shaders i scenen!
                        light.intensity = 0;
                    }

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

        // --- AUDIO SYNC FIX ---
        // Play sound immediately before the React UI cycle starts.
        soundManager.playUiPickup();

        if (this.onCollectibleFound) {
            const cb = this.onCollectibleFound;
            // Lowered timeout from 500ms to 100ms for snappier UI transitions
            setTimeout(() => cb(collectibleId), 100);
        }

        // --- OPTIMIZATION FIX ---
        // Removed massive material cloning loop. Object is just passed to the animation system.
        // The animation system now scales it down instead of changing opacity, saving MS of frame time.
        this.activeAnimations.push({
            obj: collectible,
            startY: collectible.position.y,
            progress: 0,
            duration: 0.8
        });
    }
}