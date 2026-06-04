import * as THREE from 'three';
import type React from 'react';
import { System, SystemID } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { UiSounds, GamePlaySounds } from '../utils/audio/AudioLib';
import { LootSystem } from './LootSystem';
import { getCollectibleById } from '../content/collectibles';
import { FXSystem } from './FXSystem';
import { UIEventBridge, InteractionType, InteractionSubType, InteractionShape, InteractionPromptId } from './ui/UIEventBridge';
import { FXParticleType } from '../types/FXTypes';
import { TriggerType, TriggerStatus } from '../types/TriggerTypes';
import { VehicleID } from '../entities/vehicles/VehicleTypes';
import { InputAction } from '../core/engine/InputManager';
import { TriggerSystem } from './TriggerSystem';
import { VehicleManager } from './VehicleManager';
import { DataResolver } from '../core/data/DataResolver';
import { StatID } from '../types/CareerStats';

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _traverseStack: THREE.Object3D[] = [];

// Shared object for detection returns to eliminate garbage allocation
const _detectionResult = {
    type: InteractionType.NONE,
    subType: InteractionSubType.NONE,
    promptId: InteractionPromptId.NONE,
    position: new THREE.Vector3(),
    id: '',
    object: null as THREE.Object3D | null,
    label: ''
};

// Object Pools to eliminate GC spikes on interactions
interface ActiveAnimation {
    obj: THREE.Group | null;
    startX: number;
    startY: number;
    startZ: number;
    progress: number;
    duration: number;
    collectibleId: string;
}

interface ActiveChestAnimation {
    lid: THREE.Object3D | null;
    startR: number;
    targetR: number;
    progress: number;
    duration: number;
}

const MAX_ANIMATIONS = 10;

export class InteractionSystem implements System {
    readonly systemId = SystemID.INTERACTION;
    id = 'interaction_system';
    enabled = true;
    persistent = false;
    public onCollectibleDiscovered?: (collectibleId: string, isRespawnable?: boolean) => void;
    private lastDetectionTime: number = 0;

    // Zero-GC Arrays & Pools
    private activeAnimations: ActiveAnimation[] = [];
    private activeChests: ActiveChestAnimation[] = [];

    private animPool: ActiveAnimation[] = [];
    private chestPool: ActiveChestAnimation[] = [];

    private readonly EMPTY_ARRAY: any[] = []; // Immutable fallback

    constructor(
        private playerGroup: THREE.Group,
        private onSectorEnded: (isExtraction: boolean) => void,
        private collectibles: THREE.Group[],
        private activeFamilyMembers?: React.MutableRefObject<any[]>,
        private scene?: THREE.Scene,
        onCollectibleDiscovered?: (collectibleId: string, isRespawnable?: boolean) => void
    ) {
        this.onCollectibleDiscovered = onCollectibleDiscovered;

        // Pre-allocate animation pools to keep GC at zero
        for (let i = 0; i < MAX_ANIMATIONS; i++) {
            this.animPool.push({ obj: null, startX: 0, startY: 0, startZ: 0, progress: 0, duration: 0, collectibleId: '' });
            this.chestPool.push({ lid: null, startR: 0, targetR: 0, progress: 0, duration: 0 });
        }
    }

    update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        const state = session.state;
        const input = session.engine.input.state;

        if (state.vehicle.active) {
            UIEventBridge.setInteractionPrompt(InteractionPromptId.EXIT_VEHICLE);
            if (input.actions[InputAction.INTERACT]) {
                if (!state.inputState.eDepressed) {
                    state.inputState.eDepressed = true;
                    // --- EXIT VEHICLE LOGIC ---
                    const vehicle = state.vehicle.mesh;
                    if (vehicle) {
                        const def = vehicle.userData.vehicleDef;
                        VehicleManager.exitVehicle(this.playerGroup, vehicle, state, def);
                    }
                }
            } else {
                state.inputState.eDepressed = false;
            }
            return;
        }

