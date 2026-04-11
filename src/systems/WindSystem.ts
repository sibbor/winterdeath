import * as THREE from 'three';
import { MATERIALS } from '../utils/assets/materials';
import { System } from './System';

interface WindBind {
  uTime: { value: number };
  uWind: { value: THREE.Vector2 };
  uInteractors: { value: THREE.Vector4[] };
}

export class WindSystem implements System {
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

  // Här lagrar detta specifika WindSystem sina referenser
  private boundUniforms: WindBind[] = [];
  private currentInteractors: THREE.Vector4[] = new Array(8).fill(null).map(() => new THREE.Vector4(0, 0, 0, 0));

  constructor() { }

  /**
   * [VINTERDÖD] Binder ett materials uniforms till detta WindSystem.
   * Eftersom vi pre-allokerar i userData, slipper vi oroa oss för när shadern kompileras.
   */
  public bindMaterial(mat: THREE.Material | undefined) {
    if (!mat || !mat.userData.windUniforms) return;

    const uniforms = mat.userData.windUniforms as WindBind;

    // Undvik dubbletter (O(N) check är ok här då listan är pytteliten)
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

  public sync(minStrength: number, maxStrength: number, baseAngle: number = 0.0, angleVariance: number = Math.PI) {
    this.setRandomWind(minStrength, maxStrength, baseAngle, angleVariance);
  }

  update(ctx: any, renderDelta: number = 0.016, renderTime: number = 0): THREE.Vector2 {
    if (this.boundUniforms.length === 0) {
      this.bindMaterial(MATERIALS.hedge);
      this.bindMaterial(MATERIALS.grass);
      this.bindMaterial(MATERIALS.flower);
      this.bindMaterial(MATERIALS.wheat);
      this.bindMaterial(MATERIALS.treeFirNeedles);
      this.bindMaterial(MATERIALS.treeLeavesOak);
      this.bindMaterial(MATERIALS.treeLeavesBirch);
      this.bindMaterial(MATERIALS.treeTrunk);
      this.bindMaterial(MATERIALS.treeTrunkBirch);
      this.bindMaterial(MATERIALS.deadWood);
      this.bindMaterial(MATERIALS.treeSilhouette);
      this.bindMaterial(MATERIALS.sunflowerStem);
      this.bindMaterial(MATERIALS.sunflowerHead);
      this.bindMaterial(MATERIALS.sunflowerCenter);
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

    const lerpFactor = 1.0 - Math.exp(-0.6 * renderDelta);
    this.current.lerp(this.target, lerpFactor); this.direction.set(this.current.x, 0, this.current.y);
    this.strength = this.current.length();

    // Brutal iterations-loop för just DETTA WindSystem
    const timeSec = renderTime * 0.001; // renderTime is already small and synchronized
    const windX = this.current.x;
    const windY = this.current.y;

    const binds = this.boundUniforms;
    const len = binds.length;
    for (let i = 0; i < len; i++) {
      const b = binds[i];
      b.uTime.value = timeSec;
      b.uWind.value.x = windX;
      b.uWind.value.y = windY;
      
      // Update interactors
      for (let j = 0; j < 8; j++) {
        b.uInteractors.value[j].copy(this.currentInteractors[j]);
      }
    }

    return this.current;
  }

  public clear(): void {
    this.boundUniforms.length = 0;
    this.overrideActive = false;
  }

}