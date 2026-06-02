import * as THREE from 'three';
import { WeatherType } from '../../core/engine/EnvironmentalTypes';

// ============================================================================
// CONFIGURATION & UNIFORM TYPES FOR WEATHER SYSTEM
// ============================================================================
export interface WeatherUniforms {
    uTime: { value: number };
    uWindOffset: { value: THREE.Vector2 };
    uSmoothWind: { value: THREE.Vector2 };
    uPlayerPos: { value: THREE.Vector3 };
    uAreaSize: { value: number };
    uYTop: { value: number };
    uColor: { value: THREE.Color };
    uOpacity: { value: number };
    uIsRain: { value: number };
    [key: string]: THREE.IUniform;
}

// ============================================================================
// PRE-ALLOCATED STATIC UNIFORMS (Bypasses THREE.UniformsUtils.clone() overhead)
// ============================================================================
export const WEATHER_UNIFORMS: Record<WeatherType, WeatherUniforms> = {
    [WeatherType.NONE]: {
        uTime: { value: 0 },
        uWindOffset: { value: new THREE.Vector2() },
        uSmoothWind: { value: new THREE.Vector2() },
        uPlayerPos: { value: new THREE.Vector3() },
        uAreaSize: { value: 100 },
        uYTop: { value: 40.0 },
        uColor: { value: new THREE.Color(0xffffff) },
        uOpacity: { value: 0.0 },
        uIsRain: { value: 0.0 }
    },
    [WeatherType.RAIN]: {
        uTime: { value: 0 },
        uWindOffset: { value: new THREE.Vector2() },
        uSmoothWind: { value: new THREE.Vector2() },
        uPlayerPos: { value: new THREE.Vector3() },
        uAreaSize: { value: 100 },
        uYTop: { value: 40.0 },
        uColor: { value: new THREE.Color(0xaaaaff) },
        uOpacity: { value: 0.6 },
        uIsRain: { value: 1.0 }
    },
    [WeatherType.SNOW]: {
        uTime: { value: 0 },
        uWindOffset: { value: new THREE.Vector2() },
        uSmoothWind: { value: new THREE.Vector2() },
        uPlayerPos: { value: new THREE.Vector3() },
        uAreaSize: { value: 100 },
        uYTop: { value: 40.0 },
        uColor: { value: new THREE.Color(0xffffff) },
        uOpacity: { value: 0.8 },
        uIsRain: { value: 0.0 }
    },
    [WeatherType.ASH]: {
        uTime: { value: 0 },
        uWindOffset: { value: new THREE.Vector2() },
        uSmoothWind: { value: new THREE.Vector2() },
        uPlayerPos: { value: new THREE.Vector3() },
        uAreaSize: { value: 100 },
        uYTop: { value: 40.0 },
        uColor: { value: new THREE.Color(0x333333) },
        uOpacity: { value: 0.8 },
        uIsRain: { value: 0.0 }
    },
    [WeatherType.EMBER]: {
        uTime: { value: 0 },
        uWindOffset: { value: new THREE.Vector2() },
        uSmoothWind: { value: new THREE.Vector2() },
        uPlayerPos: { value: new THREE.Vector3() },
        uAreaSize: { value: 100 },
        uYTop: { value: 40.0 },
        uColor: { value: new THREE.Color(0xff4400) },
        uOpacity: { value: 1.0 },
        uIsRain: { value: 0.0 }
    }
};

// ============================================================================
// WEATHER SHADER DEFINITIONS
// ============================================================================
const vertexShader = `
    uniform float uTime; 
    uniform vec2 uWindOffset; 
    uniform vec2 uSmoothWind;
    uniform vec3 uPlayerPos; 
    uniform float uAreaSize; 
    uniform float uYTop; 
    uniform float uIsRain;
    
    attribute vec3 initialPos; 
    attribute vec3 velocity;
    
    void main() {
        float areaHalf = uAreaSize * 0.5; 
        vec3 pos = initialPos;
        
        pos.x += velocity.x * uTime + uWindOffset.x; 
        pos.y += velocity.y * uTime; 
        pos.z += velocity.z * uTime + uWindOffset.y;
        
        pos.y = mod(pos.y, uYTop);
        pos.x = uPlayerPos.x + mod(pos.x - uPlayerPos.x + areaHalf, uAreaSize) - areaHalf;
        pos.z = uPlayerPos.z + mod(pos.z - uPlayerPos.z + areaHalf, uAreaSize) - areaHalf;
        
        vec3 localPos = position;
        if (uIsRain > 0.5 && localPos.y > 0.0) {
            vec3 totalVel = vec3(velocity.x + uSmoothWind.x * 5.0, velocity.y, velocity.z + uSmoothWind.y * 5.0);
            vec3 dir = normalize(totalVel);
            localPos.x += dir.x * localPos.y * 2.0; 
            localPos.z += dir.z * localPos.y * 2.0;
        }
        
        gl_Position = projectionMatrix * viewMatrix * vec4(pos + localPos, 1.0);
    }
`;

const fragmentShader = `
    uniform vec3 uColor; 
    uniform float uOpacity; 
    
    void main() { 
        gl_FragColor = vec4(uColor, uOpacity); 
    }
`;

// ============================================================================
// LAZY-LOADED MATERIALS (Zero-GC and compiled exactly once)
// ============================================================================
const _materials: Partial<Record<WeatherType, THREE.ShaderMaterial>> = {};

export const MATERIALS_WEATHER = {
    getMaterial(type: WeatherType): THREE.ShaderMaterial {
        if (!_materials[type]) {
            const mat = new THREE.ShaderMaterial({
                vertexShader,
                fragmentShader,
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            // Assign pre-allocated flat uniform reference directly to avoid cloning
            mat.uniforms = WEATHER_UNIFORMS[type];
            mat.userData = { isSharedAsset: true };
            _materials[type] = mat;
        }
        return _materials[type]!;
    },

    dispose(): void {
        for (const type in _materials) {
            const mat = _materials[type as unknown as WeatherType];
            if (mat) {
                mat.dispose();
                delete _materials[type as unknown as WeatherType];
            }
        }
    }
};