        // 1. Detect nearby interactive objects (Throttled to 10hz)
        if (simTime - this.lastDetectionTime > 100) {
            this.lastDetectionTime = simTime;

            _detectionResult.type = InteractionType.NONE;
            _detectionResult.id = '';
            _detectionResult.object = null;
            _detectionResult.label = '';

            let triggerIndices: any = null;
            let interactables: any[];
            let tCount = 0;
            let iCount = 0;

            if (session.worldStreamer) {
                const ws = session.worldStreamer;
                const tPoolIdx = ws.getTriggerPool().nextIndex();
                ws.getNearbyTriggers(this.playerGroup.position.x, this.playerGroup.position.z, 15.0, tPoolIdx);
                triggerIndices = ws.getTriggerPool().getPool(tPoolIdx);
                tCount = ws.getTriggerPool().getCount(tPoolIdx);

                const iPoolIdx = ws.getInteractablePool().nextIndex();
                ws.getNearbyInteractables(this.playerGroup.position.x, this.playerGroup.position.z, 15.0, iPoolIdx);
                interactables = ws.getInteractablePool().getPool(iPoolIdx);
                iCount = ws.getInteractablePool().getCount(iPoolIdx);
            } else {
                triggerIndices = null;
                tCount = session.triggerSystem.capacity;
                interactables = (session.sectorCtx?.interactables || this.EMPTY_ARRAY);
                iCount = interactables.length || 0;
            }

            this.detectInteraction(
                this.playerGroup.position,
                session.triggerSystem,
                triggerIndices,
                tCount,
                state,
                interactables,
                iCount
            );

            if (_detectionResult.type !== InteractionType.NONE) {
                state.triggers.interaction.active = true;
                state.triggers.interaction.type = _detectionResult.type;
                state.triggers.interaction.promptId = _detectionResult.promptId;
                state.triggers.interaction.label = _detectionResult.label || '';
                state.triggers.interaction.targetId = _detectionResult.id || '';
                state.triggers.interactionTargetPos.copy(_detectionResult.position);
                state.triggers.hasInteractionTarget = true;
            } else {
                state.triggers.interaction.active = false;
                state.triggers.interaction.type = InteractionType.NONE;
                state.triggers.interaction.promptId = InteractionPromptId.NONE;
                state.triggers.interaction.label = '';
                state.triggers.interaction.targetId = '';
                state.triggers.hasInteractionTarget = false;
            }
        }

        // 2. Handle Interaction Press (Edge Triggered)
        if (input.actions[InputAction.INTERACT]) {
            if (!state.inputState.eDepressed) {
                state.inputState.eDepressed = true;

                if (state.triggers.interaction.active) {
                    const isExit = (state.triggers.interaction.type === InteractionType.VEHICLE && state.vehicle.active && _detectionResult.object === state.vehicle.mesh);

                    if (!isExit) {
                        this.handleInteraction(
                            state.triggers.interaction.type,
                            state.world.chests,
                            state,
                            session
                        );

                        // Clear prompt immediately for responsive feedback
                        state.triggers.hasInteractionTarget = false;
                        state.triggers.interaction.active = false;
                        state.triggers.interaction.type = InteractionType.NONE;
                        state.triggers.interaction.promptId = InteractionPromptId.NONE;
                        state.triggers.interaction.label = '';
                    }
                }
            }
        } else {
            state.inputState.eDepressed = false;
        }

