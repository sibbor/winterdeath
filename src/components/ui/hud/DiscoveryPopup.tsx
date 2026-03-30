import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useHudStore } from '../../../hooks/useHudStore';
import { t } from '../../../utils/i18n';
import { soundManager } from '../../../utils/audio/SoundManager';

interface DiscoveryPopupProps {
  onOpenAdventureLog: (tab?: string, itemId?: string) => void;
}

// STATIC MAP: Undviker att allokera ett nytt objekt i minnet vid varje interaktion
const TAB_MAP: Record<string, string> = {
  clue: 'clues',
  poi: 'poi',
  collectible: 'collectibles',
  enemy: 'enemy',
  boss: 'boss'
};

const DiscoveryPopup: React.FC<DiscoveryPopupProps> = React.memo(({ onOpenAdventureLog }) => {
  const discovery = useHudStore(s => s.discovery);
  const [visible, setVisible] = useState(false);
  const [activeDiscovery, setActiveDiscovery] = useState(discovery);

  // Använd useRef för att hålla timern stabil över renders
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (discovery && discovery.timestamp !== activeDiscovery?.timestamp) {
      setActiveDiscovery(discovery);
      setVisible(true);

      if (timerRef.current) clearTimeout(timerRef.current);

      // 2500-4000ms är lagom för att hinna läsa i strid
      timerRef.current = setTimeout(() => {
        setVisible(false);
      }, 2500);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [discovery, activeDiscovery?.timestamp]);

  // ZERO-GC: Stabil callback som undviker closures på 'visible'
  const handleInteraction = useCallback(() => {
    setVisible(prevVisible => {
      if (!prevVisible) return prevVisible; // Avbryt om den redan är stängd

      soundManager.playUiConfirm();
      const tab = TAB_MAP[activeDiscovery?.type || 'clue'] || 'clues';

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

  if (!activeDiscovery) return null;

  const getIcon = () => {
    switch (activeDiscovery.type) {
      case 'clue': return <span className="text-xl">🔍</span>;
      case 'poi': return <span className="text-xl">📍</span>;
      case 'collectible': return <span className="text-xl">📦</span>;
      case 'enemy': return <span className="text-xl">🧟</span>;
      case 'boss': return <span className="text-xl">💀</span>;
      default: return null;
    }
  };

  return (
    <div
      className={`fixed top-8 left-1/2 -translate-x-1/2 z-[200] transition-all duration-300 transform pointer-events-auto
                ${visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-4 scale-95 pointer-events-none'}`}
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
    </div>
  );
});

export default DiscoveryPopup;