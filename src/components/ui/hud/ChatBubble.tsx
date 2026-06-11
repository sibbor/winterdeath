import React, { useRef, forwardRef, useImperativeHandle, useCallback, useEffect } from 'react';
import { useUIEventBridge } from '../../../hooks/useUIEventBridge';
import { UIEventType, ChatBubbleSubtype, CHAT_BUBBLE_DURATIONS } from '../../../systems/ui/UIEventRingBuffer';
import { COLORS } from '../../../utils/ui/ColorUtils';
import { t } from '../../../utils/i18n';
import { VoiceSounds } from '../../../utils/audio/AudioLib';
import { FamilyMemberID } from '../../../content/constants';

const MAX_BUBBLES = 5;

/**
 * ChatBubblePooled - ZERO-GC DOM Component
 */
const ChatBubblePooled = forwardRef((_, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const versionRef = useRef(0);

    useImperativeHandle(ref, () => ({
        spawn: (text: string, duration: number, subType: ChatBubbleSubtype) => {
            if (!containerRef.current || !contentRef.current) return;

            const v = ++versionRef.current;
            contentRef.current.innerText = text;

            if (subType === ChatBubbleSubtype.THOUGHT) {
                containerRef.current.style.borderLeft = `4px dashed ${COLORS.CYAN.str}`;
                containerRef.current.style.color = COLORS.CYAN.str;
            } else if (subType === ChatBubbleSubtype.SPEAK) {
                containerRef.current.style.borderLeft = `4px solid ${COLORS.WHITE.str}`;
                containerRef.current.style.color = COLORS.WHITE.str;
            } else {
                containerRef.current.style.borderLeft = `4px solid ${COLORS.TEAL.str}`;
                containerRef.current.style.color = COLORS.TEAL.str;
            }

            containerRef.current.style.display = 'block';
            containerRef.current.style.animation = `chat-bubble-anim ${duration}ms cubic-bezier(0.25, 1, 0.5, 1) forwards`;

            const onEnd = () => {
                if (versionRef.current === v) {
                    if (containerRef.current) {
                        containerRef.current.style.display = 'none';
                        containerRef.current.style.animation = 'none';
                    }
                }
                containerRef.current?.removeEventListener('animationend', onEnd);
            };
            containerRef.current.addEventListener('animationend', onEnd);
        }
    }));

    return (
        <div
            ref={containerRef}
            className="mt-2 px-6 py-3 rounded-sm bg-black/90 font-black shadow-2xl text-center min-w-[250px] uppercase tracking-tighter"
            style={{ display: 'none', willChange: 'transform, opacity', borderLeft: `4px solid ${COLORS.TEAL.str}`, color: COLORS.TEAL.str }}
        >
            <div ref={contentRef} />
        </div>
    );
});

const ChatBubble: React.FC = () => {
    const bubbleRefs = useRef<any[]>([]);
    const nextIdx = useRef(0);
    const lastMessageRef = useRef<string | null>(null);

    // FIXED: High-performance Realtime Latch protects against variable bridge timestamps
    const lastSpawnTimeRef = useRef<number>(0);

    const handleSpawn = useCallback((type: UIEventType, p1: any, p2: number) => {
        if (type !== UIEventType.CHAT_BUBBLE) return;

        const text = typeof p1 === 'string' ? p1 : '';
        if (!text) return;

        // Translate if it's an i18n key (contains a dot like 'dialogue.foo' and has no spaces)
        const localizedText = (text.includes('.') && !text.includes(' ')) ? t(text) : text;

        // FIXED: Deterministic Delta Throttling (Zero-GC)
        // If the exact same text stream bombs the component frame-by-frame, enforce a strict
        // 500ms cooldown threshold to kill kulsprute audio/visual loops instantly.
        if (lastMessageRef.current === localizedText) {
            if (Date.now() - lastSpawnTimeRef.current < 500) {
                return;
            }
        }
        lastMessageRef.current = localizedText;
        lastSpawnTimeRef.current = Date.now();

        // Decode duration and subtype from p2 without magic numbers
        const p2Duration = p2 > 0 ? (p2 & 0xFFFF) : 0;
        const subType = p2 > 0 ? ((p2 >> 16) & 0xFF) as ChatBubbleSubtype : ChatBubbleSubtype.GENERIC;
        const duration = p2Duration > 0 ? p2Duration : CHAT_BUBBLE_DURATIONS[subType];

        const idx = nextIdx.current;
        const bubble = bubbleRefs.current[idx];
        if (bubble) {
            bubble.spawn(localizedText, duration, subType);
        }

        // Play the player's voice (FamilyMemberID.ROBERT is the protagonist/player) if speaking
        if (subType === ChatBubbleSubtype.SPEAK) {
            VoiceSounds.playDialogueBeep(FamilyMemberID.ROBERT);
        }

        nextIdx.current = (nextIdx.current + 1) % MAX_BUBBLES;
    }, []);

    useUIEventBridge(handleSpawn);

    const setBubbleRef = (index: number) => (el: any) => {
        if (el) bubbleRefs.current[index] = el;
    };

    return (
        <div className="absolute inset-0 pointer-events-none z-[60] flex flex-col items-center justify-center pb-[15%]">
            <ChatBubblePooled ref={setBubbleRef(0)} />
            <ChatBubblePooled ref={setBubbleRef(1)} />
            <ChatBubblePooled ref={setBubbleRef(2)} />
            <ChatBubblePooled ref={setBubbleRef(3)} />
            <ChatBubblePooled ref={setBubbleRef(4)} />

            <style>{`
                @keyframes chat-bubble-anim {
                    0% { opacity: 0; transform: translateY(30px) scale(0.8); filter: blur(10px); }
                    10% { opacity: 1; transform: translateY(0) scale(1.1); filter: blur(0px); }
                    15% { transform: scale(1); }
                    85% { opacity: 1; transform: translateY(-10px) scale(1); }
                    100% { opacity: 0; transform: translateY(-30px) scale(0.9); }
                }
            `}</style>
        </div>
    );
};

export default ChatBubble;