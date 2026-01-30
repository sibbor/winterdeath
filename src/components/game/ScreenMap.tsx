
import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { MapItem, MapItemType } from '../../types';
import { t } from '../../utils/i18n';
import { soundManager } from '../../utils/sound';

interface ScreenMapProps {
    items: MapItem[];
    playerPos: { x: number, z: number } | undefined;
    familyPos?: { x: number, z: number };
    bossPos?: { x: number, z: number };
    onClose: () => void;
    onSelectCoords: (x: number, z: number) => void;
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
    const [pos, setPos] = useState<{ top: number, left: number, align: 'top'|'bottom' }>({ top: -1000, left: -1000, align: 'top' });

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

const ScreenMap: React.FC<ScreenMapProps> = ({ items = [], playerPos, familyPos, bossPos, onClose, onSelectCoords }) => {
    const [tooltipData, setTooltipData] = useState<{ rect: DOMRect, items: MapItem[] } | null>(null);
    const [mouseCoords, setMouseCoords] = useState<{x: number, z: number} | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

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

    const toMapPercent = (x: number, z: number) => {
        if (!bounds || bounds.width === 0 || bounds.height === 0) return { x: 50, y: 50 };
        const px = ((x - bounds.minX) / bounds.width) * 100;
        const py = ((z - bounds.minZ) / bounds.height) * 100;
        return { x: px, y: py };
    };

    const fromMapPercent = (px: number, py: number) => {
        if (!bounds) return { x: 0, z: 0 };
        const x = bounds.minX + (px / 100) * bounds.width;
        const z = bounds.minZ + (py / 100) * bounds.height;
        return { x, z };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        
        const px = ((e.clientX - rect.left) / rect.width) * 100;
        const py = ((e.clientY - rect.top) / rect.height) * 100;
        
        const worldPos = fromMapPercent(px, py);
        setMouseCoords(worldPos);
    };

    const handleMapClick = () => {
        if (!mouseCoords) return;
        soundManager.playUiClick();
        onSelectCoords(mouseCoords.x, mouseCoords.z);
    };

    // Render Grid Lines
    const renderGrid = () => {
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
    };

    return (
        <div className="absolute inset-0 z-[80] bg-black/80 flex items-center justify-center backdrop-blur-sm p-8" onClick={onClose}>
            <div 
                className="w-full max-w-6xl h-[90vh] bg-black/95 border-4 border-blue-900/50 flex flex-col relative shadow-[0_0_50px_rgba(0,0,0,0.5)] skew-x-[-2deg]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Background Decoration */}
                <div className="absolute top-0 right-0 opacity-5 pointer-events-none">
                    <svg viewBox="0 0 100 100" width="300" height="300" fill="blue"><path d="M10 10 L90 10 L50 90 Z" /></svg>
                </div>

                {/* Header */}
                <div className="w-full p-6 border-b border-white/10 flex justify-between items-center bg-black/50 z-10">
                    <h2 className="text-4xl font-black text-white uppercase tracking-tighter border-l-4 border-blue-500 pl-4 skew-x-[-5deg]">
                        {t('ui.tactical_map')}
                    </h2>
                    <div className="flex gap-6 items-center mr-4">
                        <div className="text-right">
                            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">{t('ui.coordinates')}</p>
                            <p className="text-xl font-mono text-white font-bold">
                                {mouseCoords ? `${Math.round(mouseCoords.x)}, ${Math.round(mouseCoords.z)}` : '--, --'}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">{t('ui.player')}</p>
                            <p className="text-xl font-mono text-white font-bold">
                                {playerPos ? `${Math.round(playerPos.x)}, ${Math.round(playerPos.z)}` : '--, --'}
                            </p>
                        </div>
                        <button onClick={onClose} className="px-8 py-2 border-2 border-white text-white hover:bg-white hover:text-black font-black uppercase tracking-widest transition-colors skew-x-[-5deg] ml-4">
                            <span className="block skew-x-[5deg]">{t('ui.close')}</span>
                        </button>
                    </div>
                </div>

                {/* Map Container */}
                <div className="flex-1 w-full relative overflow-hidden p-8 flex items-center justify-center bg-black/40">
                    <div 
                        ref={containerRef}
                        className="relative bg-slate-900/80 border-2 border-blue-900/50 shadow-[0_0_50px_rgba(0,0,0,0.5)] cursor-crosshair skew-x-[2deg]"
                        style={{ 
                            aspectRatio: `${bounds.width} / ${bounds.height}`,
                            width: bounds.width > bounds.height ? '95%' : 'auto',
                            height: bounds.height >= bounds.width ? '95%' : 'auto'
                        }}
                        onMouseMove={handleMouseMove}
                        onClick={handleMapClick}
                    >
                        {/* Grid */}
                        <div className="absolute inset-0 pointer-events-none">{renderGrid()}</div>

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
                                    content = <div className={`rounded-full shadow-sm ${sizeClass}`} style={{ backgroundColor: topItem.color || '#fff' }} />;
                                    break;
                                case 'OBSTACLE':
                                    zIndex = 10; sizeClass = "w-2 h-2";
                                    content = <div className={`rounded-full shadow-sm ${sizeClass}`} style={{ backgroundColor: topItem.color || '#fff' }} />;
                                    break;
                                case 'CHEST':
                                    zIndex = 15; sizeClass = "w-4 h-4";
                                    content = <div className={`rounded-full shadow-sm ${sizeClass}`} style={{ backgroundColor: topItem.color || '#fff' }} />;
                                    break;
                                default:
                                    content = (topItem.icon && topItem.icon.length < 5) ? <span style={{color: topItem.color}}>{topItem.icon}</span> : <div className={`rounded-full shadow-sm ${sizeClass}`} style={{ backgroundColor: topItem.color || '#fff' }} />;
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
                </div>

                {/* Footer Legend */}
                <div className="w-full bg-black/80 border-t border-white/10 p-4 flex justify-center gap-8 text-[10px] uppercase font-bold text-gray-400 tracking-widest z-10">
                    <div className="flex items-center gap-2"><span className="w-3 h-3 bg-blue-500 block"></span> {t('ui.player')}</div>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 bg-green-500 rounded-full block"></span> {t('ui.family_member')}</div>
                    <div className="flex items-center gap-2"><span className="text-lg">💀</span> {t('ui.boss')}</div>
                    <div className="flex items-center gap-2"><span className="text-lg">📦</span> {t('ui.chest')}</div>
                    <div className="flex items-center gap-2"><span className="text-lg">📍</span> {t('ui.poi')}</div>
                    <div className="flex items-center gap-2"><span className="text-lg">🔍</span> {t('ui.clue')}</div>
                </div>
            </div>

            {/* Render Tooltip Overlay outside the map container/clipping context */}
            <TooltipOverlay data={tooltipData} />
        </div>
    );
};

export default ScreenMap;
