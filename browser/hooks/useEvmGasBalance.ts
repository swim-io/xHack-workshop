import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { utils } from "ethers";
import { useContext } from "react";

import { GetEvmProviderContext } from "../contexts/GetEvmProvider";
import type { EvmChain } from "../lib/types";

import { useEvmWallet } from "./useEvmWallet";

export const useEvmGasBalance = (
  chain: EvmChain | null,
): UseQueryResult<string | null, Error> => {
  const evmWallet = useEvmWallet();
  const getEvmProvider = useContext(GetEvmProviderContext);

  return useQuery(
    ["evmGasBalance", chain, evmWallet.address],
    async () => {
      if (!evmWallet.address || chain === null) return null;

      const atomicBalance = await getEvmProvider(chain).getBalance(
        evmWallet.address,
      );
      return utils.formatEther(atomicBalance);
    },
    { enabled: chain !== null && evmWallet.address !== null },
  );
};
