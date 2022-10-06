import type { Connection } from "@solana/web3.js";
import { useContext } from "react";

import { SolanaConnectionProviderContext } from "../contexts/SolanaProvider";

export const useSolanaConnection = (): Connection => {
  const connection = useContext(SolanaConnectionProviderContext);
  if (!connection) throw new Error("Missing SolanaConnectionProviderContext");
  return connection;
};
