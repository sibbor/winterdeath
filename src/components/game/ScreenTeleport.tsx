
import React, { useState } from 'react';
import { t } from '../../utils/i18n';
import GameModalLayout from './GameModalLayout';
import { soundManager } from '../../utils/sound';

interface ScreenTeleportProps {
    onJump: (x: number, z: number) => void;
    onCancel: () => void;
    initialCoords?: { x: number, z: number } | null;
    isMobileDevice?: boolean;
}

const ScreenTeleport: React.FC<ScreenTeleportProps> = ({ onJump, onCancel, initialCoords, isMobileDevice }) => {
    const [coords, setCoords] = useState({
        x: initialCoords ? Math.round(initialCoords.x).toString() : "",
        z: initialCoords ? Math.round(initialCoords.z).toString() : ""
    });

    const buttonStyle = "w-full py-4 font-black uppercase tracking-wider transition-all duration-200 border-2 shadow-lg hover:scale-105 active:scale-95 skew-x-[-10deg]";

    const handleJump = () => {
        const x = parseFloat(coords.x);
        const z = parseFloat(coords.z);
        if (!isNaN(x) && !isNaN(z)) {
            onJump(x, z);
        } else {
            soundManager.playUiClick(); // Error sound in theory
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (coords.x !== "" && coords.z !== "") {
                handleJump();
            }
        }
    };

    return (
        <GameModalLayout title={t('ui.teleport_title')} titleColorClass="text-white" maxWidthClass="max-w-2xl" isMobile={isMobileDevice}>
            <div className="space-y-8" onKeyDown={handleKeyDown}>
                <div className={`flex ${isMobileDevice ? 'flex-col sm:flex-row' : ''} gap-4 justify-center items-center`}>
                    <div className="flex flex-col items-start gap-2">
                        <label className="text-xs uppercase font-bold text-blue-400 tracking-widest">{t('ui.teleport_x')}</label>
                        <input
                            type="number"
                            value={coords.x}
                            onChange={(e) => setCoords({ ...coords, x: e.target.value })}
                            className={`bg-black/80 border-2 border-blue-900 text-white ${isMobileDevice ? 'p-3 text-lg w-32' : 'p-4 text-xl w-40'} font-mono focus:border-blue-500 outline-none text-center shadow-[0_0_15px_rgba(37,99,235,0.3)]`}
                            placeholder="0"
                            autoFocus={!initialCoords && !isMobileDevice} // No autoFocus on mobile to avoid keyboard pop-up
                        />
                    </div>
                    <div className="flex flex-col items-start gap-2">
                        <label className="text-xs uppercase font-bold text-blue-400 tracking-widest">{t('ui.teleport_z')}</label>
                        <input
                            type="number"
                            value={coords.z}
                            onChange={(e) => setCoords({ ...coords, z: e.target.value })}
                            className={`bg-black/80 border-2 border-blue-900 text-white ${isMobileDevice ? 'p-3 text-lg w-32' : 'p-4 text-xl w-40'} font-mono focus:border-blue-500 outline-none text-center shadow-[0_0_15px_rgba(37,99,235,0.3)]`}
                            placeholder="0"
                        />
                    </div>
                </div>

                <div className="flex gap-4">
                    <button onClick={onCancel} className={`${buttonStyle} bg-transparent text-gray-500 border-gray-700 hover:text-white hover:border-white`}>
                        <span className="block skew-x-[10deg]">{t('ui.cancel')}</span>
                    </button>
                    <button
                        onClick={handleJump}
                        disabled={coords.x === "" || coords.z === ""}
                        className={`${buttonStyle} ${coords.x !== "" && coords.z !== "" ? 'bg-blue-700 border-blue-500 text-white hover:bg-blue-600 shadow-[0_0_20px_rgba(37,99,235,0.5)]' : 'bg-gray-900 border-gray-800 text-gray-700 cursor-not-allowed'}`}
                    >
                        <span className="block skew-x-[10deg]">{t('ui.jump')}</span>
                    </button>
                </div>
            </div>
        </GameModalLayout>
    );
};

export default ScreenTeleport;
