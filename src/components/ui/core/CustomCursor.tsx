import React, { useEffect, useRef } from 'react';

interface CustomCursorProps {
    hidden?: boolean;
}

const CustomCursor: React.FC<CustomCursorProps> = ({ hidden = false }) => {
    const cursorRef = useRef<HTMLDivElement>(null);
    const ringRef = useRef<HTMLDivElement>(null);
    const dotRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            if (cursorRef.current) {
                // Zero-GC: Direkt DOM-manipulation
                cursorRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
            }
        };

        const onMouseDown = () => {
            if (ringRef.current && dotRef.current) {
                // Ring animation
                ringRef.current.classList.replace('scale-100', 'scale-75');
                ringRef.current.classList.replace('opacity-100', 'opacity-80');
                ringRef.current.classList.add('border-blue-300');

                // Dot animation
                dotRef.current.classList.replace('scale-100', 'scale-125');
            }
        };

        const onMouseUp = () => {
            if (ringRef.current && dotRef.current) {
                // Ring revert
                ringRef.current.classList.replace('scale-75', 'scale-100');
                ringRef.current.classList.replace('opacity-80', 'opacity-100');
                ringRef.current.classList.remove('border-blue-300');

                // Dot revert
                dotRef.current.classList.replace('scale-125', 'scale-100');
            }
        };

        window.addEventListener('mousemove', onMouseMove, { passive: true });
        window.addEventListener('mousedown', onMouseDown, { passive: true });
        window.addEventListener('mouseup', onMouseUp, { passive: true });

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
            style={{ transform: 'translate3d(-100px, -100px, 0) translate(-50%, -50%)' }} // Initial off-screen
        >
            <div
                ref={ringRef}
                className="relative flex items-center justify-center w-8 h-8 rounded-full border-2 border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.8),inset_0_0_10px_rgba(59,130,246,0.2)] transition-transform duration-100 ease-out scale-100 opacity-100"
            >
                <div
                    ref={dotRef}
                    className="w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,1)] transition-transform duration-100 scale-100"
                />
            </div>
        </div>
    );
};

export default React.memo(CustomCursor);