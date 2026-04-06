import React, { useEffect, useState, useCallback } from 'react';
import { useHudStore } from '../../../hooks/useHudStore';
import { t } from '../../../utils/i18n';
import { soundManager } from '../../../utils/audio/SoundManager';
import { DiscoveryType } from './HudTypes';
import { DISCOVERY_TYPE_KEYS } from '../../../utils/ui/Mappers';

interface DiscoveryPopupProps {
  onOpenAdventureLog: (tab?: string, itemId?: string) => void;
}

// STATIC MAP: Undviker att allokera ett nytt objekt i minnet vid varje interaktion
// STATIC MAP: SMI-indexed mapping to Adventure Log tabs
const TAB_MAP: Record<number, string> = {};
TAB_MAP[DiscoveryType.CLUE] = 'clues';
TAB_MAP[DiscoveryType.POI] = 'poi';
TAB_MAP[DiscoveryType.COLLECTIBLE] = 'collectibles';
TAB_MAP[DiscoveryType.ENEMY] = 'enemy';
TAB_MAP[DiscoveryType.BOSS] = 'boss';
TAB_MAP[DiscoveryType.PERK] = 'perks';

// ZERO-GC: Statisk variabel utanför komponenten som överlever unmounts (t.ex. vid paus)
let lastProcessedTimestamp = 0;

const DiscoveryPopup: React.FC<DiscoveryPopupProps> = React.memo(({ onOpenAdventureLog }) => {
  // ============================================================================
  // ZERO-GC PRIMITIVE SELECTORS
  // Förhindrar att komponenten renderas om 60fps vid buffer-swaps.
  // React kommer nu BARA rendera om när dessa specifika värden faktiskt ändras.
  // ============================================================================
  const isActive = useHudStore(s => s.discovery.active);
  const timestamp = useHudStore(s => s.discovery.timestamp);
  const id = useHudStore(s => s.discovery.id);
  const type = useHudStore(s => s.discovery.type);
  const title = useHudStore(s => s.discovery.title);
  const details = useHudStore(s => s.discovery.details);

  const [visible, setVisible] = useState(false);
  const [activeDiscovery, setActiveDiscovery] = useState<any>(null);

  useEffect(() => {
    // Trigga bara när vi har en ny upptäckt (timestamp > senast visade)
    if (isActive && timestamp > lastProcessedTimestamp) {
      lastProcessedTimestamp = timestamp;
      setActiveDiscovery({ id, type, title, details, timestamp });
      setVisible(true);
    }
  }, [isActive, timestamp, id, type, title, details]);

  // ZERO-GC: Stabil callback som undviker closures på 'visible'
  const handleInteraction = useCallback(() => {
    setVisible(prevVisible => {
      if (!prevVisible) return prevVisible; // Avbryt om den redan är stängd

      soundManager.playUiConfirm();
      const tab = TAB_MAP[activeDiscovery?.type] || 'clues';

      // Skickar med både tab och ID precis som du lade till!
      onOpenAdventureLog(tab, activeDiscovery?.id);

      return false; // Stänger popupen
    });
  }, [activeDiscovery, onOpenAdventureLog]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Eftersom vi kollar 'visible' inuti state-settern i handleInteraction 
      // behöver vi inte ha med 'visible' som dependency här längre! (Färre event re-binds)
      if (e.key === 'Enter') {
        handleInteraction();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleInteraction]);

  const handleAnimationEnd = () => {
    setVisible(false);
  };

  if (!activeDiscovery) return null;

  const getIcon = () => {
    switch (activeDiscovery.type) {
      case DiscoveryType.CLUE: return <span className="text-xl">🔍</span>;
      case DiscoveryType.POI: return <span className="text-xl">📍</span>;
      case DiscoveryType.COLLECTIBLE: return <span className="text-xl">📦</span>;
      case DiscoveryType.ENEMY: return <span className="text-xl">🧟</span>;
      case DiscoveryType.BOSS: return <span className="text-xl">💀</span>;
      case DiscoveryType.PERK: return <span className="text-xl">✨</span>;
      default: return null;
    }
  };

  return (
    <div
      key={activeDiscovery.timestamp}
      onAnimationEnd={handleAnimationEnd}
      className="fixed top-8 left-1/2 -translate-x-1/2 z-[200] pointer-events-auto"
      style={{
        display: visible ? 'block' : 'none',
        animation: visible ? `discovery-pop 4000ms cubic-bezier(0.25, 1, 0.5, 1) forwards` : 'none'
      }}
      onClick={handleInteraction}
    >
      <div className="bg-black/90 border-2 border-red-600 p-3 flex items-center gap-4 min-w-[280px] shadow-[0_0_20px_rgba(220,38,38,0.3)] cursor-pointer hover:bg-zinc-900 transition-colors">
        {/* ICON */}
        <div className="shrink-0 w-10 h-10 border border-red-900/50 flex items-center justify-center bg-red-950/20">
          {getIcon()}
        </div>

        {/* CONTENT */}
        <div className="flex flex-col">
          <span className="text-[10px] font-mono font-black text-red-500 tracking-[0.2em] uppercase leading-none mb-1">
            {t(activeDiscovery.title)}
          </span>
          <span className="text-sm font-mono font-bold text-white uppercase tracking-wider leading-tight">
            {t(activeDiscovery.details)}
          </span>
        </div>

        {/* HINT */}
        <div className="ml-auto pl-4 border-l border-zinc-800 flex flex-col items-center">
          <span className="text-[8px] font-mono text-zinc-500 uppercase">Open</span>
          <span className="text-[10px] font-mono font-bold text-white border border-zinc-700 px-1 bg-zinc-900 mt-1">↵</span>
        </div>
      </div>

      {/* SCANLINE / GLITCH ACCENT */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
        <div className="w-full h-[1px] bg-red-500 animate-scanline"></div>
      </div>

      <style>{`
        @keyframes discovery-pop {
          0% { opacity: 0; transform: translateX(-50%) translateY(30px) scale(0.8); filter: blur(10px); }
          10% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1.1); filter: blur(0px); }
          15% { transform: translateX(-50%) scale(1); }
          85% { opacity: 1; transform: translateX(-50%) translateY(-10px) scale(1); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-30px) scale(0.9); }
        }
      `}</style>
    </div>
  );
});

export default DiscoveryPopup;