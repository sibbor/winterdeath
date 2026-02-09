
import * as THREE from 'three';
import { WindSystem } from '../../utils/physics';
import { GEOMETRY } from '../../utils/assets';
import { WeatherType } from '../../types';

interface WeatherParticleData {
    pos: THREE.Vector3;
    vel: THREE.Vector3;
}

export class WeatherSystem {
    private instancedMesh: THREE.InstancedMesh | null = null;
    private particlesData: WeatherParticleData[] = [];
    private scene: THREE.Scene;
    private type: WeatherType = 'none';
    private count: number = 0;
    private areaSize: number = 100;
    private wind: WindSystem;
    private dummy = new THREE.Object3D();

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
        this.areaSize = areaSize;

        if (type === 'none' || count <= 0) return;

        const geo = GEOMETRY.weatherParticle;
        let color = 0xffffff;
        let opacity = 0.8;

        if (type === 'rain') {
            color = 0xaaaaff;
            opacity = 0.4;
        }

        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
        this.instancedMesh = new THREE.InstancedMesh(geo, mat, count);
        this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        this.particlesData = [];

        for (let i = 0; i < count; i++) {
            const pos = new THREE.Vector3(
                (Math.random() - 0.5) * areaSize,
                Math.random() * 40,
                (Math.random() - 0.5) * areaSize
            );

            const vel = new THREE.Vector3(0, 0, 0);
            if (type === 'snow') {
                vel.y = -(8 + Math.random() * 7);
                vel.x = (Math.random() - 0.5) * 1.5;
                vel.z = (Math.random() - 0.5) * 1.5;
            } else if (type === 'rain') {
                vel.y = -(50 + Math.random() * 30);
            }

            this.particlesData.push({ pos, vel });

            this.dummy.position.copy(pos);
            if (type === 'rain') {
                this.dummy.scale.set(0.5, 4.0, 1.0);
            } else {
                this.dummy.scale.set(1, 1, 1);
            }
            this.dummy.updateMatrix();
            this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
        }

        this.scene.add(this.instancedMesh);
    }

    public update(delta: number, now: number) {
        if (this.type === 'none' || !this.instancedMesh) return;

        const windVec = this.wind.current;
        const windSwayMult = this.type === 'snow' ? 150.0 : 80.0;

        for (let i = 0; i < this.count; i++) {
            const p = this.particlesData[i];

            // Apply velocity scaled by delta
            p.pos.y += p.vel.y * delta;
            p.pos.x += (p.vel.x + windVec.x * windSwayMult) * delta;
            p.pos.z += (p.vel.z + windVec.y * windSwayMult) * delta;

            // Reset logic
            if (p.pos.y < -5) {
                p.pos.y = 40;
                p.pos.x = (Math.random() - 0.5) * this.areaSize;
                p.pos.z = (Math.random() - 0.5) * this.areaSize;
            }

            this.dummy.position.copy(p.pos);
            if (this.type === 'rain') {
                this.dummy.scale.set(0.5, 4.0, 1.0);
            } else {
                this.dummy.scale.set(1, 1, 1);
            }
            this.dummy.updateMatrix();
            this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
        }
        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    public clear() {
        if (this.instancedMesh) {
            this.scene.remove(this.instancedMesh);
            if (this.instancedMesh.material instanceof THREE.Material) {
                this.instancedMesh.material.dispose();
            }
            this.instancedMesh.dispose();
            this.instancedMesh = null;
        }
        this.particlesData = [];
    }
}
