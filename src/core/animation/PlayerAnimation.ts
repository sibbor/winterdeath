
import * as THREE from 'three';

export interface AnimState {
    // Movement
    isMoving: boolean;
    isRushing: boolean;
    isRolling: boolean;
    rollStartTime: number;
    
    // Status
    staminaRatio: number; // 0 to 1 (1 = full)
    isDead?: boolean;
    deathStartTime?: number;
    
    // Actions
    isSpeaking: boolean; // Derived from speakBounce > 0 or external flag
    isThinking: boolean; // New Trigger state
    
    // Idle
    isIdleLong: boolean; // > 20s inactive
    
    // Seed for random idle behaviors to desync characters
    seed: number;
}

export const PlayerAnimation = {
    update: (
        mesh: THREE.Mesh, 
        animState: AnimState, 
        now: number, 
        delta: number
    ) => {
        if (!mesh) return;

        // --- 1. Base Variables ---
        let scaleY = 1.0; 
        let scaleXZ = 1.0; 
        let rotationX = 0; 
        let rotationY = 0;
        let rotationZ = 0;
        let positionY = 0; // Offset from base height

        const breatheSpeed = 0.003 + ((1.0 - animState.staminaRatio) * 0.012); 
        const breatheAmp = 0.02 + ((1.0 - animState.staminaRatio) * 0.06); 

        // --- 2. State Machine (Priority Order) ---

        if (animState.isDead) {
            // --- DYING / DEAD ---
            // Faster death animation (350ms)
            const deathDuration = 350;
            const progress = Math.min(1, Math.max(0, (now - (animState.deathStartTime || now)) / deathDuration));
            
            // Fall over backwards
            rotationX = -Math.PI / 2 * progress;
            // Lower to ground - Sink slightly deeper (-0.8) to look like lying IN snow/mud, not floating on it
            positionY = -0.8 * progress;
            
        } else if (animState.isRolling) {
            // --- ROLLING (Highest Priority) ---
            const progress = (now - animState.rollStartTime) / 300; 
            rotationX = progress * Math.PI * 2; 
            const squashFactor = Math.sin(progress * Math.PI); 
            scaleY = 1.0 - (squashFactor * 0.4); 
            scaleXZ = 1.0 + (squashFactor * 0.4);
            positionY = 0.2; // Lift slightly

        } else if (animState.isMoving) {
            // --- MOVING ---
            const moveSpeed = animState.isRushing ? 0.020 : 0.012; 
            const bob = Math.sin(now * moveSpeed);
            const rushFactor = animState.isRushing ? 2.0 : 1.0; 
            
            rotationX = animState.isRushing ? 0.4 : 0.2; // Lean forward
            scaleY = 1.0 + (Math.abs(bob) * 0.1 * rushFactor); 
            scaleXZ = 1.0 - (Math.abs(bob) * 0.05 * rushFactor);
            
            // Subtle Z tilt based on stride
            rotationZ = Math.cos(now * moveSpeed) * 0.05;

        } else {
            // --- STATIONARY (Idle / Breathe / Think / Speak) ---
            
            // A. Breathing (Always active when stationary)
            const breathe = Math.sin(now * breatheSpeed + animState.seed);
            scaleY = 1.0 + (breathe * breatheAmp); 
            scaleXZ = 1.0 - (breathe * (breatheAmp * 0.5));

            // B. Speaking (Overrides body shape)
            if (animState.isSpeaking) {
                const talkWobble = Math.sin(now * 0.03) * 0.1; 
                scaleY += talkWobble + 0.1; // Stretch up
                scaleXZ -= talkWobble * 0.5;
            }

            // C. Thinking (Head/Body Nod)
            if (animState.isThinking) {
                // Slow, pensive nod
                const nod = Math.sin(now * 0.008);
                rotationX = 0.3 + (nod * 0.1); // Look down slightly and nod
                rotationZ = Math.sin(now * 0.003) * 0.1; // Slight head tilt
            }

            // D. Long Idle (Random Fidgeting)
            if (animState.isIdleLong && !animState.isSpeaking && !animState.isThinking) {
                // Use multiple sine waves with prime periods to create non-repeating chaos
                const t = now * 0.001;
                
                // 1. Look Around (Y Rotation) - REMOVED per user request
                // rotationY = Math.sin(t * 0.5 + animState.seed) * 0.5;
                
                // 2. Look Up/Down (X Rotation) - Occasional
                const lookUpTrigger = Math.sin(t * 0.3 + animState.seed * 2);
                if (lookUpTrigger > 0.8) rotationX = -0.4; // Look up at sky
                else if (lookUpTrigger < -0.8) rotationX = 0.3; // Look at feet

                // 3. Shiver/Shake (Z Rotation) - Fast jitter
                const shiverTrigger = Math.sin(t * 0.1 + animState.seed);
                if (shiverTrigger > 0.9) {
                    rotationZ = Math.sin(now * 0.5) * 0.05;
                }

                // 4. Little Hop (Position Y) - Rare
                const hopTrigger = Math.sin(t * 0.7 + animState.seed * 3);
                if (hopTrigger > 0.98) {
                    positionY = Math.abs(Math.sin(now * 0.02)) * 0.5;
                    scaleY += 0.2;
                    scaleXZ -= 0.1;
                }
            }
        }

        // --- 3. Apply Transforms ---
        // Retreive baseScale from userData, defaulting to 1.0 if not set
        const baseScale = mesh.userData.baseScale || 1.0;
        
        mesh.scale.set(scaleXZ * baseScale, scaleY * baseScale, scaleXZ * baseScale); 
        mesh.rotation.x = rotationX; 
        mesh.rotation.y = rotationY;
        mesh.rotation.z = rotationZ;
        
        // Pivot adjustment (Model pivot is usually center, so we offset Y based on scale to keep feet on ground)
        // Base body center is usually at Y=1.0 (for player/humans).
        // Ensure we use the original baseHeight stored in userData if available, scaled by the current animation scaleY.
        const baseHeight = mesh.userData.baseY || 1.0;
        
        mesh.position.y = (baseHeight * scaleY) + positionY;
    }
};
