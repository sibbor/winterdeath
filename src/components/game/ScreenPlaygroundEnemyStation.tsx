import React, { useState } from 'react';
import { t } from '../../utils/i18n';
import GameModalLayout from './GameModalLayout';
import { EnemyManager } from '../../core/EnemyManager';
import { WinterEngine } from '../../core/engine/WinterEngine';
import * as THREE from 'three';
import { soundManager } from '../../utils/SoundManager';

interface ScreenPlaygroundEnemyStationProps {
    onClose: () => void;
    playerPos: { x: number, z: number };
    onSpawnEnemies?: (enemies: any[]) => void;
    isMobileDevice?: boolean;
}

export const ScreenPlaygroundEnemyStation: React.FC<ScreenPlaygroundEnemyStationProps> = ({ onClose, playerPos, onSpawnEnemies, isMobileDevice }) => {
    const [selectedType, setSelectedType] = useState('WALKER');
    const [countVal, setCountVal] = useState(1);
    const [spread, setSpread] = useState(5);
    const [biome, setBiome] = useState<'NEAR' | 'FOREST' | 'FARM' | 'VILLAGE'>('NEAR');

    const handleSpawn = () => {
        const scene = WinterEngine.getInstance().scene;
        // Determine spawn center
        let center = new THREE.Vector3(playerPos.x, 0, playerPos.z);
        if (biome === 'FOREST') center.set(30, 0, -30);
        if (biome === 'FARM') center.set(-30, 0, -30);
        if (biome === 'VILLAGE') center.set(0, 0, -100);

        // Offset so they don't spawn on top of player
        if (biome === 'NEAR') {
            center.z -= 20;
        }

        const spawned: any[] = [];
        for (let i = 0; i < countVal; i++) {
            const spawnPos = new THREE.Vector3(
                center.x + (Math.random() - 0.5) * spread,
                0,
                center.z + (Math.random() - 0.5) * spread
            );
            const newEnemy = EnemyManager.spawn(scene, new THREE.Vector3(playerPos.x, 0, playerPos.z), selectedType, spawnPos);
            if (newEnemy) spawned.push(newEnemy);
        }

        if (onSpawnEnemies) onSpawnEnemies(spawned);
        onClose();
    };


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
                        {['WALKER', 'RUNNER', 'TANK', 'BOMBER'].map(type => (
                            <button
                                key={type}
                                onClick={() => { soundManager.playUiClick(); setSelectedType(type); }}
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
                        onChange={(e) => setCountVal(parseInt(e.target.value))}
                        className="w-full h-4 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-600 my-2"
                    />
                </div>

                {/* Biome/Location */}
                <div className="flex flex-col gap-2">
                    <label className="text-gray-400 uppercase text-sm">{t('ui.spawn_location')}</label>
                    <div className="grid grid-cols-2 gap-2 pb-2">
                        {['NEAR', 'FOREST', 'FARM', 'VILLAGE'].map(loc => (
                            <button
                                key={loc}
                                onClick={() => { soundManager.playUiClick(); setBiome(loc as any); }}
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
