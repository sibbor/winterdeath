import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { soundManager } from '../../utils/sound';
import { WorldLootSystem } from './WorldLootSystem';
import { getCollectibleById } from '../../content/collectibles';
import { FXSystem } from './FXSystem';

// --- PERFORMANCE SCRATCHPADS ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

// Shared object for detection returns to eliminate garbage allocation
const _detectionResult = {
    type: null as 'chest' | 'collectible' | 'sector_specific' | 'vehicle' | null,
    position: new THREE.Vector3(),
    id: null as string | null,
    object: null as THREE.Object3D | null
};

interface ActiveAnimation {
    obj: THREE.Group;
    startPos: THREE.Vector3;
    progress: number;
    duration: number;
    collectibleId?: string;
}

export class PlayerInteractionSystem implements System {
    id = 'player_interaction';
    public onCollectibleDiscovered?: (collectibleId: string) => void;
    private lastDetectionTime: number = 0;
    private activeAnimations: ActiveAnimation[] = [];

    constructor(
        private playerGroup: THREE.Group,
        private onSectorEnded: (isExtraction: boolean) => void,
        private collectibles: THREE.Group[],
        onCollectibleDiscovered?: (collectibleId: string) => void
    ) {
        this.onCollectibleDiscovered = onCollectibleDiscovered;
    }

