import crypto from "crypto";

const SWIM_MEMO_LENGTH = 16;
// NOTE: Please always use random bytes to avoid conflicts with other users
export const createMemo = () => crypto.randomBytes(SWIM_MEMO_LENGTH);
