
import * as THREE from 'three';
import { GEOMETRY, MATERIALS, createTextSprite } from '../../utils/assets';
import { ObjectGenerator } from '../../core/world/ObjectGenerator';

interface Textures {
    gravel: THREE.Texture;
    stone: THREE.Texture;
    wood: THREE.Texture;
    pine: THREE.Texture;
    halo: THREE.Texture;
    tacticalMap: THREE.Texture;
}

export const CampWorld = {
    setupTerrain: (scene: THREE.Scene, textures: Textures) => {
        // Ground
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshStandardMaterial({ map: textures.gravel, roughness: 1, color: 0x888888 }));
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        const spawnTree = (x: number, z: number, scale: number) => {
            const tree = ObjectGenerator.createTree(scale);
            tree.position.set(x, 0, z);
            scene.add(tree);
        };

        // Procedural Forest
        for (let i = 0; i < 20; i++) {
            const a = Math.random() * Math.PI * 2; const r = 25 + Math.random() * 15;
            const x = Math.cos(a) * r; const z = Math.sin(a) * r;
            if (z < 10 && Math.abs(x) < 10) continue;
            spawnTree(x, z, 0.8 + Math.random() * 0.4);
        }
        for (let i = 0; i < 150; i++) {
            const a = Math.random() * Math.PI * 2; const r = 40 + Math.random() * 40;
            spawnTree(Math.cos(a) * r, Math.sin(a) * r, 1.0 + Math.random() * 0.5);
        }
        for (let i = 0; i < 400; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 80 + Math.random() * 100;
            const distFactor = Math.max(0.2, 1 - Math.pow((Math.max(0, r - 60) / 140), 1.5));
            const baseScale = 1.5 + Math.random() * 1.0;
            const finalScale = baseScale * distFactor;
            spawnTree(Math.cos(a) * r, Math.sin(a) * r, finalScale);
        }

        // Closer clusters
        for (let i = 0; i < 15; i++) { spawnTree(-15 - Math.random() * 20, -4 + (Math.random() - 0.5) * 20, 0.9 + Math.random() * 0.4); }
        for (let i = 0; i < 15; i++) { spawnTree(15 + Math.random() * 20, -4 + (Math.random() - 0.5) * 20, 0.9 + Math.random() * 0.4); }
    },

    setupStations: (scene: THREE.Scene, textures: Textures, stationsPos: { id: string, pos: THREE.Vector3 }[]) => {
        const interactables: THREE.Mesh[] = [];
        const outlines: Record<string, THREE.LineSegments> = {};

        const createOutline = (geo: THREE.BufferGeometry, color: number) => {
            const edges = new THREE.EdgesGeometry(geo);
            const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
            line.visible = false;
            return line;
        };

        const furnitureMat = new THREE.MeshStandardMaterial({ map: textures.wood, color: 0x888888, roughness: 0.7 });
        const furnitureDarkMat = new THREE.MeshStandardMaterial({ map: textures.wood, color: 0x555555, roughness: 0.8 });
        const ammoGreenMat = new THREE.MeshStandardMaterial({ color: 0x335533, roughness: 0.6 });

        // --- ARMORY ---
        const rackGroup = new THREE.Group();
        rackGroup.position.copy(stationsPos[0].pos);
        rackGroup.rotation.y = 0.6;

        // Structure
        const postGeo = new THREE.BoxGeometry(0.3, 4.5, 0.3);
        const post1 = new THREE.Mesh(postGeo, furnitureMat); post1.position.set(-2, 2.25, -0.5); rackGroup.add(post1);
        const post2 = new THREE.Mesh(postGeo, furnitureMat); post2.position.set(2, 2.25, -0.5); rackGroup.add(post2);
        for (let i = 0; i < 6; i++) {
            const slat = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.4, 0.1), furnitureMat);
            slat.position.set(0, 1.0 + i * 0.6, -0.5); rackGroup.add(slat);
        }

        // Guns
        const createGunProp = (type: 'rifle' | 'smg') => {
            const gun = new THREE.Group();
            const gunMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
            const stock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.1), gunMat); stock.position.y = -0.4; gun.add(stock);
            const bodyLen = type === 'rifle' ? 1.0 : 0.6;
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.15, bodyLen, 0.15), gunMat); gun.add(body);
            const barrelLen = type === 'rifle' ? 0.8 : 0.4;
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, barrelLen), gunMat); barrel.position.y = bodyLen / 2 + barrelLen / 2; gun.add(barrel);
            const mag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.08), gunMat); mag.position.set(0.1, -0.1, 0); mag.rotation.z = -0.2; gun.add(mag);
            gun.rotation.z = Math.PI / 2;
            return gun;
        };
        for (let i = 0; i < 3; i++) { const rifle = createGunProp('rifle'); rifle.position.set(0, 3.5 - 1 * 0.7, -0.3); rackGroup.add(rifle); }
        const smg1 = createGunProp('smg'); smg1.position.set(-1.0, 1.2, -0.3); rackGroup.add(smg1);
        const smg2 = createGunProp('smg'); smg2.position.set(1.0, 1.2, -0.3); rackGroup.add(smg2);

        // Crates
        const crateGeo = new THREE.BoxGeometry(0.8, 0.5, 0.5);
        const crate1 = new THREE.Mesh(crateGeo, ammoGreenMat); crate1.position.set(-1.2, 0.25, 0.2); crate1.rotation.y = 0.2; rackGroup.add(crate1);
        const crate2 = new THREE.Mesh(crateGeo, ammoGreenMat); crate2.position.set(0.8, 0.25, 0.0); crate2.rotation.y = -0.1; rackGroup.add(crate2);
        const crate3 = new THREE.Mesh(crateGeo, ammoGreenMat); crate3.position.set(0.8, 0.75, 0.0); crate3.rotation.y = -0.15; rackGroup.add(crate3);

        const rackBase = new THREE.Mesh(new THREE.BoxGeometry(5, 4.5, 2), new THREE.MeshBasicMaterial({ visible: false }));
        rackBase.position.y = 2.25; rackBase.userData = { id: 'armory' }; rackGroup.add(rackBase);
        const rackOutline = createOutline(new THREE.BoxGeometry(5, 4.5, 2), 0xffff00); rackBase.add(rackOutline); outlines['armory'] = rackOutline;
        interactables.push(rackBase); scene.add(rackGroup);

        // --- MISSIONS TABLE ---
        const boardGroup = new THREE.Group(); boardGroup.position.copy(stationsPos[1].pos);
        const tableH = 1.4, tableW = 5, tableD = 3.5;
        const legGeo = new THREE.BoxGeometry(0.2, tableH, 0.2);
        [[-tableW / 2 + 0.2, -tableD / 2 + 0.2], [tableW / 2 - 0.2, -tableD / 2 + 0.2], [-tableW / 2 + 0.2, tableD / 2 - 0.2], [tableW / 2 - 0.2, tableD / 2 - 0.2]].forEach(p => {
            const l = new THREE.Mesh(legGeo, furnitureDarkMat); l.position.set(p[0], tableH / 2, p[1]); boardGroup.add(l);
        });
        const tableTop = new THREE.Mesh(new THREE.BoxGeometry(tableW, 0.1, tableD), furnitureMat); tableTop.position.y = tableH; boardGroup.add(tableTop);
        const mapPlane = new THREE.Mesh(new THREE.PlaneGeometry(tableW - 0.2, tableD - 0.2), new THREE.MeshStandardMaterial({ map: textures.tacticalMap, roughness: 0.8 }));
        mapPlane.rotation.x = -Math.PI / 2; mapPlane.position.y = tableH + 0.06; boardGroup.add(mapPlane);

        // Props (Knife, Notes)
        const knifeGroup = new THREE.Group(); knifeGroup.position.set(0.5, tableH, -0.5); knifeGroup.rotation.x = Math.PI / 10;
        const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.6), new THREE.MeshStandardMaterial({ color: 0x111111 })); hilt.position.y = 0.5; knifeGroup.add(hilt);
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.02), new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8, roughness: 0.2 })); blade.position.y = 0.1; knifeGroup.add(blade);
        boardGroup.add(knifeGroup);
        for (let i = 0; i < 3; i++) {
            const note = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
            note.rotation.x = -Math.PI / 2; note.rotation.z = Math.random(); note.position.set(-1.5 + Math.random(), tableH + 0.07, -0.8 + Math.random());
            boardGroup.add(note);
        }

        const boardInteract = new THREE.Mesh(new THREE.BoxGeometry(tableW, tableH + 1, tableD), new THREE.MeshBasicMaterial({ visible: false }));
        boardInteract.position.y = tableH / 2; boardInteract.userData = { id: 'missions' }; boardGroup.add(boardInteract);
        const boardOutline = createOutline(new THREE.BoxGeometry(tableW, 0.2, tableD), 0x00ff00); boardOutline.position.y = tableH; boardGroup.add(boardOutline); outlines['missions'] = boardOutline;
        interactables.push(boardInteract); scene.add(boardGroup);

        // --- SKILLS STATION ---
        const skillsGroup = new THREE.Group(); skillsGroup.position.copy(stationsPos[2].pos); skillsGroup.rotation.y = -0.5;
        const benchW = 4, benchD = 2, benchH = 1.3;
        const benchTop = new THREE.Mesh(new THREE.BoxGeometry(benchW, 0.2, benchD), furnitureMat); benchTop.position.y = benchH; skillsGroup.add(benchTop);
        const bLegGeo = new THREE.BoxGeometry(0.3, benchH, 0.3);
        [[-1.5, -0.7], [1.5, -0.7], [-1.5, 0.7], [1.5, 0.7]].forEach(p => { const l = new THREE.Mesh(bLegGeo, furnitureDarkMat); l.position.set(p[0], benchH / 2, p[1]); skillsGroup.add(l); });

        const mkGroup = new THREE.Group(); mkGroup.position.set(0, benchH + 0.1, 0.3); mkGroup.rotation.y = 0.2;
        const mkBox = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.8), new THREE.MeshStandardMaterial({ color: 0xcc0000 })); mkBox.position.y = 0.3; mkGroup.add(mkBox);
        const crossMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const cV = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.82), crossMat); cV.position.y = 0.3; mkGroup.add(cV);
        const cH = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.82), crossMat); cH.position.y = 0.3; mkGroup.add(cH); skillsGroup.add(mkGroup);

        // Bottles
        const bottleGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8);
        const redBottle = new THREE.MeshStandardMaterial({ color: 0xff0000, transparent: true, opacity: 0.8, roughness: 0.1 });
        const greenBottle = new THREE.MeshStandardMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8, roughness: 0.1 });
        const blueBottle = new THREE.MeshStandardMaterial({ color: 0x0000ff, transparent: true, opacity: 0.8, roughness: 0.1 });
        for (let i = 0; i < 3; i++) {
            const b = new THREE.Mesh(bottleGeo, i === 0 ? redBottle : i % 2 === 0 ? greenBottle : blueBottle);
            b.position.set(-1.6 + i * 0.3, benchH + 0.2, -0.4 + (Math.random() - 0.5) * 0.2); skillsGroup.add(b);
        }

        const skillsInteract = new THREE.Mesh(new THREE.BoxGeometry(benchW, benchH + 1, benchD), new THREE.MeshBasicMaterial({ visible: false }));
        skillsInteract.position.y = benchH / 2; skillsInteract.userData = { id: 'skills' }; skillsGroup.add(skillsInteract);
        const skillsOutline = createOutline(new THREE.BoxGeometry(benchW, 0.2, benchD), 0xaa00ff); skillsOutline.position.y = benchH; skillsGroup.add(skillsOutline); outlines['skills'] = skillsOutline;
        interactables.push(skillsInteract); scene.add(skillsGroup);

        return { interactables, outlines };
    }
};
