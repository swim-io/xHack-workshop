import {
  CHAINS,
  getEmitterAddressEth,
  getSignedVAAWithRetry,
} from "@certusone/wormhole-sdk";
import { NodeHttpTransport } from "@improbable-eng/grpc-web-node-http-transport";
import type { ChainConfig } from "@swim-io/core";
import { Env } from "@swim-io/core";
import { avalanche, bnb, ethereum, polygon } from "@swim-io/evm";

type SupportedChains = "avalanche" | "bsc" | "ethereum" | "polygon";
type Chain = typeof CHAINS[SupportedChains];

const CHAINS_BY_NAME: Record<string, Chain | undefined> = {
  avalanche: CHAINS.avalanche,
  bnb: CHAINS.bsc,
  ethereum: CHAINS.ethereum,
  polygon: CHAINS.polygon,
};

const CHAIN_CONFIGS: Record<Chain, ChainConfig> = {
  [CHAINS.avalanche]: avalanche.chains[Env.Testnet],
  [CHAINS.bsc]: bnb.chains[Env.Testnet],
  [CHAINS.ethereum]: ethereum.chains[Env.Testnet],
  [CHAINS.polygon]: polygon.chains[Env.Testnet],
};

const getVaa = async (
  wormholeRpc: string,
  chain: Chain,
  sequence: string,
): Promise<void> => {
  const emitterAddress = getEmitterAddressEth(
    CHAIN_CONFIGS[chain].wormhole.portal,
  );

  console.info("Getting VAA...");
  console.table({
    rpc: wormholeRpc,
    chain,
    emitterAddress,
    sequence,
  });
  const { vaaBytes } = await getSignedVAAWithRetry(
    [wormholeRpc],
    chain,
    emitterAddress,
    sequence,
    {
      transport: NodeHttpTransport(), // This should only be needed when running in node.
    },
    1000,
    10,
  );
  console.info("VAA", Buffer.from(vaaBytes).toString("hex"));
};

const main = async (): Promise<void> => {
  const [chainName, sequence] = process.argv.slice(2);
  const chain = CHAINS_BY_NAME[chainName];
  if (!chain || !sequence) {
    console.error(
      "Usage: npm run get-vaa -- <avalanche|bnb|ethereum|fantom|polygon> <sequence>",
    );
    process.exit(1);
  }
  const { WORMHOLE_RPC } = process.env;
  if (!WORMHOLE_RPC) {
    console.error("Please set WORMHOLE_RPC");
    process.exit(1);
  }
  return getVaa(WORMHOLE_RPC, chain, sequence);
};

main().catch(console.error);
