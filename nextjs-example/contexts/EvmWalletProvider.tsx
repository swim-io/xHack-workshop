import type { EvmWeb3WalletAdapter } from "@swim-io/evm";
import { ethereumAdapters } from "@swim-io/evm";
import { createContext, useMemo } from "react";
import type { ReactElement, ReactNode } from "react";

const { MetaMaskAdapter } = ethereumAdapters;

export const EvmWalletProviderContext: React.Context<EvmWeb3WalletAdapter | null> =
  createContext<EvmWeb3WalletAdapter | null>(null);

export const EvmWalletProvider = ({
  children,
}: {
  readonly children?: ReactNode;
}): ReactElement => {
  const walletAdapter = useMemo(() => new MetaMaskAdapter(), []);

  return (
    <EvmWalletProviderContext.Provider value={walletAdapter}>
      {children}
    </EvmWalletProviderContext.Provider>
  );
};
