import { Button, Card, CardContent } from "@mui/material";
import { truncate } from "@swim-io/utils";
import type { FC } from "react";

import { useEvmWallet, useHasSwapInProgress, useSolanaWallet } from "../hooks";

export const Wallets: FC = () => {
  const evmWallet = useEvmWallet();
  const solanaWallet = useSolanaWallet();
  const hasSwapInProgress = useHasSwapInProgress();

  const evmWalletAction = evmWallet.address
    ? () => void evmWallet.adapter.disconnect()
    : () => void evmWallet.adapter.connect();

  const solanaWalletAction = solanaWallet.address
    ? () => void solanaWallet.adapter.disconnect()
    : () => void solanaWallet.adapter.connect();

  return (
    <Card sx={{ width: "100%" }}>
      <CardContent>
        <Button
          variant="outlined"
          onClick={evmWalletAction}
          fullWidth
          disabled={hasSwapInProgress}
          sx={{ mb: 2 }}
        >
          {evmWallet.address
            ? `Disconnect ${truncate(evmWallet.address)}`
            : "Connect Metamask"}{" "}
        </Button>
        <Button
          variant="outlined"
          onClick={solanaWalletAction}
          fullWidth
          disabled={hasSwapInProgress}
        >
          {solanaWallet.address
            ? `Disconnect ${truncate(solanaWallet.address)}`
            : "Connect Phantom"}{" "}
        </Button>
      </CardContent>
    </Card>
  );
};
