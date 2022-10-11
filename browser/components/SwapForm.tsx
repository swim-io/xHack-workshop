import styled from "@emotion/styled";
import LoadingButton from "@mui/lab/LoadingButton";
import {
  Alert,
  Box,
  Card,
  CardActions,
  CardContent,
  Checkbox,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useFormik } from "formik";
import type { FC } from "react";
import { useState } from "react";

import { CHAINS, CHAIN_ID_TO_NAME, getChainStableCoins } from "../config";
import { useBalances, useEvmToEvmSwap, useSolanaToEvmSwap } from "../hooks";
import type { Chain, ChainName, SwapParameters, TxRecord } from "../types";
import { isEvmToEvmSwap, isSolanaToEvmSwap } from "../types";
import { getErrorMessage } from "../utils";

import { BalanceQuery } from "./BalanceQuery";
import { Transactions } from "./Transactions";

interface SwapFormProps {
  readonly chains: readonly ChainName[];
}

export const SwapForm: FC<SwapFormProps> = ({ chains }) => {
  // Setup a local state for all the transactions that will be created
  const [transactions, setTransactions] = useState<readonly TxRecord[]>([]);
  const onTransactionDetected = (txRecord: TxRecord) =>
    setTransactions((prev) => {
      if (prev.find((transaction) => transaction.txId === txRecord.txId))
        return prev;
      return prev.concat([txRecord]);
    });

  // different swap implementations
  const { mutateAsync: evmToEvmSwap } = useEvmToEvmSwap(onTransactionDetected);
  const { mutateAsync: solanaToEvmSwap } = useSolanaToEvmSwap(
    onTransactionDetected,
  );

  // state for an alert on successful swaps
  const [isSuccessAlertOpen, setIsSuccessAlertOpen] = useState(false);
  // state for error message
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    errors,
    handleChange,
    handleSubmit,
    isSubmitting,
    setFieldValue,
    touched,
    values,
  } = useFormik<SwapParameters>({
    initialValues: {
      sourceChain: CHAINS[chains[0]],
      targetChain: CHAINS[chains[1]],
      sourceTokenProjectId: getChainStableCoins(CHAINS[chains[0]])[0].id,
      targetTokenProjectId: getChainStableCoins(CHAINS[chains[1]])[0].id,
      inputAmount: "",
      gasKickStart: false,
      maxPropellerFee: "1",
    },
    validate: validateForm,
    onSubmit: async (formValues) => {
      setErrorMessage(null);
      setTransactions([]);

      try {
        if (isEvmToEvmSwap(formValues)) {
          await evmToEvmSwap(formValues);
          setIsSuccessAlertOpen(true);
          return;
        }

        if (isSolanaToEvmSwap(formValues)) {
          await solanaToEvmSwap(formValues);
          setIsSuccessAlertOpen(true);
          return;
        }

        throw new Error(
          `Swap from ${CHAIN_ID_TO_NAME[formValues.sourceChain]} to ${
            CHAIN_ID_TO_NAME[formValues.targetChain]
          } is not implemented yet`,
        );
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      }
    },
  });

  const {
    sourceChain,
    sourceTokenProjectId,
    targetChain,
    targetTokenProjectId,
  } = values;

  // Get balances for gas token and selected tokens of each chain
  const {
    sourceGasBalance,
    targetGasBalance,
    sourceTokenBalance,
    targetTokenBalance,
  } = useBalances({
    sourceChain,
    targetChain,
    sourceTokenProjectId,
    targetTokenProjectId,
  });

  const handleCloseSuccessAlert = () => setIsSuccessAlertOpen(false);

  return (
    <>
      <Card sx={{ bgcolor: "background.paper" }}>
        <CardContent>
          {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
          <Box
            component="form"
            noValidate
            autoComplete="off"
            onSubmit={isSubmitting ? undefined : handleSubmit}
          >
            <Row>
              <FormControl sx={selectFormControlStyles} size="small">
                <InputLabel>Source Chain</InputLabel>
                <Select
                  name="sourceChain"
                  value={values.sourceChain}
                  label="Source Chain"
                  onChange={(event) => {
                    void setFieldValue(
                      "sourceTokenProjectId",
                      getChainStableCoins(event.target.value as Chain)[0].id,
                    );
                    handleChange(event);
                  }}
                  disabled={isSubmitting}
                >
                  {chains.map((chainName) => (
                    <MenuItem key={chainName} value={CHAINS[chainName]}>
                      {chainName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl sx={selectFormControlStyles} size="small">
                <InputLabel>Source Token</InputLabel>
                <Select
                  name="sourceTokenProjectId"
                  value={sourceTokenProjectId}
                  label="Source Token"
                  onChange={handleChange}
                  disabled={isSubmitting}
                >
                  {getChainStableCoins(values.sourceChain).map(
                    (tokenProject) => (
                      <MenuItem key={tokenProject.id} value={tokenProject.id}>
                        {tokenProject.symbol}
                      </MenuItem>
                    ),
                  )}
                </Select>
              </FormControl>

              <FormControl sx={textInputFormControlStyles} size="small">
                <TextField
                  name="inputAmount"
                  label="Input Amount"
                  value={values.inputAmount}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  size="small"
                  error={touched.inputAmount && !!errors.inputAmount}
                  helperText={touched.inputAmount && errors.inputAmount}
                />
              </FormControl>
            </Row>

            <Row>
              <BalanceQuery label="Gas balance" query={sourceGasBalance} />
              <BalanceQuery label="Token balance" query={sourceTokenBalance} />
            </Row>

            <Divider />

            <Row>
              <FormControl sx={selectFormControlStyles} size="small">
                <InputLabel>Target Chain</InputLabel>
                <Select
                  name="targetChain"
                  value={values.targetChain}
                  label="Target Chain"
                  onChange={(event) => {
                    void setFieldValue(
                      "targetTokenProjectId",
                      getChainStableCoins(event.target.value as Chain)[0].id,
                    );
                    handleChange(event);
                  }}
                  disabled={isSubmitting}
                  error={touched.targetChain && !!errors.targetChain}
                >
                  {chains.map((chainName) => (
                    <MenuItem key={chainName} value={CHAINS[chainName]}>
                      {chainName}
                    </MenuItem>
                  ))}
                </Select>
                {touched.targetChain && !!errors.targetChain && (
                  <FormHelperText error>{errors.targetChain}</FormHelperText>
                )}
              </FormControl>

              <FormControl sx={selectFormControlStyles} size="small">
                <InputLabel>Target Token</InputLabel>
                <Select
                  name="targetTokenProjectId"
                  value={targetTokenProjectId}
                  label="Target Token"
                  onChange={handleChange}
                  disabled={isSubmitting}
                >
                  {getChainStableCoins(values.targetChain).map(
                    (tokenProject) => (
                      <MenuItem key={tokenProject.id} value={tokenProject.id}>
                        {tokenProject.symbol}
                      </MenuItem>
                    ),
                  )}
                </Select>
              </FormControl>
            </Row>

            <Row>
              <BalanceQuery label="Gas balance" query={targetGasBalance} />
              <BalanceQuery label="Token balance" query={targetTokenBalance} />
            </Row>

            <Divider />

            <Typography paragraph gutterBottom sx={{ mt: 2 }}>
              Propeller options
            </Typography>

            <Row>
              <FormControl sx={textInputFormControlStyles}>
                <TextField
                  name="maxPropellerFee"
                  label="Max Propeller Fee"
                  value={values.maxPropellerFee}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  size="small"
                />
              </FormControl>

              <FormControl>
                <Tooltip
                  placement="top-start"
                  title="Enable to receive some gas tokens on the target chain (coming soon)"
                >
                  <FormControlLabel
                    control={
                      <Checkbox
                        name="gasKickStart"
                        checked={values.gasKickStart}
                        onChange={handleChange}
                        disabled
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
                loading={isSubmitting}
                fullWidth
              >
                Swap
              </LoadingButton>
            </CardActions>
          </Box>
        </CardContent>
      </Card>

      {transactions.length > 0 && <Transactions transactions={transactions} />}

      <Snackbar open={isSuccessAlertOpen} onClose={handleCloseSuccessAlert}>
        <Alert onClose={handleCloseSuccessAlert} severity="success">
          Your swap has been completed!
        </Alert>
      </Snackbar>
    </>
  );
};

const Row = styled(Box)`
  margin: 20px 0;

  & > .MuiFormControl-root {
    margin-right: 20px;

    &:last-child {
      margin-right: 0;
    }
  }

  @media (max-width: 456px) {
    & > .MuiFormControl-root {
      margin-bottom: 20px;
    }
  }
`;

function validateForm(
  values: SwapParameters,
): Partial<Record<keyof SwapParameters, string>> {
  let errors = {};

  if (
    Number.isNaN(Number(values.inputAmount)) ||
    Number(values.inputAmount) <= 0
  ) {
    errors = { ...errors, inputAmount: "Please enter a valid amount" };
  }

  if (values.sourceChain === values.targetChain) {
    errors = {
      ...errors,
      targetChain: "Only cross-chain swaps are supported in this form",
    };
  }

  return errors;
}

const selectFormControlStyles = { width: 120 };
const textInputFormControlStyles = { width: 144 };
