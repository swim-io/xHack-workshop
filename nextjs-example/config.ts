import { CHAINS } from "@certusone/wormhole-sdk";
import type { ChainConfig } from "@swim-io/core";
import { Env } from "@swim-io/core";
import { bnb, ethereum } from "@swim-io/evm";
import {
  TOKEN_PROJECTS,
  TOKEN_PROJECTS_BY_ID,
  TokenProjectId,
} from "@swim-io/token-projects";
import { sortBy } from "lodash";

import type { Chain, ChainName, StableCoinTokenProject } from "./types";
import { isStablecoin } from "./types";

export { CHAINS };
export const SUPPORTED_CHAINS: readonly ChainName[] = ["bsc", "ethereum"];

export const CHAIN_CONFIGS: Record<Chain, ChainConfig> = {
  [CHAINS.bsc]: bnb.chains[Env.Testnet],
  [CHAINS.ethereum]: ethereum.chains[Env.Testnet],
};

const BUSD = TOKEN_PROJECTS_BY_ID[TokenProjectId.Busd];
const USDT = TOKEN_PROJECTS_BY_ID[TokenProjectId.Usdt];
const USDC = TOKEN_PROJECTS_BY_ID[TokenProjectId.Usdc];

// TODO: Get from chain configs
export const TOKEN_ADDRESSES: Record<Chain, Record<number, string>> = {
  [CHAINS.bsc]: {
    [BUSD.tokenNumber as number]: "0x92934a8b10DDF85e81B65Be1D6810544744700dC",
    [USDT.tokenNumber as number]: "0x98529E942FD121d9C470c3d4431A008257E0E714",
  },
  [CHAINS.ethereum]: {
    [USDC.tokenNumber as number]: "0x45B167CF5b14007Ca0490dCfB7C4B870Ec0C0Aa6",
    [USDT.tokenNumber as number]: "0x996f42BdB0CB71F831C2eFB05Ac6d0d226979e5B",
  },
};

export const TOKEN_PROJECTS_STABLE_COINS: readonly StableCoinTokenProject[] =
  sortBy(TOKEN_PROJECTS.filter(isStablecoin), "symbol");
