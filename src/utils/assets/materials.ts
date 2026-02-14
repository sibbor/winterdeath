
import * as THREE from 'three';
import { TEXTURES } from './AssetLoader';
import { createProceduralDiffuse } from './procedural';

const DIFFUSE = createProceduralDiffuse();

export const MATERIALS = {
    bullet: new THREE.MeshBasicMaterial({ color: 0xffffaa }),
    grenade: new THREE.MeshStandardMaterial({ color: 0x3f663f, roughness: 0.6 }),
    molotov: new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.3, emissive: 0x331100, emissiveIntensity: 0.2 }),
    blood: new THREE.MeshBasicMaterial({ color: 0xaa0000 }),
    gore: new THREE.MeshStandardMaterial({ color: 0x660000, roughness: 0.2 }),
    fire: new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.8, depthWrite: false }),
    fireZone: new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    smoke: new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.6, depthWrite: false }),
    zombie: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
    scrap: new THREE.MeshBasicMaterial({ color: 0xffaa00 }),
    stone: new THREE.MeshStandardMaterial({
        color: 0x888888,
        map: DIFFUSE.stone,
        roughness: 0.9,
        bumpMap: TEXTURES.stone_bump,
        bumpScale: 0.2
    }),
    treeTrunk: new THREE.MeshStandardMaterial({
        color: 0x3d342b,
        roughness: 1.0,
        bumpMap: TEXTURES.bark_rough_bump,
        bumpScale: 0.08
    }),
    treeTrunkBirch: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.8,
        bumpMap: TEXTURES.bark_birch_bump,
        bumpScale: 0.04
    }),
    grass: new THREE.MeshStandardMaterial({
        color: 0x4a6e4a,
        roughness: 1.0,
        flatShading: true,
        side: THREE.DoubleSide
    }),
    treeLeaves: new THREE.MeshStandardMaterial({
        color: 0xf0f8f0,
        map: DIFFUSE.pineBranch,
        roughness: 0.9,
        flatShading: true,
        transparent: true,
        alphaTest: 0.2,
        side: THREE.DoubleSide
    }), // Snowy foliage
    family: new THREE.MeshStandardMaterial({ color: 0x00aaff, roughness: 0.5 }),
    familyRing: new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
    familyArrow: new THREE.MeshBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.8, depthWrite: false }),
    trackerArrow: new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
    skin: new THREE.MeshStandardMaterial({ color: 0xffccaa }),
    gun: new THREE.MeshStandardMaterial({ color: 0x222222 }),
    chestStandard: new THREE.MeshStandardMaterial({ color: 0x5c4033 }),
    chestBig: new THREE.MeshStandardMaterial({ color: 0xffd700 }),
    blastRadius: new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    bloodDecal: new THREE.MeshBasicMaterial({
        color: 0x660000,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -4
    }),
    scorchDecal: new THREE.MeshBasicMaterial({
        color: 0x111111,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -3
    }),
    bloodStainDecal: new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -2
    }),
    footprintDecal: new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.8,
        map: DIFFUSE.footprint,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -4
    }),
    fog: new THREE.MeshBasicMaterial({
        color: 0x111116,
        transparent: true,
        opacity: 0.1,
        depthWrite: false
    }),
    building: new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        roughness: 0.8,
        bumpMap: TEXTURES.concrete_bump,
        bumpScale: 0.04
    }),
    concrete: new THREE.MeshStandardMaterial({
        color: 0x444444,
        roughness: 0.9,
        bumpMap: TEXTURES.concrete_bump,
        bumpScale: 0.1
    }),
    pipe: new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.6, metalness: 0.4 }),
    mast: new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.4, metalness: 0.8, wireframe: true }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x404040, roughness: 0.7 }),
    barrelExplosive: new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.5 }),
    train: new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.6, metalness: 0.3 }),
    vehicleBody: new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.8,
        metalness: 0.1
    }),
    steel: new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.4, metalness: 0.8 }),
    redWood: new THREE.MeshStandardMaterial({ color: 0x8a2be2, roughness: 0.9 }),
    brick: new THREE.MeshStandardMaterial({
        roughness: 0.95,
        bumpMap: TEXTURES.brick_bump,
        bumpScale: 0.06
    }),
    whiteBrick: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.9,
        bumpMap: TEXTURES.brick_bump,
        bumpScale: 0.05
    }),
    yellowBrick: new THREE.MeshStandardMaterial({
        color: 0xd4c685,
        roughness: 0.95,
        bumpMap: TEXTURES.brick_bump,
        bumpScale: 0.06
    }),
    brownBrick: new THREE.MeshStandardMaterial({
        color: 0x5c4033,
        roughness: 0.95,
        bumpMap: TEXTURES.brick_bump,
        bumpScale: 0.06
    }),
    glass: new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.6 }),
    glassBroken: new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.4, metalness: 0.5 }),
    snow: new THREE.MeshStandardMaterial({
        color: 0xffffff, // Brighter white snow
        roughness: 1.0, // Fully diffuse
        metalness: 0.0,
        bumpMap: TEXTURES.snow_bump,
        bumpScale: 0.4,
        emissive: 0xffffff, // Subtle glow to maintain whiteness in shadows
        emissiveIntensity: 0.15
    }),
    asphalt: new THREE.MeshStandardMaterial({
        color: 0x222222,
        map: DIFFUSE.asphalt,
        roughness: 0.85,
        metalness: 0.1,
        bumpMap: TEXTURES.asphalt_bump,
        bumpScale: 0.4, // Balanced for texture depth
        polygonOffset: true,
        polygonOffsetFactor: -1 // Pull towards camera to prevent Z-fighting with ground
    }),
    gravel: new THREE.MeshStandardMaterial({
        color: 0x888888,
        map: DIFFUSE.gravel,
        roughness: 1.0,
        bumpMap: TEXTURES.stone_bump,
        bumpScale: 2.8,
        polygonOffset: true,
        polygonOffsetFactor: -1
    }),
    dirt: new THREE.MeshStandardMaterial({
        color: 0x4a3b32,
        map: DIFFUSE.gravel,
        roughness: 1.0,
        bumpMap: TEXTURES.stone_bump,
        bumpScale: 2.8,
        polygonOffset: true,
        polygonOffsetFactor: -1
    }),
    frost: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1.0, // Fully opaque where alphaMap allows (prevents darkening on overlaps)
        alphaMap: DIFFUSE.frostAlpha, // Added for snowy fade
        roughness: 0.2,
        metalness: 0.1,
        bumpMap: TEXTURES.snow_bump,
        bumpScale: 0.1,
        depthWrite: false, // Prevent fighting between overlapping frost sections
        polygonOffset: true,
        polygonOffsetFactor: -1
    }),
    buildingPiece: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 }),
    metalPanel: new THREE.MeshStandardMaterial({ color: 0x778899, roughness: 0.3, metalness: 0.7 }),
    neonSign: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    plaster: new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.9,
        bumpMap: TEXTURES.concrete_bump,
        bumpScale: 0.05
    }),
    wooden_fasade: new THREE.MeshStandardMaterial({
        color: 0x111111,
        map: DIFFUSE.wood,
        roughness: 0.9,
        bumpMap: DIFFUSE.containerMetal,
        bumpScale: 0.1
    }),
    sheet_metal: new THREE.MeshStandardMaterial({
        color: 0x666666,
        map: DIFFUSE.containerMetal,
        roughness: 0.4,
        metalness: 0.6
    }),
    blackMetal: new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 0.6, roughness: 0.4 }),
    crossEmissive: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.0 }),
    aimCross: new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
    aimReticle: new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }),
    landingMarker: new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    ash: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1.0 }),
    flashWhite: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }),
    glassShard: new THREE.MeshBasicMaterial({ color: 0xccffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
    shockwave: new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    hay: new THREE.MeshStandardMaterial({ color: 0xedc05d, roughness: 1.0, bumpMap: DIFFUSE.gravel, bumpScale: 0.2 }),
    wheat: new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 1.0, flatShading: true, side: THREE.DoubleSide }),
    logEnd: new THREE.MeshStandardMaterial({ color: 0xbc8f8f, roughness: 0.8, bumpMap: DIFFUSE.stone, bumpScale: 0.1 }),
    container: new THREE.MeshStandardMaterial({
        color: 0x888888,
        map: DIFFUSE.containerMetal,
        roughness: 0.6,
        metalness: 0.5
    }),
    guardrail: new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.4,
        metalness: 0.8
    }),
    treeStumpTop: new THREE.MeshStandardMaterial({
        color: 0xbc8f8f,
        map: DIFFUSE.treeRings,
        roughness: 0.8
    }),
    treeLeavesOak: new THREE.MeshStandardMaterial({
        color: 0x2d4c1e,
        map: DIFFUSE.pineBranch, // Reuse for noise
        roughness: 0.9,
        flatShading: true,
        side: THREE.DoubleSide
    }),
    treeTrunkOak: new THREE.MeshStandardMaterial({
        color: 0x5a504a,
        roughness: 1.0,
        bumpMap: TEXTURES.bark_rough_bump,
        bumpScale: 0.1
    }),
    skidMark: new THREE.MeshBasicMaterial({
        color: 0x050505,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3
    }),
    fenceMesh: new THREE.MeshStandardMaterial({
        map: DIFFUSE.fenceMesh,
        transparent: true,
        alphaTest: 0.4,
        side: THREE.DoubleSide,
        roughness: 0.3,
        metalness: 0.8
    })
};
