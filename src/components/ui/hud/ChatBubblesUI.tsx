import React, { useEffect, useRef, useState } from 'react';

const MAX_BUBBLES = 5;

const ChatBubblesUI: React.FC = () => {
    const [bubbles, setBubbles] = useState<any[]>(
        Array.from({ length: MAX_BUBBLES }, (_, i) => ({
            id: i,
            text: '',
            version: 0,
            duration: 3000,
            active: false
        }))
    );
    const nextIdx = useRef(0);
    const lastMessageRef = useRef<string | null>(null);

    useEffect(() => {
        const handleSpawn = (e: Event) => {
            const { text, duration = 3000 } = (e as CustomEvent).detail;

            // Deduplication
            if (lastMessageRef.current === text) return;
            lastMessageRef.current = text;
            setTimeout(() => { lastMessageRef.current = null; }, 100);

            const idx = nextIdx.current;

            setBubbles(prev => {
                const next = [...prev];
                next[idx] = {
                    ...next[idx],
                    text,
                    version: next[idx].version + 1,
                    duration,
                    active: true
                };
                return next;
            });

            nextIdx.current = (nextIdx.current + 1) % MAX_BUBBLES;
        };

        window.addEventListener('spawn-bubble', handleSpawn);
        return () => window.removeEventListener('spawn-bubble', handleSpawn);
    }, []);

    // ZERO-GC / NO TIMEOUTS: Lyssna på när CSS-animationen är klar
    const handleAnimationEnd = (id: number, version: number) => {
        setBubbles(prev => {
            const next = [...prev];
            // Stäng bara av om det fortfarande är samma version (bubblan har inte blivit återanvänd under tiden)
            if (next[id].version === version) {
                next[id] = { ...next[id], active: false };
            }
            return next;
        });
    };

    return (
        <div className="absolute inset-0 pointer-events-none z-[60] flex flex-col items-center justify-center pb-[15%]">
            {bubbles.map((bubble) => (
                <div
                    key={`${bubble.id}_${bubble.version}`}
                    onAnimationEnd={() => handleAnimationEnd(bubble.id, bubble.version)}
                    className="mt-2 px-6 py-3 rounded-sm bg-black/90 border-l-4 border-teal-500 text-teal-400 font-black shadow-2xl text-center min-w-[250px] uppercase tracking-tighter"
                    style={{
                        display: bubble.active ? 'block' : 'none',
                        willChange: 'transform, opacity',
                        animation: bubble.active ? `chat-bubble-anim ${bubble.duration}ms cubic-bezier(0.25, 1, 0.5, 1) forwards` : 'none'
                    }}
                >
                    {bubble.text}
                </div>
            ))}

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