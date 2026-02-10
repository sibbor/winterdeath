import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { soundManager } from '../../utils/sound';
import { WorldLootSystem } from './WorldLootSystem';
import { getCollectibleById } from '../../content/collectibles';

export class PlayerInteractionSystem implements System {
    id = 'player_interaction';
    public onCollectibleFound?: (collectibleId: string) => void;

    constructor(
        private playerGroup: THREE.Group,
        private onSectorEnded: (isExtraction: boolean) => void,
        onCollectibleFound?: (collectibleId: string) => void
    ) {
        this.onCollectibleFound = onCollectibleFound;
    }

    update(session: GameSessionLogic, dt: number, now: number) {
        const state = session.state;
        const input = session.engine.input.state;

        const detection = this.detectInteraction(
            this.playerGroup.position,
            state.chests,
            state.obstacles,
            state.busUnlocked,
            session.engine.scene,
            state.triggers,
            state.sectorState
        );
        state.interactionType = detection.type;
        state.interactionTargetPos = detection.position;

        // 2. Handle Interaction Press
        if (input.e && !state.eDepressed) {
            state.eDepressed = true;

            this.handleInteraction(
                detection.type,
                this.playerGroup.position,
                state.chests,
                state,
                session
            );
        }

        if (!input.e) state.eDepressed = false;
    }

    private detectInteraction(
        playerPos: THREE.Vector3,
        chests: any[],
        obstacles: any[],
        busUnlocked: boolean,
        scene: THREE.Scene,
        triggers: any[],
        sectorState: any
    ): { type: 'chest' | 'plant_explosive' | 'collectible' | 'knock_on_port' | null, position: THREE.Vector3 | null } {
        // Check Collectibles first (highest priority)
        const collectible = this.findNearbyCollectible(playerPos, scene);
        if (collectible) {
            return { type: 'collectible', position: collectible.position.clone() };
        }

        // Check Triggers for knock_on_port
        const knockTrigger = triggers.find(t => t.id === 's2_cave_knock_shelter_port' && !t.triggered);
        if (knockTrigger) {
            const triggerPos = new THREE.Vector3(knockTrigger.position.x, 0.5, knockTrigger.position.z);
            if (playerPos.distanceTo(triggerPos) < knockTrigger.radius) {
                return { type: 'knock_on_port', position: triggerPos };
            }
        }

        // Check Chests
        for (const chest of chests) {
            if (!chest.opened && playerPos.distanceTo(chest.mesh.position) < 3.5) {
                return { type: 'chest', position: chest.mesh.position.clone() };
            }
        }

        // Check Bus / Explosive
        if (sectorState && !sectorState.busExploded && sectorState.ctx && sectorState.ctx.busObject) {
            // Respect the Sector's specific logic for when interaction is allowed (e.g. kill count)
            if (sectorState.busCanBeInteractedWith) {
                const bus = sectorState.ctx.busObject;
                if (playerPos.distanceTo(bus.position) < 8) {
                    return {
                        type: 'plant_explosive',
                        position: bus.position.clone().setY(2.5) // Position prompt slightly above ground 
                    };
                }
            }
        }
        return { type: null, position: null };
    }

    private findNearbyCollectible(playerPos: THREE.Vector3, scene: THREE.Scene): THREE.Group | null {
        // Search specifically for groups tagged as collectibles to avoid traversing everything
        const collectibles: THREE.Group[] = [];
        scene.traverse((obj) => {
            if (obj instanceof THREE.Group && obj.userData.isCollectible && !obj.userData.pickedUp) {
                collectibles.push(obj);
            }
        });

        for (const collectible of collectibles) {
            // Check distance (3.5m radius)
            if (playerPos.distanceTo(collectible.position) < 3.5) {
                return collectible;
            }
        }
        return null;
    }

    private handleInteraction(
        type: 'chest' | 'plant_explosive' | 'collectible' | 'knock_on_port' | null,
        playerPos: THREE.Vector3,
        chests: any[],
        state: any,
        session: GameSessionLogic
    ) {
        if (!type) return;

        if (type === 'collectible') {
            this.handleCollectiblePickup(playerPos, session);
        } else if (type === 'chest') {
            const chest = chests.find((c: any) => !c.opened && playerPos.distanceTo(c.mesh.position) < 3.5);
            if (chest) {
                chest.opened = true;
                soundManager.playOpenChest();
                this.spawnScrapExplosion(session, chest.mesh.position.x, chest.mesh.position.z, chest.scrap);

                // Remove Glow Light
                const light = chest.mesh.getObjectByName('chestLight');
                if (light) chest.mesh.remove(light);

                // Animate Lid
                if (chest.mesh.children[1]) {
                    chest.mesh.children[1].rotation.x = -Math.PI / 2;
                    chest.mesh.children[1].position.add(new THREE.Vector3(0, 0, -0.5));
                }

                state.chestsOpened++;
                if (chest.type === 'big') state.bigChestsOpened++;
            }
        } else if (type === 'plant_explosive') {
            if (state.sectorState) {
                state.sectorState.busInteractionTriggered = true;
            } else {
                // Fallback for safety, though sectorState should exist
                console.warn("Sector state not found provided, forcing extraction");
                this.onSectorEnded(true);
            }
        } else if (type === 'knock_on_port') {
            const knockTrigger = state.triggers.find((t: any) => t.id === 's2_cave_knock_shelter_port');
            if (knockTrigger) {
                knockTrigger.triggered = true;
                soundManager.playUiConfirm();
            }
        }
    }

    private handleCollectiblePickup(playerPos: THREE.Vector3, session: GameSessionLogic) {
        const collectible = this.findNearbyCollectible(playerPos, session.engine.scene);
        if (!collectible) return;

        // Check if already picked up (prevents double-pickup during animation)
        if (collectible.userData.pickedUp) return;

        const collectibleId = collectible.userData.collectibleId;
        const collectibleDef = getCollectibleById(collectibleId);
        if (!collectibleDef) return;

        // Mark as picked up IMMEDIATELY to prevent re-pickup
        collectible.userData.pickedUp = true;

        // Reward SP is now tracked via sessionCollectiblesFound list

        // Play pickup sound
        soundManager.playUiPickup();

        // Trigger callback to show modal with a short delay
        // This allows the animation to start and the HUD to show the SP flash before it's hidden by the modal
        if (this.onCollectibleFound) {
            console.log(`[InteractionSystem] Picking up collectible: ${collectibleId}`);
            setTimeout(() => {
                if (this.onCollectibleFound) {
                    this.onCollectibleFound(collectibleId);
                }
            }, 500);
        }

        // Animate pickup (float up and fade out)
        const startY = collectible.position.y;
        const startTime = Date.now();
        const duration = 800;

        // Clone materials to avoid affecting shared materials (e.g. enemies)
        collectible.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
                child.material = child.material.clone();
            }
        });

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Float up
            collectible.position.y = startY + progress * 2;

            // Rotate
            collectible.rotation.y += 0.05;

            // Fade out
            collectible.traverse((child) => {
                if (child instanceof THREE.Mesh && child.material) {
                    const mat = child.material as THREE.Material;
                    mat.transparent = true;
                    mat.opacity = 1 - progress;
                }
            });

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // Animation complete - remove from scene
                session.engine.scene.remove(collectible);
            }
        };

        animate();
    }

    private spawnScrapExplosion(session: GameSessionLogic, x: number, z: number, amount: number) {
        WorldLootSystem.spawnScrapExplosion(session.engine.scene, session.state.scrapItems, x, z, amount);
    }
}
