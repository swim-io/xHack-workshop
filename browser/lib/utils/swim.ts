export const SWIM_MEMO_LENGTH = 16;

export const generateId = (length = SWIM_MEMO_LENGTH): Buffer => {
  const idBytes = crypto.getRandomValues(new Uint8Array(length));
  return Buffer.from(idBytes);
};
