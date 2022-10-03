import type { CHAINS } from "@certusone/wormhole-sdk";
import type { TokenProject } from "@swim-io/token-projects";
import type { BigNumber, Overrides } from "ethers";

export type ChainName = "bsc" | "ethereum";
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
export interface SwapArgs {
  readonly sourceChain: Chain;
  readonly sourceTokenNumber: number;
  readonly targetChain: Chain;
  readonly targetTokenNumber: number;
  readonly inputAmount: BigNumber;
  readonly gasKickStart: boolean;
  readonly maxPropellerFee: BigNumber;
  readonly overrides?: Overrides;
}

export interface TxRecord {
  readonly txId: string;
  readonly chain: Chain;
}
