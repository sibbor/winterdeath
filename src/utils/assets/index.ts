export * from './materials';
export * from './geometry';
export * from './models';
export * from './AssetLoader';
export * from './ui';
export * from './procedural';
export * from './materials_wind';

import { TEXTURES } from './AssetLoader';
import { createProceduralDiffuse } from './procedural';
export const createProceduralTextures = () => ({
    ...TEXTURES,
    ...createProceduralDiffuse()
});