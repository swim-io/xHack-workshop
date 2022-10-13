import { AnchorProvider, Program } from "@project-serum/anchor";
import { createMemoInstruction } from "@solana/spl-memo";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { ComputeBudgetProgram, Keypair, PublicKey } from "@solana/web3.js";
import { getTokenDetails } from "@swim-io/core";
import { evmAddressToWormhole } from "@swim-io/evm";
import { Routing__factory } from "@swim-io/evm-contracts";
import { parseSequenceFromLogSolana } from "@swim-io/solana";
import { idl } from "@swim-io/solana-contracts";
import { TOKEN_PROJECTS_BY_ID, TokenProjectId } from "@swim-io/token-projects";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import BN from "bn.js";
import { utils } from "ethers";
import { useContext } from "react";

import { GetEvmProviderContext } from "../contexts/GetEvmProvider";
import { EVM_CHAIN_CONFIGS, SOLANA_CHAIN_CONFIG } from "../lib/config";
import type { SolanaToEvmParameters, TxRecord } from "../lib/types";
import {
  bufferToBytesFilter,
  createAddAccounts,
  createApproveAndRevokeIxs,
  createTransferAccounts,
  extractOutputAmountFromAddTx,
  generateId,
  getOrCreateSolanaTokenAccounts,
  handleEvent,
  logSolanaAccounts,
} from "../lib/utils";

import { useEvmWallet } from "./useEvmWallet";

export const SOLANA_TO_EVM_SWAP_MUTATION_KEY = ["solana-to-evm-swap"];

