import * as THREE from 'three';

class AssetLoader {
    private static instance: AssetLoader;
    private textureLoader: THREE.TextureLoader;
    private textureCacheSource: Map<string, THREE.Texture> = new Map();

    private constructor() {
        this.textureLoader = new THREE.TextureLoader();
    }

    public static getInstance(): AssetLoader {
        if (!AssetLoader.instance) {
            AssetLoader.instance = new AssetLoader();
        }
        return AssetLoader.instance;
    }

    /**
     * Loads a texture and sets standard properties for environment maps.
     * [VINTERDÖD] Uses flat arguments instead of objects to prevent GC allocations.
     */
    public loadTexture(path: string, repeatX: number = 1, repeatY: number = 1): THREE.Texture {
        const cacheKey = `${path}_${repeatX}_${repeatY}`;

        if (this.textureCacheSource.has(cacheKey)) {
            return this.textureCacheSource.get(cacheKey)!;
        }

        const texture = this.textureLoader.load(path);

        // Standard environment settings
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(repeatX, repeatY);

        // Performance: Anisotropy for sharp looks at distance. 
        // 4 is a great sweet spot for mobile/desktop performance.
        texture.anisotropy = 4;

        // [VINTERDÖD CRITICAL FIX] Disable auto-update to save CPU cycles per frame.
        // BUT we MUST call updateMatrix() once manually to apply the repeat settings!
        texture.matrixAutoUpdate = false;
        texture.updateMatrix();

        this.textureCacheSource.set(cacheKey, texture);
        return texture;
    }
}

const loader = AssetLoader.getInstance();

export const TEXTURES = {
    stone_bump: loader.loadTexture('/assets/textures/stone_bump.png'),
    asphalt_bump: loader.loadTexture('/assets/textures/asphalt_bump.png'),
    snow_bump: loader.loadTexture('/assets/textures/snow_bump.png'),
    bark_rough_bump: loader.loadTexture('/assets/textures/bark_rough_bump.png'),
    bark_birch_bump: loader.loadTexture('/assets/textures/bark_birch_bump.png'),
    concrete_bump: loader.loadTexture('/assets/textures/concrete_bump.png'),
    brick_bump: loader.loadTexture('/assets/textures/brick_bump.png'),
    water_foam: loader.loadTexture('/assets/textures/water_foam.png'),
    water_ripple: loader.loadTexture('/assets/textures/water_ripple.png'),
    water_wave: loader.loadTexture('/assets/textures/water_wave.png'),
};