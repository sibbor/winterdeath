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
  // Cache materials directly to avoid frame-by-frame traversal
  private activeMaterials = new Set<THREE.ShaderMaterial>();

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

  /**
   * Registers an object's materials for wind animation.
   * Scans the object once and stores shader references.
   */
  register(obj: THREE.Object3D) {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
        this.activeMaterials.add(child.material);
      }
    });
  }

  /**
   * Unregisters an object to free up memory.
   */
  unregister(obj: THREE.Object3D) {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
        this.activeMaterials.delete(child.material);
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
    WindUniforms.update(MATERIALS.treeLeaves);
    WindUniforms.update(MATERIALS.treeLeavesOak);
    WindUniforms.update(MATERIALS.treeLeavesBirch);
    WindUniforms.update(MATERIALS.flower);
    WindUniforms.update(MATERIALS.snow);

    // 3. Batch update manually registered materials (Legacy/Custom)
    const timeSec = now / 1000.0;
    const windStrScaled = this.strength * 10;

    this.activeMaterials.forEach(mat => {
      if (mat.uniforms.time) mat.uniforms.time.value = timeSec;
      if (mat.uniforms.windStrength) mat.uniforms.windStrength.value = windStrScaled;
      if (mat.uniforms.windDirection) {
        mat.uniforms.windDirection.value.set(this.direction.x, this.direction.z);
      }
    });

    return this.current;
  }
}