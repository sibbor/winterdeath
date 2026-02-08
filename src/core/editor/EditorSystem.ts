import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Engine } from '../engine/Engine';
import { EditorObject, EditorPath, EditorSector, EditorPersistence } from '../../utils/editorPersistence';
import { ObjectGenerator } from '../world/ObjectGenerator';
import { PathGenerator } from '../world/PathGenerator';
import { ShapeGenerator } from '../world/ShapeGenerator';
import { CharacterModels } from '../../utils/assets/models/characters';

export class EditorSystem {
    private engine: Engine;
    private scene: THREE.Scene;
    private raycaster: THREE.Raycaster;
    private mouse: THREE.Vector2;

    public currentSector: EditorSector;
    public selectedObjectId: string | null = null;
    public hoveredObjectId: string | null = null;
    public draggingObjectId: string | null = null;
    public draggingHandleIndex: number | null = null;
    public isDragging: boolean = false;
    public lastDragPoint: THREE.Vector3 | null = null;
    public lastMousePos: { x: number, y: number } = { x: 0, y: 0 };

    // Ghost object for placement
    public ghostMesh: THREE.Object3D | null = null;
    public prePlacementObject: {
        rotation: { x: number, y: number, z: number },
        scale: { x: number, y: number, z: number },
        properties: Record<string, any>
    } = {
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            properties: {}
        };
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
    private dragPlane: THREE.Plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    private dragIntersection: THREE.Vector3 = new THREE.Vector3();
    private lastIntersect: THREE.Vector3 | null = null;
    private spawnMarkers: THREE.Group = new THREE.Group();
    private vertexHandles: THREE.Group = new THREE.Group();
    public isPlaying: boolean = false;
    private outlines: Map<string, THREE.LineSegments>
    private outlineGroup: THREE.Group;
    private playerCharacter: THREE.Group | null = null;
    private groundMesh: THREE.Mesh;
    private weatherParticles: THREE.Group;
    public onChange: (() => void) | null = null;

    private boundMouseDown: any;
    private boundMouseMove: any;
    private boundKeyDown: any;
    private camera: THREE.Camera; // Added for clarity, assuming engine.camera is used

