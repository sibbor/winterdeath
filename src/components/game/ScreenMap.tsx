import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MapItem, MapItemType } from '../../types';
import { t } from '../../utils/i18n';
import { soundManager } from '../../utils/SoundManager';
import ScreenModalLayout from '../ui/ScreenModalLayout';
import { useHudStore } from '../../hooks/useHudStore';

interface ScreenMapProps {
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
        default: return 0;
    }
};

const TooltipOverlay: React.FC<{ data: { rect: DOMRect, items: MapItem[] } | null }> = ({ data }) => {
    if (!data) return null;
    return (
        <div
            className="fixed z-[100] bg-black/95 backdrop-blur-md text-white text-xs font-mono p-3 border border-white/30 shadow-2xl pointer-events-none"
            style={{
                top: Math.max(10, data.rect.top - 120),
                left: Math.min(window.innerWidth - 210, Math.max(10, data.rect.left - 100))
            }}
        >
            {data.items.map((item, idx) => (
                <div key={idx} className="mb-2 last:mb-0">
                    <div className="font-bold text-blue-300 uppercase border-b border-white/10 mb-1">{t(item.label || "Object")}</div>
                    <div className="text-[10px] text-gray-400">X: {Math.round(item.x)}, Z: {Math.round(item.z)}</div>
                </div>
            ))}
        </div>
    );
};

const MapCanvas = React.memo(({ bounds, groupedEntities, setTooltipData, onMouseMove, onInteractionStart, onInteractionEnd, onClickImmediate, isMobileDevice }: any) => {
    const toMapPercent = useCallback((x: number, z: number) => {
        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxZ - bounds.minZ;
        if (width === 0 || height === 0) return { x: 50, y: 50 };
        return {
            x: ((x - bounds.minX) / width) * 100,
            y: ((z - bounds.minZ) / height) * 100
        };
    }, [bounds]);

    // Zero-GC Input Handlers
    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * 100;
        const py = ((e.clientY - rect.top) / rect.height) * 100;
        const x = bounds.minX + (px / 100) * (bounds.maxX - bounds.minX);
        const z = bounds.minZ + (py / 100) * (bounds.maxZ - bounds.minZ);
        onMouseMove(x, z);
    }, [bounds, onMouseMove]);

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (isMobileDevice) return; // PC only
        const rect = e.currentTarget.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * 100;
        const py = ((e.clientY - rect.top) / rect.height) * 100;
        const x = bounds.minX + (px / 100) * (bounds.maxX - bounds.minX);
        const z = bounds.minZ + (py / 100) * (bounds.maxZ - bounds.minZ);
        onClickImmediate(x, z);
    }, [bounds, onClickImmediate, isMobileDevice]);

    const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
        const touch = e.touches[0];
        const rect = e.currentTarget.getBoundingClientRect();
        const px = ((touch.clientX - rect.left) / rect.width) * 100;
        const py = ((touch.clientY - rect.top) / rect.height) * 100;
        const x = bounds.minX + (px / 100) * (bounds.maxX - bounds.minX);
        const z = bounds.minZ + (py / 100) * (bounds.maxZ - bounds.minZ);
        onInteractionStart(x, z);
    }, [bounds, onInteractionStart]);


    // Render Grid Lines
    const gridLines = useMemo(() => {
        const lines = [];
        const step = 100;
        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxZ - bounds.minZ;

        for (let x = Math.ceil(bounds.minX / step) * step; x <= bounds.maxX; x += step) {
            const px = ((x - bounds.minX) / width) * 100;
            lines.push(
                <div key={`v-${x}`} className="absolute top-0 bottom-0 border-l border-white/5" style={{ left: `${px}%` }}>
                    <span className="absolute top-2 left-1 text-[8px] text-white/20 font-mono">{x}</span>
                </div>
            );
        }
        for (let z = Math.ceil(bounds.minZ / step) * step; z <= bounds.maxZ; z += step) {
            const py = ((z - bounds.minZ) / height) * 100;
            lines.push(
                <div key={`h-${z}`} className="absolute left-0 right-0 border-t border-white/5" style={{ top: `${py}%` }}>
                    <span className="absolute left-2 top-0 text-[8px] text-white/20 font-mono">{z}</span>
                </div>
            );
        }
        return lines;
    }, [bounds]);

    const mapItems = useHudStore(s => s.mapItems);

    return (
        <div
            className="relative bg-slate-900 border-2 border-blue-900/50 cursor-crosshair w-full h-full overflow-hidden"
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onTouchEnd={onInteractionEnd}
        >
            <div className="absolute inset-0 pointer-events-none">{gridLines}</div>

            {/* Polygon Layer (Terrain/Buildings) */}
            <svg className="absolute inset-0 pointer-events-none w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {mapItems.filter(item => item.points && item.points.length > 0).map(poly => (
                    <polygon
                        key={poly.id}
                        points={poly.points!.map(p => {
                            const pos = toMapPercent(p.x, p.z);
                            return `${pos.x},${pos.y}`;
                        }).join(' ')}
                        fill={poly.color || 'gray'}
                        fillOpacity={poly.type === 'BUILDING' ? 0.8 : 0.4}
                        stroke={poly.color || 'gray'}
                        strokeOpacity={0.6}
                        strokeWidth="0.2"
                    />
                ))}
                {/* Circular Lakes (Fallback for radius without points) */}
                {mapItems.filter(item => item.type === 'LAKE' && !item.points).map(lake => {
                    const pos = toMapPercent(lake.x, lake.z);
                    const rx = (lake.radius! / (bounds.maxX - bounds.minX)) * 100;
                    const ry = (lake.radius! / (bounds.maxZ - bounds.minZ)) * 100;
                    return (
                        <ellipse
                            key={lake.id}
                            cx={pos.x}
                            cy={pos.y}
                            rx={rx}
                            ry={ry}
                            fill={lake.color || '#3b82f6'}
                            fillOpacity={0.4}
                            stroke={lake.color || '#3b82f6'}
                            strokeOpacity={0.6}
                            strokeWidth="0.2"
                        />
                    );
                })}
            </svg>

            <div className="absolute left-1/2 top-0 bottom-0 border-l border-blue-500/10 pointer-events-none"></div>
            <div className="absolute top-1/2 left-0 right-0 border-t border-blue-500/10 pointer-events-none"></div>
            {groupedEntities.map((group: any, i: number) => {
                const topItem = group[0];
                const pos = toMapPercent(topItem.x, topItem.z);
                let content = <div className="w-2 h-2 rounded-full" style={{ backgroundColor: topItem.color || 'white' }} />;

                if (topItem.type === 'PLAYER') content = <div className="w-3 h-3 bg-blue-500 rotate-45 border border-white shadow-[0_0_10px_white] scale-125" />;
                if (topItem.type === 'BOSS') content = <span className="text-2xl">💀</span>;
                if (topItem.type === 'FAMILY') content = <div className="w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse" />;
                if (topItem.type === 'POI') content = <span className="text-lg">📍</span>;
                if (topItem.type === 'CHEST') content = <span className="text-lg">📦</span>;
                if (topItem.type === 'TRIGGER' || topItem.label?.includes('clue')) content = <span className="text-lg">🔍</span>;

                return (
                    <div
                        key={i}
                        className="absolute -translate-x-1/2 -translate-y-1/2 cursor-help z-10"
                        style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                        onMouseEnter={(e) => setTooltipData({ rect: e.currentTarget.getBoundingClientRect(), items: group })}
                        onMouseLeave={() => setTooltipData(null)}
                        onClick={(e) => {
                            e.stopPropagation();
                            setTooltipData({ rect: e.currentTarget.getBoundingClientRect(), items: group });
                        }}
                    >
                        {content}
                    </div>
                );
            })}
        </div>
    );
});

