import { useIsMutating } from "@tanstack/react-query";

import { EVM_TO_EVM_SWAP_MUTATION_KEY } from "./useEvmToEvmSwap";
import { EVM_TO_SOLANA_SWAP_MUTATION_KEY } from "./useEvmToSolanaSwap";
import { SOLANA_TO_EVM_SWAP_MUTATION_KEY } from "./useSolanaToEvmSwap";

export const useHasSwapInProgress = () => {
  const count = useIsMutating({
    predicate: (mutation) =>
      mutation.options.mutationKey === EVM_TO_EVM_SWAP_MUTATION_KEY ||
      mutation.options.mutationKey === EVM_TO_SOLANA_SWAP_MUTATION_KEY ||
      mutation.options.mutationKey === SOLANA_TO_EVM_SWAP_MUTATION_KEY,
  });
  if (count > 1) {
    throw new Error("Only 1 swap can happen at a time");
  }
  return count === 1;
};
