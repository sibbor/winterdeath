import * as THREE from 'three';
import { GEOMETRY, MATERIALS } from '../../utils/assets';
import { EnvironmentGenerator } from '../../core/world/EnvironmentGenerator';
import { WinterEngine } from '../../core/engine/WinterEngine';
import { WEATHER } from '../../content/constants';
import { WeatherType } from '../../types';

// ============================================================================
// CONFIGURATION CONSTANTS (Source of truth for Camp & AssetPreloader)
// ============================================================================
export const CAMP_SCENE = {
    starCount: 1200,

    // Fog & Background
    bgColor: 0x161629,
    fogColor: 0x161629,
    fogDensity: 0.01,
    ambientIntensity: 0.4,
    skyLight: {
        visible: true,
        color: 0xaaccff,
        intensity: 0.4
    },

    // Cameras
    cameraBaseLookAt: new THREE.Vector3(0, 2, -5),
    cameraCinematicLookAt: new THREE.Vector3(0, 8, -5),

    // Lighting
    hemiLight: { sky: 0x444455, ground: 0x111115, intensity: 0.6 },
    dirLight: { color: 0xaaccff, intensity: 0.4, bias: -0.0002 },
    campfireLight: {
        color: 0xff7722,
        intensity: 40,
        distance: 90,
        bias: -0.0005,
        normalBias: 0.02,
        castShadow: true,
        shadowMapSizeWidth: 512,
        shadowMapSizeHeight: 512
    }
};

// Particles Constants
export const CONST_GEO = {
    flame: new THREE.DodecahedronGeometry(0.6),
    spark: new THREE.BoxGeometry(0.05, 0.05, 0.05),
    smoke: new THREE.DodecahedronGeometry(0.6)
};

export const CONST_MAT = {
    flame: new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.8 }),
    spark: new THREE.MeshBasicMaterial({ color: 0xffaa00 }),
    smoke: new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.3 })
};

interface Textures {
    gravel: THREE.Texture;
    stone: THREE.Texture;
    wood: THREE.Texture;
    pine: THREE.Texture;
    halo: THREE.Texture;
    tacticalMap: THREE.Texture;
}

export interface CampEffectsState {
    particles: {
        flames: any[];
        sparkles: any[];
        smokes: any[];
    };
    starSystem: THREE.Points;
    fireLight: THREE.PointLight;
}

// --- PERSISTENT CACHE ---
export const stationTextures: Record<string, THREE.CanvasTexture> = {};
export const stationGeometries: Record<string, THREE.BufferGeometry> = {};
export const stationMaterials: Record<string, THREE.MeshStandardMaterial> = {
    warmWood: new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.8 }),
    darkerWood: new THREE.MeshStandardMaterial({ color: 0x5A3210, roughness: 0.9 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 }),
    ammoGreen: new THREE.MeshStandardMaterial({ color: 0x335533, roughness: 0.6 }),
    medkitRed: new THREE.MeshStandardMaterial({ color: 0xcc0000 })
};

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

