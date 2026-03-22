import * as THREE from 'three';
import { System } from '../../systems/System';
import { CampWorld, CampEffectsState } from './CampWorld';
import { PlayerAnimator } from '../../entities/player/PlayerAnimator';
import { soundManager } from '../../utils/SoundManager';
import { t } from '../../utils/i18n';
import { CHATTER_LINES } from '../../content/constants';

/**
 * Wraps CampWorld effects (Fire, Smoke, Stars, Wind)
 */
export class CampEffectsSystem implements System {
    id = 'camp_effects';
    enabled = true;

    update(ctx: any, dt: number, now: number): void {
        const { scene, envState, frameCount } = ctx;
        if (envState) {
            CampWorld.updateEffects(scene, envState, dt, now, frameCount);
        }
    }
}

/**
 * Handles Family Member animations and highlights
 */
export class FamilyAnimationSystem implements System {
    id = 'family_anim';
    enabled = true;

    update(ctx: any, dt: number, now: number): void {
        const { familyMembers, activeChats, frameCount, hoveredId } = ctx;

        for (let i = 0; i < familyMembers.length; i++) {
            const fm = familyMembers[i];
            let isSpeaking = fm.bounce > 0;

            if (!isSpeaking) {
                for (let j = 0; j < activeChats.length; j++) {
                    const c = activeChats[j];
                    if (c.mesh.uuid === fm.mesh.uuid && now >= c.startTime && now <= c.startTime + c.duration) {
                        isSpeaking = true;
                        break;
                    }
                }
            }

            if (fm.bounce > 0) {
                fm.bounce -= 0.02 * (dt / 0.016);
                if (fm.bounce < 0) fm.bounce = 0;
            }

            PlayerAnimator.update(fm.mesh as any, {
                isMoving: false, isRushing: false, isRolling: false, rollStartTime: 0, staminaRatio: 1.0,
                isSpeaking, isThinking: false, isIdleLong: now > 5000, seed: fm.seed
            }, now, dt);

            const isHov = hoveredId === (fm.mesh.userData.id);
            const emissiveIntensity = isHov ? 0.5 + Math.sin(frameCount * 0.2) * 0.5 : 0;

            for (let j = 0; j < fm.emissiveMaterials.length; j++) {
                const mat = fm.emissiveMaterials[j];
                mat.emissive.setHex(0xaaaaaa);
                mat.emissiveIntensity = emissiveIntensity;
            }
        }
    }
}

/**
 * Handles automatic chatter and ambient wildlife sounds
 */
export class CampChatterSystem implements System {
    id = 'camp_chatter';
    enabled = true;

    update(ctx: any, dt: number, now: number): void {
        const { isRunning, nextChatterTime, nextWildlifeTime, familyMembers, activeMembers, chatOverlay, activeChats, camera, container } = ctx;
        if (!isRunning) return;

        // 1. Ambient Wildlife
        if (now > nextWildlifeTime.val) {
            if (Math.random() > 0.5) soundManager.playOwlHoot();
            nextWildlifeTime.set(now + 30000 + Math.random() * 60000);
        }

        // 2. Chatter Generation
        if (now > nextChatterTime.val && activeMembers.length > 1) {
            const numSpeakers = 1 + Math.floor(Math.random() * 2.5);
            let delayOffset = 0;
            for (let i = 0; i < numSpeakers; i++) {
                const speaker = familyMembers[Math.floor(Math.random() * familyMembers.length)];
                const linesKey = (speaker.name || '').toLowerCase();
                let lines = t(`chatter.${linesKey}`) as unknown as string[];
                if (!Array.isArray(lines)) lines = CHATTER_LINES[speaker.name] || ["..."];

                const text = lines[Math.floor(Math.random() * lines.length)];
                const duration = 2000 + text.length * 60;

                const el = document.createElement('div');
                el.className = 'absolute bg-black/80 border-2 border-black text-white px-4 py-2 text-sm font-bold rounded-lg pointer-events-none opacity-0 transition-opacity duration-500 whitespace-normal z-40 w-max max-w-[280px] text-center shadow-lg';
                el.innerText = text;

                if (chatOverlay) {
                    chatOverlay.appendChild(el);
                    // Sätt initial transform för att undvika layout thrashing
                    el.style.transform = 'translate3d(-50%, -100%, 0)';

                    activeChats.push({
                        id: `chat_${now}_${i}`,
                        mesh: speaker.mesh,
                        text,
                        startTime: now + delayOffset,
                        duration,
                        element: el,
                        playedSound: false,
                        _lastX: -9999, // NYTT: Cache för X-position
                        _lastY: -9999  // NYTT: Cache för Y-position
                    });
                    delayOffset += duration + 500;
                }
            }
            nextChatterTime.set(now + delayOffset + 10000 + Math.random() * 20000);
        }

        // 2. Chat Bubble Positioning & Expiry
        const _v1 = new THREE.Vector3();
        for (let i = activeChats.length - 1; i >= 0; i--) {
            const c = activeChats[i];
            if (now > c.startTime + c.duration) {
                if (c.element.parentNode) c.element.parentNode.removeChild(c.element);
                activeChats[i] = activeChats[activeChats.length - 1];
                activeChats.pop();
            }

            else if (now >= c.startTime) {
                if (!c.playedSound) {
                    c.playedSound = true;
                    soundManager.playUiConfirm();
                }

                // 1. Opacity - update only if it actually changes
                const targetOpacity = now < c.startTime + 500 ? String((now - c.startTime) / 500) : (now > c.startTime + c.duration - 500 ? String((c.startTime + c.duration - now) / 500) : '1');
                if (c.element.style.opacity !== targetOpacity) {
                    c.element.style.opacity = targetOpacity;
                }

                // 2. Positioning (Hardware accelerated & Zero-GC)
                const vec = _v1;
                c.mesh.getWorldPosition(vec);
                vec.y += 2.2;
                vec.project(camera);

                const width = container.clientWidth;
                const height = container.clientHeight;

                // Round to nearest pixel to avoid blurry text and unnecessary DOM updates
                const px = Math.round((vec.x * 0.5 + 0.5) * width);
                const py = Math.round((-(vec.y * 0.5) + 0.5) * height);

                // Update DOM ONLY if the bubble has moved at least 1 pixel since the last frame
                if (px !== c._lastX || py !== c._lastY) {
                    c._lastX = px;
                    c._lastY = py;
                    // Use translate3d (GPU) instead of left/top (CPU)
                    c.element.style.transform = `translate3d(calc(-50% + ${px}px), calc(-100% + ${py}px), 0)`;
                }
            }
        }
    }
}