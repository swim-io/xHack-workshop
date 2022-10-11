//SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.15;

interface IMemoInteractor {
  event MemoInteraction(bytes16 indexed memo);
}

interface IRouting is IMemoInteractor {
  error WormholeInteractionFailed(bytes lowLevelData);
  error TokenNotRegistered(bytes20 addressOrTokenNumber);
  error SenderIsNotOwner(address sender, address owner);

  function swimUsdAddress() external view returns (address);

  function onChainSwap(
    address fromToken,
    uint inputAmount,
    address toOwner,
    address toToken,
    uint minimumOutputAmount,
    bytes16 memo
  ) external returns (uint outputAmount);

  function propellerInitiate(
    address fromToken,
    uint inputAmount,
    uint16 wormholeRecipientChain,
    bytes32 toOwner,
    bool gasKickstart,
    uint64 maxPropellerFee,
    uint16 toTokenNumber,
    bytes16 memo
  ) external payable returns (uint swimUsdAmount, uint64 wormholeSequence);

  function propellerInitiate(
    address fromToken,
    uint inputAmount,
    uint16 wormholeRecipientChain,
    bytes32 toOwner,
    bool gasKickstart,
    uint64 maxPropellerFee,
    uint16 toTokenNumber,
    uint32 wormholeNonce,
    bytes16 memo
  ) external payable returns (uint swimUsdAmount, uint64 wormholeSequence);

  //throws SenderIsNotOwner
  function crossChainComplete(
    bytes memory encodedVm,
    address toToken,
    uint minimumOutputAmount,
    bytes16 memo
  ) external returns (uint outputAmount, address outputToken);
}
