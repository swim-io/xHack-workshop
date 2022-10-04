import { CHAINS, CHAIN_ID_TO_NAME } from "@certusone/wormhole-sdk";
import type { ChainConfig, GasToken } from "@swim-io/core";
import { Env } from "@swim-io/core";
import { bnb, ethereum } from "@swim-io/evm";
import { TOKEN_PROJECTS_BY_ID } from "@swim-io/token-projects";
import { sortBy } from "lodash";

import type { Chain, ChainName, StableCoinTokenProject } from "./types";
import { isStablecoin } from "./types";

export { CHAINS, CHAIN_ID_TO_NAME };
export const SUPPORTED_CHAINS: readonly ChainName[] = ["bsc", "ethereum"];

export const CHAIN_CONFIGS: Record<Chain, ChainConfig> = {
  [CHAINS.bsc]: bnb.chains[Env.Testnet],
  [CHAINS.ethereum]: ethereum.chains[Env.Testnet],
};

export const CHAIN_GAS_TOKEN: Record<Chain, GasToken> = {
  [CHAINS.bsc]: bnb.gasToken,
  [CHAINS.ethereum]: ethereum.gasToken,
};

export const getChainStableCoins = (
  chainName: ChainName,
): readonly StableCoinTokenProject[] => {
  return sortBy(
    CHAIN_CONFIGS[CHAINS[chainName]].tokens
      .map((token) => TOKEN_PROJECTS_BY_ID[token.projectId])
      .filter(isStablecoin),
    "symbol",
  );
};

export const EVM_BYTES_LOG_LENGTH = 32;
export const SWIM_MEMO_LENGTH = 16;
export const WORMHOLE_ADDRESS_LENGTH = 32;
