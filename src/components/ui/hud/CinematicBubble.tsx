import React, { useEffect, useState, useRef, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { t } from '../../../utils/i18n';
import { useHudStore } from '../../../hooks/useHudStore';
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

// Extract static constants to prevent inline allocations
const CONTAINER_HIDDEN = "fixed left-0 right-0 z-[100] flex justify-center pointer-events-none transition-all duration-500 ease-out bottom-[-20%] opacity-0";
const CONTAINER_VISIBLE = "fixed left-0 right-0 z-[100] flex justify-center pointer-events-none transition-all duration-500 ease-out bottom-[calc(12%+25px)] opacity-100";

// ZERO-GC: Static speaker metadata resolution occurs via DataResolver

const CinematicBubble = forwardRef<CinematicBubbleHandle, CinematicBubbleProps>(({ isMobileDevice, onComplete }, ref) => {
    // ============================================================================
    // ZERO-GC PRIMITIVE SELECTORS
    // ============================================================================
    const cinematicActive = useHudStore(s => s.cinematicActive);
    const lineActive = useHudStore(s => s.currentLine.active);
    const rawText = useHudStore(s => s.currentLine.text);
    const speakerName = useHudStore(s => s.currentLine.speaker);

    const isVisible = cinematicActive && lineActive && !!rawText

    // Translate ONLY once when the raw string changes
    const translatedText = useMemo(() => (rawText ? t(rawText) : ''), [rawText]);

    // React state is ONLY used for start/end triggers, NOT the 30ms typing ticks
    const [isFinished, setIsFinished] = useState(false);

    // Mutable refs for high-frequency animation logic
    const timerRef = useRef<number | null>(null);
    const visibleCountRef = useRef<number>(0);
    const textContainerRef = useRef<HTMLSpanElement>(null);

    // 1. Parse text into tokens efficiently (Once per line)
    const tokens = useMemo<TextToken[]>(() => {
        if (!translatedText) return [];
        const regex = /(\([^)]+\)|\/[^/]+\/)/g;
        const parts = translatedText.split(regex);

        return parts.map((part): TextToken => {
            if (part.startsWith('(') && part.endsWith(')')) {
                return { type: 'action', content: part, cleanContent: part.replace(/[()]/g, '') };
            } else if (part.startsWith('/') && part.endsWith('/')) {
                return { type: 'italic', content: part, cleanContent: part.replace(/\//g, '') };
            } else {
                return { type: 'text', content: part, cleanContent: part };
            }
        }).filter(t => t.content.length > 0);
    }, [translatedText]);

    // 2. Calculate total length
    const fullTextLength = useMemo(() => {
        let len = 0;
        for (let i = 0; i < tokens.length; i++) {
            len += tokens[i].cleanContent.length;
        }
        return len;
    }, [tokens]);

    // Direct DOM mutator function (Zero-GC string builder, completely bypasses React VDOM)
    const updateDOMText = useCallback((count: number) => {
        if (!textContainerRef.current) return;

        let currentIdx = 0;
        let html = "";

        // Use standard for-loop over map for absolute zero-GC
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const start = currentIdx;
            const end = start + token.cleanContent.length;

            if (count <= start) break;

            const visibleLength = Math.min(token.cleanContent.length, count - start);
            const displayStr = token.cleanContent.substring(0, visibleLength);

            let className = "";
            if (token.type === 'action') className = "italic opacity-80";
            else if (token.type === 'italic') className = "italic";

            if (className) {
                html += `<span class="${className}">${displayStr}</span>`;
            } else {
                html += displayStr; // Raw text without spans is slightly faster
            }

            currentIdx = end;
        }

        textContainerRef.current.innerHTML = html;
    }, [tokens]);

    useImperativeHandle(ref, () => ({
        finishTyping: () => {
            if (!isFinished && isVisible && translatedText) {
                if (timerRef.current !== null) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                }
                setIsFinished(true);
                visibleCountRef.current = fullTextLength;
                updateDOMText(fullTextLength);
                if (onComplete) onComplete();
                return true;
            }
            return false;
        }
    }));

    // 3. Typing Effect Logic (Runs entirely outside React's render phase)
    useEffect(() => {
        if (isVisible && translatedText) {
            visibleCountRef.current = 0;
            setIsFinished(false);
            updateDOMText(0); // Clear immediately

            if (timerRef.current !== null) clearInterval(timerRef.current);

            timerRef.current = window.setInterval(() => {
                if (visibleCountRef.current < fullTextLength) {
                    visibleCountRef.current += 1;
                    updateDOMText(visibleCountRef.current);
                } else {
                    if (timerRef.current !== null) {
                        clearInterval(timerRef.current);
                        timerRef.current = null;
                    }
                    setIsFinished(true); // Trigger final React render
                    if (onComplete) onComplete();
                }
            }, 30); // 30ms per character
        } else {
            setIsFinished(false);
            if (timerRef.current !== null) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }

        return () => {
            if (timerRef.current !== null) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [translatedText, isVisible, fullTextLength, onComplete, updateDOMText]);

    const bgColor = useMemo(() => DataResolver.getSpeakerColor(speakerName), [speakerName]);

    // Extract dynamic styles to avoid inline object allocation per render
    const lineStyle = useMemo(() => ({ backgroundColor: bgColor }), [bgColor]);
    const textStyle = useMemo(() => ({ color: bgColor }), [bgColor]);

    return (
        <div className={isVisible ? CONTAINER_VISIBLE : CONTAINER_HIDDEN}>
            <div className={`w-[90%] md:w-[60%] max-w-4xl relative ${isMobileDevice ? 'scale-90 origin-bottom' : ''}`}>

                {/* Dialogue Text Background */}
                <div className="hud-bar-container bg-black/95 backdrop-blur-xl p-6 md:p-8 min-h-[100px] relative shadow-2xl">

                    {/* Speaker Accent Line */}
                    <div className="absolute top-0 left-0 w-2 h-full opacity-60" style={lineStyle} />

                    {/* Content */}
                    <p className="text-white/90 text-sm md:text-xl font-mono leading-relaxed ml-4 drop-shadow-md">
                        {speakerName && (
                            <span className="font-black mr-3 uppercase tracking-widest text-xs md:text-sm block mb-1" style={textStyle}>
                                {speakerName}
                            </span>
                        )}

                        {/* ZERO-GC DOM Container - Updated strictly via innerHTML */}
                        <span ref={textContainerRef} className="hud-text-glow"></span>

                        {isVisible && !isFinished && (
                            <span className="inline-block w-2 md:w-3 h-5 md:h-6 bg-white/50 animate-pulse ml-1 align-middle" />
                        )}
                    </p>

                    {/* Progress Indicator */}
                    {isFinished && isVisible && (
                        <div className="absolute bottom-4 right-6 flex items-center opacity-30 animate-pulse">
                            <span className="text-white text-[9px] uppercase tracking-[0.3em] font-black mr-3">
                                {isMobileDevice ? 'TAP' : 'CONTINUE'}
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