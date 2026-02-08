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

// Separate function to avoid circular dependency issues in object literal
const setupTrees = (scene: THREE.Scene) => {
    // Seeded random for deterministic layout
    let seed = 12345;
    const srandom = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    };

    const treeInstances: { x: number, z: number, scale: number, darken: number }[] = [];

    // 1. HIGH DARK SILHOUETTES (Denser & Wider)
    for (let i = 0; i < 10; i++) {
        const x = (srandom() - 0.5) * 100;
        const z = -45 - srandom() * 60;

        // Moon Window for silhouettes too
        let scale = + srandom() * 2;

        treeInstances.push({ x, z, scale, darken: 0.12 });
    }

    // 2. THE FOREST WALL (Deterministic V-Shape - Denser)
    for (let i = 0; i < 30; i++) {
        const z = -15 - srandom() * 20;
        const zFactor = (z + 15) / -45;
        const maxX = 35 - (zFactor * 20);
        const x = (srandom() - 0.5) * 2 * maxX;
        if (Math.abs(x) < 2) continue;

        // Moon Window: Reduce scale for trees in the moon's quadrant (-30 < X < -5)
        let scale = 1.1 + srandom() * 0.9;
        if (x < -15 && x > -20) scale *= 0.6;

        treeInstances.push({ x, z, scale, darken: 1.0 });
    }

    // 3. CAMPFIRE FRAMING & SIDE ANCHORS
    treeInstances.push({ x: -15, z: 2, scale: 1.8, darken: 1.0 });
    treeInstances.push({ x: 15, z: 2, scale: 1.8, darken: 1.0 });
    treeInstances.push({ x: 0, z: -16, scale: 1, darken: 1.0 });

    // --- TREE INSTANTIATION ---
    // Ensure prototypes are ready
    ObjectGenerator.initNaturePrototypes();
    const prototypes = ObjectGenerator.getPrototypes(); // Returns flat array: Spruce, Pine, Birch

    if (!prototypes || prototypes.length === 0) return;

    // First 5 are Spruce (NATURE_VARIANTS = 5)
    // We'll use Spruces for the forest wall.

    for (const inst of treeInstances) {
        // Pick a random Spruce variant (indices 0-4)
        // Use srandom logic? Or just simple mod.
        const variantIdx = Math.floor((inst.x + inst.z) % 5 + 5) % 5;
        const tree = prototypes[variantIdx].clone();

        tree.position.set(inst.x, 0, inst.z);
        tree.scale.setScalar(inst.scale);

        // Apply "Darken" (Silhouettes)
        // We must clone materials to avoid affecting shared instances
        if (inst.darken < 0.9) {
            tree.traverse((child: any) => {
                if (child.isMesh) {
                    child.material = child.material.clone();
                    child.material.color.multiplyScalar(inst.darken);
                    // Disable shadows for distant silhouettes to save perf?
                    if (inst.darken < 0.5) {
                        child.castShadow = false;
                        child.receiveShadow = false;
                    }
                }
            });
        }

        scene.add(tree);
    }
};

