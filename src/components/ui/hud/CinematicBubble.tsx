import React, { useEffect, useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { t } from '../../../utils/i18n';
import { HudStore } from '../../../store/HudStore';
import { DataResolver } from '../../../utils/ui/DataResolver';

interface CinematicBubbleProps {
    isMobileDevice?: boolean;
    onComplete?: () => void;
}

export interface CinematicBubbleHandle {
    finishTyping: () => boolean;
}

interface TextToken {
    type: 'text' | 'action' | 'italic';
    content: string;
    cleanContent: string;
}

const CONTAINER_HIDDEN = "fixed left-0 right-0 z-[100] flex justify-center pointer-events-none transition-all duration-500 ease-out bottom-[-20%] opacity-0";
const CONTAINER_VISIBLE = "fixed left-0 right-0 z-[100] flex justify-center pointer-events-none transition-all duration-500 ease-out bottom-[calc(12%+25px)] opacity-100";

const CinematicBubble = forwardRef<CinematicBubbleHandle, CinematicBubbleProps>(({ isMobileDevice, onComplete }, ref) => {
    // ZERO-GC: No more reactive useHudStore selectors for fast data.
    // We'll manage visibility and text via local state but update content via ref.
    const [isVisible, setIsVisible] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    const [speakerName, setSpeakerName] = useState('');
    const [bgColor, setBgColor] = useState('#000');

    const timerRef = useRef<number | null>(null);
    const visibleCountRef = useRef<number>(0);
    const textContainerRef = useRef<HTMLSpanElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const rawTextRef = useRef('');

    // Pre-calculate tokens locally when text changes via subscription
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

    // ZERO-GC: Use synchronous store listener instead of reactive hooks
    useEffect(() => {
        return HudStore.subscribe(() => {
            const state = HudStore.getState();
            const active = state.cinematicActive && state.currentLine.active && !!state.currentLine.text;
            
            if (active) {
                const newText = t(state.currentLine.text);
                if (newText !== rawTextRef.current) {
                    rawTextRef.current = newText;
                    
                    // Tokenize (Once per line)
                    const regex = /(\([^)]+\)|\/[^/]+\/)/g;
                    const parts = newText.split(regex);
                    currentTokens.current = parts.map((part): TextToken => {
                        if (part.startsWith('(') && part.endsWith(')')) return { type: 'action', content: part, cleanContent: part.replace(/[()]/g, '') };
                        if (part.startsWith('/') && part.endsWith('/')) return { type: 'italic', content: part, cleanContent: part.replace(/\//g, '') };
                        return { type: 'text', content: part, cleanContent: part };
                    }).filter(t => t.content.length > 0);

                    totalCharsRef.current = currentTokens.current.reduce((acc, t) => acc + t.cleanContent.length, 0);
                    
                    setSpeakerName(state.currentLine.speaker || '');
                    setBgColor(DataResolver.getSpeakerColor(state.currentLine.speaker));
                    setIsVisible(true);
                    startTyping();
                }
            } else {
                if (isVisible) {
                    setIsVisible(false);
                    rawTextRef.current = '';
                    if (timerRef.current) {
                        clearInterval(timerRef.current);
                        timerRef.current = null;
                    }
                }
            }
        });
    }, [isVisible, updateDOMText]);

    const startTyping = () => {
        visibleCountRef.current = 0;
        setIsFinished(false);
        updateDOMText(0);

        if (timerRef.current !== null) clearInterval(timerRef.current);
        timerRef.current = window.setInterval(() => {
            if (visibleCountRef.current < totalCharsRef.current) {
                visibleCountRef.current += 1;
                updateDOMText(visibleCountRef.current);
            } else {
                if (timerRef.current !== null) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                }
                setIsFinished(true);
                if (onComplete) onComplete();
            }
        }, 30);
    };

    useImperativeHandle(ref, () => ({
        finishTyping: () => {
            if (!isFinished && isVisible) {
                if (timerRef.current !== null) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                }
                setIsFinished(true);
                visibleCountRef.current = totalCharsRef.current;
                updateDOMText(totalCharsRef.current);
                if (onComplete) onComplete();
                return true;
            }
            return false;
        }
    }));

    return (
        <div ref={containerRef} className={isVisible ? CONTAINER_VISIBLE : CONTAINER_HIDDEN}>
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
                            <span className="text-white text-[9px] uppercase tracking-[0.3em] font-black mr-3">
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

export default CinematicBubble;