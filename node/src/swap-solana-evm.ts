import { CHAINS } from "@certusone/wormhole-sdk";
import { Wallet as AnchorWallet, Program } from "@project-serum/anchor";
import { createMemoInstruction } from "@solana/spl-memo";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getTokenDetails } from "@swim-io/core";
import { evmAddressToWormhole } from "@swim-io/evm";
import { ERC20Token__factory, Routing__factory } from "@swim-io/evm-contracts";
import { parseSequenceFromLogSolana, solana } from "@swim-io/solana";
import { idl } from "@swim-io/solana-contracts";
import { TOKEN_PROJECTS_BY_ID, TokenProjectId } from "@swim-io/token-projects";
import BN from "bn.js";
import { utils } from "ethers";

import type { EvmChain, SupportedSolanaToken } from "./config";
import { EVM_CHAIN_CONFIGS, SOLANA_CHAIN_CONFIG } from "./config";
import {
  bufferToEvmBytesFilter,
  createEvmKeypair,
  createEvmProvider,
  logEvmEvent,
} from "./evmUtils";
import {
  createAddAccounts,
  createApproveAndRevokeIxs,
  createSolanaKeypair,
  createSolanaProvider,
  createTransferAccounts,
  extractOutputAmountFromAddTx,
  getOrCreateSolanaTokenAccounts,
  logSolanaAccounts,
} from "./solanaUtils";
import { createMemo } from "./swimUtils";

interface SwapParameters {
  readonly evmMnemonic: string;
  readonly evmHdPath: string;
  readonly solanaMnemonic: string;
  readonly solanaHdPath: string;
  readonly sourceTokenProjectId: SupportedSolanaToken;
  readonly targetChain: EvmChain;
  readonly targetTokenProjectId: TokenProjectId;
  /** In human units */
  readonly inputAmount: string;
  /** In human units */
  readonly maxPropellerFee: string;
  /** Coming soon! */
  readonly gasKickStart?: boolean;
}

