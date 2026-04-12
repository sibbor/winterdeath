import * as THREE from 'three';
import { Enemy, AIState } from '../../entities/enemies/EnemyTypes';
import { EnemyAttackType } from '../../entities/player/CombatTypes';

const PI = Math.PI;
const HALF_PI = Math.PI * 0.5;

// Zero-GC Scratchpads
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export const EnemyAnimator = {
    /**
     * Procedural animation system for enemy movement and attacks.
     * Uses pure mathematics (sin/cos/lerp) to deform and translate the mesh.
     * 100% Zero-GC (No object allocations).
     */
    updateAttackAnim: (e: Enemy, simTime: number, renderTime: number, simDelta: number) => {
        const mesh = e.mesh;
        if (!mesh) return;

        // --- ZERO-GC STATE TRACKING ---
        if (!mesh.userData.startPos) mesh.userData.startPos = new THREE.Vector3();

        // Läs in targetPos som vi just satte i EnemyAttackHandler!
        const targetPos = mesh.userData.targetPos || _v2.set(mesh.position.x, mesh.position.y, mesh.position.z);

        if (e.state !== mesh.userData.lastState) {
            mesh.userData.lastState = e.state;
            mesh.userData.startPos.copy(mesh.position);
        }

        const baseY = mesh.userData.baseY || 0;
        const baseScale = e.originalScale || 1.0;
        const widthScale = e.widthScale || 1.0;

        let targetRotX = 0;
        let targetRotZ = 0;
        let targetPosY = baseY;
        let targetScaleX = baseScale * widthScale;
        let targetScaleY = baseScale;
        let targetScaleZ = baseScale * widthScale;

        let targetPosX = mesh.position.x;
        let targetPosZ = mesh.position.z;
        let hijackPhysics = false;

        const isAttacking = (e.state === AIState.ATTACK_CHARGE || e.state === AIState.ATTACKING);

        // --- PHASE 1 & 2: ATTACK LOGIC ---
        if (isAttacking && e.currentAttackIndex !== undefined && e.attacks) {
            const att = e.attacks[e.currentAttackIndex];

            if (att) {
                // --- PHASE 1: CHARGING THE ATTACK ---
                if (e.state === AIState.ATTACK_CHARGE && e.attackTimer !== undefined) {
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

                        case EnemyAttackType.JUMP:
                            targetScaleY = baseScale * (1.0 - 0.6 * progress);
                            targetScaleX = baseScale * widthScale * (1.0 + 0.4 * progress);
                            targetScaleZ = baseScale * widthScale * (1.0 + 0.4 * progress);
                            targetRotX = 0.4 * progress;
                            targetPosY = baseY - 0.3 * progress;
                            break;

                        case EnemyAttackType.SMASH:
                        case EnemyAttackType.FREEZE_JUMP:
                            targetRotX = -0.6 * progress;
                            targetScaleY = baseScale * (1.0 + 0.3 * progress);
                            targetPosY = baseY + 0.5 * progress;
                            break;

                        case EnemyAttackType.EXPLODE:
                            const swell = 1.0 + progress * 0.8;
                            targetScaleX = baseScale * widthScale * swell;
                            targetScaleY = baseScale * swell;
                            targetScaleZ = baseScale * widthScale * swell;
                            const shake = 0.2 * progress;
                            targetRotX += (Math.random() - 0.5) * shake;
                            targetRotZ += (Math.random() - 0.5) * shake;
                            break;

                        case EnemyAttackType.SCREECH:
                            targetRotX = -0.4 * progress;
                            targetScaleX = baseScale * widthScale * (1.0 + 0.25 * progress);
                            targetScaleZ = baseScale * widthScale * (1.0 + 0.25 * progress);
                            targetRotZ = (Math.random() - 0.5) * 0.2 * progress;
                            break;

                        case EnemyAttackType.ELECTRIC_BEAM:
                        case EnemyAttackType.MAGNETIC_CHAIN:
                            targetPosY = baseY + 1.0 * progress;
                            targetPosY += Math.sin(renderTime * 0.01) * 0.2 * progress;
                            targetScaleY = baseScale * (1.0 + 0.2 * progress);
                            break;
                    }

                    if (e.indicatorRing) {
                        if (att.radius) {
                            e.indicatorRing.visible = true;
                            e.indicatorRing.matrixAutoUpdate = true;
                            e.indicatorRing.position.set(0, -targetPosY + 0.05, 0);
                            const safeScaleX = Math.max(0.01, targetScaleX);
                            e.indicatorRing.scale.setScalar(att.radius / safeScaleX);

                            const flashFreq = 5.0 + (progress * progress * 40.0);
                            const pulse = Math.sin(renderTime * 0.01 * flashFreq) * 0.5 + 0.5;
                            if (e.indicatorRing.material) {
                                const mat = e.indicatorRing.material as any;
                                mat.opacity = 0.3 + progress * 0.6;
                                mat.color.setHex(pulse > 0.5 ? 0xffffff : 0xff0000);
                            }
                        } else {
                            e.indicatorRing.visible = false;
                            e.indicatorRing.matrixAutoUpdate = false;
                        }
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

                            hijackPhysics = true;
                            targetPosX = THREE.MathUtils.lerp(mesh.userData.startPos.x, targetPos.x, swing * 0.2);
                            targetPosZ = THREE.MathUtils.lerp(mesh.userData.startPos.z, targetPos.z, swing * 0.2);
                            break;

                        case EnemyAttackType.BITE:
                            const biteSwing = Math.sin(progress * PI);
                            targetRotX = 0.7 * biteSwing;
                            targetScaleY = baseScale * (1.0 + 0.2 * biteSwing);

                            hijackPhysics = true;
                            _v1.subVectors(mesh.userData.startPos, targetPos).normalize().multiplyScalar(e.attackOffset);
                            _v2.copy(targetPos).add(_v1);

                            const latchProgress = Math.min(1.0, progress * 4.0);
                            targetPosX = THREE.MathUtils.lerp(mesh.userData.startPos.x, _v2.x, latchProgress);
                            targetPosZ = THREE.MathUtils.lerp(mesh.userData.startPos.z, _v2.z, latchProgress);
                            break;

                        case EnemyAttackType.JUMP:
                            const leapArc = Math.sin(progress * PI);
                            targetPosY = baseY + leapArc * 3.5;
                            targetRotX = 0.6;
                            targetScaleY = baseScale * (1.0 + leapArc * 0.4);

                            hijackPhysics = true;

                            // VINTERDÖD: Prevent overlap! 
                            // Calculate a landing offset so the enemy lands in front of the player
                            // Based on player width (0.5) + enemy radius, +0.5 for a clean leap gap
                            _v1.subVectors(mesh.userData.startPos, targetPos).normalize().multiplyScalar(e.attackOffset + 0.5);
                            _v2.copy(targetPos).add(_v1); // Target is now dynamic based on body sizes

                            targetPosX = THREE.MathUtils.lerp(mesh.userData.startPos.x, _v2.x, progress);
                            targetPosZ = THREE.MathUtils.lerp(mesh.userData.startPos.z, _v2.z, progress);
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

                        case EnemyAttackType.EXPLODE:
                            targetScaleX = baseScale * widthScale * 1.8;
                            targetScaleY = baseScale * 1.8;
                            targetScaleZ = baseScale * widthScale * 1.8;
                            targetRotX += (Math.random() - 0.5) * 0.4;
                            targetRotZ += (Math.random() - 0.5) * 0.4;
                            break;

                        case EnemyAttackType.ELECTRIC_BEAM:
                        case EnemyAttackType.MAGNETIC_CHAIN:
                            targetPosY = baseY + 1.0 + Math.sin(renderTime * 0.03) * 0.3;
                            const pulse = 1.0 + Math.sin(renderTime * 0.08) * 0.1;
                            targetScaleX = baseScale * widthScale * pulse;
                            targetScaleY = baseScale * pulse;
                            targetScaleZ = baseScale * widthScale * pulse;
                            break;
                    }
                }
            }
        }

        // --- PHASE 3: ZOMBIE WALK CYCLE & DEFAULT STATE ---
        else {
            if (e.indicatorRing) {
                e.indicatorRing.visible = false;
                e.indicatorRing.matrixAutoUpdate = false;
            }

            const isMoving = e.state === AIState.CHASE || e.state === AIState.WANDER;
            const isGrappling = e.state === AIState.GRAPPLE;

            if (isGrappling) {
                // VINTERDÖD: Respect the pendulum swing calculated in AI
                targetRotX = mesh.userData.swingX || 0;
                targetRotZ = mesh.userData.swingZ || 0;
                targetScaleY = baseScale * 1.05; // Slight stretch while hanging
                targetPosY = mesh.position.y; // Keep current Y from AI displacement
            }
            else if (isMoving) {
                const phaseOffset = mesh.position.x + mesh.position.z;
                const speedFactor = (e.speed || 20.0) / 20.0;
                const t = (renderTime * 0.008 * speedFactor) + phaseOffset;

                targetRotX = 0.15;
                targetRotZ = Math.sin(t) * 0.18;
                targetPosY = baseY + Math.abs(Math.sin(t)) * 0.15;
            } else {
                const idleT = renderTime * 0.002 + (mesh.position.x);
                targetScaleY = baseScale * (1.0 + Math.sin(idleT) * 0.02);
            }
        }

        // --- APPLY TRANSFORMS (SMOOTH LERPING) ---

        let currentRotX = mesh.userData.animRotX || 0;
        let currentRotZ = mesh.userData.animRotZ || 0;

        currentRotX += (targetRotX - currentRotX) * 15 * simDelta;
        currentRotZ += (targetRotZ - currentRotZ) * 15 * simDelta;

        mesh.userData.animRotX = currentRotX;
        mesh.userData.animRotZ = currentRotZ;

        mesh.rotation.x = currentRotX;
        mesh.rotation.z = currentRotZ;

        mesh.scale.x += (targetScaleX - mesh.scale.x) * 15 * simDelta;
        mesh.scale.y += (targetScaleY - mesh.scale.y) * 15 * simDelta;
        mesh.scale.z += (targetScaleZ - mesh.scale.z) * 15 * simDelta;

        // 3. Position (Y & Hijacked X/Z)
        if (hijackPhysics) {
            mesh.position.x = targetPosX;
            mesh.position.z = targetPosZ;
        }

        if (isAttacking) {
            const att = e.attacks![e.currentAttackIndex!];
            if (e.state === AIState.ATTACK_CHARGE || (att && (att.type === EnemyAttackType.JUMP || att.type === EnemyAttackType.SMASH || att.type === EnemyAttackType.MAGNETIC_CHAIN || att.type === EnemyAttackType.ELECTRIC_BEAM))) {
                mesh.position.y = targetPosY;
            } else {
                mesh.position.y += (targetPosY - mesh.position.y) * 10 * simDelta;
            }
        } else {
            mesh.position.y += (targetPosY - mesh.position.y) * 15 * simDelta;
        }

        if (e.mesh.userData.isFlashing && (renderTime - (e.hitRenderTime || 0)) < 200) {
            const jitter = 0.15;
            mesh.rotation.x += (Math.random() - 0.5) * jitter;
            mesh.rotation.z += (Math.random() - 0.5) * jitter;
        }
    }
};