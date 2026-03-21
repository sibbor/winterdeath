export interface GraphicsSettings {
  antialias: boolean;
  shadows: boolean;
  bloom: boolean;
  shadowMapType: number;
  shadowResolution: number;
  pixelRatio: number;
  weatherCount: number;
  textureQuality: number;
}

export type WeatherType = 'none' | 'snow' | 'rain' | 'ash' | 'ember';

export interface EnvironmentOverride {
  fogColor?: number;
  fogDensity?: number;
  ambientIntensity?: number;
  directionalIntensity?: number;
  groundColor?: number;
  bgColor?: number;
  fov?: number;
  skyLightVisible?: boolean;
  skyLightPosition?: { x: number; y: number; z: number };
  skyLightColor?: number;
  skyLightIntensity?: number;
  weather?: WeatherType;
  weatherDensity?: number;
  windStrength?: number;
  windDirection?: number;
  windRandomized?: boolean;
}
