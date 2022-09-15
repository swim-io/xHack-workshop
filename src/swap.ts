import crypto from "crypto";

import { CHAINS, parseSequenceFromLogEth } from "@certusone/wormhole-sdk";
import type { ChainConfig } from "@swim-io/core";
import { Env } from "@swim-io/core";
import { bnb, ethereum } from "@swim-io/evm";
import { ERC20Token__factory, Routing__factory } from "@swim-io/evm-contracts";
import type { Event, Overrides } from "ethers";
import { BigNumber, Wallet, providers, utils } from "ethers";

type SupportedChains = "bsc" | "ethereum";
type Chain = typeof CHAINS[SupportedChains];

// TODO: Get from @swim-io/token-projects
enum TokenNumber {
  SwimUsd,
  Usdc,
  Usdt,
  Busd,
}

const RPC_URLS: Record<Chain, string | undefined> = {
  [CHAINS.bsc]: process.env.BNB_RPC,
  [CHAINS.ethereum]: process.env.ETHEREUM_RPC,
};

const CHAIN_CONFIGS: Record<Chain, ChainConfig> = {
  [CHAINS.bsc]: bnb.chains[Env.Testnet],
  [CHAINS.ethereum]: ethereum.chains[Env.Testnet],
};

// TODO: Get from chain configs
const TOKEN_ADDRESSES: Record<Chain, Record<number, string>> = {
  [CHAINS.bsc]: {
    [TokenNumber.Busd]: "0x92934a8b10DDF85e81B65Be1D6810544744700dC",
    [TokenNumber.Usdt]: "0x98529E942FD121d9C470c3d4431A008257E0E714",
  },
  [CHAINS.ethereum]: {
    [TokenNumber.Usdc]: "0x45B167CF5b14007Ca0490dCfB7C4B870Ec0C0Aa6",
    [TokenNumber.Usdt]: "0x996f42BdB0CB71F831C2eFB05Ac6d0d226979e5B",
  },
};

const ETH_TO_WEI = BigNumber.from(10).pow(18);
const EVM_BYTES_LOG_LENGTH = 32;
const SWIM_MEMO_LENGTH = 16;
const WORMHOLE_ADDRESS_LENGTH = 32;

const bufferToBytesFilter = (buffer: Buffer): Buffer =>
  Buffer.concat([buffer, Buffer.alloc(EVM_BYTES_LOG_LENGTH - buffer.length)]);

const logEvent =
  (chain: "source" | "target") => (log: string, event: Event) => {
    console.info(`Propeller tx detected on ${chain} chain`);
    console.table({
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
  readonly sourceTokenNumber: TokenNumber;
  readonly targetChain: Chain;
  readonly targetTokenNumber: TokenNumber;
  readonly inputAmount: BigNumber;
  readonly gasKickStart: boolean;
  readonly maxPropellerFee: BigNumber;
  readonly overrides?: Overrides;
}

const swap = async ({
  mnemonic,
  hdPath,
  sourceChain,
  sourceTokenNumber,
  targetChain,
  targetTokenNumber,
  inputAmount,
  gasKickStart,
  maxPropellerFee,
  overrides = {},
}: SwapArgs): Promise<void> => {
  const account = utils.HDNode.fromMnemonic(mnemonic).derivePath(hdPath);
  console.info(`Account address: ${account.address}`);

  const sourceProvider = createProvider(sourceChain);
  const targetProvider = createProvider(targetChain);

  const sourceGasBalance = await sourceProvider.getBalance(account.address);
  console.info(`Source gas balance: ${sourceGasBalance.toString()}`);
  const targetGasBalance = await targetProvider.getBalance(account.address);
  console.info(`Target gas balance: ${targetGasBalance.toString()}`);

  const sourceWallet = new Wallet(account, sourceProvider);
  const targetWallet = new Wallet(account, targetProvider);

  const sourceRoutingContract = Routing__factory.connect(
    CHAIN_CONFIGS[sourceChain].routingContractAddress,
    sourceWallet,
  );
  const targetRoutingContract = Routing__factory.connect(
    CHAIN_CONFIGS[targetChain].routingContractAddress,
    targetWallet,
  );

  const sourceTokenAddress = TOKEN_ADDRESSES[sourceChain][sourceTokenNumber];
  const sourceTokenContract = ERC20Token__factory.connect(
    sourceTokenAddress,
    sourceWallet,
  );
  const sourceTokenBalance = await sourceTokenContract.balanceOf(
    account.address,
  );
  console.info(`Source token balance: ${sourceTokenBalance.toString()}`);

  const approvalResponse = await sourceTokenContract.approve(
    CHAIN_CONFIGS[sourceChain].routingContractAddress,
    inputAmount,
  );
  console.info(
    `Source chain approval transaction hash: ${approvalResponse.hash}`,
  );
  await approvalResponse.wait();

  const targetOwner = utils.hexZeroPad(
    account.address,
    WORMHOLE_ADDRESS_LENGTH,
  );

  // NOTE: Please always use random bytes to avoid conflicts with other users
  const memo = crypto.randomBytes(SWIM_MEMO_LENGTH);
  console.info(`Using memo: ${memo.toString("hex")}`);

  const sourceFilter = sourceRoutingContract.filters.MemoInteraction(
    bufferToBytesFilter(memo),
  );
  sourceRoutingContract.once(sourceFilter, logEvent("source"));
  const targetFilter = targetRoutingContract.filters.MemoInteraction(
    bufferToBytesFilter(memo),
  );
  targetRoutingContract.once(targetFilter, logEvent("target"));

  console.info("Sending propeller kick-off tx...");
  console.table({
    sourceToken: sourceTokenAddress,
    inputAmount: inputAmount.toString(),
    targetChain,
    targetOwner,
    gasKickStart,
    maxPropellerFee: maxPropellerFee.toString(),
    targetTokenNumber,
    memo: memo.toString("hex"),
  });
  const kickOffResponse = await sourceRoutingContract[
    "propellerInitiate(address,uint256,uint16,bytes32,bool,uint64,uint16,bytes16)"
  ](
    sourceTokenAddress,
    inputAmount,
    targetChain,
    targetOwner,
    gasKickStart,
    maxPropellerFee,
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

  // console.info("BNB USDT -> ETH USDC");
  // await swap({
  //   mnemonic: MNEMONIC,
  //   hdPath: HD_PATH,
  //   sourceChain: CHAINS.bsc,
  //   sourceTokenNumber: TokenNumber.Usdt,
  //   targetChain: CHAINS.ethereum,
  //   targetTokenNumber: TokenNumber.Usdc,
  //   inputAmount: ETH_TO_WEI.mul(6),
  //   gasKickStart: false,
  //   maxPropellerFee: ETH_TO_WEI.mul(1),
  // });

  console.info("ETH USDC -> BNB USDT");
  await swap({
    mnemonic: MNEMONIC,
    hdPath: HD_PATH,
    sourceChain: CHAINS.ethereum,
    sourceTokenNumber: TokenNumber.Usdc,
    targetChain: CHAINS.bsc,
    targetTokenNumber: TokenNumber.Usdt,
    inputAmount: BigNumber.from(12345),
    gasKickStart: false,
    maxPropellerFee: ETH_TO_WEI.mul(1),
    overrides: {
      gasLimit: "500000",
      gasPrice: "200000000000",
    },
  });
};

main().catch(console.error);
