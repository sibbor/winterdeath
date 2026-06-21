import { DialogueLineType, BossID } from '../game/session/SectorTypes';
import { FamilyMemberID } from './constants';
import { TriggerActionType, TriggerAction } from '../types/TriggerTypes';

export interface CinematicLine {
    speaker: FamilyMemberID;
    type?: DialogueLineType;
    text: string;
    trigger?: (TriggerActionType | TriggerAction)[];
    duration?: number;
    typingDuration?: number;
    tail?: 'bottom' | 'top' | 'left' | 'right';
}

// Record<SectorID, Record<DialogueID, CinematicLine[]>>
export const STORY_SCRIPTS: Record<number, Record<number, CinematicLine[]>> = {

    // ==========================================
    // SECTOR 0
    // ==========================================
    0: {
        0: [
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.0_0" },
            { speaker: FamilyMemberID.LOKE, text: "dialogue.0_1" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.0_2" },
            { speaker: FamilyMemberID.ROBERT, type: DialogueLineType.GESTURE, text: "dialogue.0_3" },
            { speaker: FamilyMemberID.LOKE, text: "dialogue.0_4" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.0_5" },
            { speaker: FamilyMemberID.LOKE, text: "dialogue.0_6" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.0_7" },
            { speaker: FamilyMemberID.LOKE, text: "dialogue.0_8" },
            { speaker: FamilyMemberID.LOKE, type: DialogueLineType.GESTURE, text: "dialogue.0_9" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.0_10" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.0_11" },
            {
                speaker: FamilyMemberID.LOKE, text: "dialogue.0_12",
                trigger: [TriggerActionType.FAMILY_MEMBER_FOUND, TriggerActionType.FAMILY_MEMBER_FOLLOW, { type: TriggerActionType.SPAWN_BOSS, payload: { bossId: BossID.SECTOR_0 } }]
            }
        ]
    },

    // ==========================================
    // SECTOR 1
    // ==========================================
    1: {
        // Part 1: The Shelter Door
        0: [
            //{ speaker: FamilyMemberID.ROBERT, type: DialogueLineType.ACTION, text: "dialogue.1_0" },
            { speaker: FamilyMemberID.UNKNOWN, text: "dialogue.1_1" },
            { speaker: FamilyMemberID.UNKNOWN, type: DialogueLineType.ACTION, text: "dialogue.1_2" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.1_3" },
            { speaker: FamilyMemberID.UNKNOWN, text: "dialogue.1_4" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.1_5" },
            { speaker: FamilyMemberID.UNKNOWN, type: DialogueLineType.ACTION, text: "dialogue.1_6" },
            { speaker: FamilyMemberID.UNKNOWN, text: "dialogue.1_7" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.1_8" },
            { speaker: FamilyMemberID.UNKNOWN, text: "dialogue.1_9" },
            { speaker: FamilyMemberID.UNKNOWN, text: "dialogue.1_10" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.1_11" },
            { speaker: FamilyMemberID.UNKNOWN, text: "dialogue.1_12" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.1_13" },
            { speaker: FamilyMemberID.UNKNOWN, text: "dialogue.1_14" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.1_15" },
            {
                speaker: FamilyMemberID.UNKNOWN, type: DialogueLineType.ACTION, text: "dialogue.1_16",
                trigger: [{ type: TriggerActionType.SET_SECTOR_FLAG, payload: { flag: 'SPAWN_JORDAN' } }]
            }
        ],
        // Part 2: Jordan appears
        1: [
            { speaker: FamilyMemberID.JORDAN, text: "dialogue.1_17" },
            { speaker: FamilyMemberID.LOKE, text: "dialogue.1_18" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.1_19" },
            { speaker: FamilyMemberID.LOKE, text: "dialogue.1_20" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.1_21" },
            { speaker: FamilyMemberID.UNKNOWN, text: "dialogue.1_22" },
            {
                speaker: FamilyMemberID.UNKNOWN, type: DialogueLineType.ACTION, text: "dialogue.1_23",
                trigger: [
                    TriggerActionType.FAMILY_MEMBER_FOUND,
                    TriggerActionType.FAMILY_MEMBER_FOLLOW,
                    { type: TriggerActionType.SET_SECTOR_FLAG, payload: { flag: 'CLOSE_DOORS' } }
                ]
            }
        ]
    },

    // ==========================================
    // SECTOR 2
    // ==========================================
    2: {
        0: [
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.2_0" },
            { speaker: FamilyMemberID.ESMERALDA, text: "dialogue.2_1" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.2_2" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.2_3" },
            { speaker: FamilyMemberID.UNKNOWN, type: DialogueLineType.ACTION, text: "dialogue.2_4" },
            { speaker: FamilyMemberID.ESMERALDA, text: "dialogue.2_5" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.2_6" },
            { speaker: FamilyMemberID.ESMERALDA, text: "dialogue.2_7" },
            { speaker: FamilyMemberID.ESMERALDA, type: DialogueLineType.ACTION, text: "dialogue.2_8" },
            { speaker: FamilyMemberID.RADIO, type: DialogueLineType.SOUND, text: "dialogue.2_9" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.2_10" },
            { speaker: FamilyMemberID.RADIO, text: "dialogue.2_11" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.2_12" },
            {
                speaker: FamilyMemberID.ROBERT, text: "dialogue.2_13",
                trigger: [
                    TriggerActionType.FAMILY_MEMBER_FOUND,
                    TriggerActionType.FAMILY_MEMBER_FOLLOW,
                    { type: TriggerActionType.SPAWN_BOSS, payload: { bossId: BossID.SECTOR_2 } }
                ]
            }
        ],
        // TODO: remove this and swap it out for a ChatBubble 
        1: [
            { speaker: FamilyMemberID.ROBERT, text: "pois.2.0.reaction", duration: 13000 }
        ]
    },

    // ==========================================
    // SECTOR 3
    // ==========================================
    3: {
        // Part 1
        0: [
            { speaker: FamilyMemberID.NATHALIE, text: "dialogue.3_0" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.3_1" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.3_2" },
            { speaker: FamilyMemberID.LOKE, text: "dialogue.3_3" },
            { speaker: FamilyMemberID.ESMERALDA, text: "dialogue.3_4" },
            { speaker: FamilyMemberID.JORDAN, text: "dialogue.3_5", trigger: [] }
        ],
        // Part 2
        1: [
            { speaker: FamilyMemberID.NATHALIE, text: "dialogue.3_6" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.3_7" },
            { speaker: FamilyMemberID.NATHALIE, text: "dialogue.3_8" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.3_9" },
            { speaker: FamilyMemberID.NATHALIE, text: "dialogue.3_10" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.3_11" },
            { speaker: FamilyMemberID.NATHALIE, text: "dialogue.3_12" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.3_13", trigger: [] }
        ],
        // Part 3
        2: [
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.3_14" },
            { speaker: FamilyMemberID.LOKE, text: "dialogue.3_15" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.3_16" },
            { speaker: FamilyMemberID.NATHALIE, text: "dialogue.3_17" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.3_18" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.3_19" },
            { speaker: FamilyMemberID.LOKE, text: "dialogue.3_20" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.3_21" },
            { speaker: FamilyMemberID.NATHALIE, text: "dialogue.3_22" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.3_23" },
            { speaker: FamilyMemberID.NATHALIE, text: "dialogue.3_24" },
            { speaker: FamilyMemberID.ROBERT, text: "dialogue.3_25" },
            {
                speaker: FamilyMemberID.ROBERT, text: "dialogue.3_26",
                trigger: [
                    TriggerActionType.FAMILY_MEMBER_FOUND,
                    TriggerActionType.FAMILY_MEMBER_FOLLOW,
                    { type: TriggerActionType.SET_SECTOR_FLAG, payload: { flag: 'RUSH_TO_NATHALIE' } },
                    { type: TriggerActionType.SPAWN_BOSS, payload: { bossId: BossID.SECTOR_3 } }
                ]
            }
        ]
    }
};
