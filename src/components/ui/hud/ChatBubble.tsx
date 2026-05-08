import React, { useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import { useUIEventBridge } from '../../../hooks/useUIEventBridge';
import { UIEventType } from '../../../systems/ui/UIEventRingBuffer';
import { COLORS } from '../../../utils/ui/ColorUtils';

const MAX_BUBBLES = 5;

/**
 * ChatBubblePooled - ZERO-GC DOM Component
 */
const ChatBubblePooled = forwardRef((_, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const versionRef = useRef(0);

    useImperativeHandle(ref, () => ({
        spawn: (text: string, duration: number) => {
            if (!containerRef.current || !contentRef.current) return;

            const v = ++versionRef.current;
            contentRef.current.innerText = text;

            // Trigger animation and visibility (Direct CSS mutation)
            containerRef.current.style.display = 'block';
            containerRef.current.style.animation = `chat-bubble-anim ${duration}ms cubic-bezier(0.25, 1, 0.5, 1) forwards`;

            // Use AnimationEnd to hide, but version check ensures we don't hide 
            // a bubble that was re-used during its exit animation.
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

    const handleSpawn = useCallback((type: UIEventType, text: any, duration: number = 3000) => {
        if (type !== UIEventType.CHAT_BUBBLE) return;

        // Deduplication (Zero-GC)
        if (lastMessageRef.current === text) return;
        lastMessageRef.current = text;
        setTimeout(() => { lastMessageRef.current = null; }, 100);

        const idx = nextIdx.current;
        const bubble = bubbleRefs.current[idx];
        if (bubble) {
            bubble.spawn(text, duration);
        }

        nextIdx.current = (nextIdx.current + 1) % MAX_BUBBLES;
    }, []);

    useUIEventBridge(handleSpawn);

    const setBubbleRef = (index: number) => (el: any) => {
        if (el) bubbleRefs.current[index] = el;
    };

    return (
        <div className="absolute inset-0 pointer-events-none z-[60] flex flex-col items-center justify-center pb-[15%]">
            {/* ZERO-GC: Pre-allocated Permanent Pool (Never mapped at runtime) */}
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
