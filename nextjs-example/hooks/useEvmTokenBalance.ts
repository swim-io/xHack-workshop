import { ERC20Token__factory } from "@swim-io/evm-contracts";
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { BigNumber } from "ethers";

import { CHAINS, CHAIN_CONFIGS, TOKEN_ADDRESSES } from "../config";
import type { ChainName } from "../types";

import { useEvmWallet } from "./useEvmWallet";

export const useEvmTokenBalance = (
  chainName: ChainName,
  tokenNumber: number,
): UseQueryResult<BigNumber | null, Error> => {
  const evmWallet = useEvmWallet();

  return useQuery(
    ["evmTokenBalance", chainName, tokenNumber, evmWallet.address],
    async () => {
      if (!evmWallet.address || !evmWallet.adapter.signer) return null;

      const chain = CHAINS[chainName];
      const chainTokens = TOKEN_ADDRESSES[chain];
      const tokenAddress = chainTokens[tokenNumber];

      if (!tokenAddress)
        throw new Error(
          `No token address found for chainName ${chainName}, tokenNumber ${tokenNumber}`,
        );

      await evmWallet.adapter.switchNetwork(CHAIN_CONFIGS[chain].chainId);

      const tokenContract = ERC20Token__factory.connect(
        tokenAddress,
        evmWallet.adapter.signer,
      );

      return tokenContract.balanceOf(evmWallet.address);
    },
  );
};
