import { CHAINS, CHAIN_ID_TO_NAME } from "@certusone/wormhole-sdk";
import type { ChainConfig, GasToken } from "@swim-io/core";
import { Env } from "@swim-io/core";
import { avalanche, bnb, ethereum, polygon } from "@swim-io/evm";
import { solana } from "@swim-io/solana";
import type { TokenProjectId } from "@swim-io/token-projects";
import { TOKEN_PROJECTS_BY_ID } from "@swim-io/token-projects";
import { sortBy } from "lodash";

import type {
  Chain,
  ChainName,
  EvmChain,
  StableCoinTokenProject,
} from "./types";
import { isStablecoin, isEvmChain } from "./types";

export { CHAINS, CHAIN_ID_TO_NAME };

export const SUPPORTED_CHAINS: readonly ChainName[] = [
  "avalanche",
  "bsc",
  "ethereum",
  "polygon",
  "solana",
];

const env = Env.Testnet;

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
