
import * as THREE from 'three';
import { FAMILY_MEMBERS, PLAYER_CHARACTER } from '../content/constants';

// --- GEOMETRY ---
export const GEOMETRY = {
    // Basic
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(1, 16, 16),
    plane: new THREE.PlaneGeometry(1, 1),
    quad: new THREE.PlaneGeometry(1, 1),

    // Projectiles / Effects
    bullet: new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8),
    grenade: new THREE.DodecahedronGeometry(0.15),
    molotov: new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8),
    particle: new THREE.PlaneGeometry(1, 1),
    shockwave: new THREE.RingGeometry(0.5, 1, 32),
    shard: new THREE.TetrahedronGeometry(0.1),
    gore: new THREE.DodecahedronGeometry(0.15),
    flame: new THREE.DodecahedronGeometry(0.4),
    decal: new THREE.PlaneGeometry(1, 1),
    aimRing: new THREE.RingGeometry(0.4, 0.5, 32),
    familyRing: new THREE.RingGeometry(0.3, 0.4, 16),

    // Objects
    barrel: new THREE.CylinderGeometry(0.5, 0.5, 1.5, 16),
    lamp: new THREE.CylinderGeometry(0.2, 0.1, 0.5, 8),
    fireZone: new THREE.CircleGeometry(1, 32),
    landingMarker: new THREE.RingGeometry(0.8, 1, 32),
    scrap: new THREE.BoxGeometry(0.3, 0.3, 0.3),
    chestBody: new THREE.BoxGeometry(1, 0.8, 0.6),
    chestLid: new THREE.BoxGeometry(1, 0.2, 0.6),

    // Environment
    treeTrunk: new THREE.CylinderGeometry(0.5, 0.5, 5, 8),
    foliageCluster: new THREE.SphereGeometry(2, 8, 8),
    ashPile: new THREE.ConeGeometry(0.5, 0.3, 8),
    stone: new THREE.DodecahedronGeometry(0.4),
    snowParticle: new THREE.PlaneGeometry(0.1, 0.1),
    fogParticle: new THREE.PlaneGeometry(2, 2)
};

export * from './assets/models';


