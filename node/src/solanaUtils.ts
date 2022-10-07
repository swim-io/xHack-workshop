import type { Accounts, Wallet } from "@project-serum/anchor";
import { AnchorProvider, BN, Spl } from "@project-serum/anchor";
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import type {
  TransactionInstruction,
  VersionedTransactionResponse,
} from "@solana/web3.js";
import {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
} from "@solana/web3.js";
import { getTokenDetails } from "@swim-io/core";
import { TokenProjectId } from "@swim-io/token-projects";
import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";

import type { SupportedSolanaToken } from "./config";
import { SOLANA_CHAIN_CONFIG, SOLANA_RPC_URL } from "./config";

export const logSolanaAccounts = (label: string, accounts: Accounts) => {
  console.table({
    label,
    ...Object.entries(accounts).reduce(
      (accumulator, [key, value]) => ({
        ...accumulator,
        [key]: (value as PublicKey).toBase58(),
      }),
      {},
    ),
  });
};

const PROPELLER_OUTPUT_AMOUNT_REGEX =
  /^Program log: propeller_add output_amount: (?<amount>\d+)/;
export const extractOutputAmountFromAddTx = (
  tx: VersionedTransactionResponse | null,
): string | null => {
  const addLog = tx?.meta?.logMessages?.find((log) =>
    PROPELLER_OUTPUT_AMOUNT_REGEX.test(log),
  );
  return addLog?.match(PROPELLER_OUTPUT_AMOUNT_REGEX)?.groups?.amount ?? null;
};

export const createSolanaKeypair = async (
  mnemonic: string,
  hdPath: string,
): Promise<Keypair> => {
  const seed = await bip39.mnemonicToSeed(mnemonic, "");
  return Keypair.fromSeed(derivePath(hdPath, seed.toString("hex")).key);
};

export const createSolanaConnection = (): Connection => {
  if (!SOLANA_RPC_URL) {
    console.error("Missing RPC env variable for Solana");
    process.exit(1);
  }
  return new Connection(SOLANA_RPC_URL);
};

export const createSolanaProvider = (wallet: Wallet): AnchorProvider => {
  const connection = createSolanaConnection();
  return new AnchorProvider(connection, wallet, { commitment: "confirmed" });
};

export const getOrCreateSolanaTokenAccounts = async (
  solanaConnection: Connection,
  solanaKeypair: Keypair,
): Promise<Record<SupportedSolanaToken, PublicKey>> =>
  Object.fromEntries(
    await Promise.all(
      [TokenProjectId.SwimUsd, TokenProjectId.Usdc, TokenProjectId.Usdt].map(
        async (tokenProjectId) => {
          const tokenDetails = getTokenDetails(
            SOLANA_CHAIN_CONFIG,
            tokenProjectId,
          );
          const createdSplTokenAccount =
            await getOrCreateAssociatedTokenAccount(
              solanaConnection,
              solanaKeypair,
              new PublicKey(tokenDetails.address),
              solanaKeypair.publicKey,
            );
          return [tokenProjectId, createdSplTokenAccount.address];
        },
      ),
    ),
  );

export const createApproveAndRevokeIxs = async (
  solanaProvider: AnchorProvider,
  tokenAccount: PublicKey,
  amount: string,
  delegate: PublicKey,
  authority: PublicKey,
): Promise<readonly [TransactionInstruction, TransactionInstruction]> => {
  const splToken = Spl.token(solanaProvider);
  const approveIx = splToken.methods
    .approve(new BN(amount))
    .accounts({
      source: tokenAccount,
      delegate,
      authority,
    })
    .instruction();
  const revokeIx = splToken.methods
    .revoke()
    .accounts({
      source: tokenAccount,
      authority,
    })
    .instruction();
  return Promise.all([approveIx, revokeIx]);
};

export const createAddAccounts = (
  userSwimUsdAtaPublicKey: PublicKey,
  userTokenAccounts: readonly PublicKey[],
  auxiliarySigner: PublicKey,
  lpMint: PublicKey,
  poolTokenAccounts: readonly PublicKey[],
  poolGovernanceFeeAccount: PublicKey,
): Accounts => ({
  propeller: new PublicKey(SOLANA_CHAIN_CONFIG.routingContractStateAddress),
  tokenProgram: TOKEN_PROGRAM_ID,
  poolTokenAccount0: poolTokenAccounts[0],
  poolTokenAccount1: poolTokenAccounts[1],
  lpMint,
  governanceFee: poolGovernanceFeeAccount,
  userTransferAuthority: auxiliarySigner,
  userTokenAccount0: userTokenAccounts[0],
  userTokenAccount1: userTokenAccounts[1],
  userLpTokenAccount: userSwimUsdAtaPublicKey,
  twoPoolProgram: new PublicKey(SOLANA_CHAIN_CONFIG.twoPoolContractAddress),
});

export const createTransferAccounts = async (
  walletPublicKey: PublicKey,
  swimUsdAtaPublicKey: PublicKey,
  auxiliarySigner: PublicKey,
): Promise<Accounts> => {
  const bridgePublicKey = new PublicKey(SOLANA_CHAIN_CONFIG.wormhole.bridge);
  const portalPublicKey = new PublicKey(SOLANA_CHAIN_CONFIG.wormhole.portal);
  const swimUsdMintPublicKey = new PublicKey(
    SOLANA_CHAIN_CONFIG.swimUsdDetails.address,
  );
  const [wormholeConfig] = await PublicKey.findProgramAddress(
    [Buffer.from("Bridge")],
    bridgePublicKey,
  );
  const [tokenBridgeConfig] = await PublicKey.findProgramAddress(
    [Buffer.from("config")],
    portalPublicKey,
  );
  const [custody] = await PublicKey.findProgramAddress(
    [swimUsdMintPublicKey.toBytes()],
    portalPublicKey,
  );
  const [custodySigner] = await PublicKey.findProgramAddress(
    [Buffer.from("custody_signer")],
    portalPublicKey,
  );
  const [authoritySigner] = await PublicKey.findProgramAddress(
    [Buffer.from("authority_signer")],
    portalPublicKey,
  );
  const [wormholeEmitter] = await PublicKey.findProgramAddress(
    [Buffer.from("emitter")],
    portalPublicKey,
  );
  const [wormholeSequence] = await PublicKey.findProgramAddress(
    [Buffer.from("Sequence"), wormholeEmitter.toBytes()],
    bridgePublicKey,
  );
  const [wormholeFeeCollector] = await PublicKey.findProgramAddress(
    [Buffer.from("fee_collector")],
    bridgePublicKey,
  );
  return {
    propeller: new PublicKey(SOLANA_CHAIN_CONFIG.routingContractStateAddress),
    tokenProgram: TOKEN_PROGRAM_ID,
    payer: walletPublicKey,
    wormhole: bridgePublicKey,
    tokenBridgeConfig,
    userSwimUsdAta: swimUsdAtaPublicKey,
    swimUsdMint: swimUsdMintPublicKey,
    custody,
    tokenBridge: portalPublicKey,
    custodySigner,
    authoritySigner,
    wormholeConfig,
    wormholeMessage: auxiliarySigner,
    wormholeEmitter,
    wormholeSequence,
    wormholeFeeCollector,
    clock: SYSVAR_CLOCK_PUBKEY,
  };
};
