import * as THREE from 'three';
import { WEAPONS, BOSSES } from '../content/constants';
import { WeaponType } from '../content/weapons';
import { PerformanceMonitor } from './PerformanceMonitor';
import { StatusEffectType } from '../entities/player/CombatTypes';

// ============================================================================
// ZERO-GC DOUBLE BUFFERING
// We allocate two identical state trees (A and B) on load.
// By swapping between them each frame, we force React's strict equality (===)
// to detect a change and re-render, without ever allocating new objects.
// ============================================================================

const createStatusPool = () => Array.from({ length: 16 }, () => ({ type: '', duration: 0, maxDuration: 0, intensity: 0 }));

const createDebugInfo = () => ({
    aim: { x: 0, y: 0 },
    input: { w: 0, a: 0, s: 0, d: 0, fire: 0, reload: 0 },
    cam: { x: 0, y: 0, z: 0 },
    camera: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, fov: 0 },
    modes: 'Standard',
    enemies: 0,
    objects: 0,
    drawCalls: 0,
    coords: { x: 0, z: 0 },
    performance: {
        cpu: null as any,
        memory: { heapLimit: 0, heapTotal: 0, heapUsed: 0 },
        renderer: null as any
    }
});

const createHudBuffer = () => ({
    isDisoriented: false,
    statusEffects: [] as any[],
    _statusPool: createStatusPool(), // Internal pool to avoid inline {} allocs
    activePassives: [] as string[],
    activeBuffs: [] as string[],
    activeDebuffs: [] as string[],
    hp: 0,
    maxHp: 0,
    stamina: 0,
    maxStamina: 0,
    ammo: 0,
    magSize: 0,
    score: 0,
    scrap: 0,
    multiplier: 1,
    activeWeapon: WeaponType.PISTOL,
    isReloading: false,

    // Internal mutable structs linked dynamically to avoid allocations
    boss: null as any,
    _bossInfo: { active: false, name: '', hp: 0, maxHp: 0 },

    bossSpawned: false,
    bossDefeated: false,
    familyFound: false,
    familySignal: 0,
    level: 1,
    currentXp: 0,
    nextLevelXp: 0,
    throwableAmmo: 0,
    reloadProgress: 0,

    playerPos: { x: 0, z: 0 },

    familyPos: null as any,
    _familyPos: { x: 0, z: 0 },

    bossPos: null as any,
    _bossPos: { x: 0, z: 0 },

    distanceTraveled: 0,
    kills: 0,

    sectorStats: null as any,
    _sectorStats: { unlimitedAmmo: false, unlimitedThrowables: false, isInvincible: false, hordeTarget: 0, zombiesKilled: 0, zombiesKillTarget: 0 },

    isDriving: false,
    vehicleSpeed: 0,
    throttleState: 0,
    spEarned: 0,
    skillPoints: 0,
    isDead: false,
    killerName: '',
    killerAttackName: '',
    killedByEnemy: false,
    debugInfo: createDebugInfo(),
    mapItems: [] as any[],
    fps: 0,

    // --- ZERO-GC FIX: Pre-allocate missing properties to lock V8 Hidden Class ---
    debugMode: false,
    systems: [] as any[],
    currentLine: null as any,
    cinematicActive: false,
    interactionPrompt: null as any,
    hudVisible: true,
    sectorName: null as string | null,
    discovery: null as any,
    _discovery: { id: '', type: 'clue', title: '', details: '', timestamp: 0 } as any
});

const _bufferA = createHudBuffer();
const _bufferB = createHudBuffer();
let _useBufferA = true;

const truncate1 = (val: number) => Math.round(val * 10) / 10;
const truncate2 = (val: number) => Math.round(val * 100) / 100;

const _fastUpdateDetail = {
    hp: 0,
    maxHp: 0,
    stamina: 0,
    maxStamina: 0,
    ammo: 0,
    currentXp: 0,
    nextLevelXp: 0,
    reloadProgress: 0,
    bossHpP: -1 // -1 means no boss/wave active
};

