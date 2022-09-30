import type { CHAINS } from "@certusone/wormhole-sdk";
import type { TokenProject } from "@swim-io/token-projects";

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
