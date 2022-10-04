import crypto from "crypto";

import { CHAINS, parseSequenceFromLogEth } from "@certusone/wormhole-sdk";
import type { ChainConfig } from "@swim-io/core";
import { Env, getTokenDetails } from "@swim-io/core";
import { bnb, ethereum } from "@swim-io/evm";
import { ERC20Token__factory, Routing__factory } from "@swim-io/evm-contracts";
import { TOKEN_PROJECTS_BY_ID, TokenProjectId } from "@swim-io/token-projects";
import type { Event, Overrides } from "ethers";
import { Wallet, providers, utils } from "ethers";

type SupportedChains = "bsc" | "ethereum";
type Chain = typeof CHAINS[SupportedChains];

const RPC_URLS: Record<Chain, string | undefined> = {
  [CHAINS.bsc]: process.env.BNB_RPC,
  [CHAINS.ethereum]: process.env.ETHEREUM_RPC,
};

const CHAIN_CONFIGS: Record<Chain, ChainConfig> = {
  [CHAINS.bsc]: bnb.chains[Env.Testnet],
  [CHAINS.ethereum]: ethereum.chains[Env.Testnet],
};

const EVM_BYTES_LOG_LENGTH = 32;
const SWIM_MEMO_LENGTH = 16;
const WORMHOLE_ADDRESS_LENGTH = 32;

const bufferToBytesFilter = (buffer: Buffer): Buffer =>
  Buffer.concat([buffer, Buffer.alloc(EVM_BYTES_LOG_LENGTH - buffer.length)]);

const logEvent =
  (chain: "source" | "target") => (log: string, event: Event) => {
    console.table({
      label: `Propeller tx detected on ${chain} chain`,
      memo: log.replace(/^0x/, ""),
      tx: event.transactionHash,
      block: event.blockHash,
    });
  };

const createProvider = (chain: Chain): providers.JsonRpcProvider => {
  const rpc = RPC_URLS[chain];
  if (!rpc) {
    console.error(`Missing RPC env variable for chain ${chain}`);
    process.exit(1);
  }
  return new providers.JsonRpcProvider(rpc);
};

