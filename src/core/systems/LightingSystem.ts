import * as THREE from 'three';

export const LightingSystem = {
    update: (
        flickeringLights: { light: THREE.PointLight, baseInt: number, flickerRate: number }[]
    ) => {
        // ZERO-GC: Använd en klassisk for-loop istället för .forEach
        for (let i = 0; i < flickeringLights.length; i++) {
            const fl = flickeringLights[i];

            // Om ljuset är dolt pga avstånd (intensity = 0), skippa uppdatering så vi inte tänder det av misstag
            if (fl.light.userData.isCulled) {
                continue;
            }

            // Slumpmässigt fladder baserat på flickerRate
            if (Math.random() < fl.flickerRate) {
                fl.light.intensity = fl.baseInt * (0.5 + Math.random());
            }
        }
    }
};