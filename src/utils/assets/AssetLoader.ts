
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
     * Loads a texture and sets standard properties for environment maps
     */
    public loadTexture(path: string, repeat: { x: number, y: number } = { x: 1, y: 1 }): THREE.Texture {
        const cacheKey = `${path}_${repeat.x}_${repeat.y}`;

        if (this.textureCacheSource.has(cacheKey)) {
            return this.textureCacheSource.get(cacheKey)!;
        }

        const texture = this.textureLoader.load(path);

        // Standard environment settings
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(repeat.x, repeat.y);

        // Performance: Anisotropy for sharp looks at distance
        texture.anisotropy = 8;

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
};