const swap = async ({
  evmMnemonic,
  evmHdPath,
  solanaMnemonic,
  solanaHdPath,
  sourceTokenProjectId,
  targetChain,
  targetTokenProjectId,
  inputAmount,
  maxPropellerFee,
  gasKickStart = false,
}: SwapParameters): Promise<void> => {
  /**
   * STEP 1: Get EVM chain config and find token projects
   */
  const evmChainConfig = EVM_CHAIN_CONFIGS[targetChain];
  const solanaTokenProject = TOKEN_PROJECTS_BY_ID[sourceTokenProjectId];
  if (
    // NOTE: SDK will be updated to handle this case
    sourceTokenProjectId !== TokenProjectId.SwimUsd &&
    solanaTokenProject.tokenNumber === null
  ) {
    throw new Error("Invalid source token");
  }
  const evmTokenProject = TOKEN_PROJECTS_BY_ID[targetTokenProjectId];
  if (evmTokenProject.tokenNumber === null) {
    throw new Error("Invalid target token");
  }

  console.info("=".repeat(process.stdout.columns));
  console.info(
    `* ${SOLANA_CHAIN_CONFIG.name} ${solanaTokenProject.symbol} -> ${evmChainConfig.name} ${evmTokenProject.symbol}`,
  );

  /**
   * STEP 2: Set up wallets and providers
   */
  const solanaKeypair = await createSolanaKeypair(solanaMnemonic, solanaHdPath);
  const solanaWallet = new AnchorWallet(solanaKeypair);
  console.info("Solana account address", solanaWallet.publicKey.toBase58());
  const solanaProvider = createSolanaProvider(solanaWallet);
  const solanaConnection = solanaProvider.connection;

  const evmProvider = createEvmProvider(targetChain);
  const evmKeypair = createEvmKeypair(evmMnemonic, evmHdPath);
  console.info(`EVM account address: ${evmKeypair.address}`);

  /** Request airdrop on Solana if wallet is low on funds */
  if (
    (await solanaConnection.getBalance(solanaWallet.publicKey)) <
    LAMPORTS_PER_SOL
  ) {
    const airdropTxId = await solanaConnection.requestAirdrop(
      solanaWallet.publicKey,
      LAMPORTS_PER_SOL,
    );
    console.info(`Airdrop tx hash: ${airdropTxId}`);
  }

  /**
   * STEP 3: Connect to smart contracts
   */
  const solanaRoutingContract = new Program(
    idl.propeller,
    SOLANA_CHAIN_CONFIG.routingContractAddress,
    solanaProvider,
  );
  const evmRoutingContract = Routing__factory.connect(
    evmChainConfig.routingContractAddress,
    evmProvider,
  );

  /**
   * STEP 4: Create SPL token accounts if required
   * */

  const userTokenAccounts = await getOrCreateSolanaTokenAccounts(
    solanaConnection,
    solanaKeypair,
  );
  logSolanaAccounts("User SPL token accounts", userTokenAccounts);

  /**
   * STEP 5: Fetch and display initial balances
   */
  const sourceTokenAccount = userTokenAccounts[sourceTokenProjectId];
  const sourceTokenDetails = getTokenDetails(
    SOLANA_CHAIN_CONFIG,
    sourceTokenProjectId,
  );
  const evmTokenDetails = getTokenDetails(evmChainConfig, targetTokenProjectId);
  const evmTokenContract = ERC20Token__factory.connect(
    evmTokenDetails.address,
    evmProvider,
  );

  const getBalances = async () => {
    const [solanaGas, evmGas, solanaTokenResponse, evmToken] =
      await Promise.all([
        solanaProvider.connection.getBalance(solanaWallet.publicKey),
        evmProvider.getBalance(evmKeypair.address),
        solanaProvider.connection.getTokenAccountBalance(sourceTokenAccount),
        evmTokenContract.balanceOf(evmKeypair.address),
      ]);
    return {
      solanaGas: utils.formatUnits(
        solanaGas.toString(),
        solana.gasToken.decimals,
      ),
      evmGas: utils.formatEther(evmGas),
      solanaToken: solanaTokenResponse.value.uiAmountString,
      evmToken: utils.formatUnits(evmToken, evmTokenDetails.decimals),
    };
  };
  const initialBalances = await getBalances();
  console.table({
    label: "Initial balances",
    ...initialBalances,
  });

  /**
   * STEP 6: Gather arguments for propeller transfer
   */
  const inputAmountAtomic = utils
    .parseUnits(inputAmount, sourceTokenDetails.decimals)
    .toString();
  const evmOwner = evmAddressToWormhole(evmKeypair.address);
  const maxPropellerFeeAtomic = utils.parseUnits(
    maxPropellerFee,
    evmChainConfig.swimUsdDetails.decimals,
  );
  const memo = createMemo();
  // Convert to hex string for convenient extraction from explorers despite the inefficiency
  const memoIx = createMemoInstruction(memo.toString("hex"));

  /**
   * STEP 7: If input token is not swimUSD, add to liquidity pool on Solana to get swimUSD
   */
  let addOutputAmountAtomic: string | null = null;
  if (sourceTokenProjectId !== TokenProjectId.SwimUsd) {
    const [twoPoolConfig] = SOLANA_CHAIN_CONFIG.pools;
    const addInputAmounts =
      sourceTokenProjectId === TokenProjectId.Usdc
        ? [inputAmountAtomic, "0"]
        : ["0", inputAmountAtomic];
    const addMaxFee = "100000";
    const addAuxiliarySigner = Keypair.generate();
    const addAccounts = createAddAccounts(
      userTokenAccounts[TokenProjectId.SwimUsd],
      [
        userTokenAccounts[TokenProjectId.Usdc],
        userTokenAccounts[TokenProjectId.Usdt],
      ],
      addAuxiliarySigner.publicKey,
      new PublicKey(
        getTokenDetails(SOLANA_CHAIN_CONFIG, TokenProjectId.SwimUsd).address,
      ),
      [...twoPoolConfig.tokenAccounts.values()].map(
        (address) => new PublicKey(address),
      ),
      new PublicKey(twoPoolConfig.governanceFeeAccount),
    );
    const [approveIx, revokeIx] = await createApproveAndRevokeIxs(
      solanaProvider,
      userTokenAccounts[sourceTokenProjectId],
      inputAmountAtomic,
      addAuxiliarySigner.publicKey,
      solanaKeypair.publicKey,
    );

    console.table({
      label: "Pool add tx params",
      inputAmounts: addInputAmounts.join(),
      maxFee: addMaxFee,
      memo: memo.toString("hex"),
    });
    logSolanaAccounts("Pool add tx accounts", addAccounts);

    const addTxId = await solanaRoutingContract.methods
      .propellerAdd(
        addInputAmounts.map((amount) => new BN(amount)),
        new BN(addMaxFee),
      )
      .accounts(addAccounts)
      .preInstructions([approveIx])
      .postInstructions([revokeIx, memoIx])
      .signers([addAuxiliarySigner])
      .rpc();
    const addTx = await solanaConnection.getTransaction(addTxId, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    const outputAmount = extractOutputAmountFromAddTx(addTx);
    if (!outputAmount) {
      throw new Error("Could not parse propeller add output amount from log");
    }
    console.table({
      label: "Add tx confirmed",
      txHash: addTxId,
      outputAmount,
    });
    addOutputAmountAtomic = outputAmount;
  }

  /**
   * STEP 8: Subscribe to events on target chain
   */

  const evmFilter = evmRoutingContract.filters.MemoInteraction(
    bufferToEvmBytesFilter(memo),
  );
  const promiseToReturn = new Promise<void>((resolve, reject) => {
    evmRoutingContract.once(evmFilter, (log, event) => {
      logEvmEvent("target", log, event);
      getBalances()
        .then((finalBalances) => {
          console.table({
            label: "Final balances",
            ...finalBalances,
          });
        })
        .then(resolve, reject);
    });
  });

  /**
   * STEP 9: Initiate propeller transfer
   */
  const auxiliarySigner = Keypair.generate();
  const transferAccounts = await createTransferAccounts(
    solanaKeypair.publicKey,
    userTokenAccounts[TokenProjectId.SwimUsd],
    auxiliarySigner.publicKey,
  );
  const swimUsdInputAmountAtomic = addOutputAmountAtomic ?? inputAmountAtomic;
  console.table({
    label: "Propeller transfer tx params",
    swimUsdInputAmountAtomic,
    targetChain,
    evmOwner: Buffer.from(evmOwner).toString("hex"),
    gasKickStart,
    maxPropellerFee: maxPropellerFeeAtomic.toString(),
    targetTokenNumber: evmTokenProject.tokenNumber,
    memo: memo.toString("hex"),
  });
  logSolanaAccounts("Propeller transfer tx accounts", transferAccounts);
  const propellerTransferTxId = await solanaRoutingContract.methods
    .propellerTransferNativeWithPayload(
      new BN(swimUsdInputAmountAtomic),
      targetChain,
      evmOwner,
      gasKickStart,
      new BN(maxPropellerFeeAtomic.toString()),
      evmTokenProject.tokenNumber,
      memo,
    )
    .accounts(transferAccounts)
    // .postInstructions([memoIx])
    .signers([auxiliarySigner])
    .rpc();
  console.info(
    `Source chain propeller transfer transaction hash: ${propellerTransferTxId}`,
  );

  /**
   * STEP 10: Display Wormhole sequence number for debugging
   */
  const latestBlock = await solanaProvider.connection.getLatestBlockhash();
  await solanaProvider.connection.confirmTransaction({
    signature: propellerTransferTxId,
    blockhash: latestBlock.blockhash,
    lastValidBlockHeight: latestBlock.lastValidBlockHeight,
  });

  const parsedTx = await solanaProvider.connection.getParsedTransaction(
    propellerTransferTxId,
  );
  if (parsedTx === null) {
    throw new Error("Could not retrieve tx");
  }
  const sequence = parseSequenceFromLogSolana(parsedTx);
  console.info(`Wormhole sequence: ${sequence}`);

  /**
   * STEP 11: Wait for transaction to appear on target chain and log final balances
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
    sourceTokenProjectId: TokenProjectId.SwimUsd,
    targetChain: CHAINS.bsc,
    targetTokenProjectId: TokenProjectId.Busd,
    inputAmount: "2.34",
    maxPropellerFee: "1.1",
  });

  await swap({
    evmMnemonic: EVM_MNEMONIC,
    evmHdPath: EVM_HD_PATH,
    solanaMnemonic: SOLANA_MNEMONIC,
    solanaHdPath: SOLANA_HD_PATH,
    sourceTokenProjectId: TokenProjectId.Usdt,
    targetChain: CHAINS.bsc,
    targetTokenProjectId: TokenProjectId.Busd,
    inputAmount: "2.34",
    maxPropellerFee: "1.1",
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
