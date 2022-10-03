import { Button, Card, CardContent } from "@mui/material";
import { truncate } from "@swim-io/utils";
import type { FC } from "react";

import { useEvmWallet } from "../hooks/useEvmWallet";

export const Wallets: FC = () => {
  const wallet = useEvmWallet();

  const evmAction = wallet.address
    ? () => void wallet.adapter.disconnect()
    : () => void wallet.adapter.connect();

  return (
    <Card sx={{ width: "100%" }}>
      <CardContent>
        <Button variant="outlined" onClick={evmAction}>
          {wallet.address
            ? `Disconnect ${truncate(wallet.address)}`
            : "Connect Metamask"}{" "}
        </Button>
      </CardContent>
    </Card>
  );
};
