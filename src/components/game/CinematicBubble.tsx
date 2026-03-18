import React, { useEffect, useState, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { t } from '../../utils/i18n';
import { HudStore } from '../../core/systems/HudStore';
import { getSpeakerColor } from '../../utils/assets';

interface CinematicBubbleProps {
    isMobileDevice?: boolean;
    onComplete?: () => void;
}

export interface CinematicBubbleHandle {
    finishTyping: () => boolean; // Returns true if it was still typing and forced finish, false if already finished
}

interface TextToken {
    type: 'text' | 'action' | 'italic';
    content: string;
}

const CinematicBubble = forwardRef<CinematicBubbleHandle, CinematicBubbleProps>(({ isMobileDevice, onComplete }, ref) => {
    const [bubbleData, setBubbleData] = useState<{ text: string, speakerName: string, isVisible: boolean }>({ text: '', speakerName: '', isVisible: false });
    const { text, speakerName, isVisible } = bubbleData;
    
    const [visibleCount, setVisibleCount] = useState(0);
    const [opacity, setOpacity] = useState(0);
    const [isFinished, setIsFinished] = useState(false);
    const timerRef = useRef<number | null>(null);

    useImperativeHandle(ref, () => ({
        finishTyping: () => {
            if (!isFinished && isVisible && text) {
                if (timerRef.current) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                }
                setIsFinished(true);
                setVisibleCount(fullTextLength);
                if (onComplete) onComplete();
                return true;
            }
            return false;
        }
    }));

    // 1. Parse text into tokens (Standard, Action, Italic)
    const tokens = useMemo<TextToken[]>(() => {
        if (!text) return [];
        const regex = /(\([^)]+\)|\/[^/]+\/)/g;
        // Split and keep delimiters
        const parts = text.split(regex);

        return parts.map((part): TextToken => {
            if (part.startsWith('(') && part.endsWith(')')) {
                return { type: 'action', content: part };
            } else if (part.startsWith('/') && part.endsWith('/')) {
                return { type: 'italic', content: part };
            } else {
                return { type: 'text', content: part };
            }
        }).filter(t => t.content.length > 0);
    }, [text]);

    // 2. Calculate total length excluding formatting characters for pure typing feel?
    // For simplicity, we count string length including tokens, but we strip the delimiters in render.
    // Actually, let's count characters as they appear on screen.
    const fullTextLength = tokens.reduce((acc, token) => acc + token.content.length, 0);

    useEffect(() => {
        const unsubscribe = HudStore.subscribe((data) => {
            const hasLine = data.cinematicActive && data.currentLine;
            setBubbleData({
                text: hasLine ? t(data.currentLine.text) : '',
                speakerName: hasLine ? data.currentLine.speaker : '',
                isVisible: !!hasLine
            });
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (isVisible && text) {
            setOpacity(1);
            setVisibleCount(0);

            if (timerRef.current) clearInterval(timerRef.current);

            timerRef.current = window.setInterval(() => {
                setVisibleCount(prev => {
                    if (prev < fullTextLength) {
                        return prev + 1; // 1 char at a time
                    } else {
                        if (timerRef.current) clearInterval(timerRef.current);
                        setIsFinished(true);
                        if (onComplete) onComplete();
                        return prev;
                    }
                });
            }, 30); // 30ms per character
        } else {
            setOpacity(0);
            setIsFinished(false);
            if (timerRef.current) clearInterval(timerRef.current);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [text, isVisible, fullTextLength]);

    const bgColor = getSpeakerColor(speakerName);
    const isDark = ['#111111', '#222222', '#000000'].includes(bgColor);
    const textColor = 'text-white';
    const borderColor = 'rgba(255, 255, 255, 0.3)';

    // Render Logic
    const renderContent = () => {
        let currentIdx = 0;

        return tokens.map((token, i) => {
            const start = currentIdx;
            const end = start + token.content.length;

            // If completely hidden
            if (visibleCount <= start) {
                currentIdx = end;
                return null;
            }

            // Determine slice
            const visibleLength = Math.min(token.content.length, visibleCount - start);
            let displayStr = token.content.substring(0, visibleLength);

            // Styling & Cleanup
            let className = "";
            let style = {};

            if (token.type === 'action') {
                className = "italic";
                // Strip parentheses for display
                displayStr = displayStr.replace(/[()]/g, '');
            } else if (token.type === 'italic') {
                className = isDark ? "italic" : "italic";
                // Strip slashes for display
                displayStr = displayStr.replace(/\//g, '');
            }

            currentIdx = end;

            return (
                <span key={i} className={className} style={style}>
                    {displayStr}
                </span>
            );
        });
    };

    // Render Cinematic Bottom Bar
    return (
        <div
            className={`fixed left-0 right-0 z-[100] flex justify-center pointer-events-none transition-all duration-500 ease-out`}
            style={{
                bottom: isVisible ? 'calc(12% + 25px)' : '-20%',
                opacity: opacity,
            }}
        >
            <div
                className={`w-[90%] md:w-[60%] max-w-4xl relative ${isMobileDevice ? 'scale-90 origin-bottom' : ''}`}
            >
                {/* Dialogue Text Background */}
                <div className="hud-bar-container bg-black/95 backdrop-blur-xl p-6 md:p-8 min-h-[100px] relative shadow-2xl">
                    {/* Speaker Accent Line */}
                    <div
                        className="absolute top-0 left-0 w-2 h-full opacity-60"
                        style={{ backgroundColor: bgColor }}
                    />

                    {/* Content */}
                    <p className="text-white/90 text-sm md:text-xl font-mono leading-relaxed ml-4" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}>
                        {speakerName && (
                            <span className="font-black mr-3 uppercase tracking-widest text-xs md:text-sm block mb-1" style={{ color: bgColor }}>
                                {speakerName}
                            </span>
                        )}
                        <span className="hud-text-glow">{renderContent()}</span>
                        {isVisible && visibleCount < fullTextLength && (
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
