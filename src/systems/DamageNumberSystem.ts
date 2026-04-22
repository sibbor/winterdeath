import * as THREE from 'three';
import { System, SystemID } from './System';
import { WeaponCategoryColors, WEAPONS } from '../content/weapons';
import { DamageID } from '../entities/player/CombatTypes';

interface DamageText {
    mesh: THREE.Sprite;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    texture: THREE.CanvasTexture;
    active: boolean;
    life: number;
    maxLife: number;
    isNumeric: boolean;
    numericValue: number;
}

const DEFAULT_COLOR = '#ffffff';

export class DamageNumberSystem implements System {
    readonly systemId = SystemID.DAMAGE_NUMBER;
    id = 'damage_number_system';
    enabled = true;
    persistent = true;
    private pool: DamageText[] = [];
    private scene: THREE.Scene;

    /**
     * Resolves the appropriate hex color for a damage number based on its source.
     * VINTERDÖD FIX: Uses numeric DamageID (SMI) for O(1) jump-table performance.
     */
    public static getColorForType(type: DamageID, isHighImpact: boolean): string {
        // High Impact (Crits/Heavy) fallback
        if (isHighImpact) return '#ff0000';

        switch (type) {
            case DamageID.BURN:
            case DamageID.MOLOTOV:
            case DamageID.FLAMETHROWER:
                return '#ffaa00';

            case DamageID.ELECTRIC:
            case DamageID.ARC_CANNON:
                return '#00ffff';

            case DamageID.DROWNING:
                return '#3b82f6';

            case DamageID.FALL:
            case DamageID.PHYSICAL:
            case DamageID.RUSH:
                return '#e887a7';

            case DamageID.VEHICLE:
            case DamageID.VEHICLE_PUSH:
            case DamageID.VEHICLE_RAM:
                return '#cccccc';

            case DamageID.VEHICLE_SPLATTER:
                return '#ff0000';

            default: {
                const weaponData = WEAPONS[type];
                if (weaponData) {
                    return WeaponCategoryColors[weaponData.category] || DEFAULT_COLOR;
                }
            }
        }

        return DEFAULT_COLOR;
    }

    // Pre-allocate a reasonable pool size to avoid mid-combat hitching
    constructor(scene: THREE.Scene, initialPoolSize: number = 20) {
        this.scene = scene;
        for (let i = 0; i < initialPoolSize; i++) {
            this.createPooledInstance();
        }
    }

    private createPooledInstance(): DamageText {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d')!;

        // Font setup (done once)
        ctx.font = 'bold 64px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 5;

        const texture = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            depthTest: true
        });

        mat.userData = { isSharedAsset: true };
        const mesh = new THREE.Sprite(mat);

        mesh.scale.set(3.0, 0.75, 2.0);
        mesh.visible = false; // Hidden by default
        this.scene.add(mesh);

        const pooled: DamageText = {
            mesh, canvas, ctx, texture,
            active: false, life: 0, maxLife: 0,
            isNumeric: false, numericValue: 0
        };

        this.pool.push(pooled);
        return pooled;
    }

    public spawn(x: number, y: number, z: number, text: string, color: string = '#ffffff') {
        const parsedValue = parseFloat(text);
        const isNumeric = !isNaN(parsedValue);

        // --- 1. SPATIAL MERGING (Damage Accumulation) ---
        const MERGE_DIST_SQ = 2.25;

        for (let i = 0; i < this.pool.length; i++) {
            const t = this.pool[i];
            if (!t.active) continue;

            const dx = t.mesh.position.x - x;
            const dz = t.mesh.position.z - z;
            const distSq = dx * dx + dz * dz;

            if (distSq < MERGE_DIST_SQ) {
                // We found an active number in the same place! Time to merge.
                let newText = text;

                // If both old and new text are numbers, add them! (e.g. 12 + 4 = 16)
                if (isNumeric && t.isNumeric) {
                    t.numericValue += parsedValue;
                    newText = Math.round(t.numericValue).toString();
                }

                // Update Canvas
                t.ctx.clearRect(0, 0, 256, 64);
                t.ctx.fillStyle = 'white';
                t.ctx.strokeStyle = 'black';
                t.ctx.strokeText(newText, 128, 32);
                t.ctx.fillText(newText, 128, 32);
                t.texture.needsUpdate = true;

                // Reset the lifetime and give it a "Visual POP"
                t.life = 1.5;
                t.maxLife = 1.5;
                t.mesh.scale.set(4.0, 1.0, 2.0);
                t.mesh.material.color.set(color);
                t.mesh.material.opacity = 1.0;

                return; // ZERO-GC EXIT!
            }
        }

        // --- 2. NORMAL SPAWN (if no merge occurred) ---
        let pooled = this.pool.find(t => !t.active);

        // Fallback if pool is empty (creates a new one dynamically, though rare)
        if (!pooled) {
            pooled = this.createPooledInstance();
        }

        // Set mathematical properties
        pooled.isNumeric = isNumeric;
        pooled.numericValue = isNumeric ? parsedValue : 0;

        // Draw new text
        pooled.ctx.clearRect(0, 0, 256, 64);
        pooled.ctx.fillStyle = 'white';
        pooled.ctx.strokeStyle = 'black';
        pooled.ctx.strokeText(text, 128, 32);
        pooled.ctx.fillText(text, 128, 32);
        pooled.texture.needsUpdate = true;

        // Reset visual state
        pooled.mesh.scale.set(3.0, 0.75, 2.0);
        pooled.mesh.position.set(x, y + 1.5, z);
        pooled.mesh.material.color.set(color);
        pooled.mesh.material.opacity = 1.0;
        pooled.mesh.visible = true;

        pooled.life = 1.5;
        pooled.maxLife = 1.5;
        pooled.active = true;
    }

    // --- 3. LIFECYCLE ANIMATION ---
    update(ctx: any, delta: number, simTime: number, renderTime: number) {
        const safeDelta = Math.min(delta, 0.1);

        for (let i = 0; i < this.pool.length; i++) {
            const t = this.pool[i];
            if (!t.active) continue;

            t.life -= safeDelta;

            if (t.life <= 0) {
                t.active = false;
                t.mesh.visible = false;
                continue;
            }

            // Float upwards (Ditt originalvärde: 1.2)
            t.mesh.position.y += 1.2 * safeDelta;

            // Opacity fade out (Ditt originalvärde: börjar fada när life < 0.5)
            t.mesh.material.opacity = Math.min(1.0, t.life * 2.0);

            // --- VISUAL POP DECAY ---
            // Shrink softly back to original size (Dina originalvärden)
            if (t.mesh.scale.x > 3.0) {
                t.mesh.scale.x = Math.max(3.0, t.mesh.scale.x - 4.0 * safeDelta);
                t.mesh.scale.y = Math.max(0.75, t.mesh.scale.y - 1.0 * safeDelta);
            }
        }
    }
}