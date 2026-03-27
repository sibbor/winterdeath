import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { soundManager } from '../utils/audio/SoundManager';
import { WorldLootSystem } from './WorldLootSystem';
import { getCollectibleById } from '../content/collectibles';
import { FXSystem } from './FXSystem';
import type React from 'react';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _traverseStack: THREE.Object3D[] = [];

// Shared object for detection returns to eliminate garbage allocation
const _detectionResult = {
    type: null as 'chest' | 'collectible' | 'sector_specific' | 'vehicle' | null,
    position: new THREE.Vector3(),
    id: null as string | null,
    object: null as THREE.Object3D | null
};

interface ActiveAnimation {
    obj: THREE.Group;
    startX: number;
    startY: number;
    startZ: number;
    progress: number;
    duration: number;
    collectibleId: string;
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
        private activeFamilyMembers?: React.MutableRefObject<any[]>,
        private scene?: THREE.Scene,
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

            // Fetch local vicinity from SpatialGrid
            const nearbyTriggers = state.collisionGrid ? state.collisionGrid.getNearbyTriggers(this.playerGroup.position, 15.0) : state.triggers;
            const nearbyInteractables = state.collisionGrid ? state.collisionGrid.getNearbyInteractables(this.playerGroup.position, 15.0) : (state.sectorState.ctx?.interactables || []);

