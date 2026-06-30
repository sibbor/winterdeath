import * as THREE from 'three';
import { MATERIALS } from '../utils/assets/materials';
import { WindUniforms, TREE_WIND_UNIFORMS, GRASS_WIND_UNIFORMS, HEDGE_WIND_UNIFORMS } from '../utils/assets/materials_wind';
import { System, SystemID } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';

interface ActiveExplosion {
  x: number;
  y: number;
  z: number;
  radius: number;
  maxRadius: number;
  elapsed: number;
  duration: number;
  active: boolean;
}

const MAX_EXPLOSIONS = 8;
const _explosionPool: ActiveExplosion[] = Array.from({ length: MAX_EXPLOSIONS }, () => ({
  x: 0, y: 0, z: 0, radius: 0, maxRadius: 0, elapsed: 0, duration: 0, active: false
}));

const _tempInteractors = Array.from({ length: 8 }, () => new THREE.Vector4());
const _flatFloatScratchA = new Float32Array(32);
const _flatFloatScratchB = new Float32Array(32);
let _useBufferA = true;

export class WindSystem implements System {
  readonly systemId = SystemID.WIND;
  public id = 'wind';
  public enabled = true;
  public persistent = true;
  public isFixedStep?: boolean;

  public current = new THREE.Vector2(0, 0);
  public direction = new THREE.Vector3(0, 0, 0);
  public strength: number = 0;

  private target = new THREE.Vector2(0, 0);
  private nextChange: number = 0;
  private minStrength: number = 0.02;
  private maxStrength: number = 0.1;
  private baseAngle: number = 0.0;
  private angleVariance: number = Math.PI;

  private overrideActive: boolean = false;
  private materialsBound: boolean = false;

  // Here this specific WindSystem stores its references
  private boundUniforms: WindUniforms[] = [];
  private currentInteractors: THREE.Vector4[] = new Array(8).fill(null).map(() => new THREE.Vector4(0, 0, 0, 0));

  constructor() { }

  /**
   * Binds a material's uniforms to this WindSystem.
   * Since we pre-allocate in userData, we don't have to worry about when the shader compiles.
   */
  public bindMaterial(mat: THREE.Material | undefined) {
    if (!mat || !mat.userData.windUniforms) return;

    const uniforms = mat.userData.windUniforms as WindUniforms;

    // Avoid duplicates (O(N) check is fine here since the list is tiny)
    for (let i = 0; i < this.boundUniforms.length; i++) {
      if (this.boundUniforms[i].uTime === uniforms.uTime) return;
    }

    this.boundUniforms.push(uniforms);
  }

  setOverride(direction: number, strength: number) {
    this.overrideActive = true;
    this.target.set(Math.cos(direction), Math.sin(direction)).multiplyScalar(strength);
    this.strength = strength;
    this.current.copy(this.target);
    this.direction.set(this.current.x, 0, this.current.y).normalize();
  }

  clearOverride() {
    this.overrideActive = false;
  }

  setRandomWind(minStrength: number, maxStrength: number, baseAngle: number = 0.0, angleVariance: number = Math.PI) {
    this.minStrength = minStrength;
    this.maxStrength = maxStrength;
    this.baseAngle = baseAngle;
    this.angleVariance = angleVariance;
    this.overrideActive = false;
    this.nextChange = 0; // Force immediate recalculation on next update

    // Zero-GC Snap: If current wind is vastly outside new bounds, normalize it immediately
    const curLen = this.current.length();
    if (curLen > maxStrength * 2.0) {
      this.current.multiplyScalar(maxStrength / curLen);
    }
  }

  public setInteractors(interactors: THREE.Vector4[]) {
    for (let i = 0; i < 8; i++) {
      this.currentInteractors[i].copy(interactors[i]);
    }
  }

  public addExplosion(x: number, y: number, z: number, maxRadius: number, duration: number = 0.5) {
    for (let i = 0; i < MAX_EXPLOSIONS; i++) {
      const exp = _explosionPool[i];
      if (!exp.active) {
        exp.x = x;
        exp.y = y;
        exp.z = z;
        exp.radius = 0.1;
        exp.maxRadius = maxRadius;
        exp.elapsed = 0;
        exp.duration = duration;
        exp.active = true;
        break;
      }
    }
  }

  public sync(minStrength: number, maxStrength: number, baseAngle: number = 0.0, angleVariance: number = Math.PI) {
    this.setRandomWind(minStrength, maxStrength, baseAngle, angleVariance);
  }

