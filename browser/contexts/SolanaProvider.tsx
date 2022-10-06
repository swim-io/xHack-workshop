import { Connection } from "@solana/web3.js";
import type { ReactElement, ReactNode } from "react";
import { createContext, useMemo } from "react";

export const SolanaConnectionProviderContext: React.Context<Connection | null> =
  createContext<Connection | null>(null);

export const SolanaConnectionProvider = ({
  children,
}: {
  readonly children?: ReactNode;
}): ReactElement => {
  const connection = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SOLANA_RPC;
    if (!url) throw new Error("No RPC URL was set for solana");

    return new Connection(url);
  }, []);

  return (
    <SolanaConnectionProviderContext.Provider value={connection}>
      {children}
    </SolanaConnectionProviderContext.Provider>
  );
};
