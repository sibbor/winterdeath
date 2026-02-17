import * as THREE from 'three';
import { MATERIALS } from '../../utils/assets/materials';

interface WindBind {
  uTime: { value: number };
  uWind: { value: THREE.Vector2 };
}

export class WindSystem {
  public current = new THREE.Vector2(0, 0);
  public direction = new THREE.Vector3(0, 0, 0);
  public strength: number = 0;

  private target = new THREE.Vector2(0, 0);
  private nextChange: number = 0;
  private minStrength: number = 0.02;
  private maxStrength: number = 0.1;
  private baseAngle: number = 0.0;
  private angleVariance: number = Math.PI;

  private boundUniforms: WindBind[] = [];
  private overrideActive: boolean = false;

  constructor() { }

  /**
   * [VINTERDÖD] Safe binding. Checks if material and shader exist before pushing.
   */
  public bindMaterial(mat: THREE.Material | undefined) {
    // [VINTERDÖD] Safety check for undefined materials
    if (!mat) return;

    const shader = mat.userData.shader;
    if (shader && shader.uniforms.uTime && shader.uniforms.uWind) {
      // Check if already bound to avoid duplicates in the array
      for (let i = 0; i < this.boundUniforms.length; i++) {
        if (this.boundUniforms[i].uTime === shader.uniforms.uTime) return;
      }

      this.boundUniforms.push({
        uTime: shader.uniforms.uTime,
        uWind: shader.uniforms.uWind
      });
    }
  }

  setOverride(direction: number, strength: number) {
    this.overrideActive = true;
    this.target.set(Math.cos(direction), Math.sin(direction)).multiplyScalar(strength);
    this.strength = strength;
    this.current.copy(this.target);
    this.direction.set(this.current.x, 0, this.current.y).normalize();
  }

  setRandomBounds(minStrength: number, maxStrength: number, baseAngle: number = 0.0, angleVariance: number = Math.PI) {
    this.minStrength = minStrength;
    this.maxStrength = maxStrength;
    this.baseAngle = baseAngle;
    this.angleVariance = angleVariance;
    this.overrideActive = false;
  }

  update(now: number, deltaTime: number = 0.016): THREE.Vector2 {
    // [VINTERDÖD] Attempt to bind core materials if they aren't tracked yet.
    // We only do this check if the list is incomplete to save CPU cycles.
    if (this.boundUniforms.length < 6) {
      this.bindMaterial(MATERIALS.grass);
      this.bindMaterial(MATERIALS.treeFirNeedles);
      this.bindMaterial(MATERIALS.treeLeavesOak);
      this.bindMaterial(MATERIALS.treeLeavesBirch);
      this.bindMaterial(MATERIALS.flower);
      this.bindMaterial(MATERIALS.wheat);
    }

    if (!this.overrideActive && now > this.nextChange) {
      if (Math.random() > 0.4) {
        const angleOffset = (Math.random() * 2.0 - 1.0) * this.angleVariance;
        const angle = this.baseAngle + angleOffset;
        const range = this.maxStrength - this.minStrength;
        const strength = this.minStrength + Math.random() * range;
        this.target.set(Math.cos(angle) * strength, Math.sin(angle) * strength);
      } else {
        this.target.set(0, 0);
      }
      this.nextChange = now + 3000 + Math.random() * 5000;
    }

    this.current.lerp(this.target, 0.01);
    this.direction.set(this.current.x, 0, this.current.y);
    this.strength = this.current.length();

    // [VINTERDÖD] Zero-overhead uniform push.
    const timeSec = now * 0.001;
    const windX = this.current.x;
    const windY = this.current.y;

    const binds = this.boundUniforms;
    const len = binds.length;
    for (let i = 0; i < len; i++) {
      const b = binds[i];
      b.uTime.value = timeSec;
      b.uWind.value.x = windX;
      b.uWind.value.y = windY;
    }

    return this.current;
  }
}