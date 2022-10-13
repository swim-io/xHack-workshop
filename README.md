# Swim Protocol’s xHack Workshop

Swim Protocol lets you perform trustless one-click cross-chain swaps. This repo provides an early-access demonstration of how to interact with Swim Protocol via our SDK.

We provide the following examples:

1. `node/`: A set of Node.js scripts which set up cross-chain swaps between Solana and various EVM blockchains.
1. `browser/`: A browser example for the same set of blockchains.
1. `on-chain/`: A Solidity interface for interacting with our EVM contracts on-chain.

All of these examples operate against live testnet deployments.

## EVM testnet tokens

You can get EVM testnet tokens by sending an empty transaction to the `SwimFaucet` contract at `0x790e1590023754b1554fcc3bde8ee90340f82ac5` (same address across all EVM chains).
