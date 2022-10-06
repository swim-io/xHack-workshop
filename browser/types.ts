import type { CHAINS } from "@certusone/wormhole-sdk";
import type { TokenProject, TokenProjectId } from "@swim-io/token-projects";
import type { Overrides } from "ethers";

export type ChainName = "avalanche" | "bsc" | "ethereum" | "polygon";
export type Chain = typeof CHAINS[ChainName];

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

export interface TxRecord {
  readonly txId: string;
  readonly chain: Chain;
}
