import React, { useState, useCallback } from 'react';
import { t } from '../../utils/i18n';
import GameModalLayout from './GameModalLayout';
import { EnemyManager } from '../../core/EnemyManager';
import { WinterEngine } from '../../core/engine/WinterEngine';
import * as THREE from 'three';
import { soundManager } from '../../utils/SoundManager';
import { HudStore } from '../../core/systems/HudStore';

interface ScreenPlaygroundEnemyStationProps {
    onClose: () => void;
    onSpawnEnemies?: (enemies: any[]) => void;
    isMobileDevice?: boolean;
}

const ENEMY_TYPES = ['WALKER', 'RUNNER', 'TANK', 'BOMBER'];
const SPAWN_LOCATIONS = ['NEAR', 'FOREST', 'FARM', 'VILLAGE'];

// --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
// Used during spawning to prevent creating 100+ Vector3 objects
const _centerPos = new THREE.Vector3();
const _spawnPos = new THREE.Vector3();
const _playerPosRef = new THREE.Vector3();

export const ScreenPlaygroundEnemyStation: React.FC<ScreenPlaygroundEnemyStationProps> = ({ onClose, onSpawnEnemies, isMobileDevice }) => {
    const [selectedType, setSelectedType] = useState('WALKER');
    const [countVal, setCountVal] = useState(1);
    const [spread, setSpread] = useState(5);
    const [biome, setBiome] = useState<'NEAR' | 'FOREST' | 'FARM' | 'VILLAGE'>('NEAR');

    const handleSpawn = useCallback(() => {
        const hud = HudStore.getData();
        const playerPos = hud.playerPos || { x: 0, z: 0 };
        const scene = WinterEngine.getInstance().scene;

        // Use pre-allocated vectors to avoid GC hit when spawning multiples
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

            const newEnemy = EnemyManager.spawn(scene, _playerPosRef, selectedType, _spawnPos);
            if (newEnemy) spawned.push(newEnemy);
        }

        if (onSpawnEnemies) onSpawnEnemies(spawned);
        onClose();
    }, [biome, countVal, spread, selectedType, onSpawnEnemies, onClose]);

    // Zero-GC Input Handlers
    const handleTypeClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        soundManager.playUiClick();
        const type = e.currentTarget.dataset.type;
        if (type) setSelectedType(type);
    }, []);

    const handleLocationClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        soundManager.playUiClick();
        const loc = e.currentTarget.dataset.loc;
        if (loc) setBiome(loc as any);
    }, []);

    const handleCountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setCountVal(parseInt(e.target.value));
    }, []);

    return (
        <GameModalLayout
            title={t('ui.enemy_spawner')}
            onClose={onClose}
            onCancel={onClose}
            onConfirm={handleSpawn}
            confirmLabel={t('ui.spawn')}
            transparent={true}
            showCloseButton={false}
        >
            <div className="flex flex-col gap-6 p-4">
                {/* Type Selection */}
                <div className="flex flex-col gap-2">
                    <label className="text-gray-400 uppercase text-sm">{t('ui.enemy_type')}</label>
                    <div className="flex gap-2 flex-wrap pb-2">
                        {ENEMY_TYPES.map(type => (
                            <button
                                key={type}
                                data-type={type}
                                onClick={handleTypeClick}
                                className={`px-4 py-2 border-2 border-zinc-700 transition-all duration-200 hover:scale-105 active:scale-95 mx-2 ${selectedType === type ? 'bg-zinc-800 text-black animate-tab-pulsate' : 'bg-black text-zinc-400 hover:border-gray-500'}`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Count */}
                <div className="flex flex-col gap-2">
                    <label className="text-gray-400 uppercase text-sm">{t('ui.count')}: {countVal}</label>
                    <input
                        type="range"
                        min="1"
                        max="100"
                        value={countVal}
                        onChange={handleCountChange}
                        className="w-full h-4 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-600 my-2"
                    />
                </div>

                {/* Biome/Location */}
                <div className="flex flex-col gap-2">
                    <label className="text-gray-400 uppercase text-sm">{t('ui.spawn_location')}</label>
                    <div className="grid grid-cols-2 gap-2 pb-2">
                        {SPAWN_LOCATIONS.map(loc => (
                            <button
                                key={loc}
                                data-loc={loc}
                                onClick={handleLocationClick}
                                className={`px-4 py-2 border-2 border-zinc-700 transition-all duration-200 hover:scale-105 active:scale-95 mx-2 ${biome === loc ? 'bg-zinc-800 text-black animate-tab-pulsate' : 'bg-black text-zinc-400 hover:border-gray-500'}`}
                            >
                                {loc}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </GameModalLayout>
    );
};