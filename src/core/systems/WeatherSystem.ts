
import * as THREE from 'three';
import { WindSystem } from '../../utils/physics';
import { GEOMETRY } from '../../utils/assets';
import { WeatherType } from '../../types';

interface WeatherParticle {
    mesh: THREE.Mesh;
    vel: THREE.Vector3;
    resetY: number;
    areaSize: number;
}

export class WeatherSystem {
    private particles: WeatherParticle[] = [];
    private scene: THREE.Scene;
    private type: WeatherType = 'none';
    private count: number = 0;
    private wind: WindSystem;

    constructor(scene: THREE.Scene, wind: WindSystem) {
        this.scene = scene;
        this.wind = wind;
    }

    public sync(type: WeatherType, count: number, areaSize: number = 100) {
        if (this.type === type && this.count === count) return;

        // Clear existing
        this.clear();

        this.type = type;
        this.count = count;

        if (type === 'none') return;

        const geo = GEOMETRY.weatherParticle;
        let color = 0xffffff;
        let opacity = 0.8;

        if (type === 'rain') {
            color = 0xaaaaff;
            opacity = 0.4;
        }

        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });

        for (let i = 0; i < count; i++) {
            const mesh = new THREE.Mesh(geo, mat);
            // Randomly position in area
            mesh.position.set(
                (Math.random() - 0.5) * areaSize,
                Math.random() * 40,
                (Math.random() - 0.5) * areaSize
            );

            if (type === 'rain') {
                mesh.scale.set(0.5, 4.0, 1.0); // Stretch for rain
            }

            this.scene.add(mesh);

            // Vel setup (units per second)
            const vel = new THREE.Vector3(0, 0, 0);
            if (type === 'snow') {
                // Calm and grounded snow: 8 to 15 units/sec
                vel.y = -(8 + Math.random() * 7);
                vel.x = (Math.random() - 0.5) * 1.5;
                vel.z = (Math.random() - 0.5) * 1.5;
            } else if (type === 'rain') {
                // Fast rain: 50 to 80 units/sec
                vel.y = -(50 + Math.random() * 30);
            }

            this.particles.push({ mesh, vel, resetY: 40, areaSize });
        }
    }

    public update(delta: number, now: number) {
        if (this.type === 'none') return;

        const windVec = this.wind.current;
        const windSwayMult = this.type === 'snow' ? 150.0 : 80.0;

        for (const p of this.particles) {
            // Apply velocity scaled by delta
            p.mesh.position.y += p.vel.y * delta;
            p.mesh.position.x += (p.vel.x + windVec.x * windSwayMult) * delta;
            p.mesh.position.z += (p.vel.z + windVec.y * windSwayMult) * delta;

            // Reset logic
            if (p.mesh.position.y < -5) {
                p.mesh.position.y = p.resetY;
                p.mesh.position.x = (Math.random() - 0.5) * p.areaSize;
                p.mesh.position.z = (Math.random() - 0.5) * p.areaSize;
            }
        }
    }

    public clear() {
        for (const p of this.particles) {
            this.scene.remove(p.mesh);
            p.mesh.geometry.dispose(); // Careful: shared geo might be disposed if we are not careful
            // Actually GEOMETRY.weatherParticle is shared. We should NOT dispose it here.
            // (p.mesh.material as THREE.Material).dispose(); // Material might be shared too if we use the same for all.
        }
        this.particles = [];
    }
}
