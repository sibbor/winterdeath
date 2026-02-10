
import * as THREE from 'three';
import { FAMILY_MEMBERS, PLAYER_CHARACTER } from '../../content/constants';

export const createTextSprite = (text: string) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = 256; canvas.height = 64;
    ctx.font = '24px Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    const tex = new THREE.CanvasTexture(canvas);
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
    // Higher res for clean text
    canvas.width = 256; canvas.height = 64;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = 'bold 40px Arial'; // Bigger font for 256x64
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const tex = new THREE.CanvasTexture(canvas);
    // Emissive to shine a bit?
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
