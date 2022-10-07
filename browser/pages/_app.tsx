import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";

import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
// TODO replace with @solana/wallet-adapter-material-ui when it is released
// https://github.com/solana-labs/wallet-adapter/tree/master/packages/ui/material-ui
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolletWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AppProps } from "next/app";
import { useMemo, useState } from "react";

import { EvmWalletProvider } from "../contexts/EvmWalletProvider";
import { GetEvmConnectionProvider } from "../contexts/GetEvmProvider";

import "@solana/wallet-adapter-react-ui/styles.css";
import "../components/Wallets.css";

function MyApp({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(() => new QueryClient());

  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC;

  if (!endpoint) throw new Error("No solana RPC endpoint found in env");

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolletWalletAdapter()],
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <EvmWalletProvider>
        <WalletProvider wallets={wallets} autoConnect>
          <GetEvmConnectionProvider>
            <ConnectionProvider endpoint={endpoint}>
              <WalletModalProvider>
                <Component {...pageProps} />
              </WalletModalProvider>
            </ConnectionProvider>
          </GetEvmConnectionProvider>
        </WalletProvider>
      </EvmWalletProvider>
    </QueryClientProvider>
  );
}

export default MyApp;
