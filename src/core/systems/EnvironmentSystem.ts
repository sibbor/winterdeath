
import * as THREE from 'three';

export const EnvironmentSystem = {
    update: (
        flickeringLights: { light: THREE.PointLight, baseInt: number, flickerRate: number }[]
    ) => {
        flickeringLights.forEach(fl => { 
            if (Math.random() < fl.flickerRate) { 
                fl.light.intensity = fl.baseInt * (0.5 + Math.random()); 
            } 
        });
    }
};