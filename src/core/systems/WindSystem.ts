import * as THREE from 'three';

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

  constructor() { }

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
    if (now > this.nextChange) {
      if (Math.random() > 0.4) {
        const angle = Math.random() * Math.PI * 2;
        const strength = 0.003 + Math.random() * 0.015;
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

    // Batch update all registered materials
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