import * as THREE from 'three';
import { Enemy, AIState, EnemyFlags } from '../../entities/enemies/EnemyTypes';
import { EnemyAttackType } from '../../entities/player/CombatTypes';

const PI = Math.PI;
const HALF_PI = Math.PI * 0.5;

// Zero-GC Scratchpads
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// --- SHARED ANIMATION STATE ---
// V8 optimizes this monomorphic object, acting as a high-performance struct.
// Eliminates parameter passing overhead and object instantiation (Zero-GC).
const _animState = {
    targetRotX: 0,
    targetRotZ: 0,
    targetPosY: 0,
    targetScaleX: 1,
    targetScaleY: 1,
    targetScaleZ: 1,
    targetPosX: 0,
    targetPosZ: 0,
    hijackPhysics: false,
    baseScale: 1,
    widthScale: 1,
    baseY: 0,
    progress: 0,
    renderTime: 0,
    startPos: _v1 // Reference initialized later
};

type AnimHandler = (e: Enemy, targetPos: THREE.Vector3) => void;

// --- JUMP TABLES (O(1) Lookup) ---
// Pre-allocating max expected size avoids V8 array deoptimization
const MAX_ATTACKS = 20;
const _chargeHandlers: AnimHandler[] = new Array(MAX_ATTACKS).fill(null);
const _executeHandlers: AnimHandler[] = new Array(MAX_ATTACKS).fill(null);

// ==========================================
// SPECIFIC ATTACK ANIMATION HANDLERS
// ==========================================

// --- HIT ---
_chargeHandlers[EnemyAttackType.HIT] = () => {
    _animState.targetRotX = -0.3 * _animState.progress;
    _animState.targetRotZ = 0.3 * Math.sin(_animState.progress * HALF_PI);
    _animState.targetScaleY = _animState.baseScale * (1.0 - 0.1 * _animState.progress);
};
_executeHandlers[EnemyAttackType.HIT] = (e, targetPos) => {
    const swing = Math.sin(_animState.progress * PI);
    _animState.targetRotX = 0.4 * swing;
    _animState.targetRotZ = -0.5 * swing;

    _animState.hijackPhysics = true;
    _animState.targetPosX = THREE.MathUtils.lerp(_animState.startPos.x, targetPos.x, swing * 0.2);
    _animState.targetPosZ = THREE.MathUtils.lerp(_animState.startPos.z, targetPos.z, swing * 0.2);
};

// --- BITE ---
_chargeHandlers[EnemyAttackType.BITE] = () => {
    _animState.targetRotX = -0.4 * _animState.progress;
    _animState.targetScaleX = _animState.baseScale * _animState.widthScale * (1.0 + 0.15 * _animState.progress);
};
_executeHandlers[EnemyAttackType.BITE] = (e, targetPos) => {
    const biteSwing = Math.sin(_animState.progress * PI);
    _animState.targetRotX = 0.7 * biteSwing;
    _animState.targetScaleY = _animState.baseScale * (1.0 + 0.2 * biteSwing);

    _animState.hijackPhysics = true;
    _v1.subVectors(_animState.startPos, targetPos).normalize().multiplyScalar(e.attackOffset);
    _v2.copy(targetPos).add(_v1);

    const latchProgress = Math.min(1.0, _animState.progress * 4.0);
    _animState.targetPosX = THREE.MathUtils.lerp(_animState.startPos.x, _v2.x, latchProgress);
    _animState.targetPosZ = THREE.MathUtils.lerp(_animState.startPos.z, _v2.z, latchProgress);
};

// --- JUMP ---
_chargeHandlers[EnemyAttackType.JUMP] = () => {
    _animState.targetScaleY = _animState.baseScale * (1.0 - 0.6 * _animState.progress);
    _animState.targetScaleX = _animState.baseScale * _animState.widthScale * (1.0 + 0.4 * _animState.progress);
    _animState.targetScaleZ = _animState.baseScale * _animState.widthScale * (1.0 + 0.4 * _animState.progress);
    _animState.targetRotX = 0.4 * _animState.progress;
    _animState.targetPosY = _animState.baseY - 0.3 * _animState.progress;
};
_executeHandlers[EnemyAttackType.JUMP] = (e, targetPos) => {
    const leapArc = Math.sin(_animState.progress * PI);
    _animState.targetPosY = _animState.baseY + leapArc * 3.5;
    _animState.targetRotX = 0.6;
    _animState.targetScaleY = _animState.baseScale * (1.0 + leapArc * 0.4);

    _animState.hijackPhysics = true;

    // Prevent overlap! Calculate a landing offset so the enemy lands in front of the player
    _v1.subVectors(_animState.startPos, targetPos).normalize().multiplyScalar(e.attackOffset + 0.5);
    _v2.copy(targetPos).add(_v1);

    _animState.targetPosX = THREE.MathUtils.lerp(_animState.startPos.x, _v2.x, _animState.progress);
    _animState.targetPosZ = THREE.MathUtils.lerp(_animState.startPos.z, _v2.z, _animState.progress);
};

