import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { soundManager } from '../../utils/sound';
import { WorldLootSystem } from './WorldLootSystem';

export class PlayerInteractionSystem implements System {
    id = 'player_interaction';

    constructor(
        private playerGroup: THREE.Group,
        private onSectorEnded: (isExtraction: boolean) => void
    ) { }

    update(session: GameSessionLogic, dt: number, now: number) {
        const state = session.state;
        const input = session.engine.input.state;

        // 1. Detect Interaction Type
        const currentInter = this.detectInteraction(
            this.playerGroup.position,
            state.chests,
            state.obstacles,
            state.busUnlocked
        );
        state.interactionType = currentInter;

        // 2. Handle Interaction Press
        if (input.e && !state.eDepressed) {
            state.eDepressed = true;

            this.handleInteraction(
                currentInter,
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
        busUnlocked: boolean
    ): 'chest' | 'bus' | null {
        // Check Chests
        for (const chest of chests) {
            if (!chest.opened && playerPos.distanceTo(chest.mesh.position) < 3.5) {
                return 'chest';
            }
        }

        // Check Bus
        if (busUnlocked) {
            const gate = obstacles.find((o: any) => o.id === 'gate');
            if (gate && playerPos.distanceTo(gate.mesh.position) < 10) {
                return 'bus';
            }
        }
        return null;
    }

    private handleInteraction(
        type: 'chest' | 'bus' | null,
        playerPos: THREE.Vector3,
        chests: any[],
        state: any,
        session: GameSessionLogic
    ) {
        if (!type) return;

        if (type === 'chest') {
            const chest = chests.find((c: any) => !c.opened && playerPos.distanceTo(c.mesh.position) < 3.5);
            if (chest) {
                chest.opened = true;
                soundManager.playUiConfirm();
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
        } else if (type === 'bus') {
            this.onSectorEnded(true);
        }
    }

    private spawnScrapExplosion(session: GameSessionLogic, x: number, z: number, amount: number) {
        WorldLootSystem.spawnScrapExplosion(session.engine.scene, session.state.scrapItems, x, z, amount);
    }
}
