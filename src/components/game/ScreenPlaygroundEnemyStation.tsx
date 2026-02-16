import React, { useState } from 'react';
import { t } from '../../utils/i18n';
import GameModalLayout from './GameModalLayout';
import { EnemyManager } from '../../core/EnemyManager';
import { Engine } from '../../core/engine/Engine';
import * as THREE from 'three';

interface ScreenPlaygroundEnemyStationProps {
    onClose: () => void;
    playerPos: { x: number, z: number };
    onSpawnEnemies?: (enemies: any[]) => void;
}

export const ScreenPlaygroundEnemyStation: React.FC<ScreenPlaygroundEnemyStationProps> = ({ onClose, playerPos, onSpawnEnemies }) => {
    const [selectedType, setSelectedType] = useState('WALKER');
    const [count, setCount] = useState(1);
    const [spread, setSpread] = useState(5);
    const [biome, setBiome] = useState<'NEAR' | 'FOREST' | 'FARM' | 'VILLAGE'>('NEAR');

    const handleSpawn = () => {
        const scene = Engine.getInstance().scene;
        // Determine spawn center
        let center = new THREE.Vector3(playerPos.x, 0, playerPos.z);
        if (biome === 'FOREST') center.set(30, 0, -30); // Approx forest
        if (biome === 'FARM') center.set(-30, 0, -30); // Approx farm
        if (biome === 'VILLAGE') center.set(0, 0, -100); // Village

        // Offset center slightly so they don't spawn ON player if 'NEAR'
        if (biome === 'NEAR') {
            center.z -= 10;
        }

        EnemyManager.spawnHorde(scene, center, count, false, 0);
        // Note: EnemyManager.spawnHorde currently hardcodes logic or uses available enemies. 
        // Ideally we'd pass the type into spawnHorde or loop spawn() manually.
        // For precise control let's loop manual spawn:
        const spawned: any[] = [];
        for (let i = 0; i < count; i++) {
            const offset = new THREE.Vector3(
                (Math.random() - 0.5) * spread,
                0,
                (Math.random() - 0.5) * spread
            );
            const spawnPos = center.clone().add(offset);
            const newEnemy = EnemyManager.spawn(scene, new THREE.Vector3(playerPos.x, 0, playerPos.z), selectedType, spawnPos);
            if (newEnemy) spawned.push(newEnemy);
        }

        if (onSpawnEnemies) onSpawnEnemies(spawned);
        onClose();
    };

    const footer = (
        <div className="flex w-full gap-4">
            <button
                onClick={() => { onClose(); }}
                className="flex-1 px-4 py-3 border-2 border-gray-600 text-gray-400 font-bold uppercase hover:text-white hover:border-white transition-colors"
            >
                {t('ui.cancel')}
            </button>
            <button
                onClick={handleSpawn}
                className="flex-1 px-4 py-3 border-2 font-bold uppercase transition-colors border-red-500 bg-red-900/50 text-white hover:bg-red-800"
            >
                {t('ui.spawn')}
            </button>
        </div>
    );

    return (
        <GameModalLayout
            title={t('ui.enemy_spawner')}
            titleColorClass="text-red-500"
            onClose={onClose}
            footer={footer}
            transparent={true}
        >
            <div className="flex flex-col gap-6 p-4">
                {/* Type Selection */}
                <div className="flex flex-col gap-2">
                    <label className="text-gray-400 uppercase text-sm">{t('ui.enemy_type')}</label>
                    <div className="flex gap-2 flex-wrap">
                        {['WALKER', 'RUNNER', 'TANK', 'BOMBER'].map(type => (
                            <button
                                key={type}
                                onClick={() => setSelectedType(type)}
                                className={`px-4 py-2 border ${selectedType === type ? 'bg-red-900 border-red-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Count */}
                <div className="flex flex-col gap-2">
                    <label className="text-gray-400 uppercase text-sm">{t('ui.count')}: {count}</label>
                    <input
                        type="range"
                        min="1"
                        max="20"
                        value={count}
                        onChange={(e) => setCount(parseInt(e.target.value))}
                        className="w-full accent-red-600"
                    />
                </div>

                {/* Biome/Video */}
                <div className="flex flex-col gap-2">
                    <label className="text-gray-400 uppercase text-sm">{t('ui.spawn_location')}</label>
                    <div className="grid grid-cols-2 gap-2">
                        {['NEAR', 'FOREST', 'FARM', 'VILLAGE'].map(loc => (
                            <button
                                key={loc}
                                onClick={() => setBiome(loc as any)}
                                className={`px-4 py-2 border ${biome === loc ? 'bg-red-900 border-red-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
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


