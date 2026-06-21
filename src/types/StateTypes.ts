import { WeaponID } from '../entities/player/CombatTypes';
import { CareerStats, INITIAL_STATS } from './CareerStats';
import { SessionStats } from './SessionStats';
import { WeatherType, EnvironmentOverride, EnvironmentConfig } from '../core/engine/EnvironmentalTypes';
import { GameScreen } from './SessionTypes';
import { SETTINGS_DEFAULT } from '../content/constants';
import { SectorEventState } from '../game/session/SectorTypes';

export interface GameSettings {
    antialias: boolean;
    shadows: boolean;
    shadowMapType: number;
    shadowResolution: number;
    pixelRatio: number;
    textureQuality: number;
    volumetricFog: boolean;
    showDiscoveryPopups: boolean;
    showFps: boolean;
    debugMode: boolean;
    hudEffectsQuality: boolean;
}

export type SectorStats = SessionStats;

export interface SectorState {
    unlimitedThrowables?: boolean;
    unlimitedAmmo?: boolean;
    noReload?: boolean;
    isInvincible?: boolean;
    envOverride?: EnvironmentOverride;
    ctx?: any;

    // The Generic Bridge API
    pendingTrigger?: string | null;
    keepCamera?: boolean;

    // Production-ready event constraint flags (preventing V8 hidden class shifts)
    isInputDisabled: boolean;
    isEnemyUpdateDisabled: boolean;
    isTeleportDisabled: boolean;
    isHudHidden: boolean;
    eventStates: SectorEventState[];

    [key: string]: any;
}

export interface GameState {
    settings: GameSettings;
    screen: GameScreen;
    currentSector: number;
    stats: CareerStats;

    loadout: {
        primary: WeaponID;
        secondary: WeaponID;
        throwable: WeaponID;
        special: WeaponID;
    };
    weaponLevels: Partial<Record<WeaponID, number>>;

    sectorState?: SectorState;
    environmental: EnvironmentConfig;
}

export const DEFAULT_STATE: GameState = {
    screen: GameScreen.PROLOGUE,
    stats: INITIAL_STATS as any,
    currentSector: 0,
    loadout: { primary: WeaponID.RIFLE, secondary: WeaponID.REVOLVER, throwable: WeaponID.MOLOTOV, special: WeaponID.ARC_CANNON },
    weaponLevels: {
        [WeaponID.PISTOL]: 1,
        [WeaponID.SMG]: 1,
        [WeaponID.SHOTGUN]: 1,
        [WeaponID.RIFLE]: 1,
        [WeaponID.REVOLVER]: 1,
        [WeaponID.GRENADE]: 1,
        [WeaponID.MOLOTOV]: 1,
        [WeaponID.MINIGUN]: 1,
        [WeaponID.FLASHBANG]: 1,
        [WeaponID.FLAMETHROWER]: 1,
        [WeaponID.ARC_CANNON]: 1,
    },
    settings: {
        ...SETTINGS_DEFAULT,
        debugMode: false,
        showFps: false
    },
    environmental: {
        bgColor: 0x161629,
        fog: {
            color: 0x161629,
            density: 20,
            height: 0.2
        },
        sky: {
            time: 0.0,
            timeScale: 0.02,
            celestial: {
                radius: 20,
                position: { x: -120, y: 80, z: -350 }
            },
            light: {
                visible: true,
                castShadow: true
            },
            clouds: {
                count: 6,
                height: 90,
                speed: 0.8,
                opacity: 0.4
            }
        },
        wind: { strengthMin: 0.01, strengthMax: 0.05 },
        weather: {
            type: WeatherType.SNOW,
            particles: 1000
        },
        ambient: 0.4,
        groundColor: 0xddddff,
        fov: 50,
        cameraOffsetZ: 40,
        cameraHeight: 25
    },
    sectorState: {
        unlimitedAmmo: false,
        noReload: false,
        unlimitedThrowables: false,
        isInvincible: false,
        isInputDisabled: false,
        isEnemyUpdateDisabled: false,
        isTeleportDisabled: false,
        isHudHidden: false,
        eventStates: []
    }
};