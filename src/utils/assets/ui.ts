
import * as THREE from 'three';
import { FAMILY_MEMBERS, PLAYER_CHARACTER } from '../../content/constants';

const spriteTextureCache: Record<string, THREE.CanvasTexture> = {};

export const createTextSprite = (text: string) => {
    if (spriteTextureCache[text]) {
        const mat = new THREE.SpriteMaterial({
            map: spriteTextureCache[text],
            transparent: true,
            depthWrite: false,
            depthTest: true
        });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(4, 1, 1);
        return sprite;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = 256;
    canvas.height = 64;
    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const tex = new THREE.CanvasTexture(canvas);
    spriteTextureCache[text] = tex;

    const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        depthTest: true
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(4, 1, 1);
    return sprite;
};

export const createSignMesh = (text: string, width: number, height: number, textColor: string = '#ffaa00', bgColor: string = '#000000') => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    // [VINTERDÖD MOD] Dynamic aspect ratio to prevent stretching
    const aspect = width / height;
    if (aspect >= 1) {
        canvas.width = 512;
        canvas.height = Math.round(512 / aspect);
    } else {
        canvas.height = 512;
        canvas.width = Math.round(512 * aspect);
    }

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Font size relative to height for consistent padding
    const fontSize = Math.round(canvas.height * 0.75);
    ctx.font = `bold ${fontSize}px Arial`; 
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    return mesh;
};

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
