
import React, { useState, useEffect, useRef, useMemo, useLayoutEffect, useCallback } from 'react';
import { MapItem, MapItemType } from '../../types';
import { t } from '../../utils/i18n';
import { soundManager } from '../../utils/sound';
import GameModalLayout from './GameModalLayout';

interface ScreenMapProps {
    items: MapItem[];
    playerPos: { x: number, z: number } | undefined;
    familyPos?: { x: number, z: number };
    bossPos?: { x: number, z: number };
    onClose: () => void;
    onSelectCoords: (x: number, z: number) => void;
    isMobileDevice?: boolean;
}

const getItemPriority = (type: MapItemType | string): number => {
    switch (type) {
        case 'PLAYER': return 100;
        case 'BOSS': return 90;
        case 'FAMILY': return 80;
        case 'POI': return 70;
        case 'TRIGGER': return 60;
        case 'CHEST': return 50;
        case 'OBSTACLE': return 10;
        default: return 0;
    }
};

const TooltipOverlay: React.FC<{ data: { rect: DOMRect, items: MapItem[] } | null }> = ({ data }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number, left: number, align: 'top' | 'bottom' }>({ top: -1000, left: -1000, align: 'top' });

    useLayoutEffect(() => {
        if (!data || !ref.current) return;

        const tooltipRect = ref.current.getBoundingClientRect();
        const targetRect = data.rect;
        const gap = 12;
        const HEADER_HEIGHT = 120; // Safe zone for map header

        // Default: Top centered
        let top = targetRect.top - tooltipRect.height - gap;
        let left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
        let align: 'top' | 'bottom' = 'top';

        // Check Top Boundary
        if (top < HEADER_HEIGHT) {
            // Flip to bottom
            top = targetRect.bottom + gap;
            align = 'bottom';
        }

        // Check Bottom Boundary (if flipped)
        if (align === 'bottom' && top + tooltipRect.height > window.innerHeight) {
            // If it doesn't fit bottom either, force it to fit inside whichever has more space, or stick to side?
            // Let's stick to valid screen coords. If it clips bottom, push it up.
            top = Math.min(top, window.innerHeight - tooltipRect.height - 10);
        }

        // Check Left Boundary
        if (left < 10) left = 10;

        // Check Right Boundary
        if (left + tooltipRect.width > window.innerWidth - 10) {
            left = window.innerWidth - tooltipRect.width - 10;
        }

        setPos({ top, left, align });
    }, [data]);

    if (!data) return null;

    return (
        <div
            ref={ref}
            className="fixed z-[100] flex flex-row gap-2 pointer-events-none transition-opacity duration-200"
            style={{ top: pos.top, left: pos.left, opacity: pos.top === -1000 ? 0 : 1 }}
        >
            {data.items.map((item, idx) => (
                <div key={item.id + idx} className="bg-black/95 backdrop-blur-md text-white text-xs font-mono p-3 border border-white/30 shadow-[0_0_15px_rgba(0,0,0,0.8)] min-w-[200px] max-w-[280px] animate-in fade-in zoom-in duration-200">
                    <div className="font-bold text-sm border-b border-white/20 mb-2 pb-1 text-center text-blue-300 truncate">
                        {t(item.label || "Unknown Object")}
                    </div>
                    {Object.entries(item).map(([key, val]) => {
                        if (key === 'icon' || key === 'label' || key === 'color') return null;
                        const displayVal = (typeof val === 'number' && !Number.isInteger(val))
                            ? val.toFixed(2)
                            : (typeof val === 'object' ? '...' : String(val));

                        return (
                            <div key={key} className="flex justify-between gap-4 border-b border-white/5 py-1 last:border-0">
                                <span className="text-gray-500 uppercase font-bold tracking-wider">{key}</span>
                                <span className="text-gray-300 text-right truncate max-w-[140px]">{displayVal}</span>
                            </div>
                        );
                    })}

                    {/* Arrow Indicator (Visual sugar) */}
                    <div
                        className={`absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-black/95 border-r border-b border-white/30 transform rotate-45 ${pos.align === 'top' ? '-bottom-1.5 border-t-0 border-l-0' : '-top-1.5 border-b-0 border-r-0 rotate-[225deg]'}`}
                    ></div>
                </div>
            ))}
        </div>
    );
};

// --- OPTIMIZED MAP CANVAS COMPONENT ---
// This component is Memoized so it does NOT re-render when mouseCoords change in the parent
interface MapCanvasProps {
    bounds: { minX: number, maxX: number, minZ: number, maxZ: number, width: number, height: number };
    groupedEntities: MapItem[][];
    setTooltipData: (data: { rect: DOMRect, items: MapItem[] } | null) => void;
    onMouseMove: (e: React.MouseEvent, bounds: any) => void;
    onClick: () => void;
    onTouchStart?: (e: React.TouchEvent) => void;
}

