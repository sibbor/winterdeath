import React from 'react';
import { t } from '../../utils/i18n';
import { soundManager } from '../../utils/SoundManager';
import { getCollectibleById } from '../../content/collectibles';
import CollectiblePreview from '../ui/core/CollectiblePreview';

interface ScreenCollectibleDiscoveredProps {
    collectibleId: string;
    onClose: () => void;
}

const ScreenCollectibleDiscovered: React.FC<ScreenCollectibleDiscoveredProps> = ({ collectibleId, onClose }) => {
    const def = getCollectibleById(collectibleId);

    if (!def) return null;

    return (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-[200] p-4 backdrop-blur-3xl animate-fade-in pointer-events-auto cursor-default">
            {/* Scanned Background Texture */}
            <div className="absolute inset-0 opacity-10 pointer-events-none mix-blend-screen"
                style={{ backgroundImage: 'url("/assets/textures/gritty_overlay.png")', backgroundSize: 'cover' }} />

            <div className="relative w-full max-w-2xl flex flex-col items-center text-center">
                <div className="mb-4">
                    <span className="text-[10px] font-black uppercase tracking-[0.5em] text-yellow-500/60 mb-2 block animate-pulse">
                        {t('ui.collectible_discovered')}
                    </span>
                    <h2 className="text-4xl sm:text-6xl font-black uppercase italic tracking-tighter text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">
                        {t(def.nameKey)}
                    </h2>
                </div>

                {/* Collector Icon/Preview */}
                <div className="w-48 h-48 sm:w-64 sm:h-64 my-4 relative">
                    <div className="absolute inset-0 bg-yellow-500/10 rounded-full blur-3xl animate-pulse"></div>
                    <div className="relative w-full h-full border border-white/10 p-4 bg-black/40 backdrop-blur-md">
                         <CollectiblePreview type={def.type} size="xl" />
                    </div>
                </div>

                <div className="max-w-md px-4">
                    <p className="text-zinc-400 text-sm sm:text-base leading-relaxed font-medium italic">
                        "{t(def.descKey)}"
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-2">
                         <div className="h-[1px] w-8 bg-yellow-500/30"></div>
                         <span className="text-[10px] uppercase font-bold tracking-widest text-yellow-500/40">
                             {t(`ui.type_${def.type.toLowerCase()}`)}
                         </span>
                         <div className="h-[1px] w-8 bg-yellow-500/30"></div>
                    </div>
                </div>

                <button
                    onClick={() => { soundManager.playUiClick(); onClose(); }}
                    className="mt-8 px-12 py-4 bg-white text-black font-black uppercase tracking-widest transition-all duration-200 hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.3)]"
                >
                    {t('ui.continue')}
                </button>
            </div>

            {/* Corner Accents */}
            <div className="absolute top-8 left-8 w-12 h-12 border-t-2 border-l-2 border-white/20"></div>
            <div className="absolute top-8 right-8 w-12 h-12 border-t-2 border-r-2 border-white/20"></div>
            <div className="absolute bottom-8 left-8 w-12 h-12 border-b-2 border-l-2 border-white/20"></div>
            <div className="absolute bottom-8 right-8 w-12 h-12 border-b-2 border-r-2 border-white/20"></div>
        </div>
    );
};

export default ScreenCollectibleDiscovered;