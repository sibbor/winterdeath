
import * as THREE from 'three';
import { soundManager } from '../../utils/sound';

export interface ScrapItem {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    value: number;
    grounded: boolean;
    magnetized: boolean;
    life: number; // Despawn timer
}

export const LootSystem = {
    update: (
        scene: THREE.Scene,
        scrapItems: ScrapItem[],
        playerPos: THREE.Vector3,
        delta: number,
        now: number
    ): number => {
        let collectedAmount = 0;
        const collectionRange = 2.0;
        const magnetRange = 5.0;
        const magnetSpeed = 25.0;

        for (let i = scrapItems.length - 1; i >= 0; i--) {
            const item = scrapItems[i];
            
            // 1. Physics (Gravity & Bouncing)
            if (!item.magnetized) {
                if (!item.grounded) {
                    item.velocity.y -= 30 * delta; // Gravity
                    item.mesh.position.add(item.velocity.clone().multiplyScalar(delta));

                    // Ground Bounce
                    if (item.mesh.position.y <= 0.3) {
                        item.mesh.position.y = 0.3;
                        item.velocity.y *= -0.5; // Bounce dampening
                        item.velocity.x *= 0.8;  // Friction
                        item.velocity.z *= 0.8;
                        
                        if (Math.abs(item.velocity.y) < 0.5) {
                            item.grounded = true;
                            item.velocity.set(0,0,0);
                        }
                    }
                }
                
                // Idle Rotation
                item.mesh.rotation.y += 1.0 * delta;
                item.mesh.rotation.z += 1.0 * delta;
            }

            // 2. Magnetism (Attract to player)
            const distSq = item.mesh.position.distanceToSquared(playerPos);
            
            if (distSq < magnetRange * magnetRange) {
                item.magnetized = true;
                item.grounded = false; // Lift off ground
            }

            if (item.magnetized) {
                const dir = new THREE.Vector3().subVectors(playerPos, item.mesh.position).normalize();
                // Accelerate towards player
                const speed = magnetSpeed * (1 + (10 / (distSq + 0.1))); // Faster as it gets closer
                item.mesh.position.add(dir.multiplyScalar(speed * delta));
                // Shrink as it gets absorbed
                const scale = Math.max(0.1, item.mesh.scale.x - 2.0 * delta);
                item.mesh.scale.setScalar(scale);
            }

            // 3. Collection
            if (distSq < collectionRange) { // Close enough to collect
                collectedAmount += item.value;
                scene.remove(item.mesh);
                scrapItems.splice(i, 1);
                // Play small click sound per item, handled by batching in main loop preferably, 
                // but single tone here is fine for now
                if (Math.random() > 0.5) soundManager.playUiHover(); 
                continue;
            }

            // 4. Despawn Logic (optional, keep scene clean)
            // item.life -= delta; ...
        }

        return collectedAmount;
    }
};
