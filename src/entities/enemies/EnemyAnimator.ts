import * as THREE from 'three';
import { Enemy, AIState } from '../../entities/enemies/EnemyTypes';
import { EnemyAttackType } from '../../entities/player/CombatTypes';

export const EnemyAnimator = {
    /**
     * Procedural animation system for enemy attacks.
     * Uses pure mathematics (sin/cos/lerp) to deform and rotate the mesh.
     * 100% Zero-GC (No object allocations).
     */
    updateAttackAnim: (e: Enemy, now: number, delta: number) => {
        const mesh = e.mesh;
        if (!mesh || e.currentAttackIndex === undefined || !e.attacks) return;

        const att = e.attacks[e.currentAttackIndex];
        if (!att) return;

        const baseY = mesh.userData.baseY || 0;
        const baseScale = e.originalScale || 1.0;
        const widthScale = e.widthScale || 1.0;

        // Base target values
        let targetRotX = 0;
        let targetRotZ = 0;
        let targetPosY = baseY;
        let targetScaleX = baseScale * widthScale;
        let targetScaleY = baseScale;
        let targetScaleZ = baseScale * widthScale;

        // --- HIDE INDICATOR BY DEFAULT ---
        if (e.indicatorRing && e.state !== AIState.ATTACK_CHARGE) {
            e.indicatorRing.visible = false;
        }

        // --- PHASE 1: CHARGING THE ATTACK ---
        if (e.state === AIState.ATTACK_CHARGE && e.attackTimer !== undefined) {
            const totalCharge = (att.chargeTime || 1000) / 1000;
            // Calculate normalized progress (0.0 to 1.0)
            const progress = totalCharge > 0 ? Math.min(1.0, Math.max(0, 1.0 - (e.attackTimer / totalCharge))) : 1.0;

            switch (att.type) {
                case EnemyAttackType.HIT:
                case EnemyAttackType.BITE:
                    // Wind up: lean back and compress slightly
                    targetRotX = -0.4 * progress;
                    targetScaleY = baseScale * (1.0 - 0.1 * progress);
                    break;

                case EnemyAttackType.SMASH:
                case EnemyAttackType.FREEZE_JUMP:
                    // Heavy wind up: rear up, stretch high
                    targetRotX = -0.6 * progress;
                    targetScaleY = baseScale * (1.0 + 0.3 * progress);
                    targetPosY = baseY + 0.5 * progress;
                    break;

                case EnemyAttackType.JUMP:
                    // Squat down before leaping
                    targetScaleY = baseScale * (1.0 - 0.4 * progress);
                    targetScaleX = baseScale * widthScale * (1.0 + 0.3 * progress);
                    targetScaleZ = baseScale * widthScale * (1.0 + 0.3 * progress);
                    targetPosY = baseY - 0.2 * progress;
                    break;

                case EnemyAttackType.SCREECH:
                    // Inhale: puff up chest, lean back
                    targetRotX = -0.3 * progress;
                    targetScaleX = baseScale * widthScale * (1.0 + 0.2 * progress);
                    targetScaleZ = baseScale * widthScale * (1.0 + 0.2 * progress);
                    break;

                case EnemyAttackType.EXPLODE:
                    // Swell up and violently shake
                    const swell = 1.0 + progress * 0.8;
                    targetScaleX = baseScale * widthScale * swell;
                    targetScaleY = baseScale * swell;
                    targetScaleZ = baseScale * widthScale * swell;

                    const shake = 0.05 * progress;
                    mesh.position.x += (Math.random() - 0.5) * shake;
                    mesh.position.z += (Math.random() - 0.5) * shake;

                    // --- VISUAL TELEGRAPHING (Indicator Ring) ---
                    if (e.indicatorRing) {
                        e.indicatorRing.visible = true;
                        e.indicatorRing.matrixAutoUpdate = true;
                        // Keep ring on the ground
                        e.indicatorRing.position.set(0, -targetPosY + 0.05, 0);

                        const targetRadius = (att.radius || 10.0);
                        // Counter-act the parent mesh scale to ensure the ring matches exact world radius
                        e.indicatorRing.scale.setScalar(targetRadius / targetScaleX);

                        const flashSpeed = progress * 30;
                        const pulse = 0.5 + 0.5 * Math.sin(now * 0.01 * flashSpeed);
                        if (e.indicatorRing.material) {
                            const mat = e.indicatorRing.material as any;
                            mat.opacity = 0.3 + progress * 0.6;
                            mat.color.setHex(pulse > 0.5 ? 0xffffff : 0xff0000);
                        }
                    }
                    break;

                case EnemyAttackType.ELECTRIC_BEAM:
                case EnemyAttackType.MAGNETIC_CHAIN:
                    // Boss logic: Float up and gather energy
                    targetPosY = baseY + 1.0 * progress;
                    targetPosY += Math.sin(now * 0.01) * 0.2 * progress; // Add subtle bobbing
                    break;
            }
        }

        // --- PHASE 2: EXECUTING THE ATTACK ---
        else if (e.state === AIState.ATTACKING && e.attackTimer !== undefined) {
            const totalActive = (att.activeTime || 500) / 1000;
            const progress = totalActive > 0 ? Math.min(1.0, Math.max(0, 1.0 - (e.attackTimer / totalActive))) : 1.0;

            switch (att.type) {
                case EnemyAttackType.HIT:
                case EnemyAttackType.BITE:
                    // Snap forward and recover (Sin wave from 0 -> 1 -> 0)
                    const strike = Math.sin(progress * Math.PI);
                    targetRotX = 0.6 * strike; // Lean heavily forward
                    targetPosY = baseY + 0.2 * strike; // Slight forward hop
                    break;

                case EnemyAttackType.SMASH:
                case EnemyAttackType.FREEZE_JUMP:
                    if (progress < 0.2) {
                        // Very fast slam down (0 to 20% of the animation)
                        const slam = progress / 0.2;
                        targetRotX = -0.6 + (1.4 * slam); // Rapidly go from -0.6 to +0.8
                        targetPosY = baseY + 0.5 * (1.0 - slam);
                    } else {
                        // Slow recovery (20% to 100%)
                        const recover = (progress - 0.2) / 0.8;
                        targetRotX = 0.8 * (1.0 - recover);
                    }
                    break;

                case EnemyAttackType.JUMP:
                    // Parabolic leap through the air
                    const leapArc = Math.sin(progress * Math.PI);
                    targetPosY = baseY + leapArc * 3.0; // Max jump height
                    targetRotX = progress * Math.PI * 2; // Full front flip
                    break;

                case EnemyAttackType.SCREECH:
                    // Vibrate violently while screeching
                    targetRotX = -0.3; // Hold the lean back
                    mesh.position.x += (Math.random() - 0.5) * 0.15;
                    mesh.position.z += (Math.random() - 0.5) * 0.15;
                    break;

                case EnemyAttackType.EXPLODE:
                    // If still alive here (should be dead, but fallback), keep swelling
                    targetScaleX = baseScale * widthScale * 1.8;
                    targetScaleY = baseScale * 1.8;
                    targetScaleZ = baseScale * widthScale * 1.8;
                    break;

                case EnemyAttackType.ELECTRIC_BEAM:
                case EnemyAttackType.MAGNETIC_CHAIN:
                    // Hover in the air and pulse with energy
                    targetPosY = baseY + 1.0 + Math.sin(now * 0.015) * 0.3;
                    const pulse = 1.0 + Math.sin(now * 0.05) * 0.05;
                    targetScaleX = baseScale * widthScale * pulse;
                    targetScaleY = baseScale * pulse;
                    targetScaleZ = baseScale * widthScale * pulse;
                    break;
            }
        }

        // --- APPLY TRANSFORMS ---
        mesh.rotation.x = targetRotX;
        mesh.rotation.z = targetRotZ;
        mesh.scale.set(targetScaleX, targetScaleY, targetScaleZ);
        mesh.position.y = targetPosY;
    }
};