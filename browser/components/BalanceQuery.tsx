import { CircularProgress, Typography } from "@mui/material";
import type { UseQueryResult } from "@tanstack/react-query";

export const BalanceQuery = ({
  label,
  query,
}: {
  readonly label: string;
  readonly query: UseQueryResult<string | null, Error>;
}) => {
  let content = null;

  switch (query.status) {
    case "error": {
      content = (
        <Typography component="span" color="red" variant="body2">
          {query.error.message}
        </Typography>
      );
      break;
    }
    case "loading": {
      content =
        query.fetchStatus === "fetching" ? (
          <CircularProgress size={15} sx={{ ml: 1 }} />
        ) : (
          "—"
        );
      break;
    }
    case "success": {
      content = query.data || "—";
    }
  }

  return (
    <Typography variant="body2">
      {label}: {content}
    </Typography>
  );
};
