import { Box, Button, Card, CardContent, Typography } from "@mui/material";
import {
  WalletDisconnectButton,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";
import { truncate } from "@swim-io/utils";
import type { FC } from "react";

import { useEvmWallet, useHasSwapInProgress } from "../hooks";

export const Wallets: FC = () => {
  const evmWallet = useEvmWallet();
  const hasSwapInProgress = useHasSwapInProgress();

  const evmWalletAction = evmWallet.address
    ? () => void evmWallet.adapter.disconnect()
    : () => void evmWallet.adapter.connect();

  return (
    <Card sx={{ width: "100%", overflow: "visible" }}>
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

        <Typography variant="body2" gutterBottom>
          Solana wallet selector
        </Typography>
        <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
          <WalletMultiButton />
          <WalletDisconnectButton />
        </Box>
      </CardContent>
    </Card>
  );
};
