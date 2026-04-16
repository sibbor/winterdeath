import * as THREE from 'three';
import React, { useState, useCallback, useRef } from 'react';
import { t } from '../../../../utils/i18n';
import ScreenModalLayout, { TacticalButton } from '../../layout/ScreenModalLayout';
import { EnemyManager } from '../../../../entities/enemies/EnemyManager';
import { WinterEngine } from '../../../../core/engine/WinterEngine';
import { UiSounds } from '../../../../utils/audio/AudioLib';
import { HudStore } from '../../../../store/HudStore';
import { EnemyType } from '../../../../entities/enemies/EnemyTypes';
import { DataResolver } from '../../../../utils/ui/DataResolver';
import { SoundID } from '../../../../utils/audio/AudioTypes';
import { audioEngine } from '../../../../utils/audio/AudioEngine';

interface ScreenPlaygroundEnemyStationProps {
    onClose: () => void;
    onSpawnEnemies?: (enemies: any[]) => void;
    isMobileDevice?: boolean;
}

const ZOMBIE_TYPES = [EnemyType.WALKER, EnemyType.RUNNER, EnemyType.TANK, EnemyType.BOMBER];
const SPAWN_LOCATIONS = ['NEAR', 'FOREST', 'FARM', 'VILLAGE'];
const BOSS_IDS = [0, 1, 2, 3];

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _centerPos = new THREE.Vector3();
const _spawnPos = new THREE.Vector3();
const _playerPosRef = new THREE.Vector3();

