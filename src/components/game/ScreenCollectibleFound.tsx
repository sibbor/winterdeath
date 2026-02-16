
import React, { useEffect } from 'react';
import { t } from '../../utils/i18n';
import { soundManager } from '../../utils/sound';
import { CollectibleDefinition } from '../../content/collectibles';
import CollectiblePreview from '../ui/core/CollectiblePreview';

interface ScreenCollectibleFoundProps {
    collectible: CollectibleDefinition;
    onClose: () => void;
    isMobileDevice?: boolean;
}

const ScreenCollectibleFound: React.FC<ScreenCollectibleFoundProps> = ({ collectible, onClose, isMobileDevice }) => {

    return (
        <div className="absolute inset-0 z-[200] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 sm:p-8" onClick={(e) => e.stopPropagation()}>
            <div className={`max-w-2xl w-full border-4 border-yellow-500/30 bg-black ${isMobileDevice ? 'p-6' : 'p-12'} shadow-[0_0_80px_rgba(255,215,0,0.15)] flex flex-col items-center text-center relative skew-x-[-1deg] overflow-y-auto max-h-[90vh]`}>

                {/* Title */}
                <h2 className={`${isMobileDevice ? 'text-2xl mb-2' : 'text-4xl mb-6'} font-black uppercase tracking-tighter text-yellow-500`}>
                    {t(collectible.nameKey)}
                </h2>

                {/* Model Preview - 3D Render */}
                <div className={`relative ${isMobileDevice ? 'w-40 h-40 mb-4' : 'w-80 h-80 mb-6'} flex items-center justify-center bg-zinc-900 border-2 border-zinc-800 rounded-lg shadow-inner overflow-hidden flex-shrink-0`}>
                    <CollectiblePreview type={collectible.modelType} />
                </div>

                <div className="space-y-4 mb-8 sm:mb-10">
                    <p className={`${isMobileDevice ? 'text-sm' : 'text-xl'} text-slate-200 font-mono italic leading-relaxed`}>
                        {t(collectible.descriptionKey).split('\n').map((line, i) => (
                            <React.Fragment key={i}>
                                {line}
                                {i < t(collectible.descriptionKey).split('\n').length - 1 && <br />}
                            </React.Fragment>
                        ))}
                    </p>

                    <div className="flex items-center justify-center gap-4 py-2 border-y border-yellow-500/10">
                        <span className="text-yellow-500 font-black tracking-widest uppercase text-base sm:text-lg">
                            +1 {t('ui.skill_point')}
                        </span>
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="group relative px-8 sm:px-12 py-3 sm:py-4 bg-zinc-900 hover:bg-yellow-600 text-yellow-500 hover:text-black font-black uppercase tracking-widest border-2 border-yellow-500 transition-all duration-300 active:scale-95 skew-x-[-5deg] flex-shrink-0">
                    <span className="block skew-x-[5deg]">{t('ui.continue')}</span>

                    {/* Button Glow */}
                    <div className="absolute inset-0 bg-yellow-500/20 opacity-0 group-hover:opacity-100 blur-xl transition-opacity"></div>
                </button>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .anim-fade-in {
                    animation: fadeIn 0.4s ease-out forwards;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: scale(1.05); }
                    to { opacity: 1; transform: scale(1); }
                }
            `}} />
        </div>
    );
};

export default ScreenCollectibleFound;
