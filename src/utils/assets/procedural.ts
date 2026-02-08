
import * as THREE from 'three';

export const createProceduralDiffuse = () => {
    const draw = (w: number, h: number, fn: (ctx: CanvasRenderingContext2D) => void) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d')!; fn(ctx);
        const t = new THREE.CanvasTexture(c);
        t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
        return t;
    };

    const gravel = draw(512, 512, ctx => {
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 25000; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#252525' : '#0e0e0e';
            ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
        }
    });

    const stone = draw(512, 512, ctx => {
        ctx.fillStyle = '#4a4a4a'; ctx.fillRect(0, 0, 512, 512);
        const points: { x: number, y: number }[] = [];
        for (let i = 0; i < 80; i++) points.push({ x: Math.random() * 512, y: Math.random() * 512 });
        points.forEach(p => {
            const size = 60 + Math.random() * 60;
            const r = 20 + Math.random() * 20;
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

    const pineBranch = draw(64, 64, ctx => {
        ctx.clearRect(0, 0, 64, 64);
        ctx.strokeStyle = '#1a331a'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(32, 0); ctx.lineTo(32, 64); ctx.stroke();
        for (let i = 0; i < 400; i++) {
            const x = Math.random() * 64; const y = Math.random() * 64;
            const dist = Math.abs(x - 32);
            if (Math.random() * 32 > dist - 5) {
                ctx.fillStyle = Math.random() > 0.4 ? '#ffffff' : '#2d4c1e';
                ctx.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
            }
        }
    });

    const tacticalMap = draw(512, 512, ctx => {
        ctx.fillStyle = '#dcd0b0'; ctx.fillRect(0, 0, 512, 512);
        ctx.strokeStyle = '#c0b090'; ctx.lineWidth = 1;
        for (let i = 0; i <= 512; i += 32) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
        }
        ctx.strokeStyle = '#554433'; ctx.lineWidth = 2;
        ctx.strokeStyle = '#880000'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(300, 100); ctx.lineTo(340, 140); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(340, 100); ctx.lineTo(300, 140); ctx.stroke();
    });

    const frostAlpha = draw(256, 256, ctx => {
        // Create a horizontal fade (gradient) for the transition
        // Edges (U=0, U=1) are opaque frost (snowy border), Center (U=0.5) is transparent (road surface)
        const grad = ctx.createLinearGradient(0, 0, 256, 0);
        grad.addColorStop(0.0, 'rgba(255,255,255,1.0)');
        grad.addColorStop(0.35, 'rgba(255,255,255,0.4)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.0)');
        grad.addColorStop(0.65, 'rgba(255,255,255,0.4)');
        grad.addColorStop(1.0, 'rgba(255,255,255,1.0)');

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 256);

        // Add some noise for a "crunchy" snow look at the edges
        for (let i = 0; i < 8000; i++) {
            const x = Math.random() * 256;
            const y = Math.random() * 256;
            const u = x / 256;
            const mask = Math.pow(Math.abs(u - 0.5) * 2, 2.5);
            const alpha = Math.random() * 0.7 * mask;
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.fillRect(x, y, 1, 1);
        }

        // Add some larger clusters (blobs) for organic feel
        for (let i = 0; i < 40; i++) {
            const x = Math.random() * 256;
            const y = Math.random() * 256;
            const u = x / 256;
            const mask = Math.pow(Math.abs(u - 0.5) * 2, 3.0);
            if (mask < 0.2) continue;

            const radius = 2 + Math.random() * 6;
            const alpha = 0.2 + Math.random() * 0.4;
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha * mask})`;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
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

    const containerMetal = draw(128, 128, ctx => {
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = '#888888'; ctx.lineWidth = 12;
        for (let i = 0; i <= 128; i += 32) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
        }
    });

    const wood = draw(256, 256, ctx => {
        ctx.fillStyle = '#5e3723'; ctx.fillRect(0, 0, 256, 256);
        ctx.strokeStyle = '#3d2417'; ctx.lineWidth = 2;
        for (let i = 0; i < 40; i++) {
            const y = Math.random() * 256;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y + (Math.random() - 0.5) * 20); ctx.stroke();
        }
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.ellipse(Math.random() * 256, Math.random() * 256, 10 + Math.random() * 20, 5 + Math.random() * 10, Math.random() * Math.PI, 0, Math.PI * 2);
            ctx.stroke();
        }
    });

    const treeRings = draw(256, 256, ctx => {
        ctx.fillStyle = '#bc8f8f'; ctx.fillRect(0, 0, 256, 256);
        ctx.strokeStyle = '#8b4513'; ctx.lineWidth = 1;
        for (let i = 0; i < 20; i++) {
            ctx.beginPath();
            ctx.arc(128, 128, i * 6 + Math.random() * 2, 0, Math.PI * 2);
            ctx.stroke();
        }
    });

    const fenceMesh = draw(128, 128, ctx => {
        ctx.clearRect(0, 0, 128, 128);
        ctx.strokeStyle = '#aaaaaa';
        ctx.lineWidth = 3;
        // Vertical wires (closely spaced)
        for (let i = 0; i <= 128; i += 8) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
        }
        // Horizontal wires (widely spaced for hierarchy)
        ctx.lineWidth = 4;
        for (let i = 0; i <= 128; i += 32) {
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke();
        }
    });

    const asphalt = draw(1024, 1024, ctx => {
        // Base dark grey/black
        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, 1024, 1024);

        // Aggregate stones (Fine)
        for (let i = 0; i < 150000; i++) {
            const x = Math.random() * 1024;
            const y = Math.random() * 1024;
            const size = 1 + Math.random();
            const shade = 15 + Math.random() * 20;
            ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
            ctx.fillRect(x, y, size, size);
        }

        // Pores and cracks (Subtle noise)
        ctx.globalAlpha = 0.4;
        for (let i = 0; i < 10000; i++) {
            const x = Math.random() * 1024;
            const y = Math.random() * 1024;
            const size = 2 + Math.random() * 4;
            ctx.fillStyle = '#050505';
            ctx.beginPath();
            ctx.arc(x, y, size / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        // "Wear" patches (Larger, softer noise)
        for (let i = 0; i < 100; i++) {
            const x = Math.random() * 1024;
            const y = Math.random() * 1024;
            const rad = 20 + Math.random() * 40;
            const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
            grad.addColorStop(0, 'rgba(30, 30, 30, 0.15)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
    });

    return { gravel, stone, pineBranch, pine: pineBranch, tacticalMap, frostAlpha, halo, containerMetal, wood, treeRings, fenceMesh, asphalt };
}