    update(session: GameSessionLogic, dt: number, now: number) {
        const state = session.state;
        const input = session.engine.input.state;

        // 1. Detect nearby interactive objects (Throttled to 10hz)
        if (now - this.lastDetectionTime > 100) {
            this.lastDetectionTime = now;
            this.detectInteraction(
                this.playerGroup.position,
                state.chests,
                state.triggers,
                state.sectorState,
                state
            );

            state.interactionType = _detectionResult.type;

            let label = (_detectionResult.object?.userData?.interactionLabel as string) || null;

            // Dynamic label for vehicles
            if (state.activeVehicle && _detectionResult.object === state.activeVehicle) {
                label = 'ui.exit_vehicle';
            } else if (_detectionResult.type === 'vehicle') {
                label = 'ui.enter_vehicle';
            }

            state.interactionLabel = label;

            if (_detectionResult.position && _detectionResult.type) {
                if (!state.interactionTargetPos) state.interactionTargetPos = new THREE.Vector3();
                state.interactionTargetPos.copy(_detectionResult.position);
                state.hasInteractionTarget = true;
            } else {
                state.hasInteractionTarget = false;
            }
        }

        // 2. Handle Interaction Press (Edge Triggered)
        if (input.e) {
            if (!state.eDepressed) {
                state.eDepressed = true;

                if (state.interactionType) {
                    const isExit = (state.interactionType === 'vehicle' && state.activeVehicle && _detectionResult.object === state.activeVehicle);

                    if (!isExit) {
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
            }
        } else {
            state.eDepressed = false;
        }

        // 3. Update Active Animations (Synced with Game Loop)
        const animLen = this.activeAnimations.length;
        for (let i = animLen - 1; i >= 0; i--) {
            const anim = this.activeAnimations[i];
            anim.progress += dt / anim.duration;

            if (anim.progress > 1) anim.progress = 1;

            // --- 1. SEPARERA YXAN FRÅN EFFEKTERNA ---
            // Mjuk inbromsning (ease-out).
            const easeOut = 1.0 - Math.pow(1.0 - anim.progress, 3);

            // Keep the main group fixed. By zeroing the rotation, local offsets perfectly match world offsets.
            anim.obj.position.copy(anim.startPos);
            anim.obj.rotation.set(0, 0, 0);

            const targetX = (this.playerGroup.position.x - anim.startPos.x) * easeOut;
            const targetZ = (this.playerGroup.position.z - anim.startPos.z) * easeOut;

            const fxTargetY = anim.progress * 15.0; // Shoot up 15 meters

            // Iterate over all parts to separate behavior
            const children = anim.obj.children;
            const childLen = children.length;
            for (let j = 0; j < childLen; j++) {
                const child = children[j];
                if (child.name === 'collectibleRing' || child.name === 'collectibleBeam' || child.name === 'collectibleInnerRing') {
                    // Start relative positions + new vertical offset
                    if (child.name === 'collectibleRing') child.position.set(0, 0.05 + fxTargetY, 0);
                    else if (child.name === 'collectibleInnerRing') child.position.set(0, 1.0 + (fxTargetY * 0.8), 0);
                    else if (child.name === 'collectibleBeam') child.position.set(0, 2.0 + fxTargetY, 0);

                    // Fade out and shrink effects over animation
                    const fxScale = 1.0 - anim.progress;
                    if (child.name === 'collectibleBeam') {
                        child.scale.set(0.05 * Math.max(0.001, fxScale), 4.0, 0.05 * Math.max(0.001, fxScale));
                    } else {
                        child.scale.setScalar(Math.max(0.001, fxScale));
                    }
                } else if ((child instanceof THREE.Mesh || child instanceof THREE.Group) && !child.name.startsWith('collectible')) {
                    // Skip internal lights explicitly
                    if ((child as any).isLight) continue;

                    // This is the actual collectible item! Let it geometrically fly to the player.
                    child.position.x = targetX;
                    child.position.z = targetZ;
                    child.position.y = (1.5 * easeOut) + Math.sin(anim.progress * Math.PI * 4) * 0.1;
                    child.rotation.y += 5.0 * dt;

                    // Shrink the item FIRST during the last 10% of the animation
                    if (anim.progress > 0.9) {
                        const shrink = (1.0 - anim.progress) * 10.0;
                        child.scale.setScalar(Math.max(0.001, shrink));
                    } else {
                        child.scale.setScalar(1.0);
                    }
                }
            }

            // [VINTERDÖD] High-Performance Matrix Sync
            // We tell Three.js that the parent group needs a world matrix recalculation.
            // The renderer handles propagating this to the children cleanly during the render phase
            // without us forcing manual, recursive recursive calls mid-update.
            anim.obj.matrixWorldNeedsUpdate = true;

            // [VINTERDÖD] Se till att partiklarna (smoke/sparks) följer med strålen upp!
            if (anim.obj.userData.effects) {
                const effects = anim.obj.userData.effects;
                const effLen = effects.length;
                for (let k = 0; k < effLen; k++) {
                    const eff = effects[k];
                    if (!eff.originalOffset) {
                        eff.originalOffset = eff.offset ? eff.offset.clone() : new THREE.Vector3();
                    }
                    if (!eff.offset) eff.offset = new THREE.Vector3();

                    eff.offset.copy(eff.originalOffset);
                    eff.offset.y += fxTargetY;
                }
            }

            if (anim.progress >= 1) {
                // Traverse and hide to avoid removing from scene (keeps GPU state stable)
                const stack = [anim.obj as THREE.Object3D];
                while (stack.length > 0) {
                    const node = stack.pop()!;
                    if (node instanceof THREE.PointLight || node instanceof THREE.SpotLight || node instanceof THREE.DirectionalLight) {
                        node.intensity = 0;
                    } else if (node instanceof THREE.Mesh) {
                        node.visible = false;
                    }
                    const children = node.children;
                    for (let j = 0; j < children.length; j++) {
                        stack.push(children[j]);
                    }
                }

                // Cleanup emitters to prevent "left behind" particles
                anim.obj.userData.effects = [];

                const idx = this.collectibles.indexOf(anim.obj);
                if (idx > -1) {
                    this.collectibles[idx] = this.collectibles[this.collectibles.length - 1];
                    this.collectibles.pop();
                }

                // HÄR triggas ScreenCollectibleDiscovered (När animationen är 100% klar)
                if (this.onCollectibleDiscovered && anim.collectibleId) {
                    this.onCollectibleDiscovered(anim.collectibleId);
                }

                this.activeAnimations[i] = this.activeAnimations[this.activeAnimations.length - 1];
                this.activeAnimations.pop();
            }
        }
    }

    /**
     * Scans the environment for the closest interactable object.
     * Priority: Collectibles > Chests > Vehicles > Mission Objects
     * Modifies the global _detectionResult instead of returning a new object.
     */
    private detectInteraction(
        playerPos: THREE.Vector3,
        chests: any[],
        triggers: any[],
        sectorState: any,
        state: any
    ): void {

        // --- 1. Check Collectibles (3.5m radius) ---
        const cLen = this.collectibles.length;
        for (let i = 0; i < cLen; i++) {
            const c = this.collectibles[i];
            if (playerPos.distanceToSquared(c.position) < 12.25) {
                _detectionResult.position.copy(c.position);
                _detectionResult.type = 'collectible';
                _detectionResult.object = c;
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

        // --- 3. EXPLICIT CHECK: Active Vehicle (Exit Prompt) ---
        if (state.activeVehicle) {
            _detectionResult.position.copy(state.activeVehicle.position);
            _detectionResult.position.y += 1.0;
            _detectionResult.type = 'vehicle';
            _detectionResult.object = state.activeVehicle;
            return;
        }

        // --- 4. Check Generic Sector Interactables ---
        if (sectorState.ctx && sectorState.ctx.interactables) {
            const len = sectorState.ctx.interactables.length;
            for (let i = 0; i < len; i++) {
                const obj = sectorState.ctx.interactables[i];
                if (!obj || !obj.userData?.isInteractable) continue;

                obj.getWorldPosition(_v1);
                const def = obj.userData.vehicleDef;

                // Vehicle specific check (OBB)
                if (def && obj.userData.interactionType === 'VEHICLE') {
                    _v3.copy(playerPos);
                    obj.worldToLocal(_v3);
                    const margin = 2.0;

                    if (Math.abs(_v3.x) <= def.size.x + margin && Math.abs(_v3.z) <= def.size.z + margin) {
                        _detectionResult.position.copy(_v1);
                        _detectionResult.position.y += 1.0;
                        _detectionResult.type = 'vehicle';
                        _detectionResult.object = obj;
                        return;
                    }
                } else {
                    // Regular Point/Radius/Box Interaction
                    const r = obj.userData.interactionRadius || 4.0;
                    if (playerPos.distanceToSquared(_v1) < r * r) {
                        _detectionResult.position.copy(_v1);
                        _detectionResult.type = (obj.userData.interactionType as any) || 'sector_specific';
                        _detectionResult.id = obj.userData.interactionId;
                        _detectionResult.object = obj;
                        return;
                    }
                }
            }
        }

        // --- 5. Check Mission Triggers ---
        const tLen = triggers.length;
        for (let i = 0; i < tLen; i++) {
            const t = triggers[i];

            if (t.type === 'INTERACT' || t.type === 'TERMINAL') {
                let inRange = false;

                // Zero-GC manual squared distance (XZ plane mostly)
                const dx = playerPos.x - t.position.x;
                const dz = playerPos.z - t.position.z;
                const distSq = dx * dx + dz * dz;

                if (t.size) {
                    const maxDim = Math.max(t.size.width, t.size.depth) * 0.7;
                    if (distSq < maxDim * maxDim) inRange = true;
                } else {
                    const r = t.radius || 2.0;
                    if (distSq < r * r) inRange = true;
                }

                if (inRange) {
                    _detectionResult.position.set(t.position.x, playerPos.y, t.position.z);
                    _detectionResult.type = 'sector_specific';
                    _detectionResult.id = t.id;
                    _detectionResult.object = null;
                    return;
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

        if (type === 'vehicle' && _detectionResult.object) {
            state.activeVehicle = _detectionResult.object;
            _detectionResult.type = null;
            _detectionResult.object = null;
            return;
        }

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

                    const light = c.mesh.getObjectByName('chestLight') as THREE.PointLight | THREE.SpotLight;
                    if (light) {
                        light.intensity = 0;
                    }

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
            state.interactionRequest.active = true;
            state.interactionRequest.id = _detectionResult.id!;
            state.interactionRequest.object = _detectionResult.object!;
            state.interactionRequest.type = 'sector_specific';
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

        if ((soundManager as any).collectibleDiscovered) {
            (soundManager as any).collectibleDiscovered();
        } else {
            soundManager.playUiPickup();
        }

        // [VINTERDÖD FIX] Wake up the matrix updates for this specific object and its children.
        // This allows the local position/scale/rotation changes in the animation loop to actually render,
        // without ruining the performance of the rest of the static world!
        collectible.matrixAutoUpdate = true;
        const children = collectible.children;
        for (let i = 0; i < children.length; i++) {
            children[i].matrixAutoUpdate = true;
        }

        this.activeAnimations.push({
            obj: collectible,
            startPos: collectible.position.clone(),
            progress: 0,
            duration: 1.2,
            collectibleId: collectibleId
        });

        // Spawn initial blow-away burst
        for (let i = 0; i < 15; i++) {
            _v1.set(
                (Math.random() - 0.5) * 2,
                10 + Math.random() * 10,
                (Math.random() - 0.5) * 2
            );
            FXSystem.spawnPart(
                session.engine.scene,
                session.state.particles,
                collectible.position.x,
                0.1,
                collectible.position.z,
                'spark',
                1,
                undefined,
                _v1
            );
        }
    }
}