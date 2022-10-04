import styled from "@emotion/styled";
import LoadingButton from "@mui/lab/LoadingButton";
import {
  Alert,
  Box,
  Card,
  CardActions,
  CardContent,
  Checkbox,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import type { UseQueryResult } from "@tanstack/react-query";
import type { BigNumber } from "ethers";
import { utils } from "ethers";
import { useFormik } from "formik";
import type { FC } from "react";
import { useState } from "react";

import { CHAINS, CHAIN_ID_TO_NAME, TOKEN_DECIMALS } from "../config";
import {
  useEvmGasBalance,
  useEvmToEvmSwap,
  useEvmTokenBalance,
} from "../hooks";
import type { ChainName, StableCoinTokenProject, TxRecord } from "../types";

type SwapFormProps = {
  readonly chains: readonly ChainName[];
  readonly tokenProjects: readonly StableCoinTokenProject[];
};

export const SwapForm: FC<SwapFormProps> = ({ chains, tokenProjects }) => {
  const [isSuccessAlertOpen, setIsSuccessAlertOpen] = useState(false);
  const [transactions, setTransactions] = useState<readonly TxRecord[]>([]);
  const onTransactionDetected = (txRecord: TxRecord) =>
    setTransactions((prev) => {
      if (prev.find((transaction) => transaction.txId === txRecord.txId))
        return prev;
      return prev.concat([txRecord]);
    });

  const { mutateAsync: evmToEvmSwap } = useEvmToEvmSwap(onTransactionDetected);

  const formik = useFormik({
    initialValues: {
      sourceChain: chains[0],
      targetChain: chains[1],
      sourceTokenNumber: tokenProjects[0].tokenNumber,
      targetTokenNumber: tokenProjects[1].tokenNumber,
      inputAmount: "",
      gasKickStart: false,
      maxPropellerFee: "1",
    },
    validate(values) {
      let errors: Record<string, string> = {};

      if (
        Number.isNaN(Number(values.inputAmount)) ||
        Number(values.inputAmount) <= 0
      ) {
        errors = { ...errors, inputAmount: "Please enter a valid amount" };
      }

      return errors;
    },
    onSubmit: async (values) => {
      formik.setStatus(null);
      setTransactions([]);

      try {
        await evmToEvmSwap({
          sourceChain: CHAINS[values.sourceChain],
          sourceTokenNumber: values.sourceTokenNumber,
          targetChain: CHAINS[values.targetChain],
          targetTokenNumber: values.targetTokenNumber,
          inputAmount: utils.parseUnits(
            values.inputAmount,
            TOKEN_DECIMALS[CHAINS[values.sourceChain]][
              values.sourceTokenNumber
            ],
          ),
          gasKickStart: values.gasKickStart,
          maxPropellerFee: utils.parseUnits(
            values.maxPropellerFee,
            18, // TODO
          ),
          overrides: {
            gasLimit: "500000",
            gasPrice: "200000000000",
          },
        });

        setIsSuccessAlertOpen(true);
      } catch (error) {
        formik.setStatus(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  });

  const sourceGasBalance = useEvmGasBalance(CHAINS[formik.values.sourceChain]);
  const targetGasBalance = useEvmGasBalance(CHAINS[formik.values.targetChain]);

  const sourceTokenBalance = useEvmTokenBalance(
    CHAINS[formik.values.sourceChain],
    formik.values.sourceTokenNumber,
  );

  const targetTokenBalance = useEvmTokenBalance(
    CHAINS[formik.values.targetChain],
    formik.values.targetTokenNumber,
  );

  const handleCloseSuccessAlert = () => setIsSuccessAlertOpen(false);

  return (
    <>
      <Card sx={{ bgcolor: "background.paper" }}>
        <CardContent>
          {formik.status && <Alert severity="error">{formik.status}</Alert>}
          <Box
            component="form"
            noValidate
            autoComplete="off"
            onSubmit={formik.isSubmitting ? undefined : formik.handleSubmit}
          >
            <Row>
              <FormControl sx={{ m: 1, minWidth: 120 }} size="small">
                <InputLabel id="sourceChainLabel">Source Chain</InputLabel>
                <Select
                  labelId="sourceChainLabel"
                  name="sourceChain"
                  value={formik.values.sourceChain}
                  label="Source Chain"
                  onChange={formik.handleChange}
                  disabled={formik.isSubmitting}
                >
                  {chains.map((chainName) => (
                    <MenuItem key={chainName} value={chainName}>
                      {chainName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl sx={{ m: 1, minWidth: 140 }} size="small">
                <InputLabel id="sourceTokenNumber">Source Token</InputLabel>
                <Select
                  labelId="sourceTokenNumberLabel"
                  name="sourceTokenNumber"
                  value={formik.values.sourceTokenNumber}
                  label="Source Token"
                  onChange={formik.handleChange}
                  disabled={formik.isSubmitting}
                >
                  {tokenProjects.map((tokenProject) => (
                    <MenuItem
                      key={tokenProject.id}
                      value={tokenProject.tokenNumber}
                    >
                      {tokenProject.symbol}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl sx={{ m: 1, maxWidth: 144 }} size="small">
                <TextField
                  name="inputAmount"
                  label="Input Amount"
                  value={formik.values.inputAmount}
                  onChange={formik.handleChange}
                  disabled={formik.isSubmitting}
                  size="small"
                  error={
                    formik.touched.inputAmount && !!formik.errors.inputAmount
                  }
                  helperText={
                    formik.touched.inputAmount && formik.errors.inputAmount
                  }
                />
              </FormControl>
            </Row>
            <Row>
              <BalanceComponent label="Gas balance" query={sourceGasBalance} />
              <BalanceComponent
                label="Token balance"
                query={sourceTokenBalance}
              />
            </Row>

            <Divider />

            <Row>
              <FormControl sx={{ m: 1, minWidth: 120 }} size="small">
                <InputLabel id="targetChainLabel">Target Chain</InputLabel>
                <Select
                  labelId="targetChainLabel"
                  name="targetChain"
                  value={formik.values.targetChain}
                  label="Target Chain"
                  onChange={formik.handleChange}
                  disabled={formik.isSubmitting}
                >
                  {chains.map((chainName) => (
                    <MenuItem key={chainName} value={chainName}>
                      {chainName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl sx={{ m: 1, minWidth: 140 }} size="small">
                <InputLabel id="targetTokenNumber">Target Token</InputLabel>
                <Select
                  labelId="targetTokenNumberLabel"
                  name="targetTokenNumber"
                  value={formik.values.targetTokenNumber}
                  label="Target Token"
                  onChange={formik.handleChange}
                  disabled={formik.isSubmitting}
                >
                  {tokenProjects.map((tokenProject) => (
                    <MenuItem
                      key={tokenProject.id}
                      value={tokenProject.tokenNumber}
                    >
                      {tokenProject.symbol}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Row>
            <Row>
              <BalanceComponent label="Gas balance" query={targetGasBalance} />
              <BalanceComponent
                label="Token balance"
                query={targetTokenBalance}
              />
            </Row>

            <Divider />

            <Typography paragraph gutterBottom sx={{ mt: 2 }}>
              Propeller (relayer) options
            </Typography>

            <Row display="flex" justifyContent="space-evenly">
              <FormControl>
                <TextField
                  name="maxPropellerFee"
                  label="Max Propeller Fee"
                  value={formik.values.maxPropellerFee}
                  onChange={formik.handleChange}
                  disabled={formik.isSubmitting}
                  size="small"
                />
              </FormControl>
              <FormControl>
                <Tooltip title="Enable to swap some gas token on the target chain">
                  <FormControlLabel
                    control={
                      <Checkbox
                        name="gasKickStart"
                        checked={formik.values.gasKickStart}
                        onChange={formik.handleChange}
                        disabled={formik.isSubmitting}
                      />
                    }
                    label="Gas kickstart"
                  />
                </Tooltip>
              </FormControl>
            </Row>
            <CardActions>
              <LoadingButton
                type="submit"
                variant="contained"
                loading={formik.isSubmitting}
                fullWidth
              >
                Swap
              </LoadingButton>
            </CardActions>
          </Box>
        </CardContent>
      </Card>
      {transactions.length > 0 && <Transactions transactions={transactions} />}

      <Snackbar
        open={isSuccessAlertOpen}
        autoHideDuration={6000}
        onClose={handleCloseSuccessAlert}
      >
        <Alert onClose={handleCloseSuccessAlert} severity="success">
          Your swap has been completed!
        </Alert>
      </Snackbar>
    </>
  );
};

const Row = styled(Box)`
  margin: 20px 0;
`;

const BalanceComponent = ({
  label,
  query,
}: {
  readonly label: string;
  readonly query: UseQueryResult<BigNumber | null, Error>;
}) => {
  return (
    <Typography paragraph>
      {label}:{" "}
      {query.isLoading ? (
        <CircularProgress size={15} sx={{ ml: 1 }} />
      ) : query.isSuccess && query.data ? (
        query.data.toString()
      ) : (
        "—"
      )}
    </Typography>
  );
};

interface TransactionsProps {
  readonly transactions: readonly TxRecord[];
}

const Transactions: FC<TransactionsProps> = ({ transactions }) => {
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
