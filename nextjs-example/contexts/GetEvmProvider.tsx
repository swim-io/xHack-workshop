import { providers } from "ethers";
import { createContext, useRef } from "react";
import type { ReactElement, ReactNode } from "react";

import { CHAINS } from "../config";
import type { Chain } from "../types";

const RPC_URLS: Record<Chain, string | undefined> = {
  [CHAINS.bsc]: process.env.NEXT_PUBLIC_BNB_RPC,
  [CHAINS.ethereum]: process.env.NEXT_PUBLIC_ETHEREUM_RPC,
};

export const GetEvmProviderContext: React.Context<
  (chain: Chain) => providers.JsonRpcProvider
> = createContext((_: Chain): providers.JsonRpcProvider => {
  throw new Error("Not initialized");
});

export const getProvider = (chain: Chain): providers.JsonRpcProvider => {
  const rpcUrl = RPC_URLS[chain];

  if (!rpcUrl) throw new Error(`No RPC URL was set for chain: ${chain}`);

  return new providers.JsonRpcProvider(rpcUrl);
};

export const GetEvmConnectionProvider = ({
  children,
}: {
  readonly children?: ReactNode;
}): ReactElement => {
  const evmProviders = useRef<ReadonlyMap<Chain, providers.JsonRpcProvider>>(
    new Map(),
  );

  const getEvmProvider = (chain: Chain) => {
    const existingEvmProvider = evmProviders.current.get(chain);
    if (existingEvmProvider) {
      return existingEvmProvider;
    }

    const provider = getProvider(chain);

    const newState = new Map(evmProviders.current);
    newState.set(chain, provider);
    // eslint-disable-next-line functional/immutable-data
    evmProviders.current = newState;
    return provider;
  };

  return (
    <GetEvmProviderContext.Provider value={getEvmProvider}>
      {children}
    </GetEvmProviderContext.Provider>
  );
};
