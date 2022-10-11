import type { Accounts, AnchorProvider } from "@project-serum/anchor";
import { Spl } from "@project-serum/anchor";
import type { Account } from "@solana/spl-token";
import {
  TOKEN_PROGRAM_ID,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
  TokenInvalidMintError,
  TokenInvalidOwnerError,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { PublicKey, SYSVAR_CLOCK_PUBKEY, Transaction } from "@solana/web3.js";
import type {
  Connection,
  TransactionInstruction,
  VersionedTransactionResponse,
} from "@solana/web3.js";
import { getTokenDetails } from "@swim-io/core";
import { TokenProjectId } from "@swim-io/token-projects";
import BN from "bn.js";

import { SOLANA_CHAIN_CONFIG } from "../config";
import type { SupportedSolanaToken } from "../types";

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

export const getOrCreateSolanaTokenAccounts = async (
  connection: Connection,
  sendTransaction: WalletContextState["sendTransaction"],
  owner: PublicKey,
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
              connection,
              sendTransaction,
              new PublicKey(tokenDetails.address),
              owner,
            );
          return [tokenProjectId, createdSplTokenAccount.address];
        },
      ),
    ),
  );

/**
 * Adapted from @solana/spl-token getOrCreateAssociatedTokenAccount function
 * due to missing a compatible Signer type from our wallet adapter
 */
async function getOrCreateAssociatedTokenAccount(
  connection: Connection,
  sendTransaction: WalletContextState["sendTransaction"],
  mint: PublicKey,
  owner: PublicKey,
): Promise<Account> {
  const associatedToken = await getAssociatedTokenAddress(mint, owner);

  // This is the optimal logic, considering TX fee, client-side computation, RPC roundtrips and guaranteed idempotent.
  // Sadly we can't do this atomically.
  let account: Account;
  try {
    account = await getAccount(connection, associatedToken, "confirmed");
  } catch (error) {
    // TokenAccountNotFoundError can be possible if the associated address has already received some lamports,
    // becoming a system account. Assuming program derived addressing is safe, this is the only case for the
    // TokenInvalidAccountOwnerError in this code path.
    if (
      error instanceof TokenAccountNotFoundError ||
      error instanceof TokenInvalidAccountOwnerError
    ) {
      // As this isn't atomic, it's possible others can create associated accounts meanwhile.
      try {
        const transaction = new Transaction().add(
          createAssociatedTokenAccountInstruction(
            owner,
            associatedToken,
            owner,
            mint,
          ),
        );

        const {
          context: { slot: minContextSlot },
          value: { blockhash, lastValidBlockHeight },
        } = await connection.getLatestBlockhashAndContext();

        const signature = await sendTransaction(transaction, connection, {
          minContextSlot,
        });

        await connection.confirmTransaction({
          blockhash,
          lastValidBlockHeight,
          signature,
        });
      } catch {
        // Ignore all errors; for now there is no API-compatible way to selectively ignore the expected
        // instruction error if the associated account exists already.
      }

      // Now this should always succeed
      account = await getAccount(connection, associatedToken, "confirmed");
    } else {
      throw error;
    }
  }

  if (!account.mint.equals(mint)) throw new TokenInvalidMintError();
  if (!account.owner.equals(owner)) throw new TokenInvalidOwnerError();

  return account;
}
