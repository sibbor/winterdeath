import * as THREE from 'three';

const createFallbackTexture = (): THREE.CanvasTexture => {
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : ({ width: 16, height: 16 } as any);
    if (canvas.getContext) {
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#888888';
        ctx.fillRect(0, 0, 16, 16);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.matrixAutoUpdate = false;
    return tex;
};

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
     * Uses flat arguments instead of objects to prevent GC allocations.
     *
     * @param persistent if true, the texture will never be removed from VRAM.
     *                   Perfect for global bump-maps.
     */
    private pendingPromises: Promise<void>[] = [];

    public loadTexture(path: string, repeatX: number = 1, repeatY: number = 1, isColorTexture: boolean = false, persistent: boolean = true): THREE.Texture {
        const cacheKey = `${path}_${repeatX}_${repeatY}_${isColorTexture}`;

        if (this.textureCacheSource.has(cacheKey)) {
            return this.textureCacheSource.get(cacheKey)!;
        }

        const fallback = createFallbackTexture();

        const loadPromise = new Promise<void>((resolve) => {
            this.textureLoader.load(
                path,
                (tex) => {
                    const img = tex.image;
                    if (img && typeof img.decode === 'function') {
                        img.decode()
                            .then(() => resolve())
                            .catch(() => resolve());
                    } else {
                        resolve();
                    }
                },
                undefined,
                (err) => {
                    console.warn(`[AssetLoader] Texture load failed for "${path}", using fallback.`, err);
                    resolve();
                }
            );
        });
        this.pendingPromises.push(loadPromise);

        const texture = this.textureLoader.load(
            path,
            undefined,
            undefined,
            () => {
                // On 404 / load error, assign valid fallback image to prevent WebGL texImage2D crash
                (texture as any).image = fallback.image;
                texture.needsUpdate = true;
            }
        );
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

    public async waitForTextures(): Promise<void> {
        if (this.pendingPromises.length === 0) return;
        await Promise.all(this.pendingPromises);
        this.pendingPromises = [];
    }

    public clearCache() {
        const keysToRemove: string[] = [];

        for (const [key, texture] of this.textureCacheSource) {
            if (!texture.userData.isPersistent) {
                texture.dispose();
                keysToRemove.push(key);
            }
        }

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
    water_ripple: createFallbackTexture(),
};
