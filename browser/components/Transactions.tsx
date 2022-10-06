import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import type { FC } from "react";

import { CHAIN_ID_TO_NAME } from "../config";
import type { TxRecord } from "../types";

interface TransactionsProps {
  readonly transactions: readonly TxRecord[];
}

export const Transactions: FC<TransactionsProps> = ({ transactions }) => {
  return (
    <TableContainer component={Paper} sx={{ mt: 2, mb: 4 }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Chain</TableCell>
            <TableCell>TxId</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {transactions.map((tx) => (
            <TableRow key={tx.txId}>
              <TableCell>{CHAIN_ID_TO_NAME[tx.chain]}</TableCell>
              <TableCell>{tx.txId}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};
