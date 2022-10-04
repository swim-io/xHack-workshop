import type { Event } from "ethers";

import { EVM_BYTES_LOG_LENGTH, SWIM_MEMO_LENGTH } from "./config";
import type { Chain, TxRecord } from "./types";

export const generateId = (length = SWIM_MEMO_LENGTH): Buffer => {
  const idBytes = crypto.getRandomValues(new Uint8Array(length));
  return Buffer.from(idBytes);
};

export const bufferToBytesFilter = (buffer: Buffer): Buffer =>
  Buffer.concat([buffer, Buffer.alloc(EVM_BYTES_LOG_LENGTH - buffer.length)]);

export const logEvent =
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
    callback && callback({ txId: event.transactionHash, chain: chainId });
  };
