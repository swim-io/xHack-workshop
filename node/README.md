# Node.js example

## Installation

```sh
npm install
```

## Getting Started

Copy the `.env.example` file to `.env` and replace the values as required. You will need your own EVM/Solana mnemonics (and optionally custom HD paths), and you may want to use your own private RPC providers instead of the public endpoints listed in the example file, although they should work fine for light testing purposes.

You will need some swappable tokens in at least one wallet in order to get started. You can use the EVM testnet faucet as described [here](../README.md) or speak to a member of the Swim team.

## Run a Swap

For each case adjust the parameters in the `swap` calls defined in the relevant file in `src` and run the appropriate command:

### EVM -> EVM:

```sh
npm run swap-evm-evm
```

### EVM -> Solana:

```sh
npm run swap-evm-solana
```

### Solana -> EVM:

```sh
npm run swap-solana-evm
```

## Fetch a VAA

In case something goes wrong with the swap, it may be helpful to check whether the Wormhole guardians have signed the VAA in question. You can take the Wormhole sequence number logged by a swap script and run the following to fetch the VAA from the guardian network:

```sh
npm run get-vaa <source chain> <sequence number>
```

For example:

```sh
npm run get-vaa ethereum 2279
```
