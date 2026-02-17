import React, { useState, useEffect } from 'react';
import { t } from '../../utils/i18n';
import GameModalLayout from './GameModalLayout';
import { Engine } from '../../core/engine/Engine';
import { EnvironmentOverride, WeatherType } from '../../types';
import { Sector6 } from '../../content/sectors/Sector6';

interface ScreenPlaygroundEnvironmentStationProps {
    onClose: () => void;
    currentWeather: WeatherType;
    onWeatherChange: (w: WeatherType) => void;
    currentOverride?: EnvironmentOverride;
    onOverrideChange?: (overrides: EnvironmentOverride) => void;
}

export const ScreenPlaygroundEnvironmentStation: React.FC<ScreenPlaygroundEnvironmentStationProps> = ({ onClose, currentWeather, onWeatherChange, currentOverride, onOverrideChange }) => {
    // Local state for UI inputs, initialized from props or defaults
    const [bgColor, setBgColor] = useState(currentOverride?.bgColor ? '#' + currentOverride.bgColor.toString(16).padStart(6, '0') : '#000000');
    const [fogColor, setFogColor] = useState(currentOverride?.fogColor ? '#' + currentOverride.fogColor.toString(16).padStart(6, '0') : '#050510');
    const [fogDensity, setFogDensity] = useState(currentOverride?.fogDensity ?? 0.01);
    const [ambientIntensity, setAmbientIntensity] = useState(currentOverride?.ambientIntensity ?? 0.4);
    const [groundColor, setGroundColor] = useState(currentOverride?.groundColor ? '#' + currentOverride.groundColor.toString(16).padStart(6, '0') : '#111111');
    const [fov, setFov] = useState(currentOverride?.fov ?? 50);

    // SkyLight
    const [skyLightVisible, setSkyLightVisible] = useState(currentOverride?.skyLightVisible ?? true);
    const [skyLightColor, setSkyLightColor] = useState(currentOverride?.skyLightColor ? '#' + currentOverride.skyLightColor.toString(16).padStart(6, '0') : '#4444ff');
    const [skyLightIntensity, setSkyLightIntensity] = useState(currentOverride?.skyLightIntensity ?? 0.5);
    const [skyLightX, setSkyLightX] = useState(currentOverride?.skyLightPosition?.x ?? 80);
    const [skyLightY, setSkyLightY] = useState(currentOverride?.skyLightPosition?.y ?? 50);
    const [skyLightZ, setSkyLightZ] = useState(currentOverride?.skyLightPosition?.z ?? 50);

    // Weather Density
    const [weatherDensity, setWeatherDensity] = useState(currentOverride?.weatherDensity ?? 0.5);

    // Wind
    const [windStrength, setWindStrength] = useState(currentOverride?.windStrength ?? 1.0);
    const [windDirection, setWindDirection] = useState(currentOverride?.windDirection ?? 0);
    const [windRandomized, setWindRandomized] = useState(currentOverride?.windRandomized ?? false);

    const handleApply = () => {
        const overrides: EnvironmentOverride = {
            bgColor: parseInt(bgColor.replace('#', ''), 16),
            fogColor: parseInt(fogColor.replace('#', ''), 16),
            fogDensity: fogDensity,
            ambientIntensity: ambientIntensity,
            groundColor: parseInt(groundColor.replace('#', ''), 16),
            fov: fov,
            skyLightVisible: skyLightVisible,
            skyLightPosition: { x: skyLightX, y: skyLightY, z: skyLightZ },
            skyLightColor: parseInt(skyLightColor.replace('#', ''), 16),
            skyLightIntensity: skyLightIntensity,
            weather: currentWeather,
            weatherDensity: weatherDensity,
            windStrength: windStrength,
            windDirection: windDirection,
            windRandomized: windRandomized
        };

        if (onOverrideChange) {
            onOverrideChange(overrides);
        }
        onClose();
    };

    const handleReset = () => {
        // Reset to Sector 6 defaults
        const def = Sector6.environment;
        setBgColor('#' + def.bgColor.toString(16).padStart(6, '0'));
        setFogColor(def.fogColor ? '#' + def.fogColor.toString(16).padStart(6, '0') : '#' + def.bgColor.toString(16).padStart(6, '0'));
        setFogDensity(def.fogDensity);
        setAmbientIntensity(def.ambientIntensity);
        setGroundColor('#' + def.groundColor.toString(16).padStart(6, '0'));
        setFov(def.fov);
        setSkyLightVisible(def.skyLight.visible);
        setSkyLightColor('#' + def.skyLight.color.toString(16).padStart(6, '0'));
        setSkyLightIntensity(def.skyLight.intensity);
        if (def.skyLight.position) {
            setSkyLightX(def.skyLight.position.x);
            setSkyLightY(def.skyLight.position.y);
            setSkyLightZ(def.skyLight.position.z);
        }
        onWeatherChange(def.weather);
        setWeatherDensity(def.weatherDensity ?? 0.5);
        setWindStrength(1.0);
        setWindDirection(0);
        setWindRandomized(false);
    };

    const footer = (
        <div className="flex w-full gap-4">
            <button
                onClick={handleReset}
                className="flex-1 px-4 py-3 border-2 border-red-900 bg-red-950/30 text-red-500 font-bold uppercase hover:bg-red-900/50 transition-colors"
            >
                {t('ui.reset')}
            </button>
            <button
                onClick={onClose}
                className="flex-1 px-4 py-3 border-2 border-gray-600 text-gray-400 font-bold uppercase hover:text-white hover:border-white transition-colors"
            >
                {t('ui.cancel')}
            </button>
            <button
                onClick={handleApply}
                className="flex-[2] px-4 py-3 border-2 font-bold uppercase transition-colors border-cyan-500 bg-cyan-900/50 text-white hover:bg-cyan-800"
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
            <div className="flex flex-col gap-6 p-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                {/* GLOBAL SETTINGS */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                        <label className="text-gray-400 uppercase text-xs">{t('ui.background_color')}</label>
                        <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-full h-8 cursor-pointer bg-black border border-gray-700" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-gray-400 uppercase text-xs">{t('ui.ground_color')}</label>
                        <input type="color" value={groundColor} onChange={(e) => setGroundColor(e.target.value)} className="w-full h-8 cursor-pointer bg-black border border-gray-700" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-gray-400 uppercase text-xs">{t('ui.fov')}: {fov}</label>
                        <input type="range" min="30" max="120" value={fov} onChange={(e) => setFov(Number(e.target.value))} className="w-full accent-cyan-500" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-gray-400 uppercase text-xs">{t('ui.ambient_intensity')}: {ambientIntensity.toFixed(1)}</label>
                        <input type="range" min="0" max="2" step="0.1" value={ambientIntensity} onChange={(e) => setAmbientIntensity(parseFloat(e.target.value))} className="w-full accent-cyan-500" />
                    </div>
                </div>

                <hr className="border-gray-800" />

                {/* Weather */}
                <div className="flex flex-col gap-2">
                    <label className="text-gray-400 uppercase text-sm">{t('ui.weather')}</label>
                    <div className="flex gap-2 flex-wrap">
                        {['none', 'rain', 'snow', 'ash', 'ember'].map((w) => (
                            <button
                                key={w}
                                onClick={() => onWeatherChange(w as WeatherType)}
                                className={`px-4 py-2 border text-xs uppercase ${currentWeather === w ? 'bg-cyan-900 border-cyan-500 text-white' : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}
                            >
                                {w}
                            </button>
                        ))}
                    </div>
                    <div className="mt-2">
                        <label className="text-gray-500 text-xs uppercase">{t('ui.weather_density')}: {weatherDensity.toFixed(2)}</label>
                        <input type="range" min="0" max="1" step="0.05" value={weatherDensity} onChange={(e) => setWeatherDensity(parseFloat(e.target.value))} className="w-full accent-cyan-500" />
                    </div>
                </div>

                <hr className="border-gray-800" />

                {/* Wind */}
                <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                        <label className="text-gray-400 uppercase text-sm">{t('ui.wind_strength')}</label>
                        <div className="flex items-center gap-2">
                            <label className="text-gray-500 text-xs uppercase">{t('ui.randomized_wind')}</label>
                            <input type="checkbox" checked={windRandomized} onChange={(e) => setWindRandomized(e.target.checked)} className="w-4 h-4 accent-cyan-500" />
                        </div>
                    </div>

                    {!windRandomized && (
                        <div className="grid grid-cols-1 gap-4">
                            <div className="flex flex-col gap-1">
                                <label className="text-gray-500 text-xs uppercase">{t('ui.strength')}: {windStrength.toFixed(1)}</label>
                                <input type="range" min="0" max="5" step="0.1" value={windStrength} onChange={(e) => setWindStrength(parseFloat(e.target.value))} className="w-full accent-cyan-500" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-gray-500 text-xs uppercase">{t('ui.wind_direction')}: {windDirection.toFixed(0)}°</label>
                                <input type="range" min="0" max="360" step="1" value={windDirection} onChange={(e) => setWindDirection(parseFloat(e.target.value))} className="w-full accent-cyan-500" />
                            </div>
                        </div>
                    )}
                </div>

                <hr className="border-gray-800" />

                {/* FOG CONTROLS */}
                <div className="flex flex-col gap-2">
                    <label className="text-cyan-400 uppercase text-xs font-bold tracking-widest">{t('ui.fog_settings')}</label>
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="text-gray-500 text-xs uppercase">Color</label>
                            <input type="color" value={fogColor} onChange={(e) => setFogColor(e.target.value)} className="w-full h-8 cursor-pointer bg-black border border-gray-700" />
                        </div>
                        <div className="flex-[2]">
                            <label className="text-gray-500 text-xs uppercase">Density: {fogDensity.toFixed(4)}</label>
                            <input type="range" min="0" max="0.1" step="0.001" value={fogDensity} onChange={(e) => setFogDensity(parseFloat(e.target.value))} className="w-full accent-cyan-500" />
                        </div>
                    </div>
                </div>

                <hr className="border-gray-800" />

                {/* SKY LIGHT CONTROLS */}
                <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                        <label className="text-yellow-400 uppercase text-xs font-bold tracking-widest">{t('ui.sky_light_settings')}</label>
                        <input type="checkbox" checked={skyLightVisible} onChange={(e) => setSkyLightVisible(e.target.checked)} className="w-4 h-4 accent-yellow-500" />
                    </div>

                    {skyLightVisible && (
                        <div className="flex flex-col gap-4">
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="text-gray-500 text-xs uppercase">Color</label>
                                    <input type="color" value={skyLightColor} onChange={(e) => setSkyLightColor(e.target.value)} className="w-full h-8 cursor-pointer bg-black border border-gray-700" />
                                </div>
                                <div className="flex-[2]">
                                    <label className="text-gray-500 text-xs uppercase">Intensity: {skyLightIntensity.toFixed(1)}</label>
                                    <input type="range" min="0" max="5" step="0.1" value={skyLightIntensity} onChange={(e) => setSkyLightIntensity(parseFloat(e.target.value))} className="w-full accent-yellow-500" />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="flex flex-col gap-1"><label className="text-gray-500 text-[10px] uppercase">X: {skyLightX}</label><input type="range" min="-500" max="500" value={skyLightX} onChange={e => setSkyLightX(Number(e.target.value))} className="w-full accent-yellow-500" /></div>
                                <div className="flex flex-col gap-1"><label className="text-gray-500 text-[10px] uppercase">Y: {skyLightY}</label><input type="range" min="0" max="500" value={skyLightY} onChange={e => setSkyLightY(Number(e.target.value))} className="w-full accent-yellow-500" /></div>
                                <div className="flex flex-col gap-1"><label className="text-gray-500 text-[10px] uppercase">Z: {skyLightZ}</label><input type="range" min="-500" max="500" value={skyLightZ} onChange={e => setSkyLightZ(Number(e.target.value))} className="w-full accent-yellow-500" /></div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </GameModalLayout>
    );
};
