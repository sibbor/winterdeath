import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { MapItem, MapItemType } from '../../hud/HudTypes';
import { t } from '../../../../utils/i18n';
import { UiSounds } from '../../../../utils/audio/AudioLib';
import ScreenModalLayout, { TacticalCard } from '../../layout/ScreenModalLayout';
import { useHudStore } from '../../../../hooks/useHudStore';
import { HudStore } from '../../../../store/HudStore';
import { DamageID } from '../../../../entities/player/CombatTypes';


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

// Extracted utility
const getMapPercent = (x: number, z: number, bounds: any) => {
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxZ - bounds.minZ;
    if (width === 0 || height === 0) return { x: 50, y: 50 };
    return {
        x: ((x - bounds.minX) / width) * 100,
        y: ((z - bounds.minZ) / height) * 100
    };
};

const MapCanvas = React.memo(({ mapItems, bounds, groupedEntities, setTooltipData, onMouseMove, onInteractionStart, onInteractionEnd, onClickImmediate, isMobileDevice }: any) => {

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

    return (
        <div
            className="absolute inset-0 bg-slate-900 border-2 border-blue-900/50 cursor-crosshair overflow-hidden"
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onTouchEnd={onInteractionEnd}
        >
            <div className="absolute inset-0 pointer-events-none">{gridLines}</div>

            {/* Polygon Layer (Terrain/Buildings) */}
            <svg className="absolute inset-0 pointer-events-none w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {mapItems.filter((item: MapItem) => item.points && item.points.length > 0).map((poly: MapItem) => (
                    <polygon
                        key={poly.id}
                        points={poly.points!.map(p => {
                            const pos = getMapPercent(p.x, p.z, bounds);
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
                {mapItems.filter((item: MapItem) => item.type === 'LAKE' && !item.points).map((lake: MapItem) => {
                    const pos = getMapPercent(lake.x, lake.z, bounds);
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
                const pos = getMapPercent(topItem.x, topItem.z, bounds);
                let content = <div className="w-2 h-2 rounded-full" style={{ backgroundColor: topItem.color || 'white' }} />;

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

// ZERO-GC: Live Map Entities perfectly decoupled from the heavy SVG re-renders
const LiveMapEntities = React.memo(({ bounds }: { bounds: any }) => {
    const playerRef = useRef<HTMLDivElement>(null);
    const familyRef = useRef<HTMLDivElement>(null);
    const bossRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        return HudStore.subscribe((state) => {
            // Update Player
            if (playerRef.current) {
                const posP = getMapPercent(state.playerPos.x, state.playerPos.z, bounds);
                playerRef.current.style.left = `${posP.x}%`;
                playerRef.current.style.top = `${posP.y}%`;
            }

            // Update Boss
            if (bossRef.current) {
                if (state.boss.active && !state.bossDefeated && state.bossPos) {
                    const posB = getMapPercent(state.bossPos.x, state.bossPos.z, bounds);
                    bossRef.current.style.display = 'block';
                    bossRef.current.style.left = `${posB.x}%`;
                    bossRef.current.style.top = `${posB.y}%`;
                } else {
                    bossRef.current.style.display = 'none';
                }
            }

            // Update Family
            if (familyRef.current) {
                if (state.activeWeapon === DamageID.RADIO && state.familyPos) {

                    const posF = getMapPercent(state.familyPos.x, state.familyPos.z, bounds);
                    familyRef.current.style.display = 'block';
                    familyRef.current.style.left = `${posF.x}%`;
                    familyRef.current.style.top = `${posF.y}%`;
                } else {
                    familyRef.current.style.display = 'none';
                }
            }
        });
    }, [bounds]);

    return (
        <>
            <div
                ref={playerRef}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none will-change-[left,top]"
                style={{ left: '50%', top: '50%' }}
            >
                <div className="w-3 h-3 bg-blue-500 rotate-45 border border-white shadow-[0_0_10px_white] scale-125" />
            </div>

            <div
                ref={bossRef}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none will-change-[left,top]"
                style={{ display: 'none' }}
            >
                <span className="text-2xl">💀</span>
            </div>

            <div
                ref={familyRef}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none will-change-[left,top]"
                style={{ display: 'none' }}
            >
                <div className="w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse" />
            </div>
        </>
    );
});

const LivePlayerCoordinates = React.memo(() => {
    const textRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        return HudStore.subscribe((state) => {
            if (textRef.current) {
                const px = Math.round(state.playerPos.x);
                const pz = Math.round(state.playerPos.z);
                const val = `${px}, ${pz}`;
                if (textRef.current.innerText !== val) {
                    textRef.current.innerText = val;
                }
            }
        });
    }, []);

    return (
        <span ref={textRef} className="text-sm font-mono text-white font-bold">
            0, 0
        </span>
    );
});

const LONG_PRESS_DURATION = 600;

export const ScreenMap: React.FC<ScreenMapProps> = ({ onClose, onSelectCoords, isMobileDevice }) => {
    const mapItems = useHudStore(s => s.mapItems);

    const [mouseCoords, setMouseCoords] = useState<{ x: number, z: number } | null>(null);
    const [tooltipData, setTooltipData] = useState<any>(null);
    const longPressTimer = useRef<any>(null);
    const pressCoords = useRef<{ x: number, z: number } | null>(null);

    const bounds = useMemo(() => {
        if (mapItems.length === 0) return { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < mapItems.length; i++) {
            const e = mapItems[i];
            minX = Math.min(minX, e.x); maxX = Math.max(maxX, e.x);
            minZ = Math.min(minZ, e.z); maxZ = Math.max(maxZ, e.z);
        }
        // If max == min, add buffer to prevent div/0
        if (maxX <= minX) { maxX += 100; minX -= 100; }
        if (maxZ <= minZ) { maxZ += 100; minZ -= 100; }

        const pad = 100;
        return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
    }, [mapItems]);

    const staticGroupedEntities = useMemo(() => {
        const groups: Record<string, MapItem[]> = {};
        for (let i = 0; i < mapItems.length; i++) {
            const item = mapItems[i];
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
    }, [mapItems]);

    const handleSetMouseCoords = useCallback((x: number, z: number) => {
        // Debounce or reduce resolution if needed, but standard mouse move is fine for occasional overlay
        setMouseCoords({ x, z });
    }, []);

    const handleInteractionStart = useCallback((x: number, z: number) => {
        pressCoords.current = { x, z };
        if (longPressTimer.current) clearTimeout(longPressTimer.current);
        longPressTimer.current = setTimeout(() => {
            if (pressCoords.current) {
                UiSounds.playConfirm();
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
        UiSounds.playConfirm();
        onSelectCoords(x, z);
    }, [onSelectCoords]);

    const footerNode = useMemo(() => (
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
                <TacticalCard color="#3b82f6" className="px-3 py-1 flex items-center gap-2">
                    <span className="text-[10px] text-blue-400 font-bold uppercase">{t('ui.player')}</span>
                    <LivePlayerCoordinates />
                </TacticalCard>
                {!isMobileDevice && mouseCoords && (
                    <TacticalCard color="#94a3b8" className="px-3 py-1 flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 font-bold uppercase">{t('ui.coordinates')}</span>
                        <span className="text-sm font-mono text-white font-bold">
                            {`${Math.round(mouseCoords.x)}, ${Math.round(mouseCoords.z)}`}
                        </span>
                    </TacticalCard>
                )}
            </div>
        </div>
    ), [isMobileDevice, mouseCoords]);

    return (
        <ScreenModalLayout
            title={t('ui.map')}
            isMobileDevice={isMobileDevice}
            onClose={onClose}
            onCancel={onClose}
            cancelLabel={t('ui.close')}
            fullHeight={true}
            contentClass="flex flex-col p-0 !px-0 !pb-0 overflow-hidden"
            footer={footerNode}
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
                        display: 'flex' // crucial to keep relative child sizing sane
                    }}
                >
                    <MapCanvas
                        mapItems={mapItems}
                        bounds={bounds}
                        groupedEntities={staticGroupedEntities}
                        setTooltipData={setTooltipData}
                        onMouseMove={handleSetMouseCoords}
                        onInteractionStart={handleInteractionStart}
                        onInteractionEnd={handleInteractionEnd}
                        onClickImmediate={handleClickImmediate}
                        isMobileDevice={isMobileDevice}
                    />
                    {/* Absolutely positioned live entities mapped over the canvas */}
                    <div className="absolute inset-0 pointer-events-none z-20">
                        <LiveMapEntities bounds={bounds} />
                    </div>
                </div>
            </div>
            <TooltipOverlay data={tooltipData} />
        </ScreenModalLayout>
    );
};

export default ScreenMap;