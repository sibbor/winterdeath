import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

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
            className="mt-2 px-6 py-3 rounded-sm bg-black/90 border-l-4 border-teal-500 text-teal-400 font-black shadow-2xl text-center min-w-[250px] uppercase tracking-tighter"
            style={{ display: 'none', willChange: 'transform, opacity' }}
        >
            <div ref={contentRef} />
        </div>
    );
});

const ChatBubblesUI: React.FC = () => {
    const bubbleRefs = useRef<any[]>([]);
    const nextIdx = useRef(0);
    const lastMessageRef = useRef<string | null>(null);

    useEffect(() => {
        const handleSpawn = (e: Event) => {
            const { text, duration = 3000 } = (e as CustomEvent).detail;

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
        };

        window.addEventListener('spawn-bubble', handleSpawn);
        return () => window.removeEventListener('spawn-bubble', handleSpawn);
    }, []);

    return (
        <div className="absolute inset-0 pointer-events-none z-[60] flex flex-col items-center justify-center pb-[15%]">
            {/* ZERO-GC: Pre-allocated Permanent Pool (Never mapped at runtime) */}
            <ChatBubblePooled ref={el => bubbleRefs.current[0] = el} />
            <ChatBubblePooled ref={el => bubbleRefs.current[1] = el} />
            <ChatBubblePooled ref={el => bubbleRefs.current[2] = el} />
            <ChatBubblePooled ref={el => bubbleRefs.current[3] = el} />
            <ChatBubblePooled ref={el => bubbleRefs.current[4] = el} />

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

export default ChatBubblesUI;