import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { HudStore } from '../../../store/HudStore';
import { t } from '../../../utils/i18n';
import { UiSounds } from '../../../utils/audio/AudioLib';
import { DiscoveryType } from './HudTypes';
import { useUIEventBridge } from '../../../hooks/useUIEventBridge';
import { UIEventType } from '../../../systems/ui/UIEventRingBuffer';
import { DataResolver } from '../../../core/data/DataResolver';
import { MetaActionId } from '../../../systems/ui/UIEventBridge';
import { EnemyType } from '../../../entities/enemies/EnemyTypes';

// Pre-compiled O(1) totals per sector using centralized DataResolver to prevent database leakage
const CLUES_BY_SECTOR: Record<number, number> = {};
const POIS_BY_SECTOR: Record<number, number> = {};
const COLLECTIBLES_BY_SECTOR: Record<number, number> = {};

let sectorTotalsCompiled = false;
const ensureSectorTotalsCompiled = () => {
  if (sectorTotalsCompiled) return;
  sectorTotalsCompiled = true;
  const clues = DataResolver.getClues();
  const pois = DataResolver.getPois();
  const collectibles = DataResolver.getCollectibles();

  for (const key in clues) {
    const c = clues[key];
    if (c && typeof c.sector === 'number') {
      CLUES_BY_SECTOR[c.sector] = (CLUES_BY_SECTOR[c.sector] || 0) + 1;
    }
  }
  for (const key in pois) {
    const p = pois[key];
    if (p && typeof p.sector === 'number') {
      POIS_BY_SECTOR[p.sector] = (POIS_BY_SECTOR[p.sector] || 0) + 1;
    }
  }
  for (const key in collectibles) {
    const col = collectibles[key];
    if (col && typeof col.sector === 'number') {
      COLLECTIBLES_BY_SECTOR[col.sector] = (COLLECTIBLES_BY_SECTOR[col.sector] || 0) + 1;
    }
  }
};

interface DiscoveryPopupProps {
  onOpenAdventureLog: (tab?: DiscoveryType, itemId?: string) => void;
}

/**
 * DiscoveryPopup - ZERO-GC OPTIMIZED
 */
