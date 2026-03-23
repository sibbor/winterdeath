import React, { useEffect, useRef } from 'react';

const MAX_BUBBLES = 5; // Vi behöver sällan se fler än 5 samtidigt

const ChatBubblesUI: React.FC = () => {
    // Vi skapar en pool av referenser till våra div-element
    const bubbleRefs = useRef<(HTMLDivElement | null)[]>([]);
    const nextIdx = useRef(0);
    const lastMessageRef = useRef<string | null>(null);

    useEffect(() => {
        const handleSpawn = (e: Event) => {
            const { text, duration = 3000 } = (e as CustomEvent).detail;

            // Deduplication (Precis som din originalkod)
            if (lastMessageRef.current === text) return;
            lastMessageRef.current = text;
            setTimeout(() => { lastMessageRef.current = null; }, 100);

            // Hämta nästa div från poolen (Circular buffer)
            const idx = nextIdx.current;
            const el = bubbleRefs.current[idx];

            if (el) {
                // 1. Sätt texten direkt i DOM
                el.innerText = text;

                // 2. Starta om CSS-animationen genom att "resetta" den
                el.style.animation = 'none';
                // Triggar en reflow för att webbläsaren ska fatta att animationen är borta
                void el.offsetWidth;

                // 3. Applicera animationen igen
                el.style.display = 'block';
                el.style.animation = `chat-bubble-anim ${duration}ms cubic-bezier(0.25, 1, 0.5, 1) forwards`;

                // 4. Göm den när den är klar för att frigöra plats visuellt
                setTimeout(() => {
                    if (el) el.style.display = 'none';
                }, duration);
            }

            nextIdx.current = (nextIdx.current + 1) % MAX_BUBBLES;
        };

        window.addEventListener('spawn-bubble', handleSpawn);
        return () => window.removeEventListener('spawn-bubble', handleSpawn);
    }, []);

    return (
        <div className="absolute inset-0 pointer-events-none z-[60] flex flex-col items-center justify-center pb-[15%]">
            {/* Vi renderar alla divar direkt, men gömmer dem med display: none */}
            {Array.from({ length: MAX_BUBBLES }).map((_, i) => (
                <div
                    key={i}
                    ref={(el) => (bubbleRefs.current[i] = el)}
                    className="mt-2 px-6 py-3 rounded-sm bg-black/90 border-l-4 border-teal-500 text-teal-400 font-black shadow-2xl text-center min-w-[250px] uppercase tracking-tighter"
                    style={{ display: 'none', willChange: 'transform, opacity' }}
                />
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