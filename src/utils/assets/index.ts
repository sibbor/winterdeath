export * from './materials';
export * from './geometry';
export * from './models';
export * from './AssetLoader';
export * from './ui';
export * from './procedural';

// For backward compatibility while we migrate away from monolithic assets.ts
import { TEXTURES as NEW_TEXTURES } from './AssetLoader';
import { createProceduralDiffuse } from './procedural';
export const createProceduralTextures = () => ({
    ...NEW_TEXTURES,
    ...createProceduralDiffuse()
});
