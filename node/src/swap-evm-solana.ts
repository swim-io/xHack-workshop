import { CHAINS, parseSequenceFromLogEth } from "@certusone/wormhole-sdk";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { getTokenDetails } from "@swim-io/core";
import { ERC20Token__factory, Routing__factory } from "@swim-io/evm-contracts";
import { solana } from "@swim-io/solana";
import { TOKEN_PROJECTS_BY_ID, TokenProjectId } from "@swim-io/token-projects";
import type { Overrides } from "ethers";
import { utils } from "ethers";

import type { EvmChain } from "./config";
import { EVM_CHAIN_CONFIGS, SOLANA_CHAIN_CONFIG } from "./config";
import {
  bufferToEvmBytesFilter,
  createEvmProvider,
  createEvmWallet,
  logEvmEvent,
} from "./utils/evm";
import {
  createSolanaConnection,
  createSolanaKeypair,
  getOrCreateSolanaTokenAccounts,
  logSolanaAccounts,
} from "./utils/solana";
import { createMemo } from "./utils/swim";

interface SwapParameters {
  readonly evmMnemonic: string;
  readonly evmHdPath: string;
  readonly solanaMnemonic: string;
  readonly solanaHdPath: string;
  readonly sourceChain: EvmChain;
  readonly sourceTokenProjectId: TokenProjectId;
  readonly targetTokenProjectId: TokenProjectId;
  /** In human units */
  readonly inputAmount: string;
  /** In human units */
  readonly maxPropellerFee: string;
  /** Coming soon! */
  readonly gasKickStart?: boolean;
  readonly overrides?: Overrides;
}

const swap = async ({
  evmMnemonic,
  evmHdPath,
  solanaMnemonic,
  solanaHdPath,
  sourceChain,
  sourceTokenProjectId,
  targetTokenProjectId,
  inputAmount,
  maxPropellerFee,
  gasKickStart = false,
  overrides = {},
}: SwapParameters): Promise<void> => {
  /**
   * STEP 1: Get EVM chain config and find token projects
   */
  const evmChainConfig = EVM_CHAIN_CONFIGS[sourceChain];
  const evmTokenProject = TOKEN_PROJECTS_BY_ID[sourceTokenProjectId];
  if (
    // NOTE: SDK will be updated to handle this case
    sourceTokenProjectId !== TokenProjectId.SwimUsd &&
    evmTokenProject.tokenNumber === null
  ) {
    throw new Error("Invalid source token");
  }
  const solanaTokenProject = TOKEN_PROJECTS_BY_ID[targetTokenProjectId];
  if (solanaTokenProject.tokenNumber === null) {
    throw new Error("Invalid target token");
  }

  console.info("=".repeat(process.stdout.columns));
  console.info(
    `* ${evmChainConfig.name} ${evmTokenProject.symbol} -> ${SOLANA_CHAIN_CONFIG.name} ${solanaTokenProject.symbol}`,
  );

  /**
   * STEP 2: Set up wallets and providers
   */
  const evmProvider = createEvmProvider(sourceChain);
  const evmWallet = createEvmWallet(evmMnemonic, evmHdPath, evmProvider);
  console.info(`EVM account address: ${evmWallet.address}`);

  const solanaKeypair = await createSolanaKeypair(solanaMnemonic, solanaHdPath);
  console.info("Solana account address", solanaKeypair.publicKey.toBase58());
  const solanaConnection = createSolanaConnection();

  /**
   * STEP 3: Connect to EVM smart contracts on source chain
   */
  const evmRoutingContract = Routing__factory.connect(
    evmChainConfig.routingContractAddress,
    evmWallet,
  );

  const evmTokenDetails = getTokenDetails(evmChainConfig, sourceTokenProjectId);
  const evmTokenContract = ERC20Token__factory.connect(
    evmTokenDetails.address,
    evmWallet,
  );

  /**
   * STEP 4: Create SPL token accounts if required
   */
  const userTokenAccounts = await getOrCreateSolanaTokenAccounts(
    solanaConnection,
    solanaKeypair,
  );
  logSolanaAccounts("User SPL token accounts", userTokenAccounts);

  /**
   * STEP 5: Fetch and display initial balances
   */
  const solanaTokenDetails = getTokenDetails(
    SOLANA_CHAIN_CONFIG,
    targetTokenProjectId,
  );
  const solanaTokenAccount = await getAssociatedTokenAddress(
    new PublicKey(solanaTokenDetails.address),
    solanaKeypair.publicKey,
  );

  const getBalances = async () => {
    const [evmGas, solanaGas, evmToken, solanaTokenResponse] =
      await Promise.all([
        evmProvider.getBalance(evmWallet.address),
        solanaConnection.getBalance(solanaKeypair.publicKey),
        evmTokenContract.balanceOf(evmWallet.address),
        solanaConnection.getTokenAccountBalance(solanaTokenAccount),
      ]);
    return {
      evmGas: utils.formatEther(evmGas),
      solanaGas: utils.formatUnits(
        solanaGas.toString(),
        solana.gasToken.decimals,
      ),
      evmToken: utils.formatUnits(evmToken, evmTokenDetails.decimals),
      solanaToken: solanaTokenResponse.value.uiAmountString,
    };
  };
  const initialBalances = await getBalances();
  console.table({
    label: "Initial balances",
    ...initialBalances,
  });

  /**
   * STEP 6: Approve ERC20 token spend if required
   */
  const inputAmountAtomic = utils.parseUnits(
    inputAmount,
    evmTokenDetails.decimals,
  );
  const currentApprovalAmountAtomic = await evmTokenContract.allowance(
    evmWallet.address,
    evmChainConfig.routingContractAddress,
  );
  if (currentApprovalAmountAtomic.lt(inputAmountAtomic)) {
    const approvalResponse = await evmTokenContract.approve(
      evmChainConfig.routingContractAddress,
      inputAmountAtomic,
    );
    console.info(
      `Source chain approval transaction hash: ${approvalResponse.hash}`,
    );
    await approvalResponse.wait();
  }

  /**
   * STEP 7: Gather arguments for propeller transfer
   */
  const solanaOwner = solanaTokenAccount.toBytes();
  const maxPropellerFeeAtomic = utils.parseUnits(
    maxPropellerFee,
    SOLANA_CHAIN_CONFIG.swimUsdDetails.decimals,
  );
  const memo = createMemo();

  /**
   * STEP 8: Subscribe to events on source and target chains
   */
  const evmFilter = evmRoutingContract.filters.MemoInteraction(
    bufferToEvmBytesFilter(memo),
  );
  evmRoutingContract.once(evmFilter, logEvmEvent.bind(null, "source"));
  const promiseToReturn = new Promise<void>((resolve, reject) => {
    solanaConnection.onLogs(
      new PublicKey(SOLANA_CHAIN_CONFIG.routingContractAddress),
      (logs, context) => {
        const didFindMemo = logs.logs.find(
          (log) => log.indexOf(memo.toString("hex")) !== -1,
        );
        if (didFindMemo) {
          console.table({
            label: "Propeller tx detected on target chain",
            memo,
            tx: logs.signature,
            block: context.slot,
          });
          getBalances()
            .then((finalBalances) => {
              console.table({
                label: "Final balances",
                ...finalBalances,
              });
            })
            .then(resolve, reject);
        }
      },
    );
  });

  /**
   * STEP 9: Initiate propeller interaction
   */
  console.table({
    label: "Initiate propeller tx params",
    evmToken: evmTokenDetails.address,
    inputAmountAtomic: inputAmountAtomic.toString(),
    targetChain: CHAINS.solana,
    solanaOwner: Buffer.from(solanaOwner).toString("hex"),
    gasKickStart,
    maxPropellerFee: maxPropellerFeeAtomic.toString(),
    targetTokenNumber: solanaTokenProject.tokenNumber,
    memo: memo.toString("hex"),
  });
  const initiatePropellerTxResponse = await evmRoutingContract[
    "propellerInitiate(address,uint256,uint16,bytes32,bool,uint64,uint16,bytes16)"
  ](
    evmTokenDetails.address,
    inputAmountAtomic,
    CHAINS.solana,
    solanaOwner,
    gasKickStart,
    maxPropellerFeeAtomic,
    solanaTokenProject.tokenNumber,
    memo,
    overrides,
  );
  console.info(
    `Source chain initiate propeller transaction hash: ${initiatePropellerTxResponse.hash}`,
  );

  /**
   * STEP 10: Display Wormhole sequence number for debugging
   */
  const initatePropellerTxReceipt = await initiatePropellerTxResponse.wait();
  const sequence = parseSequenceFromLogEth(
    initatePropellerTxReceipt,
    evmChainConfig.wormhole.bridge,
  );
  console.info(`Wormhole sequence: ${sequence}`);

  /**
   * STEP 11: Wait for transactions to appear and log final balances
   */
  return promiseToReturn;
};

