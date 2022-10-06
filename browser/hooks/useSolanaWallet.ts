import type { SolanaWalletAdapter } from "@swim-io/solana";
import { useContext, useEffect, useState } from "react";

import { SolanaWalletProviderContext } from "../contexts/SolanaWalletProvider";

type SolanaWeb3Wallet = {
  readonly adapter: SolanaWalletAdapter;
  readonly address: string | null;
};

export const useSolanaWallet = (): SolanaWeb3Wallet => {
  const [, setState] = useState(0);
  const solanaWalletAdapter = useContext(SolanaWalletProviderContext);

  if (!solanaWalletAdapter) throw new Error("Missing SolanaWalletProvider");

  useEffect(() => {
    const reRender = () => setState((prev) => prev + 1);
    solanaWalletAdapter.on("connect", reRender);
    solanaWalletAdapter.on("disconnect", reRender);
    solanaWalletAdapter.on("error", reRender);
  }, [solanaWalletAdapter]);

  return {
    adapter: solanaWalletAdapter,
    address: solanaWalletAdapter.address,
  };
};
