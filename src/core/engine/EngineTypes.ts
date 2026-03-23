export interface GraphicsSettings {
  antialias: boolean;
  shadows: boolean;
  bloom: boolean;
  shadowMapType: number;
  shadowResolution: number;
  pixelRatio: number;
  weatherCount: number;
  textureQuality: number;
  volumetricFog: boolean;
}

export type WeatherType = 'none' | 'snow' | 'rain' | 'ash' | 'ember';

export interface EnvironmentalFog {
  density: number; // 0-40 (Antal plan för FogSystem)
  color?: number;  // Om satt, override:ar bgColor
  height?: number; // fogHeight om du vill styra yTop parametern i framtiden
}

export interface EnvironmentalWeather {
  type: WeatherType;
  particles: number;
}

export interface EnvironmentalWind {
  strengthMin?: number;
  strengthMax?: number;
  direction?: { x: number, z: number };
  angleVariance?: number;
}

export interface SectorEnvironment {
  bgColor: number;
  fog?: EnvironmentalFog;
  ambientIntensity: number;
  ambientColor?: number;
  groundColor: number;
  fov: number;
  skyLight: {
    visible: boolean;
    color: number;
    intensity: number;
    position?: { x: number, y: number, z: number };
  };
  hemiLight?: {
    sky: number;
    ground: number;
    intensity: number;
  };
  cameraOffsetZ: number;
  cameraHeight?: number;
  weather: EnvironmentalWeather;
  wind?: EnvironmentalWind;
}

export interface EnvironmentalZone {
  label: string;
  x: number;
  z: number;
  weather: WeatherType;
  bgColor: number;
  fogDensity: number;
  ambient: number;
  weatherDensity?: number;
  innerRadius?: number;
  outerRadius?: number;
}

export interface EnvironmentOverride extends Partial<Omit<SectorEnvironment, 'weather'>> {
  weather?: WeatherType | EnvironmentalWeather;
  directionalIntensity?: number;
  windStrength?: number;
  windDirection?: number;
  windRandomized?: boolean;
}