const main = async (): Promise<void> => {
  const { EVM_HD_PATH, EVM_MNEMONIC, SOLANA_HD_PATH, SOLANA_MNEMONIC } =
    process.env;
  if (!EVM_MNEMONIC) {
    console.error("Please set EVM_MNEMONIC");
    process.exit(1);
  }
  if (!EVM_HD_PATH) {
    console.error("Please set EVM_HD_PATH");
    process.exit(1);
  }
  if (!SOLANA_MNEMONIC) {
    console.error("Please set SOLANA_MNEMONIC");
    process.exit(1);
  }
  if (!SOLANA_HD_PATH) {
    console.error("Please set SOLANA_HD_PATH");
    process.exit(1);
  }

  await swap({
    evmMnemonic: EVM_MNEMONIC,
    evmHdPath: EVM_HD_PATH,
    solanaMnemonic: SOLANA_MNEMONIC,
    solanaHdPath: SOLANA_HD_PATH,
    sourceChain: CHAINS.bsc,
    sourceTokenProjectId: TokenProjectId.SwimUsd,
    targetTokenProjectId: TokenProjectId.Usdc,
    inputAmount: "1.23",
    maxPropellerFee: "5.1",
  });

  await swap({
    evmMnemonic: EVM_MNEMONIC,
    evmHdPath: EVM_HD_PATH,
    solanaMnemonic: SOLANA_MNEMONIC,
    solanaHdPath: SOLANA_HD_PATH,
    sourceChain: CHAINS.bsc,
    sourceTokenProjectId: TokenProjectId.Usdt,
    targetTokenProjectId: TokenProjectId.Usdc,
    inputAmount: "1.23",
    maxPropellerFee: "5.1",
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
