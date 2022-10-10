import { CHAINS } from "@certusone/wormhole-sdk";
import type { TokenProject, TokenProjectId } from "@swim-io/token-projects";
import type { Overrides } from "ethers";

export type ChainName = "avalanche" | "bsc" | "ethereum" | "polygon" | "solana";
export type Chain = typeof CHAINS[ChainName];
export type EvmChain = Exclude<Chain, typeof CHAINS.solana>;
export type SolanaChain = typeof CHAINS.solana;

export const isEvmChain = (chain: Chain): chain is EvmChain =>
  chain !== CHAINS.solana;

export const isSolanaChain = (chain: Chain): chain is SolanaChain =>
  chain === CHAINS.solana;

export interface StableCoinTokenProject extends TokenProject {
  readonly isStablecoin: true;
  readonly tokenNumber: number;
  readonly isLp: false;
}

export const isStablecoin = (
  tokenProject: TokenProject,
): tokenProject is StableCoinTokenProject => {
  return (
    !tokenProject.isLp &&
    tokenProject.isStablecoin &&
    tokenProject.tokenNumber !== null
  );
};
export interface SwapParameters {
  readonly sourceChain: Chain;
  readonly sourceTokenProjectId: TokenProjectId;
  readonly targetChain: Chain;
  readonly targetTokenProjectId: TokenProjectId;
  readonly inputAmount: string;
  readonly gasKickStart: boolean;
  readonly maxPropellerFee: string;
  readonly overrides?: Overrides;
}

export interface EvmToEvmSwapParameters extends SwapParameters {
  readonly sourceChain: EvmChain;
  readonly targetChain: EvmChain;
}

export interface SolanaToEvmParameters extends SwapParameters {
  readonly sourceChain: SolanaChain;
  readonly targetChain: EvmChain;
}

export const isEvmToEvmSwap = (
  params: SwapParameters,
): params is EvmToEvmSwapParameters =>
  isEvmChain(params.sourceChain) && isEvmChain(params.targetChain);

export const isSolanaToEvmSwap = (
  params: SwapParameters,
): params is SolanaToEvmParameters =>
  isSolanaChain(params.sourceChain) && isEvmChain(params.targetChain);

export interface TxRecord {
  readonly txId: string;
  readonly chain: Chain;
}