    constructor(engine: Engine) {
        this.engine = engine;
        this.camera = engine.camera; // Initialize camera

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

        this.outlineGroup = new THREE.Group();
        this.scene.add(this.outlineGroup);

        // Ground Mesh
        const groundGeo = new THREE.PlaneGeometry(1000, 1000);
        groundGeo.rotateX(-Math.PI / 2);
        this.groundMesh = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: 0xddddff, roughness: 1.0 }));
        this.groundMesh.receiveShadow = true;
        this.groundMesh.position.y = -0.05; // Slightly below grid
        this.scene.add(this.groundMesh);

        // Weather Group
        this.weatherParticles = new THREE.Group();
        this.scene.add(this.weatherParticles);

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

        this.spawnMarkers = new THREE.Group();
        this.scene.add(this.spawnMarkers);
        this.scene.add(this.vertexHandles);

        this.updateSpawnMarkers();

        this.setupEvents();
    }

    public setTool(tool: EditorSystem['currentTool']) {
        this.currentTool = tool;
        this.selectObject(null);
        this.currentPathPoints = [];
        this.updatePathLine();

        if (this.ghostMesh) {
            this.scene.remove(this.ghostMesh);
            this.ghostMesh = null;
        }

        if (tool === 'PLACE') {
            this.setPlacementType(this.placementType);
        }

        if (this.onChange) this.onChange();
    }

    private boundMouseUp: any;

    public setPlayMode(playing: boolean) {
        this.isPlaying = playing;
        this.helpers.visible = !playing;
        this.outlineGroup.visible = !playing;
        // this.selectionCircle.visible = !playing; // selectionCircle is not initialized here
        this.spawnMarkers.visible = !playing;
        this.vertexHandles.visible = !playing; // Hide vertex handles in play mode
        this.weatherParticles.visible = true; // Still visible in play mode? Yes.
        if (this.ghostObject) this.ghostObject.visible = !playing;
        if (this.ghostMesh) this.ghostMesh.visible = !playing; // Also hide ghostMesh

        if (playing) {
            this.selectObject(null);
            this.controls.autoRotate = false;

            // Spawn real player character
            this.playerCharacter = CharacterModels.createPlayer();
            const spawnPos = this.currentSector.spawns.player;
            this.playerCharacter.position.set(spawnPos.x, 0, spawnPos.z);
            this.playerCharacter.rotation.y = spawnPos.rot || 0;
            this.scene.add(this.playerCharacter);

            // Hide OrbitControls and setup follow
            this.controls.enabled = false;
            this.engine.camera.position.set(spawnPos.x, 40, spawnPos.z + 20);
            this.engine.camera.lookAt(this.playerCharacter.position);
        } else {
            // Cleanup player
            if (this.playerCharacter) {
                this.scene.remove(this.playerCharacter);
                this.playerCharacter = null;
            }
            this.controls.enabled = true;
        }
    }

    public dispose() {
        this.engine.popScene();
        this.controls.dispose();
        window.removeEventListener('mousedown', this.boundMouseDown);
        window.removeEventListener('mousemove', this.boundMouseMove);
        window.removeEventListener('mouseup', this.boundMouseUp);
        window.removeEventListener('keydown', this.boundKeyDown);
    }

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
        const rect = this.engine.renderer.domElement.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.lastMousePos = { x: e.clientX, y: e.clientY };

        this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
        const intersects = this.raycaster.intersectObject(this.groundMesh);

        if (this.currentTool === 'SELECT') {
            const objs = Array.from(this.editorObjects.values());
            const objIntersects = this.raycaster.intersectObjects(objs, true);

            if (objIntersects.length > 0) {
                const hovered = objIntersects[0].object;
                let topGroup = hovered;
                while (topGroup.parent && topGroup.parent !== this.scene && !(topGroup.userData && topGroup.userData.id)) {
                    topGroup = topGroup.parent;
                }
                const id = topGroup.userData.id;
                if (this.hoveredObjectId !== id) {
                    this.hoveredObjectId = id;
                    if (this.onChange) this.onChange();
                }
            } else if (this.hoveredObjectId !== null) {
                this.hoveredObjectId = null;
                if (this.onChange) this.onChange();
            }

            if (this.isDragging && this.draggingObjectId && intersects.length > 0) {
                this.moveObject(this.draggingObjectId, intersects[0].point);
            }
            if (this.isDragging && this.draggingHandleIndex !== null && intersects.length > 0) {
                this.moveVertex(this.draggingHandleIndex, intersects[0].point);
            }
        }

        if (this.currentTool === 'PLACE' && intersects.length > 0 && this.ghostMesh) {
            let p = intersects[0].point.clone();
            if (this.snapToGrid) {
                p.x = Math.round(p.x / this.gridSize) * this.gridSize;
                p.z = Math.round(p.z / this.gridSize) * this.gridSize;
            }
            this.ghostMesh.position.copy(p);
            this.ghostMesh.visible = true;
            if (this.onChange) this.onChange();
        } else if (this.ghostMesh) {
            this.ghostMesh.visible = false;
        }

        // Original logic for other tools and ghostObject (if still used)
        if (this.currentTool.startsWith('SPAWN_')) {
            const intersect = this.getGroundIntersect();
            if (intersect) this.updateGhost();
        }
    }

    private onMouseDown(e: MouseEvent) {
        if (!this.isEditMode) return;
        if (e.button !== 0) return; // Only left click

        const rect = this.engine.renderer.domElement.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);

        if (this.currentTool === 'SELECT') {
            // Check for vertex handle interaction first
            const handleIntersects = this.raycaster.intersectObjects(this.vertexHandles.children);
            if (handleIntersects.length > 0) {
                const handle = handleIntersects[0].object;
                this.draggingHandleIndex = handle.userData.index;
                this.isDragging = true;
                this.controls.enabled = false; // Disable orbit controls while dragging handle
                return; // Don't process object selection if a handle is clicked
            }

            const objs = Array.from(this.editorObjects.values());
            const intersects = this.raycaster.intersectObjects(objs, true);
            if (intersects.length > 0) {
                const clicked = intersects[0].object;
                let topGroup = clicked;
                while (topGroup.parent && topGroup.parent !== this.scene && !(topGroup.userData && topGroup.userData.id)) {
                    topGroup = topGroup.parent;
                }
                const id = topGroup.userData.id;
                this.selectObject(id);
                this.focusObject(id);
                this.draggingObjectId = id;
                this.isDragging = true;
                this.controls.enabled = false; // Disable orbit controls while dragging object
            } else {
                this.selectObject(null);
            }
        } else if (this.currentTool === 'PLACE') {
            const intersects = this.raycaster.intersectObject(this.groundMesh);
            if (intersects.length > 0) {
                this.addObject(this.placementType, intersects[0].point);
            }
        } else if (this.currentTool === 'PATH') {
            const intersect = this.getGroundIntersect();
            if (intersect) this.addPathPoint(intersect.point);
        } else if (this.currentTool === 'SHAPE') {
            const intersect = this.getGroundIntersect();
            if (intersect) this.addShapePoint(intersect.point);
        } else if (this.currentTool === 'SPAWN_PLAYER') {
            const intersect = this.getGroundIntersect();
            if (intersect) {
                this.currentSector.spawns.player = { x: intersect.point.x, z: intersect.point.z, rot: 0 };
                this.updateSpawnMarkers();
            }
        } else if (this.currentTool === 'SPAWN_FAMILY') {
            const intersect = this.getGroundIntersect();
            if (intersect) {
                this.currentSector.spawns.family = { x: intersect.point.x, z: intersect.point.z };
                this.updateSpawnMarkers();
            }
        } else if (this.currentTool === 'SPAWN_BOSS') {
            const intersect = this.getGroundIntersect();
            if (intersect) {
                this.currentSector.spawns.boss = { x: intersect.point.x, z: intersect.point.z };
                this.updateSpawnMarkers();
            }
        }
    }

    private onMouseUp(e: MouseEvent) {
        this.isDragging = false;
        this.draggingObjectId = null;
        this.draggingHandleIndex = null;
        this.controls.enabled = true; // Re-enable controls after drag
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
        if (this.currentTool !== 'PLACE' && !this.currentTool.startsWith('SPAWN_')) {
            if (this.ghostObject) {
                this.scene.remove(this.ghostObject);
                this.ghostObject = null;
            }
            return;
        }

        const intersect = this.getGroundIntersect();
        if (!intersect) return;

        let ghostType = this.placementType;
        if (this.currentTool === 'SPAWN_PLAYER') ghostType = 'SPAWN_PLAYER';
        if (this.currentTool === 'SPAWN_FAMILY') ghostType = 'SPAWN_FAMILY';
        if (this.currentTool === 'SPAWN_BOSS') ghostType = 'SPAWN_BOSS';

        if (!this.ghostObject || this.ghostObject.userData.type !== ghostType) {
            if (this.ghostObject) this.scene.remove(this.ghostObject);

            if (ghostType.startsWith('SPAWN_')) {
                const color = ghostType === 'SPAWN_PLAYER' ? 0x3b82f6 : ghostType === 'SPAWN_FAMILY' ? 0x10b981 : 0xf43f5e;
                this.ghostObject = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.5 }));
            } else {
                this.ghostObject = this.createVisualForType(ghostType);
            }

            if (this.ghostObject) {
                this.ghostObject.userData.type = ghostType;
                this.scene.add(this.ghostObject);
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

    public setPlacementType(type: string) {
        this.placementType = type;
        if (this.ghostMesh) {
            this.scene.remove(this.ghostMesh);
            this.ghostMesh = null;
        }
        this.ghostMesh = this.createVisualForType(type);
        this.ghostMesh.position.set(0, -100, 0); // Hide initially
        // Apply pre-placement settings
        this.ghostMesh.rotation.set(this.prePlacementObject.rotation.x, this.prePlacementObject.rotation.y, this.prePlacementObject.rotation.z);
        this.ghostMesh.scale.set(this.prePlacementObject.scale.x, this.prePlacementObject.scale.y, this.prePlacementObject.scale.z);

        if (this.ghostMesh instanceof THREE.Mesh) {
            this.ghostMesh.material = (this.ghostMesh.material as THREE.Material).clone();
            (this.ghostMesh.material as THREE.Material).transparent = true;
            (this.ghostMesh.material as THREE.Material).opacity = 0.5;
        } else {
            this.ghostMesh.traverse(c => {
                if (c instanceof THREE.Mesh) {
                    c.material = (c.material as THREE.Material).clone();
                    (c.material as THREE.Material).transparent = true;
                    (c.material as THREE.Material).opacity = 0.5;
                }
            });
        }
        this.scene.add(this.ghostMesh);
    }

    public updatePrePlacement(data: Partial<EditorSystem['prePlacementObject']>) {
        this.prePlacementObject = { ...this.prePlacementObject, ...data };
        if (this.ghostMesh) {
            this.ghostMesh.rotation.set(this.prePlacementObject.rotation.x, this.prePlacementObject.rotation.y, this.prePlacementObject.rotation.z);
            this.ghostMesh.scale.set(this.prePlacementObject.scale.x, this.prePlacementObject.scale.y, this.prePlacementObject.scale.z);
        }
    }

    public update(dt: number) {
        if (!this.isPlaying) {
            this.controls.update();
            this.updateGhost(); // Keep this for SPAWN_ tools

            // Selection indicator
            if (this.selectedObjectId) {
                const mesh = this.editorObjects.get(this.selectedObjectId);
                if (mesh) {
                    // this.selectionCircle.visible = true; // selectionCircle is not initialized here
                    // this.selectionCircle.position.set(mesh.position.x, mesh.position.y + 0.1, mesh.position.z);
                }
            } else {
                // this.selectionCircle.visible = false; // selectionCircle is not initialized here
            }
        } else if (this.playerCharacter) {
            // SIMPLE GAMEPLAY CONTROLS
            const input = this.engine.input.state;
            const move = new THREE.Vector3(0, 0, 0);
            if (input.w) move.z -= 1;
            if (input.s) move.z += 1;
            if (input.a) move.x -= 1;
            if (input.d) move.x += 1;

            if (move.length() > 0) {
                move.normalize().multiplyScalar(15 * dt);
                this.playerCharacter.position.add(move);

                // Rotation
                const targetRot = Math.atan2(move.x, move.z);
                this.playerCharacter.rotation.y = targetRot;
            }

            // Camera Follow
            const camTarget = this.playerCharacter.position.clone().add(new THREE.Vector3(0, 40, 20));
            this.engine.camera.position.lerp(camTarget, 0.1);
            this.engine.camera.lookAt(this.playerCharacter.position);
        }

        // UPDATE WEATHER
        if (this.currentSector.environment.weather !== 'none') {
            this.weatherParticles.children.forEach(p => {
                p.position.y -= (this.currentSector.environment.weather === 'snow' ? 5 : 20) * dt;
                if (p.position.y < 0) p.position.y = 50;
            });
        }
    }

    public updateHighlight(id: string | null, active: boolean) {
        // Remove old outlines
        this.outlineGroup.clear();
        // this.outlines.clear(); // outlines is not initialized

        if (!id) {
            // this.selectionCircle.visible = false; // selectionCircle is not initialized
            return;
        }

        const mesh = this.scene.children.find(c => c.userData.id === id) as THREE.Mesh;
        if (mesh) {
            // this.selectionCircle.position.set(mesh.position.x, 0.05, mesh.position.z); // selectionCircle is not initialized
            // this.selectionCircle.visible = true; // selectionCircle is not initialized

            // Create Edge Outline
            mesh.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    const edges = new THREE.EdgesGeometry(child.geometry);
                    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
                        color: active ? 0xff0000 : 0xffffff,
                        transparent: true,
                        opacity: active ? 0.8 : 0.4
                    }));
                    line.position.copy(child.position);
                    line.rotation.copy(child.rotation);
                    line.scale.copy(child.scale);
                    this.outlineGroup.add(line);
                }
            });
        }
    }

    public focusCamera(target: THREE.Vector3) {
        new Promise<void>(resolve => {
            const start = this.controls.target.clone();
            const duration = 300;
            const startTime = performance.now();

            const animateFocus = (time: number) => {
                const elapsed = time - startTime;
                const t = Math.min(elapsed / duration, 1);
                const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic

                this.controls.target.lerpVectors(start, target, ease);
                this.controls.update();

                if (t < 1) requestAnimationFrame(animateFocus);
                else resolve();
            };
            requestAnimationFrame(animateFocus);
        });
    }

    public focusObject(id: string | null) {
        if (!id) return;
        const mesh = this.editorObjects.get(id);
        if (mesh) {
            const target = mesh.position.clone();
            this.engine.camera.position.set(target.x, target.y + 20, target.z + 40);
            this.engine.camera.lookAt(target);
        }

        this.updateVertexHandles(id);
    }

    public updateVertexHandles(id: string | null) {
        this.vertexHandles.clear();
        if (!id) return;

        const path = this.currentSector.paths.find(p => p.id === id);
        if (path) {
            path.points.forEach((p, i) => {
                const handle = new THREE.Mesh(
                    new THREE.SphereGeometry(0.5, 16, 8),
                    new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 0.5 })
                );
                handle.position.set(p.x, p.y + 0.5, p.z);
                handle.userData.index = i;
                handle.userData.type = 'path';
                this.vertexHandles.add(handle);
            });
        }

        const shape = this.currentSector.objects.find(o => o.id === id && o.type === 'SHAPE');
        if (shape && shape.properties?.points) {
            shape.properties.points.forEach((p: any, i: number) => {
                const handle = new THREE.Mesh(
                    new THREE.SphereGeometry(0.5, 16, 8),
                    new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 0.5 })
                );
                handle.position.set(p.x, 0.5, p.y);
                handle.userData.index = i;
                handle.userData.type = 'shape';
                this.vertexHandles.add(handle);
            });
        }
    }

    public moveVertex(index: number, pos: THREE.Vector3) {
        if (this.snapToGrid) {
            pos.x = Math.round(pos.x / this.gridSize) * this.gridSize;
            pos.z = Math.round(pos.z / this.gridSize) * this.gridSize;
        }

        const id = this.selectedObjectId;
        if (!id) return;

        const path = this.currentSector.paths.find(p => p.id === id);
        if (path) {
            path.points[index] = { x: pos.x, y: pos.y, z: pos.z };
            // Regeneration of path visual would go here, for now we just update handles
            this.updateVertexHandles(id);
            if (this.onChange) this.onChange();
        }

        const shape = this.currentSector.objects.find(o => o.id === id && o.type === 'SHAPE');
        if (shape) {
            shape.properties.points[index] = { x: pos.x, y: pos.z };
            // Re-spawn shape to see changes
            this.spawnObjectInScene(shape);
            this.updateVertexHandles(id);
            if (this.onChange) this.onChange();
        }
    }

    public addObject(type: string, pos: THREE.Vector3) {
        if (this.snapToGrid) {
            pos.x = Math.round(pos.x / this.gridSize) * this.gridSize;
            pos.z = Math.round(pos.z / this.gridSize) * this.gridSize;
        }

        const id = Math.random().toString(36).substr(2, 9);

        let finalRotation = { ...this.prePlacementObject.rotation };
        let finalScale = { ...this.prePlacementObject.scale };

        // Randomize trees
        if (['spruce', 'pine', 'birch'].includes(type)) {
            finalRotation.y = Math.random() * Math.PI * 2;
            const s = 0.8 + Math.random() * 0.4;
            finalScale = { x: s, y: s, z: s };
        }

        const objData: EditorObject = {
            id,
            type,
            position: { x: pos.x, y: pos.y, z: pos.z },
            rotation: finalRotation,
            scale: finalScale,
            properties: { ...this.prePlacementObject.properties }
        };

        this.currentSector.objects.push(objData);

        // Sync spawn points for logic entities
        if (type === 'player_spawn') {
            this.currentSector.spawns.player = { x: pos.x, z: pos.z, rot: finalRotation.y };
        } else if (type === 'family_spawn') {
            this.currentSector.spawns.family = { x: pos.x, z: pos.z };
        } else if (type === 'boss_spawn') {
            this.currentSector.spawns.boss = { x: pos.x, z: pos.z };
        }

        this.spawnObjectInScene(objData);
        this.selectObject(id);
        if (this.onChange) this.onChange();
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
            case 'rock': return ObjectGenerator.createRock(obj?.scale?.x || 1.0, obj?.properties?.radius || 1.0);
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
            case 'player_spawn':
                const pg = new THREE.Group();
                const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1, 4, 8), new THREE.MeshStandardMaterial({ color: 0x3b82f6 }));
                body.position.y = 1;
                pg.add(body);
                const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 4), new THREE.MeshStandardMaterial({ color: 0xffffff }));
                arrow.position.set(0, 1.5, 1);
                arrow.rotation.x = Math.PI / 2;
                pg.add(arrow);
                return pg;
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
            this.currentSector.objects = this.currentSector.objects.filter(o => o.id !== id);
            if (this.selectedObjectId === id) this.selectObject(null);
            if (this.onChange) this.onChange();
        }
    }
    public rotateObject(id: string, angle: number) {
        const mesh = this.editorObjects.get(id);
        const data = this.currentSector.objects.find(o => o.id === id);
        if (mesh && data) {
            mesh.rotation.y += angle;
            data.rotation.y = mesh.rotation.y;
            if (this.onChange) this.onChange();
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

            // Sync spawn points if logic entity is moved
            if (data.type === 'player_spawn') {
                this.currentSector.spawns.player = { x: pos.x, z: pos.z, rot: data.rotation.y };
            } else if (data.type === 'family_spawn') {
                this.currentSector.spawns.family = { x: pos.x, z: pos.z };
            } else if (data.type === 'boss_spawn') {
                this.currentSector.spawns.boss = { x: pos.x, z: pos.z };
            }

            if (this.onChange) this.onChange();
        }
    }

    public scaleObject(id: string, scale: number) {
        const mesh = this.editorObjects.get(id);
        const data = this.currentSector.objects.find(o => o.id === id);
        if (mesh && data) {
            const oldBox = new THREE.Box3().setFromObject(mesh);
            const oldHeight = oldBox.max.y - oldBox.min.y;

            mesh.scale.setScalar(scale);

            // Re-calculate box after scale to adjust Y
            const newBox = new THREE.Box3().setFromObject(mesh);
            const newMinY = newBox.min.y;

            // Adjust position so min Y stays at 0 (or original Y if it was offset)
            // If the mesh origin is at bottom, this isn't strictly needed, but many assets aren't.
            mesh.position.y -= newMinY;

            data.scale.x = scale;
            data.scale.y = scale;
            data.scale.z = scale;
            data.position.y = mesh.position.y;
            if (this.onChange) this.onChange();
        }
    }

    private updateSpawnMarkers() {
        this.spawnMarkers.clear();

        const createMarker = (pos: { x: number, z: number }, color: number, name: string) => {
            const mesh = new THREE.Mesh(
                new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
                new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 })
            );
            mesh.position.set(pos.x, 0, pos.z);
            mesh.userData.name = name;
            this.spawnMarkers.add(mesh);
        };

        const s = this.currentSector.spawns;
        createMarker(s.player, 0x3b82f6, "Player Spawn");
        createMarker(s.family, 0x10b981, "Family Spawn");
        createMarker(s.boss, 0xf43f5e, "Boss Spawn");
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
            if (this.onChange) this.onChange();
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
        if (this.onChange) this.onChange();
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
            this.selectObject(id);
        }
        this.currentPathPoints = [];
        this.updatePathLine();
        if (this.onChange) this.onChange();
    }

    public clearScene() {
        this.editorObjects.forEach(obj => this.scene.remove(obj));
        this.editorObjects.clear();
        this.currentSector.objects = [];
        this.currentSector.paths = [];
        this.selectedObjectId = null;
        if (this.pathLine) this.scene.remove(this.pathLine);
        if (this.onChange) this.onChange();
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
            if (this.onChange) this.onChange();
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

        // Ground Color
        if (this.groundMesh) {
            (this.groundMesh.material as THREE.MeshStandardMaterial).color.set(env.groundColor || 0xddddff);
        }

        // Handle Day/Night logic roughly
        if (env.timeOfDay === 'night') {
            this.sunLight.color.set(0x6688ff);
        } else {
            this.sunLight.color.set(0xfff5ee);
        }

        // Rebuild Weather Particles
        this.weatherParticles.clear();
        if (env.weather !== 'none') {
            const count = 500;
            const geo = env.weather === 'snow' ? new THREE.BoxGeometry(0.1, 0.1, 0.1) : new THREE.BoxGeometry(0.05, 0.5, 0.05);
            const mat = new THREE.MeshBasicMaterial({ color: env.weather === 'snow' ? 0xffffff : 0xaaaaaa, transparent: true, opacity: 0.5 });
            for (let i = 0; i < count; i++) {
                const p = new THREE.Mesh(geo, mat);
                p.position.set((Math.random() - 0.5) * 200, Math.random() * 50, (Math.random() - 0.5) * 200);
                this.weatherParticles.add(p);
            }
        }
    }
}
