import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useUIEventBridge } from '../../../hooks/useUIEventBridge';
import { UIEventType } from '../../../systems/ui/UIEventRingBuffer';
import { t } from '../../../utils/i18n';
import { UiSounds } from '../../../utils/audio/AudioLib';
// 1. VI IMPORTERAR VÅR NYA MASTER-LISTA OCH INTERFACE
import { GAME_CHALLENGES, ChallengeDef } from '../../../content/ChallengeTypes';

const ChallengeTracker: React.FC = () => {
    // 2. Använder det nya interfacet
    const [activeChallenge, setActiveChallenge] = useState<ChallengeDef | null>(null);
    const timeoutRef = useRef<any>(null);

    // 3. Städar upp timeouten om komponenten dör (som vi pratade om tidigare)
    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    useUIEventBridge(useCallback((type, p1) => {
        if (type === UIEventType.CHALLENGE_COMPLETE) {
            // 4. HÄMTAR DIREKT FRÅN VÅR SUPERSNABBA ARRAY! (p1 är ChallengeID)
            const challenge = GAME_CHALLENGES[p1];

            if (challenge) {
                setActiveChallenge(challenge);
                UiSounds.playDiscovery();

                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                timeoutRef.current = setTimeout(() => {
                    setActiveChallenge(null);
                }, 5000);
            }
        }
    }, []));

    if (!activeChallenge) return null;

    return (
        <div className="fixed top-1/4 right-8 z-[100] pointer-events-none animate-challengeSlideIn">
            <div className="bg-black/90 border-l-4 border-yellow-500 p-4 shadow-2xl backdrop-blur-sm hud-gritty-base">
                <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase text-yellow-500 tracking-[0.3em] mb-1">
                        {t('ui.challenge_complete')}
                    </span>
                    <h3 className="text-xl font-bold text-white uppercase tracking-tighter italic">
                        {/* 5. Använder nycklarna från nya datastrukturen */}
                        {t(activeChallenge.titleKey)}
                    </h3>
                    <p className="text-xs text-white/60 font-medium max-w-[200px] leading-tight mt-1">
                        {t(activeChallenge.descriptionKey)}
                    </p>
                </div>
                <div className="absolute inset-0 hud-noise-overlay opacity-10 pointer-events-none" />
            </div>
        </div>
    );
};

export default ChallengeTracker;