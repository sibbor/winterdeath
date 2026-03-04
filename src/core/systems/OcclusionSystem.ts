import * as THREE from 'three';
import { System } from './System';
import { GameSessionLogic } from '../GameSessionLogic';
import { Enemy } from '../EnemyManager';

// ============================================================================
// [VINTERDÖD] OcclusionSystem v2 — Stencil-Masked X-Ray Silhouettes
//
// TECHNIQUE: Two-pass stencil + GreaterDepth
//
//   Pass 1 – Stencil Mask (renderOrder = 1, colorWrite: false):
//     A capsule mesh co-located with each entity writes stencil=1 at pixels
//     where the entity is VISIBLE (depth test passes). Occluded pixels are
//     NOT written (stencilZFail: Keep).
//
//   Pass 2 – Ghost (renderOrder = 2, stencilFunc: NotEqual):
//     The same capsule is drawn with GreaterDepth (only where occluded) and
//     stencilFunc: NotEqualStencil (skip pixels marked visible in pass 1).
//
//   Combined: ghost ONLY draws at pixels that are:
//     a) covered by an occluder in front of the entity  (GreaterDepth ✓)
//     b) NOT pixels where the entity's own body is visible (NotEqual ✓)
//
// ENEMY BUG FIX:
//   Enemy geometry lives in a globally-shared InstancedMesh. Traversing
//   enemy.mesh yields no cloneable Mesh children. We always use a capsule
//   approximation instead of trying to clone entity geometry.
//
// PERFORMANCE:
//   - 2 extra draw calls per entity (mask + ghost) — small capsule capsule.
//   - Zero heap allocations in the update loop.
//   - Ghost geometry is a shared CapsuleGeometry instance.
// ============================================================================

// --- SHARED GHOST GEOMETRY (one capsule for all entities) ---
const _capsuleGeo = new THREE.CapsuleGeometry(0.32, 1.25, 4, 8);
_capsuleGeo.translate(0, 0.95, 0); // Offset so bottom sits at y=0

// --- STENCIL MASK MATERIAL ---
// Renders invisible but writes stencil=1 where the entity IS visible (depth passes).
// Occluded pixels remain stencil=0 (KeepStencilOp on ZFail).
const _stencilMaskMat = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,   // Do NOT write when occluded
    stencilZPass: THREE.ReplaceStencilOp, // Write 1 when visible
});

// --- GHOST MATERIALS per entity type ---
// Only draw where:
//  - GreaterDepth: the ghost depth > zbuffer (= entity is behind something)
//  - NotEqualStencil: stencil != 1 (= not marked as visible by mask pass)
function makeGhostMat(color: number, opacity: number): THREE.MeshBasicMaterial {
    const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthTest: true,
        depthFunc: THREE.GreaterDepth,
        depthWrite: false,
        side: THREE.FrontSide,
        stencilWrite: false,
        stencilRef: 1,
        stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.KeepStencilOp,
        stencilZFail: THREE.KeepStencilOp,
        stencilZPass: THREE.KeepStencilOp,
    });
    // stencilTest is a Material property but not in MeshBasicMaterialParameters constructor interface
    mat.stencilTest = true;
    return mat;
}

const _playerGhostMat = makeGhostMat(0x00e5ff, 0.55);  // Cyan
const _familyGhostMat = makeGhostMat(0xffcc44, 0.55);  // Amber
const _enemyGhostMat = makeGhostMat(0xff3030, 0.40);  // Red

// Tag to identify ghost root groups
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
    id = 'occlusion';

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

    update(session: GameSessionLogic, _dt: number, _now: number): void {
        const state = session.state;

        // ------------------------------------------------------------------
        // 1. PLAYER ghost
        // ------------------------------------------------------------------
        const playerGroup = this.playerGroup.current;
        if (playerGroup) {
            let hasGhost = false;
            for (let i = 0; i < playerGroup.children.length; i++) {
                if (playerGroup.children[i].userData[GHOST_TAG]) { hasGhost = true; break; }
            }
            if (!hasGhost) attachGhost(playerGroup, _playerGhostMat);
        }

        // ------------------------------------------------------------------
        // 2. FAMILY MEMBER ghosts
        // ------------------------------------------------------------------
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

        // ------------------------------------------------------------------
        // 3. ENEMY ghosts
        // Enemy geometry lives in a shared InstancedMesh — traversal yields
        // no cloneable children. We attach a capsule approximation directly.
        // ------------------------------------------------------------------
        const enemies = state.enemies;
        for (let i = 0; i < enemies.length; i++) {
            const enemy: Enemy = enemies[i];
            if (!enemy || !enemy.mesh || enemy.dead) continue;

            if (!this.ghostedEnemies.has(enemy.mesh)) {
                attachGhost(enemy.mesh, _enemyGhostMat);
                this.ghostedEnemies.add(enemy.mesh);
            }
        }

        // ------------------------------------------------------------------
        // 4. Prune stale enemy ghosts (enemies returned to pool when dead)
        // ------------------------------------------------------------------
        if (this.ghostedEnemies.size > 0 && enemies.length < this.ghostedEnemies.size) {
            const activeSet: Set<THREE.Object3D> = new Set();
            for (let i = 0; i < enemies.length; i++) {
                if (!enemies[i].dead && enemies[i].mesh) activeSet.add(enemies[i].mesh);
            }
            for (const mesh of this.ghostedEnemies) {
                if (!activeSet.has(mesh)) {
                    removeGhost(mesh);
                    this.ghostedEnemies.delete(mesh);
                }
            }
        }
    }

    cleanup(_session: GameSessionLogic): void {
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
