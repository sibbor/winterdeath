
import React, { useEffect } from 'react';
import { t } from '../../utils/i18n';
import { soundManager } from '../../utils/sound';
import { CollectibleDefinition } from '../../content/collectibles';
import CollectiblePreview from '../ui/core/CollectiblePreview';

interface ScreenCollectibleFoundProps {
    collectible: CollectibleDefinition;
    onClose: () => void;
}

const ScreenCollectibleFound: React.FC<ScreenCollectibleFoundProps> = ({ collectible, onClose }) => {

    useEffect(() => {
        // We already play this in the interaction system, but can add a secondary jingle if needed
        // soundManager.playUiConfirm(); 
    }, []);

    return (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-8" onClick={(e) => e.stopPropagation()}>
            <div className="max-w-2xl w-full border-4 border-yellow-500/30 bg-black p-12 shadow-[0_0_80px_rgba(255,215,0,0.15)] flex flex-col items-center text-center relative skew-x-[-1deg]">

                {/* Header Decoration */}
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-yellow-600 text-black px-6 py-1 font-black uppercase tracking-tighter text-sm skew-x-[-10deg]">
                    {t('ui.collectible_discovered')}
                </div>

                <h2 className="text-5xl font-black text-yellow-500 uppercase tracking-tighter mb-8 border-b-4 border-yellow-700/50 pb-2 inline-block skew-x-[-3deg]">
                    {t(collectible.nameKey)}
                </h2>

                {/* Model Preview - 3D Render */}
                <div className="relative w-64 h-64 mb-6 flex items-center justify-center bg-zinc-900 border-2 border-zinc-800 rounded-lg shadow-inner overflow-hidden">
                    <CollectiblePreview type={collectible.modelType} />

                    {/* Glow effect */}
                    <div className="absolute inset-0 bg-yellow-500/5 blur-3xl rounded-full"></div>
                </div>

                <div className="space-y-4 mb-10">
                    <p className="text-xl text-slate-200 font-mono italic leading-relaxed">
                        {t(collectible.descriptionKey).split('\n').map((line, i) => (
                            <React.Fragment key={i}>
                                {line}
                                {i < t(collectible.descriptionKey).split('\n').length - 1 && <br />}
                            </React.Fragment>
                        ))}
                    </p>

                    <div className="flex items-center justify-center gap-4 py-2 border-y border-yellow-500/10">
                        <span className="text-yellow-500 font-black tracking-widest uppercase text-lg">
                            +1 {t('ui.skill_point')}
                        </span>
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="group relative px-12 py-4 bg-zinc-900 hover:bg-yellow-600 text-yellow-500 hover:text-black font-black uppercase tracking-widest border-2 border-yellow-500 transition-all duration-300 active:scale-95 skew-x-[-5deg]">
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
