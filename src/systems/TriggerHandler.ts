import * as THREE from 'three';
import { TriggerType, TriggerStatus, TriggerAction } from '../types/TriggerTypes';
import { SoundID } from '../utils/audio/AudioTypes';
import { DataResolver } from '../utils/ui/DataResolver';
import { DiscoveryType } from '../components/ui/hud/HudTypes';
import { SystemID } from './SystemID';
import { UIEventRingBuffer, UIEventType } from './ui/UIEventRingBuffer';

export const TriggerHandler = {
    systemId: SystemID.TRIGGER_HANDLER,
    id: 'trigger_handler',
    persistent: true,

    update: (session: any, dt: number, simTime: number, renderTime: number) => {
        if (!session.playerPos || !session.state || !session.state.triggers) return;

        session.state.triggers.processTriggers(session.playerPos, simTime, (index: number, id: string, type: TriggerType, content: string, actions: TriggerAction[]) => {
            const state = session.state;
            const callbacks = state.callbacks;
            if (!callbacks) return;

            // --- FIRE ACTIONS ---
            if (actions && actions.length > 0) {
                const aLen = actions.length;
                for (let j = 0; j < aLen; j++) {
                    callbacks.onAction(actions[j]);
                }
            }

            // --- FIRE NARRATIVE ---
            let narrativeContent = content;
            if (!narrativeContent && id) {
                if (type === TriggerType.POI) {
                    narrativeContent = DataResolver.getPoiReaction(id);
                } else if (type === TriggerType.CLUE) {
                    narrativeContent = DataResolver.getClueReaction(id);
                } else if (type === TriggerType.THOUGHT || type === TriggerType.SPEAK) {
                    narrativeContent = DataResolver.getClueReaction(id);
                }
            }

            if (narrativeContent) {
                const translatedText = callbacks.t(narrativeContent);
                const duration = 2000 + translatedText.length * 50;
                UIEventRingBuffer.pushString(UIEventType.CHAT_BUBBLE, translatedText, duration, simTime);

                switch (type) {
                    case TriggerType.SPEAK:
                        if (callbacks.playSound) callbacks.playSound(SoundID.VO_PLAYER_COUGH);
                        callbacks.onTrigger(TriggerType.SPEAK, duration);
                        break;

                    case TriggerType.THOUGHT:
                        if (callbacks.playSound) callbacks.playSound(SoundID.UI_HOVER);
                        callbacks.onTrigger(TriggerType.THOUGHT, duration);
                        break;

                    case TriggerType.POI:
                        if (!content) {
                            if (callbacks.playSound) callbacks.playSound(SoundID.UI_HOVER);
                            callbacks.onTrigger(TriggerType.THOUGHT, duration);
                        } else {
                            if (callbacks.playSound) callbacks.playSound(SoundID.UI_HOVER);
                            callbacks.onTrigger(type || TriggerType.INFO, duration);
                        }

                        if (callbacks.onDiscovery && (!state.discoverySets || !state.discoverySets.pois.has(id))) {
                            // Packed SMI: (sector << 8) | index
                            const contentId = (state.currentSector << 8) | index;
                            UIEventRingBuffer.push(UIEventType.DISCOVERY, contentId, DiscoveryType.POI, simTime);
                        }
                        break;

                    case TriggerType.CLUE:
                        if (callbacks.playSound) callbacks.playSound(SoundID.UI_HOVER);
                        callbacks.onTrigger(TriggerType.CLUE, duration);

                        if (callbacks.onDiscovery && (!state.discoverySets || !state.discoverySets.clues.has(id))) {
                            // Packed SMI: (sector << 8) | index
                            const contentId = (state.currentSector << 8) | index;
                            UIEventRingBuffer.push(UIEventType.DISCOVERY, contentId, DiscoveryType.CLUE, simTime);
                        }
                        break;

                    case TriggerType.COLLECTIBLE:
                        if (callbacks.playSound) callbacks.playSound(SoundID.UI_HOVER);
                        callbacks.onTrigger(TriggerType.COLLECTIBLE, duration);

                        if (callbacks.onDiscovery && (!state.discoverySets || !state.discoverySets.collectibles.has(id))) {
                            const col = DataResolver.getCollectibles()[id];
                            const contentId = col ? (col.sector << 8) | col.index : id;
                            if (typeof contentId === 'number') {
                                UIEventRingBuffer.push(UIEventType.DISCOVERY, contentId, DiscoveryType.COLLECTIBLE, simTime);
                            }
                        }
                        break;

                    default:
                        if (callbacks.playSound) callbacks.playSound(SoundID.UI_HOVER);
                        callbacks.onTrigger(type || TriggerType.INFO, duration);
                        break;
                }
            }
        });
    },
};