interface SwapArgs {
  readonly mnemonic: string;
  readonly hdPath: string;
  readonly sourceChain: Chain;
  readonly sourceTokenProjectId: TokenProjectId;
  readonly targetChain: Chain;
  readonly targetTokenProjectId: TokenProjectId;
  /** In human units */
  readonly inputAmount: string;
  readonly gasKickStart: boolean;
  /** In human units */
  readonly maxPropellerFee: string;
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
  gasKickStart,
  maxPropellerFee,
  overrides = {},
}: SwapArgs): Promise<void> => {
  const account = utils.HDNode.fromMnemonic(mnemonic).derivePath(hdPath);
  console.info(`Account address: ${account.address}`);

  const sourceChainConfig = CHAIN_CONFIGS[sourceChain];
  const targetChainConfig = CHAIN_CONFIGS[targetChain];
  const sourceProvider = createProvider(sourceChain);
  const targetProvider = createProvider(targetChain);
  const sourceWallet = new Wallet(account, sourceProvider);

  const sourceRoutingContract = Routing__factory.connect(
    sourceChainConfig.routingContractAddress,
    sourceWallet,
  );
  const targetRoutingContract = Routing__factory.connect(
    CHAIN_CONFIGS[targetChain].routingContractAddress,
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

  const { tokenNumber: targetTokenNumber } =
    TOKEN_PROJECTS_BY_ID[targetTokenProjectId];
  if (targetTokenNumber === null) {
    throw new Error("Invalid target token");
  }
  const targetTokenDetails = getTokenDetails(
    targetChainConfig,
    targetTokenProjectId,
  );
  const targetTokenContract = ERC20Token__factory.connect(
    targetTokenDetails.address,
    targetProvider,
  );

  const getBalances = async () => {
    const [sourceGas, targetGas, sourceToken, targetToken] = await Promise.all([
      sourceProvider.getBalance(account.address),
      targetProvider.getBalance(account.address),
      sourceTokenContract.balanceOf(account.address),
      targetTokenContract.balanceOf(account.address),
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

  const inputAmountAtomic = utils.parseUnits(
    inputAmount,
    sourceTokenDetails.decimals,
  );
  const currentApprovalAmountAtomic = await sourceTokenContract.allowance(
    sourceWallet.address,
    CHAIN_CONFIGS[sourceChain].routingContractAddress,
  );
  if (currentApprovalAmountAtomic.lt(inputAmountAtomic)) {
    const approvalResponse = await sourceTokenContract.approve(
      CHAIN_CONFIGS[sourceChain].routingContractAddress,
      inputAmountAtomic,
    );
    console.info(
      `Source chain approval transaction hash: ${approvalResponse.hash}`,
    );
    await approvalResponse.wait();
  }

  const targetOwner = utils.hexZeroPad(
    account.address,
    WORMHOLE_ADDRESS_LENGTH,
  );

  const maxPropellerFeeAtomic = utils.parseUnits(
    maxPropellerFee,
    targetChainConfig.swimUsdDetails.decimals,
  );
  // NOTE: Please always use random bytes to avoid conflicts with other users
  const memo = crypto.randomBytes(SWIM_MEMO_LENGTH);

  const sourceFilter = sourceRoutingContract.filters.MemoInteraction(
    bufferToBytesFilter(memo),
  );
  sourceRoutingContract.once(sourceFilter, logEvent("source"));
  const targetFilter = targetRoutingContract.filters.MemoInteraction(
    bufferToBytesFilter(memo),
  );
  targetRoutingContract.once(targetFilter, () => {
    logEvent("target");
    getBalances()
      .then((finalBalances) => {
        console.table({
          label: "Final balances",
          ...finalBalances,
        });
      })
      .catch(console.error);
  });

  console.table({
    label: "Propeller kick-off tx params",
    sourceToken: sourceTokenDetails.address,
    inputAmountAtomic: inputAmountAtomic.toString(),
    targetChain,
    targetOwner,
    gasKickStart,
    maxPropellerFee: maxPropellerFeeAtomic.toString(),
    targetTokenNumber,
    memo: memo.toString("hex"),
  });
  const kickOffResponse = await sourceRoutingContract[
    "propellerInitiate(address,uint256,uint16,bytes32,bool,uint64,uint16,bytes16)"
  ](
    sourceTokenDetails.address,
    inputAmountAtomic,
    targetChain,
    targetOwner,
    gasKickStart,
    maxPropellerFeeAtomic,
    targetTokenNumber,
    memo,
    overrides,
  );
  console.info(
    `Source chain kick-off transaction hash: ${kickOffResponse.hash}`,
  );

  const kickOffReceipt = await kickOffResponse.wait();
  const sourceBridgeContract = CHAIN_CONFIGS[sourceChain].wormhole.bridge;
  const sequence = parseSequenceFromLogEth(
    kickOffReceipt,
    sourceBridgeContract,
  );
  console.info(`Wormhole sequence: ${sequence}`);
};

const main = async (): Promise<void> => {
  const { HD_PATH, MNEMONIC } = process.env;
  if (!HD_PATH) {
    console.error("Please set HD_PATH");
    process.exit(1);
  }
  if (!MNEMONIC) {
    console.error("Please set MNEMONIC");
    process.exit(1);
  }

  console.info("BNB USDT -> ETH USDC");
  await swap({
    mnemonic: MNEMONIC,
    hdPath: HD_PATH,
    sourceChain: CHAINS.bsc,
    sourceTokenProjectId: TokenProjectId.Usdt,
    targetChain: CHAINS.ethereum,
    targetTokenProjectId: TokenProjectId.Usdc,
    inputAmount: "1.23",
    gasKickStart: false,
    maxPropellerFee: "5.1",
  });

  // console.info("ETH USDC -> BNB USDT");
  // await swap({
  //   mnemonic: MNEMONIC,
  //   hdPath: HD_PATH,
  //   sourceChain: CHAINS.ethereum,
  //   sourceTokenProjectId: TokenProjectId.Usdc,
  //   targetChain: CHAINS.bsc,
  //   targetTokenProjectId: TokenProjectId.Usdt,
  //   inputAmount: "1.23",
  //   gasKickStart: false,
  //   maxPropellerFee: "5.1",
  //   overrides: {
  //     gasLimit: "500000",
  //     gasPrice: "200000000000",
  //   },
  // });
};

main().catch(console.error);
