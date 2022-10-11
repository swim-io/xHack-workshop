import { providers } from "ethers";
import { createContext, useRef } from "react";
import type { ReactElement, ReactNode } from "react";

import { EVM_RPC_URLS } from "../lib/config";
import type { EvmChain } from "../lib/types";

export const GetEvmProviderContext: React.Context<
  (chain: EvmChain) => providers.JsonRpcProvider
> = createContext((_: EvmChain): providers.JsonRpcProvider => {
  throw new Error("Not initialized");
});

export const getProvider = (chain: EvmChain): providers.JsonRpcProvider => {
  const rpcUrl = EVM_RPC_URLS[chain];

  if (!rpcUrl) throw new Error(`No RPC URL was set for chain: ${chain}`);

  return new providers.JsonRpcProvider(rpcUrl);
};

export const GetEvmConnectionProvider = ({
  children,
}: {
  readonly children?: ReactNode;
}): ReactElement => {
  const evmProviders = useRef<ReadonlyMap<EvmChain, providers.JsonRpcProvider>>(
    new Map(),
  );

  const getEvmProvider = (chain: EvmChain) => {
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
