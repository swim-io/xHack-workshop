import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { BigNumber } from "ethers";
import { useContext } from "react";

import { GetEvmProviderContext } from "../contexts/GetEvmProvider";
import type { Chain } from "../types";

import { useEvmWallet } from "./useEvmWallet";

export const useEvmGasBalance = (
  chain: Chain,
): UseQueryResult<BigNumber | null, Error> => {
  const evmWallet = useEvmWallet();
  const getEvmProvider = useContext(GetEvmProviderContext);

  return useQuery(["evmGasBalance", chain, evmWallet.address], () => {
    if (!evmWallet.address) return null;
    return getEvmProvider(chain).getBalance(evmWallet.address);
  });
};
