import type { Event } from "ethers";

import type { Chain, TxRecord } from "../types";

const EVM_BYTES_LOG_LENGTH = 32;

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
