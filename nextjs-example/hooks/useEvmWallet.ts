import type { EvmWeb3WalletAdapter } from "@swim-io/evm";
import { useContext, useEffect, useState } from "react";

import { EvmWalletProviderContext } from "../contexts/EvmWalletProvider";

type EvmWeb3Wallet = {
  readonly adapter: EvmWeb3WalletAdapter;
  readonly address: string | null;
};

export const useEvmWallet = (): EvmWeb3Wallet => {
  const [, setState] = useState(0);
  const evmWalletAdapter = useContext(EvmWalletProviderContext);

  if (!evmWalletAdapter) throw new Error("Missing EvmWalletProvider");

  useEffect(() => {
    const reRender = () => setState((prev) => prev + 1);
    evmWalletAdapter.on("connect", reRender);
    evmWalletAdapter.on("disconnect", reRender);
    evmWalletAdapter.on("error", reRender);
  }, [evmWalletAdapter]);

  return {
    adapter: evmWalletAdapter,
    address: evmWalletAdapter.address,
  };
};
