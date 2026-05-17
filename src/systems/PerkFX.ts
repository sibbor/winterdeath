import * as THREE from 'three';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { PlayerStatusFlags } from '../entities/player/PlayerTypes';
import { GEOMETRY, MATERIALS } from '../utils/assets';
import { COLORS } from '../utils/ui/ColorUtils';
import { FXSystem } from './FXSystem';
import { FXParticleType } from '../types/FXTypes';

/**
 * PerkFX
 * 
 * Manages the 3D visual representations of active buffs and debuffs around the player.
 * Built to be Zero-GC and high-performance using single mesh visibility toggles.
 * 
 * Pattern: Static Utility Helper
 */

let _shieldMesh: THREE.Mesh | null = null;
let _shieldMaterial: THREE.MeshBasicMaterial | null = null;

// ZERO-GC Activation Transition State
let _prevShield = false;
let _prevAdrenaline = false;
let _prevGibMaster = false;

// Pre-allocated velocity scratchpad to avoid runtime allocations
const _velScratch = new THREE.Vector3();

export const PerkFX = {

    init: (playerGroup: THREE.Group) => {
        // --- ARC GEOMETRY ---
        _shieldMaterial = MATERIALS.perkShield.clone();
        _shieldMesh = new THREE.Mesh(GEOMETRY.perkShield, _shieldMaterial);

        // Position it decisively in front of the player and rotate to face forward (+Z)
        // [VINTERDÖD FIX] Muzzle flashes are at Z=0.8, we place the shield slightly closer at Z=0.65
        _shieldMesh.position.set(0, 0.85, 0.65);
        _shieldMesh.rotation.set(0, 0, 0);

        _shieldMesh.visible = false;
        playerGroup.add(_shieldMesh);

        // Reset transition tracking
        _prevShield = false;
        _prevAdrenaline = false;
        _prevGibMaster = false;
    },

    /**
     * Radial activation burst centered on the player when a perk triggers.
     * Spawns expanding novae/shockwaves accompanied by a ring of colorful sparks.
     */
    triggerActivationBurst: (ctx: GameSessionLogic, colorNum: number, particleType: FXParticleType) => {
        const playerPos = ctx.playerPos;
        if (!playerPos) return;

        const scene = ctx.engine.scene;
        const particlesList = ctx.state.particles;
        if (!scene || !particlesList) return;

        // 1. Expanding center shockwave/nova
        //FXSystem.spawnParticle(scene, particlesList, playerPos.x, 0.15, playerPos.z, particleType, 1, null, undefined, colorNum, 3.5, 0.65);

        // 2. High-intensity flash sphere at player chest level
        //FXSystem.spawnParticle(scene, particlesList, playerPos.x, 0.85, playerPos.z, FXParticleType.FLASH, 3, null, undefined, colorNum, 1.8, 0.3);

        // 3. Ring of radial sparks shooting outwards (Zero-GC loop)
        const sparkCount = 32;
        const speed = 8.0;
        for (let i = 0; i < sparkCount; i++) {
            const angle = (i / sparkCount) * Math.PI * 2;
            _velScratch.set(Math.cos(angle) * speed, 0.5 + Math.random() * 2.5, Math.sin(angle) * speed);
            FXSystem.spawnParticle(scene, particlesList, playerPos.x, 0.3, playerPos.z, FXParticleType.SPARK, 1, null, _velScratch, colorNum, 1.3, 0.45);
        }
    },

    updateFX: (ctx: GameSessionLogic, delta: number, simTime: number, renderTime: number) => {
        if (!_shieldMesh || !_shieldMaterial) return;

        const state = ctx.state;
        if (!state) return;

        const flags = state.statusFlags;
        const hasShield = (flags & PlayerStatusFlags.REFLEX_SHIELD) !== 0;
        const hasAdrenaline = (flags & PlayerStatusFlags.ADRENALINE_PATCH) !== 0;
        const hasGibMaster = (flags & PlayerStatusFlags.GIB_MASTER) !== 0;

        const hasBleeding = (flags & PlayerStatusFlags.BLEEDING) !== 0;
        const hasBurning = (flags & PlayerStatusFlags.BURNING) !== 0;
        const hasElectrified = (flags & PlayerStatusFlags.ELECTRIFIED) !== 0;
        const hasStunned = (flags & PlayerStatusFlags.STUNNED) !== 0;

        const playerPos = ctx.playerPos;
        const scene = ctx.engine.scene;
        const particlesList = state.particles;

        if (playerPos && scene && particlesList) {
            // --- BURNING 3D FLAMES ---
            if (hasBurning && Math.random() < 0.22) {
                const px = playerPos.x + (Math.random() - 0.5) * 0.45;
                const py = 0.4 + Math.random() * 0.8;
                const pz = playerPos.z + (Math.random() - 0.5) * 0.45;
                FXSystem.spawnParticle(scene, particlesList, px, py, pz, FXParticleType.ENEMY_EFFECT_FLAME, 1);
            }

            // --- BLEEDING BLOOD DROPS TRAIL ---
            if (hasBleeding && Math.random() < 0.16) {
                const px = playerPos.x + (Math.random() - 0.5) * 0.2;
                const py = 0.5 + Math.random() * 0.3;
                const pz = playerPos.z + (Math.random() - 0.5) * 0.2;
                _velScratch.set((Math.random() - 0.5) * 0.8, -4.0, (Math.random() - 0.5) * 0.8);
                FXSystem.spawnParticle(scene, particlesList, px, py, pz, FXParticleType.BLOOD_SPLATTER, 1, null, _velScratch);
            }

            // --- ELECTRIFIED / STUNNED SPARKS ---
            if ((hasElectrified || hasStunned) && Math.random() < 0.25) {
                const px = playerPos.x + (Math.random() - 0.5) * 0.4;
                const py = 0.5 + Math.random() * 0.7;
                const pz = playerPos.z + (Math.random() - 0.5) * 0.4;
                FXSystem.spawnParticle(scene, particlesList, px, py, pz, FXParticleType.ENEMY_EFFECT_SPARK, 1);
            }
        }

        // --- TRANSITION BURSTS DETECT ---
        if (hasShield && !_prevShield) {
            PerkFX.triggerActivationBurst(ctx, COLORS.YELLOW.num, FXParticleType.SHOCKWAVE);
        }
        if (hasAdrenaline && !_prevAdrenaline) {
            PerkFX.triggerActivationBurst(ctx, COLORS.GREEN.num, FXParticleType.FROST_NOVA);
        }
        if (hasGibMaster && !_prevGibMaster) {
            PerkFX.triggerActivationBurst(ctx, COLORS.PURPLE.num, FXParticleType.MAGNETIC_SPARKS);
        }

        _prevShield = hasShield;
        _prevAdrenaline = hasAdrenaline;
        _prevGibMaster = hasGibMaster;

        if (hasShield || hasAdrenaline || hasGibMaster) {
            if (!_shieldMesh.visible) {
                _shieldMesh.visible = true;
                _shieldMaterial.opacity = 0; // Fade in
            }

            // Priority Color.
            if (hasShield) {
                _shieldMaterial.color.setHex(COLORS.YELLOW.num);
                _shieldMaterial.opacity = THREE.MathUtils.lerp(_shieldMaterial.opacity, 0.4 + Math.sin(renderTime * 0.01) * 0.1, 10 * delta);
            } else if (hasGibMaster) {
                _shieldMaterial.color.setHex(COLORS.PURPLE.num);
                _shieldMaterial.opacity = THREE.MathUtils.lerp(_shieldMaterial.opacity, 0.5 + Math.sin(renderTime * 0.02) * 0.15, 10 * delta);
            } else if (hasAdrenaline) {
                _shieldMaterial.color.setHex(COLORS.GREEN.num);
                _shieldMaterial.opacity = THREE.MathUtils.lerp(_shieldMaterial.opacity, 0.3 + Math.sin(renderTime * 0.008) * 0.05, 10 * delta);
            }

            // Subtle scale pulse
            const pulse = 1.0 + Math.sin(renderTime * 0.015) * 0.02;
            _shieldMesh.scale.set(pulse, 1.0, pulse);
        } else {
            if (_shieldMesh.visible) {
                _shieldMaterial.opacity = THREE.MathUtils.lerp(_shieldMaterial.opacity, 0, 15 * delta);
                if (_shieldMaterial.opacity < 0.01) {
                    _shieldMesh.visible = false;
                }
            }
        }
    }
};