const setupStations = (scene: THREE.Scene, textures: Textures, stationsPos: { id: string, pos: THREE.Vector3 }[]) => {
    const interactables: THREE.Mesh[] = [];
    const outlines: Record<string, THREE.LineSegments> = {};

    // --- HJÄLPFUNKTIONER ---
    const createOutline = (geo: THREE.BufferGeometry, color: number) => {
        const edges = new THREE.EdgesGeometry(geo);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
        line.visible = false;
        return line;
    };

    // Skapar texturer för karta och papper direkt i koden
    const createCanvasTexture = (width: number, height: number, type: 'map' | 'note') => {
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = type === 'map' ? '#e3d5b8' : '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = '#332211'; ctx.lineWidth = 2;

        if (type === 'map') {
            // Skissad terräng och rött kryss
            for (let i = 0; i < 8; i++) {
                ctx.beginPath();
                ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 30, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 5;
            ctx.beginPath(); ctx.moveTo(width / 2 - 20, height / 2 - 20); ctx.lineTo(width / 2 + 20, height / 2 + 20); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(width / 2 + 20, height / 2 - 20); ctx.lineTo(width / 2 - 20, height / 2 + 20); ctx.stroke();
        } else {
            // Skissade textrader
            ctx.strokeStyle = '#777777';
            for (let i = 1; i < 6; i++) {
                ctx.beginPath(); ctx.moveTo(10, i * 20); ctx.lineTo(width - 10, i * 20); ctx.stroke();
            }
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    };

    const warmWoodMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.8 });
    const darkerWoodMat = new THREE.MeshStandardMaterial({ color: 0x5A3210, roughness: 0.9 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
    const ammoGreenMat = new THREE.MeshStandardMaterial({ color: 0x335533, roughness: 0.6 });

    // =========================================
    // 1. STATION: ARMORY
    // =========================================
    const rackGroup = new THREE.Group();
    const rackPostGeo = new THREE.BoxGeometry(0.2, 4.0, 0.2);
    const p1 = new THREE.Mesh(rackPostGeo, darkerWoodMat); p1.position.set(-1.8, 2, -0.4); rackGroup.add(p1);
    const p2 = new THREE.Mesh(rackPostGeo, darkerWoodMat); p2.position.set(1.8, 2, -0.4); rackGroup.add(p2);
    for (let i = 0; i < 5; i++) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.3, 0.1), warmWoodMat);
        slat.position.set(0, 0.8 + i * 0.7, -0.4); rackGroup.add(slat);
    }

    // Weapons
    for (let i = 0; i < 4; i++) {
        const gun = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, 0.15), metalMat); gun.add(body);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2), metalMat);
        barrel.position.y = 1.3;
        gun.add(barrel);
        gun.position.set(-1.2 + i * 0.8, 0.7, 0.2);
        gun.rotation.x = -0.25;
        rackGroup.add(gun);
    }

    // Ammo crates
    const crateGeo = new THREE.BoxGeometry(0.8, 0.5, 0.6);
    const c1 = new THREE.Mesh(crateGeo, ammoGreenMat); c1.position.set(-2.0, 0.25, 0.6); c1.rotation.y = 0.3; rackGroup.add(c1);
    const c2 = new THREE.Mesh(crateGeo, ammoGreenMat); c2.position.set(-0.9, 0.25, 0.4); c2.rotation.y = 1.4; rackGroup.add(c2);
    const c3 = new THREE.Mesh(crateGeo, ammoGreenMat); c3.position.set(-1.8, 0.75, 0.65); c3.rotation.y = 0.6; rackGroup.add(c3);

    // =========================================
    // 2. STATION: ADVENTURE LOG
    // =========================================
    const deskGroup = new THREE.Group();
    const dW = 2.4, dD = 1.4, dH = 1.1;
    const dTop = new THREE.Mesh(new THREE.BoxGeometry(dW, 0.1, dD), warmWoodMat);
    dTop.position.y = dH; deskGroup.add(dTop);

    // Legs
    const dLegGeo = new THREE.BoxGeometry(0.15, dH, 0.15);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(p => {
        const l = new THREE.Mesh(dLegGeo, darkerWoodMat);
        l.position.set(p[0] * (dW / 2 - 0.2), dH / 2, p[1] * (dD / 2 - 0.2));
        deskGroup.add(l);
    });

    // Staples books
    for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.9), new THREE.MeshStandardMaterial({ color: 0x442211 + i * 0x111111 }));
        b.position.set(-0.6, dH + 0.06 + (i * 0.13), -0.1);
        b.rotation.y = (Math.random() - 0.5) * 0.4;
        deskGroup.add(b);
    }

    // Open book 
    const openBook = new THREE.Group();
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xffffee, roughness: 0.9 });
    const coverMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.8 });

    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.7), coverMat);
    openBook.add(cover);

    const pageL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.65), paperMat);
    pageL.position.set(-0.2, 0.15, 0);
    pageL.rotation.z = 0.15;
    openBook.add(pageL);

    const pageR = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.65), paperMat);
    pageR.position.set(0.2, 0.15, 0);
    pageR.rotation.z = -0.15;
    openBook.add(pageR);
    openBook.position.set(0.6, dH + 0.02, 0.3);
    openBook.rotation.y = -0.3;
    deskGroup.add(openBook);

    // =========================================
    // 3. STATION: SECTOR OVERVIEW
    // =========================================
    const mapGroup = new THREE.Group();
    const bW = 3.5, bH = 2.2;

    // Poles
    const mLegGeo = new THREE.BoxGeometry(0.2, 4.0, 0.2);
    const mL = new THREE.Mesh(mLegGeo, darkerWoodMat); mL.position.set(-bW / 2, 2, 0); mapGroup.add(mL);
    const mR = new THREE.Mesh(mLegGeo, darkerWoodMat); mR.position.set(bW / 2, 2, 0); mapGroup.add(mR);

    const board = new THREE.Mesh(new THREE.BoxGeometry(bW, bH, 0.1), warmWoodMat);
    board.position.y = 2.8; mapGroup.add(board);

    // Map
    const map = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.4), new THREE.MeshStandardMaterial({ map: createCanvasTexture(256, 256, 'map') }));
    map.position.set(0, 2.8, 0.06); mapGroup.add(map);

    // Notes
    const noteTex = createCanvasTexture(128, 128, 'note');
    for (let i = 0; i < 3; i++) {
        const note = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.5), new THREE.MeshStandardMaterial({ map: noteTex, transparent: true }));
        const angle = (i / 4) * Math.PI * 2;
        note.position.set(Math.cos(angle) * 1.2, 2.8 + Math.sin(angle) * 0.7, 0.8);
        note.rotation.z = (Math.random() - 0.5) * 1.2;
        mapGroup.add(note);
    }

    // =========================================
    // 4. STATION SKILLS
    // =========================================
    const medGroup = new THREE.Group();
    const cH = 5.0, cW = 2.0, cD = 0.8, th = 0.1;

    // Back
    const back = new THREE.Mesh(new THREE.BoxGeometry(cW, cH, th), warmWoodMat);
    back.position.set(0, cH / 2, -cD / 2 + th / 2); medGroup.add(back);
    // Sides
    const sGeo = new THREE.BoxGeometry(th, cH, cD);
    const sL = new THREE.Mesh(sGeo, warmWoodMat); sL.position.set(-cW / 2 + th / 2, cH / 2, 0); medGroup.add(sL);
    const sR = new THREE.Mesh(sGeo, warmWoodMat); sR.position.set(cW / 2 - th / 2, cH / 2, 0); medGroup.add(sR);
    // Top/Bottom
    const tbGeo = new THREE.BoxGeometry(cW, th, cD);
    const top = new THREE.Mesh(tbGeo, warmWoodMat); top.position.set(0, cH - th / 2, 0); medGroup.add(top);
    const bot = new THREE.Mesh(tbGeo, warmWoodMat); bot.position.set(0, th / 2, 0); medGroup.add(bot);
    // Doors
    const cDoor = new THREE.Mesh(new THREE.BoxGeometry(cW - 0.1, cH * 0.3, th), darkerWoodMat);
    cDoor.position.set(0, cH * 0.15, cD / 2); medGroup.add(cDoor);
    // Shelves and bottles
    for (let h = 0; h < 3; h++) {
        const yBase = cH * 0.4 + (h * 1.0);
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(cW - th * 2, th / 2, cD - th), darkerWoodMat);
        shelf.position.set(0, yBase, 0); medGroup.add(shelf);

        for (let f = 0; f < 3; f++) {
            const isRound = Math.random() > 0.5;
            const bMat = new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff, transparent: true, opacity: 0.8 });
            const b = new THREE.Mesh(isRound ? new THREE.SphereGeometry(0.12, 8, 8) : new THREE.BoxGeometry(0.15, 0.4, 0.15), bMat);
            b.position.set(-0.7 + f * 0.28, yBase + 0.25, 0);
            medGroup.add(b);
            if (isRound) {
                const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2), bMat);
                neck.position.set(b.position.x, b.position.y + 0.15, b.position.z); medGroup.add(neck);
            }
        }
    }

    // Medicine box
    const medkit = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0xcc0000 }));
    medkit.add(box);

    const crossMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.35, 0.42), crossMat);
    crossV.position.set(0, 0, 0.01);
    medkit.add(crossV);

    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.42), crossMat);
    crossH.position.set(0, 0, 0.01);
    medkit.add(crossH);

    medkit.position.set(0.5, cH * 0.4 + 0.25, 0);
    medGroup.add(medkit);

    // =========================================
    // PLACERING
    // =========================================
    const rad = 7.5;
    rackGroup.position.set(-rad * 0.8, 0, -rad * 0.5); rackGroup.lookAt(0, 0, 0); scene.add(rackGroup);
    deskGroup.position.set(-rad * 0.3, 0, -rad * 0.95); deskGroup.lookAt(0, 0, 0); scene.add(deskGroup);
    mapGroup.position.set(rad * 0.3, 0, -rad * 0.95); mapGroup.lookAt(0, 0, 0); scene.add(mapGroup);
    medGroup.position.set(rad * 0.8, 0, -rad * 0.5); medGroup.lookAt(0, 0, 0); scene.add(medGroup);

    // =========================================
    // INTERACTION & OUTLINES
    // =========================================

    // 1. Armory
    const rackInteract = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 2), new THREE.MeshBasicMaterial({ visible: false }));
    rackInteract.position.y = 2;
    rackInteract.userData = { id: 'armory' };
    rackGroup.add(rackInteract);
    interactables.push(rackInteract);

    const rackOutline = createOutline(new THREE.BoxGeometry(4, 4, 2), 0xffff00);
    rackOutline.position.y = 2;
    rackGroup.add(rackOutline);
    outlines['armory'] = rackOutline;

    // 2. Adventure Log (Desk)
    const logInteract = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.5, 1.5), new THREE.MeshBasicMaterial({ visible: false }));
    logInteract.position.y = 0.75;
    logInteract.userData = { id: 'adventure_log' };
    deskGroup.add(logInteract);
    interactables.push(logInteract);

    const logOutline = createOutline(new THREE.BoxGeometry(2.5, 1.5, 1.5), 0x00ff00);
    logOutline.position.y = 0.75;
    deskGroup.add(logOutline);
    outlines['adventure_log'] = logOutline;

    // 3. Sectors (Map Board)
    const mapInteract = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 1), new THREE.MeshBasicMaterial({ visible: false }));
    mapInteract.position.y = 2;
    mapInteract.userData = { id: 'sectors' };
    mapGroup.add(mapInteract);
    interactables.push(mapInteract);

    const mapOutline = createOutline(new THREE.BoxGeometry(4, 4, 1), 0xff0000);
    mapOutline.position.y = 2;
    mapGroup.add(mapOutline);
    outlines['sectors'] = mapOutline;

    // 4. Skills (Medicine Cabinet)
    const skillInteract = new THREE.Mesh(new THREE.BoxGeometry(2.5, 5, 2), new THREE.MeshBasicMaterial({ visible: false }));
    skillInteract.position.y = 2.5;
    skillInteract.userData = { id: 'skills' };
    medGroup.add(skillInteract);
    interactables.push(skillInteract);

    const skillOutline = createOutline(new THREE.BoxGeometry(2.5, 5, 2), 0xaa00ff);
    skillOutline.position.y = 2.5;
    medGroup.add(skillOutline);
    outlines['skills'] = skillOutline;

    [rackGroup, deskGroup, mapGroup, medGroup].forEach(g => g.traverse(c => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; }));

    return { interactables, outlines };
};

export const CampWorld = {
    setupTerrain: (scene: THREE.Scene, textures: Textures) => {
        // Ground
        const groundMat = MATERIALS.dirt.clone();
        if (groundMat.map) {
            groundMat.map.repeat.set(100, 100);
        }
        if (groundMat.bumpMap) {
            groundMat.bumpMap.repeat.set(100, 100);
        }
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        setupTrees(scene);
    },

    setupTrees,
    setupStations
};
