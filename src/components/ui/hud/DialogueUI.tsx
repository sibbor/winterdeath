import React, { useEffect, useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { t } from '../../../utils/i18n';
import { HudStore } from '../../../store/HudStore';
import { DataResolver } from '../../../core/data/DataResolver';

interface DialogueUIProps {
    isMobileDevice?: boolean;
    onComplete?: () => void;
}

export interface DialogueUIHandle {
    finishTyping: () => boolean;
}

interface TextToken {
    type: 'text' | 'action' | 'italic';
    content: string;
    cleanContent: string;
}

const CONTAINER_HIDDEN = "fixed left-0 right-0 z-[100] flex justify-center pointer-events-none transition-all duration-500 ease-out bottom-[-20%] opacity-0";
const CONTAINER_VISIBLE = "fixed left-0 right-0 z-[100] flex justify-center pointer-events-none transition-all duration-500 ease-out bottom-[calc(12%+25px)] opacity-100";

const DialogueUI = forwardRef<DialogueUIHandle, DialogueUIProps>(({ isMobileDevice, onComplete }, ref) => {
    const [isVisible, setIsVisible] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    const [speakerName, setSpeakerName] = useState('');
    const [bgColor, setBgColor] = useState('#000');
    const isVisibleRef = useRef(false);
    const isFinishedRef = useRef(false);
    const timerRef = useRef<number | null>(null);
    const visibleCountRef = useRef<number>(0);
    const textContainerRef = useRef<HTMLSpanElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const rawTextRef = useRef('');
    const lastDialogueKeyRef = useRef<string | null>(null);
    const currentTokens = useRef<TextToken[]>([]);
    const totalCharsRef = useRef(0);
    const updateDOMText = useCallback((count: number) => {
        if (!textContainerRef.current) return;

        let currentIdx = 0;
        let html = "";
        const tokens = currentTokens.current;

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const start = currentIdx;
            const end = start + token.cleanContent.length;

            if (count <= start) break;

            const visibleLength = Math.min(token.cleanContent.length, count - start);
            const displayStr = token.cleanContent.substring(0, visibleLength);

            if (token.type === 'action') html += `<span class="italic opacity-80">${displayStr}</span>`;
            else if (token.type === 'italic') html += `<span class="italic">${displayStr}</span>`;
            else html += displayStr;

            currentIdx = end;
        }

        textContainerRef.current.innerHTML = html;
    }, []);

    const requestRef = useRef<number>();
    const tickRef = useRef<number>(0);

    const startTyping = () => {
        visibleCountRef.current = 0;
        setIsFinished(false);
        isFinishedRef.current = false;
        updateDOMText(0);

        // Cancel any previous pending animation
        if (requestRef.current) cancelAnimationFrame(requestRef.current);

        const animate = () => {
            // Stop if component is unmounted or hidden
            if (!isVisibleRef.current) return;

            const now = performance.now();
            // Throttle to roughly 30ms (approx 33fps)
            if (now - tickRef.current > 30) {
                if (visibleCountRef.current < totalCharsRef.current) {
                    visibleCountRef.current += 1;
                    updateDOMText(visibleCountRef.current);
                    tickRef.current = now;
                } else {
                    setIsFinished(true);
                    isFinishedRef.current = true;
                    return; // Stop loop
                }
            }
            requestRef.current = requestAnimationFrame(animate);
        };
        requestRef.current = requestAnimationFrame(animate);
    };

    useEffect(() => {
        const unsubscribe = HudStore.subscribe(() => {
            const state = HudStore.getState();
            const active = state.cinematicActive && state.dialogueActive && !!state.dialogueText;

            if (active) {
                if (state.dialogueText === lastDialogueKeyRef.current) return;
                lastDialogueKeyRef.current = state.dialogueText;

                const newText = t(state.dialogueText);
                if (newText !== rawTextRef.current) {
                    rawTextRef.current = newText;

                    const regex = /(\([^)]+\)|\/[^/]+\/)/g;
                    const parts = newText.split(regex);
                    currentTokens.current = parts.map((part): TextToken => {
                        if (part.startsWith('(') && part.endsWith(')')) return { type: 'action', content: part, cleanContent: part.replace(/[()]/g, '') };
                        if (part.startsWith('/') && part.endsWith('/')) return { type: 'italic', content: part, cleanContent: part.replace(/\//g, '') };
                        return { type: 'text', content: part, cleanContent: part };
                    }).filter(t => t.content.length > 0);

                    totalCharsRef.current = currentTokens.current.reduce((acc, t) => acc + t.cleanContent.length, 0);

                    setSpeakerName(DataResolver.getFamilyMemberName(state.dialogueSpeaker));
                    setBgColor(DataResolver.getSpeakerColor(state.dialogueSpeaker));

                    // Uppdatera både state och Ref synkront
                    setIsVisible(true);
                    isVisibleRef.current = true;

                    startTyping();
                }
            } else {
                if (isVisibleRef.current || rawTextRef.current !== '') {
                    lastDialogueKeyRef.current = null;

                    setIsVisible(false);
                    isVisibleRef.current = false;

                    rawTextRef.current = '';
                    if (timerRef.current) {
                        clearInterval(timerRef.current);
                        timerRef.current = null;
                    }
                }
            }
        });

        return () => {
            unsubscribe();
            if (timerRef.current !== null) {
                clearInterval(timerRef.current);
            }
        };
    }, [updateDOMText]);

    const finishTyping = useCallback(() => {
        if (!isFinishedRef.current && isVisibleRef.current) {
            if (timerRef.current !== null) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            setIsFinished(true);
            isFinishedRef.current = true;

            visibleCountRef.current = totalCharsRef.current;
            updateDOMText(totalCharsRef.current);
            return true;
        }
        return false;
    }, [updateDOMText]);

    useImperativeHandle(ref, () => ({
        finishTyping
    }));

    return (
        <div
            ref={containerRef}
            className={`${isVisible ? CONTAINER_VISIBLE : CONTAINER_HIDDEN} pointer-events-auto cursor-pointer`}
            onClick={() => {
                if (isVisible) {
                    const wasTyping = finishTyping();
                    if (!wasTyping) {
                        if (onComplete) onComplete();
                    }
                }
            }}
        >
            <div className={`w-[90%] md:w-[60%] max-w-4xl relative ${isMobileDevice ? 'scale-90 origin-bottom' : ''}`}>
                <div className="hud-bar-container bg-black/95 backdrop-blur-xl p-6 md:p-8 min-h-[100px] relative shadow-2xl">
                    <div className="absolute top-0 left-0 w-2 h-full opacity-60" style={{ backgroundColor: bgColor }} />
                    <p className="text-white/90 text-sm md:text-xl font-mono leading-relaxed ml-4 drop-shadow-md">
                        {speakerName && (
                            <span className="font-black mr-3 uppercase tracking-widest text-xs md:text-sm block mb-1" style={{ color: bgColor }}>
                                {speakerName}
                            </span>
                        )}
                        <span ref={textContainerRef} className="hud-text-glow"></span>
                        {isVisible && !isFinished && (
                            <span className="inline-block w-2 md:w-3 h-5 md:h-6 bg-white/50 animate-pulse ml-1 align-middle" />
                        )}
                    </p>
                    {isFinished && isVisible && (
                        <div className="absolute bottom-4 right-6 flex items-center opacity-30 animate-pulse">
                            <span className="text-white text-[10px] uppercase tracking-[0.3em] font-black mr-3">
                                {isMobileDevice ? t('ui.tap') : t('ui.continue')}
                            </span>
                            <div className="w-2 h-2 bg-white rotate-45" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export default DialogueUI;