            this.detectInteraction(
                this.playerGroup.position,
                nearbyTriggers,
                state,
                nearbyInteractables
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

            if (_detectionResult.type) {
                if (!state.interactionTargetPos) state.interactionTargetPos = new THREE.Vector3();
                state.interactionTargetPos.copy(_detectionResult.position);
                state.hasInteractionTarget = true;
            } else {
                state.hasInteractionTarget = false;
                state.interactionType = null;
                state.interactionLabel = null;
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

                        // Clear prompt immediately for responsive feedback
                        state.hasInteractionTarget = false;
                        state.interactionType = null;
                        state.interactionLabel = null;
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

            // Smooth braking (ease-out)
            const easeOut = 1.0 - Math.pow(1.0 - anim.progress, 3);

            _v1.set(anim.startX, anim.startY, anim.startZ);
            anim.obj.position.copy(_v1);
            anim.obj.rotation.set(0, 0, 0);

            const targetX = (this.playerGroup.position.x - anim.startX) * easeOut;
            const targetZ = (this.playerGroup.position.z - anim.startZ) * easeOut;
            const fxTargetY = anim.progress * 15.0; // Vertical launch height

            const children = anim.obj.children;
            const childLen = children.length;
            for (let j = 0; j < childLen; j++) {
                const child = children[j] as any;

                if (child.name === 'collectibleRing' || child.name === 'collectibleBeam' || child.name === 'collectibleInnerRing') {
                    if (child.name === 'collectibleRing') child.position.set(0, 0.05 + fxTargetY, 0);
                    else if (child.name === 'collectibleInnerRing') child.position.set(0, 1.0 + (fxTargetY * 0.8), 0);
                    else if (child.name === 'collectibleBeam') child.position.set(0, 2.0 + fxTargetY, 0);

                    const fxScale = 1.0 - anim.progress;
                    if (child.name === 'collectibleBeam') {
                        child.scale.set(0.05 * Math.max(0.001, fxScale), 4.0, 0.05 * Math.max(0.001, fxScale));
                    } else {
                        child.scale.setScalar(Math.max(0.001, fxScale));
                    }
                } else if (!child.name.startsWith('collectible') && !child.isLight) {
                    // Actual item geometry
                    child.position.x = targetX;
                    child.position.z = targetZ;
                    child.position.y = (1.5 * easeOut) + Math.sin(anim.progress * Math.PI * 4) * 0.1;
                    child.rotation.y += 5.0 * dt;

                    if (anim.progress > 0.9) {
                        const shrink = (1.0 - anim.progress) * 10.0;
                        child.scale.setScalar(Math.max(0.001, shrink));
                    } else {
                        child.scale.setScalar(1.0);
                    }
                }
            }

            anim.obj.matrixWorldNeedsUpdate = true;

            // Sync emitters (smoke/sparks) with the rising beam
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
                // Finalize: Hide lights and meshes using iterative stack (Zero-GC)
                _traverseStack.length = 0;
                _traverseStack.push(anim.obj);

                while (_traverseStack.length > 0) {
                    const node = _traverseStack.pop() as any;
                    if (node.isLight) node.intensity = 0;
                    else if (node.isMesh) node.visible = false;

                    for (let j = 0; j < node.children.length; j++) {
                        _traverseStack.push(node.children[j]);
                    }
                }

                anim.obj.userData.effects = [];

                // Swap-and-pop removal from pool
                const collIdx = this.collectibles.indexOf(anim.obj);
                if (collIdx > -1) {
                    this.collectibles[collIdx] = this.collectibles[this.collectibles.length - 1];
                    this.collectibles.pop();
                }

                if (this.onCollectibleDiscovered) {
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
     */
    private detectInteraction(
        playerPos: THREE.Vector3,
        triggers: any[],
        state: any,
        nearbyInteractables: THREE.Object3D[]
    ): void {
        _detectionResult.type = null;
        _detectionResult.id = null;
        _detectionResult.object = null;

        // --- Priority 1: Active Vehicle (Exit Prompt) ---
        if (state.activeVehicle) {
            _detectionResult.position.copy(state.activeVehicle.position);
            _detectionResult.position.y += 1.0;
            _detectionResult.type = 'vehicle';
            _detectionResult.object = state.activeVehicle;
            return;
        }

        // --- Priority 2: Spatial Grid Objects (Chests, Collectibles, Vehicles) ---
        if (nearbyInteractables) {
            const len = nearbyInteractables.length;
            for (let i = 0; i < len; i++) {
                const obj = nearbyInteractables[i];
                if (!obj || !obj.userData?.isInteractable) continue;
                if (obj.userData.interactionType === 'collectible' && obj.userData.pickedUp) continue;

                obj.getWorldPosition(_v1);

                if (obj.userData.vehicleDef && obj.userData.interactionType === 'VEHICLE') {
                    _v3.copy(playerPos);
                    obj.worldToLocal(_v3);
                    const margin = 2.0;
                    const def = obj.userData.vehicleDef;

                    if (Math.abs(_v3.x) <= (def.size.x * 0.5) + margin && Math.abs(_v3.z) <= (def.size.z * 0.5) + margin) {
                        _detectionResult.position.copy(_v1);
                        _detectionResult.position.y += 1.0;
                        _detectionResult.type = 'vehicle';
                        _detectionResult.object = obj;
                        return;
                    }
                } else {
                    const r = obj.userData.interactionRadius || 4.0;
                    if (playerPos.distanceToSquared(_v1) < r * r) {
                        if (obj.userData.interactionType === 'chest' && obj.userData.chestData?.opened) continue;

                        _detectionResult.position.copy(_v1);
                        _detectionResult.type = (obj.userData.interactionType as any) || 'sector_specific';
                        _detectionResult.id = obj.userData.interactionId;
                        _detectionResult.object = obj;
                        return;
                    }
                }
            }
        }

        // --- Priority 3: Mission Triggers ---
        const tLen = triggers.length;
        for (let i = 0; i < tLen; i++) {
            const t = triggers[i];
            if (t.type === 'INTERACT' || t.type === 'TERMINAL') {
                let tx = t.position.x;
                let tz = t.position.z;

                // Handle dynamic positioning (Family or Owner objects)
                if (t.familyId !== undefined && this.activeFamilyMembers) {
                    const members = this.activeFamilyMembers.current;
                    for (let mIdx = 0; mIdx < members.length; mIdx++) {
                        if (members[mIdx].id === t.familyId) {
                            tx = members[mIdx].mesh.position.x;
                            tz = members[mIdx].mesh.position.z;
                            break;
                        }
                    }
                } else if (t.ownerId && this.scene) {
                    _traverseStack.length = 0;
                    _traverseStack.push(this.scene);
                    while (_traverseStack.length > 0) {
                        const node = _traverseStack.pop()!;
                        if (node.name === t.ownerId || node.userData.id === t.ownerId) {
                            tx = node.position.x;
                            tz = node.position.z;
                            break;
                        }
                        for (let cIdx = 0; cIdx < node.children.length; cIdx++) _traverseStack.push(node.children[cIdx]);
                    }
                }

                const dx = playerPos.x - tx;
                const dz = playerPos.z - tz;
                const distSq = dx * dx + dz * dz;

                let inRange = false;
                if (t.size) {
                    const maxDim = Math.max(t.size.width, t.size.depth) * 0.7;
                    if (distSq < maxDim * maxDim) inRange = true;
                } else {
                    const r = t.radius || 2.0;
                    if (distSq < r * r) inRange = true;
                }

                if (inRange) {
                    _detectionResult.position.set(tx, playerPos.y, tz);
                    _detectionResult.type = 'sector_specific';
                    _detectionResult.id = t.id;
                    _detectionResult.object = null;
                    return;
                }
            }
        }
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

        // Vehicle
        if (type === 'vehicle' && _detectionResult.object) {
            state.activeVehicle = _detectionResult.object;
            _detectionResult.type = null;
            _detectionResult.object = null;
        }

        // Collectible
        else if (type === 'collectible') {
            this.pickupCollectible(session);
        }

        // Chest
        else if (type === 'chest') {
            this.openChest(session, chests, state);
        }

        // Section specific:
        else if (type === 'sector_specific') {
            state.interactionRequest.active = true;
            state.interactionRequest.id = _detectionResult.id!;
            state.interactionRequest.object = _detectionResult.object!;
            state.interactionRequest.type = 'sector_specific';
        }
    }

    private pickupCollectible(session: GameSessionLogic) {
        const collectible = _detectionResult.object as THREE.Group;
        if (!collectible || collectible.userData.pickedUp) return;

        const collectibleId = collectible.userData.collectibleId;
        if (!getCollectibleById(collectibleId)) return;

        collectible.userData.pickedUp = true;
        soundManager.playUiPickup();

        collectible.matrixAutoUpdate = true;
        for (let i = 0; i < collectible.children.length; i++) {
            collectible.children[i].matrixAutoUpdate = true;
        }

        this.activeAnimations.push({
            obj: collectible,
            startX: collectible.position.x,
            startY: collectible.position.y,
            startZ: collectible.position.z,
            progress: 0,
            duration: 1.2,
            collectibleId: collectibleId
        });

        // Effect burst on pickup
        for (let i = 0; i < 15; i++) {
            _v1.set((Math.random() - 0.5) * 2, 10 + Math.random() * 10, (Math.random() - 0.5) * 2);
            FXSystem.spawnPart(session.engine.scene, session.state.particles, collectible.position.x, 0.1, collectible.position.z, 'spark', 1, undefined, _v1);
        }
    }

    private openChest(session: GameSessionLogic, chests: any[], state: any) {
        for (let i = 0; i < chests.length; i++) {
            const c = chests[i];
            if (c.mesh === _detectionResult.object && !c.opened) {
                c.opened = true;
                soundManager.playOpenChest();
                WorldLootSystem.spawnScrapExplosion(session.engine.scene, state.scrapItems, c.mesh.position.x, c.mesh.position.z, c.scrap);

                const glowRing = c.mesh.getObjectByName('chestGlow');
                if (glowRing) {
                    glowRing.visible = false;
                }

                // Spawn magic sparkles using the correct parameters
                const px = c.mesh.position.x;
                const py = 1.0;
                const pz = c.mesh.position.z;

                FXSystem.spawnPart(session.engine.scene, state.particles, px, py, pz, 'spark', 15);

                // Hinge animation for the lid
                const lid = c.mesh.children[1];
                if (lid) {
                    c.mesh.matrixAutoUpdate = true;
                    lid.matrixAutoUpdate = true;

                    const targetRotationX = -Math.PI * 0.6; // Open slightly past 90 degrees
                    let progress = 0;
                    const duration = 400; // Animation duration in ms
                    const startR = lid.rotation.x;

                    const animateLid = (time: number, lastTime: number) => {
                        const dt = time - lastTime;
                        progress += dt;

                        if (progress < duration) {
                            // Ease-out cubic for a snappy open that slows down towards the end
                            const t = progress / duration;
                            const easeOut = 1 - Math.pow(1 - t, 3);

                            lid.rotation.x = startR + (targetRotationX - startR) * easeOut;
                            requestAnimationFrame((newTime) => animateLid(newTime, time));
                        } else {
                            // Ensure it sets exactly to target when finished
                            lid.rotation.x = targetRotationX;
                        }
                    };

                    requestAnimationFrame((time) => animateLid(time, time));
                }

                state.chestsOpened++;
                if (c.type === 'big') state.bigChestsOpened++;
                break;
            }
        }
    }

}