        // 3. Update Active Animations (Synced with Game Loop)
        for (let i = this.activeAnimations.length - 1; i >= 0; i--) {
            const anim = this.activeAnimations[i];
            if (!anim.obj) continue;

            anim.progress += delta / anim.duration;
            if (anim.progress > 1) anim.progress = 1;

            // Smooth braking (ease-out)
            const easeOut = 1.0 - Math.pow(1.0 - anim.progress, 3);

            anim.obj.position.set(anim.startX, anim.startY, anim.startZ);
            anim.obj.rotation.set(0, 0, 0);


            const targetX = (this.playerGroup.position.x - anim.startX) * easeOut;
            const targetZ = (this.playerGroup.position.z - anim.startZ) * easeOut;
            const fxTargetY = anim.progress * 15.0; // Vertical launch height

            const children = anim.obj.children;
            const childLen = children.length;
            for (let j = 0; j < childLen; j++) {
                const child = children[j] as any;
                const fxScale = 1.0 - anim.progress;
                const clampedScale = Math.max(0.001, fxScale);

                switch (child.name) {
                    case 'collectibleRing':
                        child.position.set(0, 0.05 + fxTargetY, 0);
                        child.scale.setScalar(clampedScale);
                        break;

                    case 'collectibleInnerRing':
                        child.position.set(0, 1.0 + (fxTargetY * 0.8), 0);
                        child.scale.setScalar(clampedScale);
                        break;

                    case 'collectibleBeam':
                        child.position.set(0, 2.0 + fxTargetY, 0);
                        child.scale.set(0.05 * clampedScale, 4.0, 0.05 * clampedScale);
                        break;

                    default:
                        if (!child.name.startsWith('collectible') && !child.isLight) {
                            child.position.x = targetX;
                            child.position.z = targetZ;
                            child.position.y = (1.5 * easeOut) + Math.sin(anim.progress * Math.PI * 4) * 0.1;
                            child.rotation.y += 5.0 * delta;

                            if (anim.progress > 0.9) {
                                const shrink = (1.0 - anim.progress) * 10.0;
                                child.scale.setScalar(Math.max(0.001, shrink));
                            } else {
                                child.scale.setScalar(1.0);
                            }
                        }
                        break;
                }
            }

            anim.obj.matrixWorldNeedsUpdate = true;

            if (anim.obj.userData.effects) {
                const effects = anim.obj.userData.effects;
                for (let k = 0; k < effects.length; k++) {
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

                if (anim.obj.userData.effects) {
                    anim.obj.userData.effects.length = 0;
                }


                // Remove from scene registry
                const collIdx = this.collectibles.indexOf(anim.obj);
                if (collIdx > -1) {
                    this.collectibles[collIdx] = this.collectibles[this.collectibles.length - 1];
                    this.collectibles.pop();
                }

                if (this.onCollectibleDiscovered) {
                    this.onCollectibleDiscovered(anim.collectibleId, anim.obj.userData.respawnable);
                }

                // Free the pool object
                anim.obj = null;
                this.animPool.push(anim);

                // Swap-and-pop active list
                this.activeAnimations[i] = this.activeAnimations[this.activeAnimations.length - 1];
                this.activeAnimations.pop();
            }
        }

        // 4. Update Active Chests (Synced with Game Loop, Zero-GC)
        for (let i = this.activeChests.length - 1; i >= 0; i--) {
            const anim = this.activeChests[i];
            if (!anim.lid) continue;

            anim.progress += delta / anim.duration;

            if (anim.progress >= 1) {
                anim.lid.rotation.x = anim.targetR;

                anim.lid = null;
                this.chestPool.push(anim);

                this.activeChests[i] = this.activeChests[this.activeChests.length - 1];
                this.activeChests.pop();
            } else {
                const easeOut = 1 - Math.pow(1 - anim.progress, 3);
                anim.lid.rotation.x = anim.startR + (anim.targetR - anim.startR) * easeOut;
            }
        }
    }

