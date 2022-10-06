import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AppProps } from "next/app";
import { useState } from "react";

import { EvmWalletProvider } from "../contexts/EvmWalletProvider";
import { GetEvmConnectionProvider } from "../contexts/GetEvmProvider";
import { SolanaConnectionProvider } from "../contexts/SolanaProvider";
import { SolanaWalletProvider } from "../contexts/SolanaWalletProvider";

function MyApp({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <EvmWalletProvider>
        <SolanaWalletProvider>
          <GetEvmConnectionProvider>
            <SolanaConnectionProvider>
              <Component {...pageProps} />
            </SolanaConnectionProvider>
          </GetEvmConnectionProvider>
        </SolanaWalletProvider>
      </EvmWalletProvider>
    </QueryClientProvider>
  );
}

export default MyApp;
