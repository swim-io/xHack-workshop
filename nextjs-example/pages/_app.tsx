import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import type { AppProps } from "next/app";

import { GetEvmConnectionProvider } from "../contexts/GetEvmProvider";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <GetEvmConnectionProvider>
      <Component {...pageProps} />
    </GetEvmConnectionProvider>
  );
}

export default MyApp;
