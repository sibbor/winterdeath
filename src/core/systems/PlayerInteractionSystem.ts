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
            state.triggers
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
        triggers: any[]
    ): { type: 'chest' | 'plant_explosive' | 'collectible' | 'knock_on_port' | null, position: THREE.Vector3 | null } {
        // Check Collectibles first (highest priority)
        const collectible = this.findNearbyCollectible(playerPos, scene);
        if (collectible) {
            return { type: 'collectible', position: collectible.position.clone() };
        }

        // Check Triggers for knock_on_port
        const knockTrigger = triggers.find(t => t.id === 's2_cave_knock_port' && !t.triggered);
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
        if (busUnlocked) {
            const gate = obstacles.find((o: any) => o.id === 'gate');
            if (gate && playerPos.distanceTo(gate.mesh.position) < 10) {
                return { type: 'plant_explosive', position: gate.mesh.position.clone() };
            }
        }
        return { type: null, position: null };
    }

    private findNearbyCollectible(playerPos: THREE.Vector3, scene: THREE.Scene): THREE.Group | null {
        const collectibles: THREE.Group[] = [];
        scene.traverse((obj) => {
            if (obj.userData.collectibleId && obj instanceof THREE.Group) {
                collectibles.push(obj);
            }
        });

        for (const collectible of collectibles) {
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
            this.onSectorEnded(true);
        } else if (type === 'knock_on_port') {
            const knockTrigger = state.triggers.find((t: any) => t.id === 's2_cave_knock_port');
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

        // Award SP immediately
        session.state.spFromCollectibles = (session.state.spFromCollectibles || 0) + collectibleDef.reward.sp;

        // Play pickup sound
        soundManager.playUiPickup();

        // Trigger callback to show modal
        if (this.onCollectibleFound) {
            this.onCollectibleFound(collectibleId);
        }

        // Animate pickup (float up and fade out)
        const startY = collectible.position.y;
        const startTime = Date.now();
        const duration = 800;

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
