import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { MapItem, MapItemType } from '../../hud/HudTypes';
import { t } from '../../../../utils/i18n';
import { UiSounds } from '../../../../utils/audio/AudioLib';
import ScreenModalLayout, { TacticalCard } from '../../layout/ScreenModalLayout';
import { useHudStore } from '../../../../hooks/useHudStore';
import { HudStore } from '../../../../store/HudStore';
import { DamageID, ToolID } from '../../../../entities/player/CombatTypes';
import { colorToHex } from '../../../../utils/ui/ColorUtils';

interface ScreenMapProps {
    onClose: () => void;
    onSelectCoords: (x: number, z: number) => void;
    isMobileDevice?: boolean;
}

const getItemPriority = (type: MapItemType | number): number => {
    switch (type) {
        case MapItemType.PLAYER: return 100;
        case MapItemType.BOSS: return 90;
        case MapItemType.FAMILY: return 80;
        case MapItemType.POI: return 70;
        case MapItemType.TRIGGER: return 60;
        case MapItemType.CHEST: return 50;
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
                    <div className="font-bold text-blue-300 uppercase border-b border-white/10 mb-1">{t(item.label || "ui.object")}</div>
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

const MapCanvas = React.memo(({ mapItems, mapItemsCount, bounds, groupedEntities, setTooltipData, onMouseMove, onInteractionStart, onInteractionEnd, onClickImmediate, isMobileDevice }: any) => {

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
                    <span className="absolute top-2 left-1 text-[10px] text-white/20 font-mono">{x}</span>
                </div>
            );
        }
        for (let z = Math.ceil(bounds.minZ / step) * step; z <= bounds.maxZ; z += step) {
            const py = ((z - bounds.minZ) / height) * 100;
            lines.push(
                <div key={`h-${z}`} className="absolute left-0 right-0 border-t border-white/5" style={{ top: `${py}%` }}>
                    <span className="absolute left-2 top-0 text-[10px] text-white/20 font-mono">{z}</span>
                </div>
            );
        }
        return lines;
    }, [bounds]);

    return (
        <div
            className="absolute inset-0 bg-slate-950 border-2 border-blue-900/50 cursor-crosshair overflow-hidden"
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onTouchEnd={onInteractionEnd}
        >
            <div className="absolute inset-0 pointer-events-none">{gridLines}</div>

            {/* Gritty radar ambient sweep & CRT glass/scanline overlays */}
            <div className="radar-sonar-sweep" />
            <div className="radar-crt-overlay" />

            {/* Polygon Layer (Terrain/Buildings) */}
            <svg className="absolute inset-0 pointer-events-none w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {(() => {
                    const elements = [];
                    for (let i = 0; i < mapItemsCount; i++) {
                        const item = mapItems[i];
                        if (item.points && item.points.length > 0) {
                            elements.push(
                                <polygon
                                    key={item.id}
                                    points={item.points.map((p: any) => {
                                        const pos = getMapPercent(p.x, p.z, bounds);
                                        return `${pos.x},${pos.y}`;
                                    }).join(' ')}
                                    fill={item.color || 'gray'}
                                    fillOpacity={item.type === MapItemType.BUILDING ? 0.8 : 0.4}
                                    stroke={item.color || 'gray'}
                                    strokeOpacity={0.6}
                                    strokeWidth="0.2"
                                />
                            );
                        } else if (item.type === MapItemType.LAKE) {
                            const pos = getMapPercent(item.x, item.z, bounds);
                            const rx = (item.radius! / (bounds.maxX - bounds.minX)) * 100;
                            const ry = (item.radius! / (bounds.maxZ - bounds.minZ)) * 100;
                            elements.push(
                                <ellipse
                                    key={item.id}
                                    cx={pos.x}
                                    cy={pos.y}
                                    rx={rx}
                                    ry={ry}
                                    fill={item.color || colorToHex(0x3b82f6)}
                                    fillOpacity={0.4}
                                    stroke={item.color || colorToHex(0x3b82f6)}
                                    strokeOpacity={0.6}
                                    strokeWidth="0.2"
                                />
                            );
                        }
                    }
                    return elements;
                })()}
            </svg>

            <div className="absolute left-1/2 top-0 bottom-0 border-l border-blue-500/10 pointer-events-none"></div>
            <div className="absolute top-1/2 left-0 right-0 border-t border-blue-500/10 pointer-events-none"></div>
            {groupedEntities.map((group: any, i: number) => {
                const topItem = group[0];
                const pos = getMapPercent(topItem.x, topItem.z, bounds);
                let content = (
                    <div
                        className="w-2.5 h-2.5 rounded-full border border-white/40 shadow-[0_0_4px_currentColor]"
                        style={{ backgroundColor: topItem.color || 'white', color: topItem.color || 'white' }}
                    />
                );

                if (topItem.type === MapItemType.POI) {
                    content = (
                        <svg className="w-8 h-8 drop-shadow-[0_0_6px_rgba(59,130,246,0.8)] stroke-blue-400 stroke-2 fill-none" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="8" />
                            <path d="M12 8v8 M8 12h8" />
                        </svg>
                    );
                } else if (topItem.type === MapItemType.CHEST) {
                    content = (
                        <svg className="w-8 h-8 drop-shadow-[0_0_6px_rgba(245,158,11,0.8)] stroke-yellow-500 stroke-2 fill-none" viewBox="0 0 24 24">
                            <rect x="4" y="4" width="16" height="16" rx="2" />
                            <path d="M4 10h16 M10 20V10 M14 20V10" />
                        </svg>
                    );
                } else if (topItem.type === MapItemType.TRIGGER || topItem.label?.includes('clue')) {
                    content = (
                        <svg className="w-8 h-8 drop-shadow-[0_0_6px_rgba(236,72,153,0.8)] stroke-pink-500 stroke-2 fill-none animate-pulse" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="5" />
                            <path d="M16 16l4 4" />
                        </svg>
                    );
                }

                return (
                    <div
                        key={i}
                        className="absolute -translate-x-1/2 -translate-y-1/2 cursor-help z-10 flex items-center justify-center"
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

// ZERO_GC: High-performance pool for up to 128 entities (SIMD-like lane)
const LiveEnemyDots = React.memo(({ bounds }: { bounds: any }) => {
    const poolRef = useRef<HTMLDivElement[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleUpdate = (data: any) => {
            if (!containerRef.current) return;
            const state = HudStore.getState();
            const vecBuf = state.vectorBuffer; // 256 length (x, z pairs)
            const width = bounds.maxX - bounds.minX;
            const height = bounds.maxZ - bounds.minZ;
            if (width === 0 || height === 0) return;

            const pool = poolRef.current;
            for (let i = 0; i < 128; i++) {
                const dot = pool[i];
                if (!dot) continue;

                const idx = i * 2;
                const ex = vecBuf[idx];
                const ez = vecBuf[idx + 1];

                // -99999 is our sentinel value from HudSystem for inactive slots
                if (ex < -90000) {
                    dot.style.display = 'none';
                } else {
                    const px = ((ex - bounds.minX) / width) * 100;
                    const py = ((ez - bounds.minZ) / height) * 100;
                    dot.style.display = 'block';
                    dot.style.left = `${px}%`;
                    dot.style.top = `${py}%`;
                }
            }
        };

        // Call once immediately so positions are populated when opening map while paused
        handleUpdate(null);

        return HudStore.subscribeFastUpdate(handleUpdate);
    }, [bounds]);

    // Pre-allocate the pool elements (128 entities)
    return (
        <div ref={containerRef} className="absolute inset-0 pointer-events-none">
            {Array.from({ length: 128 }).map((_, i) => (
                <div
                    key={i}
                    ref={el => { if (el) poolRef.current[i] = el; }}
                    className="absolute w-2 h-2 bg-red-600 rounded-full border border-red-400 shadow-[0_0_6px_#ef4444] -translate-x-1/2 -translate-y-1/2 will-change-[left,top]"
                    style={{ display: 'none' }}
                />
            ))}
        </div>
    );
});

// ZERO-GC: Live Map Entities perfectly decoupled from the heavy SVG re-renders
const LiveMapEntities = React.memo(({ bounds }: { bounds: any }) => {
    const playerRef = useRef<HTMLDivElement>(null);
    const playerArrowRef = useRef<SVGSVGElement>(null);
    const familyRef = useRef<HTMLDivElement>(null);
    const bossRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleUpdate = (data: any) => {
            const state = HudStore.getState();
            const width = bounds.maxX - bounds.minX;
            const height = bounds.maxZ - bounds.minZ;
            if (width === 0 || height === 0) return;

            // Update Player
            if (playerRef.current) {
                const px = ((state.playerPos.x - bounds.minX) / width) * 100;
                const py = ((state.playerPos.z - bounds.minZ) / height) * 100;
                playerRef.current.style.left = `${px}%`;
                playerRef.current.style.top = `${py}%`;
            }
            if (playerArrowRef.current) {
                // Three.js Y-rotation is counter-clockwise, CSS is clockwise.
                // Three.js 0 rotation faces positive Z (down on the map).
                // The arrow SVG naturally points UP (negative Z on the map).
                // So we add 180 degrees and don't negate playerRotY.
                const rotDeg = (state.playerRotY * 180 / Math.PI);
                playerArrowRef.current.style.transform = `rotate(${rotDeg}deg)`;
            }

            // Update Boss
            if (bossRef.current) {
                if (state.bossActive && !state.bossDefeated && state.bossPos) {
                    const bx = ((state.bossPos.x - bounds.minX) / width) * 100;
                    const bz = ((state.bossPos.z - bounds.minZ) / height) * 100;
                    bossRef.current.style.display = 'block';
                    bossRef.current.style.left = `${bx}%`;
                    bossRef.current.style.top = `${bz}%`;
                } else {
                    bossRef.current.style.display = 'none';
                }
            }

            // Update Family
            if (familyRef.current) {
                if (state.activeWeapon === ToolID.RADIO && state.familyPos) {
                    const fx = ((state.familyPos.x - bounds.minX) / width) * 100;
                    const fz = ((state.familyPos.z - bounds.minZ) / height) * 100;
                    familyRef.current.style.display = 'block';
                    familyRef.current.style.left = `${fx}%`;
                    familyRef.current.style.top = `${fz}%`;
                } else {
                    familyRef.current.style.display = 'none';
                }
            }
        };

        // Call once immediately so positions are populated when opening map while paused
        handleUpdate(null);

        return HudStore.subscribeFastUpdate(handleUpdate);
    }, [bounds]);

    return (
        <>
            <LiveEnemyDots bounds={bounds} />
            <div
                ref={playerRef}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none will-change-[left,top] flex items-center justify-center w-10 h-10"
                style={{ left: '50%', top: '50%' }}
            >
                <svg ref={playerArrowRef} className="w-8 h-8 drop-shadow-[0_0_8px_rgba(59,130,246,0.85)] fill-blue-500 stroke-white animate-pulse" viewBox="0 0 24 24">
                    <polygon points="12,2 22,22 12,17 2,22" />
                </svg>
            </div>

            <div
                ref={bossRef}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none will-change-[left,top] flex items-center justify-center w-12 h-12"
                style={{ display: 'none' }}
            >
                <svg className="w-10 h-10 drop-shadow-[0_0_8px_rgba(239,68,68,0.9)] fill-red-600 stroke-red-400 animate-[pulse_1.5s_infinite]" viewBox="0 0 24 24">
                    <path d="M12 2C8.69 2 6 4.69 6 8C6 11.31 8.69 14 12 14C15.31 14 18 11.31 18 8C18 4.69 15.31 2 12 2M8.5 7.5C8.5 6.67 9.17 6 10 6C10.83 6 11.5 6.67 11.5 7.5C11.5 8.33 10.83 9 10 9C9.17 9 8.5 8.33 8.5 7.5M14 6C14.83 6 15.5 6.67 15.5 7.5C15.5 8.33 14.83 9 14 9C13.17 9 12.5 8.33 12.5 7.5C12.5 6.67 13.17 6 14 6M10 16V18H14V16H10Z" />
                </svg>
            </div>

            <div
                ref={familyRef}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none will-change-[left,top] flex items-center justify-center w-12 h-12"
                style={{ display: 'none' }}
            >
                <svg className="w-10 h-10 drop-shadow-[0_0_8px_rgba(34,197,94,0.9)] stroke-green-500 stroke-2 fill-none" viewBox="0 0 24 24">
                    <path d="M4 8V4h4 M16 4h4v4 M20 16v4h-4 M8 20H4v-4" />
                    <circle cx="12" cy="12" r="3" className="fill-green-500 animate-ping" />
                </svg>
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
    const { mapItems, mapItemsCount } = useHudStore(s => ({ mapItems: s.mapItems, mapItemsCount: s.mapItemsCount }), true);
    const sectorName = t(useHudStore(s => s.sectorName));

    const mouseCoordsTextRef = useRef<HTMLSpanElement>(null);
    const mouseCoordsCardRef = useRef<HTMLDivElement>(null);
    const [tooltipData, setTooltipData] = useState<any>(null);
    const longPressTimer = useRef<any>(null);
    const pressCoords = useRef<{ x: number, z: number } | null>(null);

    const bounds = useMemo(() => {
        if (mapItemsCount === 0) return { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < mapItemsCount; i++) {
            const e = mapItems[i];
            minX = Math.min(minX, e.x); maxX = Math.max(maxX, e.x);
            minZ = Math.min(minZ, e.z); maxZ = Math.max(maxZ, e.z);
        }
        // If max == min, add buffer to prevent div/0
        if (maxX <= minX) { maxX += 100; minX -= 100; }
        if (maxZ <= minZ) { maxZ += 100; minZ -= 100; }

        const pad = 100;
        return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
    }, [mapItems, mapItemsCount]);

    const staticGroupedEntities = useMemo(() => {
        const groups: Record<string, MapItem[]> = {};
        for (let i = 0; i < mapItemsCount; i++) {
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
    }, [mapItems, mapItemsCount]);

    const handleSetMouseCoords = useCallback((x: number, z: number) => {
        if (mouseCoordsTextRef.current) {
            mouseCoordsTextRef.current.innerText = `${Math.round(x)}, ${Math.round(z)}`;
        }
        if (mouseCoordsCardRef.current && mouseCoordsCardRef.current.style.display === 'none') {
            mouseCoordsCardRef.current.style.display = 'flex';
        }
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
            <div className="w-full flex flex-wrap justify-center gap-6 text-sm uppercase font-bold text-gray-300">
                <div className="flex items-center gap-2">
                    <svg className="w-6 h-6 fill-blue-500 stroke-white" viewBox="0 0 24 24">
                        <polygon points="12,2 22,22 12,17 2,22" />
                    </svg>
                    {t('ui.player')}
                </div>
                <div className="flex items-center gap-2">
                    <svg className="w-6 h-6 stroke-green-500 stroke-2 fill-none" viewBox="0 0 24 24">
                        <path d="M4 8V4h4 M16 4h4v4 M20 16v4h-4 M8 20H4v-4" />
                        <circle cx="12" cy="12" r="3" className="fill-green-500" />
                    </svg>
                    {t('ui.family_member')}
                </div>
                <div className="flex items-center gap-2">
                    <svg className="w-6 h-6 fill-red-600 stroke-red-400" viewBox="0 0 24 24">
                        <path d="M12 2C8.69 2 6 4.69 6 8C6 11.31 8.69 14 12 14C15.31 14 18 11.31 18 8C18 4.69 15.31 2 12 2M8.5 7.5C8.5 6.67 9.17 6 10 6C10.83 6 11.5 6.67 11.5 7.5C11.5 8.33 10.83 9 10 9C9.17 9 8.5 8.33 8.5 7.5M14 6C14.83 6 15.5 6.67 15.5 7.5C15.5 8.33 14.83 9 14 9C13.17 9 12.5 8.33 12.5 7.5C12.5 6.67 13.17 6 14 6M10 16V18H14V16H10Z" />
                    </svg>
                    {t('ui.boss')}
                </div>
                <div className="flex items-center gap-2">
                    <svg className="w-6 h-6 stroke-yellow-500 stroke-2 fill-none" viewBox="0 0 24 24">
                        <rect x="4" y="4" width="16" height="16" rx="2" />
                        <path d="M4 10h16 M10 20V10 M14 20V10" />
                    </svg>
                    {t('ui.chest')}
                </div>
                <div className="flex items-center gap-2">
                    <svg className="w-6 h-6 stroke-blue-400 stroke-2 fill-none" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="8" />
                        <path d="M12 8v8 M8 12h8" />
                    </svg>
                    {t('ui.poi')}
                </div>
                <div className="flex items-center gap-2">
                    <svg className="w-6 h-6 stroke-pink-500 stroke-2 fill-none" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="5" />
                        <path d="M16 16l4 4" />
                    </svg>
                    {t('ui.clue')}
                </div>
            </div>
            <div className="flex gap-4 justify-center">
                <TacticalCard color={0x3b82f6} className="px-3 py-1 flex items-center gap-2">
                    <span className="text-[10px] text-blue-400 font-bold uppercase">{t('ui.player')}</span>
                    <LivePlayerCoordinates />
                </TacticalCard>
                {!isMobileDevice && (
                    <div ref={mouseCoordsCardRef} style={{ display: 'none' }} className="flex items-center">
                        <TacticalCard color={0x94a3b8} className="px-3 py-1 flex items-center gap-2">
                            <span className="text-[10px] text-gray-400 font-bold uppercase">{t('ui.coordinates')}</span>
                            <span ref={mouseCoordsTextRef} className="text-sm font-mono text-white font-bold">
                                0, 0
                            </span>
                        </TacticalCard>
                    </div>
                )}
            </div>
        </div>
    ), [isMobileDevice]);

    return (
        <ScreenModalLayout
            title={t('ui.map')}
            subtitle={sectorName.toUpperCase()}
            isMobileDevice={isMobileDevice}
            onClose={onClose}
            onCancel={onClose}
            cancelLabel={t('ui.close')}
            fullHeight={true}
            contentClass="flex flex-col p-0 !px-0 !pb-0 overflow-hidden"
            footer={footerNode}
        >
            <style>{`
                .radar-crt-overlay {
                    position: absolute;
                    inset: 0;
                    pointer-events: none;
                    background: 
                        linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%),
                        radial-gradient(circle, rgba(0,0,0,0) 55%, rgba(0,0,0,0.85) 100%);
                    background-size: 100% 4px, 100% 100%;
                    z-index: 40;
                    opacity: 0.85;
                }
                
                @keyframes sonar-sweep {
                    from {
                        transform: rotate(0deg);
                    }
                    to {
                        transform: rotate(360deg);
                    }
                }
                
                .radar-sonar-sweep {
                    position: absolute;
                    width: 200%;
                    height: 200%;
                    top: -50%;
                    left: -50%;
                    pointer-events: none;
                    background: conic-gradient(
                        from 0deg,
                        rgba(59, 130, 246, 0.12) 0deg,
                        rgba(59, 130, 246, 0.04) 90deg,
                        transparent 180deg
                    );
                    animation: sonar-sweep 8s linear infinite;
                    transform-origin: center center;
                    z-index: 15;
                    mix-blend-mode: screen;
                }
            `}</style>
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
                        mapItemsCount={mapItemsCount}
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