const LONG_PRESS_DURATION = 600;

export const ScreenMap: React.FC<ScreenMapProps> = ({ onClose, onSelectCoords, isMobileDevice }) => {
    const px = useHudStore(s => s.playerPos.x);
    const pz = useHudStore(s => s.playerPos.z);
    const fx = useHudStore(s => s.familyPos?.x || 0);
    const fz = useHudStore(s => s.familyPos?.z || 0);
    const bx = useHudStore(s => s.bossPos?.x || 0);
    const bz = useHudStore(s => s.bossPos?.z || 0);
    const hasFamily = useHudStore(s => !!s.familyPos);
    const hasBoss = useHudStore(s => !!s.bossPos);
    const mapItems = useHudStore(s => s.mapItems);

    const [mouseCoords, setMouseCoords] = useState<{ x: number, z: number } | null>(null);
    const [tooltipData, setTooltipData] = useState<any>(null);
    const longPressTimer = useRef<any>(null);
    const pressCoords = useRef<{ x: number, z: number } | null>(null);

    const allEntities = useMemo(() => {
        const ent = [...mapItems];
        ent.push({ id: 'player', x: px, z: pz, type: 'PLAYER', label: 'ui.player', color: '#3b82f6', icon: null, radius: null });
        if (hasFamily) ent.push({ id: 'family', x: fx, z: fz, type: 'FAMILY', label: 'ui.family_member', color: '#22c55e', icon: null, radius: null });
        if (hasBoss) ent.push({ id: 'boss', x: bx, z: bz, type: 'BOSS', label: 'ui.boss', color: '#ef4444', icon: null, radius: null });
        return ent;
    }, [mapItems, px, pz, fx, fz, bx, bz, hasFamily, hasBoss]);

    const groupedEntities = useMemo(() => {
        const groups: Record<string, MapItem[]> = {};
        for (let i = 0; i < allEntities.length; i++) {
            const item = allEntities[i];
            const key = `${Math.round(item.x / 10)}_${Math.round(item.z / 10)}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        }

        const result = [];
        for (const key in groups) {
            const sorted = groups[key].sort((a, b) => getItemPriority(b.type) - getItemPriority(a.type));
            result.push(sorted);
        }
        return result;
    }, [allEntities]);

    const bounds = useMemo(() => {
        if (allEntities.length === 0) return { minX: -450, maxX: 450, minZ: -450, maxZ: 450 };
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < allEntities.length; i++) {
            const e = allEntities[i];
            minX = Math.min(minX, e.x); maxX = Math.max(maxX, e.x);
            minZ = Math.min(minZ, e.z); maxZ = Math.max(maxZ, e.z);
        }
        const pad = 100;
        return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
    }, [allEntities]);

    const handleSetMouseCoords = useCallback((x: number, z: number) => {
        setMouseCoords({ x, z });
    }, []);

    const handleInteractionStart = useCallback((x: number, z: number) => {
        pressCoords.current = { x, z };
        if (longPressTimer.current) clearTimeout(longPressTimer.current);
        longPressTimer.current = setTimeout(() => {
            if (pressCoords.current) {
                soundManager.playUiConfirm();
                onSelectCoords(pressCoords.current.x, pressCoords.current.z);
                longPressTimer.current = null;
            }
        }, LONG_PRESS_DURATION);
    }, [onSelectCoords]);

    const handleInteractionEnd = useCallback(() => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }, []);

    const handleClickImmediate = useCallback((x: number, z: number) => {
        soundManager.playUiConfirm();
        onSelectCoords(x, z);
    }, [onSelectCoords]);

    return (
        <ScreenModalLayout
            title={t('ui.map')}
            isMobileDevice={isMobileDevice}
            onClose={onClose}
            onCancel={onClose}
            cancelLabel={t('ui.close')}
            fullHeight={true}
            contentClass="flex flex-col p-0 !px-0 !pb-0 overflow-hidden"
            footer={
                <div className="flex flex-col gap-4 w-full">
                    <div className="w-full flex flex-wrap justify-center gap-4 text-[10px] uppercase font-bold text-gray-400">
                        <div className="flex items-center gap-2"><span className="w-2 h-2 bg-blue-500"></span> {t('ui.player')}</div>
                        <div className="flex items-center gap-2"><span className="w-2 h-2 bg-green-500 rounded-full"></span> {t('ui.family_member')}</div>
                        <div className="flex items-center gap-2">💀 {t('ui.boss')}</div>
                        <div className="flex items-center gap-2">📦 {t('ui.chest')}</div>
                        <div className="flex items-center gap-2">📍 {t('ui.poi')}</div>
                        <div className="flex items-center gap-2">🔍 {t('ui.clue')}</div>
                    </div>
                    <div className="flex gap-4 justify-center">
                        <div className="bg-blue-900/20 px-3 py-1 border border-blue-500/30">
                            <span className="text-[10px] text-blue-400 font-bold uppercase mr-2">{t('ui.player')}</span>
                            <span className="text-sm font-mono text-white font-bold">
                                {`${Math.round(px)}, ${Math.round(pz)}`}
                            </span>
                        </div>
                        {!isMobileDevice && (
                            <div className="bg-gray-900/40 px-3 py-1 border border-gray-700/50">
                                <span className="text-[10px] text-gray-400 font-bold uppercase mr-2">{t('ui.coordinates')}</span>
                                <span className="text-sm font-mono text-white font-bold">
                                    {mouseCoords ? `${Math.round(mouseCoords.x)}, ${Math.round(mouseCoords.z)}` : '--, --'}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            }
        >
            <div className="relative flex-1 w-full bg-black/60 border border-white/10 overflow-hidden flex items-center justify-center">
                <div 
                    className="relative shadow-2xl"
                    style={{ 
                        aspectRatio: `${(bounds.maxX - bounds.minX) / (bounds.maxZ - bounds.minZ)}`,
                        width: '100%',
                        height: 'auto',
                        maxWidth: '100%',
                        maxHeight: '100%',
                        display: 'flex'
                    }}
                >
                    <MapCanvas
                        bounds={bounds}
                        groupedEntities={groupedEntities}
                        setTooltipData={setTooltipData}
                        onMouseMove={handleSetMouseCoords}
                        onInteractionStart={handleInteractionStart}
                        onInteractionEnd={handleInteractionEnd}
                        onClickImmediate={handleClickImmediate}
                        isMobileDevice={isMobileDevice}
                    />
                </div>
            </div>
            <TooltipOverlay data={tooltipData} />
        </ScreenModalLayout>
    );
};

export default ScreenMap;