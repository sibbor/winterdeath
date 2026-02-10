
import * as THREE from 'three';

const getTextureQuality = () => {
    try {
        const saved = localStorage.getItem('winterDeathSave_v1');
        if (saved) {
            const parsed = JSON.parse(saved);
            return parsed.graphics?.textureQuality ?? 1.0;
        }
    } catch (e) { }
    return 1.0;
};

const QUALITY = getTextureQuality();

export const createProceduralDiffuse = () => {
    const draw = (w: number, h: number, fn: (ctx: CanvasRenderingContext2D, scale: number) => void) => {
        const sw = Math.floor(w * QUALITY);
        const sh = Math.floor(h * QUALITY);
        const c = document.createElement('canvas'); c.width = sw; c.height = sh;
        const ctx = c.getContext('2d')!;
        fn(ctx, QUALITY);
        const t = new THREE.CanvasTexture(c);
        t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
        return t;
    };

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
        const points: { x: number, y: number }[] = [];
        const count = Math.floor(80 * s);
        for (let i = 0; i < count; i++) points.push({ x: Math.random() * w, y: Math.random() * h });
        points.forEach(p => {
            const size = (60 + Math.random() * 60) * s;
            const r = (20 + Math.random() * 20) * s;
            ctx.beginPath();
            ctx.fillStyle = Math.random() > 0.5 ? '#6e6e6e' : '#5c5c5c';
            ctx.moveTo(p.x + size / 2, p.y);
            const numVerts = 5 + Math.floor(Math.random() * 4);
            for (let j = 0; j < numVerts; j++) {
                const angle = (j / numVerts) * Math.PI * 2;
                const dist = size * 0.5 + (Math.random() - 0.5) * r;
                ctx.lineTo(p.x + Math.cos(angle) * dist, p.y + Math.sin(angle) * dist);
            }
            ctx.fill();
        });
    });

    const pineBranch = draw(64, 64, (ctx, s) => {
        const w = ctx.canvas.width; const h = ctx.canvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = '#1a331a'; ctx.lineWidth = 4 * s;
        ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
        const count = Math.floor(400 * s * s);
        for (let i = 0; i < count; i++) {
            const x = Math.random() * w; const y = Math.random() * h;
            const dist = Math.abs(x - w / 2);
            if (Math.random() * (w / 2) > dist - 5 * s) {
                ctx.fillStyle = Math.random() > 0.4 ? '#ffffff' : '#2d4c1e';
                ctx.fillRect(x, y, (2 + Math.random() * 3) * s, (2 + Math.random() * 3) * s);
            }
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
        ctx.strokeStyle = '#554433'; ctx.lineWidth = 2 * s;
        ctx.strokeStyle = '#880000'; ctx.lineWidth = 4 * s;
        ctx.beginPath(); ctx.moveTo(300 * s, 100 * s); ctx.lineTo(340 * s, 140 * s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(340 * s, 100 * s); ctx.lineTo(300 * s, 140 * s); ctx.stroke();
    });

    const frostAlpha = draw(256, 256, (ctx, s) => {
        const w = ctx.canvas.width; const h = ctx.canvas.height;
        // Create a horizontal fade (gradient) for the transition
        // Edges (U=0, U=1) are opaque frost (snowy border), Center (U=0.5) is transparent (road surface)
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0.0, 'rgba(255,255,255,1.0)');
        grad.addColorStop(0.35, 'rgba(255,255,255,0.4)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.0)');
        grad.addColorStop(0.65, 'rgba(255,255,255,0.4)');
        grad.addColorStop(1.0, 'rgba(255,255,255,1.0)');

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Add some noise for a "crunchy" snow look at the edges
        const noiseCount = Math.floor(8000 * s * s);
        for (let i = 0; i < noiseCount; i++) {
            const x = Math.random() * w;
            const y = Math.random() * h;
            const u = x / w;
            const mask = Math.pow(Math.abs(u - 0.5) * 2, 2.5);
            const alpha = Math.random() * 0.7 * mask;
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.fillRect(x, y, 1, 1);
        }

        // Add some larger clusters (blobs) for organic feel
        const blobCount = Math.floor(40 * s);
        for (let i = 0; i < blobCount; i++) {
            const x = Math.random() * w;
            const y = Math.random() * h;
            const u = x / w;
            const mask = Math.pow(Math.abs(u - 0.5) * 2, 3.0);
            if (mask < 0.2) continue;

            const radius = (2 + Math.random() * 6) * s;
            const alpha = 0.2 + Math.random() * 0.4;
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha * mask})`;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    const halo = draw(256, 256, (ctx, s) => {
        const w = ctx.canvas.width; const h = ctx.canvas.height;
        const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.addColorStop(0, 'rgba(255, 255, 240, 1)');
        g.addColorStop(0.2, 'rgba(255, 255, 220, 0.3)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
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
        const count = Math.floor(40 * s);
        for (let i = 0; i < count; i++) {
            const y = Math.random() * h;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + (Math.random() - 0.5) * 20 * s); ctx.stroke();
        }
        const knotCount = Math.floor(5 * s);
        for (let i = 0; i < knotCount; i++) {
            ctx.beginPath();
            ctx.ellipse(Math.random() * w, Math.random() * h, (10 + Math.random() * 20) * s, (5 + Math.random() * 10) * s, Math.random() * Math.PI, 0, Math.PI * 2);
            ctx.stroke();
        }
    });

    const treeRings = draw(256, 256, (ctx, s) => {
        const w = ctx.canvas.width; const h = ctx.canvas.height;
        ctx.fillStyle = '#bc8f8f'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#8b4513'; ctx.lineWidth = 1;
        const count = Math.floor(20 * s);
        for (let i = 0; i < count; i++) {
            ctx.beginPath();
            ctx.arc(w / 2, h / 2, (i * 6 + Math.random() * 2) * s, 0, Math.PI * 2);
            ctx.stroke();
        }
    });

    const fenceMesh = draw(128, 128, (ctx, s) => {
        const w = ctx.canvas.width; const h = ctx.canvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = '#aaaaaa';
        ctx.lineWidth = 3 * s;
        // Vertical wires (closely spaced)
        const vGrid = 8 * s;
        for (let i = 0; i <= w; i += vGrid) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
        }
        // Horizontal wires (widely spaced for hierarchy)
        ctx.lineWidth = 4 * s;
        const hGrid = 32 * s;
        for (let i = 0; i <= h; i += hGrid) {
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke();
        }
    });

    const asphalt = draw(1024, 1024, (ctx, s) => {
        const w = ctx.canvas.width; const h = ctx.canvas.height;
        // Base dark grey/black
        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, w, h);

        // Aggregate stones (Fine)
        const stoneCount = Math.floor(15000 * s * s);
        for (let i = 0; i < stoneCount; i++) {
            const x = Math.random() * w;
            const y = Math.random() * h;
            const size = (1 + Math.random()) * s;
            const shade = 15 + Math.random() * 20;
            ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
            ctx.fillRect(x, y, size, size);
        }

        // Pores and cracks (Subtle noise)
        ctx.globalAlpha = 0.4;
        const poreCount = Math.floor(10000 * s * s);
        for (let i = 0; i < poreCount; i++) {
            const x = Math.random() * w;
            const y = Math.random() * h;
            const size = (2 + Math.random() * 4) * s;
            ctx.fillStyle = '#050505';
            ctx.beginPath();
            ctx.arc(x, y, size / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        // "Wear" patches (Larger, softer noise)
        const patchCount = Math.floor(100 * s);
        for (let i = 0; i < patchCount; i++) {
            const x = Math.random() * w;
            const y = Math.random() * h;
            const rad = (20 + Math.random() * 40) * s;
            const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
            grad.addColorStop(0, 'rgba(30, 30, 30, 0.15)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
    });

    const footprint = draw(64, 128, (ctx, s) => {
        const w = ctx.canvas.width; const h = ctx.canvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#ffffff';

        // Draw simple boot shape
        ctx.beginPath();
        ctx.ellipse(w / 2, 35 * s, 20 * s, 30 * s, 0, 0, Math.PI * 2); // Front
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(w / 2, 90 * s, 15 * s, 22 * s, 0, 0, Math.PI * 2); // Heel
        ctx.fill();

        // Texture grip lines (darker on the white shape)
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 3 * s;
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(15 * s, (25 + i * 15) * s);
            ctx.lineTo(49 * s, (25 + i * 15) * s);
            ctx.stroke();
        }
    });

    return { gravel, stone, pineBranch, pine: pineBranch, tacticalMap, frostAlpha, halo, containerMetal, wood, treeRings, fenceMesh, asphalt, footprint };
}
