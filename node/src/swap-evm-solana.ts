import crypto from "crypto";

import { CHAINS, parseSequenceFromLogEth } from "@certusone/wormhole-sdk";
import {
  Program,
  AnchorProvider,
  Wallet as AnchorWallet,
} from "@project-serum/anchor";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { ChainConfig } from "@swim-io/core";
import { Env, getTokenDetails } from "@swim-io/core";
import { avalanche, bnb, ethereum, fantom, polygon } from "@swim-io/evm";
import { ERC20Token__factory, Routing__factory } from "@swim-io/evm-contracts";
import { solana } from "@swim-io/solana";
import { idl } from "@swim-io/solana-contracts";
import { TOKEN_PROJECTS_BY_ID, TokenProjectId } from "@swim-io/token-projects";
import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";
import type { Event, Overrides } from "ethers";
import { Wallet, providers, utils } from "ethers";

type SupportedEvmChains =
  | "avalanche"
  | "bsc"
  | "ethereum"
  | "fantom"
  | "polygon";
type EvmChain = typeof CHAINS[SupportedEvmChains];
type SolanaChain = typeof CHAINS.solana;

const EVM_RPC_URLS: Record<EvmChain, string | undefined> = {
  [CHAINS.avalanche]: process.env.AVALANCHE_RPC,
  [CHAINS.bsc]: process.env.BNB_RPC,
  [CHAINS.ethereum]: process.env.ETHEREUM_RPC,
  [CHAINS.fantom]: process.env.FANTOM_RPC,
  [CHAINS.polygon]: process.env.POLYGON_RPC,
};

const SOLANA_RPC_URL = process.env.SOLANA_RPC;

const EVM_CHAIN_CONFIGS: Record<EvmChain, ChainConfig> = {
  [CHAINS.avalanche]: avalanche.chains[Env.Testnet],
  [CHAINS.bsc]: bnb.chains[Env.Testnet],
  [CHAINS.ethereum]: ethereum.chains[Env.Testnet],
  [CHAINS.fantom]: fantom.chains[Env.Testnet],
  [CHAINS.polygon]: polygon.chains[Env.Testnet],
};

const SOLANA_CHAIN_CONFIG = solana.chains[Env.Testnet];

const EVM_BYTES_LOG_LENGTH = 32;
const SWIM_MEMO_LENGTH = 16;

const bufferToEvmBytesFilter = (buffer: Buffer): Buffer =>
  Buffer.concat([buffer, Buffer.alloc(EVM_BYTES_LOG_LENGTH - buffer.length)]);

const logEvmEvent = (log: string, event: Event) => {
  console.table({
    label: "Propeller tx detected on EVM chain",
    memo: log.replace(/^0x/, ""),
    tx: event.transactionHash,
    block: event.blockHash,
  });
};

const createEvmProvider = (chain: EvmChain): providers.JsonRpcProvider => {
  const rpc = EVM_RPC_URLS[chain];
  if (!rpc) {
    console.error(`Missing RPC env variable for chain ${chain}`);
    process.exit(1);
  }
  return new providers.JsonRpcProvider(rpc);
};

const createSolanaProvider = (wallet: AnchorWallet): AnchorProvider => {
  if (!SOLANA_RPC_URL) {
    console.error("Missing RPC env variable for Solana");
    process.exit(1);
  }
  const connection = new Connection(SOLANA_RPC_URL);
  return new AnchorProvider(
    connection,
    {
      publicKey: wallet.publicKey,
      signAllTransactions: wallet.signAllTransactions,
      signTransaction: wallet.signTransaction,
    },
    {},
  );
};