const getCachedCanvasTexture = (width: number, height: number, type: 'map' | 'note') => {
    const key = `${type}_${width}x${height}`;
    if (stationTextures[key]) return stationTextures[key];

    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = type === 'map' ? '#e3d5b8' : '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#332211'; ctx.lineWidth = 2;

    if (type === 'map') {
        for (let i = 0; i < 8; i++) {
            ctx.beginPath();
            ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 30, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(width / 2 - 20, height / 2 - 20); ctx.lineTo(width / 2 + 20, height / 2 + 20); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(width / 2 + 20, height / 2 - 20); ctx.lineTo(width / 2 - 20, height / 2 + 20); ctx.stroke();
    } else {
        ctx.strokeStyle = '#777777';
        for (let i = 1; i < 6; i++) {
            ctx.beginPath(); ctx.moveTo(10, i * 20); ctx.lineTo(width - 10, i * 20); ctx.stroke();
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    stationTextures[key] = tex;
    return tex;
};

const createOutline = (geo: THREE.BufferGeometry, color: number) => {
    const edges = new THREE.EdgesGeometry(geo);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
    line.visible = false;
    return line;
};

const setupTrees = async (scene: THREE.Scene) => {
    let seed = 12345;
    const srandom = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const treeInstances: { x: number, z: number, scale: number, darken: number }[] = [];

    for (let i = 0; i < 60; i++) {
        const x = (srandom() - 0.5) * 120;
        const z = -45 - srandom() * 80;
        let scale = 1.0 + srandom() * 2.5;
        treeInstances.push({ x, z, scale, darken: 0.12 });
    }

    for (let i = 0; i < 40; i++) {
        const z = -15 - srandom() * 25;
        const zFactor = (z + 15) / -45;
        const maxX = 35 - (zFactor * 20);
        const x = (srandom() - 0.5) * 2 * maxX;
        if (Math.abs(x) < 2) continue;
        let scale = 1.1 + srandom() * 0.9;
        if (x < -15 && x > -20) scale *= 0.6;
        treeInstances.push({ x, z, scale, darken: 1.0 });
    }

    treeInstances.push({ x: -15, z: 2, scale: 1.8, darken: 1.0 });
    treeInstances.push({ x: 15, z: 2, scale: 1.8, darken: 1.0 });
    treeInstances.push({ x: 0, z: -16, scale: 1, darken: 1.0 });

    await EnvironmentGenerator.initNaturePrototypes();
    const normalMatrices: Record<string, THREE.Matrix4[]> = {};
    const darkMatrices: Record<string, THREE.Matrix4[]> = {};
    const dummy = new THREE.Object3D();

    for (let i = 0; i < treeInstances.length; i++) {
        const inst = treeInstances[i];
        dummy.position.set(inst.x, -2.0, inst.z);
        dummy.rotation.set(0, srandom() * Math.PI * 2, 0);
        dummy.scale.setScalar(inst.scale);
        dummy.updateMatrix();

        const variantIdx = Math.floor(Math.abs(inst.x + inst.z)) % 3;
        const key = `PINE_${variantIdx}`;

        if (inst.darken < 0.5) {
            if (!darkMatrices[key]) darkMatrices[key] = [];
            darkMatrices[key].push(dummy.matrix.clone());
        } else {
            if (!normalMatrices[key]) normalMatrices[key] = [];
            normalMatrices[key].push(dummy.matrix.clone());
        }
    }

    const silhouetteMat = MATERIALS.treeSilhouette;
    for (const key in normalMatrices) EnvironmentGenerator.addInstancedTrees({ scene } as any, key, normalMatrices[key]);
    for (const key in darkMatrices) EnvironmentGenerator.addInstancedTrees({ scene } as any, key, darkMatrices[key], silhouetteMat);
};

const setupSky = (scene: THREE.Scene, textures: Textures) => {
    const skyGeo = new THREE.SphereGeometry(15, 32, 32);
    const skyMat = new THREE.MeshBasicMaterial({ color: 0xffffeb, fog: false });
    const skyBody = new THREE.Mesh(skyGeo, skyMat);
    skyBody.position.set(-120, 80, -350);
    scene.add(skyBody);

    const skyLight = new THREE.DirectionalLight(CAMP_SCENE.skyLight.color, CAMP_SCENE.skyLight.intensity);
    skyLight.name = 'SKY_LIGHT';
    skyLight.position.set(-80, 150, -100);
    skyLight.castShadow = true;
    skyLight.shadow.mapSize.width = 1024;
    skyLight.shadow.mapSize.height = 1024;
    skyLight.shadow.camera.near = 0.5;
    skyLight.shadow.camera.far = 1000;
    skyLight.shadow.camera.left = -100;
    skyLight.shadow.camera.right = 100;
    skyLight.shadow.camera.top = 100;
    skyLight.shadow.camera.bottom = -100;
    skyLight.shadow.bias = CAMP_SCENE.dirLight.bias;
    scene.add(skyLight);

    const moonHaloSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: textures.halo, color: 0xffffee, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, fog: false, depthWrite: false
    }));
    moonHaloSprite.scale.set(120, 120, 1);
    moonHaloSprite.position.copy(skyBody.position);
    scene.add(moonHaloSprite);

    const starCount = CAMP_SCENE.starCount;
    const starGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);
    const phases = new Float32Array(starCount);
    const twinkleSpeeds = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
        const r = 1800 + Math.random() * 200;
        const theta = Math.random() * Math.PI * 2;
        const phi = (Math.PI / 2) - Math.random() * 1.2;
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.cos(phi);
        positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        sizes[i] = Math.random() > 0.95 ? 3.0 : (Math.random() > 0.85 ? 2.5 : 2.0);
        phases[i] = Math.random() * Math.PI * 2;
        twinkleSpeeds[i] = Math.random() > 0.9 ? 0.3 + Math.random() * 0.4 : 0.0;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    starGeo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    starGeo.setAttribute('twinkleSpeed', new THREE.BufferAttribute(twinkleSpeeds, 1));

    const starMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: `
            attribute float size; attribute float phase; attribute float twinkleSpeed; varying float vAlpha; uniform float uTime;
            void main() {
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
                float alpha = 0.8 + 0.2 * sin(phase);
                if (twinkleSpeed > 0.0) alpha = 0.9 + 0.1 * sin(uTime * twinkleSpeed + phase);
                vAlpha = alpha; gl_PointSize = size * (2500.0 / -mvPosition.z);
            }
        `,
        fragmentShader: `varying float vAlpha; void main() { vec2 coord = gl_PointCoord - vec2(0.5); if(length(coord) > 0.5) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, vAlpha); }`,
        transparent: true, depthWrite: false,
    });

    const starSystem = new THREE.Points(starGeo, starMat);
    starSystem.rotation.z = 0.1;
    scene.add(starSystem);
    return starSystem;
};

