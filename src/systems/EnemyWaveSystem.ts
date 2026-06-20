import { System, SystemID } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { EnemyType, AIState, NoiseType } from '../entities/enemies/EnemyTypes';
import { EffectManager } from './EffectManager';
import { EffectType } from './EffectManager';
import * as THREE from 'three';

export interface EnemyWaveConfig {
    name: string;
    targetKills?: number;
    targetRatio?: number; // 0.0 to 1.0 (e.g., 0.8 for 80% of spawns)
    spawns: Array<{
        type: EnemyType;
        pos: { x: number; z: number };
    }>;
    attractorPos?: { x: number; z: number };
    disabled?: boolean; // If true, wave starts dormant/passive without HUD showing
}

export class EnemyWaveSystem implements System {
    readonly systemId = SystemID.ENEMY_WAVE_SYSTEM;
    id = 'enemy_wave_system';
    enabled = true;
    persistent = false;
    isFixedStep = true;

    private session: GameSessionLogic | null = null;

    // Wave chain state
    private waveQueue: EnemyWaveConfig[] = [];
    private currentWaveIndex: number = -1;
    private chainCallback: ((session?: any) => void) | null = null;
    private isChainActive: boolean = false;

    // Temporary scratch position to avoid allocation
    private readonly _scratchPos = new THREE.Vector3();
    private readonly _attractorScratch = new THREE.Vector3();

    init(session: GameSessionLogic): void {
        this.session = session;
    }

    public startWaveChain(waves: EnemyWaveConfig[], options?: (() => void) | { onWaveComplete?: () => void }): void {
        this.waveQueue = waves;
        this.currentWaveIndex = 0;
        if (typeof options === 'function') {
            this.chainCallback = options;
        } else if (options && typeof options.onWaveComplete === 'function') {
            this.chainCallback = options.onWaveComplete;
        } else {
            this.chainCallback = null;
        }
        this.isChainActive = true;
        this.startWave(0);
    }

    private startWave(index: number): void {
        if (!this.session || !this.session.state) return;
        const wave = this.waveQueue[index];
        if (!wave) {
            this.completeChain();
            return;
        }

        const sState = this.session.state.sectorState;
        sState.waveActive = true;
        sState.waveDisabled = wave.disabled || false;
        sState.waveName = wave.name;
        sState.waveKills = 0;

        let target = wave.spawns.length;
        if (wave.targetKills !== undefined) {
            target = wave.targetKills;
        } else if (wave.targetRatio !== undefined) {
            target = Math.ceil(wave.spawns.length * wave.targetRatio);
        }
        sState.waveTarget = target;

        sState.waveProgress = 0;

        // Spawn enemies
        const state = this.session.state;
        const ctx = this.session.sectorCtx;

        if (!ctx) return;

        const attractor = wave.attractorPos;
        if (attractor) {
            this._attractorScratch.set(attractor.x, 0, attractor.z);
        }

        for (let i = 0; i < wave.spawns.length; i++) {
            const spawnInfo = wave.spawns[i];
            this._scratchPos.set(spawnInfo.pos.x, 0, spawnInfo.pos.z);

            const prevLen = state.enemies.pool.length;
            ctx.spawnZombie(spawnInfo.type, this._scratchPos);

            // Tag the newly spawned enemy
            if (state.enemies.pool.length > prevLen) {
                const enemy = state.enemies.pool[state.enemies.pool.length - 1];
                if (enemy) {
                    enemy.isWaveEnemy = true;
                    // VINTERDÖD: Add a persistent blue glow to wave enemies to make them stand out
                    EffectManager.attachEffect(enemy.mesh, EffectType.WAVE_AURA);
                    if (attractor && !wave.disabled) {
                        enemy.state = AIState.CHASE;
                        enemy.awareness = 1.0;
                        enemy.lastHeardNoiseType = NoiseType.OTHER;
                        enemy.lastKnownPosition.copy(this._attractorScratch);
                    } else {
                        enemy.state = AIState.IDLE;
                        enemy.awareness = 0;
                    }
                }
            }
        }
    }

    public enableActiveWave(): void {
        if (!this.session || !this.session.state) return;
        const sState = this.session.state.sectorState;
        if (sState.waveDisabled) {
            sState.waveDisabled = false;

            const pool = this.session.state.enemies.pool;
            const len = pool.length;
            const simTime = this.session.engine.simTime;
            const playerPos = this.session.state.player.position;

            const wave = this.waveQueue[this.currentWaveIndex];
            const attractor = wave?.attractorPos;
            if (attractor) {
                this._attractorScratch.set(attractor.x, 0, attractor.z);
            }

            for (let i = 0; i < len; i++) {
                const enemy = pool[i];
                if (enemy && enemy.isWaveEnemy && enemy.deathState === 0) { // ALIVE
                    enemy.state = AIState.CHASE;
                    enemy.awareness = 1.0;
                    enemy.lastHeardNoiseType = NoiseType.OTHER;
                    if (attractor) {
                        enemy.lastKnownPosition.copy(this._attractorScratch);
                    } else {
                        enemy.lastKnownPosition.copy(playerPos);
                    }
                }
            }
        }
    }

    private completeChain(): void {
        this.isChainActive = false;
        this.waveQueue = [];
        this.currentWaveIndex = -1;

        if (this.session && this.session.state) {
            const sState = this.session.state.sectorState;
            sState.waveActive = false;
            sState.waveDisabled = false;
            sState.waveName = '';
            sState.waveKills = 0;
            sState.waveTarget = 0;
            sState.waveProgress = 0;
        }

        if (this.chainCallback) {
            this.chainCallback(this.session);
            this.chainCallback = null;
        }
    }

    public reset(): void {
        this.isChainActive = false;
        this.waveQueue = [];
        this.currentWaveIndex = -1;
        this.chainCallback = null;

        if (this.session && this.session.state) {
            const sState = this.session.state.sectorState;
            sState.waveActive = false;
            sState.waveDisabled = false;
            sState.waveName = '';
            sState.waveKills = 0;
            sState.waveTarget = 0;
            sState.waveProgress = 0;
        }
    }

    update(session: GameSessionLogic, delta: number): void {
        if (!this.isChainActive || !session.state) return;

        const sState = session.state.sectorState;
        if (!sState.waveActive) return;

        // Scan pool to count newly dead tagged wave enemies
        const pool = session.state.enemies.pool;
        const len = pool.length;

        for (let i = 0; i < len; i++) {
            const enemy = pool[i];
            if (enemy && enemy.isWaveEnemy) {
                if (enemy.hp <= 0 || enemy.deathState !== 0) { // EnemyDeathState.ALIVE is 0
                    enemy.isWaveEnemy = false;
                    sState.waveKills++;
                }
            }
        }

        // Update progress
        sState.waveProgress = sState.waveTarget > 0 ? (sState.waveKills / sState.waveTarget) : 0;

        // Check if wave is completed
        if (sState.waveKills >= sState.waveTarget) {
            this.currentWaveIndex++;
            if (this.currentWaveIndex < this.waveQueue.length) {
                this.startWave(this.currentWaveIndex);
            } else {
                this.completeChain();
            }
        }
    }

    clear(): void {
        this.session = null;
        this.waveQueue = [];
        this.currentWaveIndex = -1;
        this.chainCallback = null;
        this.isChainActive = false;
    }
}
