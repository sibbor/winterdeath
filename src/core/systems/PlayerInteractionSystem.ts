import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { soundManager } from '../../utils/sound';
import { WorldLootSystem } from './WorldLootSystem';
import { getCollectibleById } from '../../content/collectibles';

// --- PERFORMANCE SCRATCHPADS ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

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

    // Animation state tracking (Zero-GC approach via object recycling could be added if heavy)
    private activeAnimations: {
        obj: THREE.Group,
        startY: number,
        progress: number,
        duration: number
    }[] = [];

    update(session: GameSessionLogic, dt: number, now: number) {
        const state = session.state;
        const input = session.engine.input.state;

        // 1. Detect nearby interactive objects (Optimized: Throttle to 10hz)
        if (now - this.lastDetectionTime > 100) {
            this.lastDetectionTime = now;
            const detection = this.detectInteraction(
                this.playerGroup.position,
                state.chests,
                state.triggers,
                state.sectorState,
                session.mapId
            );

            state.interactionType = detection.type;
            state.interactionTargetPos = detection.position;
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
                    state,
                    session
                );
            }
        }

        if (!input.e) state.eDepressed = false;

        // 3. Update Active Animations (Synced with Game Loop)
        for (let i = this.activeAnimations.length - 1; i >= 0; i--) {
            const anim = this.activeAnimations[i];
            anim.progress += dt / anim.duration;

            if (anim.progress > 1) anim.progress = 1;

            anim.obj.position.y = anim.startY + anim.progress * 2.0;
            anim.obj.rotation.y += 3.0 * dt;

            anim.obj.traverse((child) => {
                if (child instanceof THREE.Mesh && child.material) {
                    child.material.opacity = 1.0 - anim.progress;
                }
            });

            if (anim.progress >= 1) {
                session.engine.scene.remove(anim.obj);
                // Dispose cloned materials to prevent memory leaks
                anim.obj.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach((m: any) => m.dispose());
                        } else if (child.material) {
                            child.material.dispose();
                        }
                    }
                });

                const idx = this.collectibles.indexOf(anim.obj);
                if (idx > -1) this.collectibles.splice(idx, 1);

                // Swap-and-Pop animation removal
                this.activeAnimations[i] = this.activeAnimations[this.activeAnimations.length - 1];
                this.activeAnimations.pop();
            }
        }
    }

    /**
     * Scans the environment for the closest interactable object.
     * Priority: Collectibles > Triggers > Chests > Mission Objects
     */
    private detectInteraction(
        playerPos: THREE.Vector3,
        chests: any[],
        triggers: any[],
        sectorState: any,
        mapId: number
    ): { type: 'chest' | 'plant_explosive' | 'collectible' | 'knock_on_port' | null, position: THREE.Vector3 | null } {

        // --- 1. Check Collectibles (3.5m radius) ---
        for (let i = 0; i < this.collectibles.length; i++) {
            const c = this.collectibles[i];
            if (playerPos.distanceToSquared(c.position) < 12.25) { // 3.5 * 3.5
                _v1.copy(c.position);
                return { type: 'collectible', position: _v1.clone() };
            }
        }

        // --- 2. Check Area Triggers (Portals/Events) ---
        for (let i = 0; i < triggers.length; i++) {
            const t = triggers[i];
            // Only 'event' usage type or 'portal' with interaction?
            // Current trigger logic is mostly auto, but for Key Interactions:
            if (t.usage === 'knock_on_port') {
                if (playerPos.distanceToSquared(t.position) < t.radius * t.radius) {
                    return { type: 'knock_on_port', position: t.position.clone() };
                }
            }
        }

        // --- 3. Check Chests (3.5m radius) ---
        for (let i = 0; i < chests.length; i++) {
            const chest = chests[i];
            if (!chest.opened && playerPos.distanceToSquared(chest.mesh.position) < 12.25) {
                _v1.copy(chest.mesh.position);
                return { type: 'chest', position: _v1.clone() };
            }
        }

        // --- 4. Check Mission Extraction (Bus/Explosive) ---
        // ONLY SECTOR 1 (Map ID 0)
        if (mapId === 0 && sectorState && !sectorState.busExploded && sectorState.ctx?.busObject) {
            if (sectorState.busCanBeInteractedWith) {
                const bus = sectorState.ctx.busObject;
                if (playerPos.distanceToSquared(bus.position) < 64) { // 8.0 * 8.0
                    _v1.copy(bus.position);
                    _v1.y = 2.5;
                    return { type: 'plant_explosive', position: _v1.clone() };
                }
            }
        }

        return { type: null, position: null };
    }

    private handleInteraction(
        type: string | null,
        playerPos: THREE.Vector3,
        chests: any[],
        state: any,
        session: GameSessionLogic
    ) {
        if (!type) return;

        if (type === 'collectible') {
            this.handleCollectiblePickup(playerPos, session);
        }
        else if (type === 'chest') {
            // Find the specific chest we are interacting with
            for (let i = 0; i < chests.length; i++) {
                const c = chests[i];
                if (!c.opened && playerPos.distanceToSquared(c.mesh.position) < 12.25) {
                    c.opened = true;
                    soundManager.playOpenChest();
                    WorldLootSystem.spawnScrapExplosion(session.engine.scene, state.scrapItems, c.mesh.position.x, c.mesh.position.z, c.scrap);

                    const light = c.mesh.getObjectByName('chestLight');
                    if (light) light.visible = false; // Optimize: Hide instead of remove to avoid shader recompilation lag

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
        else if (type === 'plant_explosive') {
            if (state.sectorState) {
                state.sectorState.busInteractionTriggered = true;
            } else {
                this.onSectorEnded(true);
            }
        }
        else if (type === 'knock_on_port') {
            const knockTrigger = state.triggers.find((t: any) => t.id === 's2_cave_knock_shelter_port');
            if (knockTrigger) {
                knockTrigger.triggered = true;
                soundManager.playUiConfirm();
            }
        }
    }

    private handleCollectiblePickup(playerPos: THREE.Vector3, session: GameSessionLogic) {
        let collectible: THREE.Group | null = null;

        // Find the closest one
        for (let i = 0; i < this.collectibles.length; i++) {
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

        // Clone materials only once to avoid affecting global assets
        obj.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
                child.material = child.material.clone();
                child.material.transparent = true;
            }
        });

        // Register animation to be handled in update()
        this.activeAnimations.push({
            obj,
            startY: obj.position.y,
            progress: 0,
            duration: 0.8
        });
    }
}