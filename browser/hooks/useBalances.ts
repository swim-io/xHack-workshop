import type { TokenProjectId } from "@swim-io/token-projects";

import type { Chain } from "../lib/types";
import { isEvmChain, isSolanaChain } from "../lib/types";

import { useEvmGasBalance } from "./useEvmGasBalance";
import { useEvmTokenBalance } from "./useEvmTokenBalance";
import { useSolanaGasBalance } from "./useSolanaGasBalance";
import { useSolanaTokenBalance } from "./useSolanaTokenBalance";

interface BalancesParams {
  readonly sourceChain: Chain;
  readonly sourceTokenProjectId: TokenProjectId;
  readonly targetChain: Chain;
  readonly targetTokenProjectId: TokenProjectId;
}

type BalanceQuery = ReturnType<typeof useEvmGasBalance>;

interface BalancesQueries {
  readonly sourceGasBalance: BalanceQuery;
  readonly targetGasBalance: BalanceQuery;
  readonly sourceTokenBalance: BalanceQuery;
  readonly targetTokenBalance: BalanceQuery;
}

export const useBalances = ({
  sourceChain,
  targetChain,
  sourceTokenProjectId,
  targetTokenProjectId,
}: BalancesParams): BalancesQueries => {
  const evmSourceGasBalance = useEvmGasBalance(
    isEvmChain(sourceChain) ? sourceChain : null,
  );
  const evmTargetGasBalance = useEvmGasBalance(
    isEvmChain(targetChain) ? targetChain : null,
  );
  const evmSourceTokenBalance = useEvmTokenBalance(
    isEvmChain(sourceChain) ? sourceChain : null,
    sourceTokenProjectId,
  );
  const evmTargetTokenBalance = useEvmTokenBalance(
    isEvmChain(targetChain) ? targetChain : null,
    targetTokenProjectId,
  );

  const solanaGasBalance = useSolanaGasBalance();
  const solanaSourceTokenBalance = useSolanaTokenBalance(
    sourceTokenProjectId,
    isSolanaChain(sourceChain),
  );
  const solanaTargetTokenBalance = useSolanaTokenBalance(
    targetTokenProjectId,
    isSolanaChain(targetChain),
  );

  return {
    sourceGasBalance: isEvmChain(sourceChain)
      ? evmSourceGasBalance
      : solanaGasBalance,
    targetGasBalance: isEvmChain(targetChain)
      ? evmTargetGasBalance
      : solanaGasBalance,
    sourceTokenBalance: isEvmChain(sourceChain)
      ? evmSourceTokenBalance
      : solanaSourceTokenBalance,
    targetTokenBalance: isEvmChain(targetChain)
      ? evmTargetTokenBalance
      : solanaTargetTokenBalance,
  };
};
