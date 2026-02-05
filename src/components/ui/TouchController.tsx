
import React, { useRef, useEffect, useState } from 'react';
import { t } from '../../utils/i18n';

interface JoystickProps {
    onMove: (x: number, y: number) => void;
    onEnd: () => void;
    size?: number;
    color?: string;
    label?: string;
}

const Joystick: React.FC<JoystickProps> = ({ onMove, onEnd, size = 120, color = 'white', label }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isTouching, setIsTouching] = useState(false);
    const [stickPos, setStickPos] = useState({ x: 0, y: 0 });

    const handleTouch = (clientX: number, clientY: number) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let dx = clientX - centerX;
        let dy = clientY - centerY;

        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = rect.width / 2;

        if (dist > maxDist) {
            dx = (dx / dist) * maxDist;
            dy = (dy / dist) * maxDist;
        }

        setStickPos({ x: dx, y: dy });
        onMove(dx / maxDist, dy / maxDist);
    };

    const onStart = (e: React.TouchEvent | React.MouseEvent) => {
        if ('touches' in e) {
            if (e.cancelable) e.preventDefault();
        }
        setIsTouching(true);
        const touch = 'touches' in e ? e.touches[0] : e;
        handleTouch(touch.clientX, touch.clientY);
    };

    const onUpdate = (e: TouchEvent | MouseEvent) => {
        if (!isTouching) return;
        if ('touches' in e) {
            if (e.cancelable) e.preventDefault();
        }
        const touch = 'touches' in e ? e.touches[0] : e;
        handleTouch(touch.clientX, touch.clientY);
    };

    const onStop = () => {
        setIsTouching(false);
        setStickPos({ x: 0, y: 0 });
        onEnd();
    };

    useEffect(() => {
        if (isTouching) {
            window.addEventListener('touchmove', onUpdate, { passive: false });
            window.addEventListener('touchend', onStop, { passive: false });
            window.addEventListener('mousemove', onUpdate);
            window.addEventListener('mouseup', onStop);
        }
        return () => {
            window.removeEventListener('touchmove', onUpdate);
            window.removeEventListener('touchend', onStop);
            window.removeEventListener('mousemove', onUpdate);
            window.removeEventListener('mouseup', onStop);
        };
    }, [isTouching]);

    return (
        <div
            ref={containerRef}
            className="relative flex items-center justify-center rounded-full border-2 border-white/20 bg-white/5 backdrop-blur-sm select-none"
            style={{ width: size, height: size }}
            onTouchStart={onStart}
            onMouseDown={onStart}
        >
            {label && (
                <div className="absolute -top-8 text-[10px] uppercase tracking-widest text-white/40 font-bold whitespace-nowrap">
                    {label}
                </div>
            )}
            <div
                className="w-12 h-12 rounded-full shadow-lg transition-transform duration-75 ease-out"
                style={{
                    backgroundColor: color,
                    transform: `translate3d(${stickPos.x}px, ${stickPos.y}px, 0)`,
                    boxShadow: `0 0 20px ${color}88`
                }}
            />
        </div>
    );
};

interface TouchControllerProps {
    onMove: (x: number, y: number) => void;
    onAim: (x: number, y: number) => void;
    onFire: (isFiring: boolean) => void;
    onReload?: () => void;
    onAction?: () => void;
}

const TouchController: React.FC<TouchControllerProps> = ({ onMove, onAim, onFire, onReload, onAction }) => {
    const [, setTick] = useState(0);

    useEffect(() => {
        const handleLocaleChange = () => setTick(t => t + 1);
        window.addEventListener('locale-changed', handleLocaleChange);
        return () => window.removeEventListener('locale-changed', handleLocaleChange);
    }, []);

    return (
        <div className="fixed inset-0 pointer-events-none z-[100] select-none">
            {/* Left Joystick: Movement */}
            <div className="absolute bottom-12 left-12 pointer-events-auto">
                <Joystick
                    label={t('ui.scavenging')}
                    onMove={onMove}
                    onEnd={() => onMove(0, 0)}
                    color="#3b82f6"
                />
            </div>

            {/* Right Joystick: Aim & Fire */}
            <div className="absolute bottom-12 right-12 pointer-events-auto">
                <Joystick
                    label={t('ui.combat')}
                    onMove={(x, y) => {
                        onAim(x, y);
                        const dist = Math.sqrt(x * x + y * y);
                        if (dist > 0.3) onFire(true);
                        else onFire(false);
                    }}
                    onEnd={() => {
                        onAim(0, 0);
                        onFire(false);
                    }}
                    color="#ef4444"
                />
            </div>

            {/* Action Buttons */}
            <div className="absolute bottom-48 right-12 flex flex-col gap-4 pointer-events-auto">
                {onAction && (
                    <button
                        className="w-16 h-16 rounded-full border-2 border-white/30 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center text-white active:scale-90 transition-transform overflow-hidden px-1"
                        onClick={onAction}
                    >
                        <span className="text-sm font-bold leading-none">{t('ui.interact')}</span>
                        <span className="text-[8px] opacity-40 mt-1">E</span>
                    </button>
                )}
                {onReload && (
                    <button
                        className="w-16 h-16 rounded-full border-2 border-white/30 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center text-white active:scale-90 transition-transform overflow-hidden px-1"
                        onClick={onReload}
                    >
                        <span className="text-xs font-bold leading-none">{t('ui.reload')}</span>
                        <span className="text-[8px] opacity-40 mt-1">R</span>
                    </button>
                )}
            </div>
        </div>
    );
};

export default TouchController;
