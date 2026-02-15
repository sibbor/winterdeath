
import * as THREE from 'three';
import { WindSystem } from '../../core/systems/WindSystem';
import { WEATHER } from '../../content/constants';
import { GEOMETRY } from '../../utils/assets';
import { WeatherSystem } from '../../core/systems/WeatherSystem';
import { WeatherType } from '../../types';

interface Textures {
    stone: THREE.Texture;
    wood: THREE.Texture;
    halo: THREE.Texture;
}

export interface CampEffectsState {
    wind: WindSystem;
    particles: {
        flames: any[];
        sparkles: any[];
        smokes: any[];
    };
    starSystem: THREE.Points;
    fireLight: THREE.PointLight;
    weatherSystem: WeatherSystem;
}

export const CampEnvironment = {
    initEffects: (scene: THREE.Scene, textures: Textures, weatherType: WeatherType): CampEffectsState => {
        const wind = new WindSystem();
        const weatherSystem = new WeatherSystem(scene, wind);
        // Constrain weather to visible terrain area (60x60)
        weatherSystem.sync(weatherType, WEATHER.PARTICLE_COUNT, 60); // Reduced from 100

        const starSystem = CampEnvironment.setupSky(scene, textures);
        const fireLight = CampEnvironment.setupCampfire(scene, textures);

        return {
            wind,
            particles: { flames: [], sparkles: [], smokes: [] },
            starSystem,
            fireLight,
            weatherSystem
        };
    },


    setupSky: (scene: THREE.Scene, textures: Textures) => {
        // Moon
        const moonGeo = new THREE.SphereGeometry(15, 32, 32);
        const moonMat = new THREE.MeshBasicMaterial({ color: 0xffffeb, fog: false });
        const moon = new THREE.Mesh(moonGeo, moonMat);
        moon.position.set(-120, 80, -350);

        // Moon/Env Light - Ambient ONLY -> Now with SHADOWS
        const moonLight = new THREE.DirectionalLight(0xaaccff, 0.4);
        moonLight.position.set(-120, 80, -350); // Matches moon mesh position
        moonLight.castShadow = true;
        moonLight.shadow.mapSize.width = 1024;
        moonLight.shadow.mapSize.height = 1024;
        moonLight.shadow.camera.near = 0.5;
        moonLight.shadow.camera.far = 1000;
        moonLight.shadow.camera.left = -100;
        moonLight.shadow.camera.right = 100;
        moonLight.shadow.camera.top = 100;
        moonLight.shadow.camera.bottom = -100;
        moonLight.shadow.bias = -0.001;
        scene.add(moonLight);
        scene.add(moon);

        // Halo
        const haloSprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: textures.halo,
            color: 0xffffee,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending,
            fog: false,
            depthWrite: false
        }));
        haloSprite.scale.set(120, 120, 1);
        haloSprite.position.copy(moon.position);
        scene.add(haloSprite);

        // Stars (Reduced for performance - only visible area)
        const starCount = 1200; // Reduced from 3600
        const starGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const sizes = new Float32Array(starCount);
        const phases = new Float32Array(starCount);
        const twinkleSpeeds = new Float32Array(starCount);

        for (let i = 0; i < starCount; i++) {
            const r = 1800 + Math.random() * 200;
            const theta = Math.random() * Math.PI * 2;
            const phi = (Math.PI / 2) - Math.random() * 1.2;
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.cos(phi);
            positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
            sizes[i] = Math.random() > 0.95 ? 3.0 : (Math.random() > 0.85 ? 2.5 : 2.0);
            phases[i] = Math.random() * Math.PI * 2;
            twinkleSpeeds[i] = Math.random() > 0.9 ? 0.3 + Math.random() * 0.4 : 0.0;
        }
        starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        starGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        starGeo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
        starGeo.setAttribute('twinkleSpeed', new THREE.BufferAttribute(twinkleSpeeds, 1));

        const starMat = new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 } },
            vertexShader: `
                attribute float size; attribute float phase; attribute float twinkleSpeed; varying float vAlpha; uniform float uTime;
                void main() {
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
                    float alpha = 0.8 + 0.2 * sin(phase);
                    if (twinkleSpeed > 0.0) alpha = 0.9 + 0.1 * sin(uTime * twinkleSpeed + phase);
                    vAlpha = alpha; gl_PointSize = size * (2500.0 / -mvPosition.z);
                }
            `,
            fragmentShader: `varying float vAlpha; void main() { vec2 coord = gl_PointCoord - vec2(0.5); if(length(coord) > 0.5) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, vAlpha); }`,
            transparent: true, depthWrite: false,
        });
        const starSystem = new THREE.Points(starGeo, starMat);
        starSystem.rotation.z = 0.1;
        scene.add(starSystem);
        return starSystem;
    },

    setupCampfire: (scene: THREE.Scene, textures: Textures) => {
        // Fire Light - Radial Shadows (The "Feel")
        const fireLight = new THREE.PointLight(0xff7722, 40, 90);
        fireLight.position.set(0, 3, 0);
        fireLight.castShadow = true;
        fireLight.shadow.mapSize.width = 512;
        fireLight.shadow.mapSize.height = 512;
        fireLight.shadow.bias = -0.0005; // Reduced from -0.005 to fix the gap
        fireLight.shadow.normalBias = 0.02; // Added to help contact shadows
        scene.add(fireLight);

        // Static Geometry
        const fireGroup = new THREE.Group();
        const ash = new THREE.Mesh(new THREE.CircleGeometry(1.8, 16), new THREE.MeshStandardMaterial({ color: 0x111111 }));
        ash.rotation.x = -Math.PI / 2; ash.position.y = 0.02; fireGroup.add(ash);

        const stoneGeo = new THREE.DodecahedronGeometry(0.4);
        const stoneMat = new THREE.MeshStandardMaterial({ map: textures.stone, color: 0x888888, roughness: 0.9 });
        for (let i = 0; i < 15; i++) {
            const s = new THREE.Mesh(stoneGeo, stoneMat);
            const angle = (i / 15) * Math.PI * 2;
            s.position.set(Math.cos(angle) * 1.5, 0.15, Math.sin(angle) * 1.5);
            s.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

            fireGroup.add(s);
        }

        const logGeo = new THREE.CylinderGeometry(0.15, 0.15, 2.2);
        const logMat = new THREE.MeshStandardMaterial({ map: textures.wood, color: 0x5e3723 });
        for (let i = 0; i < 4; i++) {
            const log = new THREE.Mesh(logGeo, logMat);
            log.position.y = 0.25; log.rotation.z = Math.PI / 2; log.rotation.y = (i / 4) * Math.PI * 2 + Math.PI / 4;
            fireGroup.add(log);
        }
        scene.add(fireGroup);

        return fireLight;
    },

    updateEffects: (scene: THREE.Scene, state: CampEffectsState, delta: number, now: number, frame: number, flags?: { wind: boolean, weather: boolean, fx: boolean, lighting: boolean }) => {
        // Wind
        const wind = (flags && !flags.wind) ? { x: 0, y: 0 } : state.wind.update(now);

        // Update Stars
        if (state.starSystem) {
            state.starSystem.visible = !flags || flags.lighting !== false;
            if (state.starSystem.visible) {
                (state.starSystem.material as THREE.ShaderMaterial).uniforms.uTime.value = frame * 0.05;
                state.starSystem.rotateY(-0.00008);
            }
        }

        // Update Fire Light
        if (state.fireLight) {
            state.fireLight.visible = !flags || flags.lighting !== false;
            if (state.fireLight.visible) {
                state.fireLight.intensity = 35 + Math.sin(frame * 0.1) * 12 + Math.random() * 5;
            }
        }

        const { flames, sparkles, smokes } = state.particles;

        // SKIP FX IF DISABLED
        if (flags && flags.fx === false) {
            // Hide existing or just stop spawning? Let's hide/remove to be instant.
            flames.forEach(f => f.mesh.visible = false);
            sparkles.forEach(s => s.mesh.visible = false);
            smokes.forEach(s => s.mesh.visible = false);
            return;
        } else {
            flames.forEach(f => f.mesh.visible = true);
            sparkles.forEach(s => s.mesh.visible = true);
            smokes.forEach(s => s.mesh.visible = true);
        }

        // Flames
        if (frame % 4 === 0 && flames.length < 20) {
            const f = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6), new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.8 }));
            f.position.set((Math.random() - 0.5) * 1.5, 0.2, (Math.random() - 0.5) * 1.5);
            f.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            scene.add(f); flames.push({ mesh: f, life: 1.0, speed: 0.03 + Math.random() * 0.04 });
        }
        for (let i = flames.length - 1; i >= 0; i--) {
            const f = flames[i]; f.life -= 0.015; f.mesh.position.y += f.speed; f.mesh.position.x += wind.x; f.mesh.position.z += wind.y;
            f.mesh.scale.setScalar(f.life); f.mesh.material.opacity = f.life; f.mesh.rotation.y += 0.05;
            if (f.life <= 0) { scene.remove(f.mesh); flames.splice(i, 1); }
        }

        // Sparkles
        if (frame % 2 === 0 && sparkles.length < 30) {
            const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
            s.position.set((Math.random() - 0.5) * 1.0, 1.0, (Math.random() - 0.5) * 1.0);
            scene.add(s); sparkles.push({ mesh: s, life: 1, vy: 0.05 + Math.random() * 0.05, vx: (Math.random() - 0.5) * 0.02, vz: (Math.random() - 0.5) * 0.02 });
        }
        for (let i = sparkles.length - 1; i >= 0; i--) {
            const s = sparkles[i]; s.life -= 0.01; s.mesh.position.y += s.vy; s.mesh.position.x += s.vx + wind.x * 2.5; s.mesh.position.z += s.vz + wind.y * 2.5;
            if (s.life <= 0) { scene.remove(s.mesh); sparkles.splice(i, 1); }
        }

        // Smoke
        if (frame % 20 === 0 && smokes.length < 20) {
            const sm = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6), new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.3 }));
            sm.position.set((Math.random() - 0.5) * 0.5, 2.0, (Math.random() - 0.5) * 0.5);
            scene.add(sm); smokes.push({ mesh: sm, life: 1, speed: 0.02 });
        }
        for (let i = smokes.length - 1; i >= 0; i--) {
            const sm = smokes[i]; sm.life -= 0.005; sm.mesh.position.y += sm.speed; sm.mesh.scale.multiplyScalar(1.01); sm.mesh.position.x += wind.x * 1.5; sm.mesh.position.z += wind.y * 1.5; sm.mesh.material.opacity = sm.life * 0.3;
            if (sm.life <= 0) { scene.remove(sm.mesh); smokes.splice(i, 1); }
        }

        // Weather
        if (!flags || flags.weather !== false) {
            state.weatherSystem.update(delta, now);
        }
    }
};
