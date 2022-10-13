import { parseSequenceFromLogEth } from "@certusone/wormhole-sdk";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getTokenDetails } from "@swim-io/core";
import { ERC20Token__factory, Routing__factory } from "@swim-io/evm-contracts";
import { TOKEN_PROJECTS_BY_ID } from "@swim-io/token-projects";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { utils } from "ethers";

import { EVM_CHAIN_CONFIGS, SOLANA_CHAIN_CONFIG } from "../lib/config";
import type { EvmToSolanaParameters, TxRecord } from "../lib/types";
import {
  bufferToBytesFilter,
  doesTxIncludeMemo,
  generateId,
  handleEvent,
  isFinalTx,
} from "../lib/utils";

import { useEvmWallet } from "./useEvmWallet";

export const EVM_TO_SOLANA_SWAP_MUTATION_KEY = ["evm-to-solana-swap"];

export const useEvmtoSolanaSwap = (
  onTransactionDetected: (txRecord: TxRecord) => void,
) => {
  const queryClient = useQueryClient();
  const { connection: solanaConnection } = useConnection();
  const solanaWallet = useWallet();
  const evmWallet = useEvmWallet();

  return useMutation(
    async ({
      sourceChain,
      sourceTokenProjectId,
      targetChain,
      targetTokenProjectId,
      inputAmount,
      gasKickStart,
      maxPropellerFee,
      overrides = {},
    }: EvmToSolanaParameters) => {
      const { address: evmAddress, signer: evmSigner } = evmWallet.adapter;
      if (!evmAddress || !evmSigner)
        throw new Error("Please connect your EVM wallet");

      if (
        !solanaWallet.publicKey ||
        !solanaWallet.signTransaction ||
        !solanaWallet.signAllTransactions
      )
        throw new Error("Please connect your Solana wallet");

      /**
       * STEP 1: Get EVM chain config and find token projects
       */
      const evmTokenProject = TOKEN_PROJECTS_BY_ID[sourceTokenProjectId];
      if (evmTokenProject.tokenNumber === null) {
        throw new Error("Invalid source token");
      }

      const solanaTokenProject = TOKEN_PROJECTS_BY_ID[targetTokenProjectId];
      if (solanaTokenProject.tokenNumber === null) {
        throw new Error("Invalid target token");
      }

      const evmChainConfig = EVM_CHAIN_CONFIGS[sourceChain];
      const evmTokenDetails = getTokenDetails(
        evmChainConfig,
        sourceTokenProjectId,
      );

      /**
       * STEP 2: Set up wallets and providers
       */
      await evmWallet.adapter.switchNetwork(evmChainConfig.chainId);
      const { publicKey } = solanaWallet;

      /**
       * STEP 3: Connect to smart contracts
       */
      const evmTokenContract = ERC20Token__factory.connect(
        evmTokenDetails.address,
        evmSigner,
      );
      const evmRoutingContract = Routing__factory.connect(
        EVM_CHAIN_CONFIGS[sourceChain].routingContractAddress,
        evmSigner,
      );

      /**
       * STEP 4: Approve ERC20 token spend if required
       */
      const inputAmountAtomic = utils.parseUnits(
        inputAmount,
        evmTokenDetails.decimals,
      );
      const currentApprovalAmountAtomic = await evmTokenContract.allowance(
        evmAddress,
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
       * STEP 5: Gather arguments for propeller transfer
       */
      const solanaOwner = publicKey.toBytes();
      const maxPropellerFeeAtomic = utils.parseUnits(
        maxPropellerFee,
        SOLANA_CHAIN_CONFIG.swimUsdDetails.decimals,
      );
      const memo = generateId();

      /**
       * STEP 6: Subscribe to events on source and target chains
       */
      const evmFilter = evmRoutingContract.filters.MemoInteraction(
        bufferToBytesFilter(memo),
      );

      evmRoutingContract.once(
        evmFilter,
        handleEvent("source", sourceChain, (txRecord) => {
          onTransactionDetected(txRecord);
        }),
      );

      const promiseToReturn = new Promise<void>((resolve, reject) => {
        const subscriptionId = solanaConnection.onLogs(
          new PublicKey(SOLANA_CHAIN_CONFIG.routingContractAddress),
          (logs, context) => {
            if (doesTxIncludeMemo(memo, logs)) {
              console.table({
                label: "Propeller tx detected on target chain",
                memo: memo.toString("hex"),
                tx: logs.signature,
                block: context.slot,
              });

              onTransactionDetected({
                chain: targetChain,
                txId: logs.signature,
              });

              if (isFinalTx(logs)) {
                solanaConnection
                  .removeOnLogsListener(subscriptionId)
                  .then(resolve, reject);
              }
            }
          },
        );
      });

      /**
       * STEP 7: Initiate propeller interaction
       */
      console.table({
        label: "Initiate propeller tx params",
        evmToken: evmTokenDetails.address,
        inputAmountAtomic: inputAmountAtomic.toString(),
        targetChain,
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
        targetChain,
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
       * STEP 8: Display Wormhole sequence number for debugging
       */
      const initatePropellerTxReceipt =
        await initiatePropellerTxResponse.wait();
      const sequence = parseSequenceFromLogEth(
        initatePropellerTxReceipt,
        evmChainConfig.wormhole.bridge,
      );
      console.info(`Wormhole sequence: ${sequence}`);

      /**
       * STEP 9: Wait for transaction to appear on target chain
       */
      return promiseToReturn;
    },
    {
      mutationKey: EVM_TO_SOLANA_SWAP_MUTATION_KEY,
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
