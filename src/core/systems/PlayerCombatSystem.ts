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
    private laserSight: THREE.Mesh | null = null; // Cached reference to avoid .find()
    private initialized = false;

    constructor(private playerGroup: THREE.Group) { }

    init(session: GameSessionLogic) {
        if (this.initialized) return;
        this.initialized = true;

        const scene = session.engine.scene;

        // --- Create Reload Bar (Standard UI Geometry) ---
        const barGeo = new THREE.PlaneGeometry(1.5, 0.2);
        const bgMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, depthTest: false });
        const fgMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false });

        const reloadBg = new THREE.Mesh(barGeo, bgMat);
        const reloadFg = new THREE.Mesh(barGeo, fgMat);

        reloadBg.visible = reloadFg.visible = false;
        reloadBg.renderOrder = 999; // Ensure it draws on top
        reloadFg.renderOrder = 1000;

        scene.add(reloadBg);
        scene.add(reloadFg);
        this.reloadBar = { bg: reloadBg, fg: reloadFg };

        // --- Create Aim Crosshair (Reticle) ---
        const crossGroup = new THREE.Group();
        const aimRing = new THREE.Mesh(GEOMETRY.aimRing, MATERIALS.aimReticle);
        aimRing.rotation.x = -Math.PI / 2;
        crossGroup.add(aimRing);
        crossGroup.position.y = 0.5;
        crossGroup.visible = false;
        scene.add(crossGroup);
        this.aimCross = crossGroup;

        // --- Create Trajectory Line (Pre-allocated buffer for WeaponHandler) ---
        // Initialize with 21 points (20 segments) to avoid mid-game allocations
        const points = [];
        for (let i = 0; i <= 20; i++) points.push(new THREE.Vector3());

        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({
            color: 0xffaa00,
            transparent: true,
            opacity: 0.8,
            depthWrite: false
        });

        this.trajectoryLine = new THREE.Line(lineGeo, lineMat);
        this.trajectoryLine.visible = false;
        this.trajectoryLine.frustumCulled = false; // Always render if active
        scene.add(this.trajectoryLine);

        // --- Cache Laser Sight Reference ---
        this.laserSight = this.playerGroup.children.find(c => c.userData.isLaserSight) as THREE.Mesh || null;
    }

    update(session: GameSessionLogic, dt: number, now: number) {
        const state = session.state;
        const input = session.engine.input.state;
        const disableInput = session.inputDisabled;

        if (state.isDead) {
            if (this.laserSight) this.laserSight.visible = false;
            if (this.aimCross) this.aimCross.visible = false;
            if (this.trajectoryLine) this.trajectoryLine.visible = false;
            return;
        }

        // --- Weapon Slot Switching (Edge Triggered) ---
        if (!disableInput) {
            if (input['1'] && !this.prevInput['1']) WeaponHandler.handleSlotSwitch(state, state.loadout, '1');
            if (input['2'] && !this.prevInput['2']) WeaponHandler.handleSlotSwitch(state, state.loadout, '2');
            if (input['3'] && !this.prevInput['3']) WeaponHandler.handleSlotSwitch(state, state.loadout, '3');
            if (input['4'] && !this.prevInput['4']) WeaponHandler.handleSlotSwitch(state, state.loadout, '4');
        }

        // Store inputs for next frame's edge detection
        this.prevInput['1'] = input['1'];
        this.prevInput['2'] = input['2'];
        this.prevInput['3'] = input['3'];
        this.prevInput['4'] = input['4'];

        if (!disableInput) {
            // Process general weapon state (Reloading/Validation)
            WeaponHandler.handleInput(input, state, state.loadout, now, disableInput);

            // Update UI Bars
            if (this.reloadBar) {
                WeaponHandler.updateReloadBar(
                    this.reloadBar,
                    state,
                    this.playerGroup.position,
                    session.engine.camera.quaternion,
                    now
                );
            }

            // Handle Firing logic and visualization
            WeaponHandler.handleFiring(
                session.engine.scene,
                this.playerGroup,
                input,
                state,
                now,
                state.loadout,
                this.aimCross,
                this.trajectoryLine,
                session.debugMode
            );
        }

        // Sync Laser Sight visibility with state
        if (this.laserSight) {
            this.laserSight.visible = !state.isDead;
        }
    }

    cleanup(session: GameSessionLogic) {
        const scene = session.engine.scene;

        // Dispose Reload Bar
        if (this.reloadBar) {
            scene.remove(this.reloadBar.bg);
            scene.remove(this.reloadBar.fg);
            this.reloadBar.bg.geometry.dispose();
            (this.reloadBar.bg.material as THREE.Material).dispose();
            this.reloadBar.fg.geometry.dispose();
            (this.reloadBar.fg.material as THREE.Material).dispose();
        }

        // Dispose Reticle
        if (this.aimCross) {
            scene.remove(this.aimCross);
            this.aimCross.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    if (child.material instanceof THREE.Material) child.material.dispose();
                }
            });
        }

        // Dispose Trajectory Line
        if (this.trajectoryLine) {
            scene.remove(this.trajectoryLine);
            this.trajectoryLine.geometry.dispose();
            (this.trajectoryLine.material as THREE.Material).dispose();
        }

        this.initialized = false;
    }
}