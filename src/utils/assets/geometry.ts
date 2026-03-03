import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const createZombieBodyGeo = () => {
    const points = [];
    const r = 0.5;
    const totalH = 2.0;
    const base = -totalH / 2; // -1.0
    const cylHeight = totalH - r; // 1.5 (Cylinder part)
    const domeStart = base + cylHeight; // 0.5

    points.push(new THREE.Vector2(0, base));
    points.push(new THREE.Vector2(r, base));
    points.push(new THREE.Vector2(r, domeStart));
    for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * (Math.PI / 2);
        const x = r * Math.cos(a);
        const y = domeStart + r * Math.sin(a);
        points.push(new THREE.Vector2(x, y));
    }
    return new THREE.LatheGeometry(points, 16);
};

const createHumanBodyGeo = () => {
    const points = [];
    const r = 0.5;
    const totalH = 2.0;
    const base = -totalH / 2; // -1.0
    const cylHeight = totalH - r; // 1.5 (Cylinder part)
    const domeStart = base + cylHeight; // 0.5

    points.push(new THREE.Vector2(0, base));
    points.push(new THREE.Vector2(r, base));
    points.push(new THREE.Vector2(r, domeStart));
    for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * (Math.PI / 2);
        const x = r * Math.cos(a);
        const y = domeStart + r * Math.sin(a);
        points.push(new THREE.Vector2(x, y));
    }
    return new THREE.LatheGeometry(points, 16);
};

const createPetBodyGeo = () => {
    const points = [];
    const r = 0.35;
    const cylHeight = 0.15;
    const totalH = cylHeight + r;
    const base = -totalH / 2;

    points.push(new THREE.Vector2(0, base));
    points.push(new THREE.Vector2(r, base));
    points.push(new THREE.Vector2(r, base + cylHeight));

    const domeStart = base + cylHeight;
    for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * (Math.PI / 2);
        const x = r * Math.cos(a);
        const y = domeStart + r * Math.sin(a);
        points.push(new THREE.Vector2(x, y));
    }
    return new THREE.LatheGeometry(points, 16);
};

const createPetTailGeo = () => {
    const path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.15, -0.30),
        new THREE.Vector3(0, 0.1, -0.45),
        new THREE.Vector3(0, 0.4, -0.35),
    ]);
    return new THREE.TubeGeometry(path, 8, 0.04, 6, false);
};

const createSplashGeo = () => {
    // [VINTERDÖD] Crossed droplet planes for splash. 25% larger than the previous 0.2 sphere limit.
    const w = 0.25;
    const h = 0.4;

    // Create base plane
    const plane1 = new THREE.PlaneGeometry(w, h);
    plane1.translate(0, h / 2, 0); // Origin at bottom

    const plane2 = plane1.clone();
    plane2.rotateY(Math.PI / 2);

    const geo = BufferGeometryUtils.mergeGeometries([plane1, plane2]);
    geo.computeVertexNormals();

    const count = geo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    const pos = geo.attributes.position;
    const topColor = new THREE.Color(0xffffff);
    const bottomColor = new THREE.Color(0x77aaff);

    for (let i = 0; i < count; i++) {
        const y = pos.getY(i); // range -1 to 1
        const t = (y + 1) / 2; // range 0 to 1
        const c = topColor.clone().lerp(bottomColor, 1.0 - t);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
};

const createSplatterGeo = () => {
    const geo = new THREE.CircleGeometry(1, 16);
    const pos = geo.attributes.position;
    for (let i = 1; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const r = Math.sqrt(x * x + y * y);
        const newR = 1.0 - (i % 2 === 0 ? 0.1 : 0.4 + Math.random() * 0.4);
        pos.setXY(i, (x / r) * newR, (y / r) * newR);
    }
    geo.computeVertexNormals();
    return geo;
};

export const GEOMETRY = {
    bullet: new THREE.SphereGeometry(0.15, 8, 8),
    grenade: new THREE.DodecahedronGeometry(0.3),
    molotov: new THREE.CylinderGeometry(0.1, 0.15, 0.5, 8),
    flashbang: new THREE.CylinderGeometry(0.1, 0.15, 0.5, 8),
    particle: new THREE.BoxGeometry(0.15, 0.15, 0.15),
    gore: new THREE.BoxGeometry(0.25, 0.25, 0.25),
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(1, 12, 12),
    scrap: new THREE.OctahedronGeometry(0.3),
    stone: new THREE.DodecahedronGeometry(1),
    treeTrunk: new THREE.CylinderGeometry(0.3, 0.5, 3.5, 7),
    treeFirNeedles: new THREE.ConeGeometry(3, 18, 7),
    foliageCluster: new THREE.DodecahedronGeometry(1.0, 0),
    human: createHumanBodyGeo(),
    zombie: createZombieBodyGeo(),
    petBody: createPetBodyGeo(),
    petTail: createPetTailGeo(),
    fireZone: new THREE.CircleGeometry(3.5, 16),
    chestBody: new THREE.BoxGeometry(1.5, 1.0, 1.0),
    chestLid: new THREE.BoxGeometry(1.5, 0.4, 1.0),
    blastRadius: new THREE.RingGeometry(0.05, 1, 32),
    decal: new THREE.CircleGeometry(1, 12),
    splatterDecal: createSplatterGeo(),
    fogParticle: new THREE.PlaneGeometry(20, 20),
    weatherParticle: new THREE.PlaneGeometry(0.1, 0.1),
    barrel: new THREE.CylinderGeometry(0.8, 0.8, 2.5, 10),
    road: new THREE.PlaneGeometry(16, 300),
    rail: new THREE.BoxGeometry(0.2, 0.2, 100),
    sleeper: new THREE.BoxGeometry(3, 0.2, 0.5),
    plane: new THREE.PlaneGeometry(1, 1),
    aimRing: new THREE.RingGeometry(0.2, 0.25, 32),
    landingMarker: new THREE.RingGeometry(0.85, 1.0, 64),
    ashPile: new THREE.ConeGeometry(0.6, 0.4, 8),
    shard: new THREE.TetrahedronGeometry(0.1, 0),
    shockwave: new THREE.RingGeometry(0.5, 1.5, 32),
    flame: new THREE.TetrahedronGeometry(0.5, 1), // [VINTERDÖD] Reduced poly count from Dodecahedron to fix AdditiveBlending fill rate lag
    splash: createSplashGeo()
};