const setupCampfire = (scene: THREE.Scene, textures: Textures) => {

    const fireLight = new THREE.PointLight(
        CAMP_SCENE.campfireLight.color,
        CAMP_SCENE.campfireLight.intensity,
        CAMP_SCENE.campfireLight.distance);
    fireLight.position.set(0, 3, 0);
    fireLight.castShadow = CAMP_SCENE.campfireLight.castShadow;
    fireLight.shadow.mapSize.width = CAMP_SCENE.campfireLight.shadowMapSizeWidth;
    fireLight.shadow.mapSize.height = CAMP_SCENE.campfireLight.shadowMapSizeHeight;
    fireLight.shadow.bias = CAMP_SCENE.campfireLight.bias;
    fireLight.shadow.normalBias = CAMP_SCENE.campfireLight.normalBias;
    scene.add(fireLight);

    const fireGroup = new THREE.Group();
    const ash = new THREE.Mesh(new THREE.CircleGeometry(1.8, 16), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    ash.rotation.x = -Math.PI / 2; ash.position.y = 0.02; fireGroup.add(ash);

    const stoneGeo = new THREE.DodecahedronGeometry(0.4);
    const stoneMat = new THREE.MeshStandardMaterial({ map: textures.stone, color: 0x888888, roughness: 0.9 });

    for (let i = 0; i < 15; i++) {
        const s = new THREE.Mesh(stoneGeo, stoneMat);
        const angle = (i / 15) * Math.PI * 2;
        s.position.set(Math.cos(angle) * 1.5, 0.15, Math.sin(angle) * 1.5);
        s.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        fireGroup.add(s);
    }

    const logGeo = new THREE.CylinderGeometry(0.15, 0.15, 2.2);
    const logMat = new THREE.MeshStandardMaterial({ map: textures.wood, color: 0x5e3723 });
    for (let i = 0; i < 4; i++) {
        const log = new THREE.Mesh(logGeo, logMat);
        log.position.y = 0.25; log.rotation.z = Math.PI / 2; log.rotation.y = (i / 4) * Math.PI * 2 + Math.PI / 4;
        fireGroup.add(log);
    }
    scene.add(fireGroup);

    return fireLight;
};

// ============================================================================
// EXPORTED MODULE: CampWorld
// ============================================================================
export const CampWorld = {
    setupTerrain: (scene: THREE.Scene, textures: Textures) => {
        const groundMat = MATERIALS.dirt.clone();
        if (groundMat.map) groundMat.map.repeat.set(60, 60);
        if (groundMat.bumpMap) groundMat.bumpMap.repeat.set(60, 60);
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        setupTrees(scene);
    },

    setupStations: (scene: THREE.Scene, textures: Textures, stationsPos: { id: string, pos: THREE.Vector3 }[]) => {
        const interactables: THREE.Mesh[] = [];
        const outlines: Record<string, THREE.LineSegments> = {};
        const { warmWood: warmWoodMat, darkerWood: darkerWoodMat, metal: metalMat, ammoGreen: ammoGreenMat } = stationMaterials;

        // 1. STATION: ARMORY
        const rackGroup = new THREE.Group();
        const p1 = new THREE.Mesh(GEOMETRY.box, darkerWoodMat); p1.scale.set(0.2, 4.0, 0.2); p1.position.set(-1.8, 2, -0.4); rackGroup.add(p1);
        const p2 = new THREE.Mesh(GEOMETRY.box, darkerWoodMat); p2.scale.set(0.2, 4.0, 0.2); p2.position.set(1.8, 2, -0.4); rackGroup.add(p2);
        for (let i = 0; i < 5; i++) {
            const slat = new THREE.Mesh(GEOMETRY.box, warmWoodMat);
            slat.scale.set(3.6, 0.3, 0.1);
            slat.position.set(0, 0.8 + i * 0.7, -0.4); rackGroup.add(slat);
        }

        const barrelGeo = stationGeometries.barrel || new THREE.CylinderGeometry(0.03, 0.03, 1.2);
        stationGeometries.barrel = barrelGeo;
        for (let i = 0; i < 4; i++) {
            const gun = new THREE.Group();
            const body = new THREE.Mesh(GEOMETRY.box, metalMat);
            body.scale.set(0.2, 1.4, 0.15);
            gun.add(body);
            const barrel = new THREE.Mesh(barrelGeo, metalMat);
            barrel.position.y = 1.3;
            gun.add(barrel);
            gun.position.set(-1.2 + i * 0.8, 0.7, 0.2);
            gun.rotation.x = -0.25;
            rackGroup.add(gun);
        }

        const c1 = new THREE.Mesh(GEOMETRY.box, ammoGreenMat); c1.scale.set(0.8, 0.5, 0.6); c1.position.set(-2.0, 0.25, 0.6); c1.rotation.y = 0.3; rackGroup.add(c1);
        const c2 = new THREE.Mesh(GEOMETRY.box, ammoGreenMat); c2.scale.set(0.8, 0.5, 0.6); c2.position.set(-0.9, 0.25, 0.4); c2.rotation.y = 1.4; rackGroup.add(c2);
        const c3 = new THREE.Mesh(GEOMETRY.box, ammoGreenMat); c3.scale.set(0.8, 0.5, 0.6); c3.position.set(-1.8, 0.75, 0.65); c3.rotation.y = 0.6; rackGroup.add(c3);

        // 2. STATION: ADVENTURE LOG
        const deskGroup = new THREE.Group();
        const dW = 2.4, dD = 1.4, dH = 1.1;
        const dTop = new THREE.Mesh(GEOMETRY.box, warmWoodMat);
        dTop.scale.set(dW, 0.1, dD);
        dTop.position.y = dH; deskGroup.add(dTop);
        const legPositions = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
        for (let i = 0; i < legPositions.length; i++) {
            const p = legPositions[i];
            const l = new THREE.Mesh(GEOMETRY.box, darkerWoodMat);
            l.scale.set(0.15, dH, 0.15);
            l.position.set(p[0] * (dW / 2 - 0.2), dH / 2, p[1] * (dD / 2 - 0.2));
            deskGroup.add(l);
        }
        for (let i = 0; i < 3; i++) {
            const b = new THREE.Mesh(GEOMETRY.box, new THREE.MeshStandardMaterial({ color: 0x442211 + i * 0x111111 }));
            b.scale.set(0.7, 0.12, 0.9);
            b.position.set(-0.6, dH + 0.06 + (i * 0.13), -0.1);
            b.rotation.y = (Math.random() - 0.5) * 0.4;
            deskGroup.add(b);
        }
        const openBook = new THREE.Group();
        const paperMat = new THREE.MeshStandardMaterial({ color: 0xffffee, roughness: 0.9 });
        const coverMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.8 });
        const cover = new THREE.Mesh(GEOMETRY.box, coverMat);
        cover.scale.set(0.9, 0.04, 0.7);
        openBook.add(cover);
        const pageL = new THREE.Mesh(GEOMETRY.box, paperMat); pageL.scale.set(0.42, 0.03, 0.65); pageL.position.set(-0.2, 0.15, 0); pageL.rotation.z = 0.15; openBook.add(pageL);
        const pageR = new THREE.Mesh(GEOMETRY.box, paperMat); pageR.scale.set(0.42, 0.03, 0.65); pageR.position.set(0.2, 0.15, 0); pageR.rotation.z = -0.15; openBook.add(pageR);
        openBook.position.set(0.6, dH + 0.02, 0.3); openBook.rotation.y = -0.3; deskGroup.add(openBook);

        // 3. STATION: SECTOR OVERVIEW
        const mapGroup = new THREE.Group();
        const bW = 3.5, bH = 2.2;
        const mL = new THREE.Mesh(GEOMETRY.box, darkerWoodMat); mL.scale.set(0.2, 4.0, 0.2); mL.position.set(-bW / 2, 2, 0); mapGroup.add(mL);
        const mR = new THREE.Mesh(GEOMETRY.box, darkerWoodMat); mR.scale.set(0.2, 4.0, 0.2); mR.position.set(bW / 2, 2, 0); mapGroup.add(mR);
        const board = new THREE.Mesh(GEOMETRY.box, warmWoodMat); board.scale.set(bW, bH, 0.1); board.position.y = 2.8; mapGroup.add(board);
        const mapGeo = stationGeometries.map_plane || new THREE.PlaneGeometry(2.0, 1.4);
        stationGeometries.map_plane = mapGeo;
        const map = new THREE.Mesh(mapGeo, new THREE.MeshStandardMaterial({ map: getCachedCanvasTexture(256, 256, 'map') }));
        map.position.set(0, 2.8, 0.06); mapGroup.add(map);
        const noteTex = getCachedCanvasTexture(128, 128, 'note');
        const noteGeo = stationGeometries.note_plane || new THREE.PlaneGeometry(0.4, 0.5);
        stationGeometries.note_plane = noteGeo;
        for (let i = 0; i < 3; i++) {
            const note = new THREE.Mesh(noteGeo, new THREE.MeshStandardMaterial({ map: noteTex, transparent: true }));
            const angle = (i / 4) * Math.PI * 2;
            note.position.set(Math.cos(angle) * 1.2, 2.8 + Math.sin(angle) * 0.7, 0.8);
            note.rotation.z = (Math.random() - 0.5) * 1.2;
            mapGroup.add(note);
        }

        // 4. STATION SKILLS
        const medGroup = new THREE.Group();
        const cH = 5.0, cW = 2.0, cD = 0.8, th = 0.1;
        const back = new THREE.Mesh(GEOMETRY.box, warmWoodMat); back.scale.set(cW, cH, th); back.position.set(0, cH / 2, -cD / 2 + th / 2); medGroup.add(back);
        const sL = new THREE.Mesh(GEOMETRY.box, warmWoodMat); sL.scale.set(th, cH, cD); sL.position.set(-cW / 2 + th / 2, cH / 2, 0); medGroup.add(sL);
        const sR = new THREE.Mesh(GEOMETRY.box, warmWoodMat); sR.scale.set(th, cH, cD); sR.position.set(cW / 2 - th / 2, cH / 2, 0); medGroup.add(sR);
        const top = new THREE.Mesh(GEOMETRY.box, warmWoodMat); top.scale.set(cW, th, cD); top.position.set(0, cH - th / 2, 0); medGroup.add(top);
        const bot = new THREE.Mesh(GEOMETRY.box, warmWoodMat); bot.scale.set(cW, th, cD); bot.position.set(0, th / 2, 0); medGroup.add(bot);
        const cDoor = new THREE.Mesh(GEOMETRY.box, darkerWoodMat); cDoor.scale.set(cW - 0.1, cH * 0.3, th); cDoor.position.set(0, cH * 0.15, cD / 2); medGroup.add(cDoor);
        for (let h = 0; h < 3; h++) {
            const yBase = cH * 0.4 + (h * 1.0);
            const shelf = new THREE.Mesh(GEOMETRY.box, darkerWoodMat); shelf.scale.set(cW - th * 2, th / 2, cD - th); shelf.position.set(0, yBase, 0); medGroup.add(shelf);
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
        const medkit = new THREE.Group();
        const box = new THREE.Mesh(GEOMETRY.box, new THREE.MeshStandardMaterial({ color: 0xcc0000 })); box.scale.set(0.7, 0.4, 0.4); medkit.add(box);
        const crossMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const crossV = new THREE.Mesh(GEOMETRY.box, crossMat); crossV.scale.set(0.15, 0.35, 0.42); crossV.position.set(0, 0, 0.01); medkit.add(crossV);
        const crossH = new THREE.Mesh(GEOMETRY.box, crossMat); crossH.scale.set(0.35, 0.15, 0.42); crossH.position.set(0, 0, 0.01); medkit.add(crossH);
        medkit.position.set(0.5, cH * 0.4 + 0.25, 0); medGroup.add(medkit);

        // PLACERING
        const rad = 7.5;
        rackGroup.position.set(-rad * 0.8, 0, -rad * 0.5); rackGroup.lookAt(0, 0, 0); scene.add(rackGroup);
        deskGroup.position.set(-rad * 0.3, 0, -rad * 0.95); deskGroup.lookAt(0, 0, 0); scene.add(deskGroup);
        mapGroup.position.set(rad * 0.3, 0, -rad * 0.95); mapGroup.lookAt(0, 0, 0); scene.add(mapGroup);
        medGroup.position.set(rad * 0.8, 0, -rad * 0.5); medGroup.lookAt(0, 0, 0); scene.add(medGroup);

        // INTERACTION & OUTLINES
        const rackInteract = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 2), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0 }));
        rackInteract.position.y = 2; rackInteract.userData = { id: 'armory', name: 'armory' }; rackGroup.add(rackInteract); interactables.push(rackInteract);
        const rackOutline = createOutline(new THREE.BoxGeometry(4, 4, 2), 0xffff00); rackOutline.position.y = 2; rackGroup.add(rackOutline); outlines['armory'] = rackOutline;

        const logInteract = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.5, 1.5), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0 }));
        logInteract.position.y = 0.75; logInteract.userData = { id: 'adventure_log', name: 'adventure_log' }; deskGroup.add(logInteract); interactables.push(logInteract);
        const logOutline = createOutline(new THREE.BoxGeometry(2.5, 1.5, 1.5), 0x00ff00); logOutline.position.y = 0.75; deskGroup.add(logOutline); outlines['adventure_log'] = logOutline;

        const mapInteract = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 1), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0 }));
        mapInteract.position.y = 2; mapInteract.userData = { id: 'sectors', name: 'sectors' }; mapGroup.add(mapInteract); interactables.push(mapInteract);
        const mapOutline = createOutline(new THREE.BoxGeometry(4, 4, 1), 0xff0000); mapOutline.position.y = 2; mapGroup.add(mapOutline); outlines['sectors'] = mapOutline;

        const skillInteract = new THREE.Mesh(new THREE.BoxGeometry(2.5, 5, 2), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0 }));
        skillInteract.position.y = 2.5; skillInteract.userData = { id: 'skills', name: 'skills' }; medGroup.add(skillInteract); interactables.push(skillInteract);
        const skillOutline = createOutline(new THREE.BoxGeometry(2.5, 5, 2), 0xaa00ff); skillOutline.position.y = 2.5; medGroup.add(skillOutline); outlines['skills'] = skillOutline;

        const stationGroups = [rackGroup, deskGroup, mapGroup, medGroup];
        for (let i = 0; i < stationGroups.length; i++) {
            stationGroups[i].traverse(c => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
        }

        return { interactables, outlines };
    },

    initEffects: (scene: THREE.Scene, textures: Textures, weatherType: WeatherType): CampEffectsState => {
        const engine = WinterEngine.getInstance();
        engine.wind.setRandomWind(WEATHER.WIND_MIN, WEATHER.WIND_MAX);
        engine.weather.reAttach(scene);
        engine.water.reAttach(scene);
        engine.weather.sync(weatherType, WEATHER.PARTICLE_COUNT, 60);

        const starSystem = setupSky(scene, textures);
        const fireLight = setupCampfire(scene, textures);

        const flames: any[] = [];
        const sparkles: any[] = [];
        const smokes: any[] = [];

        for (let i = 0; i < 20; i++) {
            const f = new THREE.Mesh(CONST_GEO.flame, CONST_MAT.flame.clone()); f.visible = false; scene.add(f); flames.push({ mesh: f, life: 0, speed: 0 });
        }
        for (let i = 0; i < 30; i++) {
            const s = new THREE.Mesh(CONST_GEO.spark, CONST_MAT.spark.clone()); s.visible = false; scene.add(s); sparkles.push({ mesh: s, life: 0, vy: 0, vx: 0, vz: 0 });
        }
        for (let i = 0; i < 20; i++) {
            const sm = new THREE.Mesh(CONST_GEO.smoke, CONST_MAT.smoke.clone()); sm.visible = false; scene.add(sm); smokes.push({ mesh: sm, life: 0, speed: 0 });
        }

        const state: CampEffectsState = { particles: { flames, sparkles, smokes }, starSystem, fireLight };

        // Pre-warm the simulation
        for (let i = 0; i < 12; i++) {
            CampWorld.updateEffects(scene, state, 0.016, i * 0.016, i);
        }
        return state;
    },

    updateEffects: (scene: THREE.Scene, state: CampEffectsState, delta: number, now: number, frame: number) => {
        const wind = WinterEngine.getInstance().wind.current;

        if (state.starSystem) {
            (state.starSystem.material as THREE.ShaderMaterial).uniforms.uTime.value = frame * 0.05;
            state.starSystem.rotateY(-0.00008);
        }

        if (state.fireLight) {
            state.fireLight.intensity = CAMP_SCENE.campfireLight.intensity - 5 + Math.sin(frame * 0.1) * 12 + Math.random() * 5;
        }

        const { flames, sparkles, smokes } = state.particles;

        if (frame % 4 === 0) {
            for (let i = 0; i < flames.length; i++) {
                if (flames[i].life <= 0) {
                    const f = flames[i];
                    f.mesh.position.set((Math.random() - 0.5) * 1.5, 0.2, (Math.random() - 0.5) * 1.5);
                    f.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
                    f.mesh.visible = true; f.life = 1.0; f.speed = 0.03 + Math.random() * 0.04;
                    break;
                }
            }
        }
        for (let i = 0; i < flames.length; i++) {
            const f = flames[i];
            if (f.life > 0) {
                f.life -= 0.015; f.mesh.position.y += f.speed; f.mesh.position.x += wind.x; f.mesh.position.z += wind.y;
                f.mesh.scale.setScalar(Math.max(0.01, f.life));
                (f.mesh.material as THREE.Material).opacity = f.life; f.mesh.rotation.y += 0.05;
                if (f.life <= 0) f.mesh.visible = false;
            }
        }

        if (frame % 2 === 0) {
            for (let i = 0; i < sparkles.length; i++) {
                if (sparkles[i].life <= 0) {
                    const s = sparkles[i];
                    s.mesh.position.set((Math.random() - 0.5) * 1.0, 1.0, (Math.random() - 0.5) * 1.0);
                    s.mesh.visible = true; s.life = 1.0; s.vy = 0.05 + Math.random() * 0.05; s.vx = (Math.random() - 0.5) * 0.02; s.vz = (Math.random() - 0.5) * 0.02;
                    break;
                }
            }
        }
        for (let i = 0; i < sparkles.length; i++) {
            const s = sparkles[i];
            if (s.life > 0) {
                s.life -= 0.01; s.mesh.position.y += s.vy; s.mesh.position.x += s.vx + wind.x * 2.5; s.mesh.position.z += s.vz + wind.y * 2.5;
                if (s.life <= 0) s.mesh.visible = false;
            }
        }

        if (frame % 20 === 0) {
            for (let i = 0; i < smokes.length; i++) {
                if (smokes[i].life <= 0) {
                    const sm = smokes[i];
                    sm.mesh.position.set((Math.random() - 0.5) * 0.5, 2.0, (Math.random() - 0.5) * 0.5);
                    sm.mesh.scale.setScalar(1.0); sm.mesh.visible = true; sm.life = 1.0; sm.speed = 0.02;
                    break;
                }
            }
        }
        for (let i = 0; i < smokes.length; i++) {
            const sm = smokes[i];
            if (sm.life > 0) {
                sm.life -= 0.005; sm.mesh.position.y += sm.speed; sm.mesh.scale.multiplyScalar(1.01); sm.mesh.position.x += wind.x * 1.5; sm.mesh.position.z += wind.y * 1.5;
                (sm.mesh.material as THREE.Material).opacity = sm.life * 0.3;
                if (sm.life <= 0) sm.mesh.visible = false;
            }
        }
    },

    warmupStationAssets: (renderer: THREE.WebGLRenderer) => {
        const t1 = getCachedCanvasTexture(256, 256, 'map');
        const t2 = getCachedCanvasTexture(128, 128, 'note');
        if (renderer) {
            renderer.initTexture(t1);
            renderer.initTexture(t2);
        }

        if (!stationGeometries.barrel) stationGeometries.barrel = new THREE.CylinderGeometry(0.03, 0.03, 1.2);
        if (!stationGeometries.map_plane) stationGeometries.map_plane = new THREE.PlaneGeometry(2.0, 1.4);
        if (!stationGeometries.note_plane) stationGeometries.note_plane = new THREE.PlaneGeometry(0.4, 0.5);
    }
};