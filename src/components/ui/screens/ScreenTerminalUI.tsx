import React, { useState, useEffect, useRef } from 'react';
import { t } from '../../../utils/i18n';
import ModalLayout, { TacticalButton, TacticalTab } from './ModalLayout';
import { UIEventRingBuffer, UIEventType, ChatBubbleSubtype } from '../../../systems/ui/UIEventRingBuffer';
import { InteractionPromptId, InteractionType } from '../../../systems/ui/UIEventBridge';
import { DiscoveryType } from '../hud/game/HudTypes';
import { HudStore } from '../../../store/HudStore';
import { DataResolver } from '../../../core/data/DataResolver';
import { StatusEffectID } from '../../../types/StatusEffects';
import { CHALLENGES } from '../../../content/challenges';
import { UISounds } from '../../../utils/audio/AudioLib';
import { PlayerStatusFlags } from '../../../types/CareerStats';

interface ScreenTerminalUIProps {
    onClose: () => void;
    isMobileDevice?: boolean;
}

type TabType = 'popups' | 'feedback' | 'dialogue_prompt' | 'effects';

const ToggleButton: React.FC<{ 
    isActive: boolean; 
    onClick: () => void; 
    label: string; 
}> = ({ isActive, onClick, label }) => (
    <button
        onClick={onClick}
        className={`w-full py-2.5 px-4 border uppercase text-xs font-mono font-bold tracking-wider transition-all duration-150 flex items-center justify-between ${
            isActive 
                ? 'border-emerald-500 bg-emerald-950/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
                : 'border-zinc-800 bg-zinc-900/10 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
        }`}
    >
        <span>{label}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-600'}`}>
            {isActive ? 'ENABLED' : 'DISABLED'}
        </span>
    </button>
);

