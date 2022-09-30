import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { BigNumber, providers } from "ethers";

import type { ChainName } from "../types";

export const useEvmGasBalance = (
  chainName: ChainName,
  provider: providers.JsonRpcProvider,
  address: string | null,
): UseQueryResult<BigNumber | null, Error> => {
  return useQuery([chainName, address], () => {
    if (!address) return null;
    return provider.getBalance(address);
  });
};
