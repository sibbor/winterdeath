
import * as THREE from 'three';

export function createProceduralTextures() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    
    // --- GROUND TEXTURE (Asphalt/Snow mix) ---
    ctx.fillStyle = '#ccddff'; ctx.fillRect(0, 0, 512, 512); 
    for(let i=0; i<15000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#ddeeff';
        ctx.fillRect(Math.random()*512, Math.random()*512, 2, 2);
    }
    // Patches of asphalt/dirt showing through
    for(let i=0; i<20; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const r = 10 + Math.random() * 30;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(30, 30, 35, 0.8)');
        g.addColorStop(1, 'rgba(200, 220, 255, 0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
    }

    const groundTex = new THREE.CanvasTexture(canvas);
    groundTex.wrapS = THREE.RepeatWrapping; groundTex.wrapT = THREE.RepeatWrapping; groundTex.repeat.set(32, 32);
    groundTex.colorSpace = THREE.SRGBColorSpace;

    // --- LASER TEXTURE ---
    const laserCanvas = document.createElement('canvas');
    laserCanvas.width = 32; laserCanvas.height = 256;
    const lCtx = laserCanvas.getContext('2d')!;
    const lg = lCtx.createLinearGradient(0, 0, 0, 256);
    lg.addColorStop(0, 'rgba(255, 255, 255, 0)'); // Tip
    lg.addColorStop(0.15, 'rgba(255, 255, 255, 0.8)'); // 3m in
    lg.addColorStop(1, 'rgba(255, 255, 255, 0.8)'); // Base
    
    lCtx.fillStyle = lg;
    lCtx.fillRect(0, 0, 32, 256);
    const laserTex = new THREE.CanvasTexture(laserCanvas);

    // --- PINE BRANCH TEXTURE (Forest House Style) ---
    // A stylized branch with dense needles and heavy snow clumps
    const branchCanvas = document.createElement('canvas');
    branchCanvas.width = 512; branchCanvas.height = 512;
    const bCtx = branchCanvas.getContext('2d')!;
    
    // 1. Needles (Dense, dark green, painterly)
    // Draw from center axis (x=256) outwards
    const needleColors = ['#1a261a', '#263326', '#0d1a0d', '#1f2e1f'];
    
    for (let i = 0; i < 2000; i++) {
        const y = Math.random() * 500 + 12; // Position along stem
        
        // Taper shape: Widest at bottom (y=512), narrow at top (y=0)
        // Inverted for hanging branches: Widest at y=0 if hanging? 
        // Let's assume standard branch: Widest at base of texture
        const progress = y / 512; 
        const maxW = 220 * Math.pow(progress, 0.6); 
        
        const side = Math.random() > 0.5 ? 1 : -1;
        const len = 10 + Math.random() * maxW;
        
        const startX = 256 + (side * 4);
        const endX = 256 + (side * len);
        
        // Slight droop curve
        const droop = (len / 200) * 40;
        const endY = y + 10 + Math.random() * 10 + droop; 

        bCtx.strokeStyle = needleColors[Math.floor(Math.random() * needleColors.length)];
        bCtx.lineWidth = 2 + Math.random() * 2;
        bCtx.lineCap = 'round';
        bCtx.globalAlpha = 0.9;
        
        bCtx.beginPath();
        bCtx.moveTo(startX, y);
        bCtx.quadraticCurveTo(startX + (side * len * 0.4), y - 5, endX, endY);
        bCtx.stroke();
    }

    // 2. Stem (Dark wood)
    bCtx.strokeStyle = '#3e2723';
    bCtx.lineWidth = 12;
    bCtx.beginPath();
    bCtx.moveTo(256, 512); 
    bCtx.lineTo(256, 10); 
    bCtx.stroke();

    // 3. Snow Clumps (Painterly white blobs on top)
    bCtx.fillStyle = '#f0f8ff';
    bCtx.globalAlpha = 1.0;
    
    // Large clumps sitting on the branches
    for (let i = 0; i < 40; i++) {
        const y = Math.random() * 480;
        const widthAtY = 200 * Math.pow(y/512, 0.6);
        const x = 256 + (Math.random()-0.5) * 2 * widthAtY;
        
        // Only place snow if it's within the needle cone
        if (Math.abs(x - 256) < widthAtY) {
            const size = 15 + Math.random() * 25;
            bCtx.beginPath();
            bCtx.ellipse(x, y, size, size * 0.6, Math.random()*0.5, 0, Math.PI*2);
            bCtx.fill();
        }
    }
    // Fine snow dust
    for(let i=0; i<300; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        if(Math.abs(x-256) < 200 * (y/512)) {
            bCtx.globalAlpha = 0.6 + Math.random() * 0.4;
            bCtx.beginPath();
            bCtx.arc(x, y, 2 + Math.random()*3, 0, Math.PI*2);
            bCtx.fill();
        }
    }

    const pineBranchTex = new THREE.CanvasTexture(branchCanvas);
    pineBranchTex.colorSpace = THREE.SRGBColorSpace;

    // --- BARK TEXTURE (Forest House Style) ---
    // Dark, vertical ridges with moss at bottom
    const barkCanvas = document.createElement('canvas');
    barkCanvas.width = 256; barkCanvas.height = 512; // Taller for verticality
    const bkCtx = barkCanvas.getContext('2d')!;
    
    // 1. Base Dark Brown/Grey
    bkCtx.fillStyle = '#2b2622'; 
    bkCtx.fillRect(0,0,256,512);
    
    // 2. Vertical Ridges (Striations)
    for(let i=0; i<200; i++) {
        bkCtx.fillStyle = Math.random() > 0.5 ? '#1a1512' : '#3e3630'; // Darker black or lighter grey
        const x = Math.random() * 256;
        const w = 4 + Math.random() * 8;
        const h = 50 + Math.random() * 200;
        const y = Math.random() * 512;
        
        bkCtx.fillRect(x, y, w, h);
    }

    // 3. Moss Gradient (Bottom up)
    const mossGrad = bkCtx.createLinearGradient(0, 512, 0, 200);
    mossGrad.addColorStop(0, 'rgba(60, 100, 40, 0.9)');   // Deep Green base
    mossGrad.addColorStop(0.6, 'rgba(80, 120, 50, 0.4)'); // Fading up
    mossGrad.addColorStop(1, 'rgba(80, 120, 50, 0)');
    
    bkCtx.fillStyle = mossGrad;
    bkCtx.fillRect(0, 0, 256, 512);

    // 4. Procedural Moss Patches (Noise)
    for(let i=0; i<500; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 512;
        // More moss at bottom
        if (Math.random() > (y/512)) {
            bkCtx.fillStyle = Math.random() > 0.5 ? '#4a6b30' : '#5c8040';
            bkCtx.beginPath();
            bkCtx.arc(x, y, 2 + Math.random()*4, 0, Math.PI*2);
            bkCtx.fill();
        }
    }

    // 5. Snow Accumulation (In ridges)
    for(let i=0; i<300; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 512;
        bkCtx.fillStyle = 'rgba(240, 248, 255, 0.7)';
        // Thin vertical snow lines trapped in bark
        bkCtx.fillRect(x, y, 1 + Math.random()*2, 5 + Math.random()*10);
    }

    const barkTex = new THREE.CanvasTexture(barkCanvas);
    barkTex.wrapS = THREE.RepeatWrapping;
    barkTex.wrapT = THREE.RepeatWrapping;
    barkTex.repeat.set(1, 4); // Repeat vertically on tall trunks
    barkTex.colorSpace = THREE.SRGBColorSpace;

    return { groundTex, laserTex, pineBranchTex, barkTex };
}

export function createTextSprite(text: string) {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'bold 40px Arial'; ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.fillText(text, 128, 50);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }));
    sprite.scale.set(6, 1.5, 1);
    return sprite;
}
