
import * as THREE from 'three';

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

export const GEOMETRY = {
    bullet: new THREE.SphereGeometry(0.15, 8, 8),
    grenade: new THREE.DodecahedronGeometry(0.3),
    molotov: new THREE.CylinderGeometry(0.1, 0.15, 0.5, 8),
    particle: new THREE.BoxGeometry(0.15, 0.15, 0.15),
    gore: new THREE.BoxGeometry(0.25, 0.25, 0.25),
    capsule: new THREE.CapsuleGeometry(1, 1, 4, 8),
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(1, 12, 12),
    prop_car: new THREE.BoxGeometry(6, 1.8, 11),
    prop_building: new THREE.BoxGeometry(12, 8, 12),
    prop_wall: new THREE.BoxGeometry(4, 6, 4),
    prop_pipe: new THREE.CylinderGeometry(0.3, 0.3, 10),
    prop_mast: new THREE.CylinderGeometry(1, 4, 30, 4),
    prop_train_engine: new THREE.BoxGeometry(4.5, 6, 14),
    prop_train_car: new THREE.BoxGeometry(4.2, 5, 12),
    scrap: new THREE.OctahedronGeometry(0.3),
    stone: new THREE.DodecahedronGeometry(1),
    treeTrunk: new THREE.CylinderGeometry(0.3, 0.5, 3.5, 7),
    treeFirNeedles: new THREE.ConeGeometry(3, 18, 7),
    foliageCluster: new THREE.DodecahedronGeometry(1.0, 0),
    human: createHumanBodyGeo(),
    zombie: createZombieBodyGeo(),
    petBody: createPetBodyGeo(),
    petTail: createPetTailGeo(),
    familyRing: new THREE.RingGeometry(1.5, 1.8, 32),
    familyArrow: new THREE.ConeGeometry(0.5, 1.5, 3),
    trackerArrow: new THREE.ShapeGeometry(new THREE.Shape().moveTo(0, 0).lineTo(-0.5, -1).lineTo(0, -0.7).lineTo(0.5, -1).lineTo(0, 0)),
    fireZone: new THREE.CircleGeometry(3.5, 16),
    chestBody: new THREE.BoxGeometry(1.5, 1.0, 1.0),
    chestLid: new THREE.BoxGeometry(1.5, 0.4, 1.0),
    blastRadius: new THREE.RingGeometry(0.05, 1, 32),
    decal: new THREE.CircleGeometry(1, 12),
    fogParticle: new THREE.PlaneGeometry(20, 20),
    weatherParticle: new THREE.PlaneGeometry(0.1, 0.1),
    barrel: new THREE.CylinderGeometry(0.8, 0.8, 2.5, 10),
    road: new THREE.PlaneGeometry(16, 300),
    rail: new THREE.BoxGeometry(0.2, 0.2, 100),
    sleeper: new THREE.BoxGeometry(3, 0.2, 0.5),
    plane: new THREE.PlaneGeometry(1, 1),
    crossBar: new THREE.PlaneGeometry(0.8, 0.15),
    aimRing: new THREE.RingGeometry(0.2, 0.25, 32),
    landingMarker: new THREE.RingGeometry(0.85, 1.0, 64),
    ashPile: new THREE.ConeGeometry(0.6, 0.4, 8),
    shard: new THREE.TetrahedronGeometry(0.1, 0),
    shockwave: new THREE.RingGeometry(0.5, 1.5, 32),
    flame: new THREE.DodecahedronGeometry(0.5)
};
