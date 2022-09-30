import styled from "@emotion/styled";
import {
  Box,
  Button,
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
  Select,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import type { UseQueryResult } from "@tanstack/react-query";
import type { BigNumber } from "ethers";
import { useFormik } from "formik";
import type { FC } from "react";
import { useContext } from "react";

import { CHAINS } from "../config";
import { GetEvmProviderContext } from "../contexts/GetEvmProvider";
import { useEvmGasBalance, useEvmTokenBalance, useEvmWallet } from "../hooks";
import type { ChainName, StableCoinTokenProject } from "../types";

type SwapFormProps = {
  readonly chains: readonly ChainName[];
  readonly tokenProjects: readonly StableCoinTokenProject[];
};

export const SwapForm: FC<SwapFormProps> = ({ chains, tokenProjects }) => {
  const getEvmProvider = useContext(GetEvmProviderContext);

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
    onSubmit: (values) => {
      console.info("submitting values", values);
      console.info(
        "sourceChainProvider",
        getEvmProvider(CHAINS[values.sourceChain]),
      );
    },
  });

  const evmWallet = useEvmWallet();

  const sourceGasBalance = useEvmGasBalance(
    formik.values.sourceChain,
    getEvmProvider(CHAINS[formik.values.sourceChain]),
    evmWallet.address,
  );
  const targetGasBalance = useEvmGasBalance(
    formik.values.targetChain,
    getEvmProvider(CHAINS[formik.values.targetChain]),
    evmWallet.address,
  );

  const sourceTokenBalance = useEvmTokenBalance(
    formik.values.sourceChain,
    formik.values.sourceTokenNumber,
  );

  const targetTokenBalance = useEvmTokenBalance(
    formik.values.targetChain,
    formik.values.targetTokenNumber,
  );

  return (
    <Card sx={{ bgcolor: "background.paper" }}>
      <CardContent>
        <Box
          component="form"
          noValidate
          autoComplete="off"
          onSubmit={formik.handleSubmit}
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
                size="small"
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
                    />
                  }
                  label="Gas kickstart"
                />
              </Tooltip>
            </FormControl>
          </Row>
          <CardActions>
            <Button type="submit" variant="contained">
              Swap
            </Button>
          </CardActions>
        </Box>
      </CardContent>
    </Card>
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
