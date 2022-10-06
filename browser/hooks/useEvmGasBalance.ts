import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { utils } from "ethers";
import { useContext } from "react";

import { GetEvmProviderContext } from "../contexts/GetEvmProvider";
import type { Chain } from "../types";

import { useEvmWallet } from "./useEvmWallet";

export const useEvmGasBalance = (
  chain: Chain,
): UseQueryResult<string | null, Error> => {
  const evmWallet = useEvmWallet();
  const getEvmProvider = useContext(GetEvmProviderContext);

  return useQuery(["evmGasBalance", chain, evmWallet.address], async () => {
    if (!evmWallet.address) return null;
    const atomicBalance = await getEvmProvider(chain).getBalance(
      evmWallet.address,
    );
    return utils.formatEther(atomicBalance);
  });
};
