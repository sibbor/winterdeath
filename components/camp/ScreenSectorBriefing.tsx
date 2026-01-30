
import React, { useEffect, useState, useMemo } from 'react';
import { FAMILY_MEMBERS, MAP_THEMES, BOSSES } from '../../constants';
import { t } from '../../utils/i18n';
import CampModalLayout from './CampModalLayout';
import { soundManager } from '../../utils/sound';

interface ScreenSectorBriefingProps {
  mapIndex: number;
  onStart: () => void;
  onCancel: () => void;
  isExtracted: boolean;
  isBossDefeated: boolean;
}

const ScreenSectorBriefing: React.FC<ScreenSectorBriefingProps> = ({ mapIndex, onStart, onCancel, isExtracted, isBossDefeated }) => {
  const [text, setText] = useState("");
  
  const mapTheme = MAP_THEMES[mapIndex];
  const boss = BOSSES[mapIndex] || BOSSES[0];

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            onCancel();
        }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onCancel]);

  const fullText = useMemo(() => {
    const mapName = t(mapTheme.name);
    const bossName = t(boss.name);

    if (isExtracted) {
        return t('story.extracted_briefing', { map: mapName, boss: bossName });
    }

    switch (mapIndex) {
        case 0: // The Village (Loke)
            return t('story.prologue_text');
        
        case 1: // Bergrummet (Jordan)
            return t('story.intel_bunker_text');

        case 2: // Häglaredsmasten (Esmeralda)
            return t('story.intel_mast_text');

        case 3: // Bilfirman (Nathalie)
            return t('story.intel_scrap_text');

        case 4: // Hemma (Cats)
            return t('story.epilogue_text');

        default:
            return t('story.generic_briefing', { map: mapName, boss: bossName });
    }
  }, [isExtracted, mapIndex, mapTheme, boss]);

  useEffect(() => {
    let i = 0;
    setText("");
    const interval = setInterval(() => {
      setText(fullText.slice(0, i));
      i++;
      if (i > fullText.length) clearInterval(interval);
    }, 10);
    return () => clearInterval(interval);
  }, [fullText]);

  let statusText = t('ui.status') + ": " + t('ui.not_completed');
  let statusColorClass = "text-red-500 border-red-600 bg-red-900/20";
  
  if (isBossDefeated && isExtracted) {
      statusText = t('ui.status') + ": " + t('ui.sector_cleared');
      statusColorClass = "text-green-500 border-green-600 bg-green-900/20";
  } else if (isBossDefeated) {
      statusText = t('ui.status') + ": " + t('ui.threat_neutralized');
      statusColorClass = "text-yellow-500 border-yellow-600 bg-yellow-900/20";
  } else if (isExtracted) {
      statusText = t('ui.status') + ": " + t('ui.target_extracted');
      statusColorClass = "text-blue-500 border-blue-600 bg-blue-900/20";
  }

  const isMissing = !isExtracted;
  const familyStatusText = isMissing ? t('ui.missing') : t('ui.found');
  
  const familyBoxColor = isMissing 
      ? "text-red-500 border-red-600 bg-red-900/20" 
      : "text-green-500 border-green-600 bg-green-900/20";

  return (
    <CampModalLayout
        title={t('ui.mission_briefing')}
        borderColorClass="border-red-900"
        onClose={onCancel}
        closeLabel={t('ui.back_to_overview')}
        onConfirm={onStart}
        confirmLabel={t('ui.deploy_sector')}
    >
      <div className="flex flex-col h-full justify-between">
        <div>
            <h2 className="text-3xl text-slate-400 font-mono font-bold uppercase mt-2 mb-6">{t(mapTheme.name)}</h2>
            <div className="flex gap-4 mb-8">
                <div className={`px-4 py-2 text-sm font-bold uppercase border-2 tracking-wider skew-x-[-10deg] ${statusColorClass}`}>
                    <span className="block skew-x-[10deg]">{statusText}</span>
                </div>
                <div className={`px-4 py-2 text-sm font-bold uppercase border-2 tracking-wider skew-x-[-10deg] ${familyBoxColor}`}>
                    <span className="block skew-x-[10deg]">
                        {t('ui.unknown_family')} - {familyStatusText}
                    </span>
                </div>
            </div>
            
            <div className="min-h-[14rem] bg-gray-900/30 p-6 border border-gray-800 mb-8">
                <p className="font-mono text-white text-lg leading-relaxed whitespace-pre-line">
                {text}
                <span className="animate-pulse inline-block w-3 h-5 bg-white ml-1 align-middle"></span>
                </p>
            </div>
        </div>
      </div>
    </CampModalLayout>
  );
};

export default ScreenSectorBriefing;
