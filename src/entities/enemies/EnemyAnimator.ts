import * as THREE from 'three';
import { Enemy, AIState } from '../../entities/enemies/EnemyTypes';
import { EnemyAttackType } from '../../entities/player/CombatTypes';

const PI = Math.PI;
const HALF_PI = Math.PI * 0.5;

export const EnemyAnimator = {
    /**
     * Procedural animation system for enemy attacks.
     * Uses pure mathematics (sin/cos/lerp) to deform and rotate the mesh.
     * 100% Zero-GC (No object allocations).
     */
    updateAttackAnim: (e: Enemy, now: number, delta: number) => {
        const mesh = e.mesh;
        if (!mesh) return;

        const baseY = mesh.userData.baseY || 0;
        const baseScale = e.originalScale || 1.0;
        const widthScale = e.widthScale || 1.0;

        // Base target values (Default posture)
        let targetRotX = 0;
        let targetRotZ = 0;
        let targetPosY = baseY;
        let targetScaleX = baseScale * widthScale;
        let targetScaleY = baseScale;
        let targetScaleZ = baseScale * widthScale;

        const isAttacking = (e.state === AIState.ATTACK_CHARGE || e.state === AIState.ATTACKING);

        // --- ATTACK LOGIC ---
        if (isAttacking && e.currentAttackIndex !== undefined && e.attacks) {
            const att = e.attacks[e.currentAttackIndex];

            if (att) {
                // --- PHASE 1: CHARGING THE ATTACK ---
                if (e.state === AIState.ATTACK_CHARGE && e.attackTimer !== undefined) {
                    // Optimization: Multiply by 0.001 instead of dividing by 1000
                    const totalCharge = (att.chargeTime || 1000) * 0.001;
                    const progress = totalCharge > 0 ? Math.min(1.0, Math.max(0, 1.0 - (e.attackTimer / totalCharge))) : 1.0;

                    switch (att.type) {
                        case EnemyAttackType.HIT:
                            targetRotX = -0.3 * progress;
                            targetRotZ = 0.3 * Math.sin(progress * HALF_PI);
                            targetScaleY = baseScale * (1.0 - 0.1 * progress);
                            break;

                        case EnemyAttackType.BITE:
                            targetRotX = -0.4 * progress;
                            targetScaleX = baseScale * widthScale * (1.0 + 0.15 * progress);
                            break;

                        case EnemyAttackType.SMASH:
                        case EnemyAttackType.FREEZE_JUMP:
                            targetRotX = -0.6 * progress;
                            targetScaleY = baseScale * (1.0 + 0.3 * progress);
                            targetScaleX = baseScale * widthScale * (1.0 + 0.2 * progress);
                            targetPosY = baseY + 0.5 * progress;
                            break;

                        case EnemyAttackType.JUMP:
                            targetScaleY = baseScale * (1.0 - 0.6 * progress);
                            targetScaleX = baseScale * widthScale * (1.0 + 0.4 * progress);
                            targetScaleZ = baseScale * widthScale * (1.0 + 0.4 * progress);
                            targetRotX = 0.2 * progress;
                            targetPosY = baseY - 0.3 * progress;
                            break;

                        case EnemyAttackType.SCREECH:
                            targetRotX = -0.4 * progress;
                            targetScaleX = baseScale * widthScale * (1.0 + 0.25 * progress);
                            targetScaleZ = baseScale * widthScale * (1.0 + 0.25 * progress);
                            // Visual jitter applied to rotation to prevent physics drifting
                            targetRotZ = (Math.random() - 0.5) * 0.2 * progress;
                            break;

                        case EnemyAttackType.EXPLODE:
                            const swell = 1.0 + progress * 0.8;
                            targetScaleX = baseScale * widthScale * swell;
                            targetScaleY = baseScale * swell;
                            targetScaleZ = baseScale * widthScale * swell;

                            // Visual jitter applied to rotation to prevent physics drifting
                            const shake = 0.2 * progress;
                            targetRotX += (Math.random() - 0.5) * shake;
                            targetRotZ += (Math.random() - 0.5) * shake;

                            // --- VISUAL TELEGRAPHING (Indicator Ring) ---
                            if (e.indicatorRing) {
                                e.indicatorRing.visible = true;
                                e.indicatorRing.matrixAutoUpdate = true;
                                e.indicatorRing.position.set(0, -targetPosY + 0.05, 0);

                                // Safe division to prevent Infinity scaling crash
                                const safeScaleX = Math.max(0.01, targetScaleX);
                                const targetRadius = (att.radius || 10.0);
                                e.indicatorRing.scale.setScalar(targetRadius / safeScaleX);

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
                            targetPosY = baseY + 1.0 * progress;
                            targetPosY += Math.sin(now * 0.01) * 0.2 * progress;
                            targetScaleY = baseScale * (1.0 + 0.2 * progress);
                            break;
                    }
                }

                // --- PHASE 2: EXECUTING THE ATTACK ---
                else if (e.state === AIState.ATTACKING && e.attackTimer !== undefined) {
                    const totalActive = (att.activeTime || 500) * 0.001;
                    const progress = totalActive > 0 ? Math.min(1.0, Math.max(0, 1.0 - (e.attackTimer / totalActive))) : 1.0;

                    switch (att.type) {
                        case EnemyAttackType.HIT:
                            const swing = Math.sin(progress * PI);
                            targetRotX = 0.4 * swing;
                            targetRotZ = -0.5 * swing;
                            break;

                        case EnemyAttackType.BITE:
                            const bite = Math.sin(progress * PI);
                            targetRotX = 0.7 * bite;
                            targetPosY = baseY + 0.2 * bite;
                            targetScaleY = baseScale * (1.0 + 0.2 * bite);
                            break;

                        case EnemyAttackType.SMASH:
                        case EnemyAttackType.FREEZE_JUMP:
                            if (progress < 0.2) {
                                const slam = progress * 5.0;
                                targetRotX = -0.6 + (1.4 * slam);
                                targetPosY = baseY + 0.5 * (1.0 - slam);
                                targetScaleY = baseScale * (1.0 - 0.2 * slam);
                            } else {
                                const recover = (progress - 0.2) * 1.25;
                                targetRotX = 0.8 * (1.0 - recover);
                            }
                            break;

                        case EnemyAttackType.JUMP:
                            const leapArc = Math.sin(progress * PI);
                            targetPosY = baseY + leapArc * 2.5;
                            targetRotX = 0.6;
                            targetScaleY = baseScale * (1.0 + leapArc * 0.4);
                            break;

                        case EnemyAttackType.SCREECH:
                            targetRotX = -0.3;
                            targetRotZ = (Math.random() - 0.5) * 0.2;
                            targetScaleX = baseScale * widthScale * (1.0 + 0.1 * Math.sin(now * 0.05));
                            break;

                        case EnemyAttackType.EXPLODE:
                            targetScaleX = baseScale * widthScale * 1.8;
                            targetScaleY = baseScale * 1.8;
                            targetScaleZ = baseScale * widthScale * 1.8;
                            targetRotX += (Math.random() - 0.5) * 0.4;
                            targetRotZ += (Math.random() - 0.5) * 0.4;
                            break;

                        case EnemyAttackType.ELECTRIC_BEAM:
                        case EnemyAttackType.MAGNETIC_CHAIN:
                            targetPosY = baseY + 1.0 + Math.sin(now * 0.03) * 0.3;
                            const pulse = 1.0 + Math.sin(now * 0.08) * 0.1;
                            targetScaleX = baseScale * widthScale * pulse;
                            targetScaleY = baseScale * pulse;
                            targetScaleZ = baseScale * widthScale * pulse;
                            break;
                    }
                }
            }
        }
        // --- PHASE 3: RECOVERY / DEFAULT STATE ---
        else {
            if (e.indicatorRing) e.indicatorRing.visible = false;

            // We let the logic fall through to smoothly lerp the scale back to normal.
            // Rotation targets are already 0.
        }

        // --- APPLY TRANSFORMS (SMOOTH LERPING) ---

        // 1. Independent Rotation State (Solves the EnemyAI 'lookAt' conflict)
        let currentRotX = mesh.userData.animRotX || 0;
        let currentRotZ = mesh.userData.animRotZ || 0;

        currentRotX += (targetRotX - currentRotX) * 15 * delta;
        currentRotZ += (targetRotZ - currentRotZ) * 15 * delta;

        mesh.userData.animRotX = currentRotX;
        mesh.userData.animRotZ = currentRotZ;

        // Apply our smoothed X and Z rotations ON TOP of the Y rotation from lookAt
        mesh.rotation.x = currentRotX;
        mesh.rotation.z = currentRotZ;

        // 2. Scale Healing
        mesh.scale.x += (targetScaleX - mesh.scale.x) * 15 * delta;
        mesh.scale.y += (targetScaleY - mesh.scale.y) * 15 * delta;
        mesh.scale.z += (targetScaleZ - mesh.scale.z) * 15 * delta;

        // 3. Position Y (Only override physics during jump/smash attacks)
        if (isAttacking) {
            const att = e.attacks![e.currentAttackIndex!];
            if (e.state === AIState.ATTACK_CHARGE || (att && (att.type === EnemyAttackType.JUMP || att.type === EnemyAttackType.SMASH || att.type === EnemyAttackType.MAGNETIC_CHAIN || att.type === EnemyAttackType.ELECTRIC_BEAM))) {
                mesh.position.y = targetPosY;
            } else {
                mesh.position.y += (targetPosY - mesh.position.y) * 10 * delta;
            }
        }
        // If not attacking, EnemyAI's 'moveEntity' will handle the ground bouncing automatically!
    }
};