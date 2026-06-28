import React, { useEffect, useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { t } from '../../../../utils/i18n';
import { HudStore } from '../../../../store/HudStore';
import { DataResolver } from '../../../../core/data/DataResolver';

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

    const innerBoxRef = useRef<HTMLDivElement>(null);

    const startTyping = () => {
        visibleCountRef.current = totalCharsRef.current;
        setIsFinished(true);
        isFinishedRef.current = true;
        updateDOMText(totalCharsRef.current);

        if (innerBoxRef.current) {
            innerBoxRef.current.style.animation = 'none';
            void innerBoxRef.current.offsetHeight; // Forces synchronous layout engine reflow
            innerBoxRef.current.style.animation = 'dialogue-box-appear 400ms cubic-bezier(0.25, 1, 0.5, 1) forwards';
        }
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
        <>
            {isVisible && (
                <div
                    className="fixed inset-0 z-[99] cursor-pointer pointer-events-auto"
                    style={{ background: 'transparent' }}
                    onClick={(e) => {
                        e.stopPropagation();
                        const wasTyping = finishTyping();
                        if (!wasTyping) {
                            if (onComplete) onComplete();
                        }
                    }}
                />
            )}
            <div
                ref={containerRef}
                className={`${isVisible ? CONTAINER_VISIBLE : CONTAINER_HIDDEN} pointer-events-auto cursor-pointer`}
                onClick={(e) => {
                    e.stopPropagation();
                    if (isVisible) {
                        const wasTyping = finishTyping();
                        if (!wasTyping) {
                            if (onComplete) onComplete();
                        }
                    }
                }}
            >
                <div
                    ref={innerBoxRef}
                    className={`w-[90%] md:w-[60%] max-w-4xl relative ${isMobileDevice ? 'scale-90 origin-bottom' : ''}`}
                    style={{ willChange: 'transform, opacity, filter' }}
                >
                    {/* SMOKY CINEMATIC BACKGROUND */}
                    <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                            background: 'radial-gradient(50% 50% at 50% 50%, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.65) 60%, transparent 100%)',
                            filter: 'blur(16px)',
                            transform: 'scaleX(1.4) scaleY(1.05)'
                        }}
                    />

                    <div className="relative p-6 md:p-8 flex flex-col items-center justify-center text-center z-10 w-full">
                        <p className="text-zinc-100 text-sm md:text-xl font-mono leading-relaxed drop-shadow-md">
                            {speakerName && (
                                <span className="font-bold font-mono mr-2 tracking-wider uppercase" style={{ color: bgColor }}>
                                    {speakerName}:
                                </span>
                            )}
                            <span ref={textContainerRef} className="hud-text-glow font-mono"></span>
                        </p>

                        {isFinished && isVisible && (
                            <div className="absolute bottom-[-24px] right-1/2 translate-x-1/2 flex items-center opacity-40 hover:opacity-75 transition-opacity">
                                <span className="text-white text-[9px] uppercase tracking-[0.3em] font-mono font-bold mr-2">
                                    {isMobileDevice ? t('ui.tap') : t('ui.continue')}
                                </span>
                                <div className="w-1.5 h-1.5 bg-[#bfa979] rotate-45" />
                            </div>
                        )}
                    </div>
                </div>

                <style>{`
                    @keyframes dialogue-box-appear {
                        0% {
                            opacity: 0;
                            filter: blur(12px);
                            transform: scale(0.97);
                        }
                        100% {
                            opacity: 1;
                            filter: blur(0px);
                            transform: scale(1);
                        }
                    }
                `}</style>
            </div>
        </>
    );
});

export default DialogueUI;