  update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number): THREE.Vector2 {
    // Ensure all core materials are bound once.
    if (!this.materialsBound) {
      this.bindMaterial(MATERIALS.hedge);
      this.bindMaterial(MATERIALS.grass);
      this.bindMaterial(MATERIALS.flower);
      this.bindMaterial(MATERIALS.wheat);
      this.bindMaterial(MATERIALS.grassTuft); // Added grassTuft so standard ground cover bends
      this.bindMaterial(MATERIALS.treeFirNeedles);
      this.bindMaterial(MATERIALS.treeLeavesOak);
      this.bindMaterial(MATERIALS.treeLeavesBirch);
      this.bindMaterial(MATERIALS.treeTrunk);
      this.bindMaterial(MATERIALS.treeTrunkOak);
      this.bindMaterial(MATERIALS.treeTrunkBirch);
      this.bindMaterial(MATERIALS.deadWood);
      this.bindMaterial(MATERIALS.treeSilhouette);
      this.bindMaterial(MATERIALS.sunflowerStem);
      this.bindMaterial(MATERIALS.sunflowerHead);
      this.bindMaterial(MATERIALS.sunflowerCenter);
      this.materialsBound = true;
    }

    if (!this.overrideActive && renderTime > this.nextChange) {
      if (Math.random() > 0.4) {
        const angleOffset = (Math.random() * 2.0 - 1.0) * this.angleVariance;
        const angle = this.baseAngle + angleOffset;
        const range = this.maxStrength - this.minStrength;
        const strength = this.minStrength + Math.random() * range;
        this.target.set(Math.cos(angle) * strength, Math.sin(angle) * strength);
      } else {
        this.target.set(0, 0);
      }
      this.nextChange = renderTime + 3000 + Math.random() * 5000;
    }

    // Faster wind transitions (0.3 -> 0.8) for better responsiveness.
    const lerpFactor = 1.0 - Math.exp(-0.8 * delta);
    this.current.lerp(this.target, lerpFactor);
    this.direction.set(this.current.x, 0, this.current.y).normalize();
    this.strength = this.current.length();

    // Update active explosions
    for (let i = 0; i < MAX_EXPLOSIONS; i++) {
      const exp = _explosionPool[i];
      if (exp.active) {
        exp.elapsed += delta;
        if (exp.elapsed >= exp.duration) {
          exp.active = false;
        } else {
          const t = exp.elapsed / exp.duration;
          // Linear expansion from 0.1 to maxRadius, instead of a symmetrical sine curve
          // that would shrink back to 0 at the end of the duration.
          exp.radius = 0.1 + (exp.maxRadius - 0.1) * t;
        }
      }
    }

    // High-performance iteration loop for this specific WindSystem
    const timeSec = renderTime * 0.001; // renderTime is already small and synchronized
    const windX = this.current.x;
    const windY = this.current.y;

    // Merge static/dynamic interactors with transient explosions into pre-allocated scratchpad
    let slot = 0;
    for (let j = 0; j < 8; j++) {
      const inter = this.currentInteractors[j];
      if (inter.w > 0.01) {
        _tempInteractors[slot++].copy(inter);
      }
    }

    for (let i = 0; i < MAX_EXPLOSIONS && slot < 8; i++) {
      const exp = _explosionPool[i];
      if (exp.active) {
        _tempInteractors[slot++].set(exp.x, exp.y, exp.z, exp.radius);
      }
    }

    for (let j = slot; j < 8; j++) {
      _tempInteractors[j].set(0, 0, 0, 0);
    }

    // Flatten _tempInteractors into the active scratchpad buffer
    const activeScratch = _useBufferA ? _flatFloatScratchA : _flatFloatScratchB;
    _useBufferA = !_useBufferA;

    for (let j = 0; j < 8; j++) {
      const v = _tempInteractors[j];
      const idx = j * 4;
      activeScratch[idx] = v.x;
      activeScratch[idx + 1] = v.y;
      activeScratch[idx + 2] = v.z;
      activeScratch[idx + 3] = v.w;
    }

    // Direct uniform updates across the shared structs
    // 1. Tree Uniforms
    TREE_WIND_UNIFORMS.uTime.value = timeSec;
    TREE_WIND_UNIFORMS.uWind.value.set(windX, windY);
    TREE_WIND_UNIFORMS.uInteractors.value = activeScratch;
    // Force Three.js to re-upload the TypedArray contents each frame.
    // Without this, Three.js sees the same Float32Array reference and skips the upload.
    (TREE_WIND_UNIFORMS.uInteractors as any).needsUpdate = true;

    // 2. Grass Uniforms
    GRASS_WIND_UNIFORMS.uTime.value = timeSec;
    GRASS_WIND_UNIFORMS.uWind.value.set(windX, windY);
    GRASS_WIND_UNIFORMS.uInteractors.value = activeScratch;
    (GRASS_WIND_UNIFORMS.uInteractors as any).needsUpdate = true;

    // 3. Hedge Uniforms
    HEDGE_WIND_UNIFORMS.uTime.value = timeSec;
    HEDGE_WIND_UNIFORMS.uWind.value.set(windX, windY);
    HEDGE_WIND_UNIFORMS.uInteractors.value = activeScratch;
    (HEDGE_WIND_UNIFORMS.uInteractors as any).needsUpdate = true;

    // Keep updating the dynamic binds for custom/extra instances of materials
    const binds = this.boundUniforms;
    const len = binds.length;
    for (let i = 0; i < len; i++) {
      const b = binds[i];
      b.uTime.value = timeSec;
      b.uWind.value.x = windX;
      b.uWind.value.y = windY;
      b.uInteractors.value = activeScratch;
      (b.uInteractors as any).needsUpdate = true;
    }

    return this.current;
  }

  public clear(): void {
    this.boundUniforms.length = 0;
    this.overrideActive = false;
    this.materialsBound = false;
    for (let i = 0; i < MAX_EXPLOSIONS; i++) {
      _explosionPool[i].active = false;
    }
  }

}