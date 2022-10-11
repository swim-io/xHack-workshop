import { parseSequenceFromLogEth } from "@certusone/wormhole-sdk";
import { getTokenDetails } from "@swim-io/core";
import { ERC20Token__factory, Routing__factory } from "@swim-io/evm-contracts";
import { TOKEN_PROJECTS_BY_ID } from "@swim-io/token-projects";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { utils } from "ethers";
import { useContext } from "react";

import {
  EVM_CHAIN_CONFIGS,
  CHAIN_GAS_TOKEN,
  WORMHOLE_ADDRESS_LENGTH,
} from "../config";
import { GetEvmProviderContext } from "../contexts/GetEvmProvider";
import type { EvmToEvmSwapParameters, TxRecord } from "../types";
import { bufferToBytesFilter, generateId, handleEvent } from "../utils";

import { useEvmWallet } from "./useEvmWallet";

export const EVM_TO_EVM_SWAP_MUTATION_KEY = ["evm-to-evm-swap"];

export const useEvmToEvmSwap = (
  onTransactionDetected: (txRecord: TxRecord) => void,
) => {
  const queryClient = useQueryClient();
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
      overrides = {},
    }: EvmToEvmSwapParameters) => {
      const { signer, address } = evmWallet.adapter;
      if (!signer || !address)
        throw new Error(`Please connect your EVM wallet`);

      const { tokenNumber: targetTokenNumber } =
        TOKEN_PROJECTS_BY_ID[targetTokenProjectId];

      if (targetTokenNumber === null) {
        throw new Error("Invalid target token");
      }

      const targetChainConfig = EVM_CHAIN_CONFIGS[targetChain];
      const sourceChainConfig = EVM_CHAIN_CONFIGS[sourceChain];

      await evmWallet.adapter.switchNetwork(sourceChainConfig.chainId);

      const sourceTokenDetails = getTokenDetails(
        sourceChainConfig,
        sourceTokenProjectId,
      );
      const sourceTokenAddress = sourceTokenDetails.address;
      const sourceTokenContract = ERC20Token__factory.connect(
        sourceTokenAddress,
        signer,
      );

      const inputAmountAtomic = utils.parseUnits(
        inputAmount,
        sourceTokenDetails.decimals,
      );

      const sourceGasToken = CHAIN_GAS_TOKEN[sourceChain];
      const maxPropellerFeeAtomic = utils.parseUnits(
        maxPropellerFee,
        sourceGasToken.decimals,
      );

      const currentApprovalAmountAtomic = await sourceTokenContract.allowance(
        address,
        sourceChainConfig.routingContractAddress,
      );

      if (currentApprovalAmountAtomic.lt(inputAmountAtomic)) {
        const approvalResponse = await sourceTokenContract.approve(
          sourceChainConfig.routingContractAddress,
          inputAmountAtomic,
        );
        await approvalResponse.wait();
      }

      const targetOwner = utils.hexZeroPad(address, WORMHOLE_ADDRESS_LENGTH);

      // NOTE: Please always use random bytes to avoid conflicts with other users
      const memo = generateId();
      console.info(`Using memo: ${memo.toString("hex")}`);

      const sourceRoutingContract = Routing__factory.connect(
        sourceChainConfig.routingContractAddress,
        signer,
      );

      const targetRoutingContract = Routing__factory.connect(
        targetChainConfig.routingContractAddress,
        getEvmProvider(targetChain),
      );

      const sourceFilter = sourceRoutingContract.filters.MemoInteraction(
        bufferToBytesFilter(memo),
      );
      sourceRoutingContract.once(
        sourceFilter,
        handleEvent("source", sourceChain, (txRecord) => {
          onTransactionDetected(txRecord);
        }),
      );
      const targetFilter = targetRoutingContract.filters.MemoInteraction(
        bufferToBytesFilter(memo),
      );

      const finalPromise = new Promise((resolve) => {
        targetRoutingContract.once(
          targetFilter,
          handleEvent("target", targetChain, (txRecord) => {
            onTransactionDetected(txRecord);
            resolve(null);
          }),
        );
      });

      console.info("Sending propeller kick-off tx...");
      console.table({
        sourceToken: sourceTokenAddress,
        inputAmount: inputAmountAtomic.toString(),
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
        sourceTokenAddress,
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
      const sourceBridgeContract = sourceChainConfig.wormhole.bridge;
      const sequence = parseSequenceFromLogEth(
        kickOffReceipt,
        sourceBridgeContract,
      );
      console.info(`Wormhole sequence: ${sequence}`);

      await finalPromise;
    },
    {
      mutationKey: EVM_TO_EVM_SWAP_MUTATION_KEY,
      onSettled: async () => {
        await queryClient.invalidateQueries(["evmTokenBalance"]);
        await queryClient.invalidateQueries(["evmGasBalance"]);
      },
    },
  );
};
