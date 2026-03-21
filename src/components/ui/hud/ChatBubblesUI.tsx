import React, { useEffect, useState } from 'react';

interface Bubble {
    id: string;
    text: string;
    duration: number;
}

const ChatBubblesUI: React.FC = () => {
    const [bubbles, setBubbles] = useState<Bubble[]>([]);

    useEffect(() => {
        const handleSpawn = (e: Event) => {
            const customEvent = e as CustomEvent;
            const { text, duration } = customEvent.detail;

            const id = Math.random().toString(36).substring(2, 9);
            const newBubble = { id, text, duration };

            setBubbles(prev => [...prev, newBubble]);

            // React tar automatiskt bort bubblan när duration har passerat
            setTimeout(() => {
                setBubbles(prev => prev.filter(b => b.id !== id));
            }, duration);
        };

        window.addEventListener('spawn-bubble', handleSpawn);
        return () => window.removeEventListener('spawn-bubble', handleSpawn);
    }, []);

    if (bubbles.length === 0) return null;

    return (
        <div className="absolute inset-0 pointer-events-none z-50 flex flex-col items-center justify-center pb-[10%]">
            {bubbles.map((b) => (
                <div
                    key={b.id}
                    className="chat-bubble-anim mt-2 px-4 py-2 rounded bg-black/80 border border-teal-500 text-teal-300 font-bold shadow-[0_0_15px_rgba(20,184,166,0.5)] text-center min-w-[200px]"
                    style={{
                        // CSS-animation reads the time and does the whole process
                        animationDuration: `${b.duration}ms`
                    }}
                >
                    {b.text}
                </div>
            ))}

            {/* Add the GPU animation here or in your global CSS file */}
            <style>{`
                @keyframes chat-bubble-anim {
                    0% { opacity: 0; transform: translateY(20px) scale(0.9); }
                    10% { opacity: 1; transform: translateY(0) scale(1); }
                    85% { opacity: 1; transform: translateY(-10px) scale(1); }
                    100% { opacity: 0; transform: translateY(-20px) scale(0.9); }
                }
                .chat-bubble-anim {
                    animation-name: chat-bubble-anim;
                    animation-timing-function: cubic-bezier(0.25, 1, 0.5, 1);
                    animation-fill-mode: forwards;
                }
            `}</style>
        </div>
    );
};

export default ChatBubblesUI;