export const ScreenTerminalUI: React.FC<ScreenTerminalUIProps> = ({ onClose, isMobileDevice }) => {
    const [activeTab, setActiveTab] = useState<TabType>('popups');
    const [keepAlive, setKeepAlive] = useState<boolean>(() => {
        return (window as any).terminalKeepAlive !== undefined ? (window as any).terminalKeepAlive : true;
    });

    const getGlobalLoops = (): any[] => {
        if (!(window as any).terminalLoops) {
            (window as any).terminalLoops = [];
        }
        return (window as any).terminalLoops;
    };

    const clearGlobalLoops = () => {
        const loops = getGlobalLoops();
        for (let i = 0; i < loops.length; i++) {
            clearInterval(loops[i]);
        }
        (window as any).terminalLoops = [];
    };

    const getSavedToggleStates = () => {
        return (window as any).terminalToggleStates || {
            discovery: false,
            challenge: false,
            levelUp: false,
            combatLog: false,
            chatBubble: false,
            dialogue: false,
            interaction: false,
            sectorBanner: false,
            effects: false
        };
    };

    const saveToggleStates = (states: any) => {
        (window as any).terminalToggleStates = states;
    };

    const [toggleStates, setToggleStates] = useState(() => getSavedToggleStates());

    const updateToggle = (key: string, val: boolean) => {
        const next = { ...toggleStates, [key]: val };
        setToggleStates(next);
        saveToggleStates(next);
    };

    const handleClose = () => {
        (window as any).terminalKeepAlive = keepAlive;
        clearGlobalLoops();

        const runActions: Array<() => void> = [];

        if (toggleStates.discovery) runActions.push(runTriggerDiscovery);
        if (toggleStates.challenge) runActions.push(runTriggerChallenge);
        if (toggleStates.levelUp) runActions.push(runTriggerLevelUp);
        if (toggleStates.combatLog) runActions.push(runTriggerCombatLog);
        if (toggleStates.chatBubble) runActions.push(runTriggerChatBubble);
        if (toggleStates.dialogue) runActions.push(runTriggerDialogue);
        if (toggleStates.interaction) runActions.push(runTriggerInteraction);
        if (toggleStates.sectorBanner) runActions.push(runTriggerSideBanner);
        if (toggleStates.effects) {
            runActions.push(runApplyScreenEffects);
        } else {
            runActions.push(() => {
                HudStore.patch({ statusFlags: 0, hasCriticalHp: false });
            });
        }

        for (let i = 0; i < runActions.length; i++) {
            const action = runActions[i];
            action();
            if (keepAlive) {
                const interval = setInterval(action, 3000);
                getGlobalLoops().push(interval);
            }
        }

        onClose();
    };

    const handleResetUI = () => {
        clearGlobalLoops();
        
        const initialToggles = {
            discovery: false,
            challenge: false,
            levelUp: false,
            combatLog: false,
            chatBubble: false,
            dialogue: false,
            interaction: false,
            sectorBanner: false,
            effects: false
        };
        setToggleStates(initialToggles);
        saveToggleStates(initialToggles);
        
        HudStore.patch({
            cinematicActive: false,
            dialogueActive: false,
            dialogueSpeaker: '',
            dialogueText: '',
            interactionActive: false,
            interactionId: InteractionPromptId.NONE,
            statusFlags: 0,
            hasCriticalHp: false
        });
        
        setEffectDisoriented(false);
        setEffectBurning(false);
        setEffectBleeding(false);
        setEffectGibMaster(false);
        setEffectAdrenaline(false);
        setEffectReflex(false);
        setEffectQuickFinger(false);
        setEffectCriticalHp(false);
        
        setKeepAlive(true);
        (window as any).terminalKeepAlive = true;
        UISounds.playConfirm();
    };

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

    // 9. Screen Effect states
    const [effectDisoriented, setEffectDisoriented] = useState(false);
    const [effectBurning, setEffectBurning] = useState(false);
    const [effectBleeding, setEffectBleeding] = useState(false);
    const [effectGibMaster, setEffectGibMaster] = useState(false);
    const [effectAdrenaline, setEffectAdrenaline] = useState(false);
    const [effectReflex, setEffectReflex] = useState(false);
    const [effectQuickFinger, setEffectQuickFinger] = useState(false);
    const [effectCriticalHp, setEffectCriticalHp] = useState(false);

    const getSimTime = () => {
        // Safe access to running engine simulation time
        return (window as any).inputManager?.stateRef?.current?.simTime || Date.now();
    };

    const runTriggerDiscovery = () => {
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

    const runTriggerChallenge = () => {
        const simTime = getSimTime();
        const challenge = CHALLENGES[selectedChallengeIdx];
        if (challenge) {
            // Encode: (ChallengeID << 8) | NewTier
            const encoded = (challenge.id << 8) | challengeTier;
            UIEventRingBuffer.push(UIEventType.CHALLENGE_COMPLETE, encoded, 0, simTime);
        }
    };

    const runTriggerChatBubble = () => {
        const simTime = getSimTime();
        const duration = 3000;
        UIEventRingBuffer.pushString(
            UIEventType.CHAT_BUBBLE,
            chatText,
            duration | (chatSubtype << 16),
            simTime
        );
    };

    const runTriggerCombatLog = () => {
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

    const runTriggerDialogue = () => {
        HudStore.update({
            ...HudStore.getState(),
            cinematicActive: true,
            dialogueActive: true,
            dialogueSpeaker: dialogueSpeaker,
            dialogueText: dialogueText
        });

        // Auto dismiss after 2.5 seconds
        setTimeout(() => {
            HudStore.update({
                ...HudStore.getState(),
                cinematicActive: false,
                dialogueActive: false,
                dialogueSpeaker: '',
                dialogueText: ''
            });
        }, 2500);
    };

    const runTriggerInteraction = () => {
        HudStore.patch({
            interactionActive: true,
            interactionType: InteractionType.SECTOR_SPECIFIC,
            interactionLabel: 'ui.interact',
            interactionId: interactionPrompt
        });

        // Auto hide after 2.5 seconds
        setTimeout(() => {
            HudStore.patch({
                interactionActive: false,
                interactionId: InteractionPromptId.NONE
            });
        }, 2500);
    };

    const runTriggerLevelUp = () => {
        const simTime = getSimTime();
        UIEventRingBuffer.push(UIEventType.LEVEL_UP, levelUpVal, 0, simTime);
    };

    const runTriggerSideBanner = () => {
        window.dispatchEvent(
            new CustomEvent('trigger-side-banner-preview', {
                detail: { title: sectorTitle, subtitle: sectorSubtitle }
            })
        );
    };

    const runApplyScreenEffects = () => {
        let flags = PlayerStatusFlags.NONE;
        if (effectDisoriented) flags |= PlayerStatusFlags.DISORIENTED;
        if (effectBurning) flags |= PlayerStatusFlags.BURNING;
        if (effectBleeding) flags |= PlayerStatusFlags.BLEEDING;
        if (effectGibMaster) flags |= PlayerStatusFlags.GIB_MASTER;
        if (effectAdrenaline) flags |= PlayerStatusFlags.ADRENALINE_PATCH;
        if (effectReflex) flags |= PlayerStatusFlags.REFLEX_SHIELD;
        if (effectQuickFinger) flags |= PlayerStatusFlags.QUICK_FINGER;

        HudStore.patch({
            statusFlags: flags,
            hasCriticalHp: effectCriticalHp
        });
    };

    // Render Deck helper JSX to avoid duplication
    const renderDevDeck = () => (
        <div className="p-4 border border-zinc-800 bg-zinc-950/60 rounded-md flex flex-col gap-3 font-mono text-xs">
            <div className="text-zinc-400 font-bold uppercase tracking-wider border-b border-zinc-800 pb-1.5 mb-1 text-[10px]">
                Debug Trigger Options
            </div>
            
            {/* Keep Alive Loop */}
            <div className="flex flex-col gap-1.5">
                <span className="text-zinc-500 uppercase text-[9px] font-black">Spawn Mode (On Close)</span>
                <button 
                    onClick={() => setKeepAlive(!keepAlive)}
                    className={`w-full py-1.5 px-2 border uppercase text-[9px] font-black tracking-wider transition-all duration-150 flex items-center justify-center gap-1.5 ${keepAlive ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-zinc-800 bg-zinc-900/20 text-zinc-500 hover:text-zinc-300'}`}
                >
                    {keepAlive ? '● Loop Active (3s)' : '○ Single Spawn'}
                </button>
            </div>

            {/* Reset UI */}
            <button 
                onClick={handleResetUI}
                className="mt-2 w-full py-2 px-2 border border-red-500 bg-red-950/20 text-red-400 uppercase text-[9px] font-black tracking-widest hover:bg-red-900/40 transition-colors"
            >
                Reset UI
            </button>
        </div>
    );

    return (
        <ModalLayout
            title={t('terminals.ui')}
            isMobileDevice={isMobileDevice}
            onClose={handleClose}
            titleColorClass="text-purple-600"
        >
            <div className="flex flex-col md:flex-row gap-6 h-full min-h-[500px]">
                {/* Side Navigation Tabs */}
                <div className="flex flex-col gap-2 shrink-0 md:w-56">
                    <div className="flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0">
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
                        <TacticalTab
                            label="Screen Effects"
                            isActive={activeTab === 'effects'}
                            onClick={() => setActiveTab('effects')}
                            orientation={isMobileDevice ? 'horizontal' : 'vertical'}
                        />
                    </div>
                    
                    {/* Desktop Dev Deck */}
                    <div className="hidden md:block mt-4">
                        {renderDevDeck()}
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 min-w-0 bg-zinc-950/40 border border-zinc-800 rounded-lg p-6 overflow-y-auto custom-scrollbar">
                    {/* Mobile Dev Deck */}
                    <div className="md:hidden mb-6">
                        {renderDevDeck()}
                    </div>

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
                                <ToggleButton 
                                    label="Queue Discovery Popup" 
                                    isActive={toggleStates.discovery} 
                                    onClick={() => updateToggle('discovery', !toggleStates.discovery)} 
                                />
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
                                <ToggleButton 
                                    label="Queue Challenge Popup" 
                                    isActive={toggleStates.challenge} 
                                    onClick={() => updateToggle('challenge', !toggleStates.challenge)} 
                                />
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
                                    <div className="flex-1">
                                        <ToggleButton 
                                            label="Queue Level Up Banner" 
                                            isActive={toggleStates.levelUp} 
                                            onClick={() => updateToggle('levelUp', !toggleStates.levelUp)} 
                                        />
                                    </div>
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
                                <ToggleButton 
                                    label="Queue Combat Float Log" 
                                    isActive={toggleStates.combatLog} 
                                    onClick={() => updateToggle('combatLog', !toggleStates.combatLog)} 
                                />
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
                                <ToggleButton 
                                    label="Queue Chat Bubble" 
                                    isActive={toggleStates.chatBubble} 
                                    onClick={() => updateToggle('chatBubble', !toggleStates.chatBubble)} 
                                />
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
                                <ToggleButton 
                                    label="Queue Dialogue Box" 
                                    isActive={toggleStates.dialogue} 
                                    onClick={() => updateToggle('dialogue', !toggleStates.dialogue)} 
                                />
                            </div>

                            {/* INTERACTION PROMPT */}
                            <div className="flex flex-col gap-4 border-b border-zinc-800 pb-6">
                                <h3 className="text-zinc-400 font-bold uppercase tracking-wider text-sm">Interaction Prompt (Center HUD Indicator)</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
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
                                    <div className="flex-1">
                                        <ToggleButton 
                                            label="Queue Interaction Prompt" 
                                            isActive={toggleStates.interaction} 
                                            onClick={() => updateToggle('interaction', !toggleStates.interaction)} 
                                        />
                                    </div>
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
                                <ToggleButton 
                                    label="Queue Sector Splash Banner" 
                                    isActive={toggleStates.sectorBanner} 
                                    onClick={() => updateToggle('sectorBanner', !toggleStates.sectorBanner)} 
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'effects' && (
                        <div className="flex flex-col gap-6">
                            <h3 className="text-zinc-400 font-bold uppercase tracking-wider text-sm">Vignette & Screen Visual Effects</h3>
                            <p className="text-zinc-500 text-xs font-mono">
                                Select status flags to apply to the player model and view the corresponding HUD post-processing vignette filters.
                            </p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border border-zinc-800 bg-zinc-950/20 p-6 rounded-md">
                                <label className="flex items-center gap-3 cursor-pointer text-zinc-300 font-mono text-xs hover:text-white transition-colors">
                                    <input 
                                        type="checkbox" 
                                        checked={effectDisoriented} 
                                        onChange={(e) => setEffectDisoriented(e.target.checked)}
                                        className="accent-purple-600 rounded border-zinc-800 bg-black w-4 h-4" 
                                    />
                                    <div>
                                        <div className="font-bold uppercase text-zinc-200">Disoriented</div>
                                        <div className="text-[10px] text-zinc-500">Pulsing double-blur effect (Debuff)</div>
                                    </div>
                                </label>

                                <label className="flex items-center gap-3 cursor-pointer text-zinc-300 font-mono text-xs hover:text-white transition-colors">
                                    <input 
                                        type="checkbox" 
                                        checked={effectBurning} 
                                        onChange={(e) => setEffectBurning(e.target.checked)}
                                        className="accent-purple-600 rounded border-zinc-800 bg-black w-4 h-4" 
                                    />
                                    <div>
                                        <div className="font-bold uppercase text-zinc-200">Burning</div>
                                        <div className="text-[10px] text-zinc-500">Bright orange-red flame vignette (Debuff)</div>
                                    </div>
                                </label>

                                <label className="flex items-center gap-3 cursor-pointer text-zinc-300 font-mono text-xs hover:text-white transition-colors">
                                    <input 
                                        type="checkbox" 
                                        checked={effectBleeding} 
                                        onChange={(e) => setEffectBleeding(e.target.checked)}
                                        className="accent-purple-600 rounded border-zinc-800 bg-black w-4 h-4" 
                                    />
                                    <div>
                                        <div className="font-bold uppercase text-zinc-200">Bleeding</div>
                                        <div className="text-[10px] text-zinc-500">Dark crimson pulse vignette (Debuff)</div>
                                    </div>
                                </label>

                                <label className="flex items-center gap-3 cursor-pointer text-zinc-300 font-mono text-xs hover:text-white transition-colors">
                                    <input 
                                        type="checkbox" 
                                        checked={effectGibMaster} 
                                        onChange={(e) => setEffectGibMaster(e.target.checked)}
                                        className="accent-purple-600 rounded border-zinc-800 bg-black w-4 h-4" 
                                    />
                                    <div>
                                        <div className="font-bold uppercase text-zinc-200">Gib Master</div>
                                        <div className="text-[10px] text-zinc-500">Dark violet gory splash (Buff)</div>
                                    </div>
                                </label>

                                <label className="flex items-center gap-3 cursor-pointer text-zinc-300 font-mono text-xs hover:text-white transition-colors">
                                    <input 
                                        type="checkbox" 
                                        checked={effectAdrenaline} 
                                        onChange={(e) => setEffectAdrenaline(e.target.checked)}
                                        className="accent-purple-600 rounded border-zinc-800 bg-black w-4 h-4" 
                                    />
                                    <div>
                                        <div className="font-bold uppercase text-zinc-200">Adrenaline Patch</div>
                                        <div className="text-[10px] text-zinc-500">Deep golden-yellow flash vignette (Buff)</div>
                                    </div>
                                </label>

                                <label className="flex items-center gap-3 cursor-pointer text-zinc-300 font-mono text-xs hover:text-white transition-colors">
                                    <input 
                                        type="checkbox" 
                                        checked={effectReflex} 
                                        onChange={(e) => setEffectReflex(e.target.checked)}
                                        className="accent-purple-600 rounded border-zinc-800 bg-black w-4 h-4" 
                                    />
                                    <div>
                                        <div className="font-bold uppercase text-zinc-200">Reflex Shield</div>
                                        <div className="text-[10px] text-zinc-500">Electric blue energy aura (Buff)</div>
                                    </div>
                                </label>

                                <label className="flex items-center gap-3 cursor-pointer text-zinc-300 font-mono text-xs hover:text-white transition-colors">
                                    <input 
                                        type="checkbox" 
                                        checked={effectQuickFinger} 
                                        onChange={(e) => setEffectQuickFinger(e.target.checked)}
                                        className="accent-purple-600 rounded border-zinc-800 bg-black w-4 h-4" 
                                    />
                                    <div>
                                        <div className="font-bold uppercase text-zinc-200">Quick Finger</div>
                                        <div className="text-[10px] text-zinc-500">Slight green visual enhancement (Buff)</div>
                                    </div>
                                </label>

                                <label className="flex items-center gap-3 cursor-pointer text-zinc-300 font-mono text-xs hover:text-white transition-colors">
                                    <input 
                                        type="checkbox" 
                                        checked={effectCriticalHp} 
                                        onChange={(e) => setEffectCriticalHp(e.target.checked)}
                                        className="accent-purple-600 rounded border-zinc-800 bg-black w-4 h-4" 
                                    />
                                    <div>
                                        <div className="font-bold uppercase text-zinc-200">Critical HP Alert</div>
                                        <div className="text-[10px] text-zinc-500">Slow breathing red boundary vignette (System Alert)</div>
                                    </div>
                                </label>
                            </div>
                            
                            <ToggleButton 
                                label="Apply Screen Effects on Close" 
                                isActive={toggleStates.effects} 
                                onClick={() => updateToggle('effects', !toggleStates.effects)} 
                            />
                        </div>
                    )}
                </div>
            </div>
        </ModalLayout>
    );
};
