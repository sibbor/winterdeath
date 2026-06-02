export * from './materials';
export * from './geometry';
export * from './models';
export * from './AssetLoader';
export * from './procedural';
export * from './materials_wind';
export * from './materials_weather';
export * from './materials_fog';
export * from './materials_water';

import { TEXTURES } from './AssetLoader';
import { createProceduralDiffuse } from './procedural';
export const createProceduralTextures = () => ({
    ...TEXTURES,
    ...createProceduralDiffuse()
});
