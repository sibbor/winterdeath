
import * as THREE from 'three';
import { soundManager } from '../../utils/sound';

export const InteractionSystem = {
    update: (
        playerPos: THREE.Vector3,
        chests: any[],
        obstacles: any[],
        busUnlocked: boolean
    ): 'chest' | 'bus' | null => {
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
    },

    handleInteraction: (
        type: 'chest' | 'bus' | null,
        playerPos: THREE.Vector3,
        chests: any[],
        state: any,
        callbacks: {
            spawnScrapExplosion: (x: number, z: number, amount: number) => void;
            onMissionEnded: (isExtraction: boolean) => void;
        }
    ) => {
        if (!type) return;

        if (type === 'chest') {
            const chest = chests.find((c: any) => !c.opened && playerPos.distanceTo(c.mesh.position) < 3.5);
            if (chest) {
                chest.opened = true;
                soundManager.playUiConfirm();
                callbacks.spawnScrapExplosion(chest.mesh.position.x, chest.mesh.position.z, chest.scrap);
                
                // Animate Lid
                if (chest.mesh.children[1]) {
                    chest.mesh.children[1].rotation.x = -Math.PI / 2;
                    chest.mesh.children[1].position.add(new THREE.Vector3(0, 0, -0.5));
                }
                
                state.chestsOpened++;
                if (chest.type === 'big') state.bigChestsOpened++;
            }
        } else if (type === 'bus') {
            callbacks.onMissionEnded(true); // Extraction = true
        }
    }
};
