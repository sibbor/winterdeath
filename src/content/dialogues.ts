/*
* ---------------------------------------------------------------------
* DON'T CHANGE THIS FILE - IT WILL FUCK UP THE DIALOGUE'S ORDER 
* ---------------------------------------------------------------------
*
*/
export const STORY_SCRIPTS: Record<number, { speaker: string; type?: string; text: string; trigger?: string }[]> = {
    0: [
        { speaker: 'Robert', text: "dialogue.0_0" },
        { speaker: 'Loke', text: "dialogue.0_1" },
        { speaker: 'Robert', text: "dialogue.0_2" },
        { speaker: 'Robert', type: 'gesture', text: "dialogue.0_3" },
        { speaker: 'Loke', text: "dialogue.0_4" },
        { speaker: 'Robert', text: "dialogue.0_5" },
        { speaker: 'Loke', text: "dialogue.0_6" },
        { speaker: 'Robert', text: "dialogue.0_7" },
        { speaker: 'Loke', text: "dialogue.0_8" },
        { speaker: 'Loke', type: 'gesture', text: "dialogue.0_9" },
        { speaker: 'Robert', text: "dialogue.0_10" },
        { speaker: 'Robert', text: "dialogue.0_11" },
        { speaker: 'Loke', text: "dialogue.0_12", trigger: 'family_follow,boss_start' }
    ],
    // Sector 2:
    1: [
        // Part 1: The Shelter Door
        { speaker: 'Robert', type: 'action', text: "dialogue.1_0" },
        { speaker: 'Unknown', text: "dialogue.1_1" },
        { speaker: 'Unknown', type: 'action', text: "dialogue.1_2" },
        { speaker: 'Robert', text: "dialogue.1_3" },
        { speaker: 'Unknown', text: "dialogue.1_4" },
        { speaker: 'Robert', text: "dialogue.1_5" },
        { speaker: 'Unknown', type: 'action', text: "dialogue.1_6" },
        { speaker: 'Unknown', text: "dialogue.1_7" },
        { speaker: 'Robert', text: "dialogue.1_8" },
        { speaker: 'Unknown', text: "dialogue.1_9" },
        { speaker: 'Unknown', text: "dialogue.1_10" },
        { speaker: 'Robert', text: "dialogue.1_11" },
        { speaker: 'Unknown', text: "dialogue.1_12" },
        { speaker: 'Robert', text: "dialogue.1_13" },
        { speaker: 'Unknown', text: "dialogue.1_14" },
        { speaker: 'Robert', text: "dialogue.1_15" },
        { speaker: 'Unknown', type: 'action', text: "dialogue.1_16", trigger: 'spawn_jordan,keep_camera' }
    ],
    // Sector 2 Part 2 (Triggered after door opens)
    102: [
        { speaker: 'Jordan', text: "dialogue.1_17" },
        { speaker: 'Loke', text: "dialogue.1_18" },
        { speaker: 'Robert', text: "dialogue.1_19" },
        { speaker: 'Jordan', text: "dialogue.1_20" },
        { speaker: 'Robert', text: "dialogue.1_21" },
        { speaker: 'Unknown', text: "dialogue.1_22" },
        { speaker: 'Unknown', type: 'action', text: "dialogue.1_23", trigger: 's2_conclusion,keep_camera' }
    ],
    // Sector 3:
    2: [
        { speaker: 'Robert', text: "dialogue.2_0" },
        { speaker: 'Esmeralda', text: "dialogue.2_1" },
        { speaker: 'Robert', text: "dialogue.2_2" },
        { speaker: 'Robert', text: "dialogue.2_3" },
        { speaker: 'Unknown', type: 'action', text: "dialogue.2_4" },
        { speaker: 'Esmeralda', text: "dialogue.2_5" },
        { speaker: 'Robert', text: "dialogue.2_6" },
        { speaker: 'Esmeralda', text: "dialogue.2_7" },
        { speaker: 'Esmeralda', type: 'action', text: "dialogue.2_8" },
        { speaker: 'Radio', type: 'sound', text: "dialogue.2_9" },
        { speaker: 'Robert', text: "dialogue.2_10" },
        { speaker: 'Radio', text: "dialogue.2_11" },
        { speaker: 'Robert', text: "dialogue.2_12" },
        { speaker: 'Robert', text: "dialogue.2_13", trigger: 'family_follow,boss_start' },
    ],
    // Sector 4
    3: [
        // Part 1: Gravel Path (20m)
        { speaker: 'Nathalie', text: "dialogue.3_0" },
        { speaker: 'Robert', text: "dialogue.3_1" },
        { speaker: 'Robert', text: "dialogue.3_2" },
        { speaker: 'Loke', text: "dialogue.3_3" },
        { speaker: 'Esmeralda', text: "dialogue.3_4" },
        { speaker: 'Jordan', text: "dialogue.3_5", trigger: 'close_segment' },

        // Part 2: RV40 (50m)
        { speaker: 'Nathalie', text: "dialogue.3_6" },
        { speaker: 'Robert', text: "dialogue.3_7" },
        { speaker: 'Nathalie', text: "dialogue.3_8" },
        { speaker: 'Robert', text: "dialogue.3_9" },
        { speaker: 'Nathalie', text: "dialogue.3_10" },
        { speaker: 'Robert', text: "dialogue.3_11" },
        { speaker: 'Nathalie', text: "dialogue.3_12" },
        { speaker: 'Robert', text: "dialogue.3_13", trigger: 'close_segment' },

        // Part 3: Gate (150m)
        { speaker: 'Robert', text: "dialogue.3_14" },
        { speaker: 'Loke, Esmeralda, Jordan', text: "dialogue.3_15" },
        { speaker: 'Robert', text: "dialogue.3_16" },
        { speaker: 'Nathalie', text: "dialogue.3_17" },
        { speaker: 'Robert', text: "dialogue.3_18" },
        { speaker: 'Robert', text: "dialogue.3_19" },
        { speaker: 'Barnen', text: "dialogue.3_20" },
        { speaker: 'Robert', text: "dialogue.3_21" },
        { speaker: 'Nathalie', text: "dialogue.3_22" },
        { speaker: 'Robert', text: "dialogue.3_23" },
        { speaker: 'Nathalie', text: "dialogue.3_24" },
        { speaker: 'Robert', text: "dialogue.3_25" },
        { speaker: 'Robert', text: "dialogue.3_26", trigger: 'family_follow,boss_start' }
    ]
};
