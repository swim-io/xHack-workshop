import { getAssociatedTokenAddress } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getTokenDetails } from "@swim-io/core";
import type { TokenProjectId } from "@swim-io/token-projects";
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";

import { SOLANA_CHAIN_CONFIG } from "../config";

export const useSolanaTokenBalance = (
  tokenProjectId: TokenProjectId,
  enabled: boolean,
): UseQueryResult<string | null, Error> => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  return useQuery(
    ["solanaTokenBalance", tokenProjectId, publicKey?.toBase58()],
    async () => {
      if (!publicKey) return null;

      const tokenDetails = getTokenDetails(SOLANA_CHAIN_CONFIG, tokenProjectId);

      if (!tokenDetails.address)
        throw new Error(
          `No token address found for chain solana, tokenProjectId ${tokenProjectId}`,
        );

      const solanaTokenAccount = await getAssociatedTokenAddress(
        new PublicKey(tokenDetails.address),
        publicKey,
      );

      try {
        const atomicBalance = await connection.getTokenAccountBalance(
          solanaTokenAccount,
        );
        return atomicBalance.value.uiAmountString;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("could not find account")
        ) {
          return "0";
        }
        throw error;
      }
    },
    { enabled: enabled && publicKey !== null },
  );
};
