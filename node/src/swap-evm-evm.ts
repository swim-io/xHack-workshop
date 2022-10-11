import { CHAINS, parseSequenceFromLogEth } from "@certusone/wormhole-sdk";
import { getTokenDetails } from "@swim-io/core";
import { evmAddressToWormhole } from "@swim-io/evm";
import { ERC20Token__factory, Routing__factory } from "@swim-io/evm-contracts";
import { TOKEN_PROJECTS_BY_ID, TokenProjectId } from "@swim-io/token-projects";
import type { Overrides } from "ethers";
import { Wallet as EvmWallet, utils } from "ethers";

import type { EvmChain } from "./config";
import { EVM_CHAIN_CONFIGS } from "./config";
import {
  bufferToEvmBytesFilter,
  createEvmKeypair,
  createEvmProvider,
  logEvmEvent,
} from "./utils/evm";
import { createMemo } from "./utils/swim";

interface SwapParameters {
  readonly mnemonic: string;
  readonly hdPath: string;
  readonly sourceChain: EvmChain;
  readonly sourceTokenProjectId: TokenProjectId;
  readonly targetChain: EvmChain;
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
  mnemonic,
  hdPath,
  sourceChain,
  sourceTokenProjectId,
  targetChain,
  targetTokenProjectId,
  inputAmount,
  maxPropellerFee,
  gasKickStart = false,
  overrides = {},
}: SwapParameters): Promise<void> => {
  /**
   * STEP 1: Get chain configs and find token projects
   */
  if (sourceChain === targetChain) {
    throw new Error("Invalid target chain");
  }
  const sourceChainConfig = EVM_CHAIN_CONFIGS[sourceChain];
  const targetChainConfig = EVM_CHAIN_CONFIGS[targetChain];
  const sourceTokenProject = TOKEN_PROJECTS_BY_ID[sourceTokenProjectId];
  if (
    // NOTE: SDK will be updated to handle this case
    sourceTokenProjectId !== TokenProjectId.SwimUsd &&
    sourceTokenProject.tokenNumber === null
  ) {
    throw new Error("Invalid source token");
  }
  const targetTokenProject = TOKEN_PROJECTS_BY_ID[targetTokenProjectId];
  if (targetTokenProject.tokenNumber === null) {
    throw new Error("Invalid target token");
  }

  console.info("=".repeat(process.stdout.columns));
  console.info(
    `* ${sourceChainConfig.name} ${sourceTokenProject.symbol} -> ${targetChainConfig.name} ${targetTokenProject.symbol}`,
  );

  /**
   * STEP 2: Set up wallet and providers
   */
  const keypair = createEvmKeypair(mnemonic, hdPath);
  console.info(`Account address: ${keypair.address}`);

  const sourceProvider = createEvmProvider(sourceChain);
  const targetProvider = createEvmProvider(targetChain);
  const sourceWallet = new EvmWallet(keypair, sourceProvider);

  /**
   * STEP 3: Connect to smart contracts
   */
  const sourceRoutingContract = Routing__factory.connect(
    sourceChainConfig.routingContractAddress,
    sourceWallet,
  );
  const targetRoutingContract = Routing__factory.connect(
    targetChainConfig.routingContractAddress,
    targetProvider,
  );

  const sourceTokenDetails = getTokenDetails(
    sourceChainConfig,
    sourceTokenProjectId,
  );
  const sourceTokenContract = ERC20Token__factory.connect(
    sourceTokenDetails.address,
    sourceWallet,
  );
  const targetTokenDetails = getTokenDetails(
    targetChainConfig,
    targetTokenProjectId,
  );
  const targetTokenContract = ERC20Token__factory.connect(
    targetTokenDetails.address,
    targetProvider,
  );

  /**
   * STEP 4: Fetch and display initial balances
   */
  const getBalances = async () => {
    const [sourceGas, targetGas, sourceToken, targetToken] = await Promise.all([
      sourceProvider.getBalance(keypair.address),
      targetProvider.getBalance(keypair.address),
      sourceTokenContract.balanceOf(keypair.address),
      targetTokenContract.balanceOf(keypair.address),
    ]);
    return {
      sourceGas: utils.formatEther(sourceGas),
      targetGas: utils.formatEther(targetGas),
      sourceToken: utils.formatUnits(sourceToken, sourceTokenDetails.decimals),
      targetToken: utils.formatUnits(targetToken, targetTokenDetails.decimals),
    };
  };
  const initialBalances = await getBalances();
  console.table({
    label: "Initial balances",
    ...initialBalances,
  });

  /**
   * STEP 5: Approve ERC20 token spend if required
   */
  const inputAmountAtomic = utils.parseUnits(
    inputAmount,
    sourceTokenDetails.decimals,
  );
  const currentApprovalAmountAtomic = await sourceTokenContract.allowance(
    sourceWallet.address,
    sourceChainConfig.routingContractAddress,
  );
  if (currentApprovalAmountAtomic.lt(inputAmountAtomic)) {
    const approvalResponse = await sourceTokenContract.approve(
      sourceChainConfig.routingContractAddress,
      inputAmountAtomic,
    );
    console.info(
      `Source chain approval transaction hash: ${approvalResponse.hash}`,
    );
    await approvalResponse.wait();
  }

  /**
   * STEP 6: Gather arguments for propeller transfer
   */
  const targetOwner = evmAddressToWormhole(keypair.address);
  const maxPropellerFeeAtomic = utils.parseUnits(
    maxPropellerFee,
    targetChainConfig.swimUsdDetails.decimals,
  );
  const memo = createMemo();

  /**
   * STEP 7: Subscribe to events on source and target chains
   */
  const sourceFilter = sourceRoutingContract.filters.MemoInteraction(
    bufferToEvmBytesFilter(memo),
  );
  sourceRoutingContract.once(sourceFilter, logEvmEvent.bind(null, "source"));
  const targetFilter = targetRoutingContract.filters.MemoInteraction(
    bufferToEvmBytesFilter(memo),
  );
  const promiseToReturn = new Promise<void>((resolve, reject) => {
    targetRoutingContract.once(targetFilter, (log, event) => {
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
   * STEP 8: Initiate propeller interaction
   */
  console.table({
    label: "Initiate propeller tx params",
    sourceToken: sourceTokenDetails.address,
    inputAmountAtomic: inputAmountAtomic.toString(),
    targetChain,
    targetOwner: Buffer.from(targetOwner).toString("hex"),
    gasKickStart,
    maxPropellerFee: maxPropellerFeeAtomic.toString(),
    targetTokenNumber: targetTokenProject.tokenNumber,
    memo: memo.toString("hex"),
  });
  const initiatePropellerTxResponse = await sourceRoutingContract[
    "propellerInitiate(address,uint256,uint16,bytes32,bool,uint64,uint16,bytes16)"
  ](
    sourceTokenDetails.address,
    inputAmountAtomic,
    targetChain,
    targetOwner,
    gasKickStart,
    maxPropellerFeeAtomic,
    targetTokenProject.tokenNumber,
    memo,
    overrides,
  );
  console.info(
    `Source chain initiate propeller transaction hash: ${initiatePropellerTxResponse.hash}`,
  );

  /**
   * STEP 9: Display Wormhole sequence number for debugging
   */
  const initiatePropellerTxReceipt = await initiatePropellerTxResponse.wait();
  const sequence = parseSequenceFromLogEth(
    initiatePropellerTxReceipt,
    sourceChainConfig.wormhole.bridge,
  );
  console.info(`Wormhole sequence: ${sequence}`);

  /**
   * STEP 10: Wait for transactions to appear and log final balances
   */
  return promiseToReturn;
};

const main = async (): Promise<void> => {
  const { EVM_HD_PATH, EVM_MNEMONIC } = process.env;
  if (!EVM_MNEMONIC) {
    console.error("Please set EVM_MNEMONIC");
    process.exit(1);
  }
  if (!EVM_HD_PATH) {
    console.error("Please set EVM_HD_PATH");
    process.exit(1);
  }

  await swap({
    mnemonic: EVM_MNEMONIC,
    hdPath: EVM_HD_PATH,
    sourceChain: CHAINS.bsc,
    sourceTokenProjectId: TokenProjectId.SwimUsd,
    targetChain: CHAINS.ethereum,
    targetTokenProjectId: TokenProjectId.Usdc,
    inputAmount: "6.23",
    maxPropellerFee: "5.1",
  });

  await swap({
    mnemonic: EVM_MNEMONIC,
    hdPath: EVM_HD_PATH,
    sourceChain: CHAINS.bsc,
    sourceTokenProjectId: TokenProjectId.Usdt,
    targetChain: CHAINS.ethereum,
    targetTokenProjectId: TokenProjectId.Usdc,
    inputAmount: "1.23",
    maxPropellerFee: "5.1",
  });

  await swap({
    mnemonic: EVM_MNEMONIC,
    hdPath: EVM_HD_PATH,
    sourceChain: CHAINS.ethereum,
    sourceTokenProjectId: TokenProjectId.Usdc,
    targetChain: CHAINS.bsc,
    targetTokenProjectId: TokenProjectId.Usdt,
    inputAmount: "1.23",
    maxPropellerFee: "5.1",
    overrides: {
      gasLimit: "500000",
      gasPrice: "200000000000",
    },
  });

  await swap({
    mnemonic: EVM_MNEMONIC,
    hdPath: EVM_HD_PATH,
    sourceChain: CHAINS.avalanche,
    sourceTokenProjectId: TokenProjectId.Usdt,
    targetChain: CHAINS.polygon,
    targetTokenProjectId: TokenProjectId.Usdc,
    inputAmount: "1.23",
    maxPropellerFee: "5.1",
  });

  await swap({
    mnemonic: EVM_MNEMONIC,
    hdPath: EVM_HD_PATH,
    sourceChain: CHAINS.polygon,
    sourceTokenProjectId: TokenProjectId.Usdc,
    targetChain: CHAINS.avalanche,
    targetTokenProjectId: TokenProjectId.Usdt,
    inputAmount: "1.23",
    maxPropellerFee: "5.1",
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
