/**
 * SMI Enum for Weather type.
 * Zero-GC: integer comparison replaces string equality checks in hot loops.
 */
export enum WeatherType {
  NONE = 0,
  SNOW = 1,
  RAIN = 2,
  ASH = 3,
  EMBER = 4,
}

export enum GroundType {
  SNOW = 0,
  GRAVEL = 1,
  DIRT = 2,
  ASPHALT = 3,
  WOOD = 4,
  METAL = 5,
  ICE = 6,
  WATER = 7
}

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

export interface EnvironmentConfig {
  bgColor: number;
  fog?: EnvironmentalFog;
  groundColor: number;
  fov: number;
  sky: import('../../utils/assets/materials_sky').SkyConfig;
  cameraOffsetZ: number;
  cameraHeight?: number;
  weather: EnvironmentalWeather;
  wind?: EnvironmentalWind;
  ambient?: number; // Global ambient fill (Hemisphere intensity fallback)
}

export interface EnvironmentalZone {
  label: string;
  x?: number; // Optional if polygon is provided
  z?: number; // Optional if polygon is provided
  weather: WeatherType;
  bgColor: number;
  fogDensity: number;
  ambient: number;
  weatherDensity?: number;
  innerRadius?: number;
  outerRadius?: number;
  windStrength?: number;
  polygon?: { x: number, z: number }[];
  polygonFadeDistance?: number;
}

export interface TargetEnvironment {
  fogColor: number;
  fogDensity: number;
  groundColor: number;
  weatherType: WeatherType;
  weatherDensity: number;
  windStrength: number;
  ambient: number;
  maxWeight: number; // To determine if zone weather should dominate
}

export interface EnvironmentOverride extends Partial<Omit<EnvironmentConfig, 'weather'>> {
  weather?: WeatherType | EnvironmentalWeather;
  fogColor?: number;
  fogDensity?: number;
  weatherDensity?: number;
  windStrength?: number;
  windDirection?: number;
  windRandomized?: boolean;
}