import React from 'react';
import { t } from '../../utils/i18n';
import ScreenModalLayout from '../ui/ScreenModalLayout';
import { getCollectibleById } from '../../content/collectibles';
import CollectiblePreview from '../ui/core/CollectiblePreview';

interface ScreenCollectibleDiscoveredProps {
    collectibleId: string;
    onClose: () => void;
    isMobileDevice?: boolean;
}

const ScreenCollectibleDiscovered: React.FC<ScreenCollectibleDiscoveredProps> = ({ collectibleId, onClose, isMobileDevice }) => {
    const def = getCollectibleById(collectibleId);

    if (!def) return null;

    return (
        <ScreenModalLayout
            title={t(def.nameKey)}
            isMobileDevice={isMobileDevice}
            onClose={onClose}
            onConfirm={onClose}
            confirmLabel={t('ui.continue')}
            isSmall={true}
            titleColorClass="text-yellow-500"
        >
            <div className="flex flex-col items-center text-center">
                <div className="mb-4">
                    <span className="text-[10px] font-black uppercase tracking-[0.5em] text-yellow-500/60 mb-2 block animate-pulse">
                        {t('ui.collectible_discovered')}
                    </span>
                </div>

                {/* Collector Icon/Preview */}
                <div className="w-48 h-48 sm:w-64 sm:h-64 my-6 relative flex items-center justify-center">
                    <div className="absolute inset-0 bg-yellow-500/5 rounded-full blur-3xl animate-pulse"></div>
                    <div className="relative w-full h-full border border-white/10 p-4 bg-black/40 backdrop-blur-md">
                        <CollectiblePreview type={def.modelType} />
                    </div>
                </div>

                <div className="max-w-md px-4 mt-4">
                    <p className="text-zinc-400 text-sm sm:text-base leading-relaxed font-medium italic">
                        "{t(def.descriptionKey)}"
                    </p>
                    <div className="mt-6 flex items-center justify-center gap-3">
                        <div className="h-[1px] w-8 bg-yellow-500/30"></div>
                        <span className="text-[10px] uppercase font-bold tracking-widest text-yellow-500/60">
                            {t(`ui.type_${def.modelType.toLowerCase()}`)}
                        </span>
                        <div className="h-[1px] w-8 bg-yellow-500/30"></div>
                    </div>
                </div>
            </div>
        </ScreenModalLayout>
    );
};

export default ScreenCollectibleDiscovered;