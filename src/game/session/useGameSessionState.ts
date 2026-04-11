import { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { GameCanvasProps, DeathPhase } from '../../game/session/SessionTypes';
import { SectorContext } from '../../game/session/SectorTypes';
import { WinterEngine } from '../../core/engine/WinterEngine';
import { GameSessionLogic } from './GameSessionLogic';
import { CinematicBubbleHandle } from '../../components/ui/hud/CinematicBubble';
import { InteractionType } from '../../systems/InteractionTypes';

export interface UIState {
    isSectorLoading: boolean;
    deathPhase: DeathPhase;
    cinematicActive: boolean;
    bubbleTailPosition: 'bottom' | 'top' | 'left' | 'right';
    currentLine: any;
    bossIntroActive: boolean;
    bossName: string;
    foundMemberName: string;
    interactionType: InteractionType;
    activeModal: 'armory' | 'spawner' | 'environment' | 'skills' | 'collectible' | null;
    collectibleId: string | null;
    interactionScreenPos: { x: number, y: number } | null;
    forceHideHUD: boolean;
    stationOverlay: string | null;
    zombieWaveActive?: boolean; // Just in case any legacy component expects it to exist in the UIState
}

export const useGameSessionState = (props: GameCanvasProps) => {
    // Top level engine refs
    const propsRef = useRef(props);
    useEffect(() => { propsRef.current = props; }, [props]);

    const engineRef = useRef<WinterEngine | null>(null);
    const gameSessionRef = useRef<GameSessionLogic | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const chatOverlayRef = useRef<HTMLDivElement>(null);
    const sectorContextRef = useRef<SectorContext | null>(null);

    // Core State Ref
    const stateRef = useRef<ReturnType<typeof GameSessionLogic.createInitialState>>(null!);
    if (!stateRef.current) {
        stateRef.current = GameSessionLogic.createInitialState(props);
    }

    // Modal / UI Sync Refs
    const activeModalRef = useRef<'armory' | 'spawner' | 'environment' | 'skills' | null>(null);
    const isBuildingSectorRef = useRef(true);
    const deathPhaseRef = useRef<DeathPhase>('NONE');
    const interactionTypeRef = useRef<InteractionType>(InteractionType.NONE);
    const lastInteractionPosRef = useRef<{ x: number, y: number } | null>(null);

    // Gameplay Logic Refs
    const activeBubbles = useRef<any[]>([]);
    const hasEndedSector = useRef(false);
    const collectedCluesRef = useRef<string[]>(props.stats.cluesFound || []);
    const distanceTraveledRef = useRef(0);
    const lastTeleportRef = useRef<number>(0);
    const lastDrawCallsRef = useRef(0);
    const hasPlayedIntroRef = useRef(false);
    const isMounted = useRef(false);
    const lastHeartbeatRef = useRef<number>(0);
    const bossIntroTimerRef = useRef<NodeJS.Timeout | null>(null);
    const gameContextRef = useRef<any>(null);
    const setupIdRef = useRef(0);
    const discoveryQueueRef = useRef<any[]>([]);

    // Geometry / Tracking Refs
    const prevPosRef = useRef<THREE.Vector3>(new THREE.Vector3());
    const hasSetPrevPosRef = useRef<boolean>(false);
    const playerGroupRef = useRef<THREE.Group>(new THREE.Group());
    const playerMeshRef = useRef<THREE.Object3D | null>(null);
    const bubbleRef = useRef<CinematicBubbleHandle>(null);
    const skyLightRef = useRef<THREE.DirectionalLight | null>(null);
    const skyLightOffsetRef = useRef<THREE.Vector3 | null>(null);
    const familyMemberRef = useRef<{ mesh: THREE.Group; } | null>(null);
    const activeFamilyMembers = useRef<any[]>([]);
    const flashlightRef = useRef<THREE.Group | null>(null);

    // Engine Control Refs
    const prevInputRef = useRef<boolean>(false);
    const cameraOverrideRef = useRef<any>(null);
    const bossIntroRef = useRef<{ active: boolean, bossMesh: THREE.Object3D | null, startTime: number }>({ active: false, bossMesh: null, startTime: 0 });

    // Cinematic Complex Ref
    const cinematicRef = useRef({
        active: false,
        startCamPos: new THREE.Vector3(),
        endCamPos: new THREE.Vector3(),
        startTime: 0,
        duration: 0,
        script: [] as any[],
        lineIndex: 0,
        speakers: [] as any[],
        cameraBasePos: new THREE.Vector3(),
        cameraLookAt: new THREE.Vector3(),
        lineStartTime: 0,
        lineDuration: 0,
        typingDuration: 0,
        fadingOut: false,
        rotationSpeed: 0,
        zoom: 0,
        midPoint: new THREE.Vector3(),
        relativeOffset: new THREE.Vector3(),
        customCameraOverride: false,
        tailPosition: { x: 0, y: 0 } as any
    });

    // --- REACT STATE TANK ---
    const [uiState, setUiState] = useState<UIState>({
        isSectorLoading: true,
        deathPhase: 'NONE',
        cinematicActive: false,
        bubbleTailPosition: 'bottom',
        currentLine: null,
        bossIntroActive: false,
        bossName: '',
        foundMemberName: '',
        interactionType: InteractionType.NONE,
        activeModal: null,
        collectibleId: null,
        interactionScreenPos: null,
        forceHideHUD: false,
        stationOverlay: null,
        zombieWaveActive: false
    });

    // Zero-GC partial state update (prevents re-renders if nothing actually changed)
    const updateUiState = (partial: Partial<UIState>) => {
        setUiState(prev => {
            let hasChanged = false;
            for (const key in partial) {
                if ((prev as any)[key] !== (partial as any)[key]) {
                    hasChanged = true;
                    break;
                }
            }
            if (!hasChanged) return prev;
            return { ...prev, ...partial };
        });
    };

    // Keep activeModal and deathPhase refs synced when they change via state
    useEffect(() => { activeModalRef.current = uiState.activeModal; }, [uiState.activeModal]);
    useEffect(() => { deathPhaseRef.current = uiState.deathPhase; }, [uiState.deathPhase]);
    useEffect(() => { interactionTypeRef.current = uiState.interactionType; }, [uiState.interactionType]);

    // Resets on sector change
    useEffect(() => {
        hasPlayedIntroRef.current = false;
        isBuildingSectorRef.current = true;
    }, [props.currentSector]);

    return {
        refs: {
            propsRef, engineRef, gameSessionRef, containerRef, chatOverlayRef, sectorContextRef,
            stateRef, activeModalRef, isBuildingSectorRef, deathPhaseRef, interactionTypeRef,
            lastInteractionPosRef, activeBubbles, hasEndedSector, collectedCluesRef, distanceTraveledRef,
            lastTeleportRef, lastDrawCallsRef, hasPlayedIntroRef, lastHeartbeatRef, bossIntroTimerRef,
            gameContextRef, setupIdRef, discoveryQueueRef, prevPosRef, hasSetPrevPosRef, playerGroupRef, playerMeshRef, bubbleRef, cinematicRef,
            skyLightRef, skyLightOffsetRef, prevInputRef, cameraOverrideRef, bossIntroRef, familyMemberRef, activeFamilyMembers,
            flashlightRef, isMounted
        },
        uiState,
        updateUiState,
        setUiState
    };
};