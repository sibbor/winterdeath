import React, { useState, useEffect } from 'react';
import { t } from '../../utils/i18n';
import GameModalLayout from './GameModalLayout';
import { Engine } from '../../core/engine/Engine';
import { EnvironmentOverride, WeatherType } from '../../types';

interface ScreenPlaygroundEnvironmentStationProps {
    onClose: () => void;
    currentWeather: WeatherType;
    onWeatherChange: (w: WeatherType) => void;
    currentOverride?: EnvironmentOverride;
    onOverrideChange?: (overrides: EnvironmentOverride) => void;
}

export const ScreenPlaygroundEnvironmentStation: React.FC<ScreenPlaygroundEnvironmentStationProps> = ({ onClose, currentWeather, onWeatherChange, currentOverride, onOverrideChange }) => {
    // Local state for UI inputs, initialized from props or defaults
    const [fogColor, setFogColor] = useState(currentOverride?.fogColor ? '#' + currentOverride.fogColor.toString(16).padStart(6, '0') : '#050510');
    const [fogDensity, setFogDensity] = useState(currentOverride?.fogDensity ?? 0.01);

    // Sun
    const [sunColor, setSunColor] = useState(currentOverride?.sunColor ? '#' + currentOverride.sunColor.toString(16).padStart(6, '0') : '#ffffff');
    const [sunIntensity, setSunIntensity] = useState(currentOverride?.sunIntensity ?? 1.0);
    const [sunX, setSunX] = useState(currentOverride?.sunPosition?.x ?? 50);
    const [sunY, setSunY] = useState(currentOverride?.sunPosition?.y ?? 100);
    const [sunZ, setSunZ] = useState(currentOverride?.sunPosition?.z ?? 50);

    // Moon
    const [moonColor, setMoonColor] = useState(currentOverride?.moonColor ? '#' + currentOverride.moonColor.toString(16).padStart(6, '0') : '#4444ff');
    const [moonIntensity, setMoonIntensity] = useState(currentOverride?.moonIntensity ?? 0.5);

    const [windStrength, setWindStrength] = useState(1.0);
    const [windDirection, setWindDirection] = useState(currentOverride?.windDirection ?? 0);

    const handleApply = () => {
        // Construct override object
        const overrides: EnvironmentOverride = {
            fogColor: parseInt(fogColor.replace('#', ''), 16),
            fogDensity: fogDensity,
            sunColor: parseInt(sunColor.replace('#', ''), 16),
            sunIntensity: sunIntensity,
            sunPosition: { x: sunX, y: sunY, z: sunZ },
            moonColor: parseInt(moonColor.replace('#', ''), 16),
            moonIntensity: moonIntensity,
            windStrength: windStrength,
            windDirection: windDirection
        };

        if (onOverrideChange) {
            onOverrideChange(overrides);
        }

        const engine = Engine.getInstance();
        // apply wind logic here if needed separate from overrides
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
                onClick={handleApply}
                className="flex-1 px-4 py-3 border-2 font-bold uppercase transition-colors border-cyan-500 bg-cyan-900/50 text-white hover:bg-cyan-800"
            >
                {t('ui.apply')}
            </button>
        </div>
    );

    return (
        <GameModalLayout
            title={t('ui.environment_control')}
            titleColorClass="text-cyan-500"
            onClose={onClose}
            footer={footer}
            transparent={true}
        >
            <div className="flex flex-col gap-6 p-4 max-h-[60vh] overflow-y-auto">
                {/* Weather */}
                <div className="flex flex-col gap-2">
                    <label className="text-gray-400 uppercase text-sm">{t('ui.weather')}</label>
                    <div className="flex gap-2 flex-wrap">
                        {['none', 'rain', 'snow', 'ash', 'embers'].map((w) => (
                            <button
                                key={w}
                                onClick={() => onWeatherChange(w as WeatherType)}
                                className={`px-4 py-2 border ${currentWeather === w ? 'bg-cyan-900 border-cyan-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
                            >
                                {w}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Wind Strength */}
                <div className="flex flex-col gap-2">
                    <label className="text-gray-400 uppercase text-sm">{t('ui.wind_strength')}: {windStrength.toFixed(1)}</label>
                    <input
                        type="range"
                        min="0"
                        max="5"
                        step="0.1"
                        value={windStrength}
                        onChange={(e) => setWindStrength(parseFloat(e.target.value))}
                        className="w-full accent-cyan-500"
                    />
                </div>

                {/* Wind Direction */}
                <div className="flex flex-col gap-2">
                    <label className="text-gray-400 uppercase text-sm">{t('ui.wind_direction')}: {windDirection.toFixed(0)}°</label>
                    <input
                        type="range"
                        min="0"
                        max="360"
                        step="1"
                        value={windDirection}
                        onChange={(e) => setWindDirection(parseFloat(e.target.value))}
                        className="w-full accent-cyan-500"
                    />
                </div>

                <hr className="border-gray-700" />

                {/* FOG CONTROLS */}
                <div className="flex flex-col gap-2">
                    <label className="text-cyan-400 uppercase text-sm font-bold">Fog Settings</label>
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="text-gray-500 text-xs uppercase">Color</label>
                            <input type="color" value={fogColor} onChange={(e) => setFogColor(e.target.value)} className="w-full h-8 cursor-pointer" />
                        </div>
                        <div className="flex-[2]">
                            <label className="text-gray-500 text-xs uppercase">Density: {fogDensity.toFixed(4)}</label>
                            <input type="range" min="0" max="0.1" step="0.001" value={fogDensity} onChange={(e) => setFogDensity(parseFloat(e.target.value))} className="w-full accent-cyan-500" />
                        </div>
                    </div>
                </div>

                <hr className="border-gray-700" />

                {/* SUN CONTROLS */}
                <div className="flex flex-col gap-2">
                    <label className="text-yellow-400 uppercase text-sm font-bold">Sun Settings</label>
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="text-gray-500 text-xs uppercase">Color</label>
                            <input type="color" value={sunColor} onChange={(e) => setSunColor(e.target.value)} className="w-full h-8 cursor-pointer" />
                        </div>
                        <div className="flex-[2]">
                            <label className="text-gray-500 text-xs uppercase">Intensity: {sunIntensity.toFixed(1)}</label>
                            <input type="range" min="0" max="5" step="0.1" value={sunIntensity} onChange={(e) => setSunIntensity(parseFloat(e.target.value))} className="w-full accent-yellow-500" />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <div className="flex-1"><label className="text-gray-500 text-xs">Pos X: {sunX}</label><input type="range" min="-500" max="500" value={sunX} onChange={e => setSunX(Number(e.target.value))} className="w-full" /></div>
                        <div className="flex-1"><label className="text-gray-500 text-xs">Pos Y: {sunY}</label><input type="range" min="0" max="500" value={sunY} onChange={e => setSunY(Number(e.target.value))} className="w-full" /></div>
                        <div className="flex-1"><label className="text-gray-500 text-xs">Pos Z: {sunZ}</label><input type="range" min="-500" max="500" value={sunZ} onChange={e => setSunZ(Number(e.target.value))} className="w-full" /></div>
                    </div>
                </div>

                <hr className="border-gray-700" />

                {/* MOON CONTROLS */}
                <div className="flex flex-col gap-2">
                    <label className="text-blue-400 uppercase text-sm font-bold">Moon Settings</label>
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="text-gray-500 text-xs uppercase">Color</label>
                            <input type="color" value={moonColor} onChange={(e) => setMoonColor(e.target.value)} className="w-full h-8 cursor-pointer" />
                        </div>
                        <div className="flex-[2]">
                            <label className="text-gray-500 text-xs uppercase">Intensity: {moonIntensity.toFixed(1)}</label>
                            <input type="range" min="0" max="2" step="0.1" value={moonIntensity} onChange={(e) => setMoonIntensity(parseFloat(e.target.value))} className="w-full accent-blue-500" />
                        </div>
                    </div>
                </div>
            </div>
        </GameModalLayout>
    );
};
