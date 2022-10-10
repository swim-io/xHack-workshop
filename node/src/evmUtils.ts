import type { Event } from "ethers";
import { Wallet, providers, utils } from "ethers";

import type { EvmChain } from "./config";
import { EVM_RPC_URLS } from "./config";

const EVM_BYTES_LOG_LENGTH = 32;
export const bufferToEvmBytesFilter = (buffer: Buffer): Buffer =>
  Buffer.concat([buffer, Buffer.alloc(EVM_BYTES_LOG_LENGTH - buffer.length)]);

export const logEvmEvent = (
  chain: "source" | "target",
  log: string,
  event: Event,
) => {
  console.table({
    label: `Propeller tx detected on ${chain} chain`,
    memo: log.replace(/^0x/, ""),
    tx: event.transactionHash,
    block: event.blockHash,
  });
};

export const createEvmProvider = (
  chain: EvmChain,
): providers.JsonRpcProvider => {
  const rpc = EVM_RPC_URLS[chain];
  if (!rpc) {
    console.error(`Missing RPC env variable for chain ${chain}`);
    process.exit(1);
  }
  return new providers.JsonRpcProvider(rpc);
};

export const createEvmKeypair = (
  mnemonic: string,
  hdPath: string,
): utils.HDNode => utils.HDNode.fromMnemonic(mnemonic).derivePath(hdPath);

export const createEvmWallet = (
  mnemonic: string,
  hdPath: string,
  provider: providers.JsonRpcProvider,
): Wallet => {
  const keypair = createEvmKeypair(mnemonic, hdPath);
  return new Wallet(keypair, provider);
};
