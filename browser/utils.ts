import type { Event } from "ethers";

import { EVM_BYTES_LOG_LENGTH, SWIM_MEMO_LENGTH } from "./config";
import type { Chain, TxRecord } from "./types";

export const generateId = (length = SWIM_MEMO_LENGTH): Buffer => {
  const idBytes = crypto.getRandomValues(new Uint8Array(length));
  return Buffer.from(idBytes);
};

export const bufferToBytesFilter = (buffer: Buffer): Buffer =>
  Buffer.concat([buffer, Buffer.alloc(EVM_BYTES_LOG_LENGTH - buffer.length)]);

export const handleEvent =
  (
    chain: "source" | "target",
    chainId: Chain,
    callback?: (txRecord: TxRecord) => void,
  ) =>
  (log: string, event: Event) => {
    console.table({
      label: `Propeller tx detected on ${chain} chain`,
      memo: log.replace(/^0x/, ""),
      tx: event.transactionHash,
      block: event.blockHash,
    });
    callback?.({ txId: event.transactionHash, chain: chainId });
  };

export const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error !== null && typeof error === "object" && "message" in error)
    return (error as any).message;
  return String(error);
};
