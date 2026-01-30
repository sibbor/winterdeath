import React, { useEffect, useRef, useState } from 'react';

interface CustomCursorProps {
    hidden?: boolean;
}

const CustomCursor: React.FC<CustomCursorProps> = ({ hidden = false }) => {
    const cursorRef = useRef<HTMLDivElement>(null);
    const [isClicked, setIsClicked] = useState(false);

    useEffect(() => {
        // Direct DOM update for performance
        const onMouseMove = (e: MouseEvent) => {
            if (cursorRef.current) {
                // Using translate3d forces GPU acceleration
                cursorRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
            }
        };

        const onMouseDown = () => setIsClicked(true);
        const onMouseUp = () => setIsClicked(false);

        // Add listeners to window to catch events everywhere with passive flag for performance
        window.addEventListener('mousemove', onMouseMove, { passive: true });
        window.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mouseup', onMouseUp);

        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, []);

    return (
        <div 
            ref={cursorRef}
            className={`fixed top-0 left-0 pointer-events-none z-[9999] will-change-transform transition-opacity duration-200 ${hidden ? 'opacity-0' : 'opacity-100'}`}
            style={{ transform: 'translate3d(-100px, -100px, 0)' }} // Initial off-screen
        >
            <div className={`
                relative flex items-center justify-center
                w-8 h-8 rounded-full 
                border-2 border-blue-400 
                shadow-[0_0_15px_rgba(59,130,246,0.8),inset_0_0_10px_rgba(59,130,246,0.2)]
                transition-transform duration-100 ease-out
                ${isClicked ? 'scale-75 opacity-80 border-blue-300' : 'scale-100 opacity-100'}
            `}>
                <div className={`
                    w-1.5 h-1.5 bg-white rounded-full 
                    shadow-[0_0_8px_rgba(255,255,255,1)]
                    transition-transform duration-100
                    ${isClicked ? 'scale-125' : 'scale-100'}
                `} />
            </div>
        </div>
    );
};

export default CustomCursor;