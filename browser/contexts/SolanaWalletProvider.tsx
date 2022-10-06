import type { SolanaWalletAdapter } from "@swim-io/solana";
import { solanaAdapters } from "@swim-io/solana";
import { createContext, useMemo } from "react";
import type { ReactElement, ReactNode } from "react";

const { PhantomAdapter } = solanaAdapters;

export const SolanaWalletProviderContext: React.Context<SolanaWalletAdapter | null> =
  createContext<SolanaWalletAdapter | null>(null);

export const SolanaWalletProvider = ({
  children,
}: {
  readonly children?: ReactNode;
}): ReactElement => {
  const walletAdapter = useMemo(() => new PhantomAdapter(), []);

  return (
    <SolanaWalletProviderContext.Provider value={walletAdapter}>
      {children}
    </SolanaWalletProviderContext.Provider>
  );
};
