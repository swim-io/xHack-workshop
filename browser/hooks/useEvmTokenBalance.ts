import { getTokenDetails } from "@swim-io/core";
import { ERC20Token__factory } from "@swim-io/evm-contracts";
import type { TokenProjectId } from "@swim-io/token-projects";
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { utils } from "ethers";
import { useContext } from "react";

import { CHAIN_CONFIGS } from "../config";
import { GetEvmProviderContext } from "../contexts/GetEvmProvider";
import type { Chain } from "../types";

import { useEvmWallet } from "./useEvmWallet";

export const useEvmTokenBalance = (
  chain: Chain,
  tokenProjectId: TokenProjectId,
): UseQueryResult<string | null, Error> => {
  const evmWallet = useEvmWallet();
  const getEvmProvider = useContext(GetEvmProviderContext);

  return useQuery(
    ["evmTokenBalance", chain, tokenProjectId, evmWallet.address],
    async () => {
      if (!evmWallet.address) return null;

      const chainConfig = CHAIN_CONFIGS[chain];
      const tokenDetails = getTokenDetails(chainConfig, tokenProjectId);

      if (!tokenDetails.address)
        throw new Error(
          `No token address found for chain ${chain}, tokenProjectId ${tokenProjectId}`,
        );

      const tokenContract = ERC20Token__factory.connect(
        tokenDetails.address,
        getEvmProvider(chain),
      );

      const atomicBalance = await tokenContract.balanceOf(evmWallet.address);
      const humanBalance = utils.formatUnits(
        atomicBalance.toString(),
        tokenDetails.decimals,
      );
      return humanBalance;
    },
  );
};
