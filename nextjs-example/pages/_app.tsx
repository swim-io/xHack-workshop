import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AppProps } from "next/app";
import { useState } from "react";

import { EvmWalletProvider } from "../contexts/EvmWalletProvider";
import { GetEvmConnectionProvider } from "../contexts/GetEvmProvider";

function MyApp({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // disable this since we fetch token balance from the wallet
            // and this causes a infinite loop of switchNetwork requests on metamask
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <EvmWalletProvider>
        <GetEvmConnectionProvider>
          <Component {...pageProps} />
        </GetEvmConnectionProvider>
      </EvmWalletProvider>
    </QueryClientProvider>
  );
}

export default MyApp;
