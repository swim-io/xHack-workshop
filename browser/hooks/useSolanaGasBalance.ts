import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { utils } from "ethers";

import { CHAINS, CHAIN_GAS_TOKEN } from "../lib/config";

export const useSolanaGasBalance = (): UseQueryResult<string | null, Error> => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  return useQuery(
    ["solanaGasBalance", publicKey ? publicKey.toBase58() : null],
    async () => {
      if (!publicKey) return null;

      const atomicBalance = await connection.getBalance(publicKey);
      return utils.formatUnits(
        atomicBalance,
        CHAIN_GAS_TOKEN[CHAINS.solana].decimals,
      );
    },
    { enabled: !!publicKey },
  );
};
