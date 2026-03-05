import React, { useEffect, useState, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { getSpeakerColor } from '../../utils/assets';

interface CinematicBubbleProps {
    text: string;
    speakerName: string;
    isVisible: boolean;
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

const CinematicBubble = forwardRef<CinematicBubbleHandle, CinematicBubbleProps>(({ text, speakerName, isVisible, isMobileDevice, onComplete }, ref) => {
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
                <div className="bg-[#111]/95 backdrop-blur-md border border-white/10 shadow-2xl p-6 md:p-8 min-h-[120px] relative overflow-hidden">
                    {/* Subtle Top Gradient Line matching speaker color */}
                    <div
                        className="absolute top-0 left-0 w-full h-1 opacity-20"
                        style={{
                            background: `linear-gradient(90deg, ${bgColor} 0%, transparent 100%)`
                        }}
                    />

                    {/* Content */}
                    <p className="text-white/90 text-sm md:text-lg font-mono leading-relaxed mt-1" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                        {speakerName && (
                            <span className="font-bold mr-3 uppercase tracking-wider" style={{ color: bgColor }}>
                                {speakerName}{text ? ':' : ''}
                            </span>
                        )}
                        {renderContent()}
                        {isVisible && visibleCount < fullTextLength && (
                            <span className="inline-block w-2 md:w-3 h-4 md:h-5 bg-white/70 animate-pulse ml-1 align-middle" />
                        )}
                    </p>

                    {/* Progress Indicator */}
                    {isFinished && isVisible && (
                        <div className="absolute bottom-3 right-4 flex items-center opacity-50 animate-bounce">
                            <span className="text-white/50 text-[10px] uppercase tracking-widest mr-2 font-mono">
                                {isMobileDevice ? 'Tap' : 'Click'}
                            </span>
                            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-white/70" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export default CinematicBubble;