// --- TEXTURE UTILS ---
export const createProceduralTextures = () => {
    // Helper to draw noise
    const drawNoise = (ctx: CanvasRenderingContext2D, width: number, height: number, color1: string, color2: string, scale: number = 100) => {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const val = Math.random();
                ctx.fillStyle = val > 0.5 ? color1 : color2;
                if (Math.random() > 0.8) ctx.fillRect(x, y, 1, 1);
            }
        }
    };

    const draw = (w: number, h: number, fn: (ctx: CanvasRenderingContext2D) => void) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d')!; fn(ctx);
        const t = new THREE.CanvasTexture(c);
        t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
        return t;
    };

    // 1. Bark (Spruce)
    // 1. Bark (Spruce/Pine - Vertical Ridges)
    const barkCanvas = document.createElement('canvas'); barkCanvas.width = 64; barkCanvas.height = 128;
    const bCtx = barkCanvas.getContext('2d')!;
    bCtx.fillStyle = '#3d2e21'; bCtx.fillRect(0, 0, 64, 128);
    // Vertical Strips for texture
    for (let i = 0; i < 40; i++) {
        const x = Math.random() * 64;
        const w = 2 + Math.random() * 4;
        bCtx.fillStyle = Math.random() > 0.5 ? '#2a1d15' : '#554233';
        bCtx.fillRect(x, 0, w, 128);
    }
    drawNoise(bCtx, 64, 128, 'rgba(0,0,0,0.3)', 'rgba(255,255,255,0.05)', 10);
    const barkTex = new THREE.CanvasTexture(barkCanvas);
    barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping;
    barkTex.repeat.set(1, 4);

    // 1b. Birch Bark (White with horizontal dark marks)
    const birchCanvas = document.createElement('canvas'); birchCanvas.width = 64; birchCanvas.height = 128;
    const biCtx = birchCanvas.getContext('2d')!;
    biCtx.fillStyle = '#dddddd'; biCtx.fillRect(0, 0, 64, 128);
    // Horizontal Lenticels
    for (let i = 0; i < 60; i++) {
        const x = Math.random() * 64;
        const y = Math.random() * 128;
        const w = 5 + Math.random() * 10;
        const h = 1 + Math.random() * 2;
        biCtx.fillStyle = '#111111';
        biCtx.fillRect(x, y, w, h);
    }
    // Random dark patches
    for (let i = 0; i < 6; i++) {
        const x = Math.random() * 64;
        const y = Math.random() * 128;
        biCtx.beginPath(); biCtx.arc(x, y, 4 + Math.random() * 4, 0, Math.PI * 2);
        biCtx.fillStyle = '#222222'; biCtx.fill();
    }
    const birchTex = new THREE.CanvasTexture(birchCanvas);
    birchTex.wrapS = birchTex.wrapT = THREE.RepeatWrapping;
    birchTex.repeat.set(1, 3);

    // 2. Pine Branch (Sketchy Noise)
    const needleCanvas = document.createElement('canvas'); needleCanvas.width = 64; needleCanvas.height = 64;
    const nCtx = needleCanvas.getContext('2d')!;

    // Transparent base
    nCtx.clearRect(0, 0, 64, 64);

    // Draw central stem
    nCtx.strokeStyle = '#1a331a';
    nCtx.lineWidth = 4;
    nCtx.beginPath(); nCtx.moveTo(32, 0); nCtx.lineTo(32, 64); nCtx.stroke();

    // High frequency noise / scratches for needles
    for (let i = 0; i < 400; i++) {
        const x = Math.random() * 64;
        const y = Math.random() * 64;
        const dist = Math.abs(x - 32);

        // Denser near center, sparse at edges
        if (Math.random() * 32 > dist - 5) {
            // Mix of snowy white and dark green
            nCtx.fillStyle = Math.random() > 0.4 ? '#ffffff' : '#2d4c1e';
            // Create "scratch" / pixelated noise
            nCtx.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
        }
    }

    const pineBranchTex = new THREE.CanvasTexture(needleCanvas);

    // 3. Camp / Shared Textures (Migrated)
    const gravel = draw(512, 512, ctx => {
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 25000; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#252525' : '#0e0e0e';
            ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
        }
    });
    gravel.repeat.set(32, 32);

    const stone = draw(512, 512, ctx => {
        // Base: Dark Grey
        ctx.fillStyle = '#4a4a4a'; ctx.fillRect(0, 0, 512, 512);

        // Voronoi / Cellular Pattern for Cracks
        // 1. Generate feature points
        const points: { x: number, y: number }[] = [];
        const numPoints = 80;
        for (let i = 0; i < numPoints; i++) {
            points.push({ x: Math.random() * 512, y: Math.random() * 512 });
        }

        // 2. Draw "rocks" based on distance to center
        // Note: Doing pixel-by-pixel in canvas 2d is slow for 512x512.
        // Optimization: Draw large radial gradients at each point to simulate cells
        points.forEach(p => {
            const size = 60 + Math.random() * 60;
            // Shift shape to be irregular
            const r = 20 + Math.random() * 20;

            // Draw a lighter "stone face"
            ctx.beginPath();
            ctx.fillStyle = Math.random() > 0.5 ? '#6e6e6e' : '#5c5c5c';
            // Irregular polygon approximation
            ctx.moveTo(p.x + size / 2, p.y);
            const numVerts = 5 + Math.floor(Math.random() * 4);
            for (let j = 0; j < numVerts; j++) {
                const angle = (j / numVerts) * Math.PI * 2;
                const dist = size * 0.5 + (Math.random() - 0.5) * r;
                ctx.lineTo(p.x + Math.cos(angle) * dist, p.y + Math.sin(angle) * dist);
            }
            ctx.fill();
        });

        // 3. Add overlay noise for texture detail
        drawNoise(ctx, 512, 512, 'rgba(0,0,0,0.2)', 'rgba(255,255,255,0.1)', 5);

        // 4. Cracks (Dark lines between shapes - implicit from background showing through or explicit lines)
        ctx.globalCompositeOperation = 'multiply';
        ctx.strokeStyle = '#222222';
        ctx.lineWidth = 2;
        points.forEach(p => {
            // Connect to nearest neighbors (Delaunay-ish) -> Simple approximation: Connect to random nearby points
            const nearby = points.filter(p2 => Math.abs(p2.x - p.x) < 80 && Math.abs(p2.y - p.y) < 80);
            nearby.forEach(n => {
                if (Math.random() > 0.4) {
                    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(n.x, n.y); ctx.stroke();
                }
            });
        });
        ctx.globalCompositeOperation = 'source-over';
    });

    const wood = draw(256, 256, ctx => {
        ctx.fillStyle = '#3e2723'; ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#281a14';
        for (let i = 0; i < 40; i++) ctx.fillRect(0, Math.random() * 256, 256, 1 + Math.random());
        for (let i = 0; i < 3000; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#4e342e' : '#1f120e';
            ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 6);
        }
    });

    const pine = draw(512, 512, ctx => {
        ctx.fillStyle = '#0a1a0a'; ctx.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 15000; i++) {
            ctx.strokeStyle = Math.random() > 0.7 ? '#2f4a2f' : '#1a331a';
            ctx.lineWidth = 1.5;
            const x = Math.random() * 512; const y = Math.random() * 512;
            ctx.beginPath(); ctx.moveTo(x, y);
            ctx.lineTo(x + (Math.random() - 0.5) * 12, y + (Math.random() - 0.5) * 12);
            ctx.stroke();
        }
    });

    const halo = draw(256, 256, ctx => {
        const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
        g.addColorStop(0, 'rgba(255, 255, 240, 1)');
        g.addColorStop(0.2, 'rgba(255, 255, 220, 0.3)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 256);
    });

    const tacticalMap = draw(512, 512, ctx => {
        ctx.fillStyle = '#dcd0b0'; ctx.fillRect(0, 0, 512, 512);
        ctx.strokeStyle = '#c0b090'; ctx.lineWidth = 1;
        for (let i = 0; i <= 512; i += 32) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
        }
        ctx.strokeStyle = '#554433'; ctx.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
            ctx.beginPath();
            const cx = 256 + (Math.random() - 0.5) * 300;
            const cy = 256 + (Math.random() - 0.5) * 300;
            ctx.ellipse(cx, cy, 50 + Math.random() * 100, 50 + Math.random() * 100, Math.random() * Math.PI, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.strokeStyle = '#880000'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(300, 100); ctx.lineTo(340, 140); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(340, 100); ctx.lineTo(300, 140); ctx.stroke();
        ctx.fillStyle = '#880000'; ctx.font = "bold 20px Courier";
        ctx.fillText("SECTOR 4", 300, 160);
        ctx.strokeStyle = '#c0a080'; ctx.lineWidth = 10;
        ctx.beginPath(); ctx.arc(100, 400, 40, 0, Math.PI * 2); ctx.stroke();
    });

    // 4. Footprint (Boot Shape)
    const footprint = draw(128, 256, ctx => {
        ctx.clearRect(0, 0, 128, 256);
        ctx.fillStyle = '#ffffff'; // Use white for tinting via material color

        // Sole
        ctx.beginPath();
        ctx.ellipse(64, 80, 40, 60, 0, 0, Math.PI * 2);
        ctx.fill();

        // Heel
        ctx.beginPath();
        ctx.ellipse(64, 190, 35, 40, 0, 0, Math.PI * 2);
        ctx.fill();

        // Treads ( subtraction or darker )
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000000';
        for (let i = 0; i < 6; i++) {
            ctx.fillRect(24, 40 + i * 15, 80, 8);
        }
        ctx.fillRect(29, 170, 70, 8);
        ctx.fillRect(29, 190, 70, 8);
        ctx.fillRect(29, 210, 70, 8);
        ctx.globalCompositeOperation = 'source-over';
    });

    // 5. Blood Splatter
    const blood = draw(128, 128, ctx => {
        ctx.clearRect(0, 0, 128, 128);
        ctx.fillStyle = '#ffffff'; // White for tinting

        // Central pools
        for (let i = 0; i < 3; i++) {
            const cx = 64 + (Math.random() - 0.5) * 40;
            const cy = 64 + (Math.random() - 0.5) * 40;
            const rx = 10 + Math.random() * 20;
            const ry = 10 + Math.random() * 20;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }

        // Droplets
        for (let i = 0; i < 15; i++) {
            const cx = 64 + (Math.random() - 0.5) * 100;
            const cy = 64 + (Math.random() - 0.5) * 100;
            const r = 1 + Math.random() * 3;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    // --- LASER TEXTURE ---
    // Blue laser with fade at the tip (last ~10% = 3m of 30m)
    const laserCanvas = document.createElement('canvas');
    laserCanvas.width = 32; laserCanvas.height = 256;
    const lCtx = laserCanvas.getContext('2d')!;
    const lg = lCtx.createLinearGradient(0, 0, 0, 256);
    lg.addColorStop(0, 'rgba(0, 170, 255, 0)'); // Tip (transparent)
    lg.addColorStop(0.1, 'rgba(0, 170, 255, 0.3)'); // 3m fade zone
    lg.addColorStop(0.15, 'rgba(0, 170, 255, 1)'); // Full brightness
    lg.addColorStop(1, 'rgba(0, 170, 255, 1)'); // Base (full blue)
    lCtx.fillStyle = lg;
    lCtx.fillRect(0, 0, 32, 256);
    const laserTex = new THREE.CanvasTexture(laserCanvas);

    // --- GROUND TEXTURE (SNOW) ---
    const gCanvas = document.createElement('canvas'); gCanvas.width = 512; gCanvas.height = 512;
    const gCtx = gCanvas.getContext('2d')!;
    gCtx.fillStyle = '#ccddff'; gCtx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 15000; i++) {
        gCtx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#ddeeff';
        gCtx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }
    // Patches of asphalt/dirt showing through
    for (let i = 0; i < 20; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const r = 10 + Math.random() * 30;
        const g = gCtx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(30,30,35,0.8)');
        g.addColorStop(1, 'rgba(200,220,255,0)');
        gCtx.fillStyle = g;
        gCtx.beginPath(); gCtx.arc(x, y, r, 0, Math.PI * 2); gCtx.fill();
    }
    const groundTex = new THREE.CanvasTexture(gCanvas);
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping; groundTex.repeat.set(32, 32);

    return { barkTex, pineBranchTex, birchTex, gravel, stone, wood, pine, halo, tacticalMap, footprint, blood, laserTex, groundTex };
};

const _tex = createProceduralTextures() as any;
export const TEXTURES = _tex; // Export textures for access by other modules
export const MATERIALS = {
    bullet: new THREE.MeshBasicMaterial({ color: 0xffffaa }),
    grenade: new THREE.MeshStandardMaterial({ color: 0x3f663f, roughness: 0.6 }),
    molotov: new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.3, emissive: 0x331100, emissiveIntensity: 0.2 }),
    blood: new THREE.MeshBasicMaterial({ color: 0xaa0000 }),
    gore: new THREE.MeshStandardMaterial({ color: 0x660000, roughness: 0.2 }),
    fire: new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.8 }),
    fireZone: new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.3, side: THREE.DoubleSide }),
    smoke: new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.6 }),
    walker: new THREE.MeshStandardMaterial({ color: 0x5a6e5a, roughness: 0.5 }),
    runner: new THREE.MeshStandardMaterial({ color: 0x8f3a3a, roughness: 0.5 }),
    tank: new THREE.MeshStandardMaterial({ color: 0x2d3436, roughness: 0.5 }),
    bomber: new THREE.MeshStandardMaterial({ color: 0xcf6e36, roughness: 0.5 }),
    scrap: new THREE.MeshBasicMaterial({ color: 0xffaa00 }),
    stone: new THREE.MeshStandardMaterial({
        color: 0x888888, // Neutral tint
        map: _tex.stone,
        roughness: 0.9,
        bumpMap: _tex.stone, // Reuse for bump
        bumpScale: 0.5
    }),
    treeTrunk: new THREE.MeshStandardMaterial({ color: 0x3d342b, roughness: 1.0 }), // Dark rough bark
    treeLeaves: new THREE.MeshStandardMaterial({ color: 0xf0f8f0, roughness: 0.9, flatShading: true }), // Snowy foliage
    family: new THREE.MeshStandardMaterial({ color: 0x00aaff, roughness: 0.5 }),
    familyRing: new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    familyArrow: new THREE.MeshBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.8 }),
    trackerArrow: new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    skin: new THREE.MeshStandardMaterial({ color: 0xffccaa }),
    gun: new THREE.MeshStandardMaterial({ color: 0x222222 }),
    chestStandard: new THREE.MeshStandardMaterial({ color: 0x5c4033 }),
    chestBig: new THREE.MeshStandardMaterial({ color: 0xffd700 }),
    blastRadius: new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.3, side: THREE.DoubleSide }),
    bloodDecal: new THREE.MeshBasicMaterial({
        color: 0x880000, // Deep red
        map: _tex.blood,
        transparent: true,
        opacity: 0.9,
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
    footprintDecal: new THREE.MeshBasicMaterial({
        color: 0xaa2222, // Red tint for blood, or change to 0x222222 for mud
        map: _tex.footprint, // Use the texture
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -2
    }),
    fog: new THREE.MeshBasicMaterial({ color: 0x111116, transparent: true, opacity: 0.1, depthWrite: false }),
    building: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.9 }),
    pipe: new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.6, metalness: 0.4 }),
    mast: new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.4, metalness: 0.8, wireframe: true }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x404040, roughness: 0.7 }),
    barrelExplosive: new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.5 }),
    road: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }),
    train: new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.6, metalness: 0.3 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.4, metalness: 0.8 }),
    redWood: new THREE.MeshStandardMaterial({ color: 0x8a2be2, roughness: 0.9 }),
    yellowBrick: new THREE.MeshStandardMaterial({ color: 0xd4c685, roughness: 0.95 }),
    brownBrick: new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.95 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.6 }),
    glassBroken: new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.4, metalness: 0.5 }),
    snow: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0 }),
    asphalt: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 }),
    gravel: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 1.0 }),
    metalPanel: new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.2, metalness: 0.7 }),
    neonSign: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    blackMetal: new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 0.6, roughness: 0.4 }),
    crossEmissive: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.0 }),
    aimCross: new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
    aimReticle: new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }),
    landingMarker: new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    ash: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1.0 }),
    flashWhite: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }),
    glassShard: new THREE.MeshBasicMaterial({ color: 0xccffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
    shockwave: new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
};

export const createTextSprite = (text: string) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = 256; canvas.height = 64;
    ctx.font = '24px Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 40);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(4, 1, 1);
    return sprite;
};

// --- HELPER UTILS ---
export const getSpeakerColor = (name: string): string => {
    if (!name) return '#9ca3af';
    const lower = name.toLowerCase();
    if (lower === 'robert') return '#' + PLAYER_CHARACTER.color.toString(16).padStart(6, '0');
    const member = FAMILY_MEMBERS.find(m => lower.includes(m.name.toLowerCase()));
    if (member) return '#' + member.color.toString(16).padStart(6, '0');
    if (lower === 'narrator') return '#ef4444';
    if (['okänd', 'unknown', 'röst', 'radio', 'mannen'].some(k => lower.includes(k))) return '#9ca3af';
    return '#000000';
};
