import * as THREE from 'three';
import { System, SystemID } from './System';
import { Enemy, EnemyFlags } from '../entities/enemies/EnemyTypes';

// --- SHARED GHOST GEOMETRY (one capsule for all entities) ---
const _capsuleGeo = new THREE.CapsuleGeometry(0.35, 1.25, 4, 8);
_capsuleGeo.translate(0, 0.95, 0); // Offset so bottom sits at y=0

// --- STENCIL MASK MATERIAL ---
const _stencilMaskMat = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,   // Do NOT write when occluded by mountain
    stencilZPass: THREE.ReplaceStencilOp, // Write 1 when visible
});

// --- GHOST MATERIALS per entity type ---
function makeGhostMat(color: number, opacity: number): THREE.MeshBasicMaterial {
    const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthTest: true,
        depthFunc: THREE.GreaterDepth,
        depthWrite: false,
        side: THREE.FrontSide,
        stencilWrite: true, // Krävs i nyare Three.js för att stencilFunc ska läsas
        stencilRef: 1,
        stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.KeepStencilOp,
        stencilZFail: THREE.KeepStencilOp,
        stencilZPass: THREE.KeepStencilOp,
    });
    return mat;
}

const _playerGhostMat = makeGhostMat(0x00e5ff, 0.55);  // Cyan
const _familyGhostMat = makeGhostMat(0xffcc44, 0.55);  // Amber
const _enemyGhostMat = makeGhostMat(0xff3030, 0.40);  // Red

const GHOST_TAG = '__xray_ghost__';

// ============================================================================
// Helper: attach stencil mask + ghost capsule to an entity root.
// ============================================================================
function attachGhost(root: THREE.Object3D, ghostMat: THREE.MeshBasicMaterial): void {
    // Guard: avoid double-adding
    for (let i = 0; i < root.children.length; i++) {
        if (root.children[i].userData[GHOST_TAG]) return;
    }

    const ghostRoot = new THREE.Group();
    ghostRoot.userData[GHOST_TAG] = true;

    // Pass 1: Stencil mask — marks visible pixels.
    const maskMesh = new THREE.Mesh(_capsuleGeo, _stencilMaskMat);
    maskMesh.renderOrder = 1;
    // FIX 1: Gör masken något större än själva entiteten/spöket.
    // Detta garanterar att den hamnar FRAMFÖR entityns egen mesh i Z-buffern 
    // och skriver stencil=1 så vi slipper inre "själv-lysande" buggar.
    maskMesh.scale.setScalar(1.2);
    maskMesh.userData[GHOST_TAG] = true;
    ghostRoot.add(maskMesh);

    // Pass 2: Colored ghost — only draws occluded, non-self pixels.
    const ghostMesh = new THREE.Mesh(_capsuleGeo, ghostMat);
    ghostMesh.renderOrder = 2;
    ghostMesh.userData[GHOST_TAG] = true;
    ghostRoot.add(ghostMesh);

    root.add(ghostRoot);
}

// ============================================================================
// Helper: remove ghost group from an entity root.
// ============================================================================
function removeGhost(root: THREE.Object3D): void {
    for (let i = root.children.length - 1; i >= 0; i--) {
        if (root.children[i].userData[GHOST_TAG]) {
            root.remove(root.children[i]);
            return;
        }
    }
}

// ============================================================================
// OcclusionSystem
// ============================================================================
export class OcclusionSystem implements System {
    readonly systemId = SystemID.OCCLUSION;
    id = 'occlusion';
    enabled = true;
    persistent = true;

    private playerGroup: { current: THREE.Group | null };
    private activeFamilyMembers: { current: Array<{ mesh: THREE.Group }> };
    private ghostedEnemies: Set<THREE.Object3D> = new Set();

    constructor(
        playerGroup: { current: THREE.Group | null },
        activeFamilyMembers: { current: Array<{ mesh: THREE.Group }> },
    ) {
        this.playerGroup = playerGroup;
        this.activeFamilyMembers = activeFamilyMembers;
    }

    update(ctx: any, delta: number, simTime: number, renderTime: number): void {
        const state = ctx.state;

        // 1. PLAYER ghost
        const playerGroup = this.playerGroup.current;
        if (playerGroup) {
            let hasGhost = false;
            for (let i = 0; i < playerGroup.children.length; i++) {
                if (playerGroup.children[i].userData[GHOST_TAG]) { hasGhost = true; break; }
            }
            if (!hasGhost) attachGhost(playerGroup, _playerGhostMat);
        }

        // 2. FAMILY MEMBER ghosts
        const family = this.activeFamilyMembers.current;
        for (let i = 0; i < family.length; i++) {
            const mesh = family[i].mesh;
            if (!mesh) continue;
            let hasGhost = false;
            for (let j = 0; j < mesh.children.length; j++) {
                if (mesh.children[j].userData[GHOST_TAG]) { hasGhost = true; break; }
            }
            if (!hasGhost) attachGhost(mesh, _familyGhostMat);
        }

        // 3. ENEMY ghosts
        const enemies = state.enemies;
        for (let i = 0; i < enemies.length; i++) {
            const enemy: Enemy = enemies[i];
            if (!enemy || !enemy.mesh || (enemy.statusFlags & EnemyFlags.DEAD) !== 0) continue;


            if (!this.ghostedEnemies.has(enemy.mesh)) {
                // OBS: Säkerställ att enemy.mesh faktiskt ligger i scene-grafen!
                // Ligger den inte i scenen kommer attachGhost inte generera några draw calls.
                attachGhost(enemy.mesh, _enemyGhostMat);
                this.ghostedEnemies.add(enemy.mesh);
            }
        }

        // 4. Prune stale enemy ghosts
        // FIX 2: Bytte ut felkällan (.length jämförelsen) mot ett robust Set-upplägg
        if (this.ghostedEnemies.size > 0) {
            const activeSet: Set<THREE.Object3D> = new Set();
            const enemies = state.enemies;
            for (let i = 0; i < enemies.length; i++) {
                if (((enemies[i].statusFlags & EnemyFlags.DEAD) === 0) && enemies[i].mesh) {
                    activeSet.add(enemies[i].mesh);
                }
            }

            for (const mesh of this.ghostedEnemies) {
                if (!activeSet.has(mesh)) {
                    removeGhost(mesh);
                    this.ghostedEnemies.delete(mesh);
                }
            }
        }
    }

    clear(): void {
        const playerGroup = this.playerGroup.current;
        if (playerGroup) removeGhost(playerGroup);

        const family = this.activeFamilyMembers.current;
        for (let i = 0; i < family.length; i++) {
            if (family[i].mesh) removeGhost(family[i].mesh);
        }

        for (const mesh of this.ghostedEnemies) removeGhost(mesh);
        this.ghostedEnemies.clear();
    }
}