export const useSolanaToEvmSwap = (
  onTransactionDetected: (txRecord: TxRecord) => void,
) => {
  const queryClient = useQueryClient();
  const { connection: solanaConnection } = useConnection();
  const solanaWallet = useWallet();
  const evmWallet = useEvmWallet();
  const getEvmProvider = useContext(GetEvmProviderContext);

  return useMutation(
    async ({
      sourceChain,
      sourceTokenProjectId,
      targetChain,
      targetTokenProjectId,
      inputAmount,
      gasKickStart,
      maxPropellerFee,
    }: SolanaToEvmParameters) => {
      const { address: evmAddress } = evmWallet.adapter;
      if (!evmAddress) throw new Error("Please connect your EVM wallet");

      if (
        !solanaWallet.publicKey ||
        !solanaWallet.signTransaction ||
        !solanaWallet.signAllTransactions
      )
        throw new Error("Please connect your Solana wallet");

      /**
       * STEP 1: Get EVM chain config and find token projects
       */
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

      const solanaTokenDetails = getTokenDetails(
        SOLANA_CHAIN_CONFIG,
        sourceTokenProjectId,
      );

      const evmChainConfig = EVM_CHAIN_CONFIGS[targetChain];

      /**
       * STEP 2: Set up wallets and providers
       */
      const {
        publicKey,
        signTransaction,
        signAllTransactions,
        sendTransaction,
      } = solanaWallet;

      const anchorWallet: AnchorProvider["wallet"] = {
        publicKey,
        signTransaction,
        signAllTransactions,
      };

      const anchorProvider = new AnchorProvider(
        solanaConnection,
        anchorWallet,
        {
          commitment: "confirmed",
        },
      );

      /**
       * STEP 3: Connect to smart contracts
       */
      const solanaRoutingContract = new Program(
        idl.propeller,
        SOLANA_CHAIN_CONFIG.routingContractAddress,
        anchorProvider,
      );

      const evmRoutingContract = Routing__factory.connect(
        EVM_CHAIN_CONFIGS[targetChain].routingContractAddress,
        getEvmProvider(targetChain),
      );

      /**
       * STEP 4: Create SPL token accounts if required
       * */
      const userTokenAccounts = await getOrCreateSolanaTokenAccounts(
        solanaConnection,
        sendTransaction,
        publicKey,
      );
      logSolanaAccounts("User SPL token accounts", userTokenAccounts);

      /**
       * STEP 5: Gather arguments for propeller transfer
       */

      const inputAmountAtomic = utils
        .parseUnits(inputAmount, solanaTokenDetails.decimals)
        .toString();
      const evmOwner = Buffer.from(evmAddressToWormhole(evmAddress));
      const maxPropellerFeeAtomic = utils.parseUnits(
        maxPropellerFee,
        evmChainConfig.swimUsdDetails.decimals,
      );

      // NOTE: Please always use random bytes to avoid conflicts with other users
      const memo = generateId();
      const memoIx = createMemoInstruction(memo.toString("hex"));
      const setComputeUnitLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: 350_000,
      });
      console.info(`Using memo: ${memo.toString("hex")}`);

      /**
       * STEP 6: If input token is not swimUSD, add to liquidity pool on Solana to get swimUSD
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
            getTokenDetails(
              SOLANA_CHAIN_CONFIG,
              TokenProjectId.SwimUsd,
            ).address,
          ),
          [...twoPoolConfig.tokenAccounts.values()].map(
            (address) => new PublicKey(address),
          ),
          new PublicKey(twoPoolConfig.governanceFeeAccount),
        );
        const [approveIx, revokeIx] = await createApproveAndRevokeIxs(
          anchorProvider,
          userTokenAccounts[sourceTokenProjectId],
          inputAmountAtomic,
          addAuxiliarySigner.publicKey,
          solanaWallet.publicKey,
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
          throw new Error(
            "Could not parse propeller add output amount from log",
          );
        }
        console.table({
          label: "Add tx confirmed",
          txHash: addTxId,
          outputAmount,
        });
        addOutputAmountAtomic = outputAmount;
      }

      /**
       * STEP 7: Subscribe to events on target chain
       */
      const evmFilter = evmRoutingContract.filters.MemoInteraction(
        bufferToBytesFilter(memo),
      );

      const promiseToReturn = new Promise((resolve) => {
        evmRoutingContract.once(
          evmFilter,
          handleEvent("target", targetChain, (txRecord) => {
            onTransactionDetected(txRecord);
            resolve(null);
          }),
        );
      });

      /**
       * STEP 8: Initiate propeller transfer
       */
      console.info("Sending propeller kick-off tx...");
      const auxiliarySigner = Keypair.generate();
      const transferAccounts = await createTransferAccounts(
        solanaWallet.publicKey,
        userTokenAccounts[TokenProjectId.SwimUsd],
        auxiliarySigner.publicKey,
      );
      const swimUsdInputAmountAtomic =
        addOutputAmountAtomic ?? inputAmountAtomic;
      console.table({
        label: "Propeller transfer tx params",
        swimUsdInputAmountAtomic,
        targetChain,
        evmOwner: evmOwner.toString("hex"),
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
        .preInstructions([setComputeUnitLimitIx])
        .postInstructions([memoIx])
        .signers([auxiliarySigner])
        .rpc();
      console.info(
        `Source chain propeller transfer transaction hash: ${propellerTransferTxId}`,
      );

      onTransactionDetected({
        chain: sourceChain,
        txId: propellerTransferTxId,
      });

      /**
       * STEP 9: Display Wormhole sequence number for debugging
       */
      const { blockhash, lastValidBlockHeight } =
        await solanaConnection.getLatestBlockhash();
      await solanaConnection.confirmTransaction({
        signature: propellerTransferTxId,
        blockhash,
        lastValidBlockHeight,
      });

      const parsedTx = await solanaConnection.getParsedTransaction(
        propellerTransferTxId,
      );
      if (parsedTx === null) {
        throw new Error("Could not retrieve tx");
      }
      const sequence = parseSequenceFromLogSolana(parsedTx);
      console.info(`Wormhole sequence: ${sequence}`);

      /**
       * STEP 10: Wait for transaction to appear on target chain
       */
      return promiseToReturn;
    },
    {
      mutationKey: SOLANA_TO_EVM_SWAP_MUTATION_KEY,
      onSettled: async () => {
        await Promise.all([
          queryClient.invalidateQueries(["evmTokenBalance"]),
          queryClient.invalidateQueries(["evmGasBalance"]),
          queryClient.invalidateQueries(["solanaTokenBalance"]),
          queryClient.invalidateQueries(["solanaGasBalance"]),
        ]);
      },
    },
  );
};
