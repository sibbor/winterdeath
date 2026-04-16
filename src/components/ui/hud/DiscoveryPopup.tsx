import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { HudStore } from '../../../store/HudStore';
import { t } from '../../../utils/i18n';
import { UiSounds } from '../../../utils/audio/AudioLib';
import { DiscoveryType } from './HudTypes';
import { DataResolver } from '../../../utils/ui/DataResolver';
import { PERKS, PerkCategory } from '../../../content/perks';
import { CLUES } from '../../../content/clues';
import { POIS } from '../../../content/pois';
import { COLLECTIBLES } from '../../../content/collectibles';

interface DiscoveryPopupProps {
  onOpenAdventureLog: (tab?: string, itemId?: string) => void;
}

/**
 * DiscoveryPopup - ZERO-GC OPTIMIZED
 */
const DiscoveryPopup: React.FC<DiscoveryPopupProps> = React.memo(({ onOpenAdventureLog }) => {
  // ZERO-GC: Replaced 8 reactive selectors with a single trigger state
  const [activeDiscovery, setActiveDiscovery] = useState<any>(null);
  const [visible, setVisible] = useState(false);
  const lastTimestamp = useRef(0);

  useEffect(() => {
    // Synchronous listener: Only trigger react when discovery.timestamp genuinely increments
    return HudStore.subscribe(() => {
        const state = HudStore.getState();
        const d = state.discovery;
        
        if (d.active && d.timestamp > lastTimestamp.current) {
            lastTimestamp.current = d.timestamp;
            
            // Resolve content once and push to state
            setActiveDiscovery({ 
                id: d.id, 
                type: d.type, 
                title: d.title,
                details: d.details,
                timestamp: d.timestamp,
                isMobile: state.isMobileDevice,
                sector: state.currentSector,
                cluesFound: state.cluesFoundCount,
                poisFound: state.poisFoundCount,
                collectiblesFound: state.collectiblesFoundCount
            });
            setVisible(true);
            UiSounds.playDiscovery();
        }
    });
  }, []);

  const handleInteraction = useCallback(() => {
    if (!visible || !activeDiscovery) return;
    UiSounds.playDiscovery();
    
    const isPerkVal = activeDiscovery.type === DiscoveryType.PERK;
    if (isPerkVal) {
      window.dispatchEvent(new CustomEvent('open-statistics', { 
          detail: { tab: 'perks', itemId: activeDiscovery.id } 
      }));
    } else {
      const tab = DataResolver.getAdventureLogTab(activeDiscovery.type);
      onOpenAdventureLog(tab, activeDiscovery.id);
    }
    setVisible(false);
  }, [activeDiscovery, visible, onOpenAdventureLog]);

  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleInteraction();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [visible, handleInteraction]);

  const handleAnimationEnd = () => setVisible(false);

  // --- CONTENT RESOLUTION ---
  const content = useMemo(() => {
    if (!activeDiscovery) return null;
    const { id, type, sector, cluesFound, poisFound, collectiblesFound } = activeDiscovery;

    let title = activeDiscovery.title ? t(activeDiscovery.title) : '';
    let subtitle = activeDiscovery.details ? t(activeDiscovery.details) : '';
    let icon = '';

    switch (type) {
      case DiscoveryType.CLUE:
        title = t('ui.discovered_clue');
        const totalClues = Object.values(CLUES).filter(c => c.sector === sector).length;
        subtitle = `${t('ui.clue')} ${cluesFound}/${totalClues}`;
        icon = '🔍';
        break;
      case DiscoveryType.POI:
        title = t('ui.discovered_poi');
        const totalPois = Object.values(POIS).filter(p => p.sector === sector).length;
        subtitle = `${t('ui.poi_short')} ${poisFound}/${totalPois}`;
        icon = '📍';
        break;
      case DiscoveryType.COLLECTIBLE:
        title = t('ui.collectible_discovered');
        const totalCollectibles = Object.values(COLLECTIBLES).filter(c => c.sector === sector).length;
        subtitle = `${t(DataResolver.getCollectibleName(id))} (${collectiblesFound}/${totalCollectibles})`;
        icon = '📦';
        break;
      case DiscoveryType.ENEMY:
      case DiscoveryType.BOSS:
        title = t('ui.discovered_enemy');
        icon = type === DiscoveryType.BOSS ? '💀' : '🧟';
        subtitle = t(DataResolver.getEnemyName(Number(id), type === DiscoveryType.BOSS ? Number(id) : -1));
        break;
      case DiscoveryType.PERK:
        title = t('ui.discovered_perk');
        const perk = PERKS[Number(id)];
        icon = perk?.icon || '✨';
        const catKey = perk?.category === PerkCategory.PASSIVE ? 'ui.passive' : (perk?.category === PerkCategory.BUFF ? 'ui.buff' : 'ui.debuff');
        subtitle = `${t(catKey)}: ${t(perk?.displayName || '')}`;
        break;
      default:
        // Use default title/subtitle if type is unhandled but strings exist
        if (!icon) icon = '✨';
        break;
    }

    return { icon, title, subtitle };
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
            {content.title}
          </span>
          <span className="text-sm font-mono font-bold text-white uppercase tracking-wider leading-tight">
            {content.subtitle}
          </span>
        </div>

        {/* INTERACTION BUTTON */}
        <div className="flex items-center justify-center min-w-[48px] h-10 border border-zinc-700 rounded-lg bg-zinc-900 px-3 hover:bg-zinc-800 transition-all active:scale-95 shadow-inner">
          <span className="text-xs font-mono font-black text-white tracking-widest uppercase">
            {activeDiscovery.isMobile ? t('ui.tap') : t('ui.enter')}
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