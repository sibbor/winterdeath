
import * as THREE from 'three';
import { SectorDef, SectorContext } from './types';
import { MATERIALS, GEOMETRY } from '../../utils/assets';
import { Sector1 } from './Sector1'; // Reuse Sector 1 assets partially?
import { SectorBuilder } from '../SectorGenerator';

export const Sector5: SectorDef = {
    id: 4,
    name: "maps.home_name",
    environment: { ...Sector1.environment, ambientIntensity: 0.05, fogDensity: 0.03 }, // Darker version of village
    // --- SPAWN POINTS ---
    playerSpawn: { x: 300, z: 220 }, // Start at the road entrance (reverse of Sector 1)
    familySpawn: { x: 0, z: 15, y: 1 }, // Pets inside the Villa
    bossSpawn: { x: 0, z: 15 }, // Boss at family location

    cinematic: {
        offset: { x: 15, y: 12, z: 15 },
        lookAtOffset: { x: 0, y: 1.5, z: 0 },
        rotationSpeed: 0.05
    },

    generate: (ctx: SectorContext) => {
        // Reuse Sector 1 geometry but maybe destroyed or darker?
        Sector1.generate(ctx);
        
        const { scene, triggers } = ctx;
        // Add more fire/destruction
        for(let i=0; i<20; i++) {
            const fire = new THREE.PointLight(0xff2200, 5, 20);
            fire.position.set((Math.random()-0.5)*100, 2, (Math.random()-0.5)*100);
            scene.add(fire);
        }
        
        // Remove the Sector 1 trigger for start tracks if present, to avoid confusion
        const trackTrig = ctx.triggers.find(t => t.id === 's1_start_tracks');
        if (trackTrig) trackTrig.triggered = true;

        // --- FIND PETS EVENT ---
        triggers.push({
            id: 'found_pets',
            position: { x: 0, z: 15 }, // Inside Villa
            radius: 8,
            type: 'EVENT',
            content: '',
            triggered: false,
            actions: [{ type: 'START_CINEMATIC' }]
        });

        SectorBuilder.visualizeTriggers(ctx);
    },

    onUpdate: (delta, now, playerPos, gameState, sectorState, events) => {
        Sector1.onUpdate(delta, now, playerPos, gameState, sectorState, events);
        
        // Finale Intensity
        if (Math.random() < 0.02 && gameState.enemies.length < 15) {
             const angle = Math.random() * Math.PI * 2;
             const dist = 30 + Math.random() * 20;
             const px = playerPos.x + Math.cos(angle) * dist;
             const pz = playerPos.z + Math.sin(angle) * dist;
             events.spawnZombie('TANK', new THREE.Vector3(px, 0, pz));
        }
    }
};
