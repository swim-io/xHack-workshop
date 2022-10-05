import crypto from "crypto";

import { CHAINS, parseSequenceFromLogEth } from "@certusone/wormhole-sdk";
import type { ChainConfig } from "@swim-io/core";
import { Env, getTokenDetails } from "@swim-io/core";
import { avalanche, bnb, ethereum, fantom, polygon } from "@swim-io/evm";
import { ERC20Token__factory, Routing__factory } from "@swim-io/evm-contracts";
import { TOKEN_PROJECTS_BY_ID, TokenProjectId } from "@swim-io/token-projects";
import type { Event, Overrides } from "ethers";
import { Wallet, providers, utils } from "ethers";

type SupportedChains = "avalanche" | "bsc" | "ethereum" | "fantom" | "polygon";
type Chain = typeof CHAINS[SupportedChains];

const RPC_URLS: Record<Chain, string | undefined> = {
  [CHAINS.avalanche]: process.env.AVALANCHE_RPC,
  [CHAINS.bsc]: process.env.BNB_RPC,
  [CHAINS.ethereum]: process.env.ETHEREUM_RPC,
  [CHAINS.fantom]: process.env.FANTOM_RPC,
  [CHAINS.polygon]: process.env.POLYGON_RPC,
};

const CHAIN_CONFIGS: Record<Chain, ChainConfig> = {
  [CHAINS.avalanche]: avalanche.chains[Env.Testnet],
  [CHAINS.bsc]: bnb.chains[Env.Testnet],
  [CHAINS.ethereum]: ethereum.chains[Env.Testnet],
  [CHAINS.fantom]: fantom.chains[Env.Testnet],
  [CHAINS.polygon]: polygon.chains[Env.Testnet],
};

const EVM_BYTES_LOG_LENGTH = 32;
const SWIM_MEMO_LENGTH = 16;
const WORMHOLE_ADDRESS_LENGTH = 32;

const bufferToBytesFilter = (buffer: Buffer): Buffer =>
  Buffer.concat([buffer, Buffer.alloc(EVM_BYTES_LOG_LENGTH - buffer.length)]);

const logEvent = (chain: "source" | "target", log: string, event: Event) => {
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

interface SwapParameters {
  readonly mnemonic: string;
  readonly hdPath: string;
  readonly sourceChain: Chain;
  readonly sourceTokenProjectId: TokenProjectId;
  readonly targetChain: Chain;
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
  if (sourceChain === targetChain) {
    throw new Error("Invalid target chain");
  }
  const sourceChainConfig = CHAIN_CONFIGS[sourceChain];
  const targetChainConfig = CHAIN_CONFIGS[targetChain];
  const sourceTokenProject = TOKEN_PROJECTS_BY_ID[sourceTokenProjectId];
  const targetTokenProject = TOKEN_PROJECTS_BY_ID[targetTokenProjectId];
  console.info("=".repeat(process.stdout.columns));
  console.info(
    `* ${sourceChainConfig.name} ${sourceTokenProject.symbol} -> ${targetChainConfig.name} ${targetTokenProject.symbol}`,
  );
  if (targetTokenProject.tokenNumber === null) {
    throw new Error("Invalid target token");
  }

  const account = utils.HDNode.fromMnemonic(mnemonic).derivePath(hdPath);
  console.info(`Account address: ${account.address}`);

  const sourceProvider = createProvider(sourceChain);
  const targetProvider = createProvider(targetChain);
  const sourceWallet = new Wallet(account, sourceProvider);

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
  sourceRoutingContract.once(sourceFilter, logEvent.bind(null, "source"));
  const targetFilter = targetRoutingContract.filters.MemoInteraction(
    bufferToBytesFilter(memo),
  );
  const promiseToReturn = new Promise<void>((resolve, reject) => {
    targetRoutingContract.once(targetFilter, (log, event) => {
      logEvent("target", log, event);
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

  console.table({
    label: "Propeller kick-off tx params",
    sourceToken: sourceTokenDetails.address,
    inputAmountAtomic: inputAmountAtomic.toString(),
    targetChain,
    targetOwner,
    gasKickStart,
    maxPropellerFee: maxPropellerFeeAtomic.toString(),
    targetTokenNumber: targetTokenProject.tokenNumber,
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
    targetTokenProject.tokenNumber,
    memo,
    overrides,
  );
  console.info(
    `Source chain kick-off transaction hash: ${kickOffResponse.hash}`,
  );

  const kickOffReceipt = await kickOffResponse.wait();
  const sequence = parseSequenceFromLogEth(
    kickOffReceipt,
    sourceChainConfig.wormhole.bridge,
  );
  console.info(`Wormhole sequence: ${sequence}`);

  return promiseToReturn;
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

  await swap({
    mnemonic: MNEMONIC,
    hdPath: HD_PATH,
    sourceChain: CHAINS.bsc,
    sourceTokenProjectId: TokenProjectId.Usdt,
    targetChain: CHAINS.ethereum,
    targetTokenProjectId: TokenProjectId.Usdc,
    inputAmount: "1.23",
    maxPropellerFee: "5.1",
  });

  await swap({
    mnemonic: MNEMONIC,
    hdPath: HD_PATH,
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
    mnemonic: MNEMONIC,
    hdPath: HD_PATH,
    sourceChain: CHAINS.avalanche,
    sourceTokenProjectId: TokenProjectId.Usdt,
    targetChain: CHAINS.polygon,
    targetTokenProjectId: TokenProjectId.Usdc,
    inputAmount: "1.23",
    maxPropellerFee: "5.1",
  });

  await swap({
    mnemonic: MNEMONIC,
    hdPath: HD_PATH,
    sourceChain: CHAINS.polygon,
    sourceTokenProjectId: TokenProjectId.Usdc,
    targetChain: CHAINS.avalanche,
    targetTokenProjectId: TokenProjectId.Usdt,
    inputAmount: "1.23",
    maxPropellerFee: "5.1",
  });

  // await swap({
  //   mnemonic: MNEMONIC,
  //   hdPath: HD_PATH,
  //   sourceChain: CHAINS.fantom,
  //   sourceTokenProjectId: TokenProjectId.Usdc,
  //   targetChain: CHAINS.avalanche,
  //   targetTokenProjectId: TokenProjectId.Usdt,
  //   inputAmount: "1.23",
  //   maxPropellerFee: "5.1",
  // });
};

main().catch(console.error);
