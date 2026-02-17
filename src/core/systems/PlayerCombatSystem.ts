import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { WeaponHandler } from './WeaponHandler';
import { GEOMETRY, MATERIALS } from '../../utils/assets';

export class PlayerCombatSystem implements System {
    id = 'player_combat';

    private reloadBar: { bg: THREE.Mesh; fg: THREE.Mesh } | null = null;

    // [VINTERDÖD] Platta primitiver istället för Record<string, boolean>. Snabbare minnesåtkomst.
    private _p1: boolean = false;
    private _p2: boolean = false;
    private _p3: boolean = false;
    private _p4: boolean = false;
    private _p5: boolean = false;

    // [VINTERDÖD] State-diffing för död, hindrar per-frame uppdateringar till GPU
    private _wasDead: boolean = false;

    private aimCross: THREE.Group | null = null;
    private trajectoryLine: THREE.Mesh | null = null;
    private laserSight: THREE.Mesh | null = null;
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
        reloadBg.renderOrder = 999;
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
        const vertexCount = 42;
        const positions = new Float32Array(vertexCount * 3);
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        // [VINTERDÖD] Direkt allokering av typad array istället för dynamisk push() 
        const indicesCount = 20 * 6; // 20 quads * 6 indices
        const indices = new Uint16Array(indicesCount);
        let idx = 0;
        for (let i = 0; i < 20; i++) {
            const base = i * 2;
            indices[idx++] = base;
            indices[idx++] = base + 1;
            indices[idx++] = base + 2;

            indices[idx++] = base + 1;
            indices[idx++] = base + 3;
            indices[idx++] = base + 2;
        }
        lineGeo.setIndex(new THREE.BufferAttribute(indices, 1));

        const lineMat = new THREE.MeshBasicMaterial({
            color: 0x10b981,
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        this.trajectoryLine = new THREE.Mesh(lineGeo, lineMat);
        this.trajectoryLine.visible = false;
        this.trajectoryLine.frustumCulled = false;
        scene.add(this.trajectoryLine);

        // --- Cache Laser Sight Reference ---
        this.laserSight = this.playerGroup.children.find(c => c.userData.isLaserSight) as THREE.Mesh || null;
    }

    update(session: GameSessionLogic, dt: number, now: number) {
        const state = session.state;
        const input = session.engine.input.state;
        const disableInput = session.inputDisabled;

        if (state.isDead) {
            // [VINTERDÖD] Kör bara döljandet en enda gång när spelaren dör.
            if (!this._wasDead) {
                if (this.laserSight) this.laserSight.visible = false;
                if (this.aimCross) this.aimCross.visible = false;
                if (this.trajectoryLine) this.trajectoryLine.visible = false;
                if (this.reloadBar) {
                    this.reloadBar.bg.visible = false;
                    this.reloadBar.fg.visible = false;
                }
                this._wasDead = true;
            }
            return;
        }
        this._wasDead = false;

        // --- Weapon Slot Switching (Edge Triggered) ---
        if (!disableInput) {
            // [VINTERDÖD] Platta utvärderingar
            if (input['1'] && !this._p1) WeaponHandler.handleSlotSwitch(state, state.loadout, '1');
            if (input['2'] && !this._p2) WeaponHandler.handleSlotSwitch(state, state.loadout, '2');
            if (input['3'] && !this._p3) WeaponHandler.handleSlotSwitch(state, state.loadout, '3');
            if (input['4'] && !this._p4) WeaponHandler.handleSlotSwitch(state, state.loadout, '4');
            if (input['5'] && !this._p5) WeaponHandler.handleSlotSwitch(state, state.loadout, '5');
        }

        // Uppdatera input-cache med strikt konvertering till boolean
        this._p1 = !!input['1'];
        this._p2 = !!input['2'];
        this._p3 = !!input['3'];
        this._p4 = !!input['4'];
        this._p5 = !!input['5'];

        if (!disableInput) {
            WeaponHandler.handleInput(input, state, state.loadout, now, disableInput);

            if (this.reloadBar) {
                WeaponHandler.updateReloadBar(
                    this.reloadBar,
                    state,
                    this.playerGroup.position,
                    session.engine.camera.quaternion,
                    now
                );
            }

            WeaponHandler.handleFiring(
                session.engine.scene,
                this.playerGroup,
                input,
                state,
                dt,
                now,
                state.loadout,
                this.aimCross,
                this.trajectoryLine,
            );
        }

        // Sync Laser Sight visibility with state
        if (this.laserSight) {
            this.laserSight.visible = true; // Eftersom return hanterar döden ovan
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

        // Dispose Reticle [VINTERDÖD] Borttagen stängning (closure) i traverse. 
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

        // Dispose Trajectory Line
        if (this.trajectoryLine) {
            scene.remove(this.trajectoryLine);
            if (this.trajectoryLine.geometry) this.trajectoryLine.geometry.dispose();
            if (this.trajectoryLine.material) (this.trajectoryLine.material as THREE.Material).dispose();
        }

        this.initialized = false;
    }
}