const MapCanvas = React.memo(({ bounds, groupedEntities, setTooltipData, onMouseMove, onClick, onTouchStart }: MapCanvasProps) => {

    const toMapPercent = useCallback((x: number, z: number) => {
        if (!bounds || bounds.width === 0 || bounds.height === 0) return { x: 50, y: 50 };
        const px = ((x - bounds.minX) / bounds.width) * 100;
        const py = ((z - bounds.minZ) / bounds.height) * 100;
        return { x: px, y: py };
    }, [bounds]);

    // Render Grid Lines
    const gridLines = useMemo(() => {
        if (!bounds) return null;
        const lines = [];
        const step = 50;
        for (let x = Math.ceil(bounds.minX / step) * step; x <= bounds.maxX; x += step) {
            const pos = toMapPercent(x, 0);
            lines.push(
                <div key={`v-${x}`} className="absolute top-0 bottom-0 border-l border-white/10" style={{ left: `${pos.x}%` }}>
                    <span className="absolute top-2 left-1 text-[8px] text-white/30 font-mono">{x}</span>
                </div>
            );
        }
        for (let z = Math.ceil(bounds.minZ / step) * step; z <= bounds.maxZ; z += step) {
            const pos = toMapPercent(0, z);
            lines.push(
                <div key={`h-${z}`} className="absolute left-0 right-0 border-t border-white/10" style={{ top: `${pos.y}%` }}>
                    <span className="absolute left-2 top-0 text-[8px] text-white/30 font-mono">{z}</span>
                </div>
            );
        }
        return lines;
    }, [bounds, toMapPercent]);

    return (
        <div
            className="relative bg-slate-900/80 border-2 border-blue-900/50 shadow-[0_0_50px_rgba(0,0,0,0.5)] cursor-crosshair w-full h-full"
            style={{
                aspectRatio: `${bounds.width} / ${bounds.height}`,
                width: bounds.width > bounds.height ? '95%' : 'auto',
                height: bounds.height >= bounds.width ? '95%' : 'auto'
            }}
            onMouseMove={(e) => onMouseMove(e, bounds)}
            onClick={onClick}
            onTouchStart={onTouchStart}
        >
            {/* Grid */}
            <div className="absolute inset-0 pointer-events-none">{gridLines}</div>

            {/* Origin Crosshair */}
            <div className="absolute left-1/2 top-0 bottom-0 border-l border-blue-500/20 pointer-events-none"></div>
            <div className="absolute top-1/2 left-0 right-0 border-t border-blue-500/20 pointer-events-none"></div>

            {/* Grouped Markers */}
            {groupedEntities.map((group, i) => {
                const topItem = group[0];
                const pos = toMapPercent(topItem.x, topItem.z);
                const count = group.length;

                // Determine visual style based on top priority item
                let sizeClass = "w-3 h-3";
                let zIndex = 10;
                let content = null;

                switch (topItem.type) {
                    case 'PLAYER':
                        zIndex = 100;
                        content = (
                            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[12px] border-b-blue-500 animate-pulse drop-shadow-[0_0_10px_rgba(59,130,246,1)]"></div>
                        );
                        break;
                    case 'BOSS':
                        zIndex = 90;
                        content = <span className="text-3xl drop-shadow-md filter drop-shadow-[0_0_5px_rgba(255,0,0,0.8)] animate-pulse">💀</span>;
                        break;
                    case 'FAMILY':
                        zIndex = 80;
                        content = <div className="w-4 h-4 bg-green-500 rounded-full border-2 border-white shadow-[0_0_10px_rgba(74,222,128,0.8)] animate-bounce"></div>;
                        break;
                    case 'POI':
                        zIndex = 20; sizeClass = "w-6 h-6";
                        content = <span className="text-xl drop-shadow-md">📍</span>;
                        break;
                    case 'OBSTACLE':
                        zIndex = 10; sizeClass = "w-2 h-2";
                        content = <div className={`rounded-full shadow-sm ${sizeClass}`} style={{ backgroundColor: topItem.color || '#fff' }} />;
                        break;
                    case 'CHEST':
                        zIndex = 15; sizeClass = "w-4 h-4";
                        content = <span className="text-xl drop-shadow-md">📦</span>;
                        break;
                    case 'TRIGGER': // Assuming CLUE maps to TRIGGER or has its own type? Looking at getItemPriority, CLUE isn't there but 'TRIGGER' is.
                        // Wait, check `GameSession` mapping. Clues are often just Triggers or Items.
                        // If type is 'CLUE' (custom logic needed?)
                        // `getItemPriority` has `TRIGGER`.
                        // The user wanted `🔍` for Clue.
                        // Let's assume if label is 'clue' or type is specific.
                        // Actually, looking at `GameSession.tsx` line 889 `mapItems`, checking where they come from.
                        // `SectorSystem` populates mapItems.
                        // I will add a case for 'CLUE' if it exists, or check label.
                        // For now let's stick to the requested changes for POI/CHEST.
                        zIndex = 25;
                        content = <span className="text-xl drop-shadow-md">🔍</span>;
                        break;
                    default:
                        content = (topItem.icon && topItem.icon.length < 5) ? <span style={{ color: topItem.color }}>{topItem.icon}</span> : <div className={`rounded-full shadow-sm ${sizeClass}`} style={{ backgroundColor: topItem.color || '#fff' }} />;
                }

                return (
                    <div
                        key={`group-${i}`}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center transition-transform hover:scale-125 cursor-help`}
                        style={{
                            left: `${pos.x}%`,
                            top: `${pos.y}%`,
                            zIndex
                        }}
                        onMouseEnter={(e) => setTooltipData({ rect: e.currentTarget.getBoundingClientRect(), items: group })}
                        onMouseLeave={() => setTooltipData(null)}
                    >
                        {content}
                        {/* Stack indicator if multiple items */}
                        {count > 1 && (
                            <div className="absolute -top-3 -right-3 bg-white text-black text-[9px] font-black w-4 h-4 flex items-center justify-center rounded-full border border-black shadow-md">
                                {count}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
});


const ScreenMap: React.FC<ScreenMapProps> = ({ items = [], playerPos, familyPos, bossPos, onClose, onSelectCoords, isMobileDevice }) => {
    const [tooltipData, setTooltipData] = useState<{ rect: DOMRect, items: MapItem[] } | null>(null);
    const [mouseCoords, setMouseCoords] = useState<{ x: number, z: number } | null>(null);

    // Merge all entities into a single list for unified rendering
    const allEntities = useMemo(() => {
        const ent: MapItem[] = [...items];

        if (playerPos && typeof playerPos.x === 'number') {
            ent.push({ id: 'player', x: playerPos.x, z: playerPos.z, type: 'PLAYER', label: 'ui.player', color: '#3b82f6', icon: 'caret' });
        }
        if (familyPos) {
            ent.push({ id: 'family', x: familyPos.x, z: familyPos.z, type: 'FAMILY', label: 'ui.family_member', color: '#22c55e', icon: 'dot' });
        }
        if (bossPos) {
            ent.push({ id: 'boss', x: bossPos.x, z: bossPos.z, type: 'BOSS', label: 'ui.boss', color: '#ef4444', icon: 'skull' });
        }
        return ent;
    }, [items, playerPos, familyPos, bossPos]);

    // Group entities by location to handle overlaps
    const groupedEntities = useMemo(() => {
        const groups: Record<string, MapItem[]> = {};
        allEntities.forEach(item => {
            if (!item || typeof item.x !== 'number' || typeof item.z !== 'number') return;
            // Round to nearest 2 units to group very close items
            const key = `${Math.round(item.x / 4)}_${Math.round(item.z / 4)}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        });

        // Sort each group by priority so the most important icon renders
        Object.values(groups).forEach(group => {
            group.sort((a, b) => getItemPriority(b.type) - getItemPriority(a.type));
        });

        return Object.values(groups);
    }, [allEntities]);

    // Calculate Map Bounds with Padding
    const bounds = useMemo(() => {
        let minX = -100, maxX = 100, minZ = -100, maxZ = 100;
        const checkPos = (x: number, z: number) => {
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        };
        allEntities.forEach(item => checkPos(item.x, item.z));
        const padding = 50;
        return {
            minX: minX - padding, maxX: maxX + padding,
            minZ: minZ - padding, maxZ: maxZ + padding,
            width: (maxX + padding) - (minX - padding),
            height: (maxZ + padding) - (minZ - padding)
        };
    }, [allEntities]);

    const handleMouseMove = useCallback((e: React.MouseEvent, mapBounds: typeof bounds) => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const px = ((e.clientX - rect.left) / rect.width) * 100;
        const py = ((e.clientY - rect.top) / rect.height) * 100;

        const x = mapBounds.minX + (px / 100) * mapBounds.width;
        const z = mapBounds.minZ + (py / 100) * mapBounds.height;

        setMouseCoords({ x, z });
    }, []); // No deps needed if bounds come from arg, though bounds arg ensures freshness

    const mouseCoordsRef = useRef<{ x: number, z: number } | null>(null);
    useEffect(() => {
        mouseCoordsRef.current = mouseCoords;
    }, [mouseCoords]);

    const onMapClick = useCallback(() => {
        if (!mouseCoordsRef.current) return;
        soundManager.playUiClick();
        onSelectCoords(mouseCoordsRef.current.x, mouseCoordsRef.current.z);
    }, [onSelectCoords]); // Stable dependency

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (!isMobileDevice) return;
        const touch = e.touches[0];
        const rect = e.currentTarget.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const px = ((touch.clientX - rect.left) / rect.width) * 100;
        const py = ((touch.clientY - rect.top) / rect.height) * 100;

        const x = bounds.minX + (px / 100) * bounds.width;
        const z = bounds.minZ + (py / 100) * bounds.height;

        onSelectCoords(x, z);
        soundManager.playUiClick();
    }, [bounds, onSelectCoords, isMobileDevice]);

    return (
        <GameModalLayout
            title={
                <div className="flex justify-between items-center w-full pr-4">
                    <span>{t('ui.tactical_map')}</span>
                    {!isMobileDevice && (
                        <div className="flex gap-6 items-center">
                            <div className="text-right">
                                <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">{t('ui.coordinates')}</p>
                                <p className="text-lg font-mono text-white font-bold leading-tight">
                                    {mouseCoords ? `${Math.round(mouseCoords.x)}, ${Math.round(mouseCoords.z)}` : '--, --'}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">{t('ui.player')}</p>
                                <p className="text-lg font-mono text-white font-bold leading-tight">
                                    {playerPos ? `${Math.round(playerPos.x)}, ${Math.round(playerPos.z)}` : '--, --'}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            }
            isMobile={isMobileDevice}
            onClose={onClose}
            maxWidthClass="max-w-6xl"
            titleColorClass="text-blue-500"
            footer={
                <div className={`w-full flex flex-wrap justify-center ${isMobileDevice ? 'gap-3' : 'gap-8'} ${isMobileDevice ? 'text-[8px]' : 'text-[10px]'} uppercase font-bold text-gray-400 tracking-widest`}>
                    <div className="flex items-center gap-1 md:gap-2"><span className="w-2 h-2 md:w-3 md:h-3 bg-blue-500 block"></span> {t('ui.player')}</div>
                    <div className="flex items-center gap-1 md:gap-2"><span className="w-2 h-2 md:w-3 md:h-3 bg-green-500 rounded-full block"></span> {t('ui.family_member')}</div>
                    <div className="flex items-center gap-1 md:gap-2"><span className="text-xs md:text-lg">💀</span> {t('ui.boss')}</div>
                    <div className="flex items-center gap-1 md:gap-2"><span className="text-xs md:text-lg">📦</span> {t('ui.chest')}</div>
                    <div className="flex items-center gap-1 md:gap-2"><span className="text-xs md:text-lg">📍</span> {t('ui.poi')}</div>
                    <div className="flex items-center gap-1 md:gap-2"><span className="text-xs md:text-lg">🔍</span> {t('ui.clue')}</div>
                </div>
            }
        >
            {/* Mobile Only: Player Position Row (moved from header) */}
            {isMobileDevice && playerPos && (
                <div className="flex justify-center mb-2 pb-2 border-b border-white/5">
                    <div className="flex items-center gap-3 bg-blue-900/20 px-4 py-1 border border-blue-500/30 skew-x-[-5deg]">
                        <span className="text-[10px] text-blue-400 font-black uppercase tracking-widest skew-x-[5deg]">{t('ui.player')}</span>
                        <span className="text-sm font-mono text-white font-bold skew-x-[5deg]">
                            {Math.round(playerPos.x)}, {Math.round(playerPos.z)}
                        </span>
                    </div>
                </div>
            )}

            {/* Map Container */}
            <div className={`w-full relative overflow-hidden flex items-center justify-center bg-black/40 ${isMobileDevice ? 'h-[60vh]' : 'h-[70vh]'}`}>
                <MapCanvas
                    bounds={bounds}
                    groupedEntities={groupedEntities}
                    setTooltipData={setTooltipData}
                    onMouseMove={handleMouseMove}
                    onClick={onMapClick}
                    onTouchStart={handleTouchStart}
                />
            </div>

            <TooltipOverlay data={tooltipData} />
        </GameModalLayout>
    );
};

export default ScreenMap;
