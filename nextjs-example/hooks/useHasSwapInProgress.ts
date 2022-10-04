import { useIsMutating } from "@tanstack/react-query";

import { EVM_TO_EVM_SWAP_MUTATION_KEY } from "./useEvmToEvmSwap";

export const useHasSwapInProgress = () => {
  const count = useIsMutating({
    predicate: (mutation) =>
      mutation.options.mutationKey === EVM_TO_EVM_SWAP_MUTATION_KEY,
  });
  if (count > 1) {
    throw new Error("Only 1 swap can happen at a time");
  }
  return count === 1;
};
