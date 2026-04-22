import * as THREE from 'three';
import { System, SystemID } from '../../systems/System';
import { CampWorld } from './CampWorld';
import { PlayerAnimator } from '../../entities/player/PlayerAnimator';
import { UiSounds } from '../../utils/audio/AudioLib';
import { DataResolver } from '../../utils/ui/DataResolver';
import { audioEngine } from '../../utils/audio/AudioEngine';
import { SoundID } from '../../utils/audio/AudioTypes';

/**
 * Wraps CampWorld effects (Fire, Smoke, Stars, Wind)
 */
export class CampEffectsSystem implements System {
    readonly systemId = SystemID.CAMP_EFFECT_MANAGER;
    id = 'camp_effects';
    enabled = true;

    update(ctx: any, dt: number, simTime: number, renderTime: number): void {
        const { scene, envState } = ctx;
        if (envState) {
            CampWorld.updateEffects(scene, envState, dt, renderTime);
        }
    }
}

/**
 * Handles Family Member animations and highlights
 */
export class FamilyAnimationSystem implements System {
    readonly systemId = SystemID.FAMILY_ANIMATION;
    id = 'family_anim';
    enabled = true;

    update(ctx: any, dt: number, simTime: number, renderTime: number): void {
        const { familyMembers, activeChats, hoveredId } = ctx;
        if (!familyMembers) return;

        for (let i = 0; i < familyMembers.length; i++) {
            const fm = familyMembers[i];
            let isSpeaking = fm.bounce > 0;

            if (!isSpeaking) {
                for (let j = 0; j < activeChats.length; j++) {
                    const c = activeChats[j];
                    if (c.mesh.uuid === fm.mesh.uuid && renderTime >= c.startTime && renderTime <= c.startTime + c.duration) {
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
                isMoving: false, isRushing: false, isDodging: false, dodgeStartTime: 0, staminaRatio: 1.0,
                isSpeaking, isThinking: false, isIdleLong: renderTime > 5000, seed: fm.seed,
                renderTime: renderTime,
                simTime: simTime
            }, renderTime);

            const isHov = hoveredId === (fm.mesh.userData.id);
            const emissiveIntensity = isHov ? 0.5 + Math.sin(renderTime * 0.005) * 0.5 : 0;

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
    readonly systemId = SystemID.CAMP_CHATTER;
    id = 'camp_chatter';
    enabled = true;

    update(ctx: any, dt: number, simTime: number, renderTime: number): void {
        const { isGameRunning, nextChatterTime, nextWildlifeTime, familyMembers, activeMembers, chatOverlay, activeChats, camera, container } = ctx;
        if (!isGameRunning) return;

        // 1. Ambient Wildlife
        if (renderTime > nextWildlifeTime.val) {
            if (Math.random() > 0.5) audioEngine.playSound(SoundID.OWL_HOOT, 0.3);
            nextWildlifeTime.set(renderTime + 30000 + Math.random() * 60000);
        }

        // 2. Chatter Generation
        if (renderTime > nextChatterTime.val && activeMembers.length > 1 && familyMembers && familyMembers.length > 0) {
            const numSpeakers = 1 + Math.floor(Math.random() * 2.5);
            let delayOffset = 0;
            for (let i = 0; i < numSpeakers; i++) {
                const speaker = activeMembers[Math.floor(Math.random() * activeMembers.length)];
                if (!speaker || !speaker.mesh) continue;

                const speakerId = speaker.mesh.userData.id;
                const lines = DataResolver.getChatterLines(speakerId);
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
                        id: `chat_${renderTime}_${i}`,
                        mesh: speaker.mesh,
                        text,
                        startTime: renderTime + delayOffset,
                        duration,
                        element: el,
                        playedSound: false,
                        _lastX: -9999,
                        _lastY: -9999
                    });
                    delayOffset += duration + 500;
                }
            }
            nextChatterTime.set(renderTime + delayOffset + 10000 + Math.random() * 20000);
        }

        // 2. Chat Bubble Positioning & Expiry
        const _v1 = new THREE.Vector3();
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        for (let i = activeChats.length - 1; i >= 0; i--) {
            const c = activeChats[i];

            if (renderTime > c.startTime + c.duration) {
                if (c.element.parentNode) c.element.parentNode.removeChild(c.element);
                activeChats[i] = activeChats[activeChats.length - 1];
                activeChats.pop();
            }

            else if (renderTime >= c.startTime) {
                if (!c.playedSound) {
                    c.playedSound = true;
                    UiSounds.playConfirm();
                }

                // 1. Opacity - update only if it actually changes
                const targetOpacity = renderTime < c.startTime + 500 ? String((renderTime - c.startTime) / 500) : (renderTime > c.startTime + c.duration - 500 ? String((c.startTime + c.duration - renderTime) / 500) : '1');
                if (c.element.style.opacity !== targetOpacity) {
                    c.element.style.opacity = targetOpacity;
                }

                // 2. Positioning (Hardware accelerated & Zero-GC)
                const vec = _v1;
                c.mesh.getWorldPosition(vec);
                vec.y += 2.2;
                vec.project(camera);

                const px = Math.round((vec.x * 0.5 + 0.5) * screenWidth);
                const py = Math.round((-(vec.y * 0.5) + 0.5) * screenHeight);

                // Update DOM ONLY if the bubble has moved at least 1 pixel since the last frame
                if (px !== c._lastX || py !== c._lastY) {
                    c._lastX = px;
                    c._lastY = py;
                    c.element.style.transform = `translate3d(calc(-50% + ${px}px), calc(-100% + ${py}px), 0)`;
                }
            }
        }
    }
}