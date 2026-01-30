
import * as THREE from 'three';

export function createCampTextures() {
  const draw = (w:number, h:number, fn:(ctx:CanvasRenderingContext2D)=>void) => {
    const c = document.createElement('canvas'); c.width=w; c.height=h;
    const ctx = c.getContext('2d')!; fn(ctx);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
    return t;
  };

  const gravel = draw(512, 512, ctx => {
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0,0,512,512);
    for(let i=0; i<25000; i++) {
        ctx.fillStyle = Math.random()>0.5 ? '#252525' : '#0e0e0e';
        ctx.fillRect(Math.random()*512, Math.random()*512, 2, 2);
    }
  });
  gravel.repeat.set(32, 32);

  const stone = draw(256, 256, ctx => {
    ctx.fillStyle = '#555555'; ctx.fillRect(0,0,256,256);
    for(let i=0; i<2000; i++) {
        ctx.fillStyle = Math.random()>0.5 ? '#444444' : '#666666';
        const s = 2 + Math.random() * 4;
        ctx.fillRect(Math.random()*256, Math.random()*256, s, s);
    }
  });

  const wood = draw(256, 256, ctx => {
    ctx.fillStyle = '#3e2723'; ctx.fillRect(0,0,256,256);
    ctx.fillStyle = '#281a14';
    for(let i=0; i<40; i++) ctx.fillRect(0, Math.random()*256, 256, 1+Math.random());
    for(let i=0; i<3000; i++) {
       ctx.fillStyle = Math.random()>0.5?'#4e342e':'#1f120e';
       ctx.fillRect(Math.random()*256, Math.random()*256, 2, 6);
    }
  });

  const pine = draw(512, 512, ctx => {
    ctx.fillStyle = '#0a1a0a'; ctx.fillRect(0,0,512,512);
    for(let i=0; i<15000; i++) {
        ctx.strokeStyle = Math.random() > 0.7 ? '#2f4a2f' : '#1a331a';
        ctx.lineWidth = 1.5;
        const x = Math.random()*512; const y = Math.random()*512;
        ctx.beginPath(); ctx.moveTo(x,y); 
        ctx.lineTo(x+(Math.random()-0.5)*12, y+(Math.random()-0.5)*12); 
        ctx.stroke();
    }
  });

  const halo = draw(256, 256, ctx => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255, 255, 240, 1)'); 
    g.addColorStop(0.2, 'rgba(255, 255, 220, 0.3)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,256,256);
  });

  const tacticalMap = draw(512, 512, ctx => {
      // Paper background
      ctx.fillStyle = '#dcd0b0'; ctx.fillRect(0,0,512,512);
      
      // Grid lines
      ctx.strokeStyle = '#c0b090'; ctx.lineWidth = 1;
      for(let i=0; i<=512; i+=32) {
          ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
      }

      // Topo lines / Roads
      ctx.strokeStyle = '#554433'; ctx.lineWidth = 2;
      for(let i=0; i<8; i++) {
          ctx.beginPath();
          const cx = 256 + (Math.random()-0.5)*300;
          const cy = 256 + (Math.random()-0.5)*300;
          ctx.ellipse(cx, cy, 50 + Math.random()*100, 50 + Math.random()*100, Math.random()*Math.PI, 0, Math.PI*2);
          ctx.stroke();
      }

      // Red Markers
      ctx.strokeStyle = '#880000'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(300, 100); ctx.lineTo(340, 140); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(340, 100); ctx.lineTo(300, 140); ctx.stroke();
      
      ctx.fillStyle = '#880000'; ctx.font = "bold 20px Courier";
      ctx.fillText("SECTOR 4", 300, 160);
      
      // Coffee stain
      ctx.strokeStyle = '#c0a080'; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(100, 400, 40, 0, Math.PI*2); ctx.stroke();
  });

  return { gravel, stone, wood, pine, halo, tacticalMap };
}