// --- SMASH & FREEZE JUMP ---
const chargeSmashHandler: AnimHandler = () => {
    _animState.targetRotX = -0.6 * _animState.progress;
    _animState.targetScaleY = _animState.baseScale * (1.0 + 0.3 * _animState.progress);
    _animState.targetPosY = _animState.baseY + 0.5 * _animState.progress;
};
const executeSmashHandler: AnimHandler = () => {
    if (_animState.progress < 0.2) {
        const slam = _animState.progress * 5.0;
        _animState.targetRotX = -0.6 + (1.4 * slam);
        _animState.targetPosY = _animState.baseY + 0.5 * (1.0 - slam);
        _animState.targetScaleY = _animState.baseScale * (1.0 - 0.2 * slam);
    } else {
        const recover = (_animState.progress - 0.2) * 1.25;
        _animState.targetRotX = 0.8 * (1.0 - recover);
    }
};

_chargeHandlers[EnemyAttackType.SMASH] = chargeSmashHandler;
_chargeHandlers[EnemyAttackType.FREEZE_JUMP] = chargeSmashHandler;
_executeHandlers[EnemyAttackType.SMASH] = executeSmashHandler;
_executeHandlers[EnemyAttackType.FREEZE_JUMP] = executeSmashHandler;

// --- EXPLODE ---
_chargeHandlers[EnemyAttackType.EXPLODE] = () => {
    const swell = 1.0 + _animState.progress * 0.8;
    _animState.targetScaleX = _animState.baseScale * _animState.widthScale * swell;
    _animState.targetScaleY = _animState.baseScale * swell;
    _animState.targetScaleZ = _animState.baseScale * _animState.widthScale * swell;
    const shake = 0.2 * _animState.progress;
    _animState.targetRotX += (Math.random() - 0.5) * shake;
    _animState.targetRotZ += (Math.random() - 0.5) * shake;
};
_executeHandlers[EnemyAttackType.EXPLODE] = () => {
    _animState.targetScaleX = _animState.baseScale * _animState.widthScale * 1.8;
    _animState.targetScaleY = _animState.baseScale * 1.8;
    _animState.targetScaleZ = _animState.baseScale * _animState.widthScale * 1.8;
    _animState.targetRotX += (Math.random() - 0.5) * 0.4;
    _animState.targetRotZ += (Math.random() - 0.5) * 0.4;
};

// --- SCREECH ---
_chargeHandlers[EnemyAttackType.SCREECH] = () => {
    _animState.targetRotX = -0.4 * _animState.progress;
    _animState.targetScaleX = _animState.baseScale * _animState.widthScale * (1.0 + 0.25 * _animState.progress);
    _animState.targetScaleZ = _animState.baseScale * _animState.widthScale * (1.0 + 0.25 * _animState.progress);
    _animState.targetRotZ = (Math.random() - 0.5) * 0.2 * _animState.progress;
};
// Executing screech uses default handling or can be expanded if a physical reaction is needed.

// --- ELECTRIC BEAM & MAGNETIC CHAIN ---
const chargeBeamHandler: AnimHandler = () => {
    _animState.targetPosY = _animState.baseY + 1.0 * _animState.progress;
    _animState.targetPosY += Math.sin(_animState.renderTime * 0.01) * 0.2 * _animState.progress;
    _animState.targetScaleY = _animState.baseScale * (1.0 + 0.2 * _animState.progress);
};
const executeBeamHandler: AnimHandler = () => {
    _animState.targetPosY = _animState.baseY + 1.0 + Math.sin(_animState.renderTime * 0.03) * 0.3;
    const pulse = 1.0 + Math.sin(_animState.renderTime * 0.08) * 0.1;
    _animState.targetScaleX = _animState.baseScale * _animState.widthScale * pulse;
    _animState.targetScaleY = _animState.baseScale * pulse;
    _animState.targetScaleZ = _animState.baseScale * _animState.widthScale * pulse;
};

_chargeHandlers[EnemyAttackType.ELECTRIC_BEAM] = chargeBeamHandler;
_chargeHandlers[EnemyAttackType.MAGNETIC_CHAIN] = chargeBeamHandler;
_executeHandlers[EnemyAttackType.ELECTRIC_BEAM] = executeBeamHandler;
_executeHandlers[EnemyAttackType.MAGNETIC_CHAIN] = executeBeamHandler;


