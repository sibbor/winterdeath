import * as THREE from 'three';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { WeaponHandler } from './WeaponHandler';
import { GEOMETRY, MATERIALS } from '../utils/assets';
import { PlayerStatusFlags } from '../entities/player/PlayerTypes';
import { System, SystemID } from './System';

export class PlayerCombatSystem implements System {
    readonly systemId = SystemID.PLAYER_COMBAT;
    id = 'player_combat';
    enabled = true;
    persistent = false;
    isFixedStep = true;

    private _p1: boolean = false;
    private _p2: boolean = false;
    private _p3: boolean = false;
    private _p4: boolean = false;
    private _p5: boolean = false;

    private _wasLocked: boolean = false;

    private aimCross: THREE.Group | null = null;
    private trajectoryLine: THREE.Mesh | null = null;
    private laserSight: THREE.Mesh | null = null;
    private initialized = false;

    constructor(private playerGroup: THREE.Group) { }

    init(session: GameSessionLogic) {
        if (this.initialized) return;
        this.initialized = true;

        const scene = session.engine.scene;

        // --- Create Aim Crosshair ---
        const crossGroup = new THREE.Group();
        const aimRing = new THREE.Mesh(GEOMETRY.aimRing, MATERIALS.aimReticle);
        aimRing.rotation.x = -Math.PI / 2;
        crossGroup.add(aimRing);
        crossGroup.position.y = 0.5;
        crossGroup.visible = false;
        scene.add(crossGroup);
        this.aimCross = crossGroup;

        // --- Create Trajectory Line ---
        this.trajectoryLine = new THREE.Mesh(GEOMETRY.trajectoryLine, MATERIALS.trajectoryLine);
        this.trajectoryLine.visible = false;
        this.trajectoryLine.frustumCulled = false;
        this.trajectoryLine.renderOrder = 999;
        scene.add(this.trajectoryLine);

        // --- Cache Laser Sight (Zero-GC Array Iteration) ---
        this.laserSight = null;
        const children = this.playerGroup.children;
        const len = children.length;
        for (let i = 0; i < len; i++) {
            if (children[i].userData.isLaserSight) {
                this.laserSight = children[i] as THREE.Mesh;
                break;
            }
        }
    }

    update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        if (!this.initialized) return;
        const state = session.state;
        const input = session.engine.input.state;

        // Combine session input lock with cinematic and death states
        const isLocked = session.inputDisabled || state.cinematicActive || (state.statusFlags & PlayerStatusFlags.DEAD) !== 0;

        // --- CINEMATIC & DEATH LOCK ---
        if (isLocked) {
            if (!this._wasLocked) {
                if (this.laserSight) this.laserSight.visible = false;
                if (this.aimCross) this.aimCross.visible = false;
                if (this.trajectoryLine) this.trajectoryLine.visible = false;

                // Reset inputs internally to prevent holding a trigger through a cinematic
                input.fire = false;
                input.r = false;

                this._wasLocked = true;
            }
            return; // Player cannot perform any combat actions
        }

        // Restore state when waking up or cinematic ends
        if (this._wasLocked) {
            this._wasLocked = false;
        }

        // --- Weapon Slot Switching ---
        if (input['1'] && !this._p1) WeaponHandler.handleSlotSwitch(state, state.loadout, '1');
        if (input['2'] && !this._p2) WeaponHandler.handleSlotSwitch(state, state.loadout, '2');
        if (input['3'] && !this._p3) WeaponHandler.handleSlotSwitch(state, state.loadout, '3');
        if (input['4'] && !this._p4) WeaponHandler.handleSlotSwitch(state, state.loadout, '4');
        if (input['5'] && !this._p5) WeaponHandler.handleSlotSwitch(state, state.loadout, '5');

        this._p1 = !!input['1'];
        this._p2 = !!input['2'];
        this._p3 = !!input['3'];
        this._p4 = !!input['4'];
        this._p5 = !!input['5'];

        WeaponHandler.handleInput(input, state, state.loadout, simTime, false);

        WeaponHandler.handleFiring(
            session,
            session.engine.scene,
            this.playerGroup,
            input,
            state,
            state.loadout,
            this.aimCross,
            this.trajectoryLine,
            delta,
            simTime,
            renderTime
        );

        // Visibility toggle based on vehicle state
        if (this.laserSight) this.laserSight.visible = !state.vehicle.active;
    }

    clear() {
        const engine = (window as any).WinterEngineInstance;
        const scene = engine?.scene;
        if (!scene) return;

        if (this.aimCross) {
            scene.remove(this.aimCross);
            const children = this.aimCross.children;
            for (let i = 0; i < children.length; i++) {
                const child = children[i] as THREE.Mesh;
                if (child.isMesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material && (child.material as THREE.Material).dispose) {
                        (child.material as THREE.Material).dispose();
                    }
                }
            }
        }

        if (this.trajectoryLine) {
            scene.remove(this.trajectoryLine);
        }

        this.initialized = false;
    }
}