    private detectInteraction(
        playerPos: THREE.Vector3,
        ts: TriggerSystem,
        triggerIndices: any,
        tCount: number,
        state: any,
        nearbyInteractables: THREE.Object3D[],
        iCount: number
    ): void {

        // --- Priority 1: Active Vehicle (Exit Prompt) ---
        if (state.vehicle.active && state.vehicle.mesh) {
            _detectionResult.position.copy(state.vehicle.mesh.position);
            _detectionResult.position.y += 1.0;
            _detectionResult.type = InteractionType.VEHICLE;
            _detectionResult.promptId = InteractionPromptId.EXIT_VEHICLE;
            _detectionResult.object = state.vehicle.mesh;
            _detectionResult.label = 'ui.exit_vehicle';
            return;
        }

        // --- Priority 2: Spatial Grid Objects ---
        for (let i = 0; i < iCount; i = (i + 1) | 0) {

            const obj = nearbyInteractables[i];
            if (!obj || !obj.userData?.isInteractable) continue;
            if (obj.userData.interactionType === InteractionType.COLLECTIBLE && obj.userData.pickedUp) continue;

            // Cheaper than updateMatrixWorld(true): only updates this node's local->world matrix
            // without recursively traversing the entire parent chain. Static world objects have
            // stable parent transforms, so a non-forced, non-recursive update is sufficient.
            obj.updateWorldMatrix(false, false);
            const els = obj.matrixWorld.elements;
            _v1.set(els[12], els[13], els[14]);

            if (obj.userData.vehicleDef && obj.userData.interactionType === InteractionType.VEHICLE) {
                _v3.copy(playerPos);
                obj.worldToLocal(_v3);

                const def = obj.userData.vehicleDef;
                const margin = obj.userData.interactionMargin ?? 3.0;

                const halfX = def.size.x * 0.5;
                const halfZ = def.size.z * 0.5;
                const clampX = Math.max(-halfX, Math.min(halfX, _v3.x));
                const clampZ = Math.max(-halfZ, Math.min(halfZ, _v3.z));
                _v2.set(clampX, _v3.y, clampZ);

                if (_v3.distanceToSquared(_v2) <= margin * margin) {
                    _detectionResult.position.copy(_v1);
                    _detectionResult.position.y += 1.0;
                    _detectionResult.type = InteractionType.VEHICLE;
                    _detectionResult.promptId = InteractionPromptId.ENTER_VEHICLE;
                    _detectionResult.object = obj;
                    _detectionResult.label = 'ui.enter_vehicle';
                    return;
                }
            } else {
                let inRange = false;
                const shape = obj.userData.interactionShape as InteractionShape;
                const margin = obj.userData.interactionMargin ?? 3.0;

                if (shape === InteractionShape.BOX || obj.userData.interactionSize) {
                    _v3.copy(playerPos);
                    obj.worldToLocal(_v3);
                    const size = obj.userData.interactionSize || obj.userData.chestData?.collider?.size;

                    if (size) {
                        const halfX = size.x * 0.5;
                        const halfZ = size.z * 0.5;
                        const clampX = Math.max(-halfX, Math.min(halfX, _v3.x));
                        const clampZ = Math.max(-halfZ, Math.min(halfZ, _v3.z));
                        _v2.set(clampX, _v3.y, clampZ);

                        if (_v3.distanceToSquared(_v2) <= margin * margin) {
                            inRange = true;
                        }
                    }
                } else {
                    const r = obj.userData.interactionRadius || 4.0;
                    if (playerPos.distanceToSquared(_v1) < r * r) {
                        inRange = true;
                    }
                }

                if (inRange) {
                    if (obj.userData.interactionType === InteractionType.CHEST && obj.userData.chestData?.opened) continue;

                    _detectionResult.position.copy(_v1);
                    _detectionResult.type = (obj.userData.interactionType as InteractionType) ?? InteractionType.SECTOR_SPECIFIC;
                    _detectionResult.promptId = obj.userData.interactionPromptId ?? InteractionPromptId.INTERACT;
                    _detectionResult.id = obj.userData.interactionId || '';
                    _detectionResult.object = obj;
                    _detectionResult.label = obj.userData.interactionLabel || '';
                    _detectionResult.subType = obj.userData.interactionSubType || InteractionSubType.NONE;

                    // Specific Prompt Overrides based on Type if not explicitly provided
                    if (!obj.userData.interactionPromptId) {
                        if (_detectionResult.type === InteractionType.COLLECTIBLE)
                            _detectionResult.promptId = InteractionPromptId.PICKUP_COLLECTIBLE;
                        else if (_detectionResult.type === InteractionType.CHEST)
                            _detectionResult.promptId = InteractionPromptId.OPEN_CHEST;
                        else if (_detectionResult.type === InteractionType.SECTOR_SPECIFIC) {
                            if (_detectionResult.subType === InteractionSubType.KNOCK_ON_PORT)
                                _detectionResult.promptId = InteractionPromptId.KNOCK_ON_PORT;
                            else if (_detectionResult.subType === InteractionSubType.PLANT_EXPLOSIVE)
                                _detectionResult.promptId = InteractionPromptId.PLANT_EXPLOSIVE;
                        }
                    }
                    return;
                }
            }
        }

        // --- Priority 3: Mission Triggers (Unified SoA Loop) ---
        const activeFlags = ts.getActiveFlags();
        const types = ts.getTriggerTypes();
        const statusFlags = ts.getStatusFlags();
        const posX = ts.getPositionsX();
        const posZ = ts.getPositionsZ();
        const radiiSq = ts.getRadiiSq();
        const metadata = ts.metadata;

        for (let i = 0; i < tCount; i++) {
            const idx = triggerIndices ? (triggerIndices[i] | 0) : i;

            if (activeFlags[idx] === 0) continue;
            if (!((statusFlags[idx] & TriggerStatus.ACTIVE) !== 0)) continue;

            const type = types[idx];
            if (type === TriggerType.INTERACTION || type === TriggerType.STATION) {
                const meta = metadata[idx];
                let tx = posX[idx];
                let tz = posZ[idx];

                // Resolve dynamic positions (family/owner)
                if (meta.familyId !== undefined && this.activeFamilyMembers) {
                    const members = this.activeFamilyMembers.current;
                    for (let mIdx = 0; mIdx < members.length; mIdx++) {
                        if (members[mIdx].id === meta.familyId) {
                            tx = members[mIdx].mesh.position.x;
                            tz = members[mIdx].mesh.position.z;
                            break;
                        }
                    }
                } else if (meta.ownerId && this.scene) {
                    const obj = this.scene.getObjectByName(meta.ownerId);
                    if (obj) {
                        tx = obj.position.x;
                        tz = obj.position.z;
                    }
                }

                const dx = playerPos.x - tx;
                const dz = playerPos.z - tz;
                const distSq = dx * dx + dz * dz;

                // Unified detection check
                if (distSq < radiiSq[idx]) {
                    _detectionResult.position.set(tx, playerPos.y, tz);
                    _detectionResult.type = InteractionType.SECTOR_SPECIFIC;
                    _detectionResult.promptId = meta.interactionPromptId ?? InteractionPromptId.INTERACT;
                    _detectionResult.id = String(meta.id || '');
                    _detectionResult.object = null;
                    _detectionResult.label = meta.label || '';
                    return;
                }
            }
        }
    }

