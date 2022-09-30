import type { EvmWeb3WalletAdapter } from "@swim-io/evm";
import { useContext, useEffect, useState } from "react";

import { EvmWalletProviderContext } from "../contexts/EvmWalletProvider";

type EvmWeb3WalletConnected = {
  readonly adapter: EvmWeb3WalletAdapter;
  readonly isConnected: true;
  readonly address: string;
};

type EvmWeb3WalletDisconnected = {
  readonly adapter: EvmWeb3WalletAdapter;
  readonly isConnected: false;
  readonly address: null;
};

type EvmWeb3Wallet = EvmWeb3WalletConnected | EvmWeb3WalletDisconnected;

export const useEvmWallet = (): EvmWeb3Wallet => {
  const [_, setState] = useState(0);
  const evmWalletAdapter = useContext(EvmWalletProviderContext);

  if (!evmWalletAdapter) throw new Error("Missing EvmWalletProvider");

  const isConnected = !!evmWalletAdapter.address;

  useEffect(() => {
    const reRender = () => setState((prev) => prev + 1);
    evmWalletAdapter.on("connect", reRender);
    evmWalletAdapter.on("disconnect", reRender);
    evmWalletAdapter.on("error", reRender);
  }, [evmWalletAdapter]);

  if (isConnected) {
    if (!evmWalletAdapter.address)
      throw new Error("Evm wallet was connected but with no address");

    return {
      adapter: evmWalletAdapter,
      isConnected,
      address: evmWalletAdapter.address,
    };
  }

  return {
    adapter: evmWalletAdapter,
    isConnected: false,
    address: null,
  };
};
