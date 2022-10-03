import { ERC20Token__factory } from "@swim-io/evm-contracts";
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { BigNumber } from "ethers";
import { useContext } from "react";

import { TOKEN_ADDRESSES } from "../config";
import { GetEvmProviderContext } from "../contexts/GetEvmProvider";
import type { Chain } from "../types";

import { useEvmWallet } from "./useEvmWallet";

export const useEvmTokenBalance = (
  chain: Chain,
  tokenNumber: number,
): UseQueryResult<BigNumber | null, Error> => {
  const evmWallet = useEvmWallet();
  const getEvmProvider = useContext(GetEvmProviderContext);

  return useQuery(
    ["evmTokenBalance", chain, tokenNumber, evmWallet.address],
    async () => {
      if (!evmWallet.address || !evmWallet.adapter.signer) return null;

      const chainTokens = TOKEN_ADDRESSES[chain];
      const tokenAddress = chainTokens[tokenNumber];

      if (!tokenAddress)
        throw new Error(
          `No token address found for chain ${chain}, tokenNumber ${tokenNumber}`,
        );

      const tokenContract = ERC20Token__factory.connect(
        tokenAddress,
        getEvmProvider(chain),
      );

      return tokenContract.balanceOf(evmWallet.address);
    },
  );
};
