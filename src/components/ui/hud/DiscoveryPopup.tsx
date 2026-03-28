import React, { useEffect, useState } from 'react';
import { useHudStore } from '../../../hooks/useHudStore';
import { t } from '../../../utils/i18n';
import { soundManager } from '../../../utils/audio/SoundManager';

interface DiscoveryPopupProps {
  onOpenAdventureLog: (tab?: string, itemId?: string) => void;
}

const DiscoveryPopup: React.FC<DiscoveryPopupProps> = ({ onOpenAdventureLog }) => {
  const discovery = useHudStore(s => s.discovery);
  const [visible, setVisible] = useState(false);
  const [activeDiscovery, setActiveDiscovery] = useState(discovery);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (discovery && discovery.timestamp !== activeDiscovery?.timestamp) {
      setActiveDiscovery(discovery);
      setVisible(true);

      timer = setTimeout(() => {
        setVisible(false);
      }, 2500);
    }
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discovery]);

  const handleInteraction = () => {
    if (!visible) return;
    soundManager.playUiConfirm();
    setVisible(false);

    // Map discovery type to Adventure Log tab
    const tabMap: Record<string, string> = {
      clue: 'clues',
      poi: 'poi',
      collectible: 'collectibles',
      enemy: 'enemy',
      boss: 'boss'
    };

    onOpenAdventureLog(tabMap[activeDiscovery?.type || 'clues'], activeDiscovery?.id);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && visible) {
        handleInteraction();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [visible, activeDiscovery]);

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
};

export default DiscoveryPopup;