    private handleInteraction(
        type: InteractionType,
        chests: any[],
        state: any,
        session: GameSessionLogic
    ) {
        if (type === InteractionType.NONE) return;

        switch (type) {
            case InteractionType.VEHICLE:
                if (_detectionResult.object) {
                    const vehicle = _detectionResult.object;
                    const def = vehicle.userData.vehicleDef;
                    if (def) {
                        VehicleManager.enterVehicle(this.playerGroup, vehicle, state, def);
                    }
                }
                break;

            case InteractionType.COLLECTIBLE:
                this.pickupCollectible(session);
                break;

            case InteractionType.CHEST:
                this.openChest(session, chests, state);
                break;

            case InteractionType.SECTOR_SPECIFIC:
                state.triggers.interaction.active = true;
                state.triggers.interaction.targetId = _detectionResult.id || '';
                state.triggers.interaction.type = InteractionType.SECTOR_SPECIFIC;
                state.triggers.interaction.label = _detectionResult.label || '';

                state.triggers.interactionRequest.active = true;
                state.triggers.interactionRequest.type = InteractionType.SECTOR_SPECIFIC;
                state.triggers.interactionRequest.id = _detectionResult.id || '';
                state.triggers.interactionRequest.object = _detectionResult.object || null;
                break;
        }
    }

