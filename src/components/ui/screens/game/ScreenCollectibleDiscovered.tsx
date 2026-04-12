import React, { useEffect } from 'react';
import { t } from '../../../../utils/i18n';
import { UiSounds } from '../../../../utils/audio/AudioLib';
import ScreenModalLayout from '../../layout/ScreenModalLayout';
import { getCollectibleById } from '../../../../content/collectibles';
import CollectiblePreview from '../../core/CollectiblePreview';

interface ScreenCollectibleDiscoveredProps {
    collectibleId: string;
    onClose: () => void;
    isMobileDevice?: boolean;
}

const ScreenCollectibleDiscovered: React.FC<ScreenCollectibleDiscoveredProps> = ({ collectibleId, onClose, isMobileDevice }) => {
    const def = getCollectibleById(collectibleId);
 
    useEffect(() => {
        UiSounds.playLevelUp();

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || e.key === 'Enter') {
                e.preventDefault();
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [onClose]);

    if (!def) return null;

    const collectibleTitle = t(`collectibles.${def.sector}.${def.index}.title`);
    const collectibleDescription = t(`collectibles.${def.sector}.${def.index}.description`);

    return (
        <ScreenModalLayout
            title={t('ui.collectible_discovered')}
            isMobileDevice={isMobileDevice}
            onConfirm={onClose}
            confirmLabel={t('ui.continue')}
            isSmall={true}
            titleColorClass="text-yellow-500"
        >
            <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex items-center justify-center gap-3">
                    <div className="h-[1px] w-8 bg-yellow-500/30"></div>
                    <span className="text-xl font-black uppercase tracking-[0.5em] text-yellow-500/60 mb-2 block animate-pulse">
                        {collectibleTitle}
                    </span>
                    <div className="h-[1px] w-8 bg-yellow-500/30"></div>
                </div>

                {/* Collector Icon/Preview */}
                <div className="w-48 h-48 sm:w-64 sm:h-64 my-6 relative flex items-center justify-center">
                    <div className="absolute inset-0 bg-yellow-500/5 rounded-full blur-3xl animate-pulse"></div>
                    <div className="relative w-full h-full border border-white/10 p-4 bg-black/40 backdrop-blur-md">
                        <CollectiblePreview type={def.modelType} />
                    </div>
                </div>

                <div className="max-w-md px-4 mt-4">
                    <p className="text-zinc-400 text sm:text-base leading-relaxed font-medium italic">
                        "{collectibleDescription}"
                    </p>
                </div>
            </div>
        </ScreenModalLayout>
    );
};

export default ScreenCollectibleDiscovered;