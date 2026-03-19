import React, { useState } from 'react';
import { t } from '../../utils/i18n';
import ScreenModalLayout from '../ui/ScreenModalLayout';
import { EnvironmentOverride, WeatherType } from '../../types';
import { Sector6 } from '../../content/sectors/Sector6';
import { soundManager } from '../../utils/SoundManager';

interface ScreenPlaygroundEnvironmentStationProps {
    onClose: () => void;
    currentWeather: WeatherType;
    onWeatherChange: (w: WeatherType) => void;
    currentOverride?: EnvironmentOverride;
    onOverrideChange?: (overrides: EnvironmentOverride) => void;
    isMobileDevice?: boolean;
}

export const ScreenPlaygroundEnvironmentStation: React.FC<ScreenPlaygroundEnvironmentStationProps> = ({ onClose, currentWeather, onWeatherChange, currentOverride, onOverrideChange, isMobileDevice }) => {
    // Local state for UI inputs
    const [bgColor, setBgColor] = useState(currentOverride?.bgColor ? '#' + currentOverride.bgColor.toString(16).padStart(6, '0') : '#000000');
    const [fogColor, setFogColor] = useState(currentOverride?.fogColor ? '#' + currentOverride.fogColor.toString(16).padStart(6, '0') : '#050510');
    const [fogDensity, setFogDensity] = useState(currentOverride?.fogDensity ?? 0.01);
    const [ambientIntensity, setAmbientIntensity] = useState(currentOverride?.ambientIntensity ?? 0.4);
    const [groundColor, setGroundColor] = useState(currentOverride?.groundColor ? '#' + currentOverride.groundColor.toString(16).padStart(6, '0') : '#111111');
    const [fov, setFov] = useState(currentOverride?.fov ?? 50);

    const [skyLightVisible, setSkyLightVisible] = useState(currentOverride?.skyLightVisible ?? true);
    const [skyLightColor, setSkyLightColor] = useState(currentOverride?.skyLightColor ? '#' + currentOverride.skyLightColor.toString(16).padStart(6, '0') : '#4444ff');
    const [skyLightIntensity, setSkyLightIntensity] = useState(currentOverride?.skyLightIntensity ?? 0.5);
    const [skyLightX, setSkyLightX] = useState(currentOverride?.skyLightPosition?.x ?? 80);
    const [skyLightY, setSkyLightY] = useState(currentOverride?.skyLightPosition?.y ?? 50);
    const [skyLightZ, setSkyLightZ] = useState(currentOverride?.skyLightPosition?.z ?? 50);

    const [weatherDensity, setWeatherDensity] = useState(currentOverride?.weatherDensity ?? 500);
    const [windStrength, setWindStrength] = useState(currentOverride?.windStrength ?? 1.0);
    const [windDirection, setWindDirection] = useState(currentOverride?.windDirection ?? 0);
    const [windRandomized, setWindRandomized] = useState(currentOverride?.windRandomized ?? false);

    const handleApply = () => {
        const overrides: EnvironmentOverride = {
            bgColor: parseInt(bgColor.replace('#', ''), 16),
            fogColor: parseInt(fogColor.replace('#', ''), 16),
            fogDensity,
            ambientIntensity,
            groundColor: parseInt(groundColor.replace('#', ''), 16),
            fov,
            skyLightVisible,
            skyLightPosition: { x: skyLightX, y: skyLightY, z: skyLightZ },
            skyLightColor: parseInt(skyLightColor.replace('#', ''), 16),
            skyLightIntensity,
            weather: currentWeather,
            weatherDensity,
            windStrength,
            windDirection,
            windRandomized
        };

        if (onOverrideChange) onOverrideChange(overrides);
        onClose();
    };

    const handleReset = () => {
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
        onWeatherChange(def.weather as any);
        setWeatherDensity(500);
        setWindStrength(1.0);
        setWindDirection(0);
        setWindRandomized(false);
    };

    const footer = (
        <div className="flex w-full gap-4">
            <button onClick={handleReset} className="flex-1 px-4 py-3 border-2 border-red-900 bg-red-950/20 text-red-500 font-bold uppercase transition-all duration-200 hover:scale-105 active:scale-95 hover:bg-red-900/40">{t('ui.reset')}</button>
            <button onClick={onClose} className="flex-1 px-4 py-3 border-2 border-zinc-700 text-zinc-400 font-bold uppercase transition-all duration-200 hover:scale-105 active:scale-95">{t('ui.cancel')}</button>
            <button onClick={handleApply} className="flex-[2] px-4 py-3 border-2 border-white bg-white text-black font-bold uppercase transition-all duration-200 hover:scale-105 active:scale-95 shadow-xl">{t('ui.apply')}</button>
        </div>
    );

    return (
        <ScreenModalLayout
            title={t('ui.environment_control')}
            isMobileDevice={isMobileDevice}
            onClose={onClose}
            onConfirm={handleApply}
            footer={footer}
            titleColorClass="text-cyan-600"
        >
            <div className="flex flex-col gap-8 h-full overflow-y-auto pr-4 custom-scrollbar px-2 py-4">
                {/* Global Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="flex flex-col gap-2 bg-zinc-900/40 p-4 border border-zinc-800 rounded-lg">
                        <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest leading-none mb-2">{t('ui.background')}</label>
                        <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-full h-8 cursor-pointer bg-black border border-zinc-700" title={t('ui.background_color')} />
                        <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest leading-none mt-4 mb-2">{t('ui.ground')}</label>
                        <input type="color" value={groundColor} onChange={(e) => setGroundColor(e.target.value)} className="w-full h-8 cursor-pointer bg-black border border-zinc-700" title={t('ui.ground_color')} />
                    </div>
                    
                    <div className="flex flex-col gap-4 bg-zinc-900/40 p-4 border border-zinc-800 rounded-lg">
                        <div className="flex flex-col gap-1">
                            <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest">{t('ui.fov')}: <span className="text-white font-mono">{fov}</span></label>
                            <input type="range" min="30" max="120" value={fov} onChange={(e) => setFov(Number(e.target.value))} className="w-full accent-cyan-500" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest">{t('ui.ambient')}: <span className="text-white font-mono">{ambientIntensity.toFixed(1)}</span></label>
                            <input type="range" min="0" max="2" step="0.1" value={ambientIntensity} onChange={(e) => setAmbientIntensity(parseFloat(e.target.value))} className="w-full accent-cyan-500" />
                        </div>
                    </div>

                    {/* Wind */}
                    <div className="flex flex-col gap-4 bg-zinc-900/40 p-4 border border-zinc-800 rounded-lg col-span-1 md:col-span-2">
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest">{t('ui.wind')}</label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <span className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest">{t('ui.random')}</span>
                                <input type="checkbox" checked={windRandomized} onChange={(e) => setWindRandomized(e.target.checked)} className="w-4 h-4 accent-cyan-500" />
                            </label>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1">
                                <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest">{t('ui.strength')}: <span className="text-white font-mono">{windStrength.toFixed(1)}</span></label>
                                <input type="range" min="0" max="5" step="0.1" value={windStrength} onChange={(e) => setWindStrength(parseFloat(e.target.value))} className="w-full accent-cyan-500" disabled={windRandomized} />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest">{t('ui.direction')}: <span className="text-white font-mono">{windDirection.toFixed(0)}°</span></label>
                                <input type="range" min="0" max="360" step="1" value={windDirection} onChange={(e) => setWindDirection(parseFloat(e.target.value))} className="w-full accent-cyan-500" disabled={windRandomized} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Weather */}
                <div className="bg-zinc-900/40 p-6 border border-zinc-800 rounded-lg">
                    <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest mb-4 block">{t('ui.weather')}</label>
                    <div className="flex gap-2 flex-wrap mb-6">
                        {['none', 'rain', 'snow', 'ash', 'ember'].map((w) => (
                            <button
                                key={w}
                                onClick={() => { soundManager.playUiClick(); onWeatherChange(w as WeatherType); }}
                                className={`px-4 py-2 border-2 transition-all duration-200 uppercase font-black tracking-widest text-xs ${currentWeather === w ? 'bg-cyan-600 border-cyan-600 text-black' : 'bg-black border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
                            >
                                {w}
                            </button>
                        ))}
                    </div>
                    <div className="max-w-md">
                        <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest mb-2 block">{t('ui.particle_density')}: <span className="text-white font-mono">{weatherDensity}</span></label>
                        <input type="range" min="0" max="5000" step="50" value={weatherDensity} onChange={(e) => setWeatherDensity(parseFloat(e.target.value))} className="w-full accent-cyan-500" />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Fog */}
                    <div className="bg-cyan-950/10 p-6 border border-cyan-900/30 rounded-lg">
                        <label className="text-cyan-500 uppercase text-[10px] font-bold tracking-widest mb-4 block">{t('ui.fog_calibration')}</label>
                        <div className="flex gap-6 items-end">
                            <div className="flex-none">
                                <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest mb-2 block">Color</label>
                                <input type="color" value={fogColor} onChange={(e) => setFogColor(e.target.value)} className="w-12 h-12 cursor-pointer bg-black border border-zinc-800" />
                            </div>
                            <div className="flex-1">
                                <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest mb-2 block">Density: <span className="text-white font-mono">{fogDensity.toFixed(4)}</span></label>
                                <input type="range" min="0" max="0.1" step="0.001" value={fogDensity} onChange={(e) => setFogDensity(parseFloat(e.target.value))} className="w-full accent-cyan-500" />
                            </div>
                        </div>
                    </div>

                    {/* Sky Light */}
                    <div className="bg-yellow-950/10 p-6 border border-yellow-900/30 rounded-lg">
                        <div className="flex justify-between items-center mb-4">
                            <label className="text-yellow-500 uppercase text-[10px] font-bold tracking-widest">{t('ui.skylight_calibration')}</label>
                            <input type="checkbox" checked={skyLightVisible} onChange={(e) => setSkyLightVisible(e.target.checked)} className="w-4 h-4 accent-yellow-500" />
                        </div>
                        <div className={`flex flex-col gap-4 transition-opacity ${skyLightVisible ? 'opacity-100' : 'opacity-20 pointer-events-none'}`}>
                            <div className="flex gap-6 items-end">
                                <div className="flex-none">
                                    <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest mb-2 block">Color</label>
                                    <input type="color" value={skyLightColor} onChange={(e) => setSkyLightColor(e.target.value)} className="w-12 h-12 cursor-pointer bg-black border border-zinc-800" />
                                </div>
                                <div className="flex-1">
                                    <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest mb-2 block">Intensity: <span className="text-white font-mono">{skyLightIntensity.toFixed(1)}</span></label>
                                    <input type="range" min="0" max="5" step="0.1" value={skyLightIntensity} onChange={(e) => setSkyLightIntensity(parseFloat(e.target.value))} className="w-full accent-yellow-500" />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="flex flex-col gap-1">
                                    <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest">X: <span className="text-white">{skyLightX}</span></label>
                                    <input type="range" min="-500" max="500" value={skyLightX} onChange={e => setSkyLightX(Number(e.target.value))} className="w-full accent-yellow-500" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest">Y: <span className="text-white">{skyLightY}</span></label>
                                    <input type="range" min="0" max="500" value={skyLightY} onChange={e => setSkyLightY(Number(e.target.value))} className="w-full accent-yellow-500" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest">Z: <span className="text-white">{skyLightZ}</span></label>
                                    <input type="range" min="-500" max="500" value={skyLightZ} onChange={e => setSkyLightZ(Number(e.target.value))} className="w-full accent-yellow-500" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </ScreenModalLayout>
    );
};