interface SwapParameters {
  readonly evmMnemonic: string;
  readonly evmHdPath: string;
  readonly solanaMnemonic: string;
  readonly solanaHdPath: string;
  readonly sourceChain: EvmChain;
  readonly sourceTokenProjectId: TokenProjectId;
  readonly targetChain: SolanaChain;
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
  targetChain,
  targetTokenProjectId,
  inputAmount,
  maxPropellerFee,
  gasKickStart = false,
  overrides = {},
}: SwapParameters): Promise<void> => {
  const evmChainConfig = EVM_CHAIN_CONFIGS[sourceChain];
  const solanaChainConfig = SOLANA_CHAIN_CONFIG;
  const evmTokenProject = TOKEN_PROJECTS_BY_ID[sourceTokenProjectId];
  const solanaTokenProject = TOKEN_PROJECTS_BY_ID[targetTokenProjectId];
  console.info("=".repeat(process.stdout.columns));
  console.info(
    `* ${evmChainConfig.name} ${evmTokenProject.symbol} -> ${solanaChainConfig.name} ${solanaTokenProject.symbol}`,
  );
  if (solanaTokenProject.tokenNumber === null) {
    throw new Error("Invalid target token");
  }

  const evmAccount =
    utils.HDNode.fromMnemonic(evmMnemonic).derivePath(evmHdPath);
  console.info(`EVM account address: ${evmAccount.address}`);
  const evmProvider = createEvmProvider(sourceChain);
  const evmWallet = new Wallet(evmAccount, evmProvider);

  const solanaSeed = await bip39.mnemonicToSeed(solanaMnemonic, "");
  const solanaKeypair = Keypair.fromSeed(
    derivePath(solanaHdPath, solanaSeed.toString("hex")).key,
  );
  const solanaWallet = new AnchorWallet(solanaKeypair);
  console.info("Solana account address", solanaWallet.publicKey.toBase58());
  const solanaProvider = createSolanaProvider(solanaWallet);

  const evmRoutingContract = Routing__factory.connect(
    evmChainConfig.routingContractAddress,
    evmWallet,
  );
  const solanaRoutingContract = new Program(
    idl.propeller,
    solanaChainConfig.routingContractAddress,
  );

  const evmTokenDetails = getTokenDetails(evmChainConfig, sourceTokenProjectId);
  const evmTokenContract = ERC20Token__factory.connect(
    evmTokenDetails.address,
    evmWallet,
  );
  const solanaTokenDetails = getTokenDetails(
    solanaChainConfig,
    targetTokenProjectId,
  );
  const solanaTokenAccount = await getAssociatedTokenAddress(
    new PublicKey(solanaTokenDetails.address),
    solanaWallet.publicKey,
  );

  const getBalances = async () => {
    const [evmGas, solanaGas, evmToken, solanaTokenResponse] =
      await Promise.all([
        evmProvider.getBalance(evmAccount.address),
        solanaProvider.connection.getBalance(solanaWallet.publicKey),
        evmTokenContract.balanceOf(evmAccount.address),
        solanaProvider.connection.getTokenAccountBalance(solanaTokenAccount),
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

  const solanaOwner = solanaTokenAccount.toBytes();

  const maxPropellerFeeAtomic = utils.parseUnits(
    maxPropellerFee,
    solanaChainConfig.swimUsdDetails.decimals,
  );
  // NOTE: Please always use random bytes to avoid conflicts with other users
  const memo = crypto.randomBytes(SWIM_MEMO_LENGTH);

  const evmFilter = evmRoutingContract.filters.MemoInteraction(
    bufferToEvmBytesFilter(memo),
  );
  evmRoutingContract.once(evmFilter, logEvmEvent);
  const promiseToReturn = new Promise<void>((resolve, reject) => {
    solanaProvider.connection.onLogs(
      solanaRoutingContract.programId,
      (logs, context) => {
        console.log("FILTERED ON SOLANA", logs, context);
        // TODO: Fill out
        const didFindMemo = logs.logs.find(
          (log) => log.indexOf(memo.toString("hex")) !== -1,
        );
        if (didFindMemo) {
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

  console.table({
    label: "Propeller kick-off tx params",
    evmToken: evmTokenDetails.address,
    inputAmountAtomic: inputAmountAtomic.toString(),
    targetChain,
    solanaOwner: Buffer.from(solanaOwner).toString("hex"),
    gasKickStart,
    maxPropellerFee: maxPropellerFeeAtomic.toString(),
    targetTokenNumber: solanaTokenProject.tokenNumber,
    memo: memo.toString("hex"),
  });
  const kickOffResponse = await evmRoutingContract[
    "propellerInitiate(address,uint256,uint16,bytes32,bool,uint64,uint16,bytes16)"
  ](
    evmTokenDetails.address,
    inputAmountAtomic,
    targetChain,
    solanaOwner,
    gasKickStart,
    maxPropellerFeeAtomic,
    solanaTokenProject.tokenNumber,
    memo,
    overrides,
  );
  console.info(
    `Source chain kick-off transaction hash: ${kickOffResponse.hash}`,
  );

  const kickOffReceipt = await kickOffResponse.wait();
  const sequence = parseSequenceFromLogEth(
    kickOffReceipt,
    evmChainConfig.wormhole.bridge,
  );
  console.info(`Wormhole sequence: ${sequence}`);

  return promiseToReturn;
};

const main = async (): Promise<void> => {
  const { EVM_HD_PATH, EVM_MNEMONIC, SOLANA_HD_PATH, SOLANA_MNEMONIC } =
    process.env;
  if (!EVM_HD_PATH) {
    console.error("Please set EVM_HD_PATH");
    process.exit(1);
  }
  if (!EVM_MNEMONIC) {
    console.error("Please set EVM_MNEMONIC");
    process.exit(1);
  }
  if (!SOLANA_HD_PATH) {
    console.error("Please set SOLANA_HD_PATH");
    process.exit(1);
  }
  if (!SOLANA_MNEMONIC) {
    console.error("Please set SOLANA_MNEMONIC");
    process.exit(1);
  }

  await swap({
    evmMnemonic: EVM_MNEMONIC,
    evmHdPath: EVM_HD_PATH,
    solanaMnemonic: SOLANA_MNEMONIC,
    solanaHdPath: SOLANA_HD_PATH,
    sourceChain: CHAINS.bsc,
    sourceTokenProjectId: TokenProjectId.Usdt,
    targetChain: CHAINS.solana,
    targetTokenProjectId: TokenProjectId.Usdc,
    inputAmount: "1.23",
    maxPropellerFee: "5.1",
  });
};

main().catch(console.error);
