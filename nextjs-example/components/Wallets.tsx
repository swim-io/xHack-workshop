import { Button, Card, CardContent } from "@mui/material";
import { truncate } from "@swim-io/utils";
import type { FC } from "react";

import { useEvmWallet, useHasSwapInProgress } from "../hooks";

export const Wallets: FC = () => {
  const wallet = useEvmWallet();
  const hasSwapInProgress = useHasSwapInProgress();

  const evmAction = wallet.address
    ? () => void wallet.adapter.disconnect()
    : () => void wallet.adapter.connect();

  return (
    <Card sx={{ width: "100%" }}>
      <CardContent>
        <Button
          variant="outlined"
          onClick={evmAction}
          fullWidth
          disabled={hasSwapInProgress}
        >
          {wallet.address
            ? `Disconnect ${truncate(wallet.address)}`
            : "Connect Metamask"}{" "}
        </Button>
      </CardContent>
    </Card>
  );
};
