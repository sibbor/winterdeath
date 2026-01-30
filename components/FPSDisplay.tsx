
import React from 'react';

interface FPSDisplayProps {
    fps: number;
}

const FPSDisplay: React.FC<FPSDisplayProps> = ({ fps }) => {
    return (
        <div className="fixed top-0 right-0 z-[9999] bg-black/50 text-white/50 px-2 py-1 font-mono text-[10px] pointer-events-none select-none backdrop-blur-sm border-b border-l border-white/10">
            {fps} FPS
        </div>
    );
};

export default FPSDisplay;