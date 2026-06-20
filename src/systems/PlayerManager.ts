import * as THREE from 'three';
import type React from 'react';
import { System, SystemID } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { PlayerAnimator } from '../entities/player/PlayerAnimator';
import { VehicleManager } from './VehicleManager';
import { audioEngine } from '../utils/audio/AudioEngine';
import { SoundID } from '../utils/audio/AudioTypes';
import { FXParticleType } from '../types/FXTypes';
import { StatID, PlayerStatusFlags } from '../types/CareerStats';
import { PlayerDeathState, DamageID } from '../entities/player/CombatTypes';
import { StatusEffectID } from '../types/StatusEffects';
import { GameCanvasProps } from '../types/CanvasTypes';

export class PlayerManager implements System {
    readonly systemId = SystemID.PLAYER_MANAGER;
    id = 'player_manager';
    enabled = true;
    persistent = false;
    isFixedStep = false; // Runs at variable render rates for visual animation smoothness

    private lastTeleportTimestamp = 0;
    private animStateScratch: any = {};

    constructor(
        private playerGroup: THREE.Group,
        private playerMeshRef: React.MutableRefObject<THREE.Group | null>,
        private refs: any,
        private propsRef: React.MutableRefObject<GameCanvasProps>
    ) { }

    init(session: GameSessionLogic) {
        this.lastTeleportTimestamp = this.refs.lastTeleportRef?.current || 0;
    }

    update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        if (!session || !session.state) return;

        // --- 1. ZERO-GC TELEPORTATION GATING (Candidate D) ---
        const props = this.propsRef.current;
        if (props && props.teleportTarget && props.teleportTarget.timestamp > this.lastTeleportTimestamp) {
            const state = session.state;
            const isCinematic = state.ui.cinematicActive;
            const isBossIntro = this.refs.bossIntroRef?.current?.active || false;
            const isDead = (state.combat.statusFlags & PlayerStatusFlags.DEAD) !== 0;
            const isTeleportDisabled = state.sectorState?.isTeleportDisabled || false;

            if (!isCinematic && !isBossIntro && !isDead && !isTeleportDisabled) {
                this.teleportTo(session, props.teleportTarget.x, props.teleportTarget.z, props.teleportTarget.timestamp);
            }
        }

        // --- 2. PROCEDURAL ANIMATION POSES (Candidate E) ---
        const playerMesh = this.playerMeshRef.current;
        if (playerMesh) {
            const state = session.state;
            const sb = state.player.statsBuffer;
            const sf = state.combat.statusFlags;

            this.animStateScratch.staminaRatio = sb[StatID.STAMINA] / sb[StatID.MAX_STAMINA];
            this.animStateScratch.isMoving = state.player.isMoving;
            this.animStateScratch.isRushing = (sf & PlayerStatusFlags.RUSHING) !== 0;
            this.animStateScratch.isDodging = (sf & PlayerStatusFlags.DODGING) !== 0;
            this.animStateScratch.dodgeStartTime = state.player.dodgeStartTime;
            this.animStateScratch.isSpeaking = state.player.speakBounce > 0 || simTime < state.player.speakingUntil;
            this.animStateScratch.isThinking = simTime < state.player.thinkingUntil;
            this.animStateScratch.isIdleLong = (simTime - state.player.lastActionTime > 20000);
            this.animStateScratch.isWading = state.player.isWading;
            this.animStateScratch.isSwimming = state.player.isSwimming;
            this.animStateScratch.isDead = (sf & PlayerStatusFlags.DEAD) !== 0;
            this.animStateScratch.deathStartTime = state.player.deathStartTime;
            this.animStateScratch.isBurning = state.combat.effectDurations[StatusEffectID.BURNING] > 0;
            this.animStateScratch.isBurningDead = state.player.deathState === PlayerDeathState.BURNED;
            this.animStateScratch.isElectrocuted = state.player.deathState === PlayerDeathState.ELECTROCUTED;
            this.animStateScratch.isBiting = state.player.killerSource === DamageID.BITE;
            this.animStateScratch.renderTime = state.renderTime;
            this.animStateScratch.simTime = state.simTime;
            this.animStateScratch.currentSpeedRatio = state.player.currentSpeedRatio;
            this.animStateScratch.seed = 0;
            this.animStateScratch.nodes = state.player.nodes;
            this.animStateScratch.baseScale = state.player.baseScale;
            this.animStateScratch.baseY = state.player.baseY;

            PlayerAnimator.update(playerMesh, this.animStateScratch, renderTime, delta);
        }
    }

    public teleportTo(session: GameSessionLogic, x: number, z: number, timestamp: number) {
        const state = session.state;

        // 1. Exit vehicle decoupling checks
        if (state.vehicle.active && state.vehicle.mesh) {
            const vehicleMesh = state.vehicle.mesh;
            const def = vehicleMesh.userData.vehicleDef;
            VehicleManager.exitVehicle(this.playerGroup, vehicleMesh, state, def);
        }

        // 2. Set player coordinates
        this.playerGroup.position.set(x, 0, z);

        // 3. Spawn arrival visuals & audio triggers
        if (session.callbacks?.spawnParticle) {
            session.callbacks.spawnParticle(x, 1, z, FXParticleType.FLASH, 1, undefined, undefined, undefined, 2);
        }
        audioEngine.playSound(SoundID.UI_CHIME);

        // 4. Move accompanying family followers
        const activeFamilyMembers = this.refs.activeFamilyMembers?.current;
        if (activeFamilyMembers) {
            for (let i = 0; i < activeFamilyMembers.length; i++) {
                const fm = activeFamilyMembers[i];
                if (fm.mesh && fm.following) {
                    const offX = (Math.random() - 0.5) * 3;
                    const offZ = (Math.random() - 0.5) * 3;
                    fm.mesh.position.set(x + offX, 0, z + offZ);
                    if (session.callbacks?.spawnParticle) {
                        session.callbacks.spawnParticle(x + offX, 1, z + offZ, FXParticleType.SMOKE, 10);
                    }
                }
            }
        }

        // 5. Update timestamp references & sync camera
        this.lastTeleportTimestamp = timestamp;
        if (this.refs.lastTeleportRef) {
            this.refs.lastTeleportRef.current = timestamp;
        }

        const cameraOffsetZ = this.propsRef.current.currentSectorData?.environment.cameraOffsetZ || 0;
        session.engine.camera.setPosition(x, 50, z + cameraOffsetZ, true);
        session.engine.camera.lookAt(this.playerGroup.position, true);

        if (this.refs.prevPosRef?.current) {
            this.refs.prevPosRef.current.copy(this.playerGroup.position);
        }
    }

    clear() {
        this.animStateScratch = {};
    }
}