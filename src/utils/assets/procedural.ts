import * as THREE from 'three';

// --- CONFIGURATION ---
const getTextureQuality = (): number => {
    try {
        const saved = localStorage.getItem('winterDeathSave_v1');
        if (saved) {
            const parsed = JSON.parse(saved);
            return parsed.graphics?.textureQuality ?? 1.0;
        }
    } catch (e) { /* Fallback to default */ }
    return 1.0;
};

const QUALITY = getTextureQuality();

// --- PERSISTENT CACHE ---
// Singleton storage to prevent redundant CPU drawing and VRAM duplication
let cachedTextures: Record<string, THREE.CanvasTexture> | null = null;

/**
 * Procedural Texture System
 * Generates and caches textures using Canvas2D.
 */
export const createProceduralDiffuse = () => {
    // Return existing textures if already generated
    if (cachedTextures) return cachedTextures;

    /**
     * Internal helper to create a CanvasTexture from a drawing function
     */
    const draw = (w: number, h: number, fn: (ctx: CanvasRenderingContext2D, scale: number) => void) => {
        const sw = Math.floor(w * QUALITY);
        const sh = Math.floor(h * QUALITY);
        const canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext('2d', { alpha: false })!; // [VINTERDÖD] Om inte alfakanal behövs explicit, säg det för prestanda.

        fn(ctx, QUALITY);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;

        // [VINTERDÖD FIX] ZERO-CPU OVERHEAD.
        // Stänger av uppdateringen av texturens UV-matris varje frame. 
        // Detta är ett måste för CanvasTextures som appliceras på tusentals träd/mark-objekt.
        texture.matrixAutoUpdate = false;

        // Performance optimization: Signal that this texture won't change again
        texture.needsUpdate = false;

        return texture;
    };

    /**
     * Internal helper för texturer med Alfa-kanal.
     */
    const drawAlpha = (w: number, h: number, fn: (ctx: CanvasRenderingContext2D, scale: number) => void) => {
        const sw = Math.floor(w * QUALITY);
        const sh = Math.floor(h * QUALITY);
        const canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext('2d')!;

        fn(ctx, QUALITY);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.matrixAutoUpdate = false;
        texture.needsUpdate = false;

        return texture;
    };

    // --- GENERATORS ---

    const gravel = draw(512, 512, (ctx, s) => {
        const w = ctx.canvas.width; const h = ctx.canvas.height;
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, w, h);
        const count = Math.floor(10000 * s * s);
        for (let i = 0; i < count; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#252525' : '#0e0e0e';
            ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
        }
    });

    const stone = draw(512, 512, (ctx, s) => {
        const w = ctx.canvas.width; const h = ctx.canvas.height;
        ctx.fillStyle = '#4a4a4a'; ctx.fillRect(0, 0, w, h);
        const count = Math.floor(80 * s);
        for (let i = 0; i < count; i++) {
            const px = Math.random() * w; const py = Math.random() * h;
            const size = (60 + Math.random() * 60) * s;
            const r = (20 + Math.random() * 20) * s;
            ctx.beginPath();
            ctx.fillStyle = Math.random() > 0.5 ? '#6e6e6e' : '#5c5c5c';
            ctx.moveTo(px + size / 2, py);
            const numVerts = 5 + Math.floor(Math.random() * 4);
            for (let j = 0; j < numVerts; j++) {
                const angle = (j / numVerts) * Math.PI * 2;
                const dist = size * 0.5 + (Math.random() - 0.5) * r;
                ctx.lineTo(px + Math.cos(angle) * dist, py + Math.sin(angle) * dist);
            }
            ctx.fill();
        }
    });

    const pineBranch = drawAlpha(512, 512, (ctx, s) => {
        const w = ctx.canvas.width; const h = ctx.canvas.height;
        const needleColors = ['#1a261a', '#263326', '#0d1a0d', '#1f2e1f'];
        const center = w / 2;
        const needleCount = 2000 * s * s;

        for (let i = 0; i < needleCount; i++) {
            const y = Math.random() * (h - 12 * s) + 12 * s;
            const progress = y / h;
            const maxW = (220 * s) * Math.pow(progress, 0.6);

            const side = Math.random() > 0.5 ? 1 : -1;
            const len = (10 * s) + Math.random() * maxW;

            const startX = center + (side * 4 * s);
            const endX = center + (side * len);
            const droop = (len / (200 * s)) * (40 * s);
            const endY = y + (10 * s) + Math.random() * (10 * s) + droop;

            ctx.strokeStyle = needleColors[Math.floor(Math.random() * needleColors.length)];
            ctx.lineWidth = (2 * s) + Math.random() * (2 * s);
            ctx.lineCap = 'round';
            ctx.globalAlpha = 0.9;

            ctx.beginPath();
            ctx.moveTo(startX, y);
            ctx.quadraticCurveTo(startX + (side * len * 0.4), y - (5 * s), endX, endY);
            ctx.stroke();
        }

        ctx.strokeStyle = '#3e2723';
        ctx.lineWidth = 12 * s;
        ctx.beginPath();
        ctx.moveTo(center, h);
        ctx.lineTo(center, 10 * s);
        ctx.stroke();

        ctx.fillStyle = '#f0f8ff';
        ctx.globalAlpha = 1.0;

        for (let i = 0; i < 40; i++) {
            const y = Math.random() * (h * 0.9);
            const widthAtY = (200 * s) * Math.pow(y / h, 0.6);
            const x = center + (Math.random() - 0.5) * 2 * widthAtY;

            if (Math.abs(x - center) < widthAtY) {
                const size = (15 * s) + Math.random() * (25 * s);
                ctx.beginPath();
                ctx.ellipse(x, y, size, size * 0.6, Math.random() * 0.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        const dustCount = 300 * s * s;
        for (let i = 0; i < dustCount; i++) {
            const x = Math.random() * w;
            const y = Math.random() * h;
            if (Math.abs(x - center) < (200 * s) * (y / h)) {
                ctx.globalAlpha = 0.6 + Math.random() * 0.4;
                ctx.beginPath();
                ctx.arc(x, y, (2 * s) + Math.random() * (3 * s), 0, Math.PI * 2);
                ctx.fill();
            }
        }
    });

    const bark = draw(512, 1024, (ctx, s) => {
        const w = ctx.canvas.width; const h = ctx.canvas.height;
        ctx.fillStyle = '#2b2622';
        ctx.fillRect(0, 0, w, h);

        const ridgeCount = 200 * s * s;
        for (let i = 0; i < ridgeCount; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#1a1512' : '#3e3630';
            const x = Math.random() * w;
            const rw = (4 * s) + Math.random() * (8 * s);
            const rh = (50 * s) + Math.random() * (200 * s);
            const y = Math.random() * h;
            ctx.fillRect(x, y, rw, rh);
        }

        const mossGrad = ctx.createLinearGradient(0, h, 0, h * 0.4);
        mossGrad.addColorStop(0, 'rgba(60, 100, 40, 0.9)');
        mossGrad.addColorStop(0.6, 'rgba(80, 120, 50, 0.4)');
        mossGrad.addColorStop(1, 'rgba(80, 120, 50, 0)');
        ctx.fillStyle = mossGrad;
        ctx.fillRect(0, 0, w, h);

        const snowCreviceCount = 300 * s * s;
        for (let i = 0; i < snowCreviceCount; i++) {
            const x = Math.random() * w;
            const y = Math.random() * h;
            ctx.fillStyle = 'rgba(240, 248, 255, 0.7)';
            ctx.fillRect(x, y, (1 * s) + Math.random() * (2 * s), (5 * s) + Math.random() * (10 * s));
        }
    });

    const tacticalMap = draw(512, 512, (ctx, s) => {
        const w = ctx.canvas.width; const h = ctx.canvas.height;
        ctx.fillStyle = '#dcd0b0'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#c0b090'; ctx.lineWidth = 1;
        const grid = 32 * s;
        for (let i = 0; i <= w; i += grid) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke();
        }
        ctx.strokeStyle = '#880000'; ctx.lineWidth = 4 * s;
        ctx.beginPath(); ctx.moveTo(300 * s, 100 * s); ctx.lineTo(340 * s, 140 * s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(340 * s, 100 * s); ctx.lineTo(300 * s, 140 * s); ctx.stroke();
    });

    const frostAlpha = drawAlpha(256, 256, (ctx, s) => {
        const w = ctx.canvas.width; const h = ctx.canvas.height;
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0.0, 'rgba(255,255,255,1.0)');
        grad.addColorStop(0.35, 'rgba(255,255,255,0.4)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.0)');
        grad.addColorStop(0.65, 'rgba(255,255,255,0.4)');
        grad.addColorStop(1.0, 'rgba(255,255,255,1.0)');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
        const noiseCount = Math.floor(8000 * s * s);
        for (let i = 0; i < noiseCount; i++) {
            const x = Math.random() * w; const y = Math.random() * h;
            const u = x / w;
            const mask = Math.pow(Math.abs(u - 0.5) * 2, 2.5);
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.7 * mask})`;
            ctx.fillRect(x, y, 1, 1);
        }
    });

    const halo = drawAlpha(256, 256, (ctx, s) => {
        const w = ctx.canvas.width; const h = ctx.canvas.height;
        const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.addColorStop(0, 'rgba(255, 255, 240, 1)');
        g.addColorStop(0.2, 'rgba(255, 255, 220, 0.3)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });

    const containerMetal = draw(128, 128, (ctx, s) => {
        const w = ctx.canvas.width; const h = ctx.canvas.height;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#888888'; ctx.lineWidth = 12 * s;
        const grid = 32 * s;
        for (let i = 0; i <= w; i += grid) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
        }
    });

    const wood = draw(256, 256, (ctx, s) => {
        const w = ctx.canvas.width; const h = ctx.canvas.height;
        ctx.fillStyle = '#5e3723'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#3d2417'; ctx.lineWidth = 2 * s;
        for (let i = 0; i < 40 * s; i++) {
            const y = Math.random() * h;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + (Math.random() - 0.5) * 20 * s); ctx.stroke();
        }
    });

    const treeRings = draw(256, 256, (ctx, s) => {
        const w = ctx.canvas.width; const h = ctx.canvas.height;
        ctx.fillStyle = '#bc8f8f'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#8b4513'; ctx.lineWidth = 1;
        for (let i = 0; i < 20 * s; i++) {
            ctx.beginPath(); ctx.arc(w / 2, h / 2, (i * 6 + Math.random() * 2) * s, 0, Math.PI * 2); ctx.stroke();
        }
    });

    const fenceMesh = drawAlpha(128, 128, (ctx, s) => {
        const w = ctx.canvas.width; const h = ctx.canvas.height;
        ctx.clearRect(0, 0, w, h); ctx.strokeStyle = '#aaaaaa'; ctx.lineWidth = 3 * s;
        for (let i = 0; i <= w; i += 8 * s) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
        ctx.lineWidth = 4 * s;
        for (let i = 0; i <= h; i += 32 * s) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke(); }
    });

    const asphalt = draw(1024, 1024, (ctx, s) => {
        const w = ctx.canvas.width; const h = ctx.canvas.height;
        ctx.fillStyle = '#111111'; ctx.fillRect(0, 0, w, h);
        const stoneCount = Math.floor(15000 * s * s);
        for (let i = 0; i < stoneCount; i++) {
            const size = (1 + Math.random()) * s;
            const shade = 15 + Math.random() * 20;
            ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
            ctx.fillRect(Math.random() * w, Math.random() * h, size, size);
        }
        ctx.globalAlpha = 0.4;
        for (let i = 0; i < 10000 * s * s; i++) {
            ctx.fillStyle = '#050505'; ctx.beginPath();
            ctx.arc(Math.random() * w, Math.random() * h, (1 + Math.random() * 2) * s, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1.0;
    });

    const footprint = drawAlpha(64, 128, (ctx, s) => {
        const w = ctx.canvas.width; const h = ctx.canvas.height;
        ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(w / 2, 35 * s, 20 * s, 30 * s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(w / 2, 90 * s, 15 * s, 22 * s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 3 * s;
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(15 * s, (25 + i * 15) * s); ctx.lineTo(49 * s, (25 + i * 15) * s); ctx.stroke(); }
    });

    // Final cache population
    cachedTextures = { gravel, stone, pineBranch, pine: pineBranch, bark, tacticalMap, frostAlpha, halo, containerMetal, wood, treeRings, fenceMesh, asphalt, footprint };

    return cachedTextures;
};

/**
 * Disposes of cached textures to free GPU memory
 */
export const disposeProceduralTextures = () => {
    if (!cachedTextures) return;
    Object.values(cachedTextures).forEach(t => t.dispose());
    cachedTextures = null;
};