export const EnemyAnimator = {
    /**
     * Procedural animation system for enemy movement and attacks.
     * Uses pure mathematics (sin/cos/lerp) to deform and translate the mesh.
     * 100% Zero-GC (No object allocations).
     */
    updateAttackAnim: (e: Enemy, renderTime: number, simDelta: number) => {
        const mesh = e.mesh;
        if (!mesh) return;
        const state = e.state;
        const isAttacking = state === AIState.ATTACK_CHARGE || state === AIState.ATTACKING;
        const lastState = e.lastAIState;

        if (isAttacking && lastState !== state) {
            e.animStartPos.copy(e.mesh.position);
            e.lastAIState = state;
        }

        if (!isAttacking && lastState !== state) {
            e.lastAIState = state;
        }

        const hitDir = e.hitDir;
        const spinVel = e.spinVel;

        const isRagdoll = (e.statusFlags & EnemyFlags.RAGDOLLING) !== 0;

        if (isRagdoll) {
            const spinAmount = simDelta * 1.5;
            e.mesh.rotation.x += spinVel.x * spinAmount;
            e.mesh.rotation.y += spinVel.y * spinAmount;
            e.mesh.rotation.z += spinVel.z * spinAmount;

            spinVel.multiplyScalar(Math.pow(0.95, simDelta * 60));

            if (spinVel.lengthSq() < 0.01) {
                e.statusFlags &= ~EnemyFlags.RAGDOLLING;
            }
        }

        // Load targetPos that was just set in EnemyAttackHandler!
        const targetPos = e.targetPos || _v2.set(mesh.position.x, mesh.position.y, mesh.position.z);

        // Initialize state struct for this frame
        _animState.baseY = e.baseY || 0;
        _animState.baseScale = e.originalScale || 1.0;
        _animState.widthScale = e.widthScale || 1.0;
        _animState.renderTime = renderTime;
        _animState.startPos = e.animStartPos;

        _animState.targetRotX = 0;
        _animState.targetRotZ = 0;
        _animState.targetPosY = _animState.baseY;
        _animState.targetScaleX = _animState.baseScale * _animState.widthScale;
        _animState.targetScaleY = _animState.baseScale;
        _animState.targetScaleZ = _animState.baseScale * _animState.widthScale;

        _animState.targetPosX = mesh.position.x;
        _animState.targetPosZ = mesh.position.z;
        _animState.hijackPhysics = false;

        // --- PHASE 1 & 2: ATTACK LOGIC ---
        if (isAttacking && e.currentAttackIndex !== undefined && e.attacks) {
            const att = e.attacks[e.currentAttackIndex];

            if (att) {
                // --- PHASE 1: CHARGING THE ATTACK ---
                if (state === AIState.ATTACK_CHARGE && e.attackTimer !== undefined) {
                    const totalCharge = (att.chargeTime || 1000) * 0.001;
                    _animState.progress = totalCharge > 0 ? Math.min(1.0, Math.max(0, 1.0 - (e.attackTimer / totalCharge))) : 1.0;

                    const handler = _chargeHandlers[att.type];
                    if (handler) handler(e, targetPos);

                    // Indicator Ring handling
                    if (e.indicatorRing) {
                        if (att.radius) {
                            e.indicatorRing.visible = true;
                            e.indicatorRing.matrixAutoUpdate = true;
                            e.indicatorRing.position.set(0, -_animState.targetPosY + 0.2, 0);
                            const safeScaleX = Math.max(0.01, _animState.targetScaleX);
                            e.indicatorRing.scale.setScalar(att.radius / safeScaleX);

                            const flashFreq = 5.0 + (_animState.progress * _animState.progress * 40.0);
                            const pulse = Math.sin(renderTime * 0.01 * flashFreq) * 0.5 + 0.5;
                            if (e.indicatorRing.material) {
                                const mat = e.indicatorRing.material as any;
                                mat.opacity = 0.3 + _animState.progress * 0.6;
                                mat.color.setHex(pulse > 0.5 ? 0xffffff : 0xff0000);
                            }
                        } else {
                            e.indicatorRing.visible = false;
                            e.indicatorRing.matrixAutoUpdate = false;
                        }
                    }
                }

                // --- PHASE 2: EXECUTING THE ATTACK ---
                else if (state === AIState.ATTACKING && e.attackTimer !== undefined) {
                    const totalActive = (att.activeTime || 500) * 0.001;
                    _animState.progress = totalActive > 0 ? Math.min(1.0, Math.max(0, 1.0 - (e.attackTimer / totalActive))) : 1.0;

                    const handler = _executeHandlers[att.type];
                    if (handler) handler(e, targetPos);
                }
            }
        }

        // --- PHASE 3: WALK CYCLE & DEFAULT STATE ---
        else {
            if (e.indicatorRing) {
                e.indicatorRing.visible = false;
                e.indicatorRing.matrixAutoUpdate = false;
            }

            const isMoving = state === AIState.CHASE || state === AIState.WANDER;
            const isGrappling = state === AIState.GRAPPLE;

            if (isGrappling) {
                // Respect the pendulum swing calculated in AI
                _animState.targetRotX = e.swingX || 0;
                _animState.targetRotZ = e.swingZ || 0;
                _animState.targetScaleY = _animState.baseScale * 1.05; // Slight stretch while hanging
                _animState.targetPosY = mesh.position.y; // Keep current Y from AI displacement
            }
            else if (isMoving) {
                const phaseOffset = mesh.position.x + mesh.position.z;
                const speedFactor = (e.speed || 20.0) / 20.0;
                const t = (renderTime * 0.008 * speedFactor) + phaseOffset;

                // Hoisted Trig
                const sinT = Math.sin(t);
                const sinT2 = Math.sin(t * 2);

                _animState.targetRotX = 0.15;
                _animState.targetRotZ = sinT * 0.18;
                _animState.targetPosY = _animState.baseY + Math.abs(sinT) * 0.15;

                // Extra breathing detail while walking
                _animState.targetScaleY = _animState.baseScale * (1.0 + sinT2 * 0.02);
                _animState.targetScaleX = _animState.baseScale * _animState.widthScale * (1.0 - sinT2 * 0.015);
            } else {
                const idleT = renderTime * 0.002 + (mesh.position.x);
                const sinIdle = Math.sin(idleT);

                _animState.targetScaleY = _animState.baseScale * (1.0 + sinIdle * 0.02);
                // Breathe radially to feel more organic
                _animState.targetScaleX = _animState.baseScale * _animState.widthScale * (1.0 - sinIdle * 0.01);
                _animState.targetScaleZ = _animState.baseScale * _animState.widthScale * (1.0 - sinIdle * 0.01);
                
                const s = e.originalScale;
                e.baseY = THREE.MathUtils.lerp(e.baseY, 1.0 * s, 10 * simDelta);
                e.mesh.position.y = e.baseY;

                e.animRotX = THREE.MathUtils.lerp(e.animRotX, 0, 10 * simDelta);
                e.animRotZ = THREE.MathUtils.lerp(e.animRotZ, 0, 10 * simDelta);
                e.mesh.rotation.x = e.animRotX;
                e.mesh.rotation.z = e.animRotZ;
            }
        }

        // --- APPLY TRANSFORMS (SMOOTH LERPING) ---
        e.animRotX += (_animState.targetRotX - e.animRotX) * 15 * simDelta;
        e.animRotZ += (_animState.targetRotZ - e.animRotZ) * 15 * simDelta;

        mesh.rotation.x = e.animRotX;
        mesh.rotation.z = e.animRotZ;

        mesh.scale.x += (_animState.targetScaleX - mesh.scale.x) * 15 * simDelta;
        mesh.scale.y += (_animState.targetScaleY - mesh.scale.y) * 15 * simDelta;
        mesh.scale.z += (_animState.targetScaleZ - mesh.scale.z) * 15 * simDelta;

        // Position (Y & Hijacked X/Z)
        if (_animState.hijackPhysics) {
            mesh.position.x = _animState.targetPosX;
            mesh.position.z = _animState.targetPosZ;
        }

        if (isAttacking) {
            const att = e.attacks![e.currentAttackIndex!];
            const forceYPos = e.state === AIState.ATTACK_CHARGE || (att && (
                att.type === EnemyAttackType.JUMP ||
                att.type === EnemyAttackType.SMASH ||
                att.type === EnemyAttackType.MAGNETIC_CHAIN ||
                att.type === EnemyAttackType.ELECTRIC_BEAM
            ));

            if (forceYPos) {
                mesh.position.y = _animState.targetPosY;
            } else {
                mesh.position.y += (_animState.targetPosY - mesh.position.y) * 10 * simDelta;
            }
        } else {
            mesh.position.y += (_animState.targetPosY - mesh.position.y) * 15 * simDelta;
        }

        if ((e.statusFlags & EnemyFlags.FLASH_ACTIVE) && (renderTime - (e.hitRenderTime || 0)) < 200) {
            const jitter = 0.15;
            mesh.rotation.x += (Math.random() - 0.5) * jitter;
            mesh.rotation.z += (Math.random() - 0.5) * jitter;
        }
    }
};