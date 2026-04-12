import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useHudStore } from '../../../hooks/useHudStore';
import { t } from '../../../utils/i18n';
import { UiSounds } from '../../../utils/audio/AudioLib';
import { DiscoveryType } from './HudTypes';
import { DataResolver } from '../../../utils/ui/DataResolver';
import { PERKS, PerkCategory } from '../../../content/perks';

interface DiscoveryPopupProps {
  onOpenAdventureLog: (tab?: string, itemId?: string) => void;
}

/**
 * DiscoveryPopup - VINTERDÖD CUSTOM UI
 * Minimal, visual discovery notifications with mobile/desktop parity.
 */
let lastProcessedTimestamp = 0;

const DiscoveryPopup: React.FC<DiscoveryPopupProps> = React.memo(({ onOpenAdventureLog }) => {
  const isActive = useHudStore(s => s.discovery.active);
  const timestamp = useHudStore(s => s.discovery.timestamp);
  const id = useHudStore(s => s.discovery.id);
  const type = useHudStore(s => s.discovery.type);
  const isMobile = useHudStore(s => s.isMobileDevice);

  const [visible, setVisible] = useState(false);
  const [activeDiscovery, setActiveDiscovery] = useState<any>(null);

  useEffect(() => {
    if (isActive && timestamp > lastProcessedTimestamp) {
      lastProcessedTimestamp = timestamp;
      setActiveDiscovery({ id, type, timestamp });
      setVisible(true);
      UiSounds.playDiscovery();
    }
  }, [isActive, timestamp, id, type]);

  const handleInteraction = useCallback(() => {
    setVisible(prevVisible => {
      if (!prevVisible) return prevVisible;
      UiSounds.playDiscovery();
      const tab = DataResolver.getAdventureLogTab(activeDiscovery?.type);
      onOpenAdventureLog(tab, activeDiscovery?.id);
      return false;
    });
  }, [activeDiscovery, onOpenAdventureLog]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') handleInteraction();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleInteraction]);

  const handleAnimationEnd = () => setVisible(false);

  // --- CONTENT RESOLUTION ---
  const content = useMemo(() => {
    if (!activeDiscovery) return null;
    const { id, type } = activeDiscovery;

    let icon = '🔍';
    let subtitle = '';

    switch (type) {
      case DiscoveryType.CLUE:
        icon = '🔍';
        subtitle = t('ui.clue');
        break;
      case DiscoveryType.POI:
        icon = '📍';
        subtitle = t(DataResolver.getPoiName(id));
        break;
      case DiscoveryType.COLLECTIBLE:
        icon = '📦';
        subtitle = t(DataResolver.getCollectibleName(id));
        break;
      case DiscoveryType.ENEMY:
      case DiscoveryType.BOSS:
        icon = type === DiscoveryType.BOSS ? '💀' : '🧟';
        subtitle = t(DataResolver.getEnemyName(Number(id), type === DiscoveryType.BOSS ? Number(id) : -1));
        break;
      case DiscoveryType.PERK:
        const perk = PERKS[Number(id)];
        icon = perk?.icon || '✨';
        const catKey = perk?.category === PerkCategory.PASSIVE ? 'ui.passive' : (perk?.category === PerkCategory.BUFF ? 'ui.buff' : 'ui.debuff');
        subtitle = `${t(catKey)}: ${t(perk?.displayName || '')}`;
        break;
    }

    return { icon, subtitle };
  }, [activeDiscovery]);

  if (!activeDiscovery || !content) return null;

  return (
    <div
      key={activeDiscovery.timestamp}
      onAnimationEnd={handleAnimationEnd}
      className="fixed top-12 left-1/2 -translate-x-1/2 z-[200] pointer-events-auto"
      style={{
        display: visible ? 'block' : 'none',
        animation: visible ? `discovery-pop 4500ms cubic-bezier(0.25, 1, 0.5, 1) forwards` : 'none'
      }}
      onClick={handleInteraction}
    >
      <div className="bg-black/90 border-2 border-zinc-800 rounded-xl p-3 flex items-center gap-4 min-w-[320px] shadow-[0_10px_30px_rgba(0,0,0,0.8)] cursor-pointer hover:bg-zinc-900 transition-colors">
        {/* ICON with Filter */}
        <div className="shrink-0 w-12 h-12 rounded-lg border border-zinc-700 flex items-center justify-center bg-zinc-800/50 grayscale opacity-80">
          <span className="text-2xl">{content.icon}</span>
        </div>

        {/* CONTENT */}
        <div className="flex flex-col flex-1">
          <span className="text-[10px] font-mono font-black text-white/40 tracking-[0.25em] uppercase leading-none mb-1">
            {t('ui.discovery')}
          </span>
          <span className="text-sm font-mono font-bold text-white uppercase tracking-wider leading-tight">
            {content.subtitle}
          </span>
        </div>

        {/* INTERACTION BUTTON */}
        <div className="flex items-center justify-center min-w-[48px] h-10 border border-zinc-700 rounded-lg bg-zinc-900 px-3 hover:bg-zinc-800 transition-all active:scale-95 shadow-inner">
           <span className="text-xs font-mono font-black text-white tracking-widest uppercase">
             {isMobile ? t('ui.tap') : t('ui.enter')}
           </span>
        </div>
      </div>

      <style>{`
        @keyframes discovery-pop {
          0% { opacity: 0; transform: translateX(-50%) translateY(40px) scale(0.85); filter: blur(10px); }
          10% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1.05); filter: blur(0px); }
          15% { transform: translateX(-50%) scale(1); }
          85% { opacity: 1; transform: translateX(-50%) translateY(-5px) scale(1); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-25px) scale(0.95); }
        }
      `}</style>
    </div>
  );
});

export default DiscoveryPopup;