import * as THREE from 'three';
import { System, SystemID } from '../../systems/System';
import { CampWorld } from './CampWorld';
import { PlayerAnimator } from '../../entities/player/PlayerAnimator';
import { VoiceSounds } from '../../utils/audio/AudioLib';
import { DataResolver } from '../../core/data/DataResolver';
import { audioEngine } from '../../utils/audio/AudioEngine';
import { SoundID } from '../../utils/audio/AudioTypes';

// Module-level scratchpads for Zero-GC
const _v1 = new THREE.Vector3();

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
export class CampFamilyAnimationSystem implements System {
    readonly systemId = SystemID.CAMP_FAMILY_ANIMATION;
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

            if (!fm.animState) {
                fm.animState = {
                    isMoving: false,
                    isRushing: false,
                    isDodging: false,
                    dodgeStartTime: 0,
                    staminaRatio: 1.0,
                    isSpeaking: false,
                    isThinking: false,
                    isIdleLong: false,
                    seed: fm.seed,
                    renderTime: 0,
                    simTime: 0
                };
            }

            fm.animState.isSpeaking = isSpeaking;
            fm.animState.isIdleLong = renderTime > 5000;
            fm.animState.renderTime = renderTime;
            fm.animState.simTime = simTime;

            PlayerAnimator.update(fm.mesh as any, fm.animState, renderTime, dt);

            const isHov = hoveredId === (fm.mesh.userData.id);
            const emissiveIntensity = isHov ? 0.5 + Math.sin(renderTime * 0.005) * 0.5 : 0;

            for (let j = 0; j < fm.emissiveMaterials.length; j++) {
                const mat = fm.emissiveMaterials[j];
                mat.emissive.setHex(0xffffff);
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
            audioEngine.playSound(SoundID.OWL_HOOT, 0.3);
            nextWildlifeTime.set(renderTime + 30000 + Math.random() * 60000);
        }

        // 2. Chatter Generation
        if (renderTime > nextChatterTime.val && activeMembers.length > 1 && familyMembers && familyMembers.length > 0) {
            const numSpeakers = 1 + Math.floor(Math.random() * 2.5);
            let delayOffset = 0;
            for (let i = 0; i < numSpeakers; i++) {
                const speaker = activeMembers[Math.floor(Math.random() * activeMembers.length)];
                if (!speaker || !speaker.mesh) continue;

                const lines = DataResolver.getChatterLines(speaker.id);
                const text = lines[Math.floor(Math.random() * lines.length)];
                const duration = 2000 + text.length * 60;

                const el = document.createElement('div');
                el.className = 'absolute bg-black/80 border-2 border-black text-white px-4 py-2 text-sm font-bold rounded-lg pointer-events-none opacity-0 transition-opacity duration-500 whitespace-normal z-40 w-max max-w-[280px] text-center shadow-lg';
                el.innerText = text;
                if (chatOverlay) {
                    chatOverlay.appendChild(el);
                    el.style.transform = 'translate3d(-50%, -100%, 0)';
                }

                activeChats.push({
                    id: Math.random().toString(36).substr(2, 9),
                    speakerId: speaker.id,
                    mesh: speaker.mesh,
                    text,
                    startTime: renderTime + delayOffset,
                    duration,
                    element: el,
                    playedSound: false,
                    _lastX: -9999,
                    _lastY: -9999,
                    _lastOpacity: -1  // Zero-GC: numeric cache avoids String() per frame
                });
                delayOffset += 2500 + Math.random() * 2000;
            }
            nextChatterTime.set(renderTime + 15000 + Math.random() * 15000);
        }

        // 3. Chatter Updates (O(1) DOM Sync)
        for (let i = activeChats.length - 1; i >= 0; i--) {
            const chat = activeChats[i];
            const elapsed = renderTime - chat.startTime;

            if (elapsed > 0 && !chat.playedSound) {
                VoiceSounds.playDialogueBeep(chat.speakerId);
                chat.playedSound = true;
            }
        }

        // 2. Chat Bubble Positioning & Expiry
        // Guard the window size reads — zero cost when no chats are active.
        if (activeChats.length === 0) return;

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

                // 1. Opacity — numeric cache avoids String() allocation every frame.
                // A string is only written during the fade-in/out ramps (first/last 500ms).
                const elapsed = renderTime - c.startTime;
                let targetOpacity: number;
                if (elapsed < 500) {
                    targetOpacity = elapsed / 500;
                } else if (renderTime > c.startTime + c.duration - 500) {
                    targetOpacity = (c.startTime + c.duration - renderTime) / 500;
                } else {
                    targetOpacity = 1.0;
                }
                // Round to 2 dp — avoids micro-updates and keeps the string short
                const roundedOpacity = Math.round(targetOpacity * 100) / 100;
                if (roundedOpacity !== c._lastOpacity) {
                    c._lastOpacity = roundedOpacity;
                    c.element.style.opacity = roundedOpacity.toFixed(2);
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
