import React, { useEffect, useCallback, useRef } from 'react';
import { HudStore } from '../../../../store/HudStore';
import { t } from '../../../../utils/i18n';
import { UISounds } from '../../../../utils/audio/AudioLib';
import { DiscoveryType } from './HudTypes';
import { useUIEventBridge } from '../../../../hooks/useUIEventBridge';
import { UIEventType } from '../../../../systems/ui/UIEventRingBuffer';
import { DataResolver } from '../../../../core/data/DataResolver';
import { MetaActionId } from '../../../../systems/ui/UIEventBridge';

interface DiscoveryPopupProps {
  onOpenAdventureLog: (tab?: DiscoveryType, itemId?: string) => void;
}

/**
 * DiscoveryPopup - ZERO-GC PRESENTATION LAYER
 * Mutates the DOM directly to prevent V8 heap allocations and React rendering cycles.
 */
const DiscoveryPopup: React.FC<DiscoveryPopupProps> = React.memo(({ onOpenAdventureLog }) => {
  // DOM Element References to bypass React reconciliation completely
  const containerRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const subtitleRef = useRef<HTMLSpanElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);

  // Structural primitive tracking caches (Zero-GC)
  const activeIdRef = useRef<number>(0);
  const activeTypeRef = useRef<DiscoveryType>(DiscoveryType.CLUE);
  const lastTimestamp = useRef<number>(0);
  const isVisibleRef = useRef<boolean>(false);

  /**
   * Closes the popup and resets tracking tokens safely
   */
  const hidePopup = useCallback(() => {
    isVisibleRef.current = false;
    if (containerRef.current) {
      containerRef.current.style.display = 'none';
      containerRef.current.style.animation = 'none';
    }

    const state = HudStore.getState();
    if (state.discoveryActive) {
      HudStore.patch({ discoveryActive: false });
    }
  }, []);

  /**
   * Executes the interaction action to open the log book
   */
  const handleInteraction = useCallback(() => {
    if (!isVisibleRef.current) return;
    UISounds.playDiscovery();

    const tab = DataResolver.getAdventureLogTab(activeTypeRef.current);
    onOpenAdventureLog(tab, String(activeIdRef.current));

    hidePopup();
  }, [onOpenAdventureLog, hidePopup]);

  // UI Event Bridge Handler - Executed on the main animation cadence
  const handleUIEvent = useCallback((type: UIEventType, id: any, discoveryType: number, timestamp: number) => {
    if (type !== UIEventType.DISCOVERY) return;

    // Critical guard against reprocessing duplicate execution frames
    if (timestamp <= lastTimestamp.current) return;
    lastTimestamp.current = timestamp;

    const numericId = Number(id) || 0;
    const payload = DataResolver.getPresentationPayload(numericId);
    if (!payload) return;

    const state = HudStore.getState();
    const dType = discoveryType as DiscoveryType;

    // Cache active item properties without allocating heap objects
    activeIdRef.current = numericId;
    activeTypeRef.current = dType;

    let icon = '✨';
    let titleStr = t('ui.discovered_perk');
    switch (dType) {
      case DiscoveryType.CLUE:
        icon = '🔍';
        titleStr = t('ui.discovered_clue');
        break;
      case DiscoveryType.POI:
        icon = '📍';
        titleStr = t('ui.discovered_poi');
        break;
      case DiscoveryType.COLLECTIBLE:
        icon = '📦';
        titleStr = t('ui.discovered_collectible');
        break;
      case DiscoveryType.ZOMBIE:
        icon = '🧟';
        titleStr = t('ui.discovered_enemy');
        break;
      case DiscoveryType.BOSS:
        icon = '💀';
        titleStr = t('ui.discovered_boss');
        break;
      case DiscoveryType.PERK:
        icon = DataResolver.getPerks()[numericId]?.icon || '✨';
        break;
      default:
        icon = DataResolver.getPerks()[numericId]?.icon || '✨';
    }

    // Format strings directly into the DOM nodes
    if (iconRef.current) iconRef.current.innerText = icon;
    if (titleRef.current) titleRef.current.innerText = titleStr;

    if (subtitleRef.current) {
      subtitleRef.current.innerText = payload.title;
    }

    if (counterRef.current) {
      if ((dType === DiscoveryType.CLUE || dType === DiscoveryType.COLLECTIBLE || dType === DiscoveryType.POI) && payload.progressString !== "0/0" && payload.progressString !== "") {
        counterRef.current.innerText = payload.progressString;
        counterRef.current.style.display = 'block';
      } else {
        counterRef.current.style.display = 'none';
      }
    }

    if (badgeRef.current) {
      badgeRef.current.innerText = state.isMobileDevice ? t('ui.tap') : t('ui.enter');
    }

    // Trigger layout presentation using V8 Reflow reset logic (Zero-GC Animation reset)
    if (containerRef.current) {
      containerRef.current.style.display = 'block';
      containerRef.current.style.animation = 'none';
      void containerRef.current.offsetHeight; // Forces synchronous layout engine reflow
      containerRef.current.style.animation = 'discovery-pop 10000ms cubic-bezier(0.25, 1, 0.5, 1) forwards';
    }

    isVisibleRef.current = true;
    UISounds.playDiscovery();
  }, []);

  useUIEventBridge(handleUIEvent);

  // Handle incoming hardware/meta controller navigation actions natively
  useEffect(() => {
    const handleEngineMetaSignal = (signal: MetaActionId) => {
      if (!isVisibleRef.current) return;

      // Intercept the synchronized confirm command stream directly 
      if (signal === MetaActionId.NAV_CONFIRM) {
        handleInteraction();
      }
    };

    // Bind directly to the window-mapped high-frequency input manager proxy context
    const manager = (window as any).inputManager;
    let originalMetaCallback: ((id: MetaActionId) => void) | undefined;

    if (manager) {
      // Cache the prior hook subscription layer if it exists to prevent event leaks
      originalMetaCallback = manager.onMetaAction;

      // Intercept incoming controller actions dynamically
      manager.onMetaAction = (signal: MetaActionId) => {
        // Guard: If the overlay popup is currently active, intercept input frames
        // to stop propagation leakages into context-blind loops
        if (isVisibleRef.current && (signal === MetaActionId.NAV_CONFIRM || signal === MetaActionId.INTERACT_TAP)) {
          if (signal === MetaActionId.NAV_CONFIRM) {
            handleEngineMetaSignal(signal);
          }
          return; // Absorb input to prevent underlying layer leakages completely
        }

        if (originalMetaCallback) originalMetaCallback(signal);
        handleEngineMetaSignal(signal);
      };
    }

    return () => {
      if (manager) {
        manager.onMetaAction = originalMetaCallback;
      }
    };
  }, [handleInteraction]); // Safely track stable layout parameters without dynamic re-bindings

  return (
    <div
      ref={containerRef}
      onAnimationEnd={hidePopup}
      className="fixed top-12 left-1/2 -translate-x-1/2 z-[10000] pointer-events-auto"
      style={{ display: 'none', willChange: 'transform, opacity' }}
      onClick={handleInteraction}
      onTouchStart={handleInteraction}
    >
      <div className="relative p-8 flex flex-col items-center justify-center min-w-[450px] cursor-pointer group text-center">
        {/* SMOKY CINEMATIC BACKGROUND */}
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-300 group-hover:opacity-80"
          style={{
            background: 'radial-gradient(50% 50% at 50% 50%, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.6) 50%, transparent 100%)',
            filter: 'blur(16px)',
            transform: 'scaleX(1.3) scaleY(1.1)'
          }}
        />

        {/* CONTENT BLOCKS */}
        <div className="relative flex flex-col items-center z-10 w-full">
          <div className="flex items-center gap-3 mb-2">
            <span ref={iconRef} className="text-xl drop-shadow-[0_0_8px_rgba(255,255,255,0.3)] grayscale">✨</span>
            <span ref={titleRef} className="text-[13px] font-mono font-bold text-[#bfa979] tracking-[0.3em] uppercase leading-none drop-shadow-md">
              -
            </span>
          </div>

          <span ref={subtitleRef} className="text-3xl font-mono font-black text-white uppercase tracking-widest leading-tight drop-shadow-lg mb-4">
            -
          </span>

          <div className="relative px-8 py-1.5 flex items-center justify-center">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(0,0,0,0.6)_0%,_transparent_100%)] blur-sm"></div>
            <span ref={counterRef} className="relative text-sm font-mono font-bold text-zinc-300 uppercase tracking-widest leading-tight drop-shadow-md">
              -
            </span>
          </div>
        </div>

        {/* ACTION BADGE */}
        <div className="relative mt-5 flex items-center justify-center min-w-[48px] h-9 border border-[#bfa979]/30 rounded bg-black/40 px-4 hover:bg-[#bfa979]/20 transition-all active:scale-95 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
          <span ref={badgeRef} className="text-[10px] font-mono font-bold text-[#bfa979] tracking-widest uppercase">
            -
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

DiscoveryPopup.displayName = 'DiscoveryPopup';

export default DiscoveryPopup;