
import React from 'react';

interface GameModalLayoutProps {
    title: string | React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
    titleColorClass?: string; // e.g. text-red-600
    maxWidthClass?: string; // e.g. max-w-4xl
    blurClass?: string; // e.g. backdrop-blur-xl
    isMobile?: boolean;
}

const GameModalLayout: React.FC<GameModalLayoutProps> = ({
    title,
    children,
    footer,
    titleColorClass = "text-white",
    maxWidthClass = "max-w-xl",
    blurClass = "backdrop-blur-md",
    isMobile = false
}) => {
    return (
        <div className={`absolute inset-0 bg-black/20 z-[60] flex items-center justify-center ${blurClass} p-2 md:p-4`}>
            <div className={`w-full ${maxWidthClass} max-h-[90vh] md:max-h-none text-center bg-black border-4 border-gray-800 shadow-[0_0_50px_rgba(220,38,38,0.2)] relative overflow-hidden flex flex-col`}>

                {/* Background Decoration */}
                <div className="absolute top-0 right-0 opacity-10 pointer-events-none">
                    <svg viewBox="0 0 100 100" width="300" height="300" fill="red"><path d="M10 10 L90 10 L50 90 Z" /></svg>
                </div>

                {/* Header */}
                <div className="p-4 md:p-8 pb-0 relative z-10 shrink-0">
                    <div className={`mb-4 md:mb-8 border-b-4 pb-4 ${titleColorClass.includes('blue') ? 'border-blue-600' : 'border-red-900'}`}>
                        {typeof title === 'string' ? (
                            <h2 className={`text-4xl md:text-6xl font-black uppercase tracking-tighter inline-block skew-x-[-10deg] ${titleColorClass}`}>
                                {title}
                            </h2>
                        ) : (
                            title
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="px-4 md:px-16 pb-8 md:pb-12 relative z-10 overflow-y-auto">
                    {children}
                </div>

                {/* Footer */}
                {footer && (
                    <div className={`${isMobile ? 'p-4' : 'p-6'} bg-gray-900/50 border-t-2 border-gray-800 flex justify-center gap-4`}>
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};

export default GameModalLayout;
