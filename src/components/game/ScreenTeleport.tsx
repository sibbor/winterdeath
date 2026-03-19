import React, { useState } from 'react';
import { t } from '../../utils/i18n';
import ScreenModalLayout from '../ui/ScreenModalLayout';

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

    const handleJump = () => {
        const x = parseFloat(coords.x);
        const z = parseFloat(coords.z);
        if (!isNaN(x) && !isNaN(z)) {
            onJump(x, z);
        }
    };

    return (
        <ScreenModalLayout
            title={t('ui.teleport_title')}
            isMobileDevice={isMobileDevice}
            onClose={onCancel}
            onCancel={onCancel}
            cancelLabel={t('ui.cancel')}
            onConfirm={handleJump}
            confirmLabel={t('ui.jump')}
            canConfirm={coords.x !== "" && coords.z !== ""}
            showCloseButton={true}
            isSmall={true}
        >
            <div className="space-y-8 py-4">
                <div className={`flex ${isMobileDevice ? 'flex-col sm:flex-row' : ''} gap-4 justify-center items-center`}>
                    <div className="flex flex-col items-start gap-2">
                        <label className="text-xs uppercase font-bold text-blue-400 tracking-widest">{t('ui.teleport_x')}</label>
                        <input
                            type="number"
                            value={coords.x}
                            onChange={(e) => setCoords({ ...coords, x: e.target.value })}
                            className={`bg-black/80 border-2 border-blue-900 text-white ${isMobileDevice ? 'p-3 text-lg w-32' : 'p-4 text-xl w-40'} font-mono focus:border-blue-500 outline-none text-center shadow-[0_0_15px_rgba(37,99,235,0.3)]`}
                            placeholder="0"
                            autoFocus={!initialCoords && !isMobileDevice}
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
            </div>
        </ScreenModalLayout>
    );
};

export default ScreenTeleport;
