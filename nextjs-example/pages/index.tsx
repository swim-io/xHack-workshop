import { Grid, Link, Typography } from "@mui/material";
import type { NextPage } from "next";
import Head from "next/head";

import { SwapForm } from "../components/SwapForm";
import { SUPPORTED_CHAINS, TOKEN_PROJECTS_STABLE_COINS } from "../config";

const Home: NextPage = () => {
  const chains = SUPPORTED_CHAINS;
  const tokenProjects = TOKEN_PROJECTS_STABLE_COINS;

  return (
    <>
      <Head>
        <title>Swim SDK cross chain swap</title>
        <style>
          {`body {
              height: calc(100vh - 5vh);
              background: linear-gradient(
                60deg,
                rgba(84, 58, 183, 1) 0%,
                rgba(0, 172, 193, 1) 100%
              );
            }

            body, html{
              padding:0;
              margin:0;
            }
          `}
        </style>
      </Head>
      <Grid
        container
        alignItems="center"
        direction="column"
        sx={{ marginTop: "5vh" }}
      >
        <Typography paragraph color="background.paper" sx={{ m: 3 }}>
          Swap form powered by{" "}
          <Link href="https://swim.io" target="swim" color="background.paper">
            swim.io
          </Link>{" "}
          SDK
        </Typography>
        <SwapForm chains={chains} tokenProjects={tokenProjects} />
      </Grid>
    </>
  );
};

export default Home;