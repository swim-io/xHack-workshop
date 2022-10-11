import { CHAINS, CHAIN_ID_TO_NAME } from "@certusone/wormhole-sdk";
import type { ChainConfig, GasToken } from "@swim-io/core";
import { Env } from "@swim-io/core";
import { avalanche, bnb, ethereum, polygon } from "@swim-io/evm";
import { solana } from "@swim-io/solana";
import { TOKEN_PROJECTS_BY_ID } from "@swim-io/token-projects";
import { sortBy } from "lodash";

import type {
  Chain,
  ChainName,
  EvmChain,
  StableCoinTokenProject,
} from "./types";
import { isEvmChain, isStablecoin } from "./types";

export { CHAINS, CHAIN_ID_TO_NAME };

export const SUPPORTED_CHAINS: readonly ChainName[] = [
  "avalanche",
  "bsc",
  "ethereum",
  "polygon",
  "solana",
];

const env = Env.Testnet;

export const SOLANA_RPC_ENDPOINT = process.env.NEXT_PUBLIC_SOLANA_RPC;

export const EVM_RPC_URLS: Record<EvmChain, string | undefined> = {
  [CHAINS.avalanche]: process.env.NEXT_PUBLIC_AVALANCHE_RPC,
  [CHAINS.bsc]: process.env.NEXT_PUBLIC_BNB_RPC,
  [CHAINS.ethereum]: process.env.NEXT_PUBLIC_ETHEREUM_RPC,
  [CHAINS.polygon]: process.env.NEXT_PUBLIC_POLYGON_RPC,
};

export const EVM_CHAIN_CONFIGS: Record<EvmChain, ChainConfig> = {
  [CHAINS.avalanche]: avalanche.chains[env],
  [CHAINS.bsc]: bnb.chains[env],
  [CHAINS.ethereum]: ethereum.chains[env],
  [CHAINS.polygon]: polygon.chains[env],
};

export const SOLANA_CHAIN_CONFIG = solana.chains[env];

export const CHAIN_GAS_TOKEN: Record<Chain, GasToken> = {
  [CHAINS.avalanche]: avalanche.gasToken,
  [CHAINS.bsc]: bnb.gasToken,
  [CHAINS.ethereum]: ethereum.gasToken,
  [CHAINS.polygon]: polygon.gasToken,
  [CHAINS.solana]: solana.gasToken,
};

export const getChainStableCoins = (
  chain: Chain,
): readonly StableCoinTokenProject[] => {
  return sortBy(
    (isEvmChain(chain) ? EVM_CHAIN_CONFIGS[chain] : SOLANA_CHAIN_CONFIG).tokens
      .map((token) => TOKEN_PROJECTS_BY_ID[token.projectId])
      .filter(isStablecoin),
    "symbol",
  );
};

export const EVM_BYTES_LOG_LENGTH = 32;
export const SWIM_MEMO_LENGTH = 16;
export const WORMHOLE_ADDRESS_LENGTH = 32;