export const ScreenPlaygroundEnemyStation: React.FC<ScreenPlaygroundEnemyStationProps> = ({ onClose, onSpawnEnemies, isMobileDevice }) => {
    const [counts, setCounts] = useState<Record<number, number>>({
        [EnemyType.WALKER]: 1,
        [EnemyType.RUNNER]: 0,
        [EnemyType.TANK]: 0,
        [EnemyType.BOMBER]: 0,
    });
    const [selectedBoss, setSelectedBoss] = useState<number | null>(null);
    const [spread, setSpread] = useState(10);
    const [biome, setBiome] = useState<'NEAR' | 'FOREST' | 'FARM' | 'VILLAGE'>('NEAR');
    const spawnedRef = useRef<any[]>([]);

    const handleSpawnBoss = (id: number, collection?: any[]) => {
        const scene = WinterEngine.getInstance().scene;
        const hud = HudStore.getState();
        const playerPos = hud.playerPos || { x: 0, z: 0 };
        _playerPosRef.set(playerPos.x, 0, playerPos.z);
        _centerPos.copy(_playerPosRef);

        if (biome === 'FOREST') _centerPos.set(30, 0, -30);
        if (biome === 'FARM') _centerPos.set(-30, 0, -30);
        if (biome === 'VILLAGE') _centerPos.set(0, 0, -100);
        if (biome === 'NEAR') _centerPos.z -= 20;

        const bossData = DataResolver.getBosses()[id];
        if (bossData) {
            _spawnPos.set(_centerPos.x, 0, _centerPos.z - 5);
            const boss = EnemyManager.spawnBoss(scene, _spawnPos, bossData);
            if (boss) {
                if (collection) collection.push(boss);
                else spawnedRef.current.push(boss);
            }
        }
    };

    const handleSpawn = useCallback(() => {
        const hud = HudStore.getState();
        const playerPos = hud.playerPos || { x: 0, z: 0 };
        const scene = WinterEngine.getInstance().scene;

        _playerPosRef.set(playerPos.x, 0, playerPos.z);
        _centerPos.copy(_playerPosRef);

        if (biome === 'FOREST') _centerPos.set(30, 0, -30);
        if (biome === 'FARM') _centerPos.set(-30, 0, -30);
        if (biome === 'VILLAGE') _centerPos.set(0, 0, -100);
        if (biome === 'NEAR') _centerPos.z -= 20;

        const spawned: any[] = [];

        // 1. Spawn Standard Horde
        let totalCount = 0;
        ZOMBIE_TYPES.forEach(type => {
            const count = counts[type] || 0;
            totalCount += count;

            for (let i = 0; i < count; i++) {
                _spawnPos.set(
                    _centerPos.x + (Math.random() - 0.5) * spread,
                    0,
                    _centerPos.z + (Math.random() - 0.5) * spread
                );
                const newEnemy = EnemyManager.spawn(scene, _playerPosRef, type, _spawnPos);
                if (newEnemy) spawned.push(newEnemy);
            }
        });

        // 2. Spawn Selected Boss (If any)
        if (selectedBoss !== null) {
            handleSpawnBoss(selectedBoss, spawned);
        }

        if (totalCount > 10 || selectedBoss !== null) {
            audioEngine.playSound(SoundID.ZOMBIE_GROWL_TANK);
        }

        if (onSpawnEnemies) onSpawnEnemies(spawned);
        onClose();
    }, [biome, counts, spread, selectedBoss, onSpawnEnemies, onClose]);

    const updateCount = (type: number, val: number) => {
        setCounts(prev => ({ ...prev, [type]: val }));
    };

    const handleRandomize = () => {
        UiSounds.playClick();
        const newCounts: Record<number, number> = {};
        ZOMBIE_TYPES.forEach(type => {
            newCounts[type] = Math.floor(Math.random() * 60); // Random up to 60 for stress test
        });
        setCounts(newCounts);
    };

    const handleClear = () => {
        UiSounds.playClick();
        const newCounts: Record<number, number> = {};
        ZOMBIE_TYPES.forEach(type => { newCounts[type] = 0; });
        setCounts(newCounts);
        setSelectedBoss(null);
    };

    return (
        <ScreenModalLayout
            title={t('ui.enemy_spawner')}
            isMobileDevice={isMobileDevice}
            onClose={onClose}
            onConfirm={handleSpawn}
            confirmLabel={t('ui.spawn')}
            isSmall={false}
            titleColorClass="text-red-600"
        >
            <div className="flex flex-col gap-6 p-4 max-w-2xl mx-auto h-full overflow-y-auto pr-6 custom-scrollbar">

                {/* STRESS TEST CONTROLS */}
                <div className="flex items-center justify-between bg-zinc-900/50 p-4 border border-red-900/30 rounded">
                    <div className="flex flex-col">
                        <span className="text-red-500 text-[13px] font-black uppercase tracking-[0.2em]">{t('ui.stress_test')}</span>
                        <span className="text-zinc-400 text-[11px] uppercase">{t('ui.mass_spawning')}</span>
                    </div>
                    <div className="flex gap-2">
                        {BOSS_IDS.map(id => (
                            <button key={id} onClick={() => handleSpawnBoss(Number(id))} className="p-3 bg-zinc-800 border border-zinc-700 text-white rounded hover:bg-zinc-700 transition-colors uppercase font-mono text-xs">
                                {t(DataResolver.getBossName(Number(id)))}
                            </button>
                        ))}
                        <button
                            onClick={handleClear}
                            className="px-4 py-2 border border-zinc-700 hover:border-red-600 text-zinc-500 hover:text-red-500 text-[12px] font-bold uppercase transition-colors rounded"
                        >
                            {t('ui.clear_all')}
                        </button>
                    </div>
                </div>

                {/* SLIDERS SECTION */}
                <div className="space-y-6">
                    <label className="text-zinc-500 uppercase text-[12px] font-black tracking-widest block border-b border-zinc-800 pb-2">{t('ui.horde_composition')}</label>
                    <div className="grid grid-cols-1 gap-5">
                        {ZOMBIE_TYPES.map(type => {
                            const val = counts[type] || 0;
                            const typeName = EnemyType[type];
                            return (
                                <div key={type} className="flex flex-col gap-2">
                                    <div className="flex justify-between items-end">
                                        <span className="text-zinc-200 text-sm font-bold uppercase tracking-tighter">{t(DataResolver.getZombieName(type))}</span>
                                        <span className={`text-[13px] font-mono ${val > 0 ? 'text-red-500' : 'text-zinc-600'}`}>{val}</span>
                                    </div>
                                    <input
                                        type="range" min="0" max="100" value={val}
                                        onChange={(e) => updateCount(type, parseInt(e.target.value))}
                                        className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-600"
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* BOSS SELECTION */}
                <div className="space-y-4">
                    <label className="text-zinc-500 uppercase text-[12px] font-black tracking-widest block border-b border-zinc-800 pb-2">{t('ui.boss_spawner')}</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {BOSS_IDS.map(id => (
                            <TacticalButton
                                key={id}
                                onClick={() => { UiSounds.playClick(); setSelectedBoss(selectedBoss === id ? null : id); }}
                                variant={selectedBoss === id ? 'primary' : 'secondary'}
                                className="px-2 py-3 text-[13px]"
                            >
                                {t(DataResolver.getBossName(id))}
                            </TacticalButton>
                        ))}
                    </div>
                </div>

                {/* GLOBAL SETTINGS */}
                <div className="space-y-4">
                    <label className="text-zinc-500 uppercase text-[10px] font-black tracking-widest block border-b border-zinc-800 pb-2">{t('ui.spawn_parameters')}</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                            <span className="text-zinc-400 text-[12px] uppercase font-bold">{t('ui.spread')}</span>
                            <div className="flex items-center gap-3">
                                <input
                                    type="range" min="1" max="50" value={spread}
                                    onChange={(e) => setSpread(parseInt(e.target.value))}
                                    className="flex-1 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-200"
                                />
                                <span className="text-zinc-100 font-mono text-[13px] w-6">{spread}m</span>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <span className="text-zinc-400 text-[12px] uppercase font-bold">{t('ui.spawn_location')}</span>
                            <div className="flex flex-wrap gap-1">
                                {SPAWN_LOCATIONS.map(b => (
                                    <TacticalButton
                                        key={b}
                                        onClick={() => { UiSounds.playClick(); setBiome(b as any); }}
                                        variant={biome === b ? 'primary' : 'secondary'}
                                        className="px-3 py-2 text-[11px]"
                                    >
                                        {t(`location.${b.toLowerCase()}`)}
                                    </TacticalButton>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </ScreenModalLayout>
    );
};