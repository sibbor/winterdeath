import React, { useState } from 'react';
import { t } from '../../../utils/i18n';
import ModalLayout, { TacticalButton, TacticalTab } from './ModalLayout';
import { EnvironmentOverride, WeatherType } from '../../../core/engine/EnvironmentalTypes';;
import { Sector4 } from '../../../content/sectors/Sector4';
import { UISounds } from '../../../utils/audio/AudioLib';

// Zero-GC: static config hoisted outside component to prevent re-allocation on every render
const WEATHER_OPTIONS: { id: WeatherType; key: string }[] = [
    { id: WeatherType.NONE, key: 'none' },
    { id: WeatherType.RAIN, key: 'rain' },
    { id: WeatherType.SNOW, key: 'snow' },
    { id: WeatherType.ASH, key: 'ash' },
    { id: WeatherType.EMBER, key: 'ember' },
];

interface EnvironmentTerminalProps {
    onClose: () => void;
    currentWeather: WeatherType;
    onWeatherChange: (w: WeatherType) => void;
    currentOverride?: EnvironmentOverride;
    onOverrideChange?: (overrides: EnvironmentOverride) => void;
    isMobileDevice?: boolean;
}

export const ScreenTerminalEnvironment: React.FC<EnvironmentTerminalProps> = ({ onClose, currentWeather, onWeatherChange, currentOverride, onOverrideChange, isMobileDevice }) => {
    // Local state for UI inputs
    const [bgColor, setBgColor] = useState(currentOverride?.bgColor ? '#' + currentOverride.bgColor.toString(16).padStart(6, '0') : '#000000');
    const [fogColor, setFogColor] = useState(currentOverride?.fogColor ? '#' + currentOverride.fogColor.toString(16).padStart(6, '0') : '#050510');
    const [fogDensity, setFogDensity] = useState(currentOverride?.fogDensity ?? 0.01);
    const [groundColor, setGroundColor] = useState(currentOverride?.groundColor ? '#' + currentOverride.groundColor.toString(16).padStart(6, '0') : '#111111');
    const [fov, setFov] = useState(currentOverride?.fov ?? 50);

    // --- SKY SYSTEM ---
    const [skyTime, setSkyTime] = useState(currentOverride?.sky?.time ?? 0.5);
    const [skyLightVisible, setSkyLightVisible] = useState(currentOverride?.sky?.light?.visible ?? true);
    const [skyLightColor, setSkyLightColor] = useState(currentOverride?.sky?.light?.color ? '#' + currentOverride.sky.light.color.toString(16).padStart(6, '0') : '#4444ff');
    const [skyLightIntensity, setSkyLightIntensity] = useState(currentOverride?.sky?.light?.intensity ?? 0.5);

    const [hemiIntensity, setHemiIntensity] = useState(currentOverride?.sky?.hemi?.intensity ?? 0.6);
    const [hemiSkyColor, setHemiSkyColor] = useState(currentOverride?.sky?.hemi?.skyColor ? '#' + currentOverride.sky.hemi.skyColor.toString(16).padStart(6, '0') : '#87ceeb');

    const [atmosphereColor, setAtmosphereColor] = useState(currentOverride?.sky?.atmosphereColor ? '#' + currentOverride.sky.atmosphereColor.toString(16).padStart(6, '0') : '#161629');
    const [stars, setStars] = useState(currentOverride?.sky?.stars ?? 1000);
    const [celestialRadius, setCelestialRadius] = useState(currentOverride?.sky?.celestial?.radius ?? 20);
    const [celestialColor, setCelestialColor] = useState(currentOverride?.sky?.celestial?.color ? '#' + currentOverride.sky.celestial.color.toString(16).padStart(6, '0') : '#fff9e6');

    const [weatherDensity, setWeatherDensity] = useState(currentOverride?.weatherDensity ?? 500);
    const [windStrength, setWindStrength] = useState(currentOverride?.windStrength ?? 1.0);
    const [windDirection, setWindDirection] = useState(currentOverride?.windDirection ?? 0);
    const [windRandomized, setWindRandomized] = useState(currentOverride?.windRandomized ?? false);

    const handleApply = () => {
        const overrides: EnvironmentOverride = {
            bgColor: parseInt(bgColor.replace('#', ''), 16),
            fogColor: parseInt(fogColor.replace('#', ''), 16),
            fogDensity,
            groundColor: parseInt(groundColor.replace('#', ''), 16),
            fov,
            sky: {
                time: skyTime,
                stars,
                atmosphereColor: parseInt(atmosphereColor.replace('#', ''), 16),
                hemi: {
                    intensity: hemiIntensity,
                    skyColor: parseInt(hemiSkyColor.replace('#', ''), 16)
                },
                celestial: {
                    radius: celestialRadius,
                    color: parseInt(celestialColor.replace('#', ''), 16)
                },
                light: {
                    visible: skyLightVisible,
                    color: parseInt(skyLightColor.replace('#', ''), 16),
                    intensity: skyLightIntensity
                }
            },
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
        const def = Sector4.environment;
        setBgColor('#' + def.bgColor.toString(16).padStart(6, '0'));
        setFogColor(def.fog?.color ? '#' + def.fog.color.toString(16).padStart(6, '0') : '#' + def.bgColor.toString(16).padStart(6, '0'));
        setFogDensity(def.fog?.density ?? 0.01);
        setGroundColor('#' + def.groundColor.toString(16).padStart(6, '0'));
        setFov(def.fov);

        if (def.sky) {
            setSkyTime(def.sky.time ?? 0.5);
            setSkyLightVisible(def.sky.light?.visible ?? true);
            setSkyLightColor('#' + (def.sky.light?.color ?? 0xffffff).toString(16).padStart(6, '0'));
            setSkyLightIntensity(def.sky.light?.intensity ?? 1.0);
            setHemiIntensity(def.sky.hemi?.intensity ?? 0.6);
            setAtmosphereColor('#' + (def.sky.atmosphereColor ?? 0x000000).toString(16).padStart(6, '0'));
            setStars(def.sky.stars ?? 1000);
            setCelestialRadius(def.sky.celestial?.radius ?? 20);
            setCelestialColor('#' + (def.sky.celestial?.color ?? 0xffffff).toString(16).padStart(6, '0'));
        }

        onWeatherChange(def.weather as any);
        setWeatherDensity(500);
        setWindStrength(1.0);
        setWindDirection(0);
        setWindRandomized(false);
    };

    const footer = (
        <div className="flex w-full gap-4">
            <TacticalButton variant="danger" onClick={handleReset} className="flex-1">{t('ui.reset')}</TacticalButton>
            <TacticalButton variant="ghost" onClick={onClose} className="flex-1">{t('ui.cancel')}</TacticalButton>
            <TacticalButton variant="primary" onClick={handleApply} className="flex-[2] shadow-xl">{t('ui.apply')}</TacticalButton>
        </div>
    );

    return (
        <ModalLayout
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
                        <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest leading-none mb-2">{t('ui.time_of_day')}: <span className="text-white font-mono">{skyTime.toFixed(2)}</span></label>
                        <input type="range" min="0" max="1" step="0.01" value={skyTime} onChange={(e) => setSkyTime(parseFloat(e.target.value))} className="w-full accent-cyan-500" />

                        <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest leading-none mt-4 mb-2">{t('ui.ground')}</label>
                        <input type="color" value={groundColor} onChange={(e) => setGroundColor(e.target.value)} className="w-full h-8 cursor-pointer bg-black border border-zinc-700" title={t('ui.ground_color')} />
                    </div>

                    <div className="flex flex-col gap-4 bg-zinc-900/40 p-4 border border-zinc-800 rounded-lg">
                        <div className="flex flex-col gap-1">
                            <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest">{t('ui.fov')}: <span className="text-white font-mono">{fov}</span></label>
                            <input type="range" min="30" max="120" value={fov} onChange={(e) => setFov(Number(e.target.value))} className="w-full accent-cyan-500" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest">{t('ui.hemi_intensity')}: <span className="text-white font-mono">{hemiIntensity.toFixed(1)}</span></label>
                            <input type="range" min="0" max="2" step="0.1" value={hemiIntensity} onChange={(e) => setHemiIntensity(parseFloat(e.target.value))} className="w-full accent-cyan-500" />
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
                    <div className="flex flex-nowrap gap-2 overflow-x-auto mb-6 pb-2 scrollbar-hide">
                        {WEATHER_OPTIONS.map((w) => (
                            <TacticalTab
                                key={w.id}
                                label={t(`weather.${w.key}`)}
                                isActive={currentWeather === w.id}
                                onClick={() => { UISounds.playClick(); onWeatherChange(w.id); }}
                            />
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
                                <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest mb-2 block">{t('ui.color')}</label>
                                <input type="color" value={fogColor} onChange={(e) => setFogColor(e.target.value)} className="w-12 h-12 cursor-pointer bg-black border border-zinc-800" />
                            </div>
                            <div className="flex-1">
                                <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest mb-2 block">{t('ui.density')}: <span className="text-white font-mono">{fogDensity.toFixed(4)}</span></label>
                                <input type="range" min="0" max="0.1" step="0.001" value={fogDensity} onChange={(e) => setFogDensity(parseFloat(e.target.value))} className="w-full accent-cyan-500" />
                            </div>
                        </div>
                    </div>

                    {/* Sky & Celestial System */}
                    <div className="bg-yellow-950/10 p-6 border border-yellow-900/30 rounded-lg">
                        <div className="flex justify-between items-center mb-4">
                            <label className="text-yellow-500 uppercase text-[10px] font-bold tracking-widest">{t('ui.skylight_calibration')}</label>
                            <input type="checkbox" checked={skyLightVisible} onChange={(e) => setSkyLightVisible(e.target.checked)} className="w-4 h-4 accent-yellow-500" />
                        </div>
                        <div className={`flex flex-col gap-6 transition-opacity ${skyLightVisible ? 'opacity-100' : 'opacity-20 pointer-events-none'}`}>
                            {/* Stars & Body */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1">
                                    <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest">{t('ui.stars')}: <span className="text-white font-mono">{stars}</span></label>
                                    <input type="range" min="0" max="5000" step="100" value={stars} onChange={(e) => setStars(Number(e.target.value))} className="w-full accent-yellow-500" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest">{t('ui.radius')}: <span className="text-white font-mono">{celestialRadius}</span></label>
                                    <input type="range" min="1" max="100" step="1" value={celestialRadius} onChange={(e) => setCelestialRadius(Number(e.target.value))} className="w-full accent-yellow-500" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="flex gap-4 items-end">
                                    <div className="flex-none">
                                        <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest mb-1 block">{t('ui.light_color')}</label>
                                        <input type="color" value={skyLightColor} onChange={(e) => setSkyLightColor(e.target.value)} className="w-10 h-10 cursor-pointer bg-black border border-zinc-800" />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest mb-1 block">{t('ui.intensity')}: <span className="text-white font-mono">{skyLightIntensity.toFixed(1)}</span></label>
                                        <input type="range" min="0" max="5" step="0.1" value={skyLightIntensity} onChange={(e) => setSkyLightIntensity(parseFloat(e.target.value))} className="w-full accent-yellow-500" />
                                    </div>
                                </div>
                                <div className="flex gap-4 items-end">
                                    <div className="flex-none">
                                        <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest mb-1 block">{t('ui.body_color')}</label>
                                        <input type="color" value={celestialColor} onChange={(e) => setCelestialColor(e.target.value)} className="w-10 h-10 cursor-pointer bg-black border border-zinc-800" />
                                    </div>
                                    <div className="flex-none">
                                        <label className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest mb-1 block">{t('ui.hemi_color')}</label>
                                        <input type="color" value={hemiSkyColor} onChange={(e) => setHemiSkyColor(e.target.value)} className="w-10 h-10 cursor-pointer bg-black border border-zinc-800" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </ModalLayout>
    );
};