    private pickupCollectible(session: GameSessionLogic) {
        const collectible = _detectionResult.object as THREE.Group;
        if (!collectible || collectible.userData.pickedUp) return;

        const collectibleId = collectible.userData.collectibleId;
        const colSmi = DataResolver.resolveCollectibleID(collectibleId);
        if (colSmi === undefined || !getCollectibleById(colSmi)) return;

        collectible.userData.pickedUp = true;
        UiSounds.playPickUp();

        collectible.matrixAutoUpdate = true;
        for (let i = 0; i < collectible.children.length; i++) {
            collectible.children[i].matrixAutoUpdate = true;
        }

        // Get pool object
        if (this.animPool.length > 0) {
            const pooled = this.animPool.pop()!;
            pooled.obj = collectible;
            pooled.startX = collectible.position.x;
            pooled.startY = collectible.position.y;
            pooled.startZ = collectible.position.z;
            pooled.progress = 0;
            pooled.duration = 1.2;
            pooled.collectibleId = collectibleId;
            this.activeAnimations.push(pooled);
        }

        for (let i = 0; i < 15; i++) {
            _v1.set((Math.random() - 0.5) * 2, 10 + Math.random() * 10, (Math.random() - 0.5) * 2);
            FXSystem.spawnParticle(session.engine.scene, session.state.combat.particles, collectible.position.x, 0.1, collectible.position.z, FXParticleType.SPARK, 1, undefined, _v1);
        }
    }

    private openChest(session: GameSessionLogic, chests: any[], state: any) {
        const detectionObj = _detectionResult.object;
        if (!detectionObj) return;

        let chestData = null;

        if (detectionObj.userData.chestData) {
            chestData = detectionObj.userData.chestData;
        } else {
            for (let i = 0; i < chests.length; i++) {
                if (chests[i].mesh === detectionObj) {
                    chestData = chests[i];
                    break;
                }
            }
        }

        if (chestData && !chestData.opened) {
            const chest = chestData;
            chest.opened = true;
            GamePlaySounds.playChestOpen();

            let inRegistry = false;
            for (let i = 0; i < chests.length; i++) {
                if (chests[i] === chest) { inRegistry = true; break; }
            }
            if (!inRegistry) chests.push(chest);

            LootSystem.spawnScrapExplosion(session.engine.scene, chest.mesh.position.x, chest.mesh.position.z, chest.scrap);

            const glowRing = chest.mesh.getObjectByName('chestGlow');
            if (glowRing) {
                glowRing.visible = false;
            }

            FXSystem.spawnParticle(session.engine.scene, state.combat.particles, chest.mesh.position.x, 1.0, chest.mesh.position.z, FXParticleType.SPARK, 15);

            const lid = chest.mesh.children[1];
            if (lid) {
                chest.mesh.matrixAutoUpdate = true;
                lid.matrixAutoUpdate = true;

                if (this.chestPool.length > 0) {
                    const pooled = this.chestPool.pop()!;
                    pooled.lid = lid;
                    pooled.startR = lid.rotation.x;
                    pooled.targetR = -Math.PI * 0.6;
                    pooled.progress = 0;
                    pooled.duration = 0.4;
                    this.activeChests.push(pooled);
                }
            }

            if (chest.subType === InteractionSubType.BIG_CHEST) {
                if (state.sessionStats) state.sessionStats.bigChestsOpened++;
                state.player.statsBuffer[StatID.TOTAL_BIG_CHESTS_OPENED]++;
            } else {
                if (state.sessionStats) state.sessionStats.chestsOpened++;
                state.player.statsBuffer[StatID.TOTAL_CHESTS_OPENED]++;
            }
        }
    }
}
