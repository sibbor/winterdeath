import React, { useState, useCallback } from 'react';
import { t } from '../../utils/i18n';
import ScreenModalLayout from '../ui/ScreenModalLayout';
import { EnemyManager } from '../../core/EnemyManager';
import { WinterEngine } from '../../core/engine/WinterEngine';
import * as THREE from 'three';
import { soundManager } from '../../utils/SoundManager';
import { HudStore } from '../../store/HudStore';
import { EnemyType } from '../../types/enemy';

interface ScreenPlaygroundEnemyStationProps {
    onClose: () => void;
    onSpawnEnemies?: (enemies: any[]) => void;
    isMobileDevice?: boolean;
}

const ENEMY_TYPES = [EnemyType.WALKER, EnemyType.RUNNER, EnemyType.TANK, EnemyType.BOMBER];
const SPAWN_LOCATIONS = ['NEAR', 'FOREST', 'FARM', 'VILLAGE'];

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
const _centerPos = new THREE.Vector3();
const _spawnPos = new THREE.Vector3();
const _playerPosRef = new THREE.Vector3();

export const ScreenPlaygroundEnemyStation: React.FC<ScreenPlaygroundEnemyStationProps> = ({ onClose, onSpawnEnemies, isMobileDevice }) => {
    const [selectedType, setSelectedType] = useState<EnemyType | string>(EnemyType.WALKER);
    const [countVal, setCountVal] = useState(1);
    const [spread, setSpread] = useState(5);
    const [biome, setBiome] = useState<'NEAR' | 'FOREST' | 'FARM' | 'VILLAGE'>('NEAR');

    const handleSpawn = useCallback(() => {
        const hud = HudStore.getState();
        const playerPos = hud.playerPos || { x: 0, z: 0 };
        const scene = WinterEngine.getInstance().scene;

        _playerPosRef.set(playerPos.x, 0, playerPos.z);
        _centerPos.copy(_playerPosRef);

        if (biome === 'FOREST') _centerPos.set(30, 0, -30);
        if (biome === 'FARM') _centerPos.set(-30, 0, -30);
        if (biome === 'VILLAGE') _centerPos.set(0, 0, -100);

        if (biome === 'NEAR') {
            _centerPos.z -= 20;
        }

        const spawned: any[] = [];
        for (let i = 0; i < countVal; i++) {
            _spawnPos.set(
                _centerPos.x + (Math.random() - 0.5) * spread,
                0,
                _centerPos.z + (Math.random() - 0.5) * spread
            );

            const newEnemy = EnemyManager.spawn(scene, _playerPosRef, selectedType as EnemyType, _spawnPos);
            if (newEnemy) spawned.push(newEnemy);
        }

        if (onSpawnEnemies) onSpawnEnemies(spawned);
        onClose();
    }, [biome, countVal, spread, selectedType, onSpawnEnemies, onClose]);

    const handleCountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setCountVal(parseInt(e.target.value));
    }, []);

    const handleSpreadChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setSpread(parseInt(e.target.value));
    }, []);

    return (
        <ScreenModalLayout
            title={t('ui.enemy_spawner')}
            isMobileDevice={isMobileDevice}
            onClose={onClose}
            onConfirm={handleSpawn}
            confirmLabel={t('ui.spawn')}
            isSmall={true}
            titleColorClass="text-red-600"
            tabs={ENEMY_TYPES}
            activeTab={selectedType}
            onTabChange={(type) => { soundManager.playUiClick(); setSelectedType(type); }}
            tabOrientation="horizontal"
        >
            <div className="flex flex-col gap-8 p-2 max-w-xl mx-auto h-full overflow-y-auto pr-4 custom-scrollbar">
                {/* Type Selection */}
                <div className="flex flex-col gap-3">
                    <label className="text-zinc-500 uppercase text-xs font-bold tracking-widest">{t('ui.enemy_type')}</label>
                    <div className="grid grid-cols-2 gap-2">
                        {ENEMY_TYPES.map(type => (
                            <button
                                key={type}
                                onClick={() => { soundManager.playUiClick(); setSelectedType(type); }}
                                className={`px-4 py-3 border-2 transition-all duration-200 uppercase font-black tracking-tighter text-sm ${selectedType === type ? 'bg-red-600 border-red-600 text-black' : 'bg-black border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Count & Spread */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex flex-col gap-3">
                        <label className="text-zinc-500 uppercase text-xs font-bold tracking-widest">{t('ui.count')}: <span className="text-white font-mono">{countVal}</span></label>
                        <input
                            type="range" min="1" max="100" value={countVal} onChange={handleCountChange}
                            className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-600"
                        />
                    </div>
                    <div className="flex flex-col gap-3">
                        <label className="text-zinc-500 uppercase text-xs font-bold tracking-widest">{t('ui.spread')}: <span className="text-white font-mono">{spread}m</span></label>
                        <input
                            type="range" min="1" max="50" value={spread} onChange={handleSpreadChange}
                            className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-600"
                        />
                    </div>
                </div>

                {/* Biome/Location */}
                <div className="flex flex-col gap-3">
                    <label className="text-zinc-500 uppercase text-xs font-bold tracking-widest">{t('ui.spawn_location')}</label>
                    <div className="grid grid-cols-2 gap-2 pb-4">
                        {SPAWN_LOCATIONS.map(loc => (
                            <button
                                key={loc}
                                onClick={() => { soundManager.playUiClick(); setBiome(loc as any); }}
                                className={`px-4 py-3 border-2 transition-all duration-200 uppercase font-black tracking-tighter text-sm ${biome === loc ? 'bg-zinc-100 border-zinc-100 text-black' : 'bg-black border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}
                            >
                                {loc}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </ScreenModalLayout>
    );
};