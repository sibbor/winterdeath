
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { getSpeakerColor } from '../../utils/assets';

interface CinematicBubbleProps {
    text: string;
    speakerName: string;
    isVisible: boolean;
    domRef: React.RefObject<HTMLDivElement>;
    tailPosition?: 'bottom' | 'top' | 'left' | 'right';
}

interface TextToken {
    type: 'text' | 'action' | 'italic';
    content: string;
}

const CinematicBubble: React.FC<CinematicBubbleProps> = ({ text, speakerName, isVisible, domRef, tailPosition = 'bottom' }) => {
    const [visibleCount, setVisibleCount] = useState(0);
    const [opacity, setOpacity] = useState(0);
    const timerRef = useRef<number | null>(null);

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
                        return prev;
                    }
                });
            }, 30); // 30ms per character
        } else {
            setOpacity(0);
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

    // Calculate tail styles
    const getTailStyles = () => {
        const size = 12;
        const borderWidth = 2;

        const base = "absolute w-0 h-0 border-solid pointer-events-none";
        const innerBase = "absolute w-0 h-0 border-solid pointer-events-none z-[1]";

        switch (tailPosition) {
            case 'top':
                return {
                    outer: `${base} left-1/2 -translate-x-1/2 top-[-${size + borderWidth}px] border-l-[${size}px] border-l-transparent border-r-[${size}px] border-r-transparent border-b-[${size + borderWidth}px]`,
                    inner: `${innerBase} left-1/2 -translate-x-1/2 top-[-${size}px] border-l-[${size}px] border-l-transparent border-r-[${size}px] border-r-transparent border-b-[${size}px]`,
                    outerStyle: { borderBottomColor: borderColor },
                    innerStyle: { borderBottomColor: bgColor },
                    containerTransform: 'translate(-50%, 20px)'
                };
            case 'left':
                return {
                    outer: `${base} top-1/2 -translate-y-1/2 left-[-${size + borderWidth}px] border-t-[${size}px] border-t-transparent border-b-[${size}px] border-b-transparent border-r-[${size + borderWidth}px]`,
                    inner: `${innerBase} top-1/2 -translate-y-1/2 left-[-${size}px] border-t-[${size}px] border-t-transparent border-b-[${size}px] border-b-transparent border-r-[${size}px]`,
                    outerStyle: { borderRightColor: borderColor },
                    innerStyle: { borderRightColor: bgColor },
                    containerTransform: 'translate(20px, -50%)'
                };
            case 'right':
                return {
                    outer: `${base} top-1/2 -translate-y-1/2 right-[-${size + borderWidth}px] border-t-[${size}px] border-t-transparent border-b-[${size}px] border-b-transparent border-l-[${size + borderWidth}px]`,
                    inner: `${innerBase} top-1/2 -translate-y-1/2 right-[-${size}px] border-t-[${size}px] border-t-transparent border-b-[${size}px] border-b-transparent border-l-[${size}px]`,
                    outerStyle: { borderLeftColor: borderColor },
                    innerStyle: { borderLeftColor: bgColor },
                    containerTransform: 'translate(calc(-100% - 20px), -50%)'
                };
            case 'bottom':
            default:
                return {
                    outer: `${base} left-1/2 -translate-x-1/2 bottom-[-${size + borderWidth}px] border-l-[${size}px] border-l-transparent border-r-[${size}px] border-r-transparent border-t-[${size + borderWidth}px]`,
                    inner: `${innerBase} left-1/2 -translate-x-1/2 bottom-[-${size}px] border-l-[${size}px] border-l-transparent border-r-[${size}px] border-r-transparent border-t-[${size}px]`,
                    outerStyle: { borderTopColor: borderColor },
                    innerStyle: { borderTopColor: bgColor },
                    containerTransform: 'translate(-50%, calc(-100% - 20px))'
                };
        }
    };

    const tail = getTailStyles();

    return (
        <div
            ref={domRef}
            className="absolute pointer-events-none z-50"
            style={{
                left: 0,
                top: 0,
                opacity: opacity,
                transform: tail.containerTransform,
                transition: 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.3s ease-out'
            }}
        >
            <div className="relative">
                <div
                    className={`px-6 py-4 rounded-2xl shadow-xl max-w-sm border-2 ${textColor}`}
                    style={{ backgroundColor: bgColor, borderColor: borderColor }}
                >
                    <h4 className="text-lg font-black uppercase tracking-widest opacity-70 mb-1">{speakerName}</h4>
                    <p className="text-lg font-bold leading-tight font-mono whitespace-pre-wrap">
                        {renderContent()}
                        {isVisible && visibleCount < fullTextLength && (
                            <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1 align-middle" />
                        )}
                    </p>
                </div>

                {/* Tail Outer (Border) */}
                <div className={tail.outer} style={tail.outerStyle} />
                {/* Tail Inner (Fill) */}
                <div className={tail.inner} style={tail.innerStyle} />
            </div>
        </div>
    );
};

export default CinematicBubble;
