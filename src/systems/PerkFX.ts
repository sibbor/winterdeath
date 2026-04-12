import * as THREE from 'three';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { PlayerStatusFlags } from '../entities/player/PlayerTypes';
import { GEOMETRY, MATERIALS } from '../utils/assets';

/**
 * VINTERDÖD: PerkFX
 * 
 * Manages the 3D visual representations of active buffs and debuffs around the player.
 * Built to be Zero-GC and high-performance using single mesh visibility toggles.
 */
export class PerkFX {
    private shieldMesh: THREE.Mesh;
    private shieldMaterial: THREE.MeshBasicMaterial;

    constructor(private playerGroup: THREE.Group) {
        // --- ARC GEOMETRY ---
        this.shieldMaterial = MATERIALS.perkShield.clone();
        this.shieldMesh = new THREE.Mesh(GEOMETRY.perkShield, this.shieldMaterial);

        // Position it slightly in front of the player and rotate to face forward
        this.shieldMesh.position.set(0, 0.9, 0.4);
        this.shieldMesh.rotation.set(0, 0, 0);

        this.shieldMesh.visible = false;
        this.playerGroup.add(this.shieldMesh);
    }

    public update(ctx: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        const state = ctx.state;
        if (!state) return;

        const flags = state.statusFlags;
        const hasShield = (flags & PlayerStatusFlags.REFLEX_SHIELD) !== 0;
        const hasAdrenaline = (flags & PlayerStatusFlags.ADRENALINE_SHOT) !== 0;
        const hasGibMaster = (flags & PlayerStatusFlags.GIB_MASTER) !== 0;

        if (hasShield || hasAdrenaline || hasGibMaster) {
            this.shieldMesh.visible = true;

            // Priority Color.
            if (hasShield) {
                this.shieldMaterial.color.setHex(0xffff00); // Yellow
                this.shieldMaterial.opacity = THREE.MathUtils.lerp(this.shieldMaterial.opacity, 0.4 + Math.sin(renderTime * 0.01) * 0.1, 10 * delta);
            } else if (hasGibMaster) {
                this.shieldMaterial.color.setHex(0xff00ff); // Purple
                this.shieldMaterial.opacity = THREE.MathUtils.lerp(this.shieldMaterial.opacity, 0.5 + Math.sin(renderTime * 0.02) * 0.15, 10 * delta);
            } else if (hasAdrenaline) {
                this.shieldMaterial.color.setHex(0x00ff00); // Green
                this.shieldMaterial.opacity = THREE.MathUtils.lerp(this.shieldMaterial.opacity, 0.3 + Math.sin(renderTime * 0.008) * 0.05, 10 * delta);
            }

            // Subtle scale pulse
            const pulse = 1.0 + Math.sin(renderTime * 0.015) * 0.02;
            this.shieldMesh.scale.set(pulse, 1.0, pulse);

        } else {
            this.shieldMaterial.opacity = THREE.MathUtils.lerp(this.shieldMaterial.opacity, 0, 15 * delta);
            if (this.shieldMaterial.opacity < 0.01) {
                this.shieldMesh.visible = false;
            }
        }
    }
}
