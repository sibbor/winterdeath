
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { getSpeakerColor } from '../../utils/assets';

interface CinematicBubbleProps {
    text: string;
    speakerName: string;
    isVisible: boolean;
    domRef: React.RefObject<HTMLDivElement>;
}

interface TextToken {
    type: 'text' | 'action' | 'italic';
    content: string;
}

const CinematicBubble: React.FC<CinematicBubbleProps> = ({ text, speakerName, isVisible, domRef }) => {
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
    const textColor = isDark ? 'text-white' : 'text-black';
    const borderColor = isDark ? 'border-white/30' : 'border-black/30';

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
                className = "text-yellow-500 italic text-sm"; // Action color override
                // RemoveParens if fully typed or partial? 
                // Let's just keep them for context or strip them. 
                // DialogueOverlay stripped them. Let's strip them but we need to handle the slice index carefully.
                // Simpler: Keep them in DOM but style them.
            } else if (token.type === 'italic') {
                className = isDark ? "text-gray-400 italic" : "text-gray-600 italic";
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

    return (
        <div 
            ref={domRef}
            className="absolute pointer-events-none z-50 transition-opacity duration-300"
            style={{ 
                left: 0, 
                top: 0, 
                opacity: opacity,
                transform: 'translate(-50%, -100%)' // Centered and above anchor
            }}
        >
            <div className="relative mb-4">
                <div 
                    className={`px-6 py-4 rounded-2xl shadow-xl max-w-sm border-2 ${textColor} ${borderColor}`}
                    style={{ backgroundColor: bgColor }}
                >
                    <h4 className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">{speakerName}</h4>
                    <p className="text-lg font-bold leading-tight font-mono whitespace-pre-wrap">
                        {renderContent()}
                        {isVisible && visibleCount < fullTextLength && (
                            <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1 align-middle"/>
                        )}
                    </p>
                </div>
                
                {/* Tail */}
                <div 
                    className={`absolute left-1/2 -translate-x-1/2 bottom-[-10px] w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[10px]`}
                    style={{ borderTopColor: bgColor }} // Match bg
                />
            </div>
        </div>
    );
};

export default CinematicBubble;
