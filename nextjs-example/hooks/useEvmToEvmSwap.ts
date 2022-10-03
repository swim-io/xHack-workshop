import { parseSequenceFromLogEth } from "@certusone/wormhole-sdk";
import { ERC20Token__factory, Routing__factory } from "@swim-io/evm-contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { utils } from "ethers";
import { useContext } from "react";

import {
  CHAIN_CONFIGS,
  TOKEN_ADDRESSES,
  WORMHOLE_ADDRESS_LENGTH,
} from "../config";
import { GetEvmProviderContext } from "../contexts/GetEvmProvider";
import type { Chain, SwapArgs } from "../types";
import { bufferToBytesFilter, generateId, logEvent } from "../utils";

import { useEvmWallet } from "./useEvmWallet";

export const useEvmToEvmSwap = (
  addTransaction: (txId: string, chain: Chain) => void,
) => {
  const queryClient = useQueryClient();
  const evmWallet = useEvmWallet();
  const getEvmProvider = useContext(GetEvmProviderContext);

  return useMutation(
    async ({
      sourceChain,
      sourceTokenNumber,
      targetChain,
      targetTokenNumber,
      inputAmount,
      gasKickStart,
      maxPropellerFee,
      overrides,
    }: SwapArgs) => {
      const { signer, address } = evmWallet.adapter;
      if (!signer || !address)
        throw new Error(`Please connect your EVM wallet`);

      await evmWallet.adapter.switchNetwork(CHAIN_CONFIGS[sourceChain].chainId);

      const sourceTokenAddress =
        TOKEN_ADDRESSES[sourceChain][sourceTokenNumber];
      const sourceTokenContract = ERC20Token__factory.connect(
        sourceTokenAddress,
        signer,
      );

      const approvalResponse = await sourceTokenContract.approve(
        CHAIN_CONFIGS[sourceChain].routingContractAddress,
        inputAmount,
      );
      await approvalResponse.wait();

      const targetOwner = utils.hexZeroPad(address, WORMHOLE_ADDRESS_LENGTH);

      // NOTE: Please always use random bytes to avoid conflicts with other users
      const memo = generateId();
      console.info(`Using memo: ${memo.toString("hex")}`);

      const sourceRoutingContract = Routing__factory.connect(
        CHAIN_CONFIGS[sourceChain].routingContractAddress,
        signer,
      );

      const targetRoutingContract = Routing__factory.connect(
        CHAIN_CONFIGS[targetChain].routingContractAddress,
        getEvmProvider(targetChain),
      );

      const sourceFilter = sourceRoutingContract.filters.MemoInteraction(
        bufferToBytesFilter(memo),
      );
      sourceRoutingContract.once(
        sourceFilter,
        logEvent("source", sourceChain, addTransaction),
      );
      const targetFilter = targetRoutingContract.filters.MemoInteraction(
        bufferToBytesFilter(memo),
      );
      targetRoutingContract.once(
        targetFilter,
        logEvent("target", targetChain, addTransaction),
      );

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
    },
    {
      mutationKey: ["evm-to-evm-swap"],
      onSettled: async () => {
        await queryClient.invalidateQueries(["evmTokenBalance"]);
        await queryClient.invalidateQueries(["evmGasBalance"]);
      },
    },
  );
};
