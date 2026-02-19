import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { soundManager } from '../../utils/sound';
import { WorldLootSystem } from './WorldLootSystem';
import { getCollectibleById } from '../../content/collectibles';

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
    startY: number;
    progress: number;
    duration: number;
    collectibleId?: string;
}

export class PlayerInteractionSystem implements System {
    id = 'player_interaction';
    public onCollectibleFound?: (collectibleId: string) => void;
    private lastDetectionTime: number = 0;
    private activeAnimations: ActiveAnimation[] = [];

    constructor(
        private playerGroup: THREE.Group,
        private onSectorEnded: (isExtraction: boolean) => void,
        private collectibles: THREE.Group[],
        onCollectibleFound?: (collectibleId: string) => void
    ) {
        this.onCollectibleFound = onCollectibleFound;
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

            anim.obj.position.y = anim.startY + anim.progress * 2.0;
            anim.obj.rotation.y += 3.0 * dt;

            // Animate scale down instead of material opacity to avoid shader recompilation and GC
            const s = 1.0 - anim.progress;
            anim.obj.scale.set(s, s, s);

            if (anim.progress >= 1) {
                // Traverse and hide to avoid removing from scene (keeps GPU state stable)
                anim.obj.traverse((child) => {
                    if (child instanceof THREE.PointLight || child instanceof THREE.SpotLight || child instanceof THREE.DirectionalLight) {
                        child.intensity = 0;
                    } else if (child instanceof THREE.Mesh) {
                        child.visible = false;
                    }
                });

                const idx = this.collectibles.indexOf(anim.obj);
                if (idx > -1) {
                    this.collectibles[idx] = this.collectibles[this.collectibles.length - 1];
                    this.collectibles.pop();
                }

                if (this.onCollectibleFound && anim.collectibleId) {
                    this.onCollectibleFound(anim.collectibleId);
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

        if ((soundManager as any).collectibleFound) {
            (soundManager as any).collectibleFound();
        } else {
            soundManager.playUiPickup();
        }

        this.activeAnimations.push({
            obj: collectible,
            startY: collectible.position.y,
            progress: 0,
            duration: 0.8,
            collectibleId: collectibleId
        });
    }
}