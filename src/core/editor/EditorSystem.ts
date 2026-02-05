import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Engine } from '../engine/Engine';
import { EditorObject, EditorPath, EditorSector, EditorPersistence } from '../../utils/editorPersistence';
import { ObjectGenerator } from '../world/ObjectGenerator';
import { PathGenerator } from '../world/PathGenerator';
import { ShapeGenerator } from '../world/ShapeGenerator';

export class EditorSystem {
    private engine: Engine;
    private scene: THREE.Scene;
    private raycaster: THREE.Raycaster;
    private mouse: THREE.Vector2;

    public currentSector: EditorSector;
    public selectedObjectId: string | null = null;
    public hoveredObjectId: string | null = null;
    public isEditMode: boolean = true;
    public currentTool: 'SELECT' | 'PLACE' | 'PATH' | 'SHAPE' | 'SPAWN_PLAYER' | 'SPAWN_FAMILY' | 'SPAWN_BOSS' = 'SELECT';
    public placementType: string = 'spruce';
    public currentPathType: EditorPath['type'] = 'ROAD';
    public currentPathWidth: number = 4;
    public snapToGrid: boolean = true;
    public gridSize: number = 2; // 2m grid

    private editorObjects: Map<string, THREE.Object3D> = new Map();
    private helpers: THREE.Group;
    private ghostObject: THREE.Object3D | null = null;
    private gridHelper: THREE.GridHelper;
    private selectionCircle: THREE.Mesh;
    private controls: OrbitControls;
    private ambientLight: THREE.AmbientLight;
    private sunLight: THREE.DirectionalLight;

    private currentPathPoints: THREE.Vector3[] = [];
    private pathLine: THREE.Line | null = null;
    private isDragging: boolean = false;
    private dragPlane: THREE.Plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    private dragIntersection: THREE.Vector3 = new THREE.Vector3();

    private boundMouseDown: any;
    private boundMouseMove: any;
    private boundKeyDown: any;

    constructor(engine: Engine) {
        this.engine = engine;

        // Create isolated editor scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x050510);
        this.scene.fog = new THREE.FogExp2(0x050510, 0.01);

        // Add lighting
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(this.ambientLight);

        this.sunLight = new THREE.DirectionalLight(0xaabbff, 1.0);
        this.sunLight.position.set(50, 100, 50);
        this.sunLight.castShadow = true;
        this.scene.add(this.sunLight);

        this.engine.pushScene(this.scene);

        this.controls = new OrbitControls(this.engine.camera, this.engine.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = false;
        this.controls.minDistance = 10;
        this.controls.maxDistance = 200;
        this.controls.maxPolarAngle = Math.PI / 2.1;
        this.controls.target.set(0, 0, 0);
        this.controls.update();

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.helpers = new THREE.Group();
        this.scene.add(this.helpers);

        // Ground Grid
        this.gridHelper = new THREE.GridHelper(200, 100, 0x444444, 0x222222);
        this.helpers.add(this.gridHelper);

        // Selection Marker
        const circleGeo = new THREE.RingGeometry(0.8, 1, 32);
        circleGeo.rotateX(-Math.PI / 2);
        this.selectionCircle = new THREE.Mesh(circleGeo, new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.5 }));
        this.selectionCircle.visible = false;
        this.helpers.add(this.selectionCircle);

        this.currentSector = {
            name: "New Sector",
            environment: {
                bgColor: 0x020208,
                fogDensity: 0.02,
                ambientIntensity: 0.6,
                groundColor: 0xddddff,
                weather: 'snow',
                weatherIntensity: 1.0,
                timeOfDay: 'night',
                sunIntensity: 0.5,
                moonIntensity: 0.6
            },
            objects: [],
            paths: [],
            spawns: {
                player: { x: 0, z: 0, rot: 0 },
                family: { x: 5, z: 5 },
                boss: { x: 20, z: 20 },
                zombies: []
            }
        };

