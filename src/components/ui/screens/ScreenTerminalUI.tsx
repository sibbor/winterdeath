import React, { useState } from 'react';
import { t } from '../../../utils/i18n';
import ModalLayout, { TacticalButton, TacticalTab } from './ModalLayout';
import { UIEventRingBuffer, UIEventType, ChatBubbleSubtype } from '../../../systems/ui/UIEventRingBuffer';
import { InteractionPromptId, InteractionType } from '../../../systems/ui/UIEventBridge';
import { DiscoveryType } from '../hud/HudTypes';
import { HudStore } from '../../../store/HudStore';
import { DataResolver } from '../../../core/data/DataResolver';
import { StatusEffectID } from '../../../types/StatusEffects';
import { CHALLENGES } from '../../../content/challenges';

interface ScreenTerminalUIProps {
    onClose: () => void;
    isMobileDevice?: boolean;
}

type TabType = 'popups' | 'feedback' | 'dialogue_prompt';

export const ScreenTerminalUI: React.FC<ScreenTerminalUIProps> = ({ onClose, isMobileDevice }) => {
    const [activeTab, setActiveTab] = useState<TabType>('popups');

    // 1. Discovery popup states
    const [discoveryType, setDiscoveryType] = useState<DiscoveryType>(DiscoveryType.CLUE);
    const [discoveryName, setDiscoveryName] = useState('DUMMY INTEL');
    const [discoveryProgress, setDiscoveryProgress] = useState(1);
    const [discoveryMax, setDiscoveryMax] = useState(3);

    // 2. Challenge popup states
    const [selectedChallengeIdx, setSelectedChallengeIdx] = useState(0);
    const [challengeTier, setChallengeTier] = useState(1);

    // 3. Chatbubble states
    const [chatSubtype, setChatSubtype] = useState<ChatBubbleSubtype>(ChatBubbleSubtype.GENERIC);
    const [chatText, setChatText] = useState('This is a test chat bubble transmission.');

    // 4. Combat log states
    const [combatLogType, setCombatLogType] = useState<'XP' | 'SCRAP' | 'CP' | 'SP' | 'BUFF' | 'DEBUFF'>('XP');
    const [combatLogAmount, setCombatLogAmount] = useState(100);
    const [combatLogPerk, setCombatLogPerk] = useState<StatusEffectID>(StatusEffectID.GIB_MASTER);

    // 5. Dialogue states
    const [dialogueSpeaker, setDialogueSpeaker] = useState('robert');
    const [dialogueText, setDialogueText] = useState('Nathalie, we need to stick together. Stay behind me.');

    // 6. Interaction prompt states
    const [interactionPrompt, setInteractionPrompt] = useState<InteractionPromptId>(InteractionPromptId.INTERACT);

    // 7. Level Up state
    const [levelUpVal, setLevelUpVal] = useState(5);

    // 8. Sector Banner states
    const [sectorTitle, setSectorTitle] = useState('THE PLAYGROUND');
    const [sectorSubtitle, setSectorSubtitle] = useState('Sector 004');

    const getSimTime = () => {
        // Safe access to running engine simulation time
        return (window as any).inputManager?.stateRef?.current?.simTime || Date.now();
    };

    const handleTriggerDiscovery = () => {
        const simTime = getSimTime();
        // Register dummy info in resolver cache so DiscoveryPopup can lookup
        const dummyId = 9999 + discoveryType;
        DataResolver.registerPresentationPayload(
            dummyId,
            discoveryType,
            discoveryName,
            discoveryProgress,
            discoveryMax,
            true
        );
        UIEventRingBuffer.push(UIEventType.DISCOVERY, dummyId, discoveryType, simTime);
    };

    const handleTriggerChallenge = () => {
        const simTime = getSimTime();
        const challenge = CHALLENGES[selectedChallengeIdx];
        if (challenge) {
            // Encode: (ChallengeID << 8) | NewTier
            const encoded = (challenge.id << 8) | challengeTier;
            UIEventRingBuffer.push(UIEventType.CHALLENGE_COMPLETE, encoded, 0, simTime);
        }
    };

    const handleTriggerChatBubble = () => {
        const simTime = getSimTime();
        const duration = 3000;
        UIEventRingBuffer.pushString(
            UIEventType.CHAT_BUBBLE,
            chatText,
            duration | (chatSubtype << 16),
            simTime
        );
    };

    const handleTriggerCombatLog = () => {
        const simTime = getSimTime();
        switch (combatLogType) {
            case 'XP':
                UIEventRingBuffer.push(UIEventType.XP_GAIN, combatLogAmount, 0, simTime);
                break;
            case 'SCRAP':
                UIEventRingBuffer.push(UIEventType.SCRAP_GAIN, combatLogAmount, 0, simTime);
                break;
            case 'CP':
                UIEventRingBuffer.push(UIEventType.CP_GAIN, combatLogAmount, 0, simTime);
                break;
            case 'SP':
                UIEventRingBuffer.push(UIEventType.SP_GAIN, combatLogAmount, 0, simTime);
                break;
            case 'BUFF':
                UIEventRingBuffer.push(UIEventType.BUFF_GAIN, combatLogPerk, 0, simTime);
                break;
            case 'DEBUFF':
                UIEventRingBuffer.push(UIEventType.DEBUFF_GAIN, combatLogPerk, 0, simTime);
                break;
        }
    };

    const handleTriggerDialogue = () => {
        HudStore.update({
            ...HudStore.getState(),
            cinematicActive: true,
            dialogueActive: true,
            dialogueSpeaker: dialogueSpeaker,
            dialogueText: dialogueText
        });

        // Auto dismiss after 4 seconds
        setTimeout(() => {
            HudStore.update({
                ...HudStore.getState(),
                cinematicActive: false,
                dialogueActive: false,
                dialogueSpeaker: '',
                dialogueText: ''
            });
        }, 4000);
    };

    const handleTriggerInteraction = () => {
        HudStore.patch({
            interactionActive: true,
            interactionType: InteractionType.SECTOR_SPECIFIC,
            interactionLabel: 'ui.interact',
            interactionId: interactionPrompt
        });

        // Auto hide after 4 seconds
        setTimeout(() => {
            HudStore.patch({
                interactionActive: false,
                interactionId: InteractionPromptId.NONE
            });
        }, 4000);
    };

    const handleTriggerLevelUp = () => {
        const simTime = getSimTime();
        UIEventRingBuffer.push(UIEventType.LEVEL_UP, levelUpVal, 0, simTime);
    };

    const handleTriggerSectorBanner = () => {
        window.dispatchEvent(
            new CustomEvent('trigger-side-banner-preview', {
                detail: { title: sectorTitle, subtitle: sectorSubtitle }
            })
        );
    };

    return (
        <ModalLayout
            title={t('terminals.ui')}
            isMobileDevice={isMobileDevice}
            onClose={onClose}
            titleColorClass="text-purple-600"
        >
            <div className="flex flex-col md:flex-row gap-6 h-full min-h-[500px]">
                {/* Side Navigation Tabs */}
                <div className="flex flex-row md:flex-col gap-2 shrink-0 md:w-56 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0">
                    <TacticalTab
                        label="Popups & Info"
                        isActive={activeTab === 'popups'}
                        onClick={() => setActiveTab('popups')}
                        orientation={isMobileDevice ? 'horizontal' : 'vertical'}
                    />
                    <TacticalTab
                        label="Log & Floating Feedback"
                        isActive={activeTab === 'feedback'}
                        onClick={() => setActiveTab('feedback')}
                        orientation={isMobileDevice ? 'horizontal' : 'vertical'}
                    />
                    <TacticalTab
                        label="Dialogues & Prompts"
                        isActive={activeTab === 'dialogue_prompt'}
                        onClick={() => setActiveTab('dialogue_prompt')}
                        orientation={isMobileDevice ? 'horizontal' : 'vertical'}
                    />
                </div>

                {/* Content Area */}
                <div className="flex-1 min-w-0 bg-zinc-950/40 border border-zinc-800 rounded-lg p-6 overflow-y-auto custom-scrollbar">
                    {activeTab === 'popups' && (
                        <div className="flex flex-col gap-8">
                            {/* DISCOVERY POPUP */}
                            <div className="flex flex-col gap-4 border-b border-zinc-800 pb-6">
                                <h3 className="text-zinc-400 font-bold uppercase tracking-wider text-sm">Discovery Popup</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-zinc-600 uppercase text-[9px] font-black">Type</label>
                                        <select
                                            value={discoveryType}
                                            onChange={(e) => setDiscoveryType(Number(e.target.value))}
                                            className="bg-black border border-zinc-700 text-white p-2 font-mono text-xs"
                                        >
                                            <option value={DiscoveryType.CLUE}>Clue</option>
                                            <option value={DiscoveryType.POI}>POI</option>
                                            <option value={DiscoveryType.COLLECTIBLE}>Collectible</option>
                                            <option value={DiscoveryType.ZOMBIE}>Zombie / Enemy</option>
                                            <option value={DiscoveryType.BOSS}>Boss</option>
                                            <option value={DiscoveryType.PERK}>Perk</option>
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-1 col-span-1 md:col-span-2">
                                        <label className="text-zinc-600 uppercase text-[9px] font-black">Name / Title</label>
                                        <input
                                            type="text"
                                            value={discoveryName}
                                            onChange={(e) => setDiscoveryName(e.target.value)}
                                            className="bg-black border border-zinc-700 text-white p-2 font-mono text-xs"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-zinc-600 uppercase text-[9px] font-black">Progress (Current/Max)</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="number"
                                                value={discoveryProgress}
                                                onChange={(e) => setDiscoveryProgress(Number(e.target.value))}
                                                className="bg-black border border-zinc-700 text-white p-2 font-mono text-xs w-16"
                                            />
                                            <span className="text-zinc-500 self-center">/</span>
                                            <input
                                                type="number"
                                                value={discoveryMax}
                                                onChange={(e) => setDiscoveryMax(Number(e.target.value))}
                                                className="bg-black border border-zinc-700 text-white p-2 font-mono text-xs w-16"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <TacticalButton variant="primary" onClick={handleTriggerDiscovery} className="mt-2">
                                    Trigger Discovery Popup
                                </TacticalButton>
                            </div>

                            {/* CHALLENGE POPUP */}
                            <div className="flex flex-col gap-4 border-b border-zinc-800 pb-6">
                                <h3 className="text-zinc-400 font-bold uppercase tracking-wider text-sm">Challenge Popup</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-zinc-600 uppercase text-[9px] font-black">Challenge</label>
                                        <select
                                            value={selectedChallengeIdx}
                                            onChange={(e) => setSelectedChallengeIdx(Number(e.target.value))}
                                            className="bg-black border border-zinc-700 text-white p-2 font-mono text-xs"
                                        >
                                            {CHALLENGES.map((ch, idx) => (
                                                <option key={ch.id} value={idx}>
                                                    {t(ch.titleKey)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-zinc-600 uppercase text-[9px] font-black">Completed Tier</label>
                                        <select
                                            value={challengeTier}
                                            onChange={(e) => setChallengeTier(Number(e.target.value))}
                                            className="bg-black border border-zinc-700 text-white p-2 font-mono text-xs"
                                        >
                                            <option value={1}>Bronze (Tier I)</option>
                                            <option value={2}>Silver (Tier II)</option>
                                            <option value={3}>Gold (Tier III)</option>
                                        </select>
                                    </div>
                                </div>
                                <TacticalButton variant="primary" onClick={handleTriggerChallenge} className="mt-2">
                                    Trigger Challenge Popup
                                </TacticalButton>
                            </div>

                            {/* LEVEL UP BANNER */}
                            <div className="flex flex-col gap-4">
                                <h3 className="text-zinc-400 font-bold uppercase tracking-wider text-sm">Level Up Banner</h3>
                                <div className="flex gap-4 items-end">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-zinc-600 uppercase text-[9px] font-black">Target Level</label>
                                        <input
                                            type="number"
                                            value={levelUpVal}
                                            onChange={(e) => setLevelUpVal(Number(e.target.value))}
                                            className="bg-black border border-zinc-700 text-white p-2 font-mono text-xs w-24"
                                        />
                                    </div>
                                    <TacticalButton variant="primary" onClick={handleTriggerLevelUp}>
                                        Trigger Level Up
                                    </TacticalButton>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'feedback' && (
                        <div className="flex flex-col gap-8">
                            {/* COMBAT LOG */}
                            <div className="flex flex-col gap-4 border-b border-zinc-800 pb-6">
                                <h3 className="text-zinc-400 font-bold uppercase tracking-wider text-sm">Combat Log Floating Numbers</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-zinc-600 uppercase text-[9px] font-black">Log Event Type</label>
                                        <select
                                            value={combatLogType}
                                            onChange={(e) => setCombatLogType(e.target.value as any)}
                                            className="bg-black border border-zinc-700 text-white p-2 font-mono text-xs"
                                        >
                                            <option value="XP">XP Gain</option>
                                            <option value="SCRAP">Scrap Gain</option>
                                            <option value="CP">Challenge Points (CP)</option>
                                            <option value="SP">Skill Points (SP)</option>
                                            <option value="BUFF">Buff Activation</option>
                                            <option value="DEBUFF">Debuff Infection</option>
                                        </select>
                                    </div>
                                    {(combatLogType === 'XP' || combatLogType === 'SCRAP' || combatLogType === 'CP' || combatLogType === 'SP') ? (
                                        <div className="flex flex-col gap-1">
                                            <label className="text-zinc-600 uppercase text-[9px] font-black">Amount</label>
                                            <input
                                                type="number"
                                                value={combatLogAmount}
                                                onChange={(e) => setCombatLogAmount(Number(e.target.value))}
                                                className="bg-black border border-zinc-700 text-white p-2 font-mono text-xs"
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-1">
                                            <label className="text-zinc-600 uppercase text-[9px] font-black">Effect / Perk</label>
                                            <select
                                                value={combatLogPerk}
                                                onChange={(e) => setCombatLogPerk(Number(e.target.value))}
                                                className="bg-black border border-zinc-700 text-white p-2 font-mono text-xs"
                                            >
                                                {Object.entries(DataResolver.getPerks()).map(([id, perk]) => (
                                                    <option key={id} value={id}>
                                                        {t(perk.displayName)} ({perk.category})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                                <TacticalButton variant="primary" onClick={handleTriggerCombatLog} className="mt-2">
                                    Trigger Combat Float Log
                                </TacticalButton>
                            </div>

                            {/* CHAT BUBBLES */}
                            <div className="flex flex-col gap-4">
                                <h3 className="text-zinc-400 font-bold uppercase tracking-wider text-sm">Chat Bubble (Overhead Screen Text)</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-zinc-600 uppercase text-[9px] font-black">Bubble Subtype</label>
                                        <select
                                            value={chatSubtype}
                                            onChange={(e) => setChatSubtype(Number(e.target.value))}
                                            className="bg-black border border-zinc-700 text-white p-2 font-mono text-xs"
                                        >
                                            <option value={ChatBubbleSubtype.GENERIC}>Generic (Teal)</option>
                                            <option value={ChatBubbleSubtype.THOUGHT}>Thought (Cyan/Italic)</option>
                                            <option value={ChatBubbleSubtype.SPEAK}>Speech (White/Robert Voice)</option>
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-1 col-span-2">
                                        <label className="text-zinc-600 uppercase text-[9px] font-black">Chat Text</label>
                                        <input
                                            type="text"
                                            value={chatText}
                                            onChange={(e) => setChatText(e.target.value)}
                                            className="bg-black border border-zinc-700 text-white p-2 font-mono text-xs"
                                        />
                                    </div>
                                </div>
                                <TacticalButton variant="primary" onClick={handleTriggerChatBubble} className="mt-2">
                                    Trigger Chat Bubble
                                </TacticalButton>
                            </div>
                        </div>
                    )}

                    {activeTab === 'dialogue_prompt' && (
                        <div className="flex flex-col gap-8">
                            {/* DIALOGUE BOX */}
                            <div className="flex flex-col gap-4 border-b border-zinc-800 pb-6">
                                <h3 className="text-zinc-400 font-bold uppercase tracking-wider text-sm">Dialogue Box (Cinematic Overlay)</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-zinc-600 uppercase text-[9px] font-black">Speaker Name</label>
                                        <select
                                            value={dialogueSpeaker}
                                            onChange={(e) => setDialogueSpeaker(e.target.value)}
                                            className="bg-black border border-zinc-700 text-white p-2 font-mono text-xs"
                                        >
                                            <option value="robert">Robert (Player)</option>
                                            <option value="loke">Loke</option>
                                            <option value="jordan">Jordan</option>
                                            <option value="esmeralda">Esmeralda</option>
                                            <option value="nathalie">Nathalie</option>
                                            <option value="radio">Radio</option>
                                            <option value="unknown">Unknown</option>
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-1 col-span-2">
                                        <label className="text-zinc-600 uppercase text-[9px] font-black">Dialogue Text Line</label>
                                        <input
                                            type="text"
                                            value={dialogueText}
                                            onChange={(e) => setDialogueText(e.target.value)}
                                            className="bg-black border border-zinc-700 text-white p-2 font-mono text-xs"
                                        />
                                    </div>
                                </div>
                                <TacticalButton variant="primary" onClick={handleTriggerDialogue} className="mt-2">
                                    Trigger dialogue (4s Auto-dismiss)
                                </TacticalButton>
                            </div>

                            {/* INTERACTION PROMPT */}
                            <div className="flex flex-col gap-4 border-b border-zinc-800 pb-6">
                                <h3 className="text-zinc-400 font-bold uppercase tracking-wider text-sm">Interaction Prompt (Center HUD Indicator)</h3>
                                <div className="flex gap-4 items-end">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-zinc-600 uppercase text-[9px] font-black">Prompt Subtype</label>
                                        <select
                                            value={interactionPrompt}
                                            onChange={(e) => setInteractionPrompt(Number(e.target.value))}
                                            className="bg-black border border-zinc-700 text-white p-2 font-mono text-xs w-64"
                                        >
                                            <option value={InteractionPromptId.INTERACT}>Standard Interact (E)</option>
                                            <option value={InteractionPromptId.ENTER_VEHICLE}>Enter Vehicle</option>
                                            <option value={InteractionPromptId.EXIT_VEHICLE}>Exit Vehicle</option>
                                            <option value={InteractionPromptId.PICKUP_COLLECTIBLE}>Pickup Collectible</option>
                                            <option value={InteractionPromptId.OPEN_CHEST}>Open Chest</option>
                                            <option value={InteractionPromptId.PLANT_EXPLOSIVE}>Plant Explosive</option>
                                            <option value={InteractionPromptId.KNOCK_ON_PORT}>Knock on Door</option>
                                        </select>
                                    </div>
                                    <TacticalButton variant="primary" onClick={handleTriggerInteraction}>
                                        Trigger Prompt (4s Auto-hide)
                                    </TacticalButton>
                                </div>
                            </div>

                            {/* SECTOR BANNER */}
                            <div className="flex flex-col gap-4">
                                <h3 className="text-zinc-400 font-bold uppercase tracking-wider text-sm">Sector Banner (Slide-in Splash)</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-zinc-600 uppercase text-[9px] font-black">Title</label>
                                        <input
                                            type="text"
                                            value={sectorTitle}
                                            onChange={(e) => setSectorTitle(e.target.value)}
                                            className="bg-black border border-zinc-700 text-white p-2 font-mono text-xs"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-zinc-600 uppercase text-[9px] font-black">Subtitle</label>
                                        <input
                                            type="text"
                                            value={sectorSubtitle}
                                            onChange={(e) => setSectorSubtitle(e.target.value)}
                                            className="bg-black border border-zinc-700 text-white p-2 font-mono text-xs"
                                        />
                                    </div>
                                </div>
                                <TacticalButton variant="primary" onClick={handleTriggerSectorBanner} className="mt-2">
                                    Trigger Sector Splash Banner
                                </TacticalButton>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </ModalLayout>
    );
};
