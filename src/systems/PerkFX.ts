import * as THREE from 'three';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { PlayerStatusFlags } from '../entities/player/PlayerTypes';
import { GEOMETRY, MATERIALS } from '../utils/assets';

/**
 * VINTERDÖD: PerkFX
 * 
 * Manages the 3D visual representations of active buffs and debuffs around the player.
 * Built to be Zero-GC and high-performance using single mesh visibility toggles.
 * 
 * Pattern: Static Utility Helper
 */

let _shieldMesh: THREE.Mesh | null = null;
let _shieldMaterial: THREE.MeshBasicMaterial | null = null;

export const PerkFX = {
    init: (playerGroup: THREE.Group) => {
        // --- ARC GEOMETRY ---
        _shieldMaterial = MATERIALS.perkShield.clone();
        _shieldMesh = new THREE.Mesh(GEOMETRY.perkShield, _shieldMaterial);

        // Position it slightly in front of the player and rotate to face forward
        _shieldMesh.position.set(0, 0.9, 0.4);
        _shieldMesh.rotation.set(0, 0, 0);

        _shieldMesh.visible = false;
        playerGroup.add(_shieldMesh);
    },

    updateFX: (ctx: GameSessionLogic, delta: number, simTime: number, renderTime: number) => {
        if (!_shieldMesh || !_shieldMaterial) return;

        const state = ctx.state;
        if (!state) return;

        const flags = state.statusFlags;
        const hasShield = (flags & PlayerStatusFlags.REFLEX_SHIELD) !== 0;
        const hasAdrenaline = (flags & PlayerStatusFlags.ADRENALINE_SHOT) !== 0;
        const hasGibMaster = (flags & PlayerStatusFlags.GIB_MASTER) !== 0;

        if (hasShield || hasAdrenaline || hasGibMaster) {
            _shieldMesh.visible = true;

            // Priority Color.
            if (hasShield) {
                _shieldMaterial.color.setHex(0xffff00); // Yellow
                _shieldMaterial.opacity = THREE.MathUtils.lerp(_shieldMaterial.opacity, 0.4 + Math.sin(renderTime * 0.01) * 0.1, 10 * delta);
            } else if (hasGibMaster) {
                _shieldMaterial.color.setHex(0xff00ff); // Purple
                _shieldMaterial.opacity = THREE.MathUtils.lerp(_shieldMaterial.opacity, 0.5 + Math.sin(renderTime * 0.02) * 0.15, 10 * delta);
            } else if (hasAdrenaline) {
                _shieldMaterial.color.setHex(0x00ff00); // Green
                _shieldMaterial.opacity = THREE.MathUtils.lerp(_shieldMaterial.opacity, 0.3 + Math.sin(renderTime * 0.008) * 0.05, 10 * delta);
            }

            // Subtle scale pulse
            const pulse = 1.0 + Math.sin(renderTime * 0.015) * 0.02;
            _shieldMesh.scale.set(pulse, 1.0, pulse);

        } else {
            _shieldMaterial.opacity = THREE.MathUtils.lerp(_shieldMaterial.opacity, 0, 15 * delta);
            if (_shieldMaterial.opacity < 0.01) {
                _shieldMesh.visible = false;
            }
        }
    }
};
