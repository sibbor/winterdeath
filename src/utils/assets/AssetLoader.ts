import * as THREE from 'three';

export class AssetLoader {
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
     *
     * @param persistent if true, the texture will never be removed from VRAM.
     *                   Perfect for global bump-maps.
     */
    public loadTexture(path: string, repeatX: number = 1, repeatY: number = 1, isColorTexture: boolean = false, persistent: boolean = true): THREE.Texture {
        const cacheKey = `${path}_${repeatX}_${repeatY}_${isColorTexture}`;

        if (this.textureCacheSource.has(cacheKey)) {
            return this.textureCacheSource.get(cacheKey)!;
        }

        const texture = this.textureLoader.load(path);
        if (isColorTexture) texture.colorSpace = THREE.SRGBColorSpace;
        else texture.colorSpace = THREE.NoColorSpace;

        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(repeatX, repeatY);
        texture.anisotropy = 4;
        texture.matrixAutoUpdate = false;
        texture.updateMatrix();

        // Mark texture so we know if it can be deleted or not
        texture.userData.isPersistent = persistent;
        this.textureCacheSource.set(cacheKey, texture);
        return texture;
    }

    public clearCache() {
        const keysToRemove: string[] = [];

        this.textureCacheSource.forEach((texture, key) => {
            if (!texture.userData.isPersistent) {
                texture.dispose();
                keysToRemove.push(key);
            }
        });

        for (let i = 0; i < keysToRemove.length; i++) {
            this.textureCacheSource.delete(keysToRemove[i]);
        }
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
    water_ripple: loader.loadTexture('/assets/textures/water_ripple.png'),
};