const DiscoveryPopup: React.FC<DiscoveryPopupProps> = React.memo(({ onOpenAdventureLog }) => {
  // ZERO-GC: Replaced 8 reactive selectors with a single trigger state
  const [activeDiscovery, setActiveDiscovery] = useState<any>(null);
  const [visible, setVisible] = useState(false);
  const lastTimestamp = useRef(0);

  const handleUIEvent = useCallback((type: UIEventType, data: any, discoveryType: number, timestamp: number) => {
    if (type !== UIEventType.DISCOVERY) return;

    const state = HudStore.getState();
    lastTimestamp.current = timestamp;

    setActiveDiscovery({
      id: data.id,
      type: discoveryType as DiscoveryType,
      title: data.title,
      details: data.details,
      timestamp: timestamp,
      isMobile: state.isMobileDevice,
      sector: state.currentSector,
      discoveredCluesCount: state.discoveredCluesCount,
      discoveredPoisCount: state.discoveredPoisCount,
      discoveredCollectiblesCount: state.discoveredCollectiblesCount
    });
    setVisible(true);
    UiSounds.playDiscovery();
  }, []);

  useUIEventBridge(handleUIEvent);

  const handleInteraction = useCallback(() => {
    if (!visible || !activeDiscovery) return;
    UiSounds.playDiscovery();

    const tab = DataResolver.getAdventureLogTab(activeDiscovery.type);
    onOpenAdventureLog(tab, activeDiscovery.id);
    const closeDiscovery = () => {
      setVisible(false);
      const state = HudStore.getState();
      if (state.discoveryActive) {
        HudStore.patch({
          discoveryActive: false
        });
      }
    };

    closeDiscovery();
  }, [activeDiscovery, visible, onOpenAdventureLog]);

  useEffect(() => {
    if (!visible) return;

    let lastProcessedTimestamp = 0;
    const unsubscribe = HudStore.subscribe((state) => {
      if (state.metaSignalTimestamp > lastProcessedTimestamp) {
        lastProcessedTimestamp = state.metaSignalTimestamp;
        if (state.lastMetaSignal === MetaActionId.NAV_CONFIRM) {
          // Do not steal [Enter] while a cinematic dialogue is playing —
          // the player is advancing dialogue lines, not confirming the popup.
          if (state.cinematicActive || state.dialogueActive) return;
          handleInteraction();
        }
      }
    });

    return unsubscribe;
  }, [visible, handleInteraction]);

  const handleAnimationEnd = () => {
    setVisible(false);
    const state = HudStore.getState();
    if (state.discoveryActive) {
      HudStore.patch({
        discoveryActive: false
      });
    }
  };

  // --- CONTENT RESOLUTION ---
  const content = useMemo(() => {
    if (!activeDiscovery) return null;
    const { id, type, sector, discoveredCluesCount, discoveredPoisCount, discoveredCollectiblesCount } = activeDiscovery;

    let title = activeDiscovery.title ? t(activeDiscovery.title) : '';
    let subtitle = activeDiscovery.details ? t(activeDiscovery.details) : '';
    let icon = '';

    ensureSectorTotalsCompiled();

    switch (type) {
      case DiscoveryType.CLUE:
        title = activeDiscovery.title ? t(activeDiscovery.title) : t('ui.discovered_clue');
        const totalClues = CLUES_BY_SECTOR[sector] || 0;
        subtitle = `${activeDiscovery.details || t('ui.clue')} (${discoveredCluesCount}/${totalClues})`;
        icon = '🔍';
        break;

      case DiscoveryType.POI:
        title = activeDiscovery.title ? t(activeDiscovery.title) : t('ui.discovered_poi');
        const totalPois = POIS_BY_SECTOR[sector] || 0;
        subtitle = `${activeDiscovery.details || t('ui.poi_short')} (${discoveredPoisCount}/${totalPois})`;
        icon = '📍';
        break;

      case DiscoveryType.COLLECTIBLE:
        title = activeDiscovery.title ? t(activeDiscovery.title) : t('ui.discovered_collectible');
        const totalCollectibles = COLLECTIBLES_BY_SECTOR[sector] || 0;
        subtitle = `${activeDiscovery.details || t(DataResolver.getCollectibleName(id))} (${discoveredCollectiblesCount}/${totalCollectibles})`;
        icon = '📦';
        break;

      case DiscoveryType.ZOMBIE:
      case DiscoveryType.BOSS:
        title = activeDiscovery.title ? t(activeDiscovery.title) : t('ui.discovered_enemy');
        icon = type === DiscoveryType.BOSS ? '💀' : '🧟';
        subtitle = activeDiscovery.details || t(DataResolver.getEnemyName(type === DiscoveryType.BOSS ? EnemyType.BOSS : Number(id), type === DiscoveryType.BOSS ? Number(id) : -1));
        break;

      case DiscoveryType.PERK:
        title = t('ui.discovered_perk');
        const perkId = Number(id);
        const perk = DataResolver.getPerks()[perkId];
        if (perk) {
          icon = perk.icon || '✨';
          const catKey = DataResolver.getPerkCategoryKey(perk.category);
          subtitle = `${t(catKey)}: ${activeDiscovery.details || t(perk.displayName)}`;
        } else {
          icon = '✨';
          subtitle = t('ui.unknown_perk');
        }
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
      className="fixed top-12 left-1/2 -translate-x-1/2 z-[10000] pointer-events-auto"
      style={{
        display: visible ? 'block' : 'none',
        animation: visible ? `discovery-pop 10000ms cubic-bezier(0.25, 1, 0.5, 1) forwards` : 'none'
      }}
      onClick={handleInteraction}
      onTouchStart={handleInteraction}
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
          15% { transform: translateX(-50%) scale(1); filter: blur(0px); }
          85% { opacity: 1; transform: translateX(-50%) translateY(-5px) scale(1); filter: blur(0px); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-25px) scale(0.95); }
        }
      `}</style>
    </div>
  );
});

export default DiscoveryPopup;
