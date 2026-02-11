
import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { WeaponHandler } from './WeaponHandler';
import { GEOMETRY, MATERIALS } from '../../utils/assets';

export class PlayerCombatSystem implements System {
    id = 'player_combat';

    private reloadBar: { bg: THREE.Mesh; fg: THREE.Mesh } | null = null;
    private prevInput: Record<string, boolean> = {};
    private aimCross: THREE.Group | null = null;
    private trajectoryLine: THREE.Line | null = null;
    private initialized = false;

    constructor(private playerGroup: THREE.Group) { }

    init(session: GameSessionLogic) {
        if (this.initialized) return;
        this.initialized = true;

        const scene = session.engine.scene;

        // --- Create Reload Bar ---
        const reloadBg = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.2), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, depthTest: false }));
        reloadBg.visible = false;
        scene.add(reloadBg);

        const reloadFg = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false }));
        reloadFg.visible = false;
        scene.add(reloadFg);

        this.reloadBar = { bg: reloadBg, fg: reloadFg };

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
        const lineGeo = new THREE.BufferGeometry().setFromPoints(new Array(20).fill(new THREE.Vector3()));
        const lineMat = new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.8, depthWrite: false });
        this.trajectoryLine = new THREE.Line(lineGeo, lineMat);
        this.trajectoryLine.visible = false;
        this.trajectoryLine.frustumCulled = false;
        scene.add(this.trajectoryLine);
    }

    update(session: GameSessionLogic, dt: number, now: number) {
        const state = session.state;
        const input = session.engine.input.state;
        const disableInput = session.inputDisabled; // Using the added flag

        // --- Weapon Switching ---
        if (!state.isDead && !disableInput) {
            if (input['1'] && !this.prevInput['1']) WeaponHandler.handleSlotSwitch(state, state.loadout, '1');
            if (input['2'] && !this.prevInput['2']) WeaponHandler.handleSlotSwitch(state, state.loadout, '2');
            if (input['3'] && !this.prevInput['3']) WeaponHandler.handleSlotSwitch(state, state.loadout, '3');
            if (input['4'] && !this.prevInput['4']) WeaponHandler.handleSlotSwitch(state, state.loadout, '4');
        }

        // Update prevInput
        this.prevInput['1'] = input['1'];
        this.prevInput['2'] = input['2'];
        this.prevInput['3'] = input['3'];
        this.prevInput['4'] = input['4'];

        if (!disableInput) {
            // Note: handleInput handles R (Reload) logic internally if passed correct input object
            // InputState has 'r' and 'fire'.
            WeaponHandler.handleInput(
                input,
                state,
                state.loadout,
                now,
                disableInput
            );

            if (this.reloadBar) {
                WeaponHandler.updateReloadBar(
                    this.reloadBar,
                    state,
                    this.playerGroup.position,
                    session.engine.camera.quaternion,
                    now
                );
            }
        }

        // Laser sight automatically follows player rotation (attached to playerGroup)
        // Just hide it when dead
        const laserSight = this.playerGroup.children.find(c => c.userData.isLaserSight) as THREE.Mesh;
        if (laserSight) {
            laserSight.visible = !state.isDead;
        }

        // --- Firing ---
        if (!disableInput) {
            WeaponHandler.handleFiring(
                session.engine.scene,
                this.playerGroup,
                input,
                state,
                now,
                state.loadout,
                this.aimCross,
                this.trajectoryLine,
                session.debugMode // Using session debugMode
            );
        }
    }

    cleanup(session: GameSessionLogic) {
        const scene = session.engine.scene;
        if (this.reloadBar) {
            scene.remove(this.reloadBar.bg);
            scene.remove(this.reloadBar.fg);
            // dispose geometries/materials if needed, but they seem shared or simple
        }
        if (this.aimCross) {
            scene.remove(this.aimCross);
        }
        if (this.trajectoryLine) {
            scene.remove(this.trajectoryLine);
        }
    }
}
