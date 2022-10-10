import { CHAINS } from "@certusone/wormhole-sdk";
import type { ChainConfig } from "@swim-io/core";
import { Env } from "@swim-io/core";
import { avalanche, bnb, ethereum, polygon } from "@swim-io/evm";
import { solana } from "@swim-io/solana";
import type { TokenProjectId } from "@swim-io/token-projects";

export type SupportedEvmChain = "avalanche" | "bsc" | "ethereum" | "polygon";
export type EvmChain = typeof CHAINS[SupportedEvmChain];

export type SupportedSolanaToken =
  | TokenProjectId.SwimUsd
  | TokenProjectId.Usdc
  | TokenProjectId.Usdt;

export const EVM_RPC_URLS: Record<EvmChain, string | undefined> = {
  [CHAINS.avalanche]: process.env.AVALANCHE_RPC,
  [CHAINS.bsc]: process.env.BNB_RPC,
  [CHAINS.ethereum]: process.env.ETHEREUM_RPC,
  [CHAINS.polygon]: process.env.POLYGON_RPC,
};

export const SOLANA_RPC_URL = process.env.SOLANA_RPC;

export const EVM_CHAIN_CONFIGS: Record<EvmChain, ChainConfig> = {
  [CHAINS.avalanche]: avalanche.chains[Env.Testnet],
  [CHAINS.bsc]: bnb.chains[Env.Testnet],
  [CHAINS.ethereum]: ethereum.chains[Env.Testnet],
  [CHAINS.polygon]: polygon.chains[Env.Testnet],
};

export const SOLANA_CHAIN_CONFIG = solana.chains[Env.Testnet];
