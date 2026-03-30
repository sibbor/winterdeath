import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { WeaponHandler } from './WeaponHandler';
import { GEOMETRY, MATERIALS } from '../utils/assets';

export class PlayerCombatSystem implements System {
    id = 'player_combat';

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
        const vertexCount = 42;
        const positions = new Float32Array(vertexCount * 3);
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const indicesCount = 20 * 6;
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
            depthTest: false,
            side: THREE.DoubleSide
        });

        this.trajectoryLine = new THREE.Mesh(lineGeo, lineMat);
        this.trajectoryLine.visible = false;
        this.trajectoryLine.frustumCulled = false;
        this.trajectoryLine.renderOrder = 999;
        scene.add(this.trajectoryLine);

        // --- Cache Laser Sight ---
        this.laserSight = this.playerGroup.children.find(c => c.userData.isLaserSight) as THREE.Mesh || null;
    }

    update(session: GameSessionLogic, dt: number, now: number) {
        if (!session.state) return;
        const state = session.state;
        const input = session.engine.input.state;

        // VINTERDÖD FIX: Kombinera sessionens input-lås med cinematic-läget
        const isLocked = session.inputDisabled || state.cinematicActive || state.isDead;

        // --- CINEMATIC & DEATH LOCK ---
        if (isLocked) {
            if (!this._wasLocked) {
                if (this.laserSight) this.laserSight.visible = false;
                if (this.aimCross) this.aimCross.visible = false;
                if (this.trajectoryLine) this.trajectoryLine.visible = false;

                // Nollställ inputs internt så man inte håller inne en trigger genom en cinematic
                input.fire = false;
                input.r = false;

                this._wasLocked = true;
            }
            return; // Spelaren får inte göra några combat-grejer alls
        }

        // Återställning när man vaknar upp / cinematic är över
        if (this._wasLocked) {
            if (this.laserSight) this.laserSight.visible = !state.activeVehicle;
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

        WeaponHandler.handleInput(input, state, state.loadout, now, false); // Skickar in false eftersom vi redan checkat isLocked ovan

        WeaponHandler.handleFiring(
            session,
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

        if (this.laserSight) {
            this.laserSight.visible = !state.activeVehicle;
        }
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
            if (this.trajectoryLine.geometry) this.trajectoryLine.geometry.dispose();
            if (this.trajectoryLine.material) (this.trajectoryLine.material as THREE.Material).dispose();
        }

        this.initialized = false;
    }
}