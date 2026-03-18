import React, { useEffect, useState } from 'react';
import { HudStore } from '../../core/systems/HudStore';

const ChatBubblesUI: React.FC = () => {
    const [bubbles, setBubbles] = useState<any[]>([]);

    useEffect(() => {
        const unsubscribe = HudStore.subscribe((data) => {
            if (data.activeBubbles) {
                setBubbles(data.activeBubbles);
            } else if (bubbles.length > 0) {
                setBubbles([]);
            }
        });
        return unsubscribe;
    }, [bubbles.length]);

    if (bubbles.length === 0) return null;

    return (
        <div className="absolute inset-0 pointer-events-none z-50">
            {bubbles.map(b => (
                <div
                    key={b.id}
                    className="absolute text-center px-4 py-2 pointer-events-none rounded bg-black bg-opacity-80 border border-teal-500 text-teal-300 font-bold shadow-[0_0_15px_rgba(20,184,166,0.5)] z-50 animate-pulse"
                    style={{
                        left: `${b.pos.x}px`,
                        top: `${b.pos.y}px`,
                        transform: `translate(-50%, calc(-100% + ${b.slideY}px))`,
                        opacity: b.opacity,
                        zIndex: b.zIndex,
                        transition: 'top 0.3s ease-out',
                        minWidth: '200px'
                    }}
                >
                    {b.text}
                </div>
            ))}
        </div>
    );
};

export default ChatBubblesUI;
