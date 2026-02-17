import * as THREE from 'three';
import { MATERIALS, WindUniforms } from '../../utils/assets/materials';

/**
 * WindSystem manages global environment forces.
 * Optimized to update shader uniforms without expensive scene traversal.
 */
export class WindSystem {
  public current = new THREE.Vector2(0, 0);
  public direction = new THREE.Vector3(0, 0, 0);
  public strength: number = 0;

  private target = new THREE.Vector2(0, 0);
  private nextChange: number = 0;

  // [VINTERDÖD] Platt array för brutal iterationshastighet. Inget slött Set.
  private activeMaterials: THREE.ShaderMaterial[] = [];

  private overrideActive: boolean = false;

  constructor() { }

  /**
   * Sets a manual wind override.
   * @param direction Angle in radians (0-2PI)
   * @param strength Wind strength (0-5.0)
   */
  setOverride(direction: number, strength: number) {
    this.overrideActive = true;
    this.target.set(Math.cos(direction), Math.sin(direction)).multiplyScalar(strength);
    this.strength = strength;
    // Snap to target for immediate feedback
    this.current.copy(this.target);
    this.direction.set(this.current.x, 0, this.current.y).normalize();
  }

  clearOverride() {
    this.overrideActive = false;
  }

  setRandomized(active: boolean) {
    this.overrideActive = !active;
  }

  isRandomized(): boolean {
    return !this.overrideActive;
  }

  /**
   * Registers an object's materials for wind animation.
   * Scans the object once and stores shader references.
   */
  register(obj: THREE.Object3D) {
    obj.traverse((child: any) => {
      // [VINTERDÖD] Snabba flaggor (.isMesh, .isShaderMaterial) istället för instanceof-prototypklättring
      if (child.isMesh && child.material && child.material.isShaderMaterial) {
        if (this.activeMaterials.indexOf(child.material) === -1) {
          this.activeMaterials.push(child.material);
        }
      }
    });
  }

  /**
   * Unregisters an object to free up memory.
   */
  unregister(obj: THREE.Object3D) {
    obj.traverse((child: any) => {
      if (child.isMesh && child.material && child.material.isShaderMaterial) {
        const idx = this.activeMaterials.indexOf(child.material);
        if (idx !== -1) {
          // [VINTERDÖD] Swap-and-Pop. O(1) borttagning utan minnesallokering eller array-skiftning (.splice).
          const lastIdx = this.activeMaterials.length - 1;
          this.activeMaterials[idx] = this.activeMaterials[lastIdx];
          this.activeMaterials.pop();
        }
      }
    });
  }

  /**
   * Updates wind state and pushes data to GPU uniforms.
   */
  update(now: number, deltaTime: number = 0.016): THREE.Vector2 {
    if (!this.overrideActive && now > this.nextChange) {
      if (Math.random() > 0.4) {
        const angle = Math.random() * Math.PI * 2;
        // Increased Strength: 0.1 to 0.8 (was 0.003 to 0.015)
        const strength = 0.1 + Math.random() * 0.7;
        this.target.set(Math.cos(angle) * strength, Math.sin(angle) * strength);
      } else {
        this.target.set(0, 0);
      }
      this.nextChange = now + 3000 + Math.random() * 5000;
    }

    // Smooth interpolation
    this.current.lerp(this.target, 0.01);
    this.direction.set(this.current.x, 0, this.current.y);
    this.strength = this.current.length();

    // 1. Update Global Wind Uniforms
    WindUniforms.time = now * 0.001;
    WindUniforms.wind.copy(this.current);

    // 2. Update Shared Materials (Vegetation)
    WindUniforms.update(MATERIALS.grass);
    WindUniforms.update(MATERIALS.treeFirNeedles);
    WindUniforms.update(MATERIALS.treeLeavesOak);
    WindUniforms.update(MATERIALS.treeLeavesBirch);
    WindUniforms.update(MATERIALS.flower);
    WindUniforms.update(MATERIALS.wheat);
    WindUniforms.update(MATERIALS.snow);

    // 3. Batch update manually registered materials (Legacy/Custom)
    const timeSec = now / 1000.0;
    const windStrScaled = this.strength * 10;

    // Cache riktningsvärden för att undvika onödig uppslagning i loopen
    const dirX = this.direction.x;
    const dirZ = this.direction.z;

    // [VINTERDÖD] Platt iteration. Inga callbacks, inga .forEach-kontexter.
    const mats = this.activeMaterials;
    const len = mats.length;
    for (let i = 0; i < len; i++) {
      const uniforms = mats[i].uniforms;

      if (uniforms.time) uniforms.time.value = timeSec;
      if (uniforms.windStrength) uniforms.windStrength.value = windStrScaled;
      if (uniforms.windDirection) {
        // [VINTERDÖD] Direkt mutation av värden (ingen funktions-overhead från .set())
        uniforms.windDirection.value.x = dirX;
        uniforms.windDirection.value.y = dirZ;
      }
    }

    return this.current;
  }
}