        this.setupEvents();
    }

    public dispose() {
        this.engine.popScene();
        this.controls.dispose();
        window.removeEventListener('mousedown', this.boundMouseDown);
        window.removeEventListener('mousemove', this.boundMouseMove);
        window.removeEventListener('mouseup', this.boundMouseUp);
        window.removeEventListener('keydown', this.boundKeyDown);
    }

    private boundMouseUp: any;

    private setupEvents() {
        this.boundMouseDown = this.onMouseDown.bind(this);
        this.boundMouseMove = this.onMouseMove.bind(this);
        this.boundMouseUp = this.onMouseUp.bind(this);
        this.boundKeyDown = this.onKeyDown.bind(this);

        window.addEventListener('mousedown', this.boundMouseDown);
        window.addEventListener('mousemove', this.boundMouseMove);
        window.addEventListener('mouseup', this.boundMouseUp);
        window.addEventListener('keydown', this.boundKeyDown);
    }

    private onMouseMove(e: MouseEvent) {
        if (!this.isEditMode) return;
        this.updateMouse(e);
        this.updateGhost();

        // Hover Highlighting
        const objIntersect = this.getObjectIntersect();
        const nextHoverId = objIntersect ? objIntersect.object.userData.id : null;

        if (nextHoverId !== this.hoveredObjectId) {
            this.updateHighlight(this.hoveredObjectId, false);
            this.hoveredObjectId = nextHoverId;
            this.updateHighlight(this.hoveredObjectId, true);
        }

        if (this.isDragging && this.selectedObjectId) {
            const intersect = this.getGroundIntersect();
            if (intersect) {
                this.moveObject(this.selectedObjectId, intersect.point);
            }
        }
    }

    private onMouseDown(e: MouseEvent) {
        if (!this.isEditMode) return;
        if (e.button !== 0) return; // Only left click

        const intersect = this.getGroundIntersect();
        if (!intersect) return;

        if (this.currentTool === 'PLACE') {
            this.addObject(this.placementType, intersect.point);
        } else if (this.currentTool === 'SELECT') {
            const objIntersect = this.getObjectIntersect();
            if (objIntersect) {
                this.selectObject(objIntersect.object.userData.id);
                this.isDragging = true;
                this.controls.enabled = false; // Disable orbit controls while dragging
            } else {
                this.selectObject(null);
            }
        } else if (this.currentTool === 'PATH') {
            this.addPathPoint(intersect.point);
        } else if (this.currentTool === 'SHAPE') {
            this.addShapePoint(intersect.point);
        } else if (this.currentTool === 'SPAWN_PLAYER') {
            this.currentSector.spawns.player = { x: intersect.point.x, z: intersect.point.z, rot: 0 };
        } else if (this.currentTool === 'SPAWN_FAMILY') {
            this.currentSector.spawns.family = { x: intersect.point.x, z: intersect.point.z };
        } else if (this.currentTool === 'SPAWN_BOSS') {
            this.currentSector.spawns.boss = { x: intersect.point.x, z: intersect.point.z };
        }
    }

    private onMouseUp(e: MouseEvent) {
        this.isDragging = false;
        this.controls.enabled = true;
    }

    private onKeyDown(e: KeyboardEvent) {
        if (!this.isEditMode) return;
        if (e.key === 'Delete' && this.selectedObjectId) {
            this.deleteObject(this.selectedObjectId);
        }
        if (e.key === 'r' && this.selectedObjectId) {
            this.rotateObject(this.selectedObjectId, Math.PI / 4);
        }
        if (e.key === 'g') {
            this.snapToGrid = !this.snapToGrid;
        }
        if (e.key === 'v') { // Reset path
            this.finishPath();
        }
    }

    private updateMouse(e: MouseEvent) {
        const rect = this.engine.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    private getGroundIntersect() {
        this.raycaster.setFromCamera(this.mouse, this.engine.camera);
        // Intersect with invisible ground plane or just y=0
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const target = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(plane, target)) {
            return { point: target };
        }
        return null;
    }

    private getObjectIntersect() {
        this.raycaster.setFromCamera(this.mouse, this.engine.camera);
        const objects = Array.from(this.editorObjects.values());
        const intersects = this.raycaster.intersectObjects(objects, true);
        if (intersects.length > 0) {
            // Find the root object that has userData.id
            let current: THREE.Object3D | null = intersects[0].object;
            while (current && !current.userData.id) {
                current = current.parent;
            }
            return current ? { object: current } : null;
        }
        return null;
    }

    private updateGhost() {
        if (this.currentTool !== 'PLACE') {
            if (this.ghostObject) {
                this.scene.remove(this.ghostObject);
                this.ghostObject = null;
            }
            return;
        }

        const intersect = this.getGroundIntersect();
        if (!intersect) return;

        if (!this.ghostObject || this.ghostObject.userData.type !== this.placementType) {
            if (this.ghostObject) this.scene.remove(this.ghostObject);
            this.ghostObject = this.createVisualForType(this.placementType);
            if (this.ghostObject) {
                this.ghostObject.userData.type = this.placementType;
                this.scene.add(this.ghostObject);
                // Make ghost semi-transparent
                this.ghostObject.traverse((o) => {
                    if (o instanceof THREE.Mesh) {
                        o.material = o.material.clone();
                        o.material.transparent = true;
                        o.material.opacity = 0.5;
                    }
                });
            }
        }

        if (this.ghostObject) {
            let p = intersect.point.clone();
            if (this.snapToGrid) {
                p.x = Math.round(p.x / this.gridSize) * this.gridSize;
                p.z = Math.round(p.z / this.gridSize) * this.gridSize;
            }
            this.ghostObject.position.copy(p);
        }
    }

    public update(dt: number) {
        this.controls.update();

        // Selection indicator
        if (this.selectedObjectId) {
            const mesh = this.editorObjects.get(this.selectedObjectId);
            if (mesh) {
                this.selectionCircle.visible = true;
                this.selectionCircle.position.set(mesh.position.x, mesh.position.y + 0.1, mesh.position.z);
            }
        } else {
            this.selectionCircle.visible = false;
        }
    }

    private updateHighlight(id: string | null, active: boolean) {
        if (!id) return;
        const mesh = this.editorObjects.get(id);
        if (!mesh) return;

        mesh.traverse(child => {
            if (child instanceof THREE.Mesh) {
                if (active) {
                    (child as any)._oldEmissive = child.material.emissive?.clone();
                    child.material.emissive?.set(0x444466);
                } else if ((child as any)._oldEmissive) {
                    child.material.emissive?.copy((child as any)._oldEmissive);
                }
            }
        });
    }

    public addObject(type: string, pos: THREE.Vector3) {
        if (this.snapToGrid) {
            pos.x = Math.round(pos.x / this.gridSize) * this.gridSize;
            pos.z = Math.round(pos.z / this.gridSize) * this.gridSize;
        }

        const id = Math.random().toString(36).substr(2, 9);
        const objData: EditorObject = {
            id,
            type,
            position: { x: pos.x, y: pos.y, z: pos.z },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 }
        };

        this.currentSector.objects.push(objData);
        this.spawnObjectInScene(objData);
        this.selectObject(id);
        return id;
    }

    private createVisualForType(type: string, obj?: EditorObject): THREE.Object3D {
        if (type === 'SHAPE' && obj?.properties?.points) {
            return ShapeGenerator.createExtrudedPolygon(
                obj.properties.points.map((p: any) => new THREE.Vector2(p.x, p.y)),
                obj.properties.height || 4,
                obj.properties.thickness || 0.5,
                obj.properties.filled !== false,
                obj.properties.color || 0x888888
            );
        }
        switch (type) {
            case 'spruce': return ObjectGenerator.createTree('spruce');
            case 'pine': return ObjectGenerator.createTree('pine');
            case 'birch': return ObjectGenerator.createTree('birch');
            case 'rock': return ObjectGenerator.createRock(obj?.scale?.x || 1.0, obj?.properties?.radius || 1.0, obj?.properties?.segments || 6);
            case 'hedge': return ObjectGenerator.createHedge();
            case 'fence': return ObjectGenerator.createFence();
            case 'stonewall': return ObjectGenerator.createStoneWall();
            case 'standard_chest': return new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x8b4513 }));
            case 'big_chest': return new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1.2), new THREE.MeshStandardMaterial({ color: 0x8b4513 }));
            case 'car': return new THREE.Mesh(new THREE.BoxGeometry(4, 1.5, 2), new THREE.MeshStandardMaterial({ color: 0x666666 }));
            case 'lamp': return ObjectGenerator.createStreetLamp();
            case 'barrel': return ObjectGenerator.createBarrel(false);
            case 'explosive_barrel': return ObjectGenerator.createBarrel(true);
            case 'WallSection': return ObjectGenerator.createBuildingPiece('WallSection');
            case 'Corner': return ObjectGenerator.createBuildingPiece('Corner');
            case 'DoorFrame': return ObjectGenerator.createBuildingPiece('DoorFrame');
            case 'WindowFrame': return ObjectGenerator.createBuildingPiece('WindowFrame');
            case 'Floor': return ObjectGenerator.createBuildingPiece('Floor');
            case 'WALKER': return new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshStandardMaterial({ color: 0x55aa55 }));
            case 'RUNNER': return new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshStandardMaterial({ color: 0xaa5555 }));
            case 'TANK': return new THREE.Mesh(new THREE.SphereGeometry(1.0), new THREE.MeshStandardMaterial({ color: 0x333333 }));
            default:
                return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xff00ff }));
        }
    }

    private spawnObjectInScene(data: EditorObject) {
        const mesh = this.createVisualForType(data.type, data);
        mesh.position.set(data.position.x, data.position.y, data.position.z);
        mesh.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
        mesh.scale.set(data.scale.x, data.scale.y, data.scale.z);
        mesh.userData.id = data.id;

        // Add effects
        if (data.effects) {
            data.effects.forEach(eff => {
                const offset = eff.offset || { x: 0, y: 0, z: 0 };
                if (eff.type === 'light') {
                    const light = new THREE.PointLight(eff.color || 0xffaa00, eff.intensity || 1, 10);
                    light.position.set(offset.x, offset.y, offset.z);
                    mesh.add(light);
                } else if (eff.type === 'fire') {
                    // Visual placeholder for fire in editor
                    const fire = new THREE.Mesh(
                        new THREE.SphereGeometry(0.3),
                        new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff4400 })
                    );
                    fire.position.set(offset.x, offset.y, offset.z);
                    mesh.add(fire);
                }
            });
        }

        this.scene.add(mesh);
        this.editorObjects.set(data.id, mesh);
    }

    public selectObject(id: string | null) {
        this.selectedObjectId = id;
    }

    public deleteObject(id: string) {
        const mesh = this.editorObjects.get(id);
        if (mesh) {
            this.scene.remove(mesh);
            this.editorObjects.delete(id);
        }
        this.currentSector.objects = this.currentSector.objects.filter(o => o.id !== id);
        if (this.selectedObjectId === id) this.selectedObjectId = null;
    }

    public rotateObject(id: string, angle: number) {
        const mesh = this.editorObjects.get(id);
        const data = this.currentSector.objects.find(o => o.id === id);
        if (mesh && data) {
            mesh.rotation.y += angle;
            data.rotation.y = mesh.rotation.y;
        }
    }

    public moveObject(id: string, pos: THREE.Vector3) {
        const mesh = this.editorObjects.get(id);
        const data = this.currentSector.objects.find(o => o.id === id);
        if (mesh && data) {
            if (this.snapToGrid) {
                pos.x = Math.round(pos.x / this.gridSize) * this.gridSize;
                pos.z = Math.round(pos.z / this.gridSize) * this.gridSize;
            }
            mesh.position.set(pos.x, pos.y, pos.z);
            data.position.x = pos.x;
            data.position.y = pos.y;
            data.position.z = pos.z;
        }
    }

    public scaleObject(id: string, scale: number) {
        const mesh = this.editorObjects.get(id);
        const data = this.currentSector.objects.find(o => o.id === id);
        if (mesh && data) {
            mesh.scale.setScalar(scale);
            data.scale.x = scale;
            data.scale.y = scale;
            data.scale.z = scale;
        }
    }

    public addPathPoint(pos: THREE.Vector3) {
        if (this.snapToGrid) {
            pos.x = Math.round(pos.x / this.gridSize) * this.gridSize;
            pos.z = Math.round(pos.z / this.gridSize) * this.gridSize;
        }
        this.currentPathPoints.push(pos.clone());
        this.updatePathLine();
    }

    public addShapePoint(pos: THREE.Vector3) {
        if (this.snapToGrid) {
            pos.x = Math.round(pos.x / this.gridSize) * this.gridSize;
            pos.z = Math.round(pos.z / this.gridSize) * this.gridSize;
        }
        this.currentPathPoints.push(pos.clone());
        this.updatePathLine();
    }

    public finishShape() {
        if (this.currentPathPoints.length < 3) {
            this.currentPathPoints = [];
            this.updatePathLine();
            return;
        }

        const id = 'shape_' + Math.random().toString(36).substr(2, 9);
        const points2D = this.currentPathPoints.map(p => ({ x: p.x, y: p.z }));

        const newShape: EditorObject = {
            id,
            type: 'SHAPE',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            properties: {
                points: points2D,
                height: 4,
                thickness: 0.5,
                filled: true,
                color: 0x888888
            }
        };

        this.currentSector.objects.push(newShape);
        this.spawnObjectInScene(newShape);
        this.currentPathPoints = [];
        this.updatePathLine();
        this.selectObject(id);
    }

    private updatePathLine() {
        if (this.pathLine) {
            this.scene.remove(this.pathLine);
        }

        if (this.currentPathPoints.length < 2) return;

        const geometry = new THREE.BufferGeometry().setFromPoints(this.currentPathPoints);
        const material = new THREE.LineBasicMaterial({ color: 0xffff00 });
        this.pathLine = new THREE.Line(geometry, material);
        this.pathLine.position.y = 0.2;
        this.scene.add(this.pathLine);
    }

    public finishPath() {
        if (this.currentPathPoints.length >= 2) {
            const id = Math.random().toString(36).substr(2, 9);
            const pathData: EditorPath = {
                id,
                type: this.currentPathType,
                points: this.currentPathPoints.map(p => ({ x: p.x, y: p.y, z: p.z })),
                width: this.currentPathWidth
            };
            this.currentSector.paths.push(pathData);
        }
        this.currentPathPoints = [];
        this.updatePathLine();
    }

    public clearScene() {
        this.editorObjects.forEach(obj => this.scene.remove(obj));
        this.editorObjects.clear();
        this.currentSector.objects = [];
        this.currentSector.paths = [];
        this.selectedObjectId = null;
        if (this.pathLine) this.scene.remove(this.pathLine);
    }

    public save() {
        EditorPersistence.saveSector(this.currentSector);
    }

    public load(name: string) {
        const loaded = EditorPersistence.loadSector(name);
        if (loaded) {
            this.clearScene();
            this.currentSector = loaded;
            this.currentSector.objects.forEach(o => this.spawnObjectInScene(o));
            this.updateEnvironmentVisuals();
        }
    }

    public updateEnvironmentVisuals() {
        const env = this.currentSector.environment;

        // Update Scene properties
        this.scene.background = new THREE.Color(env.bgColor);
        if (this.scene.fog instanceof THREE.FogExp2) {
            this.scene.fog.color.set(env.bgColor);
            this.scene.fog.density = env.fogDensity;
        }

        // Update Lighting
        this.ambientLight.intensity = env.ambientIntensity;
        this.sunLight.intensity = env.sunIntensity || env.moonIntensity || 0.5;

        // Handle Day/Night logic roughly
        if (env.timeOfDay === 'night') {
            this.sunLight.color.set(0x6688ff); // Moonish
        } else {
            this.sunLight.color.set(0xfff5ee); // Sunnish
        }
    }
}
