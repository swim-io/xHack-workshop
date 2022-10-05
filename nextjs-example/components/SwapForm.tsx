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
import { getTokenDetails } from "@swim-io/core";
import type { TokenProjectId } from "@swim-io/token-projects";
import { utils } from "ethers";
import { useFormik } from "formik";
import type { FC } from "react";
import { useState } from "react";

import {
  CHAINS,
  CHAIN_CONFIGS,
  CHAIN_GAS_TOKEN,
  getChainStableCoins,
} from "../config";
import {
  useEvmGasBalance,
  useEvmToEvmSwap,
  useEvmTokenBalance,
} from "../hooks";
import type { ChainName, TxRecord } from "../types";

import { BalanceQuery } from "./BalanceQuery";
import { Transactions } from "./Transactions";

interface SwapFormProps {
  readonly chains: readonly ChainName[];
}

interface SwapFormikState {
  readonly sourceChain: ChainName;
  readonly targetChain: ChainName;
  readonly sourceTokenProjectId: TokenProjectId;
  readonly targetTokenProjectId: TokenProjectId;
  readonly inputAmount: string;
  readonly gasKickStart: boolean;
  readonly maxPropellerFee: string;
}

export const SwapForm: FC<SwapFormProps> = ({ chains }) => {
  const [isSuccessAlertOpen, setIsSuccessAlertOpen] = useState(false);
  const [transactions, setTransactions] = useState<readonly TxRecord[]>([]);
  const onTransactionDetected = (txRecord: TxRecord) =>
    setTransactions((prev) => {
      if (prev.find((transaction) => transaction.txId === txRecord.txId))
        return prev;
      return prev.concat([txRecord]);
    });

  const { mutateAsync: evmToEvmSwap } = useEvmToEvmSwap(onTransactionDetected);

  const formik = useFormik<SwapFormikState>({
    initialValues: {
      sourceChain: chains[0],
      targetChain: chains[1],
      sourceTokenProjectId: getChainStableCoins(chains[0])[0].id,
      targetTokenProjectId: getChainStableCoins(chains[1])[0].id,
      inputAmount: "",
      gasKickStart: false,
      maxPropellerFee: "1",
    },
    validate: validateForm,
    onSubmit: async (values) => {
      formik.setStatus(null);
      setTransactions([]);

      try {
        const chainId = CHAINS[values.sourceChain];
        const sourceChainConfig = CHAIN_CONFIGS[chainId];
        const sourceTokenDetails = getTokenDetails(
          sourceChainConfig,
          values.sourceTokenProjectId,
        );
        const sourceGasToken = CHAIN_GAS_TOKEN[chainId];

        await evmToEvmSwap({
          sourceChain: CHAINS[values.sourceChain],
          sourceTokenProjectId: values.sourceTokenProjectId,
          targetChain: CHAINS[values.targetChain],
          targetTokenProjectId: values.targetTokenProjectId,
          inputAmount: utils.parseUnits(
            values.inputAmount,
            sourceTokenDetails.decimals,
          ),
          gasKickStart: values.gasKickStart,
          maxPropellerFee: utils.parseUnits(
            values.maxPropellerFee,
            sourceGasToken.decimals,
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
    formik.values.sourceTokenProjectId,
  );

  const targetTokenBalance = useEvmTokenBalance(
    CHAINS[formik.values.targetChain],
    formik.values.targetTokenProjectId,
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
              <FormControl sx={selectFormControlStyles} size="small">
                <InputLabel>Source Chain</InputLabel>
                <Select
                  name="sourceChain"
                  value={formik.values.sourceChain}
                  label="Source Chain"
                  onChange={(event) => {
                    void formik.setFieldValue(
                      "sourceTokenProjectId",
                      getChainStableCoins(event.target.value as ChainName)[0]
                        .id,
                    );
                    formik.handleChange(event);
                  }}
                  disabled={formik.isSubmitting}
                >
                  {chains.map((chainName) => (
                    <MenuItem key={chainName} value={chainName}>
                      {chainName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl sx={selectFormControlStyles} size="small">
                <InputLabel>Source Token</InputLabel>
                <Select
                  name="sourceTokenProjectId"
                  value={formik.values.sourceTokenProjectId}
                  label="Source Token"
                  onChange={formik.handleChange}
                  disabled={formik.isSubmitting}
                >
                  {getChainStableCoins(formik.values.sourceChain).map(
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
              <BalanceQuery label="Gas balance" query={sourceGasBalance} />
              <BalanceQuery label="Token balance" query={sourceTokenBalance} />
            </Row>

            <Divider />

            <Row>
              <FormControl sx={selectFormControlStyles} size="small">
                <InputLabel>Target Chain</InputLabel>
                <Select
                  name="targetChain"
                  value={formik.values.targetChain}
                  label="Target Chain"
                  onChange={(event) => {
                    void formik.setFieldValue(
                      "targetTokenProjectId",
                      getChainStableCoins(event.target.value as ChainName)[0]
                        .id,
                    );
                    formik.handleChange(event);
                  }}
                  disabled={formik.isSubmitting}
                  error={
                    formik.touched.targetChain && !!formik.errors.targetChain
                  }
                >
                  {chains.map((chainName) => (
                    <MenuItem key={chainName} value={chainName}>
                      {chainName}
                    </MenuItem>
                  ))}
                </Select>
                {formik.touched.targetChain && !!formik.errors.targetChain && (
                  <FormHelperText error>
                    {formik.errors.targetChain}
                  </FormHelperText>
                )}
              </FormControl>
              <FormControl sx={selectFormControlStyles} size="small">
                <InputLabel>Target Token</InputLabel>
                <Select
                  name="targetTokenProjectId"
                  value={formik.values.targetTokenProjectId}
                  label="Target Token"
                  onChange={formik.handleChange}
                  disabled={formik.isSubmitting}
                >
                  {getChainStableCoins(formik.values.targetChain).map(
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
                  value={formik.values.maxPropellerFee}
                  onChange={formik.handleChange}
                  disabled={formik.isSubmitting}
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
                        checked={formik.values.gasKickStart}
                        onChange={formik.handleChange}
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
  values: SwapFormikState,
): Partial<Record<keyof SwapFormikState, string>> {
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