export const HudSystem = {
    emitFastUpdate: (state: any, input: any, now: number) => {
        const wep = WEAPONS[state.activeWeapon];

        // Clamp reloadProgress mellan 0 och 1 för stabil CSS-rendering
        const reloadDuration = (wep?.reloadTime || 1000) + (input.fire ? 1000 : 0);
        const reloadRemaining = state.reloadEndTime - now;
        const reloadProgress = state.isReloading
            ? Math.max(0, Math.min(1, 1 - (reloadRemaining / reloadDuration)))
            : 0;

        // Fast-path for boss/wave detection
        let bossHpP = -1;
        const enemies = state.enemies;
        let activeBossObj = null;
        for (let i = 0; i < enemies.length; i++) {
            if (enemies[i].isBoss) {
                activeBossObj = enemies[i];
                break;
            }
        }

        if (activeBossObj) {
            bossHpP = activeBossObj.hp / activeBossObj.maxHp;
        } else if (state.sectorState && state.sectorState.hordeTarget > 0) {
            // Wave progress
            const kills = state.sectorState.zombiesKilled || 0;
            const target = state.sectorState.zombiesKillTarget || state.sectorState.hordeTarget;
            bossHpP = kills / target;
        }

        _fastUpdateDetail.hp = state.hp;
        _fastUpdateDetail.maxHp = state.maxHp;
        _fastUpdateDetail.stamina = state.stamina;
        _fastUpdateDetail.maxStamina = state.maxStamina;
        _fastUpdateDetail.ammo = state.weaponAmmo[state.activeWeapon] || 0;
        _fastUpdateDetail.currentXp = state.currentXp;
        _fastUpdateDetail.nextLevelXp = state.nextLevelXp;
        _fastUpdateDetail.reloadProgress = reloadProgress;
        _fastUpdateDetail.bossHpP = bossHpP;

        window.dispatchEvent(new CustomEvent('hud-fast-update', { detail: _fastUpdateDetail }));
    },

    getHudData: (
        state: any,
        playerPos: THREE.Vector3,
        familyMemberMesh: THREE.Object3D | null,
        input: any,
        now: number,
        props: any,
        distanceTraveled: number,
        camera: THREE.Camera
    ) => {
        // Swap active buffer
        _useBufferA = !_useBufferA;
        const _current = _useBufferA ? _bufferA : _bufferB;

        // Fast-path for boss detection
        let activeBossObj = null;
        const enemies = state.enemies;
        for (let i = 0; i < enemies.length; i++) {
            if (enemies[i].isBoss) {
                activeBossObj = enemies[i];
                break;
            }
        }

        if (activeBossObj) {
            _current._bossInfo.active = true;
            _current._bossInfo.name = (activeBossObj.bossId !== undefined && BOSSES[activeBossObj.bossId]) ? BOSSES[activeBossObj.bossId].name : 'BOSS';
            _current._bossInfo.hp = activeBossObj.hp;
            _current._bossInfo.maxHp = activeBossObj.maxHp;
            _current.boss = _current._bossInfo;
        } else if (state.sectorState && state.sectorState.hordeTarget > 0 && state.sectorState.zombiesKilled < state.sectorState.zombiesKillTarget) {
            _current._bossInfo.active = true;
            _current._bossInfo.name = 'ui.zombie_wave';
            _current._bossInfo.hp = Math.max(0, state.sectorState.hordeTarget - state.sectorState.zombiesKilled);
            _current._bossInfo.maxHp = state.sectorState.hordeTarget;
            _current.boss = _current._bossInfo;
        } else {
            _current.boss = null;
        }

        let famSignal = 0;
        if (state.activeWeapon === WeaponType.RADIO && familyMemberMesh) {
            const distSq = playerPos.distanceToSquared(familyMemberMesh.position);
            if (distSq < 40000) {
                famSignal = Math.max(0, 1 - (Math.sqrt(distSq) / 200));
            }
        }

        if (familyMemberMesh) {
            _current._familyPos.x = familyMemberMesh.position.x;
            _current._familyPos.z = familyMemberMesh.position.z;
            _current.familyPos = _current._familyPos;
        } else {
            _current.familyPos = null;
        }

        if (activeBossObj) {
            _current._bossPos.x = activeBossObj.mesh.position.x;
            _current._bossPos.z = activeBossObj.mesh.position.z;
            _current.bossPos = _current._bossPos;
        } else {
            _current.bossPos = null;
        }

        const wep = WEAPONS[state.activeWeapon];
        _current.reloadProgress = state.isReloading
            ? 1 - ((state.reloadEndTime - now) / ((wep?.reloadTime || 1000) + (input.fire ? 1000 : 0)))
            : 0;

        const spGained = state.sessionStats.spGained;

        // Status Effects (Zero-GC Pool Extraction into the active buffer)
        _current.statusEffects.length = 0;
        const statusEffects = state.statusEffects;
        let effectIndex = 0;
        for (const key in statusEffects) {
            const effect = statusEffects[key];
            if (effect && effect.duration > 0) {
                const poolItem = _current._statusPool[effectIndex];
                if (poolItem) {
                    poolItem.type = key;
                    poolItem.duration = effect.duration;
                    poolItem.maxDuration = effect.maxDuration || effect.duration; // Fallback to current if max not set
                    poolItem.intensity = effect.intensity;
                    _current.statusEffects.push(poolItem);
                    effectIndex++;
                }
            }
        }

        _current.playerPos.x = playerPos.x;
        _current.playerPos.z = playerPos.z;

        _current.isDisoriented = !!statusEffects[StatusEffectType.DISORIENTED] && statusEffects[StatusEffectType.DISORIENTED].duration > 0;
        
        // --- ZERO-GC COPY: Avoid passing mutable state array references directly to React ---
        _current.activePassives.length = 0;
        for (let i = 0; i < (state.activePassives?.length || 0); i++) _current.activePassives.push(state.activePassives[i]);
        
        _current.activeBuffs.length = 0;
        for (let i = 0; i < (state.activeBuffs?.length || 0); i++) _current.activeBuffs.push(state.activeBuffs[i]);
        
        _current.activeDebuffs.length = 0;
        for (let i = 0; i < (state.activeDebuffs?.length || 0); i++) _current.activeDebuffs.push(state.activeDebuffs[i]);
        _current.hp = state.hp;
        _current.maxHp = state.maxHp;
        _current.stamina = state.stamina;
        _current.maxStamina = state.maxStamina;
        _current.ammo = state.weaponAmmo[state.activeWeapon] || 0;
        _current.magSize = wep?.magSize || 0;
        _current.score = state.score;
        _current.scrap = (props.stats?.scrap || 0) + state.collectedScrap;
        _current.activeWeapon = state.activeWeapon;
        _current.isReloading = state.isReloading;
        _current.bossSpawned = state.bossSpawned;
        _current.bossDefeated = activeBossObj ? activeBossObj.dead : false;
        _current.familyFound = state.familyFound;
        _current.familySignal = famSignal;
        _current.level = state.level;
        _current.currentXp = state.currentXp;
        _current.nextLevelXp = state.nextLevelXp;
        _current.throwableAmmo = state.weaponAmmo[props.loadout.throwable] || 0;
        _current.distanceTraveled = Math.floor(distanceTraveled);
        _current.kills = state.sessionStats.kills;
        _current.discovery = state.discovery;

        if (state.sectorState) {
            _current._sectorStats.unlimitedAmmo = !!state.sectorState.unlimitedAmmo;
            _current._sectorStats.unlimitedThrowables = !!state.sectorState.unlimitedThrowables;
            _current._sectorStats.isInvincible = !!state.sectorState.isInvincible;
            _current._sectorStats.hordeTarget = state.sectorState.hordeTarget || 0;
            _current._sectorStats.zombiesKilled = state.sectorState.zombiesKilled || 0;
            _current._sectorStats.zombiesKillTarget = state.sectorState.zombiesKillTarget || 0;
            _current.sectorStats = _current._sectorStats;
        } else {
            _current.sectorStats = null;
        }

        _current.isDriving = !!state.activeVehicleType;
        _current.vehicleSpeed = state.vehicleSpeed || 0;
        _current.throttleState = state.vehicleThrottle || 0;
        _current.spEarned = spGained;
        _current.skillPoints = (props.stats?.skillPoints || 0) + spGained;
        _current.isDead = state.isDead;
        _current.killerName = state.killerName;
        _current.killerAttackName = state.killerAttackName;
        _current.killedByEnemy = state.killedByEnemy;
        _current.mapItems = state.mapItems || [];
        _current.fps = PerformanceMonitor.getInstance().getFps();
        _current.hudVisible = state.hudVisible ?? _current.hudVisible;
        _current.sectorName = state.sectorName;
        
        // --- SYNC CINEMATIC STATE (Zero-GC) ---
        // We sync to BOTH buffers to prevent 1-frame flickering during swaps
        _bufferA.cinematicActive = !!state.cinematicActive;
        _bufferA.currentLine = state.currentLine;
        _bufferB.cinematicActive = !!state.cinematicActive;
        _bufferB.currentLine = state.currentLine;

        if (state.discovery) {
            _current._discovery.id = state.discovery.id;
            _current._discovery.type = state.discovery.type;
            _current._discovery.title = state.discovery.title;
            _current._discovery.details = state.discovery.details;
            _current._discovery.timestamp = state.discovery.timestamp;
            _current.discovery = _current._discovery;
        } else {
            _current.discovery = null;
        }

        // Debug Info Mapping
        if (input.aimVector) {
            _current.debugInfo.aim.x = truncate2(input.aimVector.x);
            _current.debugInfo.aim.y = truncate2(input.aimVector.y);
        } else {
            _current.debugInfo.aim.x = 0; _current.debugInfo.aim.y = 0;
        }

        _current.debugInfo.input.w = input.w ? 1 : 0;
        _current.debugInfo.input.a = input.a ? 1 : 0;
        _current.debugInfo.input.s = input.s ? 1 : 0;
        _current.debugInfo.input.d = input.d ? 1 : 0;
        _current.debugInfo.input.fire = input.fire ? 1 : 0;
        _current.debugInfo.input.reload = input.reload ? 1 : 0;

        _current.debugInfo.cam.x = truncate1(camera.position.x);
        _current.debugInfo.cam.y = truncate1(camera.position.y);
        _current.debugInfo.cam.z = truncate1(camera.position.z);

        _current.debugInfo.camera.x = _current.debugInfo.cam.x;
        _current.debugInfo.camera.y = _current.debugInfo.cam.y;
        _current.debugInfo.camera.z = _current.debugInfo.cam.z;
        _current.debugInfo.camera.rotX = camera.rotation.x;
        _current.debugInfo.camera.rotY = camera.rotation.y;
        _current.debugInfo.camera.rotZ = camera.rotation.z;
        _current.debugInfo.camera.fov = (camera as THREE.PerspectiveCamera).fov;

        _current.debugInfo.coords.x = truncate1(playerPos.x);
        _current.debugInfo.coords.z = truncate1(playerPos.z);

        _current.debugInfo.performance.cpu = PerformanceMonitor.getInstance().getTimings();
        const perfMem = (performance as any).memory;
        if (perfMem) {
            _current.debugInfo.performance.memory.heapLimit = Math.round(perfMem.jsHeapSizeLimit / 1048576);
            _current.debugInfo.performance.memory.heapTotal = Math.round(perfMem.totalJSHeapSize / 1048576);
            _current.debugInfo.performance.memory.heapUsed = Math.round(perfMem.usedJSHeapSize / 1048576);
        }

        _current.debugInfo.modes = state.interactionType || 'Standard';
        _current.debugInfo.enemies = enemies.length;
        _current.debugInfo.objects = state.obstacles?.length || 0;

        return _current;
    },

    /** Explicitly clears cinematic and sector data from both buffers to prevent leakage */
    reset: () => {
        _bufferA.cinematicActive = false;
        _bufferA.currentLine = null;
        _bufferB.cinematicActive = false;
        _bufferB.currentLine = null;
        _bufferA.sectorStats = null;
        _bufferB.sectorStats = null;
        _bufferA.discovery = null;
        _bufferB.discovery = null;
    }
};