import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import type { AppProps } from "next/app";

import { EvmWalletProvider } from "../contexts/EvmWalletProvider";
import { GetEvmConnectionProvider } from "../contexts/GetEvmProvider";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <EvmWalletProvider>
      <GetEvmConnectionProvider>
        <Component {...pageProps} />
      </GetEvmConnectionProvider>
    </EvmWalletProvider>
  );
}

export default MyApp;
