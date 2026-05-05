/**
 * VINTERDÖD: UI Event Ring Buffer
 * 
 * An asynchronous, Zero-GC communication bridge between the simulation loop
 * and the React UI. Uses a fixed-size circular buffer to store event packets.
 * 
 * Each packet is exactly 4 integers:
 * [TYPE_SMI, PARAM_1, PARAM_2, SIM_TIMESTAMP]
 */

export enum UIEventType {
    NONE = 0,
    DISCOVERY = 1,      // P1: Discovery ID (SMI), P2: Discovery Type (DiscoveryType)
    CHAT_BUBBLE = 2,    // P1: Content String Hash or ID, P2: Duration (ms)
    BOSS_SPAWN = 3,     // P1: Boss ID
    FAMILY_FOUND = 4,   // P1: Member ID
    FAMILY_FOLLOW = 5,  // P1: Member ID, P2: State (0=Stop, 1=Follow)
    XP_GAIN = 6,        // P1: Amount
    LEVEL_UP = 7,       // P1: New Level
    HUD_COMMAND = 8,    // P1: Command (0=HIDE, 1=SHOW)
    RELOAD_START = 9,   // P1: Duration (ms)
    AMMO_LOW = 10,      // P1: Remaining Ammo
    CHALLENGE_COMPLETE = 11, // P1: Challenge ID
}

const BUFFER_SIZE = 1024; // 256 events total (4 ints each)
const PACKET_SIZE = 4;

const buffer = new Int32Array(BUFFER_SIZE);
let head = 0; // Write index
let tail = 0; // Read index

// --- STRING POOL (Zero-GC Sidecar) ---
// We use a small circular pool of strings for things like Chat Bubbles
// p1 will store the index into this pool.
const stringPool = new Array<string>(64).fill('');
let stringPoolIdx = 0;

export const UIEventRingBuffer = {
    /**
     * Pushes a new event packet into the buffer.
     * Zero-GC: No allocations.
     */
    push: (type: UIEventType, p1: number = 0, p2: number = 0, timestamp: number = 0) => {
        // [VINTERDÖD] We use bitwise mask for wrap-around instead of modulo (%) 
        // to maximize performance in the hot loop.
        const writeIdx = head;
        const nextHead = (head + PACKET_SIZE) & (BUFFER_SIZE - 1);

        // Overflow check: If head catches tail, we drop the oldest event to maintain real-time stability
        if (nextHead === tail) {
            tail = (tail + PACKET_SIZE) & (BUFFER_SIZE - 1);
        }

        buffer[writeIdx] = type;
        buffer[writeIdx + 1] = p1;
        buffer[writeIdx + 2] = p2;
        buffer[writeIdx + 3] = timestamp || performance.now();

        head = nextHead;
    },

    /**
     * Helper to push an event that requires a string parameter.
     * Stores the string in a circular pool and passes the index as p1.
     */
    pushString: (type: UIEventType, str: string, p2: number = 0, timestamp: number = 0) => {
        const idx = stringPoolIdx;
        stringPool[idx] = str;
        stringPoolIdx = (stringPoolIdx + 1) & 63; // Wrap at 64

        UIEventRingBuffer.push(type, idx, p2, timestamp);
    },

    /**
     * Returns the string associated with a p1 index from the pool.
     */
    getString: (idx: number): string => {
        return stringPool[idx] || '';
    },

    /**
     * Polls the next available packet from the buffer.
     * Returns true if a packet was retrieved, false if empty.
     * Mutates the provided out array to avoid allocations.
     */
    poll: (out: Int32Array): boolean => {
        if (head === tail) return false;

        const readIdx = tail;
        out[0] = buffer[readIdx];
        out[1] = buffer[readIdx + 1];
        out[2] = buffer[readIdx + 2];
        out[3] = buffer[readIdx + 3];

        tail = (tail + PACKET_SIZE) & (BUFFER_SIZE - 1);
        return true;
    },

    /**
     * Clears the entire buffer.
     */
    clear: () => {
        head = 0;
        tail = 0;
        buffer.fill(0);
    }
};
