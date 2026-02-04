
import * as THREE from 'three';
import { GEOMETRY, MATERIALS } from '../../assets';

export const CollectibleModels = {
    createCollectible: (type: string): THREE.Group => {
        const group = new THREE.Group();
        group.userData = { isCollectible: true, type };

        switch (type) {
            case 'phone': {
                // Phone Base
                const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.2), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.2, metalness: 0.8 }));
                body.castShadow = true;
                group.add(body);

                // Screen (Emissive)
                const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.16), new THREE.MeshStandardMaterial({
                    color: 0x00ccff,
                    emissive: 0x00ccff,
                    emissiveIntensity: 2.0,
                    transparent: true,
                    opacity: 0.9
                }));
                screen.rotation.x = -Math.PI / 2;
                screen.position.y = 0.03;
                group.add(screen);

                // Small Light for visibility in snow
                const light = new THREE.PointLight(0x00ccff, 1, 3);
                light.position.set(0, 0.2, 0);
                group.add(light);
                break;
            }
            case 'pacifier': {
                const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
                ring.rotation.x = Math.PI / 2;
                group.add(ring);

                const shield = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.05, 4, 8), new THREE.MeshStandardMaterial({ color: 0xff99cc, roughness: 0.4 }));
                shield.position.y = 0.05;
                group.add(shield);

                const nipple = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffccaa, transparent: true, opacity: 0.7 }));
                nipple.position.y = 0.15;
                group.add(nipple);
                break;
            }
            case 'axe': {
                const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2), new THREE.MeshStandardMaterial({ color: 0x5c4033 }));
                handle.rotation.z = Math.PI / 2;
                group.add(handle);

                const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.4), new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9, roughness: 0.1 }));
                head.position.set(0.5, 0.1, 0);
                group.add(head);
                break;
            }
            case 'jacket': {
                // Simplified "folded" jacket
                const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.6), new THREE.MeshStandardMaterial({ color: 0x800000, roughness: 0.9 }));
                group.add(body);
                const sleeveR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.6), new THREE.MeshStandardMaterial({ color: 0x800000, roughness: 0.9 }));
                sleeveR.position.set(0.4, 0, 0);
                group.add(sleeveR);
                const sleeveL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.6), new THREE.MeshStandardMaterial({ color: 0x800000, roughness: 0.9 }));
                sleeveL.position.set(-0.4, 0, 0);
                group.add(sleeveL);
                break;
            }
            case 'scarf': {
                const body = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.1, 8, 16), new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 1.0 }));
                body.rotation.x = Math.PI / 2;
                group.add(body);
                break;
            }
            case 'diary': {
                const cover = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.5), new THREE.MeshStandardMaterial({ color: 0x4a2c2c, roughness: 0.8 }));
                group.add(cover);
                const pages = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.05, 0.48), new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 1.0 }));
                pages.position.x = 0.02;
                group.add(pages);
                break;
            }
            case 'ring': {
                const band = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 16), new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1.0, roughness: 0.1 }));
                band.rotation.x = Math.PI / 2;
                group.add(band);
                const stone = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), new THREE.MeshStandardMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8, emissive: 0x00ffff, emissiveIntensity: 0.5 }));
                stone.position.y = 0.12;
                group.add(stone);
                break;
            }
            case 'badge': {
                const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 6), new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.8, roughness: 0.2 }));
                body.rotation.x = Math.PI / 2;
                group.add(body);
                break;
            }
            case 'teddy': {
                const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshStandardMaterial({ color: 0x8b4513 }));
                group.add(body);
                const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshStandardMaterial({ color: 0x8b4513 }));
                head.position.y = 0.4;
                group.add(head);
                const earL = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshStandardMaterial({ color: 0x8b4513 }));
                earL.position.set(0.15, 0.6, 0);
                group.add(earL);
                const earR = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshStandardMaterial({ color: 0x8b4513 }));
                earR.position.set(-0.15, 0.6, 0);
                group.add(earR);
                break;
            }
            default: {
                const placeholder = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xff00ff }));
                group.add(placeholder);
                break;
            }
        }

        // Add a common highlight glow for all collectibles in the world
        const light = new THREE.PointLight(0xffcc00, 0.5, 2);
        light.position.set(0, 0.5, 0);
        light.name = 'collectibleGlow';
        group.add(light);

